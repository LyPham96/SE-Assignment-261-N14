import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {definitions, sqlIdentifier} from '../schema.mjs';
import * as d from './domain.js';

const models = {
  points: d.ChargingPoint, requests: d.ChargingRequest, sessions: d.ChargingSession,
  incidents: d.Incident, alerts: d.OverloadAlert, notifications: d.Notification,
  orders: d.RebalancingOrder, scenarios: d.Scenario, snapshots: d.NetworkSnapshot,
  runs: d.SimulationRun, recommendations: d.CoordinationRecommendation, metrics: d.HubMetricRecord,
};
const catalogs = ['hubs','vehicles','spots','users','reservations','trips','telemetry','audit'] as const;
const collections = [...Object.keys(models), ...catalogs] as (keyof typeof models | typeof catalogs[number])[];
const readNetwork = collections.map(collection => {
  const [table, columns] = definitions[collection];
  const fields = Object.entries(columns).flatMap(([name,type]) => [
    "'" + name + "'",
    type === 'time' ? 'extract(epoch from ' + sqlIdentifier(name) + ') * 1000' : sqlIdentifier(name),
  ]);
  return "SELECT '" + collection + "' AS collection, entity_key, position, jsonb_build_object(" + fields.join(',') + ') AS payload FROM ' + sqlIdentifier(table);
}).join(' UNION ALL ') + ' ORDER BY position, entity_key';
export type DuLieuKiemTraSac = {maXe: string; maHub: string; mucPin?: number; khungGio?: {start: number; end: number}; targetBattery?: number};
export type PhanBoSac = {requestId: string; pointId: string; start: number; end: number};
export class AuditLog {
  constructor(private readonly state: d.NetworkState, private readonly now: () => number) {}
  ghi(maTacNhan: string, hanhDong: string, doiTuong: string, giaTriTruoc?: string | null, giaTriSau?: string | null) {
    this.state.audit.push({actor:maTacNhan,action:hanhDong,timestamp:this.now(),data:{doiTuong,giaTriTruoc,giaTriSau}});
  }
}

