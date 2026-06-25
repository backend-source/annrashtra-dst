import { ApiError } from '../middleware/errorHandler.js';
import * as repo from '../repositories/locations.repo.js';

const TYPES = new Set(['park', 'gym', 'society', 'club']);

export function list(user) {
  return user.role === 'promoter' ? repo.listForPromoter(user.id) : repo.listAll();
}

function validate(loc, { partial }) {
  if (!partial && (!loc.name || !loc.name.trim())) throw new ApiError(400, 'name is required');
  if (loc.type != null && !TYPES.has(loc.type)) throw new ApiError(400, 'type must be park, gym, society or club');
  if (loc.lat != null && typeof loc.lat !== 'number') throw new ApiError(400, 'lat must be a number');
  if (loc.lng != null && typeof loc.lng !== 'number') throw new ApiError(400, 'lng must be a number');
  if (loc.radius_m != null && (!Number.isInteger(loc.radius_m) || loc.radius_m <= 0)) {
    throw new ApiError(400, 'radius_m must be a positive integer');
  }
}

export async function create(loc) {
  validate(loc, { partial: false });
  return repo.create(loc);
}

export async function update(id, loc) {
  validate(loc, { partial: true });
  const updated = await repo.update(id, loc);
  if (!updated) throw new ApiError(404, 'Location not found');
  return updated;
}

export async function remove(id) {
  try {
    const removed = await repo.remove(id);
    if (!removed) throw new ApiError(404, 'Location not found');
    return { deleted: true };
  } catch (err) {
    // Referenced by check-ins / leads / sales — keep it so the history stays intact.
    if (err.code === '23503') {
      throw new ApiError(409, 'This location has activity (check-ins, leads or sales) and cannot be deleted. You can reassign or rename it instead.');
    }
    throw err;
  }
}
