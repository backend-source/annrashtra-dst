import { query } from '../config/db.js';

export async function listByRole(role) {
  const { rows } = await query(
    `SELECT id, name, mobile, emp_code, role, status FROM users
     ${role ? 'WHERE role = $1' : ''} ORDER BY name`,
    role ? [role] : [],
  );
  return rows;
}

// Create a promoter or supervisor. emp_code is unique when given (DB enforces).
export async function createUser(u) {
  const { rows } = await query(
    `INSERT INTO users (name, mobile, emp_code, role, supervisor_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, mobile, emp_code, role, status`,
    [u.name, u.mobile, u.emp_code ?? null, u.role, u.supervisor_id ?? null],
  );
  return rows[0];
}
