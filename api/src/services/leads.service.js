import { ApiError } from '../middleware/errorHandler.js';
import { withTransaction } from '../config/db.js';
import { POINTS } from '../config/points.js';
import * as leadsRepo from '../repositories/leads.repo.js';
import * as pointsRepo from '../repositories/points.repo.js';
import * as outboxRepo from '../repositories/outbox.repo.js';
import { isValidMobile } from '../utils/validators.js';

const VERIFY_STATUSES = new Set(['unverified', 'whatsapp_confirmed', 'otp_verified']);
const VERIFIED = new Set(['whatsapp_confirmed', 'otp_verified']);
const STATUSES = new Set(['new', 'contacted', 'converted', 'dropped']);

// Manual leads are captured immediately as 'unverified' and are NEVER blocked on OTP.
// WhatsApp delivery later moves them to 'whatsapp_confirmed'; QR leads use customer
// OTP -> 'otp_verified' (handled in the QR/OTP flow, not here).
export async function captureManualLead(input) {
  if (!input.promoter_id) throw new ApiError(400, 'promoter_id is required');
  if (!isValidMobile(input.mobile)) throw new ApiError(400, 'mobile must be exactly 10 digits');

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

  // Enqueue the WhatsApp confirmation (sent later by the outbox worker). On a
  // successful send the worker calls confirmLeadByWhatsapp() to move the lead to
  // 'whatsapp_confirmed' and award points. dedupe_key makes the enqueue idempotent.
  await outboxRepo.enqueue(null, {
    channel: 'whatsapp',
    to_mobile: lead.mobile,
    template: 'lead_confirmation',
    payload: { name: lead.name, lead_id: lead.id },
    lead_id: lead.id,
    dedupe_key: `lead_confirm:${lead.id}`,
  });
  return lead;
}

// Called by the outbox worker when a lead-confirmation WhatsApp send succeeds.
// Manual leads start 'unverified' and are confirmed here (never blocked on this).
// Idempotent: only the first transition out of 'unverified' awards points.
export async function confirmLeadByWhatsapp(client, leadId) {
  const lead = await leadsRepo.getByIdForUpdate(client, leadId);
  if (!lead || lead.verify_status !== 'unverified') return false;
  await leadsRepo.updateState(client, leadId, { verify_status: 'whatsapp_confirmed' });
  await pointsRepo.awardForLead(client, {
    promoter_id: lead.promoter_id, points: POINTS.lead_verified, reason: 'lead_verified', lead_id: leadId,
  });
  return true;
}

export function listLeads(user) {
  const promoterId = user.role === 'promoter' ? user.id : null;
  return leadsRepo.listLeads({ promoterId });
}

// Supervisor/admin moves a lead's verification or status. Points are awarded ONLY
// on the transition INTO a verified state or into 'converted' — and only once
// (the promoter_points unique on (lead_id, reason) guards replays). This is the
// single place the "rewards count only verified/converted leads" rule lives.
export async function updateLeadState(id, { verify_status, status }) {
  if (verify_status && !VERIFY_STATUSES.has(verify_status)) throw new ApiError(400, 'invalid verify_status');
  if (status && !STATUSES.has(status)) throw new ApiError(400, 'invalid status');
  if (!verify_status && !status) throw new ApiError(400, 'nothing to update');

  return withTransaction(async (client) => {
    const lead = await leadsRepo.getByIdForUpdate(client, id);
    if (!lead) throw new ApiError(404, 'Lead not found');

    const updated = await leadsRepo.updateState(client, id, { verify_status, status });

    if (verify_status && VERIFIED.has(verify_status) && !VERIFIED.has(lead.verify_status)) {
      await pointsRepo.awardForLead(client, {
        promoter_id: lead.promoter_id, points: POINTS.lead_verified, reason: 'lead_verified', lead_id: id,
      });
    }
    // Conversion no longer awards a flat bonus (#10) — reward points now come from
    // the packets actually sold, credited on the sale itself.
    return updated;
  });
}
