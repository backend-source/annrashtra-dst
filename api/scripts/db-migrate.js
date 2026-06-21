// Applies SQL files in order against DATABASE_URL.
//   node scripts/db-migrate.js              -> applies schema.sql then schema_v2.sql
//   node scripts/db-migrate.js ../db/x.sql  -> applies the given file(s)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const here = path.dirname(fileURLToPath(import.meta.url));
const dbDir = path.resolve(here, '../../db');
const files = process.argv.slice(2);
const toApply = files.length
  ? files
  : [
      path.join(dbDir, 'schema.sql'),
      path.join(dbDir, 'schema_v2.sql'),
      path.join(dbDir, 'schema_v3.sql'),
    ];

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  for (const f of toApply) {
    const sql = fs.readFileSync(path.resolve(f), 'utf8');
    process.stdout.write(`Applying ${path.basename(f)} ... `);
    await client.query(sql);
    console.log('ok');
  }
  console.log('Done.');
} catch (err) {
  console.error('\nMigration failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
