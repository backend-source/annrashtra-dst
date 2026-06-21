import { withTransaction } from '../config/db.js';
import * as outboxRepo from '../repositories/outbox.repo.js';
import { sendWhatsapp, sendSms } from '../integrations/msg91.js';
import { confirmLeadByWhatsapp } from './leads.service.js';

const MAX_ATTEMPTS = 5;

async function dispatch(m) {
  if (m.channel === 'whatsapp') return sendWhatsapp({ to: m.to_mobile, template: m.template, payload: m.payload });
  if (m.channel === 'sms') return sendSms({ to: m.to_mobile, template: m.template, payload: m.payload });
  throw new Error(`unknown channel: ${m.channel}`);
}

// Process queued (and retryable failed) messages. Each message is handled in its
// own transaction with FOR UPDATE SKIP LOCKED, so concurrent workers never double
// send. A successful lead-confirmation also flips the lead to whatsapp_confirmed.
export async function processPending({ limit = 20 } = {}) {
  const ids = await outboxRepo.selectPendingIds(MAX_ATTEMPTS, limit);
  let sent = 0, failed = 0;

  for (const id of ids) {
    const outcome = await withTransaction(async (client) => {
      const m = await outboxRepo.lockForSend(client, id);
      if (!m) return 'skipped';                                  // locked elsewhere / gone
      if (!['queued', 'failed'].includes(m.status) || m.attempts >= MAX_ATTEMPTS) return 'skipped';
      try {
        const { provider_msg_id } = await dispatch(m);
        await outboxRepo.markSent(client, m.id, provider_msg_id);
        if (m.lead_id && m.template === 'lead_confirmation') {
          await confirmLeadByWhatsapp(client, m.lead_id);
        }
        return 'sent';
      } catch (err) {
        await outboxRepo.markFailed(client, m.id, err.message);
        return 'failed';
      }
    });
    if (outcome === 'sent') sent++;
    else if (outcome === 'failed') failed++;
  }
  return { processed: ids.length, sent, failed };
}
