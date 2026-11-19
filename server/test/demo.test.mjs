import { before, beforeEach, after, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createPool } from '../src/db.mjs';
import { createApp } from '../src/app.mjs';
import { migrate } from '../src/migrate.mjs';
import { seed } from '../src/seed.mjs';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || new URL(databaseUrl).pathname !== '/pikepike_test') throw new Error('TEST_DATABASE_URL must point to the isolated pikepike_test database');
const pool = createPool(databaseUrl);
let app;
let now;
let failAt;
const headers = { 'x-pikepike-request': '1' };
const send = (method, url, cookie, payload) => app.inject({ method, url, headers: { ...headers, ...(cookie ? { cookie } : {}) }, payload });
const login = async (username = 'student@pikepike.vn', password = 'PikePike2026!') => {
  const response = await send('POST', '/api/auth/login', null, { username, password });
  assert.equal(response.statusCode, 200, response.body);
  return response.headers['set-cookie'].split(';')[0];
};
const book = (cookie, vehicleId = 'PK-1', destinationHubId = 'ktx') => send('POST', '/api/reservations/shared', cookie, { vehicleId, destinationHubId });
const scalar = async (sql, values = []) => (await pool.query(sql, values)).rows[0];

before(async () => { await migrate(databaseUrl); });
beforeEach(async () => {
  await pool.query('TRUNCATE audit_logs,no_shows,reservations,spots,vehicles,hubs,sessions,users RESTART IDENTITY CASCADE');
  await seed(pool);
  now = new Date('2026-11-19T05:00:00Z');
  failAt = null;
  app = await createApp({ pool, clock: () => new Date(now), fault: async point => { if (point === failAt) throw new Error('Injected transaction failure'); } });
});
afterEach(async () => { await app.close(); });
after(async () => { await pool.end(); });

test('login persists hashed credentials and one opaque HttpOnly session; logout revokes it', async () => {
  const cookie = await login();
  const me = await send('GET', '/api/auth/me', cookie);
  assert.equal(me.json().user.role, 'STUDENT');
  const saved = await scalar('SELECT s.token_hash,u.password_hash FROM sessions s JOIN users u ON u.id=s.user_id');
  assert.notEqual(saved.token_hash, cookie.split('=')[1]);
  assert.ok(!saved.password_hash.includes('PikePike2026!'));
  assert.equal((await send('POST', '/api/auth/logout', cookie, {})).statusCode, 200);
  assert.equal((await send('GET', '/api/auth/me', cookie)).statusCode, 401);
});

test('wrong credentials are uniform; fifth failure locks for exactly 15 minutes', async () => {
  const unknown = await send('POST', '/api/auth/login', null, { username: 'unknown', password: 'bad' });
  for (let i = 0; i < 4; i++) {
    const response = await send('POST', '/api/auth/login', null, { username: 'student@pikepike.vn', password: 'bad' });
    assert.equal(response.statusCode, 401);
    assert.equal(response.json().message, unknown.json().message);
  }
  assert.equal((await send('POST', '/api/auth/login', null, { username: 'student@pikepike.vn', password: 'bad' })).statusCode, 423);
  now = new Date(now.getTime() + 899000);
  assert.equal((await send('POST', '/api/auth/login', null, { username: 'student@pikepike.vn', password: 'PikePike2026!' })).statusCode, 423);
  now = new Date(now.getTime() + 1000);
  await login();
});

test('new login revokes previous device; idle timeout is sliding and expires at 30 minutes', async () => {
  const first = await login();
  const second = await login();
  assert.equal((await send('GET', '/api/auth/me', first)).statusCode, 401);
  now = new Date(now.getTime() + 1799000);
  assert.equal((await send('GET', '/api/auth/me', second)).statusCode, 200);
  now = new Date(now.getTime() + 1800000);
  assert.equal((await send('GET', '/api/auth/me', second)).statusCode, 401);
});

test('two concurrent logins keep only one valid session', async () => {
  const cookies = await Promise.all([login(), login()]);
  const results = await Promise.all(cookies.map(cookie => send('GET', '/api/auth/me', cookie)));
  assert.deepEqual(results.map(r => r.statusCode).sort(), [200, 401]);
});

