import { ApiError } from '../middleware/errorHandler.js';
import { withTransaction, query } from '../config/db.js';
import * as repo from '../repositories/inventory.repo.js';

async function assertProduct(productId) {
  const { rows } = await query('SELECT id, active FROM products WHERE id = $1', [productId]);
  if (!rows[0]) throw new ApiError(400, `Unknown product: ${productId}`);
  if (!rows[0].active) throw new ApiError(400, 'Product is not active');
}

// Promoter records opening stock for a product (start of day). Idempotent on
// client_uuid via the 'allocation' ledger row, so a replay never double-counts.
export async function recordOpening(input) {
  if (!input.promoter_id) throw new ApiError(400, 'promoter_id is required');
  if (!input.product_id) throw new ApiError(400, 'product_id is required');
  if (!Number.isInteger(input.qty) || input.qty <= 0) throw new ApiError(400, 'qty must be a positive integer');
  await assertProduct(input.product_id);

  return withTransaction(async (client) => {
    const txn = await repo.insertAllocation(client, {
      promoter_id: input.promoter_id, product_id: input.product_id,
      qty: input.qty, client_uuid: input.client_uuid,
    });
    if (txn) {
      await repo.addOpening(client, { promoter_id: input.promoter_id, product_id: input.product_id, qty: input.qty });
    }
    const row = await repo.getTodayRow(client, {
      promoterId: input.promoter_id, productId: input.product_id,
    });
    return { ...row, replayed: !txn };
  });
}

export function getDailyCycle(user, { promoterId, day }) {
  const target = user.role === 'promoter' ? user.id : (promoterId || user.id);
  return repo.getDailyCycle(target, day || new Date().toISOString().slice(0, 10));
}

// Promoter requests a refill; stays 'pending' until a supervisor decides.
export async function requestRefill(input) {
  if (!input.promoter_id) throw new ApiError(400, 'promoter_id is required');
  if (!input.product_id) throw new ApiError(400, 'product_id is required');
  if (!Number.isInteger(input.qty) || input.qty <= 0) throw new ApiError(400, 'qty must be a positive integer');
  await assertProduct(input.product_id);
  return repo.insertRefillRequest({
    promoter_id: input.promoter_id, product_id: input.product_id,
    qty: input.qty, client_uuid: input.client_uuid,
  });
}

// Supervisor/admin approves: writes the positive 'refill' ledger row (approved_by)
// and bumps inventory.refill, all in one transaction. Idempotent if already approved.
export async function approveRefill(id, user) {
  return withTransaction(async (client) => {
    const reqRow = await repo.getRequestForUpdate(client, id);
    if (!reqRow) throw new ApiError(404, 'Refill request not found');
    if (reqRow.status === 'approved') return reqRow;          // idempotent
    if (reqRow.status === 'rejected') throw new ApiError(409, 'Request was already rejected');

    const stockTxnId = await repo.insertRefillTxn(client, {
      promoter_id: reqRow.promoter_id, product_id: reqRow.product_id,
      qty: reqRow.qty, approved_by: user.id,
    });
    await repo.addRefill(client, { promoter_id: reqRow.promoter_id, product_id: reqRow.product_id, qty: reqRow.qty });
    return repo.markDecided(client, { id, status: 'approved', decidedBy: user.id, stockTxnId });
  });
}

export async function rejectRefill(id, user, note) {
  return withTransaction(async (client) => {
    const reqRow = await repo.getRequestForUpdate(client, id);
    if (!reqRow) throw new ApiError(404, 'Refill request not found');
    if (reqRow.status === 'rejected') return reqRow;          // idempotent
    if (reqRow.status === 'approved') throw new ApiError(409, 'Request was already approved');
    return repo.markDecided(client, { id, status: 'rejected', decidedBy: user.id, note });
  });
}

export function listRefillRequests(user, { status }) {
  const promoterId = user.role === 'promoter' ? user.id : undefined;
  return repo.listRequests({ status, promoterId });
}
