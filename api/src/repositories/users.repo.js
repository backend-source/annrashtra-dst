import { query } from '../config/db.js';

export async function listByRole(role) {
  const { rows } = await query(
    `SELECT id, name, mobile, emp_code, role, status FROM users
     ${role ? 'WHERE role = $1' : ''} ORDER BY name`,
    role ? [role] : [],
  );
  return rows;
}

// Create a promoter. emp_code is optional but unique when given (DB enforces).
export async function createPromoter(u) {
  const { rows } = await query(
    `INSERT INTO users (name, mobile, emp_code, role, supervisor_id)
     VALUES ($1, $2, $3, 'promoter', $4)
     RETURNING id, name, mobile, emp_code, role, status`,
    [u.name, u.mobile, u.emp_code ?? null, u.supervisor_id ?? null],
  );
  return rows[0];
}
