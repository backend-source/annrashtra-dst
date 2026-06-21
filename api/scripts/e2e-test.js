// End-to-end smoke test against a running server. Exercises the real DB.
//   node scripts/e2e-test.js <serverLogPath>
// Reads the dev OTP from the server log (msg91 dev adapter prints it).
// Re-runnable: clears this promoter's data for the day before asserting.
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const BASE = 'http://localhost:8080';
const LOG = process.argv[2];
const PROMOTER = '9999000001';
const SUPERVISOR = '9999000002';
const results = [];
const assert = (name, cond, extra = '') => {
  results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!cond) process.exitCode = 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(path, body, token) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

// OTP login: request -> read dev OTP from server log -> verify -> token.
async function login(mobile) {
  const reqOtp = await post('/api/auth/otp/request', { mobile });
  assert(`otp/request 200 (${mobile})`, reqOtp.status === 200, JSON.stringify(reqOtp.body));
  let code = null;
  for (let i = 0; i < 20 && !code; i++) {
    const log = fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8') : '';
    const m = [...log.matchAll(new RegExp(`OTP (\\d{6}) -> ${mobile}`, 'g'))].pop();
    if (m) code = m[1];
    else await sleep(250);
  }
  assert(`captured dev OTP (${mobile})`, !!code);
  const verify = await post('/api/auth/otp/verify', { mobile, code });
  assert(`otp/verify token (${mobile})`, verify.status === 200 && !!verify.body.token, `role=${verify.body?.user?.role}`);
  return { token: verify.body.token, user: verify.body.user };
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
const product = (await db.query(`SELECT id, price FROM products WHERE sku = 'KF-800'`)).rows[0];
const customer = (await db.query(`SELECT id FROM customers WHERE mobile = '8888000001'`)).rows[0];
const loc = (await db.query(`SELECT id, lat, lng, radius_m FROM locations WHERE name = 'Test Park'`)).rows[0];
const supervisorRow = (await db.query(`SELECT id FROM users WHERE mobile = $1`, [SUPERVISOR])).rows[0];

// ---- auth ----
const { token, user } = await login(PROMOTER);
const pid = user.id;

// ---- make the run repeatable: clear this promoter's data for today ----
await db.query(`DELETE FROM outbox_messages WHERE sale_id IN (SELECT id FROM sales WHERE promoter_id=$1) OR lead_id IN (SELECT id FROM leads WHERE promoter_id=$1)`, [pid]);
await db.query(`DELETE FROM stock_transactions WHERE promoter_id=$1`, [pid]);
await db.query(`DELETE FROM promoter_points WHERE promoter_id=$1`, [pid]);
await db.query(`DELETE FROM sales WHERE promoter_id=$1`, [pid]);
await db.query(`DELETE FROM leads WHERE promoter_id=$1`, [pid]);
await db.query(`DELETE FROM attendance WHERE promoter_id=$1`, [pid]);
await db.query(`DELETE FROM inventory WHERE promoter_id=$1`, [pid]);

// ---- leads ----
const leadUuid = randomUUID();
const leadMobile = '7777' + String(Date.now()).slice(-6);
const lead1 = await post('/api/leads', { client_uuid: leadUuid, mobile: leadMobile, name: 'Lead A', health_concern: 'diabetes' }, token);
assert('lead create 201 unverified', lead1.status === 201 && lead1.body.verify_status === 'unverified', `status=${lead1.status}`);
assert('lead scoped to promoter', lead1.body.promoter_id === pid);
const lead2 = await post('/api/leads', { client_uuid: leadUuid, mobile: leadMobile, name: 'Lead A' }, token);
assert('lead replay idempotent (same id)', lead2.body.id === lead1.body.id);
const lead3 = await post('/api/leads', { client_uuid: randomUUID(), mobile: leadMobile }, token);
assert('duplicate mobile blocked (409)', lead3.status === 409, `status=${lead3.status}`);

// ---- sales ----
const saleUuid = randomUUID();
const sale1 = await post('/api/sales', { client_uuid: saleUuid, payment_mode: 'cash', customer_id: customer.id, items: [{ product_id: product.id, qty: 2 }] }, token);
const expectedTotal = Number(product.price) * 2;
assert('sale create 201', sale1.status === 201, `status=${sale1.status}`);
assert('sale total computed server-side', Number(sale1.body.total) === expectedTotal, `got ${sale1.body.total}, expected ${expectedTotal}`);
const sale2 = await post('/api/sales', { client_uuid: saleUuid, payment_mode: 'cash', customer_id: customer.id, items: [{ product_id: product.id, qty: 2 }] }, token);
assert('sale replay idempotent (200, same id)', sale2.status === 200 && sale2.body.id === sale1.body.id, `status=${sale2.status}`);
const inv = (await db.query(`SELECT sold FROM inventory WHERE promoter_id=$1 AND product_id=$2 AND day=current_date`, [pid, product.id])).rows[0];
assert('inventory.sold incremented once (=2)', inv && inv.sold === 2, `sold=${inv?.sold}`);
const stx = (await db.query(`SELECT count(*)::int n, coalesce(sum(quantity),0)::int q FROM stock_transactions WHERE reference_id=$1`, [sale1.body.id])).rows[0];
assert('one stock_deduction of -2', stx.n === 1 && stx.q === -2, `n=${stx.n} q=${stx.q}`);
const ob = (await db.query(`SELECT count(*)::int n FROM outbox_messages WHERE sale_id=$1`, [sale1.body.id])).rows[0];
assert('one invoice queued in outbox', ob.n === 1, `n=${ob.n}`);

// ---- attendance (territory lock, idempotency, override, verify) ----
const near = { gps_lat: loc.lat, gps_lng: loc.lng };
const far = { gps_lat: Number(loc.lat) + 0.02, gps_lng: Number(loc.lng) }; // ~2.2 km north
const selfie = 'https://storage/selfie.jpg';

// in-radius morning check-in
const ciUuid = randomUUID();
const ci = await post('/api/attendance/check-in', { client_uuid: ciUuid, location_id: loc.id, shift: 'morning', selfie_url: selfie, ...near }, token);
assert('check-in 201 in_radius=true', ci.status === 201 && ci.body.in_radius === true, `status=${ci.status} dist=${ci.body.distance_m}m`);
const ciReplay = await post('/api/attendance/check-in', { client_uuid: ciUuid, location_id: loc.id, shift: 'morning', selfie_url: selfie, ...near }, token);
assert('check-in replay idempotent (same id)', ciReplay.body.id === ci.body.id);

// out-of-radius, no override -> 403 (territory check runs before the daily-unique)
const terr = await post('/api/attendance/check-in', { client_uuid: randomUUID(), location_id: loc.id, shift: 'morning', selfie_url: selfie, ...far }, token);
assert('out-of-radius blocked (403)', terr.status === 403, `status=${terr.status}`);

// in-radius again, new uuid, same shift/day -> 409 already checked in
const dup = await post('/api/attendance/check-in', { client_uuid: randomUUID(), location_id: loc.id, shift: 'morning', selfie_url: selfie, ...near }, token);
assert('second check-in same shift (409)', dup.status === 409, `status=${dup.status}`);

// evening, out-of-radius, WITH supervisor override -> 201 in_radius=false
const ov = await post('/api/attendance/check-in', { client_uuid: randomUUID(), location_id: loc.id, shift: 'evening', selfie_url: selfie, ...far, override_by: supervisorRow.id, override_reason: 'rain shifted canopy' }, token);
assert('override check-in 201 in_radius=false', ov.status === 201 && ov.body.in_radius === false && ov.body.override_by === supervisorRow.id, `status=${ov.status} in_radius=${ov.body.in_radius}`);

// check-out (idempotent)
const co = await post(`/api/attendance/${ci.body.id}/check-out`, {}, token);
assert('check-out sets check_out_at', co.status === 200 && !!co.body.check_out_at);
const co2 = await post(`/api/attendance/${ci.body.id}/check-out`, {}, token);
assert('check-out idempotent (same time)', co2.body.check_out_at === co.body.check_out_at);

// role gate: promoter cannot verify; supervisor can
const badVerify = await post(`/api/attendance/${ci.body.id}/verify`, {}, token);
assert('promoter verify forbidden (403)', badVerify.status === 403, `status=${badVerify.status}`);
const sup = await login(SUPERVISOR);
const ok = await post(`/api/attendance/${ci.body.id}/verify`, {}, sup.token);
assert('supervisor verify sets verified_by', ok.status === 200 && ok.body.verified_by === sup.user.id, `status=${ok.status}`);

await db.end();
console.log('\n' + results.join('\n'));
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length}/${results.length} passed`);
