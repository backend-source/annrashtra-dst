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

// Supervisor verifies (and may edit the amounts).
export async function verify(req, res, next) {
  try {
    res.json(await service.verify(req.params.id, req.user, req.body));
  } catch (err) {
    next(err);
  }
}

// Promoter's final acceptance.
export async function accept(req, res, next) {
  try {
    res.json(await service.accept(req.params.id, req.user));
  } catch (err) {
    next(err);
  }
}

// Promoter disputes the verified amounts.
export async function dispute(req, res, next) {
  try {
    res.json(await service.dispute(req.params.id, req.user, req.body.note));
  } catch (err) {
    next(err);
  }
}
