import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { transaction } from './db.mjs';
import { Problem } from './service.mjs';

function check(condition, status, code, message) {
  if (!condition) throw new Problem(status, code, message);
}
const first = async (db, sql, params) => (await db.query(sql, params)).rows[0];
const audit = (db, actor, action, id) =>
  db.query(
    'INSERT INTO audit_logs(actor_id,action,entity_id,created_at) VALUES($1,$2,$3,now())',
    [actor, action, id],
  );

export class StudentProfile {
  constructor(pool) {
    this.pool = pool;
  }
  async layHoSo(maSV) {
    return first(
      this.pool,
      'SELECT u.name AS "hoTen", COALESCE(p.contact,\'\') AS "thongTinLienHe" FROM users u LEFT JOIN student_profiles p ON p.user_id=u.id WHERE u.id=$1',
      [maSV],
    );
  }
  async capNhatHoSo(maSV, duLieu) {
    const name = duLieu.hoTen.trim(),
      contact = duLieu.thongTinLienHe.trim();
    check(
      name &&
        (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) ||
          /^\+?[\d ().-]{8,20}$/.test(contact)),
      400,
      'INVALID_PROFILE',
      'Cần họ tên và email hoặc số điện thoại hợp lệ.',
    );
    return transaction(this.pool, async (db) => {
      const updated = await db.query(
        "UPDATE users SET name=$2 WHERE id=$1 AND role='STUDENT' RETURNING id",
        [maSV, name],
      );
      check(
        updated.rowCount,
        403,
        'FORBIDDEN',
        'Chỉ sinh viên cập nhật hồ sơ sinh viên.',
      );
      await db.query(
        'INSERT INTO student_profiles(user_id,contact) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET contact=excluded.contact',
        [maSV, contact],
      );
      await audit(db, maSV, 'PROFILE_UPDATED', maSV);
      return { hoTen: name, thongTinLienHe: contact };
    });
  }
}

export class PrivateVehicle {
  constructor(pool) {
    this.pool = pool;
  }
  async layDanhSach(user) {
    return (
      await this.pool.query(
        'SELECT * FROM private_vehicles WHERE $1 OR owner_id=$2 ORDER BY id',
        [user.role === 'ADMIN', user.id],
      )
    ).rows;
  }
  async khaiBaoXe(maSV, thongTinXe) {
    const id = randomUUID(),
      plate = thongTinXe.bienSo.trim().toUpperCase(),
      model = thongTinXe.mauXe.trim();
    check(
      plate && model,
      400,
      'INVALID_VEHICLE',
      'Cần nhập biển số và mẫu xe.',
    );
    return transaction(this.pool, async (db) => {
      check(
        await first(db, "SELECT id FROM users WHERE id=$1 AND role='STUDENT'", [
          maSV,
        ]),
        403,
        'FORBIDDEN',
        'Chỉ sinh viên được khai báo xe.',
      );
      check(
        await first(db, 'SELECT id FROM hubs WHERE id=$1', [thongTinXe.maHub]),
        404,
        'HUB_NOT_FOUND',
        'Không tìm thấy Hub.',
      );
      const vehicle = await first(
        db,
        'INSERT INTO private_vehicles(id,owner_id,plate,model,hub_id) VALUES($1,$2,$3,$4,$5) RETURNING *',
        [id, maSV, plate, model, thongTinXe.maHub],
      );
      await audit(db, maSV, 'PRIVATE_VEHICLE_DECLARED', id);
      return vehicle;
    });
  }
  async duyetXe(maQuanTri, maXe, quyetDinh, lyDo, phienBanDaMo) {
    check(
      ['APPROVED', 'REJECTED'].includes(quyetDinh),
      400,
      'INVALID_DECISION',
      'Quyết định không hợp lệ.',
    );
    check(
      quyetDinh !== 'REJECTED' || lyDo?.trim(),
      400,
      'REASON_REQUIRED',
      'Cần nhập lý do từ chối.',
    );
    return transaction(this.pool, async (db) => {
      check(
        await first(db, "SELECT id FROM users WHERE id=$1 AND role='ADMIN'", [
          maQuanTri,
        ]),
        403,
        'FORBIDDEN',
        'Cần quyền quản trị.',
      );
      const vehicle = await first(
        db,
        'SELECT * FROM private_vehicles WHERE id=$1 FOR UPDATE',
        [maXe],
      );
      check(vehicle, 404, 'NOT_FOUND', 'Không tìm thấy xe.');
      check(
        vehicle.version === phienBanDaMo && vehicle.status === 'PENDING',
        409,
        'VERSION_CHANGED',
        'Hồ sơ đã thay đổi, hãy tải lại.',
      );
      const updated = await first(
        db,
        'UPDATE private_vehicles SET status=$2,reason=$3,version=version+1 WHERE id=$1 RETURNING *',
        [maXe, quyetDinh, lyDo?.trim() || null],
      );
      await audit(db, maQuanTri, 'PRIVATE_VEHICLE_' + quyetDinh, maXe);
      return updated;
    });
  }
}

