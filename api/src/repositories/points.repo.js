import { query } from '../config/db.js';

// Append-only rewards ledger. The partial unique (lead_id, reason) makes awarding
// idempotent, so re-running a verify/convert never double-credits.
export async function awardForLead(client, p) {
  await client.query(
    `INSERT INTO promoter_points (promoter_id, points, reason, lead_id)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (lead_id, reason) WHERE lead_id IS NOT NULL DO NOTHING`,
    [p.promoter_id, p.points, p.reason, p.lead_id],
  );
}

// Points for packets sold (#10). The partial unique (sale_id, reason) keeps it
// idempotent, so a replayed sale never double-credits.
export async function awardForSale(client, p) {
  await client.query(
    `INSERT INTO promoter_points (promoter_id, points, reason, sale_id)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (sale_id, reason) WHERE sale_id IS NOT NULL DO NOTHING`,
    [p.promoter_id, p.points, p.reason, p.sale_id],
  );
}

export async function totalForPromoter(promoterId) {
  const { rows } = await query(
    `SELECT coalesce(sum(points),0)::int AS total FROM promoter_points WHERE promoter_id = $1`,
    [promoterId],
  );
  return rows[0].total;
}
