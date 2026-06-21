import pg from 'pg';
import { env } from './env.js';

// Single shared pool. Neon requires SSL.
export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  ssl: env.databaseUrl?.includes('neon.tech') || env.nodeEnv === 'production'
    ? { rejectUnauthorized: false }
    : false,
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
