import { ApiError } from './errorHandler.js';

// Offline-first writes carry a client-generated UUID. We don't do the dedup here
// (the DB unique index on client_uuid + ON CONFLICT does the real work in the repo);
// this middleware just validates presence/shape so every write is replay-safe.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requireClientUuid(req, _res, next) {
  const id = req.body?.client_uuid;
  if (!id || !UUID_RE.test(id)) {
    return next(new ApiError(400, 'client_uuid (UUID) is required for offline-safe writes'));
  }
  next();
}
