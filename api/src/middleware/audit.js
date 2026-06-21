import { logAudit } from '../services/audit.js';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Logs every authenticated, successful write. Wraps res.json so it captures the
// response body as the "after" image, derives the entity from the router mount,
// and durably writes the audit row BEFORE the response is delivered (so a logged
// write is guaranteed logged). An audit failure is reported but never fails the
// underlying request, which has already succeeded.
export function auditWrites(req, res, next) {
  if (!WRITE_METHODS.has(req.method)) return next();
  const orig = res.json.bind(res);
  res.json = (body) => {
    const ok = res.statusCode >= 200 && res.statusCode < 300;
    if (!ok || !req.user) return orig(body);
    const entity = (req.baseUrl || '').split('/').filter(Boolean).pop() || 'unknown';
    logAudit(null, {
      actor_id: req.user.id,
      role: req.user.role,
      action: `${req.method} ${req.baseUrl}${req.path}`,
      entity,
      entity_id: body?.id ?? null,
      after: body,
    }).then(
      () => orig(body),
      (err) => { console.error('[audit] failed:', err.message); orig(body); },
    );
    return res;
  };
  next();
}
