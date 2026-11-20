import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {Database} from './Database.js';
import {ChargingService, IncidentService, KiemTraTaiNguyen, NotificationService} from './m3.js';
import * as d from './domain.js';

export type CreateOrderCommand = {sourceHubId: string; destHubId: string; vehicleIds: string[]; idempotencyKey: string; confirmed: boolean; origin?: 'MANUAL' | 'FROM_RECOMMENDATION'; recommendationId?: string};
export type OrderResult = d.RebalancingOrder;
export type RunCommandResult = {success: true; runId: string; status: d.SimulationRun['status']};
const configuredScenarioLimits = (): d.ScenarioLimits => ({
  maxIntensity:Number(process.env.SCENARIO_MAX_INTENSITY ?? 500),
  minDuration:Number(process.env.SCENARIO_MIN_DURATION ?? 5),
  maxDuration:Number(process.env.SCENARIO_MAX_DURATION ?? 240),
});
export class RebalancingController {
  constructor(private readonly db: Database, private readonly minKeep = 2) {}
  static computeTransferCount(expectedDemandB: number, availableB: number, availableA: number, freeSpotsB: number, minKeepA = 2) {
    return Math.max(0, Math.min(Math.ceil(expectedDemandB - availableB), availableA - minKeepA, freeSpotsB));
  }
  listCandidateVehicles(sourceHubId: string) { return this.db.findCandidateVehicles(sourceHubId); }
  assignPendingOrder(orderId:string,technicianId:string) {
    this.db.authorize('OPERATOR');
    const order=this.db.findOrder(orderId);
    d.requireRule(order,'NOT_FOUND');
    d.requireRule(order.status==='PENDING_ASSIGNMENT','INVALID_STATE');
    d.requireRule(this.db.findIdleTechnicians().some(user=>user.id===technicianId),'TECHNICIAN_BUSY');
    order.assign(technicianId);
    new NotificationService(this.db).gui(technicianId,'REBALANCING_ASSIGNED',order.id);
    this.db.audit('ASSIGN_ORDER',{orderId,technicianId});
    return order;
  }
  proposeTransfer(sourceHubId: string, destHubId: string) {
    const source = this.db.findHub(sourceHubId);
    const dest = this.db.findHub(destHubId);
    d.requireRule(source && dest && source.id !== dest.id, 'NOT_FOUND');
    const candidates = this.listCandidateVehicles(sourceHubId);
    const availableB = this.listCandidateVehicles(destHubId).length;
    const freeSpotsB = this.db.countFreeSpots(destHubId);
    const full = this.db.state.parkingRatio(destHubId) >= .95;
    const n = full ? 0 : RebalancingController.computeTransferCount(dest.expectedDemand, availableB, candidates.length, freeSpotsB, this.minKeep);
    const alternatives = this.db.state.hubs.filter(hub => hub.id !== source.id && hub.id !== dest.id && this.db.state.parkingRatio(hub.id) < .95 && this.db.countFreeSpots(hub.id) > 0 && RebalancingController.computeTransferCount(hub.expectedDemand, this.listCandidateVehicles(hub.id).length, candidates.length, this.db.countFreeSpots(hub.id), this.minKeep) > 0);
    const secondDestHubId = !full && freeSpotsB < Math.min(Math.ceil(dest.expectedDemand - availableB), candidates.length - this.minKeep)
      ? alternatives.sort((a,b) => (source.distances?.[a.id] ?? Infinity) - (source.distances?.[b.id] ?? Infinity) || a.id.localeCompare(b.id))[0]?.id
      : undefined;
    const describeHub = (hub: d.Hub) => ({
      hub, available: this.listCandidateVehicles(hub.id).length, ratio: this.db.state.parkingRatio(hub.id),
      chargingQueue: this.db.state.requests.filter(request => request.hubId === hub.id && request.status === 'CHO_XEP_LICH').length,
      ...this.db.state.dataStatus(hub.id, this.db.now()),
    });
    return {n, candidates, secondDestHubId, source: describeHub(source), destination: describeHub(dest), distance: source.distances?.[dest.id], rejectedReason: n ? undefined : full ? 'DEST_HUB_FULL' : candidates.length <= this.minKeep ? 'SOURCE_BELOW_MIN' : 'NOTHING_TO_TRANSFER'};
  }
  createOrder(cmd: CreateOrderCommand): OrderResult {
    this.db.authorize('OPERATOR');
    d.requireRule(cmd.confirmed && cmd.idempotencyKey.trim(), 'NOT_CONFIRMED');
    const existing = this.db.findOrderByKey(cmd.idempotencyKey);
    if (existing) {
      d.requireRule(existing.createdBy === this.db.actor && existing.sourceHubId === cmd.sourceHubId && existing.destHubId === cmd.destHubId, 'VEHICLE_TAKEN');
      return existing;
    }
    const proposal = this.proposeTransfer(cmd.sourceHubId, cmd.destHubId);
    d.requireRule(proposal.n, proposal.rejectedReason ?? 'NOTHING_TO_TRANSFER');
    const selected = new Set(cmd.vehicleIds);
    const vehicles = proposal.candidates.filter(vehicle => selected.has(vehicle.id)).slice(0, proposal.n);
    if (!vehicles.length && this.db.state.orders.some(order => ['ASSIGNED','IN_PROGRESS','PENDING_ASSIGNMENT'].includes(order.status) && order.vehicleIds.some(id => selected.has(id)))) throw new d.DomainError('VEHICLE_ALREADY_IN_ORDER');
    d.requireRule(vehicles.length, 'VEHICLE_TAKEN');
    const spots = this.db.state.spots.filter(spot => spot.hubId === cmd.destHubId && spot.status === 'EMPTY').sort((a,b) => a.id.localeCompare(b.id)).slice(0, vehicles.length);
    d.requireRule(this.db.lockResources([...vehicles,...spots].map(item => item.id)), 'VEHICLE_TAKEN');
    const order = new d.RebalancingOrder(randomUUID(), cmd.sourceHubId, cmd.destHubId, vehicles.map(vehicle => vehicle.id), spots.map(spot => spot.id), cmd.origin ?? 'MANUAL', this.db.actor, cmd.idempotencyKey, this.db.now());
    for (const vehicle of vehicles) vehicle.status = 'REBALANCING';
    for (const spot of spots) Object.assign(spot, {status: 'RESERVED', holder: order.id});
    const technician = this.db.findIdleTechnicians()[0];
    if (technician) {
      order.assign(technician.id);
      new NotificationService(this.db).gui(technician.id, 'REBALANCING_ASSIGNED', order.id);
    }
    this.db.saveOrder(order);
    this.db.audit('CREATE_ORDER', {orderId: order.id, recommendationId: cmd.recommendationId});
    return order;
  }
  onVehicleBroken(orderId: string, vehicleId: string, reportedBy: string, description: string, location: string): OrderResult {
    const order = this.db.findOrder(orderId);
    d.requireRule(order && ['ASSIGNED','IN_PROGRESS'].includes(order.status), 'INVALID_STATE');
    const operator = this.db.state.users.some(user => user.id === this.db.actor && user.role === 'OPERATOR');
    d.requireRule(reportedBy === this.db.actor && (operator || order.technicianId === reportedBy), 'FORBIDDEN');
    const vehicle = this.db.state.vehicles.find(item => item.id === vehicleId);
    const spot = this.db.state.spots.find(item => item.id === order.spotIds[order.vehicleIds.indexOf(vehicleId)] && item.holder === orderId);
    d.requireRule(vehicle && spot, 'NOT_FOUND');
    d.requireRule(this.db.lockResources([vehicle.id,spot.id]),'VEHICLE_TAKEN');
    const incidentService = new IncidentService(this.db);
    incidentService.baoSuCo(reportedBy, 'XE', vehicleId, 'REBALANCING_FAILURE', description, location, null, null);
    order.removeVehicle(vehicleId);
    Object.assign(spot, {status: 'EMPTY', holder: undefined});
    vehicle.status = 'BROKEN';
    if (!order.quantity) order.cancel('NO_VEHICLES');
    this.db.audit('REBALANCING_VEHICLE_BROKEN', {orderId, vehicleId});
    return order;
  }
  completeOrder(orderId: string, technicianId: string): OrderResult {
    this.db.authorize('TECHNICIAN');
    const order = this.db.findOrder(orderId);
    d.requireRule(order, 'NOT_FOUND');
    d.requireRule(technicianId === this.db.actor && order.technicianId === technicianId, 'FORBIDDEN');
    d.requireRule(['ASSIGNED','IN_PROGRESS'].includes(order.status), 'INVALID_STATE');
    d.requireRule(this.db.lockResources([...order.vehicleIds,...order.spotIds]),'VEHICLE_TAKEN');
    const moves = order.vehicleIds.map((id, index) => {
      const vehicle = this.db.state.vehicles.find(item => item.id === id);
      const dest = this.db.state.spots.find(spot => spot.id === order.spotIds[index] && spot.holder === orderId);
      d.requireRule(vehicle?.status === 'REBALANCING' && dest?.status === 'RESERVED', 'RESOURCE_TAKEN');
      return {vehicle, dest, source: this.db.state.spots.find(spot => spot.id === vehicle.spotId && spot.vehicleId === id)};
    });
    for (const {vehicle, dest, source} of moves) {
      if (source) Object.assign(source, {status: 'EMPTY', vehicleId: undefined});
      Object.assign(dest, {status: 'OCCUPIED', holder: undefined, vehicleId: vehicle.id});
      Object.assign(vehicle, {status: 'AVAILABLE', hubId: order.destHubId, spotId: dest.id});
    }
    order.complete(this.db.now());
    this.db.updateOrder(order);
    this.db.audit('COMPLETE_ORDER', {orderId});
    return order;
  }
}

