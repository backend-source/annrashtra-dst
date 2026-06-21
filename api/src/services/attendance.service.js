import { ApiError } from '../middleware/errorHandler.js';
import { distanceMeters } from '../utils/geo.js';
import * as repo from '../repositories/attendance.repo.js';

const VALID_SHIFTS = new Set(['morning', 'evening']);

// Check-in with territory lock. Activity is allowed only inside the location's
// radius_m; a supervisor may override an out-of-radius check-in. Idempotent on
// client_uuid; one check-in per promoter/shift/day.
export async function checkIn(input) {
  if (!input.promoter_id) throw new ApiError(400, 'promoter_id is required');
  if (!VALID_SHIFTS.has(input.shift)) throw new ApiError(400, "shift must be 'morning' or 'evening'");
  if (!input.location_id) throw new ApiError(400, 'location_id is required');
  if (!input.selfie_url) throw new ApiError(400, 'selfie_url is required for check-in');

  const location = await repo.getLocation(input.location_id);
  if (!location) throw new ApiError(404, 'Unknown location');

  // Territory check. If the location or device has no coordinates we can't measure,
  // so in_radius stays null and we don't block.
  let inRadius = null;
  let distance = null;
  const haveCoords =
    location.lat != null && location.lng != null &&
    input.gps_lat != null && input.gps_lng != null;
  if (haveCoords) {
    distance = distanceMeters(location.lat, location.lng, input.gps_lat, input.gps_lng);
    inRadius = distance <= location.radius_m;
  }

  // Out of radius -> require a valid supervisor override.
  let overrideBy = null;
  let overrideReason = null;
  if (inRadius === false) {
    if (!input.override_by || !input.override_reason) {
      throw new ApiError(403, 'Outside territory radius; supervisor override required', {
        distance_m: Math.round(distance), radius_m: location.radius_m,
      });
    }
    const overrider = await repo.getUser(input.override_by);
    if (!overrider || !['supervisor', 'admin'].includes(overrider.role) || overrider.status !== 'active') {
      throw new ApiError(403, 'override_by must be an active supervisor or admin');
    }
    overrideBy = overrider.id;
    overrideReason = input.override_reason;
  }

  try {
    const row = await repo.insertCheckIn({
      promoter_id: input.promoter_id,
      location_id: input.location_id,
      shift: input.shift,
      gps_lat: input.gps_lat,
      gps_lng: input.gps_lng,
      selfie_url: input.selfie_url,
      canopy_photo_url: input.canopy_photo_url,
      in_radius: inRadius,
      override_by: overrideBy,
      override_reason: overrideReason,
      client_uuid: input.client_uuid,
    });
    return { ...row, distance_m: distance == null ? null : Math.round(distance) };
  } catch (err) {
    if (err.code === '23505') {
      throw new ApiError(409, 'Already checked in for this shift today');
    }
    throw err;
  }
}

export async function checkOut(id, user) {
  const att = await repo.getById(id);
  if (!att) throw new ApiError(404, 'Attendance not found');
  if (user.role === 'promoter' && att.promoter_id !== user.id) {
    throw new ApiError(403, 'Cannot check out another promoter');
  }
  return repo.checkOut(id);
}

// Supervisor/admin verifies the canopy activity.
export async function verify(id, user) {
  if (!['supervisor', 'admin'].includes(user.role)) {
    throw new ApiError(403, 'Only a supervisor or admin can verify');
  }
  const updated = await repo.setVerifiedBy(id, user.id);
  if (!updated) throw new ApiError(404, 'Attendance not found');
  return updated;
}
