import { ApiError } from '../middleware/errorHandler.js';
import * as productsRepo from '../repositories/products.repo.js';

export function listProducts() {
  return productsRepo.listAll();
}

// Admin adds a product (#11). Name, SKU and a positive price are required; points
// (rewards per unit sold, #10) default to 0.
export async function createProduct({ name, sku, price, points }) {
  if (!name || !`${name}`.trim()) throw new ApiError(400, 'name is required');
  if (!sku || !`${sku}`.trim()) throw new ApiError(400, 'sku is required');
  if (typeof price !== 'number' || price <= 0) throw new ApiError(400, 'price must be a positive number');
  if (points != null && (!Number.isInteger(points) || points < 0)) throw new ApiError(400, 'points must be a non-negative integer');
  try {
    return await productsRepo.insertProduct({ name: `${name}`.trim(), sku: `${sku}`.trim(), price, points });
  } catch (err) {
    if (err.code === '23505') throw new ApiError(409, 'A product with that SKU already exists');
    throw err;
  }
}

// Admin edits price / active / points. Deactivating (active:false) is the soft
// delete — the product leaves the app but past sales and reports stay intact.
export async function updateProduct(id, { price, active, points }) {
  if (price == null && active == null && points == null) throw new ApiError(400, 'nothing to update');
  if (price != null && (typeof price !== 'number' || price <= 0)) {
    throw new ApiError(400, 'price must be a positive number');
  }
  if (points != null && (!Number.isInteger(points) || points < 0)) {
    throw new ApiError(400, 'points must be a non-negative integer');
  }
  const updated = await productsRepo.updateFields(id, { price, active, points });
  if (!updated) throw new ApiError(404, 'Product not found');
  return updated;
}
