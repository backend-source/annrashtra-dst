// End-to-end smoke test against a running server. Exercises the real DB.
//   node scripts/e2e-test.js <serverLogPath>
// Reads the dev OTP from the server log (msg91 dev adapter prints it).
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const BASE = 'http://localhost:8080';
const LOG = process.argv[2];
const MOBILE = '9999000001';
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

// ---- look up ids we need from the DB ----
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
const product = (await db.query(`SELECT id, price FROM products WHERE sku = 'KF-800'`)).rows[0];
const customer = (await db.query(`SELECT id FROM customers WHERE mobile = '8888000001'`)).rows[0];

// ---- 1. OTP request ----
const reqOtp = await post('/api/auth/otp/request', { mobile: MOBILE });
assert('otp/request returns 200', reqOtp.status === 200, JSON.stringify(reqOtp.body));

// ---- read the dev OTP from the server log ----
let code = null;
for (let i = 0; i < 20 && !code; i++) {
  const log = fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8') : '';
  const m = [...log.matchAll(/OTP (\d{6}) -> 9999000001/g)].pop();
  if (m) code = m[1];
  else await sleep(250);
}
assert('captured dev OTP from log', !!code, code ? `(${code})` : '(none)');

// ---- 2. OTP verify -> token ----
const verify = await post('/api/auth/otp/verify', { mobile: MOBILE, code });
assert('otp/verify returns token', verify.status === 200 && !!verify.body.token, `role=${verify.body?.user?.role}`);
const token = verify.body.token;

// ---- 3. lead capture (idempotent) ----
const leadUuid = randomUUID();
const leadMobile = '7777' + String(Date.now()).slice(-6);
const lead1 = await post('/api/leads', { client_uuid: leadUuid, mobile: leadMobile, name: 'Lead A', health_concern: 'diabetes' }, token);
assert('lead create 201 unverified', lead1.status === 201 && lead1.body.verify_status === 'unverified', `status=${lead1.status}`);
assert('lead scoped to promoter', lead1.body.promoter_id === verify.body.user.id);

const lead2 = await post('/api/leads', { client_uuid: leadUuid, mobile: leadMobile, name: 'Lead A' }, token);
assert('lead replay is idempotent (same id)', lead2.body.id === lead1.body.id, `id=${lead2.body.id}`);

const lead3 = await post('/api/leads', { client_uuid: randomUUID(), mobile: leadMobile }, token);
assert('duplicate mobile blocked (409)', lead3.status === 409, `status=${lead3.status}`);

// ---- 4. sale (server-side pricing, idempotent) ----
const saleUuid = randomUUID();
const sale1 = await post('/api/sales', {
  client_uuid: saleUuid, payment_mode: 'cash', customer_id: customer.id,
  items: [{ product_id: product.id, qty: 2 }],
}, token);
const expectedTotal = Number(product.price) * 2;
assert('sale create 201', sale1.status === 201, `status=${sale1.status}`);
assert('sale total computed server-side', Number(sale1.body.total) === expectedTotal, `got ${sale1.body.total}, expected ${expectedTotal}`);

const sale2 = await post('/api/sales', {
  client_uuid: saleUuid, payment_mode: 'cash', customer_id: customer.id,
  items: [{ product_id: product.id, qty: 2 }],
}, token);
assert('sale replay idempotent (200, same id)', sale2.status === 200 && sale2.body.id === sale1.body.id, `status=${sale2.status}`);

// ---- 5. side effects in DB ----
const inv = (await db.query(`SELECT sold, closing FROM inventory WHERE product_id = $1 AND day = current_date`, [product.id])).rows[0];
assert('inventory.sold incremented once (=2)', inv && inv.sold === 2, `sold=${inv?.sold}`);
const stx = (await db.query(`SELECT count(*)::int n, coalesce(sum(quantity),0)::int q FROM stock_transactions WHERE reference_id = $1`, [sale1.body.id])).rows[0];
assert('one stock_deduction of -2', stx.n === 1 && stx.q === -2, `n=${stx.n} q=${stx.q}`);
const ob = (await db.query(`SELECT count(*)::int n FROM outbox_messages WHERE sale_id = $1`, [sale1.body.id])).rows[0];
assert('one invoice queued in outbox', ob.n === 1, `n=${ob.n}`);

await db.end();
console.log('\n' + results.join('\n'));
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length}/${results.length} passed`);
