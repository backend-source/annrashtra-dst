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
    await repo.ensureTodayRow(client, { promoter_id: input.promoter_id, product_id: input.product_id });
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

export async function getDailyCycle(user, { promoterId, day }) {
  const target = user.role === 'promoter' ? user.id : (promoterId || user.id);
  const d = day || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  // When viewing today, carry yesterday's closing forward into today's opening.
  if (d === new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })) {
    await repo.rolloverForPromoter(target);
  }
  return repo.getDailyCycle(target, d);
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

// Admin approves the request. No stock is added yet — the promoter confirms the
// actual delivery later. Idempotent if already approved.
export async function approveRefill(id, user) {
  return withTransaction(async (client) => {
    const reqRow = await repo.getRequestForUpdate(client, id);
    if (!reqRow) throw new ApiError(404, 'Refill request not found');
    if (reqRow.status === 'approved') return reqRow;          // idempotent
    if (reqRow.status === 'rejected') throw new ApiError(409, 'Request was already rejected');
    if (reqRow.status === 'delivered') throw new ApiError(409, 'Request was already delivered');
    return repo.markDecided(client, { id, status: 'approved', decidedBy: user.id });
  });
}

export async function rejectRefill(id, user, note) {
  return withTransaction(async (client) => {
    const reqRow = await repo.getRequestForUpdate(client, id);
    if (!reqRow) throw new ApiError(404, 'Refill request not found');
    if (reqRow.status === 'rejected') return reqRow;          // idempotent
    if (reqRow.status !== 'pending') throw new ApiError(409, `Cannot reject a ${reqRow.status} request`);
    return repo.markDecided(client, { id, status: 'rejected', decidedBy: user.id, note });
  });
}

// Promoter confirms delivery with the ACTUAL quantity received from the factory.
// This is when stock actually enters inventory (the 'refill' ledger row + the
// inventory.refill bump use delivered_qty). Idempotent if already delivered.
export async function confirmRefill(id, user, deliveredQty) {
  if (!Number.isInteger(deliveredQty) || deliveredQty <= 0) {
    throw new ApiError(400, 'delivered_qty must be a positive integer');
  }
  return withTransaction(async (client) => {
    const reqRow = await repo.getRequestForUpdate(client, id);
    if (!reqRow) throw new ApiError(404, 'Refill request not found');
    // Promoters can only confirm their own deliveries.
    if (user.role === 'promoter' && reqRow.promoter_id !== user.id) {
      throw new ApiError(403, 'Cannot confirm another promoter\'s delivery');
    }
    if (reqRow.status === 'delivered') return reqRow;         // idempotent
    if (reqRow.status !== 'approved') throw new ApiError(409, `Only approved requests can be confirmed (status: ${reqRow.status})`);

    const stockTxnId = await repo.insertRefillTxn(client, {
      promoter_id: reqRow.promoter_id, product_id: reqRow.product_id,
      qty: deliveredQty, approved_by: reqRow.decided_by,
    });
    await repo.ensureTodayRow(client, { promoter_id: reqRow.promoter_id, product_id: reqRow.product_id });
    await repo.addRefill(client, { promoter_id: reqRow.promoter_id, product_id: reqRow.product_id, qty: deliveredQty });
    return repo.markDelivered(client, { id, deliveredQty, stockTxnId });
  });
}

export function listRefillRequests(user, { status }) {
  const promoterId = user.role === 'promoter' ? user.id : undefined;
  return repo.listRequests({ status, promoterId });
}
