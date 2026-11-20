import { randomUUID } from "node:crypto";
import { transaction } from "./db.mjs";
import { hashPassword } from "./security.mjs";
import { Problem } from "./service.mjs";
import rules from "../config/business-rules.json" with { type: "json" };
const check = (ok, status, code, message) => {
  if (!ok) throw new Problem(status, code, message);
};
const one = async (db, sql, args = []) => (await db.query(sql, args)).rows[0];
const audit = (db, actor, action, id) =>
  db.query(
    "INSERT INTO audit_logs(actor_id,action,entity_id,created_at) VALUES($1,$2,$3,now())",
    [actor, action, id],
  );
const admin = (user) =>
  check(
    user.role === "ADMIN",
    403,
    "FORBIDDEN",
    "Chỉ quản trị viên được thao tác.",
  );
const student = (user) =>
  check(
    user.role === "STUDENT",
    403,
    "FORBIDDEN",
    "Chỉ sinh viên được thao tác.",
  );

export async function notifyUser(db,recipient,type,body,reference) {
  const schema=await one(db,"SELECT to_regclass(format('%I.notification',current_schema())) AS ready");
  if(!schema.ready)return;
  const id=randomUUID();
  await db.query('INSERT INTO notification(entity_key,position,id,recipient,type,body,"createdAt",reference) VALUES($1,COALESCE((SELECT max(position)+1 FROM notification),0),$1,$2,$3,$4,now(),$5)',[id,recipient,type,body,reference]);
}

