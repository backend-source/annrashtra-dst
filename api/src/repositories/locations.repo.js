import { query } from '../config/db.js';

// A promoter's own spots (pending + active) so the app can show status and offer
// the confirmed ones for check-in.
export async function listForPromoter(promoterId) {
  const { rows } = await query(
    `SELECT id, name, area, type, lat, lng, radius_m, status
     FROM locations WHERE assigned_to = $1
     ORDER BY (status = 'pending') DESC, name`,
    [promoterId],
  );
  return rows;
}

// Review list for supervisor (their team's spots) / admin (all). Pending first.
export async function listForReview({ supervisorId }) {
  const params = [];
  let where = 'TRUE';
  if (supervisorId) { params.push(supervisorId); where = `u.supervisor_id = $${params.length}`; }
  const { rows } = await query(
    `SELECT l.id, l.name, l.area, l.type, l.lat, l.lng, l.radius_m, l.status, l.assigned_to,
            u.name AS assigned_name, c.name AS created_by_name, cf.name AS confirmed_by_name
     FROM locations l
     LEFT JOIN users u ON u.id = l.assigned_to
     LEFT JOIN users c ON c.id = l.created_by
     LEFT JOIN users cf ON cf.id = l.confirmed_by
     WHERE ${where}
     ORDER BY (l.status = 'pending') DESC, l.name LIMIT 500`,
    params,
  );
  return rows;
}

export async function getById(id) {
  const { rows } = await query('SELECT * FROM locations WHERE id = $1', [id]);
  return rows[0] || null;
}

// Promoter proposes a spot from their current GPS. radius is auto-set by the service.
export async function propose(loc) {
  const { rows } = await query(
    `INSERT INTO locations (name, area, type, lat, lng, radius_m, assigned_to, created_by, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$7,'pending') RETURNING *`,
    [loc.name, loc.area ?? null, loc.type ?? null, loc.lat, loc.lng, loc.radius_m, loc.promoter_id],
  );
  return rows[0];
}

// Supervisor/admin confirms a pending spot -> active.
export async function confirm(id, confirmerId) {
  const { rows } = await query(
    `UPDATE locations SET status = 'active', confirmed_by = $2, confirmed_at = now()
     WHERE id = $1 RETURNING *`,
    [id, confirmerId],
  );
  return rows[0] || null;
}

export async function remove(id) {
  const { rows } = await query(`DELETE FROM locations WHERE id = $1 RETURNING id`, [id]);
  return rows[0] || null;
}

// Admin can still rename / tweak a spot (not coordinates-by-hand in the UI).
export async function update(id, loc) {
  const { rows } = await query(
    `UPDATE locations SET
       name = COALESCE($2, name), area = COALESCE($3, area), type = COALESCE($4, type),
       radius_m = COALESCE($5, radius_m)
     WHERE id = $1 RETURNING *`,
    [id, loc.name ?? null, loc.area ?? null, loc.type ?? null, loc.radius_m ?? null],
  );
  return rows[0] || null;
}
