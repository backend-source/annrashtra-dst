// Demo data so the dashboard has something to click: a few pending refill requests
// and a few unverified leads for the test promoter. Safe to run repeatedly.
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  const promoter = (await db.query(`SELECT id FROM users WHERE mobile = '9999000001'`)).rows[0];
  const products = (await db.query(`SELECT id, sku FROM products ORDER BY sku`)).rows;

  // pending refill requests (only if none pending right now)
  const pending = (await db.query(`SELECT count(*)::int n FROM refill_requests WHERE promoter_id=$1 AND status='pending'`, [promoter.id])).rows[0].n;
  if (pending === 0) {
    for (const [i, p] of products.entries()) {
      await db.query(
        `INSERT INTO refill_requests (promoter_id, product_id, qty, client_uuid) VALUES ($1,$2,$3,$4)`,
        [promoter.id, p.id, (i + 1) * 8, randomUUID()],
      );
    }
  }

  // a couple of fresh unverified leads
  const suffix = String(Date.now()).slice(-6);
  await db.query(
    `INSERT INTO leads (promoter_id, name, mobile, health_concern, product_interest, client_uuid)
     VALUES ($1,'Asha Patil',$2,'diabetes','800g',$3), ($1,'Rohit Mehta',$4,'fitness','4kg',$5)
     ON CONFLICT (mobile) DO NOTHING`,
    [promoter.id, '70000' + suffix, randomUUID(), '70001' + suffix, randomUUID()],
  );

  const counts = (await db.query(
    `SELECT
       (SELECT count(*) FROM refill_requests WHERE status='pending') AS pending_refills,
       (SELECT count(*) FROM leads WHERE verify_status='unverified') AS unverified_leads,
       (SELECT count(*) FROM products) AS products`,
  )).rows[0];
  console.log('Demo data ready:', counts);
} catch (err) {
  console.error('seed-demo failed:', err.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
