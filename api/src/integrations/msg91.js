import { env } from '../config/env.js';

// MSG91 adapter. In dev (no auth key) it logs instead of sending so the whole
// pipeline is testable without DLT templates. The real HTTP calls are wired but
// UNTESTED until live credentials + approved templates are configured.
const DEV = !env.msg91.authKey;

// Test hook: a send to this number always fails, so the retry/failure path is
// exercisable in dev. Real numbers are never this value.
const FAIL_SENTINEL = '0000000000';

function checkSentinel(to) {
  if (to === FAIL_SENTINEL) throw new Error('simulated MSG91 failure (sentinel number)');
}

async function postMsg91(path, body) {
  const res = await fetch(`https://control.msg91.com${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authkey: env.msg91.authKey },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `MSG91 HTTP ${res.status}`);
  return data;
}

export async function sendWhatsapp({ to, template, payload }) {
  checkSentinel(to);
  if (DEV) {
    console.log(`[msg91:dev] WhatsApp template=${template} -> ${to}`, payload);
    return { provider_msg_id: `dev-wa-${Date.now()}` };
  }
  // TODO(live): map (template, payload) to an approved WhatsApp template payload.
  const data = await postMsg91('/api/v5/whatsapp/whatsapp-outbound-message/bulk/', {
    integrated_number: env.msg91.whatsappNumber, to: [to], template, payload,
  });
  return { provider_msg_id: data.request_id || data.id || 'msg91' };
}

export async function sendSms({ to, template, payload }) {
  checkSentinel(to);
  if (DEV) {
    console.log(`[msg91:dev] SMS template=${template} -> ${to}`, payload);
    return { provider_msg_id: `dev-sms-${Date.now()}` };
  }
  const data = await postMsg91('/api/v5/flow/', {
    template_id: template, sender: env.msg91.senderId, recipients: [{ mobiles: to, ...payload }],
  });
  return { provider_msg_id: data.request_id || 'msg91' };
}

// Login OTP (synchronous, not via the outbox).
export async function sendOtpSms(mobile, code) {
  checkSentinel(mobile);
  if (DEV) {
    console.log(`[msg91:dev] OTP ${code} -> ${mobile}`);
    return { provider_msg_id: `dev-otp-${Date.now()}` };
  }
  const data = await postMsg91('/api/v5/otp', {
    template_id: env.msg91.otpTemplateId, mobile, otp: code,
  });
  return { provider_msg_id: data.request_id || 'msg91' };
}
