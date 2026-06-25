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
const ADMIN = '9999000003';
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

async function get(path, token) {
  const res = await fetch(BASE + path, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function patch(path, body, token) {
  const res = await fetch(BASE + path, {
    method: 'PATCH',
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
const product2 = (await db.query(`SELECT id, price FROM products WHERE sku = 'KF-4000'`)).rows[0];
const customer = (await db.query(`SELECT id FROM customers WHERE mobile = '8888000001'`)).rows[0];
const loc = (await db.query(`SELECT id, lat, lng, radius_m FROM locations WHERE name = 'Test Park'`)).rows[0];
const supervisorRow = (await db.query(`SELECT id FROM users WHERE mobile = $1`, [SUPERVISOR])).rows[0];

// reset the OTP rate-limit window for the test mobiles so the suite is re-runnable
await db.query(`DELETE FROM otp_verifications WHERE mobile IN ($1,$2,$3)`, [PROMOTER, SUPERVISOR, ADMIN]);

// ---- auth ----
// With OTP enabled (default), /api/auth/login signals the app to use OTP.
const loginProbe = await post('/api/auth/login', { mobile: PROMOTER });
assert('login signals OTP required when enabled', loginProbe.status === 200 && loginProbe.body.otpRequired === true, JSON.stringify(loginProbe.body));
const { token, user } = await login(PROMOTER);
const pid = user.id;

// ---- make the run repeatable: clear this promoter's data for today ----
await db.query(`DELETE FROM outbox_messages WHERE sale_id IN (SELECT id FROM sales WHERE promoter_id=$1) OR lead_id IN (SELECT id FROM leads WHERE promoter_id=$1) OR dedupe_key LIKE 'testfail:%'`, [pid]);
await db.query(`DELETE FROM refill_requests WHERE promoter_id=$1`, [pid]);
await db.query(`DELETE FROM stock_transactions WHERE promoter_id=$1`, [pid]);
await db.query(`DELETE FROM promoter_points WHERE promoter_id=$1`, [pid]);
await db.query(`DELETE FROM sales WHERE promoter_id=$1`, [pid]);
await db.query(`DELETE FROM leads WHERE promoter_id=$1`, [pid]);
await db.query(`DELETE FROM attendance WHERE promoter_id=$1`, [pid]);
await db.query(`DELETE FROM inventory WHERE promoter_id=$1`, [pid]);
await db.query(`DELETE FROM collections WHERE promoter_id=$1`, [pid]);
await db.query(`DELETE FROM locations WHERE name='E2E Spot'`);
// seed a "yesterday" KF-800 row (closing 30) to verify stock rollover -> today's opening
await db.query(`INSERT INTO inventory (promoter_id, product_id, opening, sold, day) VALUES ($1,$2,30,0,current_date - 1)`, [pid, product.id]);

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

// validation: sale needs customer name + 10-digit mobile (no customer_id)
const badSale1 = await post('/api/sales', { client_uuid: randomUUID(), payment_mode: 'cash', items: [{ product_id: product.id, qty: 1 }] }, token);
assert('sale without customer rejected (400)', badSale1.status === 400, `status=${badSale1.status}`);
const badSale2 = await post('/api/sales', { client_uuid: randomUUID(), payment_mode: 'cash', customer_name: 'X', customer_mobile: '12345', items: [{ product_id: product.id, qty: 1 }] }, token);
assert('sale with bad mobile rejected (400)', badSale2.status === 400, `status=${badSale2.status}`);
const badLead = await post('/api/leads', { client_uuid: randomUUID(), mobile: '12345', name: 'X' }, token);
assert('lead with bad mobile rejected (400)', badLead.status === 400, `status=${badLead.status}`);

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

// in-radius again, new uuid, same shift/day -> 409 already checked in
const dup = await post('/api/attendance/check-in', { client_uuid: randomUUID(), location_id: loc.id, shift: 'morning', selfie_url: selfie, ...near }, token);
assert('second check-in same shift (409)', dup.status === 409, `status=${dup.status}`);

// evening, out-of-geofence -> saved & FLAGGED, not blocked (soft geofence)
const ov = await post('/api/attendance/check-in', { client_uuid: randomUUID(), location_id: loc.id, shift: 'evening', selfie_url: selfie, ...far }, token);
assert('out-of-geofence saved & flagged (201, in_radius=false)', ov.status === 201 && ov.body.in_radius === false, `status=${ov.status} in_radius=${ov.body.in_radius}`);

// check-out (idempotent)
const co = await post(`/api/attendance/${ci.body.id}/check-out`, {}, token);
assert('check-out sets check_out_at', co.status === 200 && !!co.body.check_out_at);
const co2 = await post(`/api/attendance/${ci.body.id}/check-out`, {}, token);
assert('check-out idempotent (same time)', co2.body.check_out_at === co.body.check_out_at);

// role gate: promoter cannot verify; supervisor can
const badVerify = await post(`/api/attendance/${ci.body.id}/verify`, {}, token);
assert('promoter verify forbidden (403)', badVerify.status === 403, `status=${badVerify.status}`);
const sup = await login(SUPERVISOR);
const attList = await get('/api/attendance', sup.token);
assert('supervisor attendance list includes check-in', Array.isArray(attList.body) && attList.body.some((a) => a.id === ci.body.id), `n=${attList.body?.length}`);
const attForbidden = await get('/api/attendance', token);
assert('promoter cannot list attendance (403)', attForbidden.status === 403, `status=${attForbidden.status}`);
const ok = await post(`/api/attendance/${ci.body.id}/verify`, {}, sup.token);
assert('supervisor verify sets verified_by', ok.status === 200 && ok.body.verified_by === sup.user.id, `status=${ok.status}`);

// override a flagged out-of-geofence check-in (with a reason); promoter cannot
const ovrBad = await post(`/api/attendance/${ov.body.id}/override`, { reason: 'nope' }, token);
assert('promoter cannot override (403)', ovrBad.status === 403, `status=${ovrBad.status}`);
const ovrNoReason = await post(`/api/attendance/${ov.body.id}/override`, {}, sup.token);
assert('override requires a reason (400)', ovrNoReason.status === 400, `status=${ovrNoReason.status}`);
const ovr = await post(`/api/attendance/${ov.body.id}/override`, { reason: 'rain shifted canopy' }, sup.token);
assert('supervisor override sets override_by + reason', ovr.status === 200 && ovr.body.override_by === sup.user.id && ovr.body.override_reason === 'rain shifted canopy', `status=${ovr.status}`);

// ---- inventory: admin sets opening, daily cycle, refill request + approve/reject ----
const admin = await login(ADMIN);
const openForbidden = await post('/api/inventory/opening', { product_id: product2.id, qty: 50, promoter_id: pid }, token);
assert('promoter cannot set opening (403)', openForbidden.status === 403, `status=${openForbidden.status}`);
const openUuid = randomUUID();
const open1 = await post('/api/inventory/opening', { client_uuid: openUuid, product_id: product2.id, qty: 50, promoter_id: pid }, admin.token);
assert('admin sets opening=50', open1.status === 201 && open1.body.opening === 50, `status=${open1.status} opening=${open1.body.opening}`);
const open2 = await post('/api/inventory/opening', { client_uuid: openUuid, product_id: product2.id, qty: 50, promoter_id: pid }, admin.token);
assert('opening replay idempotent (still 50)', open2.body.opening === 50, `opening=${open2.body.opening}`);

const cyc = await get('/api/inventory', token);
const row1 = cyc.body.find((r) => r.product_id === product2.id);
assert('daily cycle lists opening=50', !!row1 && row1.opening === 50, `opening=${row1?.opening}`);

// stock rollover: KF-800 had a yesterday closing of 30 -> today's opening = 30;
// the earlier sale sold 2, so closing = 30 + 0 - 2 = 28.
const kf800 = cyc.body.find((r) => r.product_id === product.id);
assert('rollover: today opening = yesterday closing (30)', !!kf800 && kf800.opening === 30, `opening=${kf800?.opening}`);
assert('rollover: closing = opening - sold (28)', !!kf800 && kf800.closing === 28, `closing=${kf800?.closing}`);

// promoter requests refill; ONLY admin approves; promoter confirms actual delivery
// (admin logged in earlier, before the inventory section)
const rrUuid = randomUUID();
const rr = await post('/api/inventory/refill-requests', { client_uuid: rrUuid, product_id: product2.id, qty: 20 }, token);
assert('refill request 201 pending', rr.status === 201 && rr.body.status === 'pending', `status=${rr.status}`);
const rrReplay = await post('/api/inventory/refill-requests', { client_uuid: rrUuid, product_id: product2.id, qty: 20 }, token);
assert('refill request replay (same id)', rrReplay.body.id === rr.body.id);

// only admin can approve
const promoApprove = await post(`/api/inventory/refill-requests/${rr.body.id}/approve`, {}, token);
assert('promoter approve forbidden (403)', promoApprove.status === 403, `status=${promoApprove.status}`);
const supApprove = await post(`/api/inventory/refill-requests/${rr.body.id}/approve`, {}, sup.token);
assert('supervisor approve forbidden (403)', supApprove.status === 403, `status=${supApprove.status}`);
const appr = await post(`/api/inventory/refill-requests/${rr.body.id}/approve`, {}, admin.token);
assert('admin approve -> approved', appr.status === 200 && appr.body.status === 'approved' && appr.body.decided_by === admin.user.id, `status=${appr.status}`);

// approval does NOT add stock yet
const cycA = await get('/api/inventory', token);
const rowA = cycA.body.find((r) => r.product_id === product2.id);
assert('approve does not bump refill yet', !!rowA && rowA.refill === 0, `refill=${rowA?.refill}`);

// promoter confirms delivery with the ACTUAL qty 18 (differs from requested 20)
const conf = await post(`/api/inventory/refill-requests/${rr.body.id}/confirm`, { delivered_qty: 18 }, token);
assert('promoter confirm -> delivered (actual 18)', conf.status === 200 && conf.body.status === 'delivered' && conf.body.delivered_qty === 18, `status=${conf.status}`);
const confReplay = await post(`/api/inventory/refill-requests/${rr.body.id}/confirm`, { delivered_qty: 18 }, token);
assert('confirm idempotent (same stock_txn)', confReplay.body.stock_txn_id === conf.body.stock_txn_id);

const cyc2 = await get('/api/inventory', token);
const row2 = cyc2.body.find((r) => r.product_id === product2.id);
assert('inventory.refill bumped by delivered (18)', !!row2 && row2.refill === 18, `refill=${row2?.refill}`);
assert('closing = opening+refill-sold (68)', !!row2 && row2.closing === 68, `closing=${row2?.closing}`);

const rtx = (await db.query(`SELECT type, quantity, approved_by FROM stock_transactions WHERE id=$1`, [conf.body.stock_txn_id])).rows[0];
assert('refill ledger row +18, approved_by admin', !!rtx && rtx.type === 'refill' && rtx.quantity === 18 && rtx.approved_by === admin.user.id);

// reject path (admin only)
const rr3 = await post('/api/inventory/refill-requests', { client_uuid: randomUUID(), product_id: product2.id, qty: 5 }, token);
const rej = await post(`/api/inventory/refill-requests/${rr3.body.id}/reject`, { note: 'not needed' }, admin.token);
assert('admin reject -> rejected', rej.status === 200 && rej.body.status === 'rejected', `status=${rej.status}`);
const apprRej = await post(`/api/inventory/refill-requests/${rr3.body.id}/approve`, {}, admin.token);
assert('approve after reject -> 409', apprRej.status === 409, `status=${apprRej.status}`);

// ---- (a) lead verify/convert -> points, audit_log, products pricing ----
// supervisor verifies the lead -> awards lead_verified (10), idempotent
const vLead = await patch(`/api/leads/${lead1.body.id}/state`, { verify_status: 'whatsapp_confirmed' }, sup.token);
assert('lead verify -> whatsapp_confirmed', vLead.status === 200 && vLead.body.verify_status === 'whatsapp_confirmed', `status=${vLead.status}`);
const pVer = (await db.query(`SELECT points FROM promoter_points WHERE lead_id=$1 AND reason='lead_verified'`, [lead1.body.id])).rows;
assert('points awarded for verify (10)', pVer.length === 1 && pVer[0].points === 10, `rows=${pVer.length}`);
await patch(`/api/leads/${lead1.body.id}/state`, { verify_status: 'whatsapp_confirmed' }, sup.token);
const pVer2 = (await db.query(`SELECT count(*)::int n FROM promoter_points WHERE lead_id=$1 AND reason='lead_verified'`, [lead1.body.id])).rows[0];
assert('verify idempotent (no double points)', pVer2.n === 1, `n=${pVer2.n}`);

// convert -> awards lead_converted (25)
const cLead = await patch(`/api/leads/${lead1.body.id}/state`, { status: 'converted' }, sup.token);
assert('lead convert -> converted', cLead.status === 200 && cLead.body.status === 'converted', `status=${cLead.status}`);
const pConv = (await db.query(`SELECT points FROM promoter_points WHERE lead_id=$1 AND reason='lead_converted'`, [lead1.body.id])).rows;
assert('points awarded for convert (25)', pConv.length === 1 && pConv[0].points === 25, `rows=${pConv.length}`);

// promoter cannot change lead state
const badState = await patch(`/api/leads/${lead1.body.id}/state`, { status: 'dropped' }, token);
assert('promoter lead-state forbidden (403)', badState.status === 403, `status=${badState.status}`);

// audit_log captured the writes (durable: middleware awaits before responding)
const auLead = (await db.query(`SELECT count(*)::int n FROM audit_log WHERE entity='leads' AND entity_id=$1`, [lead1.body.id])).rows[0];
assert('audit_log has lead writes', auLead.n >= 1, `n=${auLead.n}`);
const auSale = (await db.query(`SELECT count(*)::int n FROM audit_log WHERE entity='sales' AND entity_id=$1`, [sale1.body.id])).rows[0];
assert('audit_log has sale write', auSale.n >= 1, `n=${auSale.n}`);

// products: list (any role) + admin-only price edit (admin logged in above)
const prods = await get('/api/products', admin.token);
assert('products list returns 2', Array.isArray(prods.body) && prods.body.length === 2, `len=${prods.body?.length}`);
const priceEdit = await patch(`/api/products/${product2.id}`, { price: 799 }, admin.token);
assert('admin edits price -> 799', priceEdit.status === 200 && Number(priceEdit.body.price) === 799, `status=${priceEdit.status}`);
const badPrice = await patch(`/api/products/${product2.id}`, { price: 999 }, token);
assert('promoter price edit forbidden (403)', badPrice.status === 403, `status=${badPrice.status}`);
await patch(`/api/products/${product2.id}`, { price: 750 }, admin.token); // restore

// promoter's assigned locations (used by the mobile attendance screen)
const locs = await get('/api/locations', token);
assert('promoter locations list includes Test Park', Array.isArray(locs.body) && locs.body.some((l) => l.id === loc.id), `n=${locs.body?.length}`);

// promoter proposes a spot from GPS -> pending with the auto 150m geofence
const propose = await post('/api/locations/propose', { name: 'E2E Spot', lat: 19.2, lng: 72.9 }, token);
assert('promoter proposes spot (pending, 150m)', propose.status === 201 && propose.body.status === 'pending' && Number(propose.body.radius_m) === 150, `status=${propose.status} r=${propose.body?.radius_m}`);
// check-in at a not-yet-confirmed spot is rejected
const ciPend = await post('/api/attendance/check-in', { client_uuid: randomUUID(), location_id: propose.body.id, shift: 'evening', selfie_url: selfie, gps_lat: 19.2, gps_lng: 72.9 }, token);
assert('check-in at pending spot rejected (409)', ciPend.status === 409, `status=${ciPend.status}`);
// only a promoter can propose
const adminPropose = await post('/api/locations/propose', { lat: 1, lng: 1 }, admin.token);
assert('non-promoter cannot propose (403)', adminPropose.status === 403, `status=${adminPropose.status}`);
// supervisor confirms -> active
const confirmLoc = await post(`/api/locations/${propose.body.id}/confirm`, {}, sup.token);
assert('supervisor confirms spot -> active', confirmLoc.status === 200 && confirmLoc.body.status === 'active' && confirmLoc.body.confirmed_by === sup.user.id, `status=${confirmLoc.status}`);
const editLoc = await patch(`/api/locations/${propose.body.id}`, { radius_m: 120 }, admin.token);
assert('admin edits location radius', editLoc.status === 200 && editLoc.body.radius_m === 120, `r=${editLoc.body?.radius_m}`);
const usersList = await get('/api/users?role=promoter', admin.token);
assert('admin lists promoters', Array.isArray(usersList.body) && usersList.body.length >= 1, `n=${usersList.body?.length}`);
const usersForbidden = await get('/api/users?role=promoter', token);
assert('promoter cannot list users (403)', usersForbidden.status === 403, `status=${usersForbidden.status}`);

// ---- collections (cash+UPI): promoter submits -> supervisor verifies (edits) -> promoter accepts ----
const colUuid = randomUUID();
const col = await post('/api/collections', { client_uuid: colUuid, amount: 320, upi_amount: 80 }, token);
assert('handover 201 pending', col.status === 201 && col.body.status === 'pending' && Number(col.body.upi_amount) === 80, `status=${col.status}`);
const colReplay = await post('/api/collections', { client_uuid: colUuid, amount: 320, upi_amount: 80 }, token);
assert('handover replay (same id)', colReplay.body.id === col.body.id);
const colDup = await post('/api/collections', { client_uuid: randomUUID(), amount: 100 }, token);
assert('one handover per day (409)', colDup.status === 409, `status=${colDup.status}`);
const colList = await get('/api/collections', token);
assert('promoter sees own handover', Array.isArray(colList.body) && colList.body.some((c) => c.id === col.body.id));
// promoter can't verify; supervisor verifies and edits the cash amount
const colVerByProm = await post(`/api/collections/${col.body.id}/verify`, { amount: 320, upi_amount: 80 }, token);
assert('promoter cannot verify (403)', colVerByProm.status === 403, `status=${colVerByProm.status}`);
const colVerify = await post(`/api/collections/${col.body.id}/verify`, { amount: 300, upi_amount: 80 }, sup.token);
assert('supervisor verify -> verified + edited', colVerify.status === 200 && colVerify.body.status === 'verified' && Number(colVerify.body.amount) === 300 && colVerify.body.confirmed_by === sup.user.id, `status=${colVerify.status} amt=${colVerify.body.amount}`);
// supervisor can't accept (not their handover); promoter accepts -> received
const colSupAccept = await post(`/api/collections/${col.body.id}/accept`, {}, sup.token);
assert('supervisor cannot accept (403)', colSupAccept.status === 403, `status=${colSupAccept.status}`);
const colAccept = await post(`/api/collections/${col.body.id}/accept`, {}, token);
assert('promoter accept -> received', colAccept.status === 200 && colAccept.body.status === 'received', `status=${colAccept.status}`);
const colAccept2 = await post(`/api/collections/${col.body.id}/accept`, {}, token);
assert('accept idempotent (received)', colAccept2.body.status === 'received');
const colExp = await fetch(`${BASE}/api/reports/export/collections?from=2000-01-01&to=2030-01-01`, { headers: { authorization: `Bearer ${admin.token}` } });
const colExpText = await colExp.text();
assert('collections CSV export', colExp.status === 200 && colExpText.startsWith('Promoter,Code,Day,Expected cash'), `status=${colExp.status}`);

// reports overview — role-scoped
const repP = await get('/api/reports/overview', token);
assert('promoter overview (self, no leaderboard)', repP.status === 200 && repP.body.scope === 'promoter' && !!repP.body.kpis && repP.body.leaderboard.length === 0, `scope=${repP.body?.scope}`);
const repS = await get('/api/reports/overview', sup.token);
assert('supervisor overview (team-scoped)', repS.status === 200 && repS.body.scope === 'supervisor' && repS.body.promoters_in_scope >= 1, `inscope=${repS.body?.promoters_in_scope}`);
const repA = await get('/api/reports/overview', admin.token);
assert('admin overview (org-wide, 7-day series)', repA.status === 200 && repA.body.scope === 'admin' && Array.isArray(repA.body.sales_7d) && repA.body.sales_7d.length === 7, `days=${repA.body?.sales_7d?.length}`);

// CSV export (download)
const expRes = await fetch(`${BASE}/api/reports/export/sales?from=2000-01-01&to=2030-01-01`, { headers: { authorization: `Bearer ${admin.token}` } });
const expText = await expRes.text();
assert('admin sales CSV export', expRes.status === 200 && expText.startsWith('Promoter,Code,Invoice,Date'), `status=${expRes.status}`);
const expNoAuth = await fetch(`${BASE}/api/reports/export/sales`);
assert('export requires auth (401)', expNoAuth.status === 401, `status=${expNoAuth.status}`);

// ---- (phase 3) outbox sender: invoice + lead confirmation, retry, idempotency ----
// a fresh unverified lead -> enqueues a 'lead_confirmation' message
const freshUuid = randomUUID();
const freshMobile = '7600' + String(Date.now()).slice(-6);
const fresh = await post('/api/leads', { client_uuid: freshUuid, mobile: freshMobile, name: 'Outbox Lead' }, token);
assert('fresh lead created unverified', fresh.status === 201 && fresh.body.verify_status === 'unverified', `status=${fresh.status}`);
const qLead = (await db.query(`SELECT status FROM outbox_messages WHERE lead_id=$1 AND template='lead_confirmation'`, [fresh.body.id])).rows[0];
assert('lead confirmation queued', !!qLead && qLead.status === 'queued', `status=${qLead?.status}`);

// a message that will fail (sentinel number) to exercise the retry path
await db.query(
  `INSERT INTO outbox_messages (channel, to_mobile, template, dedupe_key) VALUES ('whatsapp','0000000000','sale_invoice',$1)`,
  [`testfail:${freshUuid}`],
);

// admin triggers a processing pass
const proc = await post('/api/outbox/process', {}, admin.token);
assert('outbox process ran', proc.status === 200 && proc.body.processed >= 2, `processed=${proc.body.processed} sent=${proc.body.sent} failed=${proc.body.failed}`);

// invoice (from the earlier sale): sent then auto-delivered (dev), provider id set
const invMsg = (await db.query(`SELECT status, provider_msg_id FROM outbox_messages WHERE sale_id=$1`, [sale1.body.id])).rows[0];
assert('invoice delivered (dev auto)', invMsg.status === 'delivered' && !!invMsg.provider_msg_id, `status=${invMsg.status}`);

// lead confirmation delivered -> lead auto-confirmed + points awarded
const lcMsg = (await db.query(`SELECT status FROM outbox_messages WHERE lead_id=$1 AND template='lead_confirmation'`, [fresh.body.id])).rows[0];
assert('lead confirmation delivered', lcMsg.status === 'delivered', `status=${lcMsg.status}`);
const freshLeadRow = (await db.query(`SELECT verify_status FROM leads WHERE id=$1`, [fresh.body.id])).rows[0];
assert('lead auto-confirmed via whatsapp', freshLeadRow.verify_status === 'whatsapp_confirmed', `verify=${freshLeadRow.verify_status}`);
const freshPts = (await db.query(`SELECT count(*)::int n FROM promoter_points WHERE lead_id=$1 AND reason='lead_verified'`, [fresh.body.id])).rows[0];
assert('worker awarded verify points once', freshPts.n === 1, `n=${freshPts.n}`);

// failure path: sentinel message is 'failed' with an incremented attempt
const failMsg = (await db.query(`SELECT status, attempts FROM outbox_messages WHERE dedupe_key=$1`, [`testfail:${freshUuid}`])).rows[0];
assert('failed message recorded (attempts=1)', failMsg.status === 'failed' && failMsg.attempts === 1, `status=${failMsg.status} attempts=${failMsg.attempts}`);

// idempotent: a second pass does not re-send already-sent messages or double-award
const proc2 = await post('/api/outbox/process', {}, admin.token);
const freshPts2 = (await db.query(`SELECT count(*)::int n FROM promoter_points WHERE lead_id=$1 AND reason='lead_verified'`, [fresh.body.id])).rows[0];
assert('second pass: no double points', freshPts2.n === 1, `n=${freshPts2.n}`);
const failMsg2 = (await db.query(`SELECT attempts FROM outbox_messages WHERE dedupe_key=$1`, [`testfail:${freshUuid}`])).rows[0];
assert('second pass: failed msg retried (attempts=2)', failMsg2.attempts === 2, `attempts=${failMsg2.attempts}`);

// ---- delivery webhook: production-style sent -> delivered -> lead confirmed ----
// A fresh lead whose confirmation we mark 'sent' by hand (simulating a prod worker
// send that awaits the provider callback), then deliver via the webhook.
const wlUuid = randomUUID();
const wlMobile = '7500' + String(Date.now()).slice(-6);
const wlead = await post('/api/leads', { client_uuid: wlUuid, mobile: wlMobile, name: 'Webhook Lead' }, token);
const providerId = `wh-${wlUuid.slice(0, 8)}`;
await db.query(
  `UPDATE outbox_messages SET status='sent', provider_msg_id=$2 WHERE lead_id=$1 AND template='lead_confirmation'`,
  [wlead.body.id, providerId],
);
assert('webhook lead starts unverified', (await db.query(`SELECT verify_status FROM leads WHERE id=$1`, [wlead.body.id])).rows[0].verify_status === 'unverified');

// public webhook (no token)
const wh = await post('/api/outbox/webhook', { provider_msg_id: providerId, status: 'delivered' });
assert('webhook matched', wh.status === 200 && wh.body.matched === true, `status=${wh.status} matched=${wh.body.matched}`);
const wMsg = (await db.query(`SELECT status FROM outbox_messages WHERE provider_msg_id=$1`, [providerId])).rows[0];
assert('webhook -> message delivered', wMsg.status === 'delivered', `status=${wMsg.status}`);
const wLeadRow = (await db.query(`SELECT verify_status FROM leads WHERE id=$1`, [wlead.body.id])).rows[0];
assert('webhook -> lead confirmed', wLeadRow.verify_status === 'whatsapp_confirmed', `verify=${wLeadRow.verify_status}`);
const wPts = (await db.query(`SELECT count(*)::int n FROM promoter_points WHERE lead_id=$1 AND reason='lead_verified'`, [wlead.body.id])).rows[0];
assert('webhook -> points awarded once', wPts.n === 1, `n=${wPts.n}`);

// unknown provider id -> 200 matched:false (so MSG91 stops retrying)
const whUnknown = await post('/api/outbox/webhook', { provider_msg_id: 'does-not-exist', status: 'delivered' });
assert('webhook unknown id -> 200 matched:false', whUnknown.status === 200 && whUnknown.body.matched === false, `status=${whUnknown.status}`);

await db.end();
console.log('\n' + results.join('\n'));
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length}/${results.length} passed`);
