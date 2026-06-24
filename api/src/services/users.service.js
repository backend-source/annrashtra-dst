import { ApiError } from '../middleware/errorHandler.js';
import { isValidMobile } from '../utils/validators.js';
import * as repo from '../repositories/users.repo.js';

export function list(role) {
  return repo.listByRole(role);
}

export async function createPromoter(input) {
  const name = (input.name || '').trim();
  const mobile = (input.mobile || '').trim();
  const emp_code = input.emp_code ? input.emp_code.trim() : null;

  if (!name) throw new ApiError(400, 'name is required');
  if (!isValidMobile(mobile)) throw new ApiError(400, 'mobile must be exactly 10 digits');

  try {
    return await repo.createPromoter({ name, mobile, emp_code, supervisor_id: input.supervisor_id || null });
  } catch (err) {
    if (err.code === '23505') {
      // Which unique constraint tripped — give a clear message.
      if (err.constraint === 'uq_users_emp_code') throw new ApiError(409, `Promoter code "${emp_code}" is already in use`);
      throw new ApiError(409, `A user with mobile ${mobile} already exists`);
    }
    throw err;
  }
}
