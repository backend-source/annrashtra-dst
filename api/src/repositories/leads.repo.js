import { query } from '../config/db.js';

// Insert a lead idempotently on client_uuid. A replayed offline write returns the
// existing row instead of creating a duplicate or erroring.
export async function insertLeadIdempotent(lead) {
  const sql = `
    INSERT INTO leads
      (promoter_id, location_id, customer_id, name, mobile, health_concern,
       product_interest, source, verify_status, status, in_radius,
       override_by, override_reason, client_uuid)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    ON CONFLICT (client_uuid) DO UPDATE SET client_uuid = EXCLUDED.client_uuid
    RETURNING *`;
  const params = [
    lead.promoter_id, lead.location_id ?? null, lead.customer_id ?? null,
    lead.name ?? null, lead.mobile, lead.health_concern ?? null,
    lead.product_interest ?? null, lead.source, lead.verify_status, lead.status,
    lead.in_radius ?? null, lead.override_by ?? null, lead.override_reason ?? null,
    lead.client_uuid,
  ];
  const { rows } = await query(sql, params);
  return rows[0];
}

export async function findLeadByMobile(mobile) {
  const { rows } = await query('SELECT * FROM leads WHERE mobile = $1', [mobile]);
  return rows[0] || null;
}

// Promoters see only their own leads; supervisors/admins pass promoterId = null.
export async function listLeads({ promoterId }) {
  if (promoterId) {
    const { rows } = await query(
      'SELECT * FROM leads WHERE promoter_id = $1 ORDER BY created_at DESC LIMIT 200',
      [promoterId],
    );
    return rows;
  }
  const { rows } = await query('SELECT * FROM leads ORDER BY created_at DESC LIMIT 200');
  return rows;
}
