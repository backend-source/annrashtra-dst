import { query } from '../config/db.js';

// Promoter hands over the day's cash. Idempotent on client_uuid; one per
// promoter/day (the unique on (promoter_id, day) surfaces as 23505 on a repeat).
export async function insert(c) {
  const { rows } = await query(
    `INSERT INTO collections (promoter_id, day, amount, note, client_uuid)
     VALUES ($1, current_date, $2, $3, $4)
     ON CONFLICT (client_uuid) WHERE client_uuid IS NOT NULL
       DO UPDATE SET client_uuid = EXCLUDED.client_uuid
     RETURNING *`,
    [c.promoter_id, c.amount, c.note ?? null, c.client_uuid],
  );
  return rows[0];
}

export async function getForUpdate(client, id) {
  const { rows } = await client.query('SELECT * FROM collections WHERE id = $1 FOR UPDATE', [id]);
  return rows[0] || null;
}

export async function confirm(client, id, supervisorId) {
  const { rows } = await client.query(
    `UPDATE collections SET status = 'received', confirmed_by = $2, confirmed_at = now()
     WHERE id = $1 RETURNING *`,
    [id, supervisorId],
  );
  return rows[0];
}

// List with promoter/confirmer names and the day's expected cash (sum of cash
// sales) for reconciliation against the handed-over amount.
export async function list({ promoterIds, status }) {
  const params = [promoterIds];
  let where = 'c.promoter_id = ANY($1)';
  if (status) { params.push(status); where += ` AND c.status = $${params.length}`; }
  const { rows } = await query(
    `SELECT c.id, c.day, c.amount, c.status, c.note,
            to_char(c.confirmed_at,'YYYY-MM-DD HH24:MI') AS confirmed_at,
            u.name AS promoter_name, v.name AS confirmed_by_name,
            COALESCE((SELECT sum(total) FROM sales s
                      WHERE s.promoter_id = c.promoter_id AND s.payment_mode = 'cash'
                        AND s.created_at::date = c.day), 0) AS expected_cash
     FROM collections c
     JOIN users u ON u.id = c.promoter_id
     LEFT JOIN users v ON v.id = c.confirmed_by
     WHERE ${where}
     ORDER BY c.day DESC, u.name LIMIT 300`,
    params,
  );
  return rows;
}
