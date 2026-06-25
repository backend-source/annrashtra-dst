import { ApiError } from '../middleware/errorHandler.js';
import { isValidMobile } from '../utils/validators.js';
import * as repo from '../repositories/users.repo.js';

// Admins can add field staff through the dashboard. Admin accounts are NOT
// creatable here (sensitive) — they stay seeded/managed separately.
const CREATABLE_ROLES = new Set(['promoter', 'supervisor']);

export function list(role) {
  return repo.listByRole(role);
}

export async function createUser(input) {
  const name = (input.name || '').trim();
  const mobile = (input.mobile || '').trim();
  const role = input.role;
  const emp_code = input.emp_code ? input.emp_code.trim() : null;

  if (!CREATABLE_ROLES.has(role)) throw new ApiError(400, 'role must be promoter or supervisor');
  if (!name) throw new ApiError(400, 'name is required');
  if (!isValidMobile(mobile)) throw new ApiError(400, 'mobile must be exactly 10 digits');
  // Promoters carry an ID-card code; for supervisors it's optional.
  if (role === 'promoter' && !emp_code) throw new ApiError(400, 'promoter code is required');
  // supervisor_id (who oversees them) only applies to promoters.
  const supervisor_id = role === 'promoter' ? (input.supervisor_id || null) : null;

  try {
    return await repo.createUser({ name, mobile, emp_code, role, supervisor_id });
  } catch (err) {
    if (err.code === '23505') {
      if (err.constraint === 'uq_users_emp_code') throw new ApiError(409, `Code "${emp_code}" is already in use`);
      throw new ApiError(409, `A user with mobile ${mobile} already exists`);
    }
    throw err;
  }
}
