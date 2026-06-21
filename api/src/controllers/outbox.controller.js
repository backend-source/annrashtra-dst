import * as outboxService from '../services/outbox.service.js';

// Manually trigger a processing pass (admin). The standalone worker
// (scripts/outbox-worker.js) does the same on an interval in production.
export async function process(req, res, next) {
  try {
    const limit = Math.min(Number(req.body?.limit) || 50, 200);
    res.json(await outboxService.processPending({ limit }));
  } catch (err) {
    next(err);
  }
}
