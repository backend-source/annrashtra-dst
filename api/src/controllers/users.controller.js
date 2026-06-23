import * as repo from '../repositories/users.repo.js';

// List users, optionally by ?role= (e.g. promoter) — for admin/supervisor screens.
export async function list(req, res, next) {
  try {
    res.json(await repo.listByRole(req.query.role));
  } catch (err) {
    next(err);
  }
}
