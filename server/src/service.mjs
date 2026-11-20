import { randomUUID } from 'node:crypto';
import rules from '../config/business-rules.json' with { type: 'json' };
import { prototype, notifyUser } from './prototype.mjs';
import { transaction } from './db.mjs';
import { hashPassword, verifyPassword, hashToken, newToken } from './security.mjs';

export class Problem extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const fail = (status, code, message) => { throw new Problem(status, code, message); };
const plusMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60000);
const publicUser = user => ({ id: user.id, name: user.name, username: user.username, role: user.role });

export class LoginSession {
  constructor(userId, now) {
    this.userId=userId;
    this.token=newToken();
    this.tokenHash=hashToken(this.token);
    this.expiresAt=plusMinutes(now,rules.sessionMinutes);
  }
}

export class BoDieuKhienXacThuc {
  static create(pool) { return createService(pool); }
  constructor(service) { this.service=service; }
  dangNhap(username,password) { return this.service.login(username,password); }
  kiemTraPhien(token) { return this.service.authenticate(token); }
  dangXuat(token,user) { return this.service.logout(token,user); }
}

export class DieuKhienDatCho {
  constructor(service) { this.service=service; }
  yeuCauDatXe(maSV,maXe,maHubDichTuyChon) { return this.service.reserve(maSV,maXe,maHubDichTuyChon); }
  huyDatCho(maSV,maDatCho) { return this.service.cancel(maSV,maDatCho); }
}

export class CSDLTaiNguyen {
  constructor(service) { this.service=service; }
  fetchAllHubsStatus() { return this.service.hubs(); }
  layDanhSachXe(maHub) { return this.service.vehicles(maHub); }
}

export class BoDinhThoi {
  constructor(service,onError) { this.service=service;this.onError=onError; }
  start() {
    if(this.timer)return;
    const scan=async()=>{
      if(this.scanning)return;
      this.scanning=true;
      try {await this.service.expire()} catch(error) {this.onError(error)}
      finally {this.scanning=false}
    };
    this.timer=setInterval(scan,rules.schedulerMilliseconds);
    this.timer.unref();
    void scan();
  }
  stop() {clearInterval(this.timer);this.timer=undefined;}
}

