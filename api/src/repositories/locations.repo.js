import { query } from '../config/db.js';

// Promoters see the locations assigned to them; supervisors/admins see all.
export async function listForPromoter(promoterId) {
  const { rows } = await query(
    `SELECT id, name, area, type, lat, lng, radius_m
     FROM locations WHERE assigned_to = $1 ORDER BY name`,
    [promoterId],
  );
  return rows;
}

export async function listAll() {
  const { rows } = await query(
    `SELECT id, name, area, type, lat, lng, radius_m, assigned_to
     FROM locations ORDER BY name LIMIT 500`,
  );
  return rows;
}
