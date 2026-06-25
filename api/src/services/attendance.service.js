import { ApiError } from '../middleware/errorHandler.js';
import { distanceMeters } from '../utils/geo.js';
import * as repo from '../repositories/attendance.repo.js';

const VALID_SHIFTS = new Set(['morning', 'evening']);

// Check-in with a soft geofence. The promoter is never blocked: we record the
// GPS + photos and flag whether they were inside the location's radius_m. A
// supervisor reviews flagged (out-of-geofence) check-ins on the dashboard and
// overrides them with a reason. Idempotent on client_uuid; one per shift/day.
export async function checkIn(input) {
  if (!input.promoter_id) throw new ApiError(400, 'promoter_id is required');
  if (!VALID_SHIFTS.has(input.shift)) throw new ApiError(400, "shift must be 'morning' or 'evening'");
  if (!input.location_id) throw new ApiError(400, 'location_id is required');
  if (!input.selfie_url) throw new ApiError(400, 'selfie_url is required for check-in');

  const location = await repo.getLocation(input.location_id);
  if (!location) throw new ApiError(404, 'Unknown location');

  // Geofence check. If the location or device has no coordinates we can't measure,
  // so in_radius stays null. Out-of-radius is FLAGGED (in_radius=false), not blocked.
  let inRadius = null;
  let distance = null;
  const haveCoords =
    location.lat != null && location.lng != null &&
    input.gps_lat != null && input.gps_lng != null;
  if (haveCoords) {
    distance = distanceMeters(location.lat, location.lng, input.gps_lat, input.gps_lng);
    inRadius = distance <= location.radius_m;
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
      override_by: null,
      override_reason: null,
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

// Supervisor/admin approves (overrides) a flagged out-of-geofence check-in, with
// a reason — after reviewing the selfie/canopy photos and the map.
export async function override(id, user, reason) {
  if (!['supervisor', 'admin'].includes(user.role)) throw new ApiError(403, 'Only a supervisor or admin can override');
  if (!reason || !reason.trim()) throw new ApiError(400, 'A reason is required to override');
  const updated = await repo.setOverride(id, user.id, reason.trim());
  if (!updated) throw new ApiError(404, 'Attendance not found');
  return updated;
}

// Supervisor/admin review list. Supervisors are scoped to their own promoters.
export function listForReview(user) {
  const supervisorId = user.role === 'supervisor' ? user.id : null;
  return repo.listForReview({ supervisorId });
}

// A promoter's own recent check-ins (for the app's check-out screen).
export function listForPromoter(promoterId) {
  return repo.listForPromoter(promoterId);
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
