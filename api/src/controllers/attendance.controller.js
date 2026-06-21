import * as service from '../services/attendance.service.js';

export async function checkIn(req, res, next) {
  try {
    const row = await service.checkIn(req.body);
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
}

export async function checkOut(req, res, next) {
  try {
    res.json(await service.checkOut(req.params.id, req.user));
  } catch (err) {
    next(err);
  }
}

export async function verify(req, res, next) {
  try {
    res.json(await service.verify(req.params.id, req.user));
  } catch (err) {
    next(err);
  }
}
