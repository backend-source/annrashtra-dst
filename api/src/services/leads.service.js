import { ApiError } from '../middleware/errorHandler.js';
import * as leadsRepo from '../repositories/leads.repo.js';

// Manual leads are captured immediately as 'unverified' and are NEVER blocked on OTP.
// WhatsApp delivery later moves them to 'whatsapp_confirmed'; QR leads use customer
// OTP -> 'otp_verified' (handled in the QR/OTP flow, not here).
export async function captureManualLead(input) {
  if (!input.mobile) throw new ApiError(400, 'mobile is required');
  if (!input.promoter_id) throw new ApiError(400, 'promoter_id is required');

  // Friendly duplicate handling: leads.mobile is globally unique. If this number
  // is already a lead and it's a genuine new client_uuid, surface a 409 rather
  // than letting the DB throw a raw unique violation.
  const existing = await leadsRepo.findLeadByMobile(input.mobile);
  if (existing && existing.client_uuid !== input.client_uuid) {
    throw new ApiError(409, 'This mobile is already captured as a lead', {
      lead_id: existing.id,
    });
  }

  const lead = await leadsRepo.insertLeadIdempotent({
    promoter_id: input.promoter_id,
    location_id: input.location_id,
    customer_id: input.customer_id,
    name: input.name,
    mobile: input.mobile,
    health_concern: input.health_concern,
    product_interest: input.product_interest,
    source: 'manual',
    verify_status: 'unverified',
    status: 'new',
    in_radius: input.in_radius,
    override_by: input.override_by,
    override_reason: input.override_reason,
    client_uuid: input.client_uuid,
  });

  // TODO (phase 3): enqueue an outbox_messages WhatsApp confirmation; on delivery
  // webhook, set verify_status = 'whatsapp_confirmed' and award promoter_points.
  return lead;
}

export function listLeads(user) {
  const promoterId = user.role === 'promoter' ? user.id : null;
  return leadsRepo.listLeads({ promoterId });
}
