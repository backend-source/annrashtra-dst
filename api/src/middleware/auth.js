import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from './errorHandler.js';

// Verify JWT, attach { id, role } to req.user.
export function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new ApiError(401, 'Missing bearer token'));
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(new ApiError(401, 'Invalid or expired token'));
  }
}

// Role gate: requireRole('admin', 'supervisor')
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new ApiError(401, 'Not authenticated'));
    if (!roles.includes(req.user.role)) return next(new ApiError(403, 'Forbidden'));
    next();
  };
}

// Promoters may act only on their own data. For routes where a promoter supplies
// a promoter_id, force it to themselves; admins/supervisors may target anyone.
export function scopeToOwnData(req, _res, next) {
  if (req.user?.role === 'promoter') {
    req.body.promoter_id = req.user.id;
  }
  next();
}