export type ReportFilter = {hubIds?: string[]; window: {start: number; end: number}};
export class ReportController {
  constructor(private readonly db: Database) {}
  getOperationsReport(filter: ReportFilter) {
    this.db.authorize('OPERATOR');
    const {hubIds = [], window} = filter;
    d.requireRule(Number.isFinite(window.start) && Number.isFinite(window.end) && window.start < window.end && this.db.hubsExist(hubIds), 'INVALID_DATA');
    const persistedMetrics = this.db.aggregateMetrics(hubIds, window);
    const snapshotAt = this.db.now();
    const rows = this.db.state.hubs.filter(hub => !hubIds.length || hubIds.includes(hub.id)).flatMap(hub => {
      const metrics = persistedMetrics.filter(metric => metric.hubId === hub.id);
      if (!metrics.length) return [];
      const average = (value: (row: d.HubMetricRecord) => number) => metrics.reduce((total,row) => total + value(row),0) / metrics.length;
      const peak = Math.max(...metrics.map(metric => metric.parkingRatio ?? 0));
      const telemetry = this.db.state.dataStatus(hub.id,snapshotAt);
      return {hubId: hub.id, parkingRatioAverage: average(metric => metric.parkingRatio ?? 0), parkingRatioPeak: peak,
        flaggedNearFull: peak >= .85, ...telemetry, dataStale: telemetry.dataStatus !== 'FRESH', staleSince: telemetry.lastUpdated,
        averageAvailableVehicles: average(metric => metric.availableVehicles),
        averageChargingQueue: average(metric => metric.chargingQueue),
        rebalancingOrders: this.db.state.orders.filter(order => (order.sourceHubId === hub.id || order.destHubId === hub.id) && order.createdAt >= window.start && order.createdAt < window.end).length,
        overloadAlerts: this.db.state.alerts.filter(alert => alert.hubId === hub.id && alert.updatedAt >= window.start && alert.updatedAt < window.end).length,
        fulfilled: this.db.state.trips.filter(trip => trip.hubId === hub.id && !trip.active && trip.endedAt !== undefined && trip.endedAt >= window.start && trip.endedAt < window.end).length + metrics.reduce((sum,row) => sum + row.fulfilled,0),
        rejected: metrics.reduce((sum,row) => sum + row.requested - row.fulfilled,0)};
    });
    return {snapshotAt, rows, relatedRunIds: this.db.findRelatedRunIds(window)};
  }
  refreshReport(filter: ReportFilter) { return this.getOperationsReport(filter); }
}
export class ScenarioController {
  constructor(private readonly db: Database, private readonly limits = configuredScenarioLimits()) {}
  listTemplates() {
    const codes = ['SC-01', 'SC-02', 'SC-03', 'SC-04'];
    const eventTypes = ['DEMAND_SURGE', 'CHARGER_FAILURE', 'LOW_BATTERY', 'PARKING_SURGE'];
    return codes.map((code, i) => ({code, eventType: eventTypes[i], intensity: [150,1,20,30][i], durationMin: [30,30,60,30][i], seed: 1}));
  }
  createScenario(params: d.ScenarioParams) {
    this.db.authorize('OPERATOR');
    return this.validateAndSave(new d.Scenario(randomUUID(), params, this.db.actor, params.seed ?? 1));
  }
  updateScenario(scenarioId: string, params: d.ScenarioParams, expectedVersion: number) {
    this.db.authorize('OPERATOR');
    const scenario = this.db.findScenario(scenarioId);
    d.requireRule(scenario, 'NOT_FOUND');
    d.requireRule(!scenario.isStale(expectedVersion) && scenario.status === 'READY', 'VERSION_CHANGED');
    return this.validateAndSave(scenario.createNewVersion(params));
  }
  cloneScenario(scenarioId: string, newCode: string) {
    this.db.authorize('OPERATOR');
    const scenario = this.db.findScenario(scenarioId);
    d.requireRule(scenario, 'NOT_FOUND');
    return this.validateAndSave(scenario.cloneAs(newCode, randomUUID(), this.db.actor));
  }
  private validateAndSave(scenario: d.Scenario) {
    const errors = scenario.validate(this.limits);
    if (!this.db.hubsExist(scenario.params.hubIds)) errors.hubIds = 'NOT_FOUND';
    if (this.db.state.scenarios.some(item => item.params.code === scenario.params.code && item.id !== scenario.id)) errors.code = 'DUPLICATE';
    if (Object.keys(errors).length) return {success: false, fieldErrors: errors};
    this.db.saveScenario(scenario);
    return {success: true, scenario};
  }
}

