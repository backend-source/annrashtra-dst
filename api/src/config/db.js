import pg from 'pg';
import { env } from './env.js';

// Single shared pool. Neon requires SSL. The session timezone is pinned to IST
// (set at connection startup, race-free) so current_date / ::date casts use the
// India business day — daily inventory cycles, "today's sales", and reports all
// roll over at IST midnight, not UTC midnight (UTC would be 05:30 IST).
export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  options: '-c timezone=Asia/Kolkata',
  ssl: env.databaseUrl?.includes('neon.tech') || env.nodeEnv === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

// Neon's free tier suspends compute when idle, which drops pooled connections.
// node-postgres emits 'error' on the dead idle client; without this handler that
// would crash the whole process. Log and move on — the pool makes a fresh
// connection on the next query.
pool.on('error', (err) => {
  console.error('[db] idle client error (likely Neon auto-suspend):', err.message);
});

export function query(text, params) {
  return pool.query(text, params);
}

// Run a function inside a transaction; auto rollback on throw.
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
