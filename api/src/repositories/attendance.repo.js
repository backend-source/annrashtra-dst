import { query } from '../config/db.js';

export async function getLocation(id) {
  const { rows } = await query(
    'SELECT id, lat, lng, radius_m FROM locations WHERE id = $1',
    [id],
  );
  return rows[0] || null;
}

export async function getUser(id) {
  const { rows } = await query('SELECT id, role, status FROM users WHERE id = $1', [id]);
  return rows[0] || null;
}

// Idempotent check-in. A replayed client_uuid returns the existing row; a second
// check-in for the same promoter/shift/day (different uuid) raises a unique
// violation (23505) which the service maps to 409.
export async function insertCheckIn(a) {
  const { rows } = await query(
    `INSERT INTO attendance
       (promoter_id, location_id, shift, check_in_at, gps_lat, gps_lng,
        selfie_url, canopy_photo_url, in_radius, override_by, override_reason, client_uuid)
     VALUES ($1,$2,$3, now(), $4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (client_uuid) WHERE client_uuid IS NOT NULL
       DO UPDATE SET client_uuid = EXCLUDED.client_uuid
     RETURNING *`,
    [a.promoter_id, a.location_id ?? null, a.shift, a.gps_lat ?? null, a.gps_lng ?? null,
     a.selfie_url ?? null, a.canopy_photo_url ?? null, a.in_radius, a.override_by ?? null,
     a.override_reason ?? null, a.client_uuid],
  );
  return rows[0];
}

export async function getById(id) {
  const { rows } = await query('SELECT * FROM attendance WHERE id = $1', [id]);
  return rows[0] || null;
}

// First check-out wins; if already set, the row is returned unchanged (idempotent).
export async function checkOut(id) {
  const { rows } = await query(
    `UPDATE attendance SET check_out_at = COALESCE(check_out_at, now())
     WHERE id = $1 RETURNING *`,
    [id],
  );
  return rows[0] || null;
}

// Recent check-ins for review. Supervisors see only their promoters' records;
// admins (supervisorId = null) see all.
export async function listForReview({ supervisorId }) {
  const params = [];
  let where = 'a.check_in_at IS NOT NULL';
  if (supervisorId) {
    params.push(supervisorId);
    where += ` AND u.supervisor_id = $${params.length}`;
  }
  const { rows } = await query(
    `SELECT a.id, a.shift, a.check_in_at, a.check_out_at, a.gps_lat, a.gps_lng,
            a.in_radius, a.selfie_url, a.canopy_photo_url, a.verified_by,
            u.name AS promoter_name, l.name AS location_name, v.name AS verified_by_name
     FROM attendance a
     JOIN users u ON u.id = a.promoter_id
     LEFT JOIN locations l ON l.id = a.location_id
     LEFT JOIN users v ON v.id = a.verified_by
     WHERE ${where}
     ORDER BY a.check_in_at DESC LIMIT 100`,
    params,
  );
  return rows;
}

// Supervisor verifies the canopy activity for an attendance record.
export async function setVerifiedBy(id, supervisorId) {
  const { rows } = await query(
    'UPDATE attendance SET verified_by = $2 WHERE id = $1 RETURNING *',
    [id, supervisorId],
  );
  return rows[0] || null;
}