export function prototype(pool, clock = () => new Date(), hooks = {}) {
  async function eligible(db, user) {
    student(user);
    const row = await one(db, "SELECT * FROM users WHERE id=$1 FOR UPDATE", [
      user.id,
    ]);
    check(
      row.active && !(row.booking_locked_until > clock()),
      423,
      "BOOKING_LOCKED",
      "Quyền đặt chỗ đang bị khóa.",
    );
    const active = await one(
      db,
      "SELECT id FROM reservations WHERE user_id=$1 AND status='DA_XAC_NHAN' UNION ALL SELECT id FROM private_parking WHERE user_id=$1 AND status='DA_XAC_NHAN'",
      [user.id],
    );
    check(
      !active,
      409,
      "ACTIVE_RESERVATION",
      "Bạn đã có một đặt chỗ đang hoạt động.",
    );
  }
  async function spot(db, hubId) {
    check(
      await one(db, "SELECT id FROM hubs WHERE id=$1 FOR UPDATE", [hubId]),
      404,
      "NOT_FOUND",
      "Hub không tồn tại.",
    );
    const counts = await one(
      db,
      "SELECT count(*)::int AS total,count(*) FILTER(WHERE status<>'EMPTY')::int AS used FROM spots WHERE hub_id=$1 AND NOT retired",
      [hubId],
    );
    check(
      counts.total > 0 && counts.used / counts.total < 0.95,
      409,
      "HUB_OVERLOAD_95",
      "Hub đã đầy, hãy chọn Hub khác.",
    );
    const row = await one(
      db,
      "SELECT id FROM spots WHERE hub_id=$1 AND NOT retired AND status='EMPTY' ORDER BY id LIMIT 1 FOR UPDATE",
      [hubId],
    );
    check(row, 409, "NO_SPOT", "Không còn chỗ trống.");
    return row.id;
  }
  return {
    async reserveParking(user, input) {
      return transaction(pool, async (db) => {
        await eligible(db, user);
        check(
          await one(
            db,
            "SELECT id FROM private_vehicles WHERE id=$1 AND owner_id=$2 AND status='APPROVED'",
            [input.vehicleId, user.id],
          ),
          403,
          "VEHICLE_NOT_APPROVED",
          "Cần xe cá nhân của bạn đã được duyệt.",
        );
        const start = new Date(input.startsAt),
          end = new Date(start.getTime() + input.durationMinutes * 60000);
        check(
          start >= clock() && input.durationMinutes > 0,
          400,
          "INVALID_WINDOW",
          "Thời gian đến phải ở tương lai.",
        );
        const spotId = await spot(db, input.hubId),
          id = randomUUID();
        await db.query("UPDATE spots SET status='RESERVED' WHERE id=$1", [
          spotId,
        ]);
        const row = await one(
          db,
          "INSERT INTO private_parking(id,user_id,vehicle_id,spot_id,starts_at,ends_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
          [id, user.id, input.vehicleId, spotId, start, end],
        );
        await audit(db, user.id, "PRIVATE_PARKING_CREATED", id);
        return row;
      });
    },
    async parking(user) {
      student(user);
      return (
        await pool.query(
          "SELECT p.*,v.plate,h.name AS hub_name FROM private_parking p JOIN private_vehicles v ON v.id=p.vehicle_id JOIN spots s ON s.id=p.spot_id JOIN hubs h ON h.id=s.hub_id WHERE p.user_id=$1 ORDER BY p.created_at DESC",
          [user.id],
        )
      ).rows;
    },
    async changeParking(user, id, input) {
      student(user);
      check(
        input.cancel || input.hubId,
        400,
        "INVALID_INPUT",
        "Cần chọn Hub đích hoặc hủy đặt chỗ.",
      );
      return transaction(pool, async (db) => {
        const row = await one(
          db,
          "SELECT * FROM private_parking WHERE id=$1 AND user_id=$2 FOR UPDATE",
          [id, user.id],
        );
        check(row, 404, "NOT_FOUND", "Không tìm thấy đặt chỗ.");
        check(
          row.status === "DA_XAC_NHAN" && row.ends_at > clock(),
          409,
          "RESERVATION_CLOSED",
          "Đặt chỗ đã kết thúc.",
        );
        await db.query(
          "UPDATE spots SET status='EMPTY' WHERE id=$1 AND status='RESERVED'",
          [row.spot_id],
        );
        if (input.cancel)
          await db.query(
            "UPDATE private_parking SET status='DA_HUY' WHERE id=$1",
            [id],
          );
        else {
          const spotId = await spot(db, input.hubId);
          await db.query("UPDATE spots SET status='RESERVED' WHERE id=$1", [
            spotId,
          ]);
          await db.query("UPDATE private_parking SET spot_id=$2 WHERE id=$1", [
            id,
            spotId,
          ]);
        }
        await audit(
          db,
          user.id,
          input.cancel
            ? "PRIVATE_PARKING_CANCELLED"
            : "PRIVATE_PARKING_UPDATED",
          id,
        );
        return { success: true };
      });
    },
    async changeDestination(user, id, hubId) {
      student(user);
      return transaction(pool, async (db) => {
        const row = await one(
          db,
          "SELECT * FROM reservations WHERE id=$1 AND user_id=$2 FOR UPDATE",
          [id, user.id],
        );
        check(row, 404, "NOT_FOUND", "Không tìm thấy đặt chỗ.");
        check(
          row.status === "DA_XAC_NHAN" && row.expires_at > clock(),
          409,
          "RESERVATION_CLOSED",
          "Đặt chỗ đã kết thúc.",
        );
        await db.query(
          "UPDATE spots SET status='EMPTY' WHERE id=$1 AND status='RESERVED'",
          [row.destination_spot_id],
        );
        const spotId = await spot(db, hubId);
        await db.query("UPDATE spots SET status='RESERVED' WHERE id=$1", [
          spotId,
        ]);
        await db.query(
          "UPDATE reservations SET destination_spot_id=$2 WHERE id=$1",
          [id, spotId],
        );
        await audit(db, user.id, "RESERVATION_UPDATED", id);
        return { success: true };
      });
    },
    async preferences(user, value) {
      if (!value)
        return (
          await one(pool, "SELECT preferences FROM users WHERE id=$1", [
            user.id,
          ])
        ).preferences;
      await pool.query("UPDATE users SET preferences=$2 WHERE id=$1", [
        user.id,
        JSON.stringify(value),
      ]);
      return value;
    },
    async history(user, filter = {}) {
      student(user);
      check(
        !filter.from ||
          !filter.to ||
          new Date(filter.from) <= new Date(filter.to),
        400,
        "INVALID_WINDOW",
        "Ngày bắt đầu phải trước ngày kết thúc.",
      );
      return transaction(pool, async (db) => {
        const rows = (
          await db.query(
            `
          SELECT 'TRIP' AS type,id::text,started_at AS started,ended_at AS ended,fee::text AS cost,vehicle_id AS resource FROM shared_trips WHERE user_id=$1
          UNION ALL SELECT 'RESERVATION',id::text,created_at,expires_at,NULL,vehicle_id FROM reservations WHERE user_id=$1
          UNION ALL SELECT 'PARKING',id::text,starts_at,ends_at,NULL,vehicle_id FROM private_parking WHERE user_id=$1
        `,
            [user.id],
          )
        ).rows;
        const ready = await one(
          db,
          "SELECT to_regclass('charging_session') AS ready",
        );
        if (ready.ready)
          rows.push(
            ...(
              await db.query(
                'SELECT \'CHARGING\' AS type,s.id,s.start AS started,s.end AS ended,NULL AS cost,r."vehicleId" AS resource FROM charging_session s JOIN charging_request r ON r.id=s."requestId" WHERE r."userId"=$1',
                [user.id],
              )
            ).rows,
          );
        return rows
          .filter(
            (r) =>
              (!filter.type ||
                filter.type === "ALL" ||
                r.type === filter.type) &&
              (!filter.from || r.started >= new Date(filter.from)) &&
              (!filter.to || r.started <= new Date(filter.to)),
          )
          .sort((a, b) => b.started - a.started);
      });
    },
    async users(user) {
      admin(user);
      return (
        await pool.query(
          "SELECT id,username,name,role,active,version,student_code FROM users ORDER BY username",
        )
      ).rows;
    },
    async saveUser(user, id, input) {
      admin(user);
      check(
        input.username.trim() && input.name.trim(),
        400,
        "INVALID_ACCOUNT",
        "Cần tên đăng nhập và họ tên.",
      );
      check(
        input.role !== "STUDENT" || input.studentCode?.trim(),
        400,
        "STUDENT_CODE_REQUIRED",
        "Cần mã sinh viên.",
      );
      check(
        !input.password || input.password.length >= 8,
        400,
        "WEAK_PASSWORD",
        "Mật khẩu cần ít nhất 8 ký tự.",
      );
      const password = input.password
        ? await hashPassword(input.password)
        : null;
      return transaction(pool, async (db) => {
        if (!id) {
          check(password, 400, "PASSWORD_REQUIRED", "Cần mật khẩu khởi tạo.");
          id = randomUUID();
          await db.query(
            "INSERT INTO users(id,username,name,password_hash,role,student_code) VALUES($1,$2,$3,$4,$5,$6)",
            [
              id,
              input.username.trim().toLowerCase(),
              input.name,
              password,
              input.role,
              input.studentCode ?? null,
            ],
          );
        } else {
          const old = await one(
            db,
            "SELECT * FROM users WHERE id=$1 FOR UPDATE",
            [id],
          );
          check(old, 404, "NOT_FOUND", "Không tìm thấy tài khoản.");
          check(
            old.version === input.version,
            409,
            "VERSION_CONFLICT",
            "Tài khoản vừa thay đổi, hãy tải lại.",
          );
          check(
            id !== user.id || (input.active && input.role === "ADMIN"),
            409,
            "SELF_LOCK",
            "Không thể tự khóa hoặc hạ quyền quản trị.",
          );
          await db.query(
            "UPDATE users SET username=$2,name=$3,role=$4,active=$5,password_hash=COALESCE($6,password_hash),student_code=$7,version=version+1 WHERE id=$1",
            [
              id,
              input.username.trim().toLowerCase(),
              input.name,
              input.role,
              input.active,
              password,
              input.studentCode ?? null,
            ],
          );
          await db.query("DELETE FROM sessions WHERE user_id=$1", [id]);
        }
        await audit(db, user.id, "ACCOUNT_SAVED", id);
        return { id };
      });
    },
    async hubConfigs(user) {
      admin(user);
      return (
        await pool.query(
          "SELECT h.*,count(s.id)::int AS capacity FROM hubs h LEFT JOIN spots s ON s.hub_id=h.id AND NOT s.retired GROUP BY h.id ORDER BY h.id",
        )
      ).rows;
    },
    async saveHub(user, id, input) {
      admin(user);
      check(
        input.confirmed,
        400,
        "CONFIRMATION_REQUIRED",
        "Cần xác nhận thay đổi.",
      );
      return transaction(pool, async (db) => {
        const h = await one(db, "SELECT * FROM hubs WHERE id=$1 FOR UPDATE", [
          id,
        ]);
        check(h, 404, "NOT_FOUND", "Không tìm thấy Hub.");
        check(
          h.version === input.version,
          409,
          "VERSION_CONFLICT",
          "Hub vừa thay đổi, hãy tải lại.",
        );
        const config = input.reset ? rules.defaultHub : input;
        check(
          Number.isInteger(config.capacity) &&
            config.capacity >= 0 &&
            Number.isInteger(config.chargingCount) &&
            config.chargingCount >= 0 &&
            config.chargingRate > 0,
          400,
          "INVALID_CONFIG",
          "Cần sức chứa, số cổng và tốc độ sạc hợp lệ.",
        );
        const spots = (
          await db.query(
            "SELECT * FROM spots WHERE hub_id=$1 AND NOT retired ORDER BY (status='EMPTY') DESC,id",
            [id],
          )
        ).rows;
        check(
          config.capacity >= spots.filter((s) => s.status !== "EMPTY").length,
          400,
          "CAPACITY_IN_USE",
          "Không thể giảm dưới số chỗ đang dùng/giữ.",
        );
        if (config.capacity < spots.length)
          for (const s of spots.slice(0, spots.length - config.capacity)) {
            await db.query("UPDATE spots SET retired=true WHERE id=$1", [s.id]);
          }
        for (let i = spots.length; i < config.capacity; i++)
          await db.query(
            "INSERT INTO spots(id,hub_id,status) VALUES($1,$2,'EMPTY')",
            [id + "-" + randomUUID(), id],
          );
        await db.query(
          "UPDATE hubs SET charging_count=$2,charging_rate=$3,version=version+1 WHERE id=$1",
          [id, config.chargingCount, config.chargingRate],
        );
        await hooks.onHubConfig?.(db, id, config);
        await audit(db, user.id, "HUB_CONFIG_UPDATED", id);
        return { success: true };
      });
    },
    async expireParking() {
      return transaction(pool, async (db) => {
        const expired = (
          await db.query(
            "UPDATE private_parking SET status='HET_HAN' WHERE status='DA_XAC_NHAN' AND ends_at<=$1 RETURNING spot_id",
            [clock()],
          )
        ).rows;
        for (const row of expired)
          await db.query(
            "UPDATE spots SET status='EMPTY' WHERE id=$1 AND status='RESERVED'",
            [row.spot_id],
          );
      });
    },
  };
}
