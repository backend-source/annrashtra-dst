import { query } from '../config/db.js';

// Enqueue an outbound MSG91 message. dedupe_key (e.g. 'invoice:<sale_id>') makes
// the enqueue idempotent so a replayed sale never queues a second invoice. Pass a
// transaction client to enqueue atomically with the originating write; omit it to
// enqueue on the shared pool.
export async function enqueue(client, m) {
  const runner = client ?? { query };
  const payload = m.payload == null ? null : JSON.stringify(m.payload);
  const { rows } = await runner.query(
    `INSERT INTO outbox_messages (channel, to_mobile, template, payload, sale_id, lead_id, dedupe_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (dedupe_key) DO NOTHING
     RETURNING *`,
    [m.channel, m.to_mobile, m.template ?? null, payload,
     m.sale_id ?? null, m.lead_id ?? null, m.dedupe_key ?? null],
  );
  return rows[0] || null;
}

// Sendable = queued or previously-failed-but-retryable.
export async function selectPendingIds(maxAttempts, limit) {
  const { rows } = await query(
    `SELECT id FROM outbox_messages
     WHERE status IN ('queued','failed') AND attempts < $1
     ORDER BY created_at LIMIT $2`,
    [maxAttempts, limit],
  );
  return rows.map((r) => r.id);
}

// Lock one row for processing; SKIP LOCKED lets multiple workers run safely.
export async function lockForSend(client, id) {
  const { rows } = await client.query(
    `SELECT * FROM outbox_messages WHERE id = $1 FOR UPDATE SKIP LOCKED`,
    [id],
  );
  return rows[0] || null;
}

export async function markSent(client, id, providerMsgId) {
  await client.query(
    `UPDATE outbox_messages
     SET status = 'sent', provider_msg_id = $2, last_error = NULL, updated_at = now()
     WHERE id = $1`,
    [id, providerMsgId ?? null],
  );
}

export async function markFailed(client, id, error) {
  await client.query(
    `UPDATE outbox_messages
     SET status = 'failed', attempts = attempts + 1, last_error = $2, updated_at = now()
     WHERE id = $1`,
    [id, error?.slice(0, 500) ?? null],
  );
}

export async function markDelivered(client, id) {
  await client.query(
    `UPDATE outbox_messages SET status = 'delivered', updated_at = now() WHERE id = $1`,
    [id],
  );
}

// Match an incoming delivery report to its message; locked so the confirmation
// side effect is applied exactly once.
export async function findByProviderMsgId(client, providerMsgId) {
  const { rows } = await client.query(
    `SELECT * FROM outbox_messages WHERE provider_msg_id = $1 FOR UPDATE`,
    [providerMsgId],
  );
  return rows[0] || null;
}
