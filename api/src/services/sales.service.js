import { ApiError } from '../middleware/errorHandler.js';
import { withTransaction } from '../config/db.js';
import * as productsRepo from '../repositories/products.repo.js';
import * as salesRepo from '../repositories/sales.repo.js';
import * as outboxRepo from '../repositories/outbox.repo.js';

const VALID_PAYMENT = new Set(['cash', 'upi']);

// Create a sale. Prices are read from the products table inside the transaction and
// the total is computed server-side — the client's prices are never trusted.
// The whole thing is idempotent on client_uuid (offline-safe).
export async function createSale(input) {
  if (!input.promoter_id) throw new ApiError(400, 'promoter_id is required');
  if (!VALID_PAYMENT.has(input.payment_mode)) {
    throw new ApiError(400, "payment_mode must be 'cash' or 'upi'");
  }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new ApiError(400, 'items is required');
  }
  for (const it of input.items) {
    if (!it.product_id || !Number.isInteger(it.qty) || it.qty <= 0) {
      throw new ApiError(400, 'each item needs product_id and a positive integer qty');
    }
  }

  return withTransaction(async (client) => {
    // Replay? Return the existing sale untouched.
    const existing = await salesRepo.findSaleWithItems(client, { clientUuid: input.client_uuid });
    if (existing) return { ...existing, replayed: true };

    // Server-side pricing.
    const ids = [...new Set(input.items.map((i) => i.product_id))];
    const products = await productsRepo.getProductsByIds(client, ids);
    const byId = new Map(products.map((p) => [p.id, p]));

    let total = 0;
    const priced = input.items.map((it) => {
      const p = byId.get(it.product_id);
      if (!p) throw new ApiError(400, `Unknown product: ${it.product_id}`);
      if (!p.active) throw new ApiError(400, `Product not active: ${p.name}`);
      const unitPrice = Number(p.price);
      total += unitPrice * it.qty;
      return { ...it, unit_price: unitPrice };
    });

    const istDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD in IST
    const invoiceNo = `INV-${istDate}-${input.client_uuid.slice(0, 8)}`;

    const sale = await salesRepo.insertSale(client, {
      promoter_id: input.promoter_id,
      location_id: input.location_id,
      customer_id: input.customer_id,
      invoice_no: invoiceNo,
      payment_mode: input.payment_mode,
      total,
      in_radius: input.in_radius,
      override_by: input.override_by,
      override_reason: input.override_reason,
      client_uuid: input.client_uuid,
    });

    // Lost an insert race on client_uuid: another request committed first.
    if (!sale) {
      const winner = await salesRepo.findSaleWithItems(client, { clientUuid: input.client_uuid });
      return { ...winner, replayed: true };
    }

    for (const it of priced) {
      await salesRepo.insertSaleItem(client, { sale_id: sale.id, product_id: it.product_id, qty: it.qty, unit_price: it.unit_price });
      await salesRepo.insertStockDeduction(client, { promoter_id: input.promoter_id, product_id: it.product_id, qty: it.qty, sale_id: sale.id });
      await salesRepo.addInventorySold(client, { promoter_id: input.promoter_id, product_id: it.product_id, qty: it.qty });
    }

    // Queue the WhatsApp invoice (sent later by the outbox worker, phase 3).
    const mobile = input.customer_mobile || await salesRepo.getCustomerMobile(client, input.customer_id);
    if (mobile) {
      await outboxRepo.enqueue(client, {
        channel: 'whatsapp',
        to_mobile: mobile,
        template: 'sale_invoice',
        payload: { invoice_no: invoiceNo, total, items: priced.map((p) => ({ product_id: p.product_id, qty: p.qty, unit_price: p.unit_price })) },
        sale_id: sale.id,
        dedupe_key: `invoice:${sale.id}`,
      });
    }

    return { ...sale, items: priced, replayed: false };
  });
}
