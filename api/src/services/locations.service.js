import { ApiError } from '../middleware/errorHandler.js';
import * as repo from '../repositories/locations.repo.js';

const TYPES = new Set(['park', 'gym', 'society', 'club']);
// The geofence radius auto-built around a promoter's captured point.
export const GEOFENCE_RADIUS_M = 150;

// Promoter sees own spots; supervisor their team's; admin all.
export function list(user) {
  if (user.role === 'promoter') return repo.listForPromoter(user.id);
  return repo.listForReview({ supervisorId: user.role === 'supervisor' ? user.id : null });
}

// Promoter proposes a spot from their current GPS. Radius is auto-set (no manual entry).
export async function propose(user, input) {
  const lat = Number(input.lat);
  const lng = Number(input.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new ApiError(400, 'A valid current location (lat/lng) is required');
  if (input.type != null && !TYPES.has(input.type)) throw new ApiError(400, 'type must be park, gym, society or club');
  return repo.propose({
    name: (input.name && input.name.trim()) || 'My spot',
    area: input.area?.trim() || null,
    type: input.type ?? null,
    lat, lng,
    radius_m: GEOFENCE_RADIUS_M,
    promoter_id: user.id,
  });
}

// Supervisor/admin confirms a pending spot -> active (geofence goes live).
export async function confirm(id, user) {
  if (!['supervisor', 'admin'].includes(user.role)) throw new ApiError(403, 'Only a supervisor or admin can confirm a spot');
  const loc = await repo.getById(id);
  if (!loc) throw new ApiError(404, 'Location not found');
  if (loc.status === 'active') return loc; // idempotent
  return repo.confirm(id, user.id);
}

// Supervisor/admin rejects a still-pending proposed spot (removes it).
export async function reject(id, user) {
  if (!['supervisor', 'admin'].includes(user.role)) throw new ApiError(403, 'Only a supervisor or admin can reject a spot');
  const loc = await repo.getById(id);
  if (!loc) throw new ApiError(404, 'Location not found');
  if (loc.status !== 'pending') throw new ApiError(409, 'Only a pending spot can be rejected');
  await repo.remove(id);
  return { deleted: true };
}

export async function remove(id, user) {
  if (user.role !== 'admin') throw new ApiError(403, 'Only an admin can delete a confirmed spot');
  try {
    const removed = await repo.remove(id);
    if (!removed) throw new ApiError(404, 'Location not found');
    return { deleted: true };
  } catch (err) {
    if (err.code === '23503') throw new ApiError(409, 'This location has activity (check-ins, leads or sales) and cannot be deleted.');
    throw err;
  }
}

export async function update(id, loc) {
  if (loc.type != null && !TYPES.has(loc.type)) throw new ApiError(400, 'type must be park, gym, society or club');
  const updated = await repo.update(id, loc);
  if (!updated) throw new ApiError(404, 'Location not found');
  return updated;
}
