import * as repo from '../repositories/locations.repo.js';

export async function list(req, res, next) {
  try {
    const rows = req.user.role === 'promoter'
      ? await repo.listForPromoter(req.user.id)
      : await repo.listAll();
    res.json(rows);
  } catch (err) {
    next(err);
  }
}
