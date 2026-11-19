import {randomUUID} from 'node:crypto';
import {Database, type DuLieuKiemTraSac, type PhanBoSac} from './Database.js';
import * as d from './domain.js';

export type KetQuaLapLich = {success: true; allocations: PhanBoSac[]; pending: d.ChargingRequest[]};
export type KetQuaDangKySac = {success: true; maYeuCauSac: string; trangThai: d.ChargingRequest['status']};
export type KetQuaBaoSuCo = {success: true; maSuCo: string};
export type KetQuaKhacPhuc = string;
export type LoaiSuCo = string;

export class NotificationService {
  constructor(private readonly db: Database) {}
  gui(maNguoiNhan: string, loaiThongBao: string, noiDung: string): void;
  gui(danhSachNguoiNhan: string[], loaiThongBao: string, noiDung: string, thamChieu?: string | null): void;
  gui(recipients: string | string[], loaiThongBao: string, noiDung: string, thamChieu?: string | null) {
    for (const recipient of new Set(typeof recipients === 'string' ? [recipients] : recipients)) {
      this.db.state.notifications.push(new d.Notification(randomUUID(), recipient, loaiThongBao, noiDung, this.db.now(), thamChieu ?? undefined));
    }
  }
}
export type TimeWindow = {start: number; end: number};
export type ResourceCheckResult = {success: boolean; code?: string; warnings?: string[]; alternatives?: string[]};
export class KiemTraTaiNguyen {
  constructor(private readonly db: Database) {}
  kiemTraTaiNguyenKhaDung(loaiGD: string, maTaiNguyen: string, maHub: string, khungGio?: TimeWindow | null, maHubDich?: string | null, nguCanh?: string | null, maLanChay?: string | null): ResourceCheckResult {
    const context = nguCanh === 'MO_PHONG' || nguCanh === 'SIMULATION' ? 'MO_PHONG' : 'THAT';
    const {state, points} = this.db.docDuLieuLapLich(maHub, context, maLanChay ?? undefined);
    const destination = maHubDich ?? maHub;
    const ratio = state.parkingRatio(destination);
    const warnings = ratio >= .85 && ratio < .95 ? ['HUB_NEAR_FULL_85'] : [];
    if (loaiGD === 'SAC') {
      const point = points.find(item => item.id === maTaiNguyen);
      const sessions = state.sessions.filter(session => session.pointId === maTaiNguyen);
      const occupied = sessions.some(session => !khungGio || (khungGio.start < session.end && session.start < khungGio.end))
        || (point?.status === 'DANG_SAC' && !sessions.some(session => session.start <= this.db.now() && this.db.now() < session.end));
      return point && !occupied ? {success: true, warnings} : {success: false, code: 'NO_AVAILABLE_POINT'};
    }
    if (ratio >= .95 && (loaiGD === 'DO_XE' || maHubDich)) return {success: false, code: 'HUB_OVERLOAD_95', alternatives: state.hubs.filter(hub => hub.id !== destination && state.parkingRatio(hub.id) < .95 && state.spots.some(spot => spot.hubId === hub.id && spot.status === 'EMPTY')).map(hub => hub.id)};
    if (loaiGD === 'DO_XE') {
      const spot = state.spots.find(item => item.id === maTaiNguyen && item.hubId === destination);
      return spot?.status === 'EMPTY' ? {success: true, warnings} : {success: false, code: 'INVALID_PARKING_SPOT'};
    }
    const vehicle = state.vehicles.find(item => item.id === maTaiNguyen && item.hubId === maHub);
    if (vehicle?.status !== 'AVAILABLE' || vehicle.ownerId || vehicle.battery < 20) return {success: false, code: 'INVALID_VEHICLE', alternatives: state.vehicles.filter(item => item.hubId === maHub && item.id !== maTaiNguyen && !item.ownerId && item.status === 'AVAILABLE' && item.battery >= 20).map(item => item.id)};
    if (vehicle.battery <= 30) warnings.push('LOW_BATTERY_WARNING');
    return {success: true, warnings};
  }
}
export class ChargingService {
  constructor(private readonly db: Database, private readonly notifications = new NotificationService(db)) {}
  layThongTinSac(maXe: string, maHub: string) { return this.db.docThongTinXeVaHub(maXe, maHub); }
  dangKySac(maNguoiDung: string, duLieu: DuLieuKiemTraSac): KetQuaDangKySac {
    const {xe, hub, trungYeuCau} = this.db.docDieuKienDangKy(duLieu.maXe, duLieu.maHub);
    d.requireRule(xe.ownerId === maNguoiDung && xe.approved, 'VEHICLE_NOT_APPROVED');
    d.requireRule(hub.compatiblePrivateVehicles, 'HUB_INCOMPATIBLE');
    d.requireRule(!trungYeuCau, 'DUPLICATE_REQUEST');
    d.requireRule(this.kiemTraYeuCau(duLieu), 'INVALID_DATA');
    return this.save(maNguoiDung, xe, hub.id, duLieu.khungGio, duLieu.targetBattery);
  }
  dangKyNhuCauSac(maTaiKhoan: string, maXe: string, maHub: string, yeuCau: Omit<DuLieuKiemTraSac,'maXe' | 'maHub'>): KetQuaDangKySac {
    return this.dangKySac(maTaiKhoan,{...yeuCau,maXe,maHub});
  }
  private kiemTraYeuCau(duLieu: DuLieuKiemTraSac) {
    const window = duLieu.khungGio;
    return (!window || (Number.isFinite(window.start) && Number.isFinite(window.end) && window.start < window.end && window.end > this.db.now()))
      && (duLieu.targetBattery === undefined || (duLieu.targetBattery > 0 && duLieu.targetBattery <= 100));
  }
  taoYeuCauSacTuDong(maXe: string, maHub: string): KetQuaDangKySac {
    const {xe, hub, trungYeuCau} = this.db.docDieuKienDangKy(maXe, maHub);
    d.requireRule(!xe.ownerId && xe.battery < 30 && !trungYeuCau, 'INVALID_DATA');
    const result = this.save('SYSTEM', xe, maHub);
    this.lapLich(hub.id, 'THAT');
    return result;
  }
  private save(userId: string, vehicle: d.Vehicle, hubId: string, window?: TimeWindow, target?: number): KetQuaDangKySac {
    const request = new d.ChargingRequest(randomUUID(), userId, vehicle.id, hubId, vehicle.battery, this.db.now(),window,target);
    return {success: true, maYeuCauSac: this.db.luuYeuCauSac(request), trangThai: request.status};
  }
  lapLich(maHub: string, nguCanh: d.NguCanh, maLanChay?: string | null): KetQuaLapLich {
    const scoped = nguCanh === 'MO_PHONG'
      ? new Database(this.db.state,this.db.now,this.db.actor,new Map([[maLanChay ?? '',this.db.working.get(maLanChay ?? '')!]]))
      : this.db;
    const data = scoped.docDuLieuLapLich(maHub, nguCanh, maLanChay);
    const allocations = this.thuPhanBo({...data, maHub, nguCanh, maLanChay});
    const pending = data.requests.filter(request => !allocations.some(item => item.requestId === request.id));
    scoped.luuLichSac(maHub, allocations, nguCanh);
    for (const request of pending) {
      const reason = data.points.length ? 'NO_FEASIBLE_SLOT' : 'NO_AVAILABLE_POINT';
      if (nguCanh === 'THAT') this.db.luuLyDoCho(request.id, reason);
      else request.reason = reason;
    }
    if (nguCanh === 'THAT') {
      for (const request of data.requests) if (request.status === 'DA_XEP_LICH' && request.userId !== 'SYSTEM') this.notifications.gui(request.userId, 'CHARGING_SCHEDULED', request.id);
    }
    return {success: true, allocations, pending};
  }
  private tinhDiemUuTien(yeuCau: d.ChargingRequest) {
    return (100 - yeuCau.battery) * Number(process.env.CHARGING_BATTERY_WEIGHT ?? 1)
      + Math.max(0, (this.db.now() - yeuCau.createdAt) / 60_000) * Number(process.env.CHARGING_WAIT_WEIGHT ?? 1);
  }
  private thuPhanBo(duLieu: ReturnType<Database['docDuLieuLapLich']> & {maHub: string; nguCanh: d.NguCanh; maLanChay?: string | null}) {
    const data = duLieu;
    const allocations: PhanBoSac[] = [];
    const checker = new KiemTraTaiNguyen(this.db);
    for (const request of [...data.requests].sort((a,b) => this.tinhDiemUuTien(b) - this.tinhDiemUuTien(a) || a.createdAt - b.createdAt || a.id.localeCompare(b.id))) {
      const candidates = data.points.flatMap(point => {
        if (!(point.rate > 0)) return [];
        const duration = Math.max(1, Math.ceil(((request.targetBattery ?? 100) - request.battery) / point.rate)) * 60_000;
        const occupied = [...data.state.sessions, ...allocations].filter(session => session.pointId === point.id).sort((a,b) => a.start - b.start);
        let start = Math.max(this.db.now(), request.khungGio?.start ?? this.db.now());
        for (const slot of occupied) if (start < slot.end && slot.start < start + duration) start = slot.end;
        const end = start + duration;
        if (request.khungGio && end > request.khungGio.end) return [];
        return checker.kiemTraTaiNguyenKhaDung('SAC', point.id, data.maHub, {start,end}, null, data.nguCanh, data.maLanChay).success
          ? [{requestId: request.id, pointId: point.id, start, end}] : [];
      }).sort((a,b) => a.start - b.start || a.end - b.end || a.pointId.localeCompare(b.pointId));
      if (candidates[0]) allocations.push(candidates[0]);
    }
    return allocations;
  }
}
export class IncidentService {
  constructor(private readonly db: Database, private readonly notifications = new NotificationService(db)) {}
  baoSuCo(maNguoiBao: string, loaiTaiNguyen: d.LoaiTaiNguyen, maTaiNguyen: string, loaiSuCo: LoaiSuCo, moTa: string, viTri: string, anhDinhKem: File, maChuyenDi?: string | null): Promise<KetQuaBaoSuCo>;
  baoSuCo(maNguoiBao: string, loaiTaiNguyen: d.LoaiTaiNguyen, maTaiNguyen: string, loaiSuCo: LoaiSuCo, moTa: string, viTri: string, anhDinhKem?: string | null, maChuyenDi?: string | null): KetQuaBaoSuCo;
  baoSuCo(maNguoiBao: string, loaiTaiNguyen: d.LoaiTaiNguyen, maTaiNguyen: string, loaiSuCo: LoaiSuCo, moTa: string, viTri: string, anhDinhKem?: File | string | null, maChuyenDi?: string | null): KetQuaBaoSuCo | Promise<KetQuaBaoSuCo> {
    if (anhDinhKem && typeof anhDinhKem !== 'string') {
      d.requireRule(anhDinhKem.size <= 512_000 && ['image/png','image/jpeg','image/webp'].includes(anhDinhKem.type),'INVALID_DATA');
      return anhDinhKem.arrayBuffer().then(data => this.baoSuCo(maNguoiBao,loaiTaiNguyen,maTaiNguyen,loaiSuCo,moTa,viTri,'data:' + anhDinhKem.type + ';base64,' + Buffer.from(data).toString('base64'),maChuyenDi));
    }
    const resources = loaiTaiNguyen === 'XE' ? this.db.state.vehicles : this.db.state.points;
    d.requireRule(resources.some(resource => resource.id === maTaiNguyen) && moTa.trim(), 'INVALID_DATA');
    if (maChuyenDi) d.requireRule(this.db.state.trips.some(trip => trip.id === maChuyenDi && trip.userId === maNguoiBao && trip.active && (loaiTaiNguyen !== 'XE' || trip.vehicleId === maTaiNguyen)), 'INVALID_TRIP');
    d.requireRule(!this.kiemTraBaoCao(loaiTaiNguyen, maTaiNguyen), 'DUPLICATE_REPORT');
    const incident = new d.Incident(randomUUID(), maNguoiBao, loaiTaiNguyen, maTaiNguyen, loaiSuCo, moTa, viTri, maChuyenDi ?? undefined, anhDinhKem ?? undefined);
    this.db.luuSuCo(incident);
    if (maNguoiBao !== 'SYSTEM') this.notifications.gui(maNguoiBao, 'INCIDENT_REPORTED', incident.id);
    return {success: true, maSuCo: incident.id};
  }
  kiemTraBaoCao(loaiTaiNguyen: d.LoaiTaiNguyen, maTaiNguyen: string) {
    return this.db.state.incidents.some(item => item.resourceId === maTaiNguyen && item.resourceType === loaiTaiNguyen && ['MOI','DANG_XU_LY'].includes(item.status));
  }
  moSuCoTuThietBi(loaiTaiNguyen: d.LoaiTaiNguyen, maTaiNguyen: string, moTa: string) {
    if (!this.kiemTraBaoCao(loaiTaiNguyen, maTaiNguyen)) return this.baoSuCo('SYSTEM', loaiTaiNguyen, maTaiNguyen, 'DEVICE_FAILURE', moTa, '');
  }
  layChiTietSuCo(maSuCo: string) {
    this.db.authorize('OPERATOR','TECHNICIAN');
    const detail = this.db.docBaoCaoVaTaiNguyen(maSuCo);
    d.requireRule(detail.incident.technician === this.db.actor || this.db.state.users.some(user => user.id === this.db.actor && user.role === 'OPERATOR'), 'FORBIDDEN');
    return detail;
  }
  tuChoiBaoCao(maSuCo: string, lyDo: string) {
    this.db.authorize('OPERATOR');
    this.db.luuTuChoi(maSuCo, lyDo);
    this.notify(maSuCo, 'INCIDENT_REJECTED');
  }
  xacNhanVaPhanCong(maSuCo: string, maNVKyThuat: string) {
    this.db.authorize('OPERATOR');
    d.requireRule(this.db.state.users.some(user => user.id === maNVKyThuat && user.role === 'TECHNICIAN'), 'FORBIDDEN');
    this.db.luuPhanCong(maSuCo, maNVKyThuat);
    this.notifications.gui(maNVKyThuat, 'INCIDENT_ASSIGNED', maSuCo);
    this.notify(maSuCo, 'INCIDENT_CONFIRMED');
    const {incident, resource} = this.db.docBaoCaoVaTaiNguyen(maSuCo);
    if (incident.resourceType === 'CONG_SAC' && resource) {
      const affected = this.db.state.sessions.filter(session => session.pointId === resource.id && session.end > this.db.now());
      this.db.state.sessions = this.db.state.sessions.filter(session => !affected.includes(session));
      for (const request of this.db.state.requests) if (affected.some(session => session.requestId === request.id)) request.status = 'CHO_XEP_LICH';
      new ChargingService(this.db).lapLich(resource.hubId, 'THAT');
    }
  }
  capNhatKetQuaKhacPhuc(maSuCo: string, ketQua: KetQuaKhacPhuc) {
    this.db.authorize('TECHNICIAN');
    d.requireRule(this.db.docBaoCaoVaTaiNguyen(maSuCo).incident.technician === this.db.actor, 'FORBIDDEN');
    this.db.luuKetQuaKyThuat(maSuCo, ketQua);
  }
  layKetQuaKhacPhuc(maSuCo: string) { this.layChiTietSuCo(maSuCo); return this.db.docKetQuaKyThuat(maSuCo); }
  ketLuanKiemTra(maSuCo: string, dat: boolean) {
    this.db.authorize('OPERATOR');
    const closed = this.db.luuKetLuanVaDongSuCo(maSuCo, dat);
    this.notify(maSuCo, closed ? 'INCIDENT_CLOSED' : 'INCIDENT_REWORK');
    return {success: true, closed};
  }
  private notify(maSuCo: string, type: string) {
    const {incident} = this.db.docBaoCaoVaTaiNguyen(maSuCo);
    if (incident.reportedBy !== 'SYSTEM') this.notifications.gui(incident.reportedBy, type, maSuCo);
  }
}
export class MonitoringService {
  constructor(private readonly db: Database) {}
  layTongQuanMangLuoi(boLoc: {hubIds?: string[]} = {}) {
    const state = this.db.state;
    return state.hubs.filter(hub => !boLoc.hubIds?.length || boLoc.hubIds.includes(hub.id)).map(hub => ({
      hub, ...state.dataStatus(hub.id, this.db.now()), ratio: state.parkingRatio(hub.id),
      vehicles: state.vehicles.filter(vehicle => vehicle.hubId === hub.id),
      points: state.points.filter(point => point.hubId === hub.id),
      spots: state.spots.filter(spot => spot.hubId === hub.id),
      alerts: state.alerts.filter(alert => alert.hubId === hub.id && !alert.closedAt),
    }));
  }
  capNhatKhiCoSuKien(_suKien: d.BanTinTrangThai) { return this.layTongQuanMangLuoi(); }
}
export class DichVuCanhBao {
  constructor(private readonly db: Database) {}
  quetQuaTai() {
    for (const hub of this.db.state.hubs) {
      if (this.db.state.dataStatus(hub.id, this.db.now()).dataStatus !== 'FRESH') continue;
      this.record(hub.id,'PARKING',this.db.state.parkingRatio(hub.id),.85,.95);
      const points = this.db.state.points.filter(point => point.hubId === hub.id && point.status !== 'BROKEN');
      const rate = points.length ? points.filter(point => point.status === 'DANG_SAC').length / points.length : 0;
      const threshold = Number(process.env.CHARGING_OVERLOAD_RATIO || .95);
      this.record(hub.id,'CHARGING',rate,threshold,threshold);
    }
    return this.db.state.alerts.filter(alert => !alert.closedAt);
  }
  private record(hubId: string, resource: d.OverloadAlert['resource'], ratio: number, warning: number, critical: number) {
    const alert = this.db.state.alerts.find(item => item.hubId === hubId && (item.resource ?? 'PARKING') === resource && !item.closedAt);
    if (ratio < warning) {
      if (alert) this.dongCanhBao(alert.id, 'BELOW_THRESHOLD');
      return;
    }
    const level = ratio >= critical ? 'NGHIEM_TRONG' : 'GAN_DAY';
    if (alert) Object.assign(alert, {ratio, level, updatedAt: this.db.now()});
    else this.db.state.alerts.push(new d.OverloadAlert(randomUUID(),hubId,level,ratio,this.db.now(),undefined,undefined,resource));
  }
  dongCanhBao(maCanhBao: string, lyDo: string) {
    const alert = this.db.state.alerts.find(item => item.id === maCanhBao && !item.closedAt);
    d.requireRule(alert, 'NOT_FOUND');
    alert.closedAt = this.db.now(); alert.closeReason = lyDo;
    return {success: true};
  }
}
export class ResourceService {
  constructor(private readonly db: Database, private readonly real = process.env.USE_REAL_IOT === 'true') {}
  xuLyBanTin(banTin: d.BanTinTrangThai) {
    d.requireRule(banTin.maTaiNguyen && ['XE','CONG_SAC'].includes(banTin.loaiTaiNguyen) && Number.isFinite(banTin.thoiDiem), 'INVALID_DATA');
    d.requireRule(banTin.nguon === (this.real ? 'IOT_THAT' : 'MO_PHONG'), 'INVALID_SOURCE');
    const key = banTin.loaiTaiNguyen + ':' + banTin.maTaiNguyen;
    const resources = banTin.loaiTaiNguyen === 'XE' ? this.db.state.vehicles : this.db.state.points;
    const resource = resources.find(item => item.id === banTin.maTaiNguyen);
    const states = banTin.loaiTaiNguyen === 'XE' ? ['AVAILABLE','RESERVED','IN_USE','CHARGING','REBALANCING','BROKEN'] : ['RANH','DANG_SAC','BROKEN'];
    const status = banTin.trangThai === 'SAN_SANG' && banTin.loaiTaiNguyen === 'XE' ? 'AVAILABLE' : banTin.trangThai;
    d.requireRule(resource && states.includes(status) && (banTin.mucPin === undefined || (Number.isFinite(banTin.mucPin) && banTin.mucPin >= 0 && banTin.mucPin <= 100)), 'INVALID_DATA');
    if ((this.db.state.telemetry[key]?.thoiDiem ?? -Infinity) >= banTin.thoiDiem) return {success: true, ignored: true};
    if (['RESERVED','IN_USE','REBALANCING','BROKEN'].includes(resource.status) && resource.status !== status) {
      if ('battery' in resource && banTin.mucPin !== undefined) resource.battery = banTin.mucPin;
    } else {
      Object.assign(resource, {status});
      if ('battery' in resource && banTin.mucPin !== undefined) resource.battery = banTin.mucPin;
    }
    const event = {...banTin, maHub: resource.hubId};
    this.db.state.telemetry[key] = event;
    if (status === 'BROKEN') new IncidentService(this.db).moSuCoTuThietBi(banTin.loaiTaiNguyen, resource.id, 'DEVICE_FAILURE');
    new MonitoringService(this.db).capNhatKhiCoSuKien(event);
    return {success: true, ignored: false};
  }
  nhanBanTin(banTin: d.BanTinTrangThai) { return this.xuLyBanTin(banTin); }
  thuThapDinhKy() {
    if (this.real || process.env.DEMO_IOT !== 'true') return 0;
    this.capNhatPhienSacDemo();
    for (const point of this.db.state.points) new IoTGateway(this).nhanBanTin({
      maTaiNguyen: point.id, loaiTaiNguyen: 'CONG_SAC', trangThai: point.status, thoiDiem: this.db.now(), nguon: 'MO_PHONG',
    });
    return this.db.state.points.length;
  }
  private capNhatPhienSacDemo() {
    const state = this.db.state;
    const now = this.db.now();
    const released = new Set<string>();
    for (const session of state.sessions) {
      if (session.start > now) continue;
      const point = state.points.find(item => item.id === session.pointId);
      const request = state.requests.find(item => item.id === session.requestId);
      const vehicle = state.vehicles.find(item => item.id === request?.vehicleId);
      if (!point || point.status === 'BROKEN' || !request || !vehicle || !['DA_XEP_LICH','DANG_SAC'].includes(request.status)) continue;
      if (vehicle.status !== 'AVAILABLE' && vehicle.status !== 'CHARGING') continue;
      const target = request.targetBattery ?? 100;
      vehicle.battery = Math.min(target,request.battery + point.rate * (Math.min(now,session.end) - session.start) / 60_000);
      if (session.end <= now) {
        request.status = 'XONG';
        vehicle.status = 'AVAILABLE';
        point.status = 'RANH';
        released.add(point.hubId);
      } else {
        request.status = 'DANG_SAC';
        vehicle.status = 'CHARGING';
        point.status = 'DANG_SAC';
      }
    }
    for (const hubId of released) new ChargingService(this.db).lapLich(hubId,'THAT',null);
  }
}
export class IoTGateway {
  constructor(private readonly service: ResourceService) {}
  nhanBanTin(banTin: d.BanTinTrangThai) { return this.service.xuLyBanTin(banTin); }
}
