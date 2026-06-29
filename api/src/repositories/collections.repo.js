import { query } from '../config/db.js';

// Promoter hands over cash + UPI. Idempotent on client_uuid; multiple handovers
// per day are allowed (#3) — the one-per-day unique was dropped in schema_v9.
export async function insert(c) {
  const { rows } = await query(
    `INSERT INTO collections (promoter_id, day, amount, upi_amount, note, client_uuid)
     VALUES ($1, current_date, $2, $3, $4, $5)
     ON CONFLICT (client_uuid) WHERE client_uuid IS NOT NULL
       DO UPDATE SET client_uuid = EXCLUDED.client_uuid
     RETURNING *`,
    [c.promoter_id, c.amount, c.upi_amount, c.note ?? null, c.client_uuid],
  );
  return rows[0];
}

export async function getForUpdate(client, id) {
  const { rows } = await client.query('SELECT * FROM collections WHERE id = $1 FOR UPDATE', [id]);
  return rows[0] || null;
}

// Supervisor verifies — may edit the cash/UPI amounts — and sends it back to the
// promoter for acceptance. Clears any prior dispute note.
export async function verify(client, id, supervisorId, { amount, upi_amount, note }) {
  const { rows } = await client.query(
    `UPDATE collections SET amount = $2, upi_amount = $3, note = COALESCE($4, note),
        status = 'verified', confirmed_by = $5, confirmed_at = now(),
        accepted_at = NULL, dispute_note = NULL
     WHERE id = $1 RETURNING *`,
    [id, amount, upi_amount, note ?? null, supervisorId],
  );
  return rows[0];
}

// Promoter accepts the verified amounts — final.
export async function accept(client, id) {
  const { rows } = await client.query(
    `UPDATE collections SET status = 'received', accepted_at = now() WHERE id = $1 RETURNING *`,
    [id],
  );
  return rows[0];
}

// Promoter disputes the verified amounts — back to the supervisor.
export async function dispute(client, id, note) {
  const { rows } = await client.query(
    `UPDATE collections SET status = 'disputed', dispute_note = $2 WHERE id = $1 RETURNING *`,
    [id, note ?? null],
  );
  return rows[0];
}

// List with promoter/confirmer names and the day's expected cash + UPI (sum of
// sales by mode) for reconciliation against the handed-over amounts.
export async function list({ promoterIds, status }) {
  const params = [promoterIds];
  let where = 'c.promoter_id = ANY($1)';
  if (status) { params.push(status); where += ` AND c.status = $${params.length}`; }
  const { rows } = await query(
    `SELECT c.id, c.day, c.amount, c.upi_amount, c.status, c.note, c.dispute_note,
            to_char(c.confirmed_at,'YYYY-MM-DD HH24:MI') AS confirmed_at,
            to_char(c.accepted_at,'YYYY-MM-DD HH24:MI') AS accepted_at,
            u.name AS promoter_name, v.name AS confirmed_by_name,
            COALESCE((SELECT sum(total) FROM sales s
                      WHERE s.promoter_id = c.promoter_id AND s.payment_mode = 'cash'
                        AND s.created_at::date = c.day), 0) AS expected_cash,
            COALESCE((SELECT sum(total) FROM sales s
                      WHERE s.promoter_id = c.promoter_id AND s.payment_mode = 'upi'
                        AND s.created_at::date = c.day), 0) AS expected_upi
     FROM collections c
     JOIN users u ON u.id = c.promoter_id
     LEFT JOIN users v ON v.id = c.confirmed_by
     WHERE ${where}
     ORDER BY c.day DESC, u.name LIMIT 300`,
    params,
  );
  return rows;
}
