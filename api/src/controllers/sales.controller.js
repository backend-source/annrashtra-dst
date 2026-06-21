import * as salesService from '../services/sales.service.js';

export async function create(req, res, next) {
  try {
    const sale = await salesService.createSale(req.body);
    // 200 on replay (idempotent), 201 on a fresh create.
    res.status(sale.replayed ? 200 : 201).json(sale);
  } catch (err) {
    next(err);
  }
}
