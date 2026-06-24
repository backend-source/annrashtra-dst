import { ApiError } from '../middleware/errorHandler.js';
import { query, withTransaction } from '../config/db.js';
import * as repo from '../repositories/collections.repo.js';

// Promoter ids in scope: promoter -> self; supervisor -> their team; admin -> all.
async function scopeIds(user) {
  if (user.role === 'promoter') return [user.id];
  if (user.role === 'supervisor') {
    const { rows } = await query(`SELECT id FROM users WHERE role='promoter' AND supervisor_id=$1`, [user.id]);
    return rows.map((r) => r.id);
  }
  const { rows } = await query(`SELECT id FROM users WHERE role='promoter'`);
  return rows.map((r) => r.id);
}

// Promoter records a cash handover for today.
export async function create(input) {
  if (!input.promoter_id) throw new ApiError(400, 'promoter_id is required');
  const amount = Number(input.amount);
  if (!(amount >= 0)) throw new ApiError(400, 'amount must be a non-negative number');
  try {
    return await repo.insert({ promoter_id: input.promoter_id, amount, note: input.note, client_uuid: input.client_uuid });
  } catch (err) {
    if (err.code === '23505') throw new ApiError(409, 'Cash already handed over for today');
    throw err;
  }
}

export async function list(user, { status }) {
  const ids = await scopeIds(user);
  return repo.list({ promoterIds: ids, status });
}

// Supervisor/admin verifies and confirms receipt.
export async function confirm(id, user) {
  return withTransaction(async (client) => {
    const row = await repo.getForUpdate(client, id);
    if (!row) throw new ApiError(404, 'Collection not found');
    if (row.status === 'received') return row; // idempotent
    return repo.confirm(client, id, user.id);
  });
}