type SimEvent = {hubId:string; type:d.ScenarioParams['eventType']; count:number; minute:number};
type StepMetrics = {rows:d.HubMetricRecord[]; affected:Set<string>};
type SimulationMetrics = StepMetrics;

export class SimulationController {
  constructor(private readonly db: Database, private readonly limits = configuredScenarioLimits()) {}
  runScenario(scenarioId: string, expectedVersion: number, sharedSnapshotId?: string | null): RunCommandResult {
    this.db.authorize('OPERATOR');
    const scenario = this.db.findScenario(scenarioId);
    d.requireRule(scenario, 'NOT_FOUND');
    d.requireRule(scenario.status === 'READY' && !scenario.isStale(expectedVersion), 'VERSION_CHANGED');
    d.requireRule(!Object.keys(scenario.validate(this.limits)).length && this.db.hubsExist(scenario.params.hubIds), 'INVALID_DATA');
    const snapshot = this.captureSnapshot(sharedSnapshotId);
    const run = new d.SimulationRun(randomUUID(), scenario.id, scenario.versionNo, snapshot.id, this.db.now());
    this.db.saveRun(run);
    scenario.status = 'RUNNING';
    return {success: true, runId: run.id, status: run.status};
  }
  private captureSnapshot(sharedSnapshotId?: string | null) {
    if (sharedSnapshotId) {
      const snapshot = this.db.findSnapshot(sharedSnapshotId);
      d.requireRule(snapshot, 'NOT_FOUND');
      return snapshot;
    }
    const snapshot = d.NetworkSnapshot.capture(this.db.readConsistentState(2), this.db.now());
    this.db.saveSnapshot(snapshot);
    return snapshot;
  }
  cancelRun(runId: string): RunCommandResult {
    this.db.authorize('OPERATOR');
    const run = this.db.findRun(runId);
    d.requireRule(run && run.status === 'RUNNING', 'INVALID_STATE');
    run.cancel(this.db.now());
    const scenario = this.db.findScenario(run.scenarioId);
    if (scenario) scenario.status = 'READY';
    return {success: true, runId, status: run.status};
  }
  getProgress(runId: string) {
    const run = this.db.findRun(runId);
    d.requireRule(run, 'NOT_FOUND');
    return run.progressPct;
  }
  static execute(scenario: d.Scenario, snapshot: d.NetworkSnapshot, runId: string, onProgress: (percentage: number, metrics: d.HubMetricRecord[]) => boolean = () => true) {
    const working = snapshot.toWorkingCopy();
    const began = performance.now();
    let now = snapshot.capturedAt;
    const simulation = new SimulationController(new Database(new d.NetworkState(), () => now, '', new Map([[runId, working]])));
    const timeline: StepMetrics[] = [];
    const events = simulation.generateEvents(scenario);
    for (let minute = 1; minute <= scenario.params.durationMin; minute++) {
      if (performance.now() - began > 10_000) return {status: 'TIMED_OUT' as const, metrics: simulation.summarizeMetrics(timeline).rows, recommendations: []};
      now = snapshot.capturedAt + minute * 60_000;
      timeline.push(simulation.simulateStep(working, events.filter(event => event.minute === minute), minute, runId));
      if (!onProgress(Math.floor(minute * 100 / scenario.params.durationMin), simulation.summarizeMetrics(timeline).rows)) {
        return {status: 'INCOMPLETE' as const, metrics: simulation.summarizeMetrics(timeline).rows, recommendations: []};
      }
    }
    const metrics = simulation.summarizeMetrics(timeline);
    const recommendations = simulation.buildRecommendations(metrics, working, runId);
    return {status: 'COMPLETED' as const, metrics: metrics.rows, recommendations};
  }
  private generateEvents(scenario: d.Scenario): SimEvent[] {
    let seed = scenario.seed >>> 0;
    const expected = scenario.params.intensity / scenario.params.durationMin;
    return Array.from({length:scenario.params.durationMin}, (_, index) => scenario.params.hubIds.map(hubId => {
      seed = (Math.imul(seed,1664525) + 1013904223) >>> 0;
      const count = Math.floor(expected) + Number(seed / 0x100000000 < expected % 1);
      return {hubId, type:scenario.params.eventType, count, minute:index+1};
    })).flat();
  }
  private simulateStep(working: d.NetworkState, events: SimEvent[], minute: number, runId: string): StepMetrics {
    const now = this.db.now();
    const affected = new Set<string>();
    const checker = new KiemTraTaiNguyen(this.db);
    const charging = new ChargingService(this.db);
    const consumption = Number(process.env.SIM_BATTERY_PCT_PER_KM ?? 1) * Number(process.env.SIM_KM_PER_MINUTE ?? .25);
    const rows = working.hubs.map(hub => {
      const row = new d.HubMetricRecord(hub.id,now);
      const vehicles = working.vehicles.filter(vehicle => vehicle.hubId === hub.id);
      const event = events.find(item => item.hubId === hub.id);
      for (const vehicle of vehicles) if (vehicle.status === 'IN_USE') vehicle.battery = Math.max(0,vehicle.battery - consumption);
      if (event?.type === 'DEMAND_SURGE') {
        row.requested = event.count;
        const available = vehicles.filter(vehicle => checker.kiemTraTaiNguyenKhaDung('THUE_XE',vehicle.id,hub.id,null,null,'MO_PHONG',runId).success)
          .sort((a,b) => a.id.localeCompare(b.id)).slice(0,event.count);
        row.fulfilled = available.length;
        for (const vehicle of available) {
          vehicle.status = 'IN_USE';
          const spot = working.spots.find(item => item.id === vehicle.spotId && item.vehicleId === vehicle.id);
          if (spot) Object.assign(spot,{status:'EMPTY',vehicleId:undefined});
        }
      } else if (event?.type === 'PARKING_SURGE') {
        for (const spot of working.spots.filter(item => item.hubId === hub.id && item.status === 'EMPTY').slice(0,event.count)) {
          if (working.parkingRatio(hub.id) >= .95) break;
          spot.status = 'RESERVED';
        }
      } else if (event?.type === 'LOW_BATTERY') {
        for (const vehicle of vehicles.slice(0,event.count)) vehicle.battery = Math.max(0,vehicle.battery - 20);
      } else if (event?.type === 'CHARGER_FAILURE') {
        const points = working.points.filter(point => point.hubId === hub.id && point.status !== 'BROKEN').slice(0,event.count);
        for (const point of points) {
          point.status = 'BROKEN';
          const interrupted = working.sessions.filter(session => session.pointId === point.id && session.end > now);
          for (const request of working.requests) if (interrupted.some(session => session.requestId === request.id)) request.status = 'CHO_XEP_LICH';
          working.sessions = working.sessions.filter(session => !interrupted.includes(session));
        }
        if (points.length) affected.add(hub.id);
      }
      for (const session of working.sessions.filter(item => item.start < now && item.end > now - 60_000)) {
        const point = working.points.find(item => item.id === session.pointId && item.hubId === hub.id && item.status !== 'BROKEN');
        const request = working.requests.find(item => item.id === session.requestId);
        const vehicle = vehicles.find(item => item.id === request?.vehicleId);
        if (!point || !request || !vehicle) continue;
        const minutes = (Math.min(now,session.end) - Math.max(now - 60_000,session.start)) / 60_000;
        vehicle.battery = Math.min(100,vehicle.battery + point.rate * minutes);
        request.status = session.end <= now ? 'XONG' : 'DANG_SAC';
        vehicle.status = session.end <= now ? 'AVAILABLE' : 'CHARGING';
        if (session.end <= now) affected.add(hub.id);
      }
      const hasQueue = working.requests.some(request => request.hubId === hub.id && request.status === 'CHO_XEP_LICH');
      if ((minute === 1 || affected.has(hub.id)) && hasQueue) {
        if (charging.lapLich(hub.id,'MO_PHONG',runId).allocations.length) affected.add(hub.id);
      }
      row.parkingRatio = working.parkingRatio(hub.id);
      row.availableVehicles = vehicles.filter(vehicle => vehicle.status === 'AVAILABLE' && !vehicle.ownerId).length;
      row.chargingQueue = working.requests.filter(request => request.hubId === hub.id && request.status === 'CHO_XEP_LICH').length;
      row.lowBattery = vehicles.filter(vehicle => vehicle.battery < 20).length;
      if (row.parkingRatio >= .95) {row.overloadMinutes = 1;row.firstOverloadMinute = minute;}
      return row;
    });
    return {rows, affected};
  }
  private summarizeMetrics(timeline: StepMetrics[]): SimulationMetrics {
    const summary = new Map<string,d.HubMetricRecord>();
    const affected = new Set<string>();
    for (const step of timeline) {
      for (const hubId of step.affected) affected.add(hubId);
      for (const row of step.rows) {
        const total = summary.get(row.hubId) ?? new d.HubMetricRecord(row.hubId,row.timestamp);
        total.requested += row.requested;
        total.fulfilled += row.fulfilled;
        total.overloadMinutes += row.overloadMinutes;
        total.firstOverloadMinute ??= row.firstOverloadMinute;
        total.lowBattery = row.lowBattery;
        total.parkingRatio = row.parkingRatio;
        total.availableVehicles = row.availableVehicles;
        total.chargingQueue = row.chargingQueue;
        summary.set(row.hubId,total);
      }
    }
    return {rows:[...summary.values()],affected};
  }
  private buildRecommendations(metrics: SimulationMetrics, working: d.NetworkState, runId: string) {
    const recommendations: d.CoordinationRecommendation[] = [];
    const recommend = (type: d.CoordinationRecommendation['type'], hub: string, other?: string, quantity?: number, vehicles?: string[]) => {
      const id = runId + ':' + (recommendations.length + 1);
      recommendations.push(new d.CoordinationRecommendation(id, runId, type, hub, other, quantity, vehicles));
    };
    const rebalancing = new RebalancingController(new Database(working,this.db.now));
    for (const row of metrics.rows) {
      if (row.overloadMinutes) {
        const alternative = working.hubs.find(hub => hub.id !== row.hubId && working.parkingRatio(hub.id) < .95 && working.spots.some(spot => spot.hubId === hub.id && spot.status === 'EMPTY'));
        if (alternative) recommend('REDIRECT_STUDENTS', row.hubId, alternative.id);
      }
      if (row.requested > row.fulfilled && !row.overloadMinutes) {
        const source = working.hubs.filter(hub => hub.id !== row.hubId).map(hub => rebalancing.proposeTransfer(hub.id, row.hubId)).find(item => item.n > 0);
        if (source) recommend('REBALANCE', source.source.hub.id, row.hubId, source.n, source.candidates.slice(0, source.n).map(vehicle => vehicle.id));
      }
      if (metrics.affected.has(row.hubId) && working.points.some(point => point.hubId === row.hubId && point.status !== 'BROKEN')) recommend('CHARGING_SCHEDULE', row.hubId);
    }
    return recommendations;
  }
}

