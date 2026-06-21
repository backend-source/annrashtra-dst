import { env } from '../config/env.js';
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

// Public MSG91 delivery callback. Flips sent -> delivered and confirms the lead.
// Optionally gated by a shared secret. Always 200s on unknown ids so MSG91 stops
// retrying. MSG91's report shape varies, so we accept several field names.
export async function webhook(req, res, next) {
  try {
    if (env.msg91.webhookSecret && req.headers['x-webhook-secret'] !== env.msg91.webhookSecret) {
      return res.status(401).json({ error: 'invalid webhook secret' });
    }
    const provider_msg_id = req.body?.provider_msg_id || req.body?.request_id || req.body?.id;
    const status = req.body?.status || req.body?.event;
    res.json(await outboxService.applyDeliveryReport({ provider_msg_id, status }));
  } catch (err) {
    next(err);
  }
}
