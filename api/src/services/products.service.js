import { ApiError } from '../middleware/errorHandler.js';
import * as productsRepo from '../repositories/products.repo.js';

export function listProducts() {
  return productsRepo.listAll();
}

// Admin edits price/active. Price must be a positive number (money stays in the DB).
export async function updateProduct(id, { price, active }) {
  if (price == null && active == null) throw new ApiError(400, 'nothing to update');
  if (price != null && (typeof price !== 'number' || price <= 0)) {
    throw new ApiError(400, 'price must be a positive number');
  }
  const updated = await productsRepo.updateFields(id, { price, active });
  if (!updated) throw new ApiError(404, 'Product not found');
  return updated;
}
