import * as service from '../services/products.service.js';

export async function list(_req, res, next) {
  try {
    res.json(await service.listProducts());
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    res.json(await service.updateProduct(req.params.id, req.body));
  } catch (err) {
    next(err);
  }
}
