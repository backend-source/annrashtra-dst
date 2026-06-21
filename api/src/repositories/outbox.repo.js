// Enqueue an outbound MSG91 message. dedupe_key (e.g. 'invoice:<sale_id>') makes
// the enqueue idempotent so a replayed sale never queues a second invoice.
export async function enqueue(client, m) {
  const { rows } = await client.query(
    `INSERT INTO outbox_messages (channel, to_mobile, template, payload, sale_id, lead_id, dedupe_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (dedupe_key) DO NOTHING
     RETURNING *`,
    [m.channel, m.to_mobile, m.template ?? null, m.payload ?? null,
     m.sale_id ?? null, m.lead_id ?? null, m.dedupe_key ?? null],
  );
  return rows[0] || null;
}
