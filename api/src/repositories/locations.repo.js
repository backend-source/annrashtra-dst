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
    `SELECT l.id, l.name, l.area, l.type, l.lat, l.lng, l.radius_m, l.assigned_to,
            u.name AS assigned_name
     FROM locations l LEFT JOIN users u ON u.id = l.assigned_to
     ORDER BY l.name LIMIT 500`,
  );
  return rows;
}

export async function create(loc) {
  const { rows } = await query(
    `INSERT INTO locations (name, area, type, lat, lng, radius_m, assigned_to)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [loc.name, loc.area ?? null, loc.type ?? null, loc.lat ?? null, loc.lng ?? null,
     loc.radius_m ?? 120, loc.assigned_to ?? null],
  );
  return rows[0];
}

export async function update(id, loc) {
  const { rows } = await query(
    `UPDATE locations SET
       name = COALESCE($2, name), area = COALESCE($3, area), type = COALESCE($4, type),
       lat = COALESCE($5, lat), lng = COALESCE($6, lng), radius_m = COALESCE($7, radius_m),
       assigned_to = COALESCE($8, assigned_to)
     WHERE id = $1 RETURNING *`,
    [id, loc.name ?? null, loc.area ?? null, loc.type ?? null, loc.lat ?? null,
     loc.lng ?? null, loc.radius_m ?? null, loc.assigned_to ?? null],
  );
  return rows[0] || null;
}
