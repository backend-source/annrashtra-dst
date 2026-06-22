// Quick read-only peek at what the test promoter (9999000001) has created recently.
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  const p = (await db.query(`SELECT id, name FROM users WHERE mobile='9999000001'`)).rows[0];
  console.log(`Promoter: ${p.name} (${p.id})\n`);

  const since = `created_at > now() - interval '2 hours'`;

  const leads = (await db.query(
    `SELECT name, mobile, health_concern, verify_status, status, to_char(created_at,'HH24:MI') t
     FROM leads WHERE promoter_id=$1 AND ${since} ORDER BY created_at DESC LIMIT 10`, [p.id])).rows;
  console.log(`LEADS (${leads.length}):`); console.table(leads);

  const sales = (await db.query(
    `SELECT s.invoice_no, s.payment_mode, s.total, s.whatsapp_status,
            (SELECT json_agg(json_build_object('qty',si.qty,'unit',si.unit_price)) FROM sale_items si WHERE si.sale_id=s.id) items,
            to_char(s.created_at,'HH24:MI') t
     FROM sales s WHERE s.promoter_id=$1 AND s.${since} ORDER BY s.created_at DESC LIMIT 10`, [p.id])).rows;
  console.log(`\nSALES (${sales.length}):`); sales.forEach(r => console.log(' ', JSON.stringify(r)));

  const att = (await db.query(
    `SELECT shift, in_radius, gps_lat, gps_lng, selfie_url, canopy_photo_url, to_char(check_in_at,'HH24:MI') t
     FROM attendance WHERE promoter_id=$1 AND ${since} ORDER BY created_at DESC LIMIT 10`, [p.id])).rows;
  console.log(`\nATTENDANCE (${att.length}):`); att.forEach(r => console.log(' ', JSON.stringify(r)));

  const inv = (await db.query(
    `SELECT p.sku, i.opening, i.refill, i.sold, i.closing FROM inventory i JOIN products p ON p.id=i.product_id
     WHERE i.promoter_id=$1 AND i.day=current_date ORDER BY p.sku`, [p.id])).rows;
  console.log(`\nINVENTORY today (${inv.length}):`); console.table(inv);

  const rr = (await db.query(
    `SELECT qty, status, to_char(requested_at,'HH24:MI') t FROM refill_requests
     WHERE promoter_id=$1 AND requested_at > now() - interval '2 hours' ORDER BY requested_at DESC LIMIT 10`, [p.id])).rows;
  console.log(`REFILL REQUESTS (${rr.length}):`); console.table(rr);

  const ob = (await db.query(
    `SELECT channel, template, status, to_mobile FROM outbox_messages
     WHERE created_at > now() - interval '2 hours' ORDER BY created_at DESC LIMIT 10`)).rows;
  console.log(`OUTBOX (${ob.length}):`); console.table(ob);
} catch (e) {
  console.error('check failed:', e.message);
} finally {
  await db.end();
}
