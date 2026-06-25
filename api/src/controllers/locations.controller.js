import * as service from '../services/locations.service.js';

export async function list(req, res, next) {
  try {
    res.json(await service.list(req.user));
  } catch (err) {
    next(err);
  }
}

// Promoter proposes a spot from their current GPS.
export async function propose(req, res, next) {
  try {
    res.status(201).json(await service.propose(req.user, req.body));
  } catch (err) {
    next(err);
  }
}

// Supervisor/admin confirms a pending spot.
export async function confirm(req, res, next) {
  try {
    res.json(await service.confirm(req.params.id, req.user));
  } catch (err) {
    next(err);
  }
}

// Supervisor/admin rejects a pending spot.
export async function reject(req, res, next) {
  try {
    res.json(await service.reject(req.params.id, req.user));
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    res.json(await service.update(req.params.id, req.body));
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    res.json(await service.remove(req.params.id, req.user));
  } catch (err) {
    next(err);
  }
}