export class SimulationResultController {
  constructor(private readonly db: Database) {}
  getRun(runId: string) {
    this.db.authorize('OPERATOR');
    const run = this.db.findRun(runId);
    d.requireRule(run, 'NOT_FOUND');
    const recommendations = this.db.findRecommendations(runId);
    return {run, applicable:run.isApplicable(), recommendations:run.isApplicable()
      ? this.markRecommendationValidity(recommendations,this.db.readCurrentState())
      : recommendations.map(item => ({...item,stillValid:false}))};
  }
  private markRecommendationValidity(recommendations: d.CoordinationRecommendation[], live: d.NetworkState) {
    return recommendations.map(item => ({...item,stillValid:item.status === 'NOT_APPLIED' && item.checkStillValid(live)}));
  }
  compareRuns(runIds: string[]) {
    d.requireRule(new Set(runIds).size >= 2, 'INVALID_DATA');
    const runs = runIds.map(runId => this.getRun(runId));
    d.requireRule(new Set(runs.map(item => item.run.snapshotId)).size === 1, 'INVALID_DATA');
    return runs;
  }
  listRuns(scenarioId?: string | null) { this.db.authorize('OPERATOR'); return this.db.findRunsByScenario(scenarioId ?? undefined); }
}
export class RecommendationController {
  constructor(private readonly db: Database) {}
  previewImpact(runId: string, recommendationIds: string[]) {
    const recommendations = this.select(runId, recommendationIds);
    d.requireRule(recommendations.every(item => item.status === 'NOT_APPLIED'), 'ALREADY_APPLIED');
    let vehiclesToRebalance = 0;
    let schedulesChanged = 0;
    const recipients = new Set<string>();
    for (const item of recommendations) {
      if (item.type === 'REBALANCE') vehiclesToRebalance += item.quantity ?? 0;
      else if (item.type === 'CHARGING_SCHEDULE') schedulesChanged++;
      else this.recipients(item.hubId).forEach(id => recipients.add(id));
    }
    return {vehiclesToRebalance, spotsToHold: vehiclesToRebalance, schedulesChanged, notificationsToSend: recipients.size};
  }
  applyRecommendations(runId: string, recommendationIds: string[], confirmed: boolean, performedBy: string) {
    d.requireRule(confirmed, 'NOT_CONFIRMED');
    d.requireRule(performedBy === this.db.actor, 'FORBIDDEN');
    const selected = this.select(runId, recommendationIds);
    if (selected.some(item => item.status !== 'NOT_APPLIED')) return {rejectedWholePackage: true, results: []};
    const results = [];
    for (const item of selected) {
      if (!item.checkStillValid(this.db.readCurrentState())) {
        if (item.type === 'CHARGING_SCHEDULE') {
          item.markFailed('NO_AVAILABLE_POINT');
          new NotificationService(this.db).gui(performedBy,'CHARGING_SCHEDULE_FAILED',item.hubId);
        }
        else item.markSkipped('LIVE_STATE_CHANGED');
        results.push({id: item.id, status: item.status, reason: item.reason});
        continue;
      }
      try {
        if (item.type === 'REBALANCE') {
          const order = new RebalancingController(this.db).createOrder({sourceHubId: item.hubId, destHubId: item.otherHubId!, vehicleIds: item.vehicleIds ?? [], idempotencyKey: 'recommendation:' + item.id, confirmed: true, origin: 'FROM_RECOMMENDATION', recommendationId: item.id});
          results.push({id: item.id, quantity: order.quantity, orderId: order.id, status: 'APPLIED'});
        } else {
          if (item.type === 'CHARGING_SCHEDULE') new ChargingService(this.db).lapLich(item.hubId, 'THAT', null);
          else for (const recipient of this.recipients(item.hubId)) new NotificationService(this.db).gui(recipient, 'REDIRECT_STUDENTS', item.otherHubId!);
          results.push({id: item.id, status: 'APPLIED'});
        }
        item.markApplied();
      } catch (error) {
        if (!(error instanceof d.DomainError)) throw error;
        item.markFailed(error.code);
        results.push({id: item.id, status: item.status, reason: item.reason});
      }
      this.db.updateRecommendation(item);
    }
    this.db.audit('APPLY_RECOMMENDATIONS', {runId, results});
    return {rejectedWholePackage: false, results};
  }
  private select(runId: string, ids: string[]) {
    this.db.authorize('OPERATOR');
    d.requireRule(this.db.findRun(runId)?.isApplicable(), 'RUN_NOT_APPLICABLE');
    d.requireRule(ids.length && new Set(ids).size === ids.length, 'INVALID_DATA');
    const selected = this.db.findRecommendations(runId).filter(item => ids.includes(item.id));
    d.requireRule(selected.length === ids.length, 'NOT_FOUND');
    return selected;
  }
  private recipients(hubId: string) { return [...new Set(this.db.state.reservations.filter(item => item.hubId === hubId && item.active).map(item => item.userId))]; }
}
