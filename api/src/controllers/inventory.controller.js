import * as service from '../services/inventory.service.js';

export async function dailyCycle(req, res, next) {
  try {
    res.json(await service.getDailyCycle(req.user, { promoterId: req.query.promoter_id, day: req.query.day }));
  } catch (err) {
    next(err);
  }
}

export async function recordOpening(req, res, next) {
  try {
    const row = await service.recordOpening(req.body);
    res.status(row.replayed ? 200 : 201).json(row);
  } catch (err) {
    next(err);
  }
}

export async function requestRefill(req, res, next) {
  try {
    res.status(201).json(await service.requestRefill(req.body));
  } catch (err) {
    next(err);
  }
}

export async function listRefillRequests(req, res, next) {
  try {
    res.json(await service.listRefillRequests(req.user, { status: req.query.status }));
  } catch (err) {
    next(err);
  }
}

export async function approveRefill(req, res, next) {
  try {
    res.json(await service.approveRefill(req.params.id, req.user));
  } catch (err) {
    next(err);
  }
}

export async function rejectRefill(req, res, next) {
  try {
    res.json(await service.rejectRefill(req.params.id, req.user, req.body?.note));
  } catch (err) {
    next(err);
  }
}
