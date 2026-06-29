import { ApiError } from '../middleware/errorHandler.js';
import { withTransaction } from '../config/db.js';
import * as productsRepo from '../repositories/products.repo.js';
import * as salesRepo from '../repositories/sales.repo.js';
import * as inventoryRepo from '../repositories/inventory.repo.js';
import * as outboxRepo from '../repositories/outbox.repo.js';
import * as pointsRepo from '../repositories/points.repo.js';
import { isValidMobile } from '../utils/validators.js';

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
  // A valid 10-digit customer mobile is mandatory unless an existing customer
  // record is referenced directly (customer_id). Name is captured when provided;
  // TODO: make name mandatory once the updated app (with the name field) is shipped.
  if (!input.customer_id && !isValidMobile(input.customer_mobile)) {
    throw new ApiError(400, 'Customer mobile must be exactly 10 digits');
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
      return { ...it, unit_price: unitPrice, points: Number(p.points) || 0 };
    });

    const istDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD in IST
    const invoiceNo = `INV-${istDate}-${input.client_uuid.slice(0, 8)}`;

    // #2 stock backstop. The promoter app hard-blocks selling below stock, so a
    // well-behaved client never reaches here oversold. A stale/offline client
    // still might — we don't reject (the customer paid), we FLAG it. Compare each
    // product's requested qty against what's currently available today
    // (opening + refill - sold). Opening-not-set => available 0 => flagged.
    let oversold = false;
    const qtyByProduct = new Map();
    for (const it of input.items) qtyByProduct.set(it.product_id, (qtyByProduct.get(it.product_id) || 0) + it.qty);
    for (const [productId, qty] of qtyByProduct) {
      await inventoryRepo.ensureTodayRow(client, { promoter_id: input.promoter_id, product_id: productId });
      const row = await inventoryRepo.getTodayRow(client, { promoterId: input.promoter_id, productId });
      const available = row ? Number(row.opening) + Number(row.refill) - Number(row.sold) : 0;
      if (qty > available) { oversold = true; break; }
    }

    // Link the customer: if a mobile is given, upsert the customer master (by mobile,
    // with name) and use that id — so name + mobile appear on the sale and in reports.
    let customerId = input.customer_id ?? null;
    if (!customerId && input.customer_mobile) {
      customerId = await salesRepo.upsertCustomer(client, {
        mobile: input.customer_mobile,
        name: input.customer_name,
      });
    }

    const sale = await salesRepo.insertSale(client, {
      promoter_id: input.promoter_id,
      location_id: input.location_id,
      customer_id: customerId,
      invoice_no: invoiceNo,
      payment_mode: input.payment_mode,
      total,
      in_radius: input.in_radius,
      override_by: input.override_by,
      override_reason: input.override_reason,
      oversold,
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
      await inventoryRepo.ensureTodayRow(client, { promoter_id: input.promoter_id, product_id: it.product_id });
      await salesRepo.addInventorySold(client, { promoter_id: input.promoter_id, product_id: it.product_id, qty: it.qty });
    }

    // Reward points for packets sold (#10): per-product points x qty, credited
    // once per sale. Idempotent on (sale_id, reason).
    const salePoints = priced.reduce((sum, it) => sum + it.points * it.qty, 0);
    if (salePoints > 0) {
      await pointsRepo.awardForSale(client, {
        promoter_id: input.promoter_id, points: salePoints, reason: 'sale_packet', sale_id: sale.id,
      });
    }

    // Queue the WhatsApp invoice (sent later by the outbox worker, phase 3).
    const mobile = input.customer_mobile || await salesRepo.getCustomerMobile(client, customerId);
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
