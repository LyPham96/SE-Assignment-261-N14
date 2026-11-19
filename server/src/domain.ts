import {randomUUID} from 'node:crypto';

export type NguCanh = 'THAT' | 'MO_PHONG';
export type LoaiTaiNguyen = 'XE' | 'CONG_SAC';
export class DomainError extends Error {
  constructor(readonly code: string) { super(code); }
}
export function requireRule(value: unknown, code: string): asserts value {
  if (!value) throw new DomainError(code);
}
export class ChargingPoint {
  constructor(public id: string, public hubId: string, public status: 'RANH' | 'DANG_SAC' | 'BROKEN', public rate: number) {}
  capNhatTrangThai(status: ChargingPoint['status']) { this.status = status; }
}
export class ChargingRequest {
  status: 'CHO_XEP_LICH' | 'DA_XEP_LICH' | 'DANG_SAC' | 'XONG' | 'HUY' = 'CHO_XEP_LICH';
  reason?: string;
  constructor(public id: string, public userId: string, public vehicleId: string, public hubId: string, public battery: number, public createdAt: number, public khungGio?: {start: number; end: number}, public targetBattery = 100) {}
  capNhatTrangThai(status: ChargingRequest['status']) { this.status = status; }
}
export class ChargingSession {
  constructor(public id: string, public requestId: string, public pointId: string, public start: number, public end: number) {}
}
export class Incident {
  status: 'MOI' | 'TU_CHOI' | 'DANG_XU_LY' | 'DA_DONG' = 'MOI';
  technician?: string;
  reason?: string;
  repair?: string;
  constructor(public id: string, public reportedBy: string, public resourceType: LoaiTaiNguyen, public resourceId: string, public kind: string, public description: string, public location: string, public tripId?: string, public attachment?: string) {}
}
export class OverloadAlert {
  constructor(public id: string, public hubId: string, public level: 'GAN_DAY' | 'NGHIEM_TRONG', public ratio: number, public updatedAt: number, public closedAt?: number, public closeReason?: string, public resource: 'PARKING' | 'CHARGING' = 'PARKING') {}
}
export class Notification {
  constructor(public id: string, public recipient: string, public type: string, public body: string, public createdAt: number, public reference?: string) {}
}
export type Vehicle = {id: string; hubId: string; status: 'AVAILABLE' | 'RESERVED' | 'IN_USE' | 'CHARGING' | 'REBALANCING' | 'BROKEN'; battery: number; ownerId?: string; approved?: boolean; spotId?: string};
export type ParkingSpot = {id: string; hubId: string; status: 'EMPTY' | 'RESERVED' | 'OCCUPIED'; holder?: string; vehicleId?: string};
export type Hub = {id: string; name: string; expectedDemand: number; compatiblePrivateVehicles: boolean; distances?: Record<string, number>};
export type User = {id: string; role: 'STUDENT' | 'OPERATOR' | 'TECHNICIAN'; sessionHash?: string; sessionExpiresAt?: number};
export type Reservation = {id: string; hubId: string; userId: string; active: boolean};
export type Trip = {id: string; userId: string; vehicleId: string; hubId: string; active: boolean; endedAt?: number};
export type BanTinTrangThai = {maTaiNguyen: string; loaiTaiNguyen: LoaiTaiNguyen; trangThai: string; mucPin?: number; thoiDiem: number; nguon: 'IOT_THAT' | 'MO_PHONG'; maHub?: string};
export class NetworkState {
  hubs: Hub[] = [];
  vehicles: Vehicle[] = [];
  spots: ParkingSpot[] = [];
  points: ChargingPoint[] = [];
  requests: ChargingRequest[] = [];
  sessions: ChargingSession[] = [];
  incidents: Incident[] = [];
  alerts: OverloadAlert[] = [];
  users: User[] = [];
  reservations: Reservation[] = [];
  trips: Trip[] = [];
  telemetry: Record<string, BanTinTrangThai> = {};
  notifications: Notification[] = [];
  audit: {actor: string; action: string; timestamp: number; data: unknown}[] = [];
  orders: RebalancingOrder[] = [];
  scenarios: Scenario[] = [];
  snapshots: NetworkSnapshot[] = [];
  runs: SimulationRun[] = [];
  recommendations: CoordinationRecommendation[] = [];
  metrics: HubMetricRecord[] = [];
  readCurrentState() { return this; }
  readConsistentState(_waitSeconds: number) { return this; }
  parkingRatio(hubId: string) {
    const spots = this.spots.filter(spot => spot.hubId === hubId);
    return spots.length ? spots.filter(spot => spot.status !== 'EMPTY').length / spots.length : 0;
  }
  dataStatus(hubId: string, now: number) {
    const entries = Object.values(this.telemetry).filter(event => event.maHub === hubId);
    const lastUpdated = entries.length ? Math.max(...entries.map(event => event.thoiDiem)) : null;
    const age = lastUpdated === null ? Infinity : now - lastUpdated;
    return {lastUpdated, dataStatus: age > 300_000 ? 'UNKNOWN' : age >= 180_000 ? 'STALE' : 'FRESH'};
  }
}
export class RebalancingOrder {
  status: 'PENDING_ASSIGNMENT' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' = 'PENDING_ASSIGNMENT';
  technicianId?: string;
  completedAt?: number;
  cancelReason?: string;
  constructor(public id: string, public sourceHubId: string, public destHubId: string, public vehicleIds: string[], public spotIds: string[], public origin: string, public createdBy: string, public idempotencyKey: string, public createdAt: number) {}
  get quantity() { return this.vehicleIds.length; }
  assign(technicianId: string) { requireRule(this.status === 'PENDING_ASSIGNMENT', 'INVALID_STATE'); this.technicianId = technicianId; this.status = 'ASSIGNED'; }
  removeVehicle(vehicleId: string) {
    const index = this.vehicleIds.indexOf(vehicleId);
    requireRule(index >= 0, 'NOT_FOUND');
    this.vehicleIds.splice(index, 1);
    return this.spotIds.splice(index, 1)[0];
  }
  complete(now: number) { requireRule(this.status === 'ASSIGNED' || this.status === 'IN_PROGRESS', 'INVALID_STATE'); this.status = 'COMPLETED'; this.completedAt = now; }
  cancel(reason: string) { requireRule(this.status !== 'COMPLETED', 'INVALID_STATE'); this.status = 'CANCELLED'; this.cancelReason = reason; }
}
export type ScenarioParams = {code: string; hubIds: string[]; eventType: 'DEMAND_SURGE' | 'CHARGER_FAILURE' | 'LOW_BATTERY' | 'PARKING_SURGE'; intensity: number; durationMin: number; seed?: number};
export type ScenarioLimits = {maxIntensity: number; minDuration: number; maxDuration: number};
export class Scenario {
  status: 'READY' | 'RUNNING' = 'READY';
  constructor(public id: string, public params: ScenarioParams, public createdBy: string, public seed: number, public versionNo = 1, public parentId?: string) {}
  validate(limits: ScenarioLimits) {
    const errors: Record<string, string> = {};
    if (!this.params.code.trim()) errors.code = 'REQUIRED';
    if (!this.params.hubIds.length) errors.hubIds = 'REQUIRED';
    if (!['DEMAND_SURGE','CHARGER_FAILURE','LOW_BATTERY','PARKING_SURGE'].includes(this.params.eventType)) errors.eventType = 'INVALID';
    if (!Number.isInteger(this.params.intensity) || this.params.intensity < 1 || this.params.intensity > limits.maxIntensity) errors.intensity = 'OUT_OF_RANGE';
    if (!Number.isInteger(this.params.durationMin) || this.params.durationMin < limits.minDuration || this.params.durationMin > limits.maxDuration) errors.durationMin = 'OUT_OF_RANGE';
    return errors;
  }
  createNewVersion(params: ScenarioParams) { return new Scenario(this.id, params, this.createdBy, params.seed ?? this.seed, this.versionNo + 1, this.parentId); }
  cloneAs(code: string, id: string, actor: string) { return new Scenario(id, {...structuredClone(this.params), code}, actor, this.seed, 1, this.id); }
  isStale(expectedVersion: number) { return this.versionNo !== expectedVersion; }
}
export class NetworkSnapshot {
  constructor(public id: string, public capturedAt: number, public state: NetworkState) {}
  static capture(live: NetworkState, now: number, id = randomUUID()) {
    const state = new NetworkState();
    for (const key of ['hubs','vehicles','spots','points','requests','sessions','incidents','orders','reservations','trips','telemetry'] as const) Object.assign(state, {[key]: structuredClone(live[key])});
    return new NetworkSnapshot(id, now, state);
  }
  toWorkingCopy() { return Object.assign(new NetworkState(), structuredClone(this.state)); }
}
export class HubMetricRecord {
  requested = 0;
  fulfilled = 0;
  overloadMinutes = 0;
  firstOverloadMinute?: number;
  lowBattery = 0;
  availableVehicles = 0;
  chargingQueue = 0;
  constructor(public hubId: string, public timestamp: number, public parkingRatio?: number) {}
}
export class SimulationRun {
  status: 'RUNNING' | 'COMPLETED' | 'INCOMPLETE' | 'TIMED_OUT' = 'RUNNING';
  progressPct = 0;
  stopReason?: string;
  finishedAt?: number;
  workerStartedAt?: number;
  metrics: HubMetricRecord[] = [];
  constructor(public id: string, public scenarioId: string, public scenarioVersion: number, public snapshotId: string, public startedAt: number) {}
  complete(metrics: HubMetricRecord[], now = Date.now()) { requireRule(this.status === 'RUNNING','INVALID_STATE'); this.metrics = metrics; this.status = 'COMPLETED'; this.progressPct = 100; this.finishedAt = now; }
  cancel(now = Date.now(), reason = 'CANCELLED') { requireRule(this.status === 'RUNNING','INVALID_STATE'); this.status = 'INCOMPLETE'; this.stopReason = reason; this.finishedAt = now; }
  timeout(now = Date.now()) { requireRule(this.status === 'RUNNING','INVALID_STATE'); this.status = 'TIMED_OUT'; this.stopReason = 'TIMEOUT'; this.finishedAt = now; }
  isApplicable() { return this.status === 'COMPLETED'; }
}
export class CoordinationRecommendation {
  status: 'NOT_APPLIED' | 'APPLIED' | 'SKIPPED' | 'FAILED' = 'NOT_APPLIED';
  reason?: string;
  constructor(public id: string, public runId: string, public type: 'REBALANCE' | 'CHARGING_SCHEDULE' | 'REDIRECT_STUDENTS', public hubId: string, public otherHubId?: string, public quantity?: number, public vehicleIds?: string[]) {}
  markApplied() { requireRule(this.status === 'NOT_APPLIED','INVALID_STATE'); this.status = 'APPLIED'; }
  markSkipped(reason: string) { requireRule(this.status === 'NOT_APPLIED','INVALID_STATE'); this.status = 'SKIPPED'; this.reason = reason; }
  markFailed(reason: string) { requireRule(this.status === 'NOT_APPLIED','INVALID_STATE'); this.status = 'FAILED'; this.reason = reason; }
  checkStillValid(live: NetworkState) {
    if (this.type === 'CHARGING_SCHEDULE') return live.points.some(point => point.hubId === this.hubId && point.status !== 'BROKEN');
    if (this.type === 'REDIRECT_STUDENTS') return !!this.otherHubId && live.parkingRatio(this.hubId) >= .95 && live.parkingRatio(this.otherHubId) < .95 && live.spots.some(spot => spot.hubId === this.otherHubId && spot.status === 'EMPTY');
    const vehicles = live.vehicles.filter(vehicle => vehicle.hubId === this.hubId && !vehicle.ownerId && vehicle.status === 'AVAILABLE' && !live.requests.some(request => request.vehicleId === vehicle.id && (request.status === 'DA_XEP_LICH' || request.status === 'DANG_SAC')));
    return !!this.otherHubId && live.parkingRatio(this.otherHubId) < .95
      && live.spots.some(spot => spot.hubId === this.otherHubId && spot.status === 'EMPTY')
      && vehicles.length > 2 && !!this.vehicleIds?.length && this.vehicleIds.every(id => vehicles.some(vehicle => vehicle.id === id));
  }
}
