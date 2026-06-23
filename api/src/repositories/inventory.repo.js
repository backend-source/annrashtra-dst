import { query } from '../config/db.js';

// ---- daily stock cycle ----
export async function getDailyCycle(promoterId, day) {
  const { rows } = await query(
    `SELECT i.product_id, p.name, p.sku, i.opening, i.refill, i.sold, i.closing, i.day
     FROM inventory i JOIN products p ON p.id = i.product_id
     WHERE i.promoter_id = $1 AND i.day = $2
     ORDER BY p.sku`,
    [promoterId, day],
  );
  return rows;
}

export async function getTodayRow(client, { promoterId, productId }) {
  const { rows } = await client.query(
    `SELECT * FROM inventory WHERE promoter_id = $1 AND product_id = $2 AND day = current_date`,
    [promoterId, productId],
  );
  return rows[0] || null;
}

// ---- opening allocation (idempotent on client_uuid) ----
// Records an 'allocation' ledger row; returns null on replay so the caller knows
// not to double-count into inventory.opening.
export async function insertAllocation(client, a) {
  const { rows } = await client.query(
    `INSERT INTO stock_transactions (promoter_id, product_id, type, quantity, client_uuid)
     VALUES ($1,$2,'allocation',$3,$4)
     ON CONFLICT (client_uuid) WHERE client_uuid IS NOT NULL DO NOTHING
     RETURNING id`,
    [a.promoter_id, a.product_id, a.qty, a.client_uuid],
  );
  return rows[0] || null;
}

export async function addOpening(client, { promoter_id, product_id, qty }) {
  await client.query(
    `INSERT INTO inventory (promoter_id, product_id, opening, day)
     VALUES ($1,$2,$3,current_date)
     ON CONFLICT (promoter_id, product_id, day)
     DO UPDATE SET opening = inventory.opening + EXCLUDED.opening`,
    [promoter_id, product_id, qty],
  );
}

export async function addRefill(client, { promoter_id, product_id, qty }) {
  await client.query(
    `INSERT INTO inventory (promoter_id, product_id, refill, day)
     VALUES ($1,$2,$3,current_date)
     ON CONFLICT (promoter_id, product_id, day)
     DO UPDATE SET refill = inventory.refill + EXCLUDED.refill`,
    [promoter_id, product_id, qty],
  );
}

// ---- refill requests ----
export async function insertRefillRequest(req) {
  const { rows } = await query(
    `INSERT INTO refill_requests (promoter_id, product_id, qty, client_uuid)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (client_uuid) WHERE client_uuid IS NOT NULL
       DO UPDATE SET client_uuid = EXCLUDED.client_uuid
     RETURNING *`,
    [req.promoter_id, req.product_id, req.qty, req.client_uuid],
  );
  return rows[0];
}

// Locked read so two supervisors can't approve the same request concurrently.
export async function getRequestForUpdate(client, id) {
  const { rows } = await client.query('SELECT * FROM refill_requests WHERE id = $1 FOR UPDATE', [id]);
  return rows[0] || null;
}

export async function insertRefillTxn(client, t) {
  const { rows } = await client.query(
    `INSERT INTO stock_transactions (promoter_id, product_id, type, quantity, approved_by)
     VALUES ($1,$2,'refill',$3,$4) RETURNING id`,
    [t.promoter_id, t.product_id, t.qty, t.approved_by],
  );
  return rows[0].id;
}

export async function markDecided(client, { id, status, decidedBy, note, stockTxnId }) {
  const { rows } = await client.query(
    `UPDATE refill_requests
     SET status = $2, decided_by = $3, decided_at = now(), decision_note = $4, stock_txn_id = $5
     WHERE id = $1 RETURNING *`,
    [id, status, decidedBy, note ?? null, stockTxnId ?? null],
  );
  return rows[0];
}

// Promoter confirms delivery with the actual quantity received.
export async function markDelivered(client, { id, deliveredQty, stockTxnId }) {
  const { rows } = await client.query(
    `UPDATE refill_requests
     SET status = 'delivered', delivered_qty = $2, delivered_at = now(), stock_txn_id = $3
     WHERE id = $1 RETURNING *`,
    [id, deliveredQty, stockTxnId],
  );
  return rows[0];
}

export async function listRequests({ status, promoterId }) {
  const where = [];
  const params = [];
  if (status) { params.push(status); where.push(`status = $${params.length}`); }
  if (promoterId) { params.push(promoterId); where.push(`promoter_id = $${params.length}`); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT * FROM refill_requests ${clause} ORDER BY requested_at DESC LIMIT 200`,
    params,
  );
  return rows;
}