export class Database {
  constructor(public state = new d.NetworkState(), readonly now = Date.now, readonly actor = '', readonly working = new Map<string, d.NetworkState>()) {}
  static async transaction<T>(pool: Pool, actor: string, operation: (db: Database) => T | Promise<T>) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout = '2s'");
      await client.query("SELECT pg_advisory_xact_lock(320304)");
      const {rows} = await client.query<{collection: typeof collections[number]; entity_key: string; payload: Record<string, unknown>}>(readNetwork);
      const state = new d.NetworkState();
      for (const {collection, entity_key, payload} of rows) {
        for (const key of Object.keys(payload)) if (payload[key] === null) delete payload[key];
        if (collection === 'telemetry') state.telemetry[entity_key] = payload as d.BanTinTrangThai;
        else if (collections.includes(collection)) {
          const model = models[collection as keyof typeof models];
          (state[collection] as unknown[]).push(model ? Object.assign(Object.create(model.prototype), payload) : payload);
        }
      }
      const before = new Map(rows.map(row => [row.collection + ':' + row.entity_key, JSON.stringify(row.payload)]));
      const now = Date.now();
      const result = await operation(new Database(state, () => now, actor));
      for (const collection of collections) {
        const [table, columns] = definitions[collection];
        const fields = Object.entries(columns);
        const entries = Object.entries(state[collection]);
        for (const [index, [key, row]] of entries.entries()) {
          const entityKey = collection === 'telemetry' ? key : collection === 'audit' ? key : collection === 'scenarios' ? row.id + ':' + row.versionNo : collection === 'metrics' ? row.hubId + ':' + row.timestamp : row.id;
          const serialized = JSON.stringify(row);
          const mapKey = collection + ':' + entityKey;
          if (before.get(mapKey) !== serialized) {
            const names = fields.map(([name]) => sqlIdentifier(name));
            const values = fields.map(([name,type]) => {
              const value = row[name];
              if (value === undefined || value === null) return null;
              if (type === 'time') return new Date(value);
              if (type === 'jsonb') return JSON.stringify(value);
              return value;
            });
            const placeholders = fields.map((_,i) => '$' + (i + 3));
            const assignments = names.map(name => name + '=excluded.' + name);
            await client.query(
              'INSERT INTO ' + sqlIdentifier(table) + '(entity_key,position,' + names.join(',') + ') VALUES ($1,$2,' + placeholders.join(',') + ') ON CONFLICT(entity_key) DO UPDATE SET position=excluded.position,' + assignments.join(','),
              [entityKey, index, ...values],
            );
          }
          before.delete(mapKey);
        }
      }
      for (const composite of before.keys()) {
        const index = composite.indexOf(':');
        const collection = composite.slice(0,index) as typeof collections[number];
        await client.query('DELETE FROM ' + sqlIdentifier(definitions[collection][0]) + ' WHERE entity_key=$1', [composite.slice(index + 1)]);
      }
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      if ((error as {code?: string}).code === '55P03') throw new d.DomainError('DATA_NOT_STABLE');
      throw error;
    } finally {
      client.release();
    }
  }
  docThongTinXeVaHub(maXe: string, maHub: string) {
    const xe = this.state.vehicles.find(vehicle => vehicle.id === maXe);
    const hub = this.findHub(maHub);
    d.requireRule(xe && hub, 'NOT_FOUND');
    return {xe, hub, mucPin: xe.battery, maChoDo: xe.spotId, congSac: this.state.points.filter(point => point.hubId === maHub)};
  }
  docDieuKienDangKy(maXe: string, maHub: string) {
    const {xe, hub} = this.docThongTinXeVaHub(maXe, maHub);
    return {xe, hub, trungYeuCau: this.state.requests.some(request => request.vehicleId === maXe && ['CHO_XEP_LICH','DA_XEP_LICH','DANG_SAC'].includes(request.status))};
  }
  luuYeuCauSac(yeuCau: d.ChargingRequest) { this.state.requests.push(yeuCau); return yeuCau.id; }
  docDuLieuLapLich(maHub: string, nguCanh: d.NguCanh, maLanChay?: string | null) {
    const state = nguCanh === 'THAT' ? this.state : this.working.get(maLanChay ?? '');
    d.requireRule(state && state.hubs.some(hub => hub.id === maHub), 'NOT_FOUND');
    return {state, requests: state.requests.filter(request => request.hubId === maHub && request.status === 'CHO_XEP_LICH'), points: state.points.filter(point => point.hubId === maHub && point.status !== 'BROKEN')};
  }
  luuLichSac(maHub: string, dsPhanBo: PhanBoSac[], nguCanh: d.NguCanh) {
    const working = nguCanh === 'MO_PHONG' && this.working.size === 1 ? [...this.working.keys()][0] : undefined;
    const {state} = this.docDuLieuLapLich(maHub, nguCanh, working);
    for (const allocation of dsPhanBo) {
      const request = state.requests.find(item => item.id === allocation.requestId);
      d.requireRule(request && request.status === 'CHO_XEP_LICH', 'RESOURCE_TAKEN');
      request.status = 'DA_XEP_LICH';
      request.reason = undefined;
      state.sessions.push(new d.ChargingSession(randomUUID(), allocation.requestId, allocation.pointId, allocation.start, allocation.end));
    }
    return true;
  }
  luuLyDoCho(maYeuCauSac: string, lyDo: string) {
    const request = this.state.requests.find(item => item.id === maYeuCauSac);
    if (request) request.reason = lyDo;
  }
  docBaoCaoVaTaiNguyen(maSuCo: string) {
    const incident = this.state.incidents.find(item => item.id === maSuCo);
    d.requireRule(incident, 'NOT_FOUND');
    const resources = incident.resourceType === 'XE' ? this.state.vehicles : this.state.points;
    return {incident, resource: resources.find(item => item.id === incident.resourceId)};
  }
  luuSuCo(suCo: d.Incident) { this.state.incidents.push(suCo); }
  luuTuChoi(maSuCo: string, lyDo: string) {
    const {incident} = this.docBaoCaoVaTaiNguyen(maSuCo);
    d.requireRule(incident.status === 'MOI' && lyDo.trim(), 'INVALID_STATE');
    incident.status = 'TU_CHOI'; incident.reason = lyDo;
  }
  luuPhanCong(maSuCo: string, maNVKyThuat: string) {
    const {incident, resource} = this.docBaoCaoVaTaiNguyen(maSuCo);
    d.requireRule(incident.status === 'MOI' && resource, 'INVALID_STATE');
    incident.status = 'DANG_XU_LY'; incident.technician = maNVKyThuat;
    resource.status = 'BROKEN';
  }
  luuKetQuaKyThuat(maSuCo: string, ketQua: string) {
    const {incident} = this.docBaoCaoVaTaiNguyen(maSuCo);
    d.requireRule(incident.status === 'DANG_XU_LY' && ketQua.trim(), 'INVALID_STATE');
    incident.repair = ketQua;
  }
  docKetQuaKyThuat(maSuCo: string) { return this.docBaoCaoVaTaiNguyen(maSuCo).incident.repair; }
  luuKetLuanVaDongSuCo(maSuCo: string, dat: boolean) {
    const {incident, resource} = this.docBaoCaoVaTaiNguyen(maSuCo);
    d.requireRule(incident.status === 'DANG_XU_LY' && incident.repair && resource, 'INVALID_STATE');
    if (!dat) { incident.repair = undefined; return false; }
    incident.status = 'DA_DONG';
    if (!this.state.incidents.some(item => item.id !== incident.id && item.resourceId === resource.id && item.resourceType === incident.resourceType && item.status === 'DANG_XU_LY')) {
      resource.status = incident.resourceType === 'XE' ? 'AVAILABLE' : 'RANH';
    }
    return true;
  }
  findHub(hubId: string) { return this.state.hubs.find(hub => hub.id === hubId); }
  countFreeSpots(hubId: string) { return this.state.spots.filter(spot => spot.hubId === hubId && spot.status === 'EMPTY').length; }
  getExpectedDemand(hubId: string) { return this.findHub(hubId)?.expectedDemand ?? 0; }
  findCandidateVehicles(hubId: string) {
    const pending = new Set(this.state.requests.filter(request => request.status === 'DA_XEP_LICH' || request.status === 'DANG_SAC').map(request => request.vehicleId));
    const assigned = new Set(this.state.orders.filter(order => order.status !== 'CANCELLED' && order.status !== 'COMPLETED').flatMap(order => order.vehicleIds));
    return this.state.vehicles.filter(vehicle => vehicle.hubId === hubId && !vehicle.ownerId && vehicle.status === 'AVAILABLE' && !pending.has(vehicle.id) && !assigned.has(vehicle.id)).sort((a,b) => b.battery - a.battery || a.id.localeCompare(b.id));
  }
  findOrderByKey(idempotencyKey: string) { return this.state.orders.find(order => order.idempotencyKey === idempotencyKey); }
  findOrder(orderId: string) { return this.state.orders.find(order => order.id === orderId); }
  lockResources(resourceIds: string[]) {
    // The repository transaction owns the live-network lock until commit or rollback.
    const resources = new Set([...this.state.vehicles,...this.state.spots,...this.state.points].map(item => item.id));
    return resourceIds.every(id => resources.has(id));
  }
  saveOrder(order: d.RebalancingOrder) { this.state.orders.push(order); return true; }
  updateOrder(order: d.RebalancingOrder) { return this.findOrder(order.id) === order; }
  findIdleTechnicians() {
    const active = new Set(this.state.orders.filter(order => order.status === 'ASSIGNED' || order.status === 'IN_PROGRESS').map(order => order.technicianId));
    return this.state.users.filter(user => user.role === 'TECHNICIAN' && !active.has(user.id)).sort((a,b) => a.id.localeCompare(b.id));
  }
  hubsExist(hubIds: string[]) { return hubIds.every(id => this.findHub(id)); }
  findScenario(scenarioId: string) { return this.state.scenarios.filter(item => item.id === scenarioId).sort((a,b) => b.versionNo - a.versionNo)[0]; }
  saveScenario(scenario: d.Scenario) { this.state.scenarios.push(scenario); return true; }
  findSnapshot(snapshotId: string) { return this.state.snapshots.find(item => item.id === snapshotId); }
  saveSnapshot(snapshot: d.NetworkSnapshot) { this.state.snapshots.push(snapshot); }
  findRun(runId: string) { return this.state.runs.find(item => item.id === runId); }
  findRunsByScenario(scenarioId?: string) { return this.state.runs.filter(item => !scenarioId || item.scenarioId === scenarioId); }
  saveRun(run: d.SimulationRun) { this.state.runs.push(run); }
  updateRun(run: d.SimulationRun) { return this.findRun(run.id) === run; }
  findRecommendations(runId: string) { return this.state.recommendations.filter(item => item.runId === runId); }
  saveRecommendations(items: d.CoordinationRecommendation[]) { this.state.recommendations.push(...items); }
  updateRecommendation(item: d.CoordinationRecommendation) { return this.state.recommendations.includes(item); }
  findRelatedRunIds(window: {start: number; end: number}) { return this.state.runs.filter(run => run.startedAt < window.end && (run.finishedAt ?? this.now()) >= window.start).map(run => run.id); }
  aggregateMetrics(hubIds: string[], window: {start: number; end: number}) { return this.state.metrics.filter(row => (!hubIds.length || hubIds.includes(row.hubId)) && row.timestamp >= window.start && row.timestamp < window.end); }
  readCurrentState() { return this.state.readCurrentState(); }
  readConsistentState(waitSeconds: number) { return this.state.readConsistentState(waitSeconds); }
  authorize(...roles: d.User['role'][]) {
    d.requireRule(this.state.users.some(user => user.id === this.actor && roles.includes(user.role)), 'FORBIDDEN');
  }
  audit(action: string, data: unknown, before: unknown = null) {
    new AuditLog(this.state,this.now).ghi(this.actor,action,'NETWORK',JSON.stringify(before),JSON.stringify(data));
  }
}
