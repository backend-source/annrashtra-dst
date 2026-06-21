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

// Supervisor verifies the canopy activity for an attendance record.
export async function setVerifiedBy(id, supervisorId) {
  const { rows } = await query(
    'UPDATE attendance SET verified_by = $2 WHERE id = $1 RETURNING *',
    [id, supervisorId],
  );
  return rows[0] || null;
}