test('reserve and cancel persist across app restart, preserve source parking and release destination', async () => {
  const cookie = await login();
  const created = await book(cookie);
  assert.equal(created.statusCode, 201, created.body);
  const id = created.json().id;
  assert.equal(Date.parse(created.json().expires_at) - now.getTime(), 900000);
  assert.equal((await scalar("SELECT status FROM vehicles WHERE id='PK-1'")).status, 'DA_DAT');
  assert.equal((await scalar("SELECT status FROM spots WHERE vehicle_id='PK-1'")).status, 'OCCUPIED');
  await app.close();
  app = await createApp({ pool, clock: () => now });
  assert.equal((await send('GET', '/api/me/reservations', cookie)).json()[0].id, id);
  assert.equal((await send('POST', `/api/reservations/${id}/cancel`, cookie, {})).statusCode, 200);
  assert.equal((await scalar("SELECT status FROM vehicles WHERE id='PK-1'")).status, 'SAN_SANG');
  assert.equal((await scalar('SELECT status FROM spots WHERE id=$1', [created.json().destination_spot_id])).status, 'EMPTY');
  assert.equal((await scalar('SELECT count(*)::int AS n FROM no_shows')).n, 0);
});

test('two users racing for one vehicle produce exactly one commit', async () => {
  const cookies = await Promise.all([login(), login('student2@pikepike.vn')]);
  const responses = await Promise.all(cookies.map(cookie => book(cookie)));
  assert.deepEqual(responses.map(r => r.statusCode).sort(), [201, 409]);
  assert.equal((await scalar('SELECT count(*)::int AS n FROM reservations')).n, 1);
  assert.equal((await scalar("SELECT count(*)::int AS n FROM spots WHERE status='RESERVED'")).n, 1);
});

test('same user cannot reserve two vehicles concurrently', async () => {
  const cookie = await login();
  const responses = await Promise.all([book(cookie, 'PK-1'), book(cookie, 'PK-2')]);
  assert.deepEqual(responses.map(r => r.statusCode).sort(), [201, 409]);
});

test('hub allocation serializes the occupancy check at the 95 percent boundary', async () => {
  await pool.query("UPDATE spots SET status='RESERVED' WHERE hub_id='ktx' AND id NOT IN ('ktx-19','ktx-20')");
  const first = await login();
  const second = await login('student2@pikepike.vn');
  const results = await Promise.all([book(first, 'PK-1'), book(second, 'PK-2')]);
  assert.deepEqual(results.map(r => r.statusCode).sort(), [201, 409]);
  assert.equal(results.find(r => r.statusCode === 409).json().code, 'HUB_OVERLOAD_95');
  assert.equal((await scalar("SELECT count(*)::int AS n FROM spots WHERE hub_id='ktx' AND status='EMPTY'")).n, 1);
});

test('low battery warnings and minimum rental battery are enforced on the server', async () => {
  const cookie = await login();
  const vehicles = (await send('GET', '/api/hubs/metro/vehicles', cookie)).json();
  assert.equal(vehicles.find(v => v.id === 'PK-3').lowBattery, true);
  assert.equal((await book(cookie, 'PK-4')).statusCode, 409);
  assert.equal((await book(cookie, 'PK-3')).statusCode, 201);
});

test('owner, session, role and CSRF checks prevent unauthorized mutations', async () => {
  assert.equal((await book(null)).statusCode, 401);
  const cookie = await login();
  const other = await login('student2@pikepike.vn');
  const admin = await login('admin@pikepike.vn');
  const created = await book(cookie);
  assert.equal((await send('POST', `/api/reservations/${created.json().id}/cancel`, other, {})).statusCode, 404);
  assert.equal((await send('GET', '/api/me/reservations', other)).json().length, 0);
  assert.equal((await book(admin, 'PK-2')).statusCode, 403);
  assert.equal((await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } })).statusCode, 403);
  const forged = await send('POST', '/api/reservations/shared', other, { vehicleId: 'PK-2', userId: created.json().user_id });
  assert.equal(forged.statusCode, 201);
  assert.notEqual(forged.json().user_id, created.json().user_id);
});