export class HeThongIoT {
  constructor(pool, secret = process.env.IOT_KEY) {
    this.pool = pool;
    this.secret = secret;
  }
  maMoKhoa(reservation) {
    check(
      this.secret,
      503,
      'IOT_UNAVAILABLE',
      'Hệ thống IoT chưa được cấu hình.',
    );
    return createHmac('sha256', this.secret)
      .update('pickup:' + reservation.id)
      .digest()
      .readUInt32BE(0)
      .toString()
      .slice(0, 6)
      .padStart(6, '0');
  }
  kiemTraMa(reservation, code) {
    const expected = Buffer.from(this.maMoKhoa(reservation)),
      actual = Buffer.from(code);
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }
  xacThucThietBi(key) {
    const expected = Buffer.from(this.secret ?? ''),
      actual = Buffer.from(key ?? '');
    check(
      expected.length &&
        expected.length === actual.length &&
        timingSafeEqual(actual, expected),
      401,
      'IOT_AUTH',
      'Bản tin thiết bị không được xác thực.',
    );
  }
  async guiLenhMoKhoaCapSac(db, maDatCho, maXe) {
    await db.query(
      'INSERT INTO trip_unlock_commands(reservation_id,vehicle_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [maDatCho, maXe],
    );
  }
  async layLenhMoKhoa(maXe, key) {
    this.xacThucThietBi(key);
    return (
      await this.pool.query(
        `SELECT c.reservation_id,c.vehicle_id FROM trip_unlock_commands c JOIN reservations r ON r.id=c.reservation_id
      WHERE c.vehicle_id=$1 AND r.status='DA_XAC_NHAN' AND r.expires_at>now()
      AND NOT EXISTS(SELECT 1 FROM trip_device_events e WHERE e.subject_id=r.id AND e.kind='UNPLUGGED' AND e.consumed_at IS NULL AND e.occurred_at>=now()-interval '3 minutes')`,
        [maXe],
      )
    ).rows;
  }
  async nhanTin(event, key) {
    this.xacThucThietBi(key);
    return transaction(this.pool, async (db) => {
      const { eventId, subjectId, vehicleId, kind, spotId, distanceKm } = event;
      if (kind === 'UNPLUGGED') {
        check(
          !spotId &&
            (await first(
              db,
              "SELECT r.id FROM reservations r JOIN trip_unlock_commands c ON c.reservation_id=r.id WHERE r.id=$1 AND r.vehicle_id=$2 AND r.status='DA_XAC_NHAN' AND r.expires_at>now()",
              [subjectId, vehicleId],
            )),
          409,
          'INVALID_DEVICE_STATE',
          'Chưa có lệnh mở khóa cho đặt xe này.',
        );
      } else {
        check(
          await first(
            db,
            'SELECT id FROM shared_trips WHERE id=$1 AND vehicle_id=$2 AND ended_at IS NULL',
            [subjectId, vehicleId],
          ),
          409,
          'INVALID_DEVICE_STATE',
          'Chuyến đi không còn hiệu lực.',
        );
        check(
          spotId &&
            (await first(db, 'SELECT id FROM spots WHERE id=$1', [spotId])),
          400,
          'INVALID_SPOT',
          'Cần xác định vị trí đỗ.',
        );
      }
      await db.query(
        'INSERT INTO trip_device_events(event_id,subject_id,vehicle_id,kind,spot_id,distance_km) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',
        [
          eventId,
          subjectId,
          vehicleId,
          kind,
          spotId ?? null,
          distanceKm ?? null,
        ],
      );
      return { success: true };
    });
  }
  async doiXacNhan(db, id, vehicleId, kind, spotId = null) {
    const event = await first(
      db,
      "SELECT * FROM trip_device_events WHERE subject_id=$1 AND vehicle_id=$2 AND kind=$3 AND spot_id IS NOT DISTINCT FROM $4::text AND consumed_at IS NULL AND occurred_at>=now()-interval '3 minutes' ORDER BY occurred_at DESC LIMIT 1 FOR UPDATE",
      [id, vehicleId, kind, spotId],
    );
    check(
      event,
      409,
      'IOT_CONFIRMATION_REQUIRED',
      'Chưa nhận được xác nhận cáp sạc từ thiết bị.',
    );
    await db.query(
      'UPDATE trip_device_events SET consumed_at=now() WHERE event_id=$1',
      [event.event_id],
    );
    return event;
  }
}

