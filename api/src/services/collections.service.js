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

function amounts(input) {
  const amount = Number(input.amount) || 0;       // cash
  const upi_amount = Number(input.upi_amount) || 0;
  if (amount < 0 || upi_amount < 0) throw new ApiError(400, 'amounts must be non-negative');
  return { amount, upi_amount };
}

// Promoter records a cash + UPI handover for today.
export async function create(input) {
  if (!input.promoter_id) throw new ApiError(400, 'promoter_id is required');
  const { amount, upi_amount } = amounts(input);
  if (amount + upi_amount <= 0) throw new ApiError(400, 'enter a cash or UPI amount');
  try {
    return await repo.insert({ promoter_id: input.promoter_id, amount, upi_amount, note: input.note, client_uuid: input.client_uuid });
  } catch (err) {
    if (err.code === '23505') throw new ApiError(409, 'Handover already submitted for today');
    throw err;
  }
}

export async function list(user, { status }) {
  const ids = await scopeIds(user);
  return repo.list({ promoterIds: ids, status });
}

// Supervisor/admin verifies the handover, optionally editing the amounts, then it
// goes back to the promoter to accept.
export async function verify(id, user, input) {
  const { amount, upi_amount } = amounts(input);
  return withTransaction(async (client) => {
    const row = await repo.getForUpdate(client, id);
    if (!row) throw new ApiError(404, 'Collection not found');
    if (row.status === 'received') throw new ApiError(409, 'Already accepted by the promoter');
    return repo.verify(client, id, user.id, { amount, upi_amount, note: input.note });
  });
}

// Promoter gives the final acceptance of the verified amounts.
export async function accept(id, user) {
  return withTransaction(async (client) => {
    const row = await repo.getForUpdate(client, id);
    if (!row) throw new ApiError(404, 'Collection not found');
    if (row.promoter_id !== user.id) throw new ApiError(403, 'Not your handover');
    if (row.status === 'received') return row; // idempotent
    if (row.status !== 'verified') throw new ApiError(409, 'Waiting for the supervisor to verify first');
    return repo.accept(client, id);
  });
}

// Promoter disputes the verified amounts — sends it back to the supervisor.
export async function dispute(id, user, note) {
  return withTransaction(async (client) => {
    const row = await repo.getForUpdate(client, id);
    if (!row) throw new ApiError(404, 'Collection not found');
    if (row.promoter_id !== user.id) throw new ApiError(403, 'Not your handover');
    if (row.status !== 'verified') throw new ApiError(409, 'Nothing to dispute');
    return repo.dispute(client, id, note);
  });
}
