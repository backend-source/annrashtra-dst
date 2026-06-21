import { query } from '../config/db.js';

// Append an audit row. Pass a transaction client to make the log atomic with the
// write; omit it to log on the shared pool. before/after are stored as jsonb.
export async function logAudit(client, e) {
  const runner = client ?? { query };
  await runner.query(
    `INSERT INTO audit_log (actor_id, role, action, entity, entity_id, before, after)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      e.actor_id ?? null, e.role ?? null, e.action, e.entity, e.entity_id ?? null,
      e.before == null ? null : JSON.stringify(e.before),
      e.after == null ? null : JSON.stringify(e.after),
    ],
  );
}