export class DieuKhienChuyenDi {
  constructor(pool, iot = new HeThongIoT(pool), hooks = {}) {
    this.pool = pool;
    this.iot = iot;
    this.hooks = hooks;
  }
  async layMaMoKhoa(maSV, maDatCho) {
    const reservation = await first(
      this.pool,
      "SELECT * FROM reservations WHERE id=$1 AND user_id=$2 AND status='DA_XAC_NHAN' AND expires_at>now()",
      [maDatCho, maSV],
    );
    check(
      reservation,
      404,
      'NOT_FOUND',
      'Không tìm thấy đặt chỗ còn hiệu lực.',
    );
    return { maMoKhoa: this.iot.maMoKhoa(reservation) };
  }
  async yeuCauMoKhoaNhanXe(maSV, maDatCho, maXacThuc) {
    const result = await transaction(this.pool, async (db) => {
      const reservation = await first(
        db,
        "SELECT * FROM reservations WHERE id=$1 AND user_id=$2 AND status='DA_XAC_NHAN' AND expires_at>now() FOR UPDATE",
        [maDatCho, maSV],
      );
      check(
        reservation,
        409,
        'RESERVATION_CLOSED',
        'Đặt chỗ không còn hiệu lực.',
      );
      check(
        !reservation.unlock_failed_until ||
          reservation.unlock_failed_until <= new Date(),
        423,
        'UNLOCK_LOCKED',
        'Thử lại sau 3 phút.',
      );
      if (!this.iot.kiemTraMa(reservation, maXacThuc)) {
        const failures = reservation.unlock_failed_until
          ? 1
          : reservation.failed_unlock_count + 1;
        await db.query(
          "UPDATE reservations SET failed_unlock_count=$2,unlock_failed_until=CASE WHEN $2>=5 THEN now()+interval '3 minutes' END WHERE id=$1",
          [maDatCho, failures],
        );
        return failures >= 5
          ? new Problem(
              423,
              'UNLOCK_LOCKED',
              'Sai mã 5 lần. Thử lại sau 3 phút.',
            )
          : new Problem(400, 'INVALID_UNLOCK_CODE', 'Sai mã mở khóa.');
      }
      const vehicle = await first(
        db,
        "SELECT * FROM vehicles WHERE id=$1 AND status='DA_DAT' FOR UPDATE",
        [reservation.vehicle_id],
      );
      if (!vehicle || vehicle.battery < 20) {
        await db.query("UPDATE reservations SET status='DA_HUY' WHERE id=$1", [
          maDatCho,
        ]);
        await db.query(
          "UPDATE spots SET status='EMPTY' WHERE id=$1 AND status='RESERVED'",
          [reservation.destination_spot_id],
        );
        if (vehicle)
          await db.query("UPDATE vehicles SET status='PIN_YEU' WHERE id=$1", [
            vehicle.id,
          ]);
        await audit(db, maSV, 'PICKUP_CANCELLED_TECHNICAL', maDatCho);
        return new Problem(
          409,
          'INVALID_VEHICLE',
          'Xe không còn đủ điều kiện nhận. Hãy chọn xe khác tại Hub.',
        );
      }
      await db.query(
        'UPDATE reservations SET failed_unlock_count=0,unlock_failed_until=NULL WHERE id=$1',
        [maDatCho],
      );
      await this.iot.guiLenhMoKhoaCapSac(db, maDatCho, vehicle.id);
      try {
        await this.iot.doiXacNhan(db, maDatCho, vehicle.id, 'UNPLUGGED');
      } catch (error) {
        if (error.code === 'IOT_CONFIRMATION_REQUIRED') return error;
        throw error;
      }
      const trip = await first(
        db,
        'INSERT INTO shared_trips(id,reservation_id,user_id,vehicle_id,started_at,started_battery) VALUES($1,$2,$3,$4,now(),$5) RETURNING *',
        [randomUUID(), maDatCho, maSV, vehicle.id, vehicle.battery],
      );
      await db.query("UPDATE reservations SET status='DA_NHAN' WHERE id=$1", [
        maDatCho,
      ]);
      await db.query("UPDATE vehicles SET status='DANG_DUNG' WHERE id=$1", [
        vehicle.id,
      ]);
      await db.query(
        "UPDATE spots SET status='EMPTY',vehicle_id=NULL WHERE vehicle_id=$1",
        [vehicle.id],
      );
      await audit(db, maSV, 'TRIP_STARTED', trip.id);
      return trip;
    });
    if (result instanceof Problem) throw result;
    return result;
  }
  async layChuyenDi(maSV) {
    return (
      await this.pool.query(
        'SELECT t.*,v.name AS vehicle_name,r.destination_spot_id FROM shared_trips t JOIN vehicles v ON v.id=t.vehicle_id JOIN reservations r ON r.id=t.reservation_id WHERE t.user_id=$1 ORDER BY t.started_at DESC',
        [maSV],
      )
    ).rows;
  }
  async layChoTraXe(maSV, maChuyenDi) {
    const trip = await first(
      this.pool,
      'SELECT t.id,r.destination_spot_id FROM shared_trips t JOIN reservations r ON r.id=t.reservation_id WHERE t.id=$1 AND t.user_id=$2 AND t.ended_at IS NULL',
      [maChuyenDi, maSV],
    );
    check(trip, 404, 'NOT_FOUND', 'Không tìm thấy chuyến đang chạy.');
    return (
      await this.pool.query(
        "SELECT s.id,h.name AS hub_name FROM spots s JOIN hubs h ON h.id=s.hub_id WHERE s.id=$1 OR (s.status='EMPTY' AND (SELECT count(*) FILTER(WHERE p.status<>'EMPTY')::numeric / count(*) FROM spots p WHERE p.hub_id=s.hub_id)<.95) ORDER BY h.name,s.id",
        [trip.destination_spot_id],
      )
    ).rows;
  }
  yeuCauHoanTatTraXe(maSV, maChuyenDi) {
    return this.traXe(maSV, maChuyenDi);
  }
  async traXe(maSV, maChuyenDi, maChoDo) {
    return transaction(this.pool, async (db) => {
      const trip = await first(
        db,
        'SELECT t.*,r.destination_spot_id FROM shared_trips t JOIN reservations r ON r.id=t.reservation_id WHERE t.id=$1 AND t.user_id=$2 AND t.ended_at IS NULL FOR UPDATE OF t',
        [maChuyenDi, maSV],
      );
      check(trip, 404, 'NOT_FOUND', 'Không tìm thấy chuyến đang chạy.');
      if(!maChoDo){
        const reported=await first(db,"SELECT spot_id FROM trip_device_events WHERE subject_id=$1 AND vehicle_id=$2 AND kind='PLUGGED' AND consumed_at IS NULL AND occurred_at>=now()-interval '3 minutes' ORDER BY occurred_at DESC LIMIT 1",[trip.id,trip.vehicle_id]);
        check(reported?.spot_id,409,'IOT_CONFIRMATION_REQUIRED','Chưa nhận được xác nhận cáp sạc từ thiết bị.');
        maChoDo=reported.spot_id;
      }
      const spot = await first(
        db,
        'SELECT * FROM spots WHERE id=$1 FOR UPDATE',
        [maChoDo],
      );
      const held =
        spot?.status === 'RESERVED' && trip.destination_spot_id === maChoDo;
      check(
        spot && (held || spot.status === 'EMPTY'),
        409,
        'SPOT_TAKEN',
        'Chỗ đỗ không còn khả dụng.',
      );
      if (!held) {
        const ratio = await first(
          db,
          "SELECT count(*) FILTER(WHERE status<>'EMPTY')::numeric / count(*) AS ratio FROM spots WHERE hub_id=$1",
          [spot.hub_id],
        );
        check(
          Number(ratio.ratio) < 0.95,
          409,
          'HUB_OVERLOAD_95',
          'Hub đích đã đầy.',
        );
      }
      const event = await this.iot.doiXacNhan(
        db,
        trip.id,
        trip.vehicle_id,
        'PLUGGED',
        maChoDo,
      );
      const vehicle = await first(
        db,
        'SELECT battery FROM vehicles WHERE id=$1 FOR UPDATE',
        [trip.vehicle_id],
      );
      const endedAt = new Date(),
        distance = Number(event.distance_km ?? 0);
      const minutes = Math.max(
        1,
        Math.ceil((endedAt - trip.started_at) / 60000),
      );
      const fee =
        Number(process.env.TRIP_UNLOCK_FEE ?? 0) +
        minutes * Number(process.env.TRIP_MINUTE_RATE ?? 0) +
        Math.round(distance * Number(process.env.TRIP_KM_RATE ?? 0));
      const completed = await first(
        db,
        'UPDATE shared_trips SET ended_at=$2,ended_battery=$3,fee=$4,distance_km=$5,spot_id=$6 WHERE id=$1 RETURNING *',
        [trip.id, endedAt, vehicle.battery, fee, distance, spot.id],
      );
      if (trip.destination_spot_id && !held)
        await db.query(
          "UPDATE spots SET status='EMPTY' WHERE id=$1 AND status='RESERVED'",
          [trip.destination_spot_id],
        );
      await db.query(
        "UPDATE spots SET status='OCCUPIED',vehicle_id=$2 WHERE id=$1",
        [maChoDo, trip.vehicle_id],
      );
      await db.query(
        "UPDATE vehicles SET hub_id=$2,status=CASE WHEN battery<20 THEN 'PIN_YEU' ELSE 'SAN_SANG' END WHERE id=$1",
        [trip.vehicle_id, spot.hub_id],
      );
      await audit(db, maSV, 'TRIP_COMPLETED', trip.id);
      if(vehicle.battery<30)await this.hooks.onLowBatteryReturn?.(db,trip.vehicle_id,spot.hub_id);
      return completed;
    });
  }
  async xuLySuCoDocDuong(maSV,maChuyenDi,toaDoViTri,moTaSuCo) {
    check(this.hooks.onBreakdown,503,'INCIDENT_SERVICE_REQUIRED','Dịch vụ sự cố chưa sẵn sàng.');
    return transaction(this.pool,async db=>{
      const trip=await first(db,'SELECT t.*,r.destination_spot_id,v.battery FROM shared_trips t JOIN reservations r ON r.id=t.reservation_id JOIN vehicles v ON v.id=t.vehicle_id WHERE t.id=$1 AND t.user_id=$2 AND t.ended_at IS NULL FOR UPDATE OF t,v',[maChuyenDi,maSV]);
      check(trip,404,'NOT_FOUND','Không tìm thấy chuyến đang chạy.');
      const maSuCo=await this.hooks.onBreakdown(db,maSV,trip.id,trip.vehicle_id,toaDoViTri,moTaSuCo);
      await db.query('UPDATE shared_trips SET ended_at=now(),ended_battery=$2 WHERE id=$1',[trip.id,trip.battery]);
      await db.query("UPDATE vehicles SET status='HONG' WHERE id=$1",[trip.vehicle_id]);
      await db.query("UPDATE spots SET status='EMPTY' WHERE id=$1 AND status='RESERVED'",[trip.destination_spot_id]);
      await db.query('INSERT INTO trip_recovery_tasks(trip_id,incident_id,location) VALUES($1,$2,$3)',[trip.id,maSuCo,toaDoViTri]);
      await audit(db,maSV,'TRIP_BREAKDOWN',trip.id);
      return {maSuCo};
    });
  }
}
