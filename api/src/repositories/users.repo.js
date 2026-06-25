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

// Activate / deactivate a team member (admins can't be changed here).
export async function setStatus(id, status) {
  const { rows } = await query(
    `UPDATE users SET status = $2 WHERE id = $1 AND role IN ('promoter','supervisor')
     RETURNING id, name, mobile, emp_code, role, status`,
    [id, status],
  );
  return rows[0] || null;
}

// Hard-delete a team member. Throws a FK error (23503) if they have any activity.
export async function remove(id) {
  const { rows } = await query(
    `DELETE FROM users WHERE id = $1 AND role IN ('promoter','supervisor') RETURNING id`,
    [id],
  );
  return rows[0] || null;
}
