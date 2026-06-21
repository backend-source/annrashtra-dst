import { env } from '../config/env.js';

// Thin adapter around MSG91. Real HTTP calls go here later; for now it logs so the
// rest of the app can be built and tested without DLT templates wired up.
// Keep the surface small so swapping providers stays cheap.

export async function sendOtpSms(mobile, code) {
  if (!env.msg91.authKey) {
    console.log(`[msg91:dev] OTP ${code} -> ${mobile}`);
    return { provider_msg_id: `dev-${Date.now()}` };
  }
  // TODO: POST to MSG91 OTP endpoint with otpTemplateId.
  throw new Error('MSG91 live send not implemented yet');
}

export async function sendWhatsapp({ to, template, payload }) {
  if (!env.msg91.authKey) {
    console.log(`[msg91:dev] WhatsApp template=${template} -> ${to}`, payload);
    return { provider_msg_id: `dev-${Date.now()}` };
  }
  // TODO: POST to MSG91 WhatsApp endpoint with approved utility template.
  throw new Error('MSG91 WhatsApp live send not implemented yet');
}
