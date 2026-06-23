// Resets the test promoter's data and seeds a tidy set for exercising the
// admin/supervisor dashboard: unverified leads (to verify/convert), pending
// refill requests (to approve/reject), and an unverified check-in (to verify).
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  const promoter = (await db.query(`SELECT id FROM users WHERE mobile='9999000001'`)).rows[0];
  const location = (await db.query(`SELECT id, lat, lng FROM locations WHERE name='Test Park'`)).rows[0];
  const products = (await db.query(`SELECT id, sku FROM products ORDER BY sku`)).rows;
  const pid = promoter.id;

  // ---- clean slate for this promoter (dashboard-relevant tables) ----
  await db.query(`DELETE FROM outbox_messages WHERE lead_id IN (SELECT id FROM leads WHERE promoter_id=$1) OR sale_id IN (SELECT id FROM sales WHERE promoter_id=$1)`, [pid]);
  await db.query(`DELETE FROM promoter_points WHERE promoter_id=$1`, [pid]);
  await db.query(`DELETE FROM refill_requests WHERE promoter_id=$1`, [pid]);
  await db.query(`DELETE FROM attendance WHERE promoter_id=$1`, [pid]);
  await db.query(`DELETE FROM leads WHERE promoter_id=$1`, [pid]);

  // ---- leads: two unverified + one whatsapp_confirmed (convertible) ----
  const s = String(Date.now()).slice(-6);
  await db.query(
    `INSERT INTO leads (promoter_id, name, mobile, health_concern, product_interest, verify_status, client_uuid)
     VALUES
       ($1,'Asha Patil', $2,'diabetes','800g','unverified',$5),
       ($1,'Rohit Mehta',$3,'fitness','4kg','unverified',$6),
       ($1,'Meena Shah', $4,'weight_loss','800g','whatsapp_confirmed',$7)`,
    [pid, `7011${s}`, `7012${s}`, `7013${s}`, randomUUID(), randomUUID(), randomUUID()],
  );

  // ---- two pending refill requests ----
  await db.query(
    `INSERT INTO refill_requests (promoter_id, product_id, qty, client_uuid)
     VALUES ($1,$2,$3,$6), ($1,$4,$5,$7)`,
    [pid, products[0].id, 8, products[1].id, 12, randomUUID(), randomUUID()],
  );

  // ---- one unverified check-in (in-radius, photos captured) to verify ----
  await db.query(
    `INSERT INTO attendance (promoter_id, location_id, shift, check_in_at, gps_lat, gps_lng, in_radius, selfie_url, canopy_photo_url, client_uuid)
     VALUES ($1,$2,'morning', now(), $3,$4, true, 'pending-upload://selfies/demo.jpg', 'pending-upload://canopy/demo.jpg', $5)`,
    [pid, location.id, location.lat, location.lng, randomUUID()],
  );

  const counts = (await db.query(
    `SELECT
       (SELECT count(*) FROM leads WHERE promoter_id=$1) leads,
       (SELECT count(*) FROM refill_requests WHERE promoter_id=$1 AND status='pending') pending_refills,
       (SELECT count(*) FROM attendance WHERE promoter_id=$1 AND verified_by IS NULL) unverified_checkins`,
    [pid])).rows[0];
  console.log('Demo data ready for the dashboard:', counts);
} catch (err) {
  console.error('seed-demo failed:', err.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
