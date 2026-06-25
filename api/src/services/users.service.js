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

export async function setStatus(id, status) {
  if (status !== 'active' && status !== 'inactive') throw new ApiError(400, 'status must be active or inactive');
  const updated = await repo.setStatus(id, status);
  if (!updated) throw new ApiError(404, 'Team member not found (admins are managed separately)');
  return updated;
}

export async function remove(id) {
  try {
    const removed = await repo.remove(id);
    if (!removed) throw new ApiError(404, 'Team member not found (admins are managed separately)');
    return { deleted: true };
  } catch (err) {
    // Referenced by leads/sales/attendance/etc. — preserve the history instead.
    if (err.code === '23503') {
      throw new ApiError(409, 'This member has activity (leads, sales or attendance). Deactivate them instead of deleting.');
    }
    throw err;
  }
}
