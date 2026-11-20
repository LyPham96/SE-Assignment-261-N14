import { before, beforeEach, after, afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { createPool } from "../src/db.mjs";
import { migrate } from "../src/migrate.mjs";
import { seed } from "../src/seed.mjs";
import { createApp } from "../src/app.mjs";
const url = process.env.TEST_DATABASE_URL;
if (!url || !/^\/pikepike_test(?:_[a-f0-9]{32})?$/.test(new URL(url).pathname))
  throw Error("Use an isolated pikepike_test database");
const pool = createPool(url);
let app;
const send = (method, url, cookie, payload) =>
  app.inject({
    method,
    url,
    headers: { "x-pikepike-request": "1", ...(cookie ? { cookie } : {}) },
    payload,
  });
async function login(username = "student@pikepike.vn") {
  const res = await send("POST", "/api/auth/login", null, {
    username,
    password: "PikePike2026!",
  });
  assert.equal(res.statusCode, 200, res.body);
  return res.headers["set-cookie"].split(";")[0];
}
before(() => migrate(url));
beforeEach(async () => {
  await pool.query("TRUNCATE users,hubs RESTART IDENTITY CASCADE");
  await seed(pool);
  app = await createApp({ pool });
});
afterEach(() => app.close());
after(() => pool.end());
async function approved(cookie, adminCookie) {
  const v = await send("POST", "/api/private-vehicles", cookie, {
    bienSo: "59-TEST",
    mauXe: "Electric",
    maHub: "metro",
  });
  assert.equal(v.statusCode, 200, v.body);
  const result = await send(
    "POST",
    "/api/private-vehicles/" + v.json().id + "/review",
    adminCookie,
    { quyetDinh: "APPROVED", phienBanDaMo: 1 },
  );
  assert.equal(result.statusCode, 200, result.body);
  return v.json().id;
}
test("UC-08/10: private parking requires approval, serializes duplicate bookings, and rolls back a rejected destination", async () => {
  const student = await login(),
    admin = await login("admin@pikepike.vn"),
    vehicleId = await approved(student, admin);
  const input = {
    vehicleId,
    hubId: "ktx",
    startsAt: new Date(Date.now() + 60000).toISOString(),
    durationMinutes: 60,
  };
  const replies = await Promise.all([
    send("POST", "/api/parking", student, input),
    send("POST", "/api/parking", student, input),
  ]);
  assert.deepEqual(replies.map((r) => r.statusCode).sort(), [200, 409]);
  const booking = replies.find((r) => r.statusCode === 200).json();
  assert.equal(
    (
      await send("POST", "/api/reservations/shared", student, {
        vehicleId: "PK-1",
      })
    ).statusCode,
    409,
  );
  await pool.query("UPDATE spots SET status='RESERVED' WHERE hub_id='bk'");
  assert.equal(
    (await send("PUT", "/api/parking/" + booking.id, student, { hubId: "bk" }))
      .statusCode,
    409,
  );
  assert.equal(
    (
      await pool.query("SELECT status FROM spots WHERE id=$1", [
        booking.spot_id,
      ])
    ).rows[0].status,
    "RESERVED",
  );
  assert.equal(
    (
      await send("PUT", "/api/parking/" + booking.id, student, {
        hubId: "metro",
      })
    ).statusCode,
    200,
  );
  const other = await login("student2@pikepike.vn");
  assert.equal(
    (await send("PUT", "/api/parking/" + booking.id, other, { cancel: true }))
      .statusCode,
    404,
  );
  assert.equal(
    (await send("PUT", "/api/parking/" + booking.id, student, { cancel: true }))
      .statusCode,
    200,
  );
  assert.equal(
    (
      await send("POST", "/api/reservations/shared", student, {
        vehicleId: "PK-1",
      })
    ).statusCode,
    201,
  );
});
test("UC-10: changing a shared destination releases only its old hold and preserves expiry", async () => {
  const student = await login();
  const created = (
    await send("POST", "/api/reservations/shared", student, {
      vehicleId: "PK-1",
      destinationHubId: "ktx",
    })
  ).json();
  assert.equal(
    (
      await send(
        "PUT",
        "/api/reservations/" + created.id + "/destination",
        student,
        { hubId: "bk" },
      )
    ).statusCode,
    200,
  );
  const after = (await send("GET", "/api/me/reservations", student)).json()[0];
  assert.equal(after.expires_at, created.expires_at);
  assert.match(after.destination_spot_id, /^bk-/);
  assert.equal(
    (
      await pool.query("SELECT status FROM spots WHERE id=$1", [
        created.destination_spot_id,
      ])
    ).rows[0].status,
    "EMPTY",
  );
});
test("UC-03/04: preferences survive a new session; history is filtered and private", async () => {
  let student = await login();
  const preferences = { theme: "dark", language: "en", fontSize: "large" };
  assert.equal(
    (await send("PUT", "/api/me/preferences", student, preferences)).statusCode,
    200,
  );
  student = await login();
  assert.deepEqual(
    (await send("GET", "/api/me/preferences", student)).json(),
    preferences,
  );
  await send("POST", "/api/reservations/shared", student, {
    vehicleId: "PK-1",
  });
  assert.equal(
    (await send("GET", "/api/me/history?type=RESERVATION", student)).json()
      .length,
    1,
  );
  assert.equal(
    (await send("GET", "/api/me/history?type=TRIP", student)).json().length,
    0,
  );
  assert.equal(
    (
      await send(
        "GET",
        "/api/me/history?from=2030-01-01T00:00:00Z&to=2020-01-01T00:00:00Z",
        student,
      )
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await send("GET", "/api/me/history", await login("student2@pikepike.vn"))
    ).json().length,
    0,
  );
});
test("UC-26: admin creates hashed accounts, rejects stale updates, revokes disabled sessions, and restores access", async () => {
  const admin = await login("admin@pikepike.vn"),
    student = await login();
  assert.equal(
    (await send("GET", "/api/admin/users", student)).statusCode,
    403,
  );
  const data = {
    username: "new@example.test",
    name: "New student",
    role: "STUDENT",
    studentCode: "999",
    password: "PikePike2026!",
  };
  const created = await send("POST", "/api/admin/users", admin, data);
  assert.equal(created.statusCode, 200, created.body);
  const id = created.json().id;
  assert.notEqual(
    (await pool.query("SELECT password_hash FROM users WHERE id=$1", [id]))
      .rows[0].password_hash,
    data.password,
  );
  const cookie = await login(data.username);
  const update = {
    username: data.username,
    name: data.name,
    role: data.role,
    studentCode: "999",
    active: false,
    version: 1,
  };
  assert.equal(
    (await send("PUT", "/api/admin/users/" + id, admin, update)).statusCode,
    200,
  );
  assert.equal((await send("GET", "/api/auth/me", cookie)).statusCode, 401);
  assert.equal(
    (await send("PUT", "/api/admin/users/" + id, admin, update)).statusCode,
    409,
  );
  assert.equal(
    (
      await send("PUT", "/api/admin/users/" + id, admin, {
        ...update,
        active: true,
        version: 2,
      })
    ).statusCode,
    200,
  );
  await login(data.username);
});
test("UC-27: Hub config rejects capacity below use, requires confirmation and uses optimistic versions", async () => {
  const admin = await login("admin@pikepike.vn");
  const config = {
    capacity: 3,
    chargingCount: 2,
    chargingRate: 2,
    version: 1,
    confirmed: true,
  };
  assert.equal(
    (await send("PUT", "/api/admin/hubs/metro", admin, config)).statusCode,
    400,
  );
  config.capacity = 21;
  config.confirmed = false;
  assert.equal(
    (await send("PUT", "/api/admin/hubs/metro", admin, config)).statusCode,
    400,
  );
  config.confirmed = true;
  assert.equal(
    (await send("PUT", "/api/admin/hubs/metro", admin, config)).statusCode,
    200,
  );
  assert.equal(
    (await send("PUT", "/api/admin/hubs/metro", admin, config)).statusCode,
    409,
  );
  assert.equal(
    (await send("GET", "/api/admin/hubs", admin))
      .json()
      .find((h) => h.id === "metro").capacity,
    21,
  );
});