test('injected errors rollback resource changes and successful audits for reserve and cancel', async () => {
  const cookie = await login();
  failAt = 'reserve';
  assert.equal((await book(cookie)).statusCode, 500);
  assert.equal((await scalar("SELECT status FROM vehicles WHERE id='PK-1'")).status, 'SAN_SANG');
  assert.equal((await scalar("SELECT count(*)::int AS n FROM spots WHERE status='RESERVED'")).n, 0);
  assert.equal((await scalar("SELECT count(*)::int AS n FROM audit_logs WHERE action='RESERVATION_CREATED'")).n, 0);
  failAt = null;
  const created = await book(cookie);
  failAt = 'release';
  assert.equal((await send('POST', `/api/reservations/${created.json().id}/cancel`, cookie, {})).statusCode, 500);
  assert.equal((await scalar("SELECT status FROM vehicles WHERE id='PK-1'")).status, 'DA_DAT');
  assert.equal((await scalar('SELECT status FROM reservations WHERE id=$1', [created.json().id])).status, 'DA_XAC_NHAN');
  assert.equal((await scalar("SELECT count(*)::int AS n FROM audit_logs WHERE action='RESERVATION_CANCELLED'")).n, 0);
});

test('expiry boundary, repeat scans, two no-shows and midnight preserve a 24-hour booking lock', async () => {
  let cookie = await login();
  assert.equal((await book(cookie)).statusCode, 201);
  now = new Date(now.getTime() + 899000);
  await app.service.expire();
  assert.equal((await scalar('SELECT count(*)::int AS n FROM no_shows')).n, 0);
  now = new Date(now.getTime() + 1000);
  await Promise.all([app.service.expire(), app.service.expire()]);
  assert.equal((await scalar('SELECT count(*)::int AS n FROM no_shows')).n, 1);
  assert.equal((await book(cookie)).statusCode, 201);
  now = new Date(now.getTime() + 900000);
  await app.service.expire();
  await app.service.expire();
  assert.equal((await scalar('SELECT count(*)::int AS n FROM no_shows')).n, 2);
  const lockedUntil = (await scalar("SELECT booking_locked_until FROM users WHERE username='student@pikepike.vn'")).booking_locked_until;
  assert.equal(lockedUntil.getTime() - now.getTime(), 86400000);
  now = new Date('2026-11-19T17:01:00Z');
  cookie = await login();
  assert.equal((await book(cookie)).statusCode, 423);
  now = lockedUntil;
  cookie = await login();
  assert.equal((await book(cookie)).statusCode, 201);
});

test('cancel at expiry and scheduler race release exactly once and record one no-show', async () => {
  const cookie = await login();
  const created = await book(cookie);
  now = new Date(now.getTime() + 900000);
  const [cancelled] = await Promise.all([send('POST', `/api/reservations/${created.json().id}/cancel`, cookie, {}), app.service.expire()]);
  assert.equal(cancelled.statusCode, 409);
  assert.equal((await scalar('SELECT count(*)::int AS n FROM no_shows')).n, 1);
  assert.equal((await scalar("SELECT count(*)::int AS n FROM audit_logs WHERE action='RESERVATION_EXPIRED'")).n, 1);
});

test('invalid IDs and SQL-like input do not mutate data; disabled users lose access', async () => {
  const cookie = await login();
  assert.equal((await book(cookie, "' OR 1=1 --")).statusCode, 404);
  assert.equal((await send('POST', '/api/reservations/invalid/cancel', cookie, {})).statusCode, 400);
  await pool.query("UPDATE users SET active=false WHERE username='student@pikepike.vn'");
  assert.equal((await send('GET', '/api/auth/me', cookie)).statusCode, 401);
  assert.equal((await send('POST', '/api/auth/login', null, { username: 'student@pikepike.vn', password: 'PikePike2026!' })).statusCode, 403);
});

test('seed is repeatable and preserves existing bookings', async () => {
  const cookie = await login();
  const created = await book(cookie);
  await seed(pool);
  assert.equal((await scalar('SELECT status FROM reservations WHERE id=$1', [created.json().id])).status, 'DA_XAC_NHAN');
  assert.equal((await scalar("SELECT status FROM vehicles WHERE id='PK-1'")).status, 'DA_DAT');
});
