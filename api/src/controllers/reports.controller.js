import * as service from '../services/reports.service.js';

export async function overview(req, res, next) {
  try {
    res.json(await service.overview(req.user));
  } catch (err) {
    next(err);
  }
}
