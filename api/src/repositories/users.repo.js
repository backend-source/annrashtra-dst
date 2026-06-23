import { query } from '../config/db.js';

export async function listByRole(role) {
  const { rows } = await query(
    `SELECT id, name, mobile, role, status FROM users
     ${role ? 'WHERE role = $1' : ''} ORDER BY name`,
    role ? [role] : [],
  );
  return rows;
}
