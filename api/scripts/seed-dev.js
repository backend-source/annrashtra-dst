// Dev-only seed: one promoter, one location, one customer. Idempotent on mobile.
// Prints the ids (and product ids) as JSON so tests can use them.
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  const promoter = (await client.query(
    `INSERT INTO users (name, mobile, role)
     VALUES ('Test Promoter', '9999000001', 'promoter')
     ON CONFLICT (mobile) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
  )).rows[0];

  const location = (await client.query(
    `INSERT INTO locations (name, area, type, lat, lng, assigned_to)
     SELECT 'Test Park', 'Andheri', 'park', 19.1197, 72.8468, $1
     WHERE NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Test Park')
     RETURNING id`, [promoter.id],
  )).rows[0] || (await client.query(`SELECT id FROM locations WHERE name = 'Test Park'`)).rows[0];

  const customer = (await client.query(
    `INSERT INTO customers (name, mobile, lead_source)
     VALUES ('Test Customer', '8888000001', 'manual')
     ON CONFLICT (mobile) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
  )).rows[0];

  const products = (await client.query(`SELECT id, sku, price FROM products ORDER BY sku`)).rows;

  const tables = (await client.query(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`,
  )).rows[0].n;

  console.log(JSON.stringify({
    public_tables: tables,
    promoter_id: promoter.id,
    location_id: location.id,
    customer_id: customer.id,
    products,
  }, null, 2));
} catch (err) {
  console.error('Seed failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
