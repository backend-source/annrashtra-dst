import * as service from '../services/users.service.js';

// List users, optionally by ?role= (e.g. promoter) — for admin/supervisor screens.
export async function list(req, res, next) {
  try {
    res.json(await service.list(req.query.role));
  } catch (err) {
    next(err);
  }
}

// Admin creates a promoter (name, mobile, optional emp_code, optional supervisor).
export async function create(req, res, next) {
  try {
    res.status(201).json(await service.createPromoter(req.body));
  } catch (err) {
    next(err);
  }
}