export async function createService(pool, clock = () => new Date(), fault = async () => {}) {
  const dummyHash = await hashPassword(randomUUID());
  const audit = (db, actor, action, entity, now) => db.query('INSERT INTO audit_logs(actor_id,action,entity_id,created_at) VALUES($1,$2,$3,$4)', [actor, action, entity, now]);
  const lockUser = async (db, id) => {
    const { rows: [user] } = await db.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [id]);
    if (!user?.active) fail(401, 'SESSION_EXPIRED', 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    return user;
  };
  const lockHubs = async (db, ids) => db.query('SELECT id FROM hubs WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE', [ids.filter(Boolean)]);
  async function release(db, reservation, status, now) {
    const { rows: [vehicle] } = await db.query('SELECT * FROM vehicles WHERE id=$1', [reservation.vehicle_id]);
    const { rows: [spot] } = await db.query('SELECT * FROM spots WHERE id=$1', [reservation.destination_spot_id]);
    await lockHubs(db, [vehicle.hub_id, spot?.hub_id]);
    await db.query('SELECT id FROM vehicles WHERE id=$1 FOR UPDATE', [vehicle.id]);
    await db.query('UPDATE reservations SET status=$1 WHERE id=$2', [status, reservation.id]);
    await db.query("UPDATE vehicles SET status=CASE WHEN battery < $2 THEN 'PIN_YEU' ELSE 'SAN_SANG' END WHERE id=$1 AND status='DA_DAT'", [vehicle.id, rules.minimumBattery]);
    await db.query("UPDATE spots SET status='EMPTY' WHERE id=$1 AND status='RESERVED'", [reservation.destination_spot_id]);
    if (status === 'HET_HAN') {
      const inserted = await db.query('INSERT INTO no_shows(reservation_id,user_id,occurred_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING reservation_id', [reservation.id, reservation.user_id, now]);
      if (inserted.rowCount) {
        const { rows: [count] } = await db.query('SELECT count(*)::int AS total FROM no_shows WHERE user_id=$1 AND (occurred_at AT TIME ZONE $3)::date=($2::timestamptz AT TIME ZONE $3)::date', [reservation.user_id, now, rules.businessTimezone]);
        if (count.total >= rules.noShowLimit) {
          await db.query('UPDATE users SET booking_locked_until=GREATEST(booking_locked_until,$2) WHERE id=$1', [reservation.user_id, plusMinutes(now, rules.bookingLockHours * 60)]);
          await notifyUser(db,reservation.user_id,'BOOKING_LOCKED','Quyền đặt chỗ bị khóa 24 giờ do không nhận xe.',reservation.id);
        }
      }
    }
    await fault('release');
    await audit(db, reservation.user_id, status === 'HET_HAN' ? 'RESERVATION_EXPIRED' : 'RESERVATION_CANCELLED', reservation.id, now);
  }
  return {
    async login(username, password) {
      const result = await transaction(pool, async db => {
        const now = clock();
        const { rows: [user] } = await db.query('SELECT * FROM users WHERE username=$1 FOR UPDATE', [username.toLowerCase().trim()]);
        const denied = new Problem(401, 'INVALID_CREDENTIALS', 'Thông tin đăng nhập không đúng');
        if (!user) { await verifyPassword(password, dummyHash); return denied; }
        if (!user.active) return new Problem(403, 'ACCOUNT_DISABLED', 'Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.');
        if (user.login_locked_until > now) return new Problem(423, 'LOGIN_LOCKED', `Đăng nhập bị khóa đến ${user.login_locked_until.toISOString()}`);
        if (!(await verifyPassword(password, user.password_hash))) {
          const count = user.login_locked_until ? 1 : user.failed_logins + 1;
          const locked = count >= rules.maxLoginFailures;
          await db.query('UPDATE users SET failed_logins=$2,login_locked_until=$3 WHERE id=$1', [user.id, count, locked ? plusMinutes(now, rules.loginLockMinutes) : null]);
          await audit(db, user.id, 'LOGIN_FAILED', user.id, now);
          return locked ? new Problem(423, 'LOGIN_LOCKED', 'Sai mật khẩu 5 lần. Vui lòng thử lại sau 15 phút.') : denied;
        }
        const session = new LoginSession(user.id,now);
        const removed = await db.query('DELETE FROM sessions WHERE user_id=$1', [user.id]);
        if (removed.rowCount) await audit(db, user.id, 'SESSION_REVOKED', user.id, now);
        await db.query('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)', [session.tokenHash,session.userId,session.expiresAt]);
        await db.query('UPDATE users SET failed_logins=0,login_locked_until=NULL WHERE id=$1', [user.id]);
        await audit(db, user.id, 'LOGIN_SUCCEEDED', user.id, now);
        return { token: session.token, user: publicUser(user) };
      });
      if (result instanceof Problem) throw result;
      return result;
    },
    async authenticate(token) {
      if (!token) fail(401, 'SESSION_EXPIRED', 'Vui lòng đăng nhập để tiếp tục.');
      return transaction(pool, async db => {
        const tokenHash = hashToken(token);
        const { rows: [session] } = await db.query('SELECT user_id FROM sessions WHERE token_hash=$1', [tokenHash]);
        if (!session) fail(401, 'SESSION_EXPIRED', 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
        const user = await lockUser(db, session.user_id);
        const now = clock();
        const touched = await db.query('UPDATE sessions SET expires_at=$2 WHERE token_hash=$1 AND expires_at>$3 RETURNING user_id', [tokenHash, plusMinutes(now, rules.sessionMinutes), now]);
        if (!touched.rowCount) fail(401, 'SESSION_EXPIRED', 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
        return publicUser(user);
      });
    },
    async logout(token, user) {
      await transaction(pool, async db => {
        await lockUser(db, user.id);
        await db.query('DELETE FROM sessions WHERE token_hash=$1', [hashToken(token)]);
        await audit(db, user.id, 'LOGOUT', user.id, clock());
      });
    },
    async hubs() {
      const { rows } = await pool.query(`SELECT h.*, count(s.id)::int AS capacity,
        count(s.id) FILTER (WHERE s.status <> 'EMPTY')::int AS used,
        count(s.id) FILTER (WHERE s.status = 'EMPTY')::int AS empty,
        (SELECT count(*)::int FROM vehicles v WHERE v.hub_id=h.id AND v.status='SAN_SANG' AND v.battery >= $1) AS available
        FROM hubs h LEFT JOIN spots s ON s.hub_id=h.id AND NOT s.retired GROUP BY h.id ORDER BY h.id`, [rules.minimumBattery]);
      return rows.map(h => ({ ...h, nearFull: h.capacity > 0 && h.used / h.capacity >= rules.nearFull, blocked: h.capacity === 0 || h.used / h.capacity >= rules.blockBooking, dataSource: 'DEMO_DATABASE' }));
    },
    async vehicles(hubId) {
      const { rows } = await pool.query('SELECT * FROM vehicles WHERE hub_id=$1 ORDER BY id', [hubId]);
      return rows.map(v => ({ ...v, eligible: v.status === 'SAN_SANG' && v.battery >= rules.minimumBattery, lowBattery: v.battery >= rules.minimumBattery && v.battery < rules.lowBattery }));
    },
    async reservations(userId) {
      const { rows } = await pool.query(`SELECT r.*,v.name AS vehicle_name,v.battery,h.name AS source_name,dh.name AS destination_name
        FROM reservations r JOIN vehicles v ON v.id=r.vehicle_id JOIN hubs h ON h.id=v.hub_id
        LEFT JOIN spots s ON s.id=r.destination_spot_id LEFT JOIN hubs dh ON dh.id=s.hub_id
        WHERE r.user_id=$1 ORDER BY r.created_at DESC`, [userId]);
      return rows;
    },
    async reserve(userId, vehicleId, destinationHubId) {
      return transaction(pool, async db => {
        const user = await lockUser(db, userId);
        const now = clock();
        if (user.role !== 'STUDENT') fail(403, 'FORBIDDEN', 'Chỉ sinh viên được đặt xe.');
        if (user.booking_locked_until > now) fail(423, 'BOOKING_LOCKED', 'Quyền đặt chỗ đang bị khóa do không nhận xe.');
        const active = await db.query("SELECT id FROM reservations WHERE user_id=$1 AND status='DA_XAC_NHAN' UNION ALL SELECT id FROM private_parking WHERE user_id=$1 AND status='DA_XAC_NHAN'", [userId]);
        if (active.rowCount) fail(409, 'ACTIVE_RESERVATION', 'Bạn đang có một đặt chỗ hiệu lực. Vui lòng hủy hoặc chờ hết hạn.');
        const {rows:[tripSchema]}=await db.query("SELECT to_regclass('shared_trips') AS ready");
        if(tripSchema.ready&&(await db.query('SELECT id FROM shared_trips WHERE user_id=$1 AND ended_at IS NULL',[userId])).rowCount)fail(409,'ACTIVE_TRIP','Bạn đang có chuyến đi chưa kết thúc.');
        const { rows: [initial] } = await db.query('SELECT hub_id FROM vehicles WHERE id=$1', [vehicleId]);
        if (!initial) fail(404, 'NOT_FOUND', 'Không tìm thấy xe.');
        await lockHubs(db, [initial.hub_id, destinationHubId]);
        const { rows: [vehicle] } = await db.query('SELECT * FROM vehicles WHERE id=$1 FOR UPDATE', [vehicleId]);
        if (vehicle.status !== 'SAN_SANG' || vehicle.battery < rules.minimumBattery) fail(409, 'INVALID_VEHICLE', 'Xe vừa được đặt hoặc không đủ điều kiện. Vui lòng chọn xe khác.');
        const {rows:[schema]} = await db.query("SELECT to_regclass('charging_request') AS charging");
        if (schema.charging && (await db.query("SELECT id FROM charging_request WHERE \"vehicleId\"=$1 AND status IN ('DA_XEP_LICH','DANG_SAC')",[vehicleId])).rowCount) {
          fail(409,'INVALID_VEHICLE','Xe đang có lịch sạc.');
        }
        let destinationSpot = null;
        if (destinationHubId) {
          const { rows: [counts] } = await db.query("SELECT count(*)::int AS total,count(*) FILTER (WHERE status <> 'EMPTY')::int AS used FROM spots WHERE hub_id=$1 AND NOT retired", [destinationHubId]);
          if (!counts.total) fail(404, 'NOT_FOUND', 'Không tìm thấy Hub đích.');
          if (counts.used / counts.total >= rules.blockBooking) fail(409, 'HUB_OVERLOAD_95', 'Hub đích đã đầy từ 95%. Vui lòng chọn Hub khác trong danh sách.');
          const { rows: [spot] } = await db.query("SELECT id FROM spots WHERE hub_id=$1 AND NOT retired AND status='EMPTY' ORDER BY id LIMIT 1 FOR UPDATE", [destinationHubId]);
          if (!spot) fail(409, 'NO_SPOT', 'Hub đích không còn chỗ trống.');
          destinationSpot = spot.id;
          await db.query("UPDATE spots SET status='RESERVED' WHERE id=$1", [spot.id]);
        }
        const id = randomUUID();
        await db.query("UPDATE vehicles SET status='DA_DAT' WHERE id=$1", [vehicleId]);
        await fault('reserve');
        const { rows: [reservation] } = await db.query("INSERT INTO reservations(id,user_id,vehicle_id,destination_spot_id,status,created_at,expires_at) VALUES($1,$2,$3,$4,'DA_XAC_NHAN',$5,$6) RETURNING *", [id, userId, vehicleId, destinationSpot, now, plusMinutes(now, rules.reservationMinutes)]);
        await audit(db, userId, 'RESERVATION_CREATED', id, now);
        return reservation;
      });
    },
    async cancel(userId, reservationId) {
      const result = await transaction(pool, async db => {
        await lockUser(db, userId);
        const { rows: [reservation] } = await db.query('SELECT * FROM reservations WHERE id=$1 AND user_id=$2 FOR UPDATE', [reservationId, userId]);
        if (!reservation) fail(404, 'NOT_FOUND', 'Không tìm thấy đặt chỗ.');
        if (reservation.status !== 'DA_XAC_NHAN') fail(409, 'RESERVATION_CLOSED', 'Đặt chỗ đã kết thúc. Vui lòng tải lại danh sách.');
        const now = clock();
        const expired = reservation.expires_at <= now;
        await release(db, reservation, expired ? 'HET_HAN' : 'DA_HUY', now);
        return expired ? new Problem(409, 'RESERVATION_EXPIRED', 'Đặt chỗ đã hết hạn và tài nguyên đã được giải phóng.') : { id: reservationId, status: 'DA_HUY' };
      });
      if (result instanceof Problem) throw result;
      return result;
    },
    async expire() {
      await prototype(pool,clock).expireParking();
      const { rows } = await pool.query("SELECT id,user_id FROM reservations WHERE status='DA_XAC_NHAN' AND expires_at<=$1 ORDER BY expires_at", [clock()]);
      for (const row of rows) await transaction(pool, async db => {
        await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [row.user_id]);
        const { rows: [reservation] } = await db.query('SELECT * FROM reservations WHERE id=$1 FOR UPDATE', [row.id]);
        const now = clock();
        if (reservation.status === 'DA_XAC_NHAN' && reservation.expires_at <= now) await release(db, reservation, 'HET_HAN', now);
      });
    }
  };
}
