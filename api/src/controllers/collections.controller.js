import * as service from '../services/collections.service.js';

export async function create(req, res, next) {
  try {
    const row = await service.create(req.body);
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
}

export async function list(req, res, next) {
  try {
    res.json(await service.list(req.user, { status: req.query.status }));
  } catch (err) {
    next(err);
  }
}

export async function confirm(req, res, next) {
  try {
    res.json(await service.confirm(req.params.id, req.user));
  } catch (err) {
    next(err);
  }
}
