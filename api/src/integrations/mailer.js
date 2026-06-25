import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let _transport = null;
function transport() {
  const { host, port, user, pass } = env.smtp;
  if (!host || !user || !pass) return null; // not configured
  if (!_transport) {
    _transport = nodemailer.createTransport({
      host, port,
      secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
      auth: { user, pass },
    });
  }
  return _transport;
}

export function mailConfigured() {
  return !!(env.smtp.host && env.smtp.user && env.smtp.pass && env.smtp.from && env.smtp.to);
}

// Send an email. Best-effort: never throws to the caller — a mail failure must not
// break the action that triggered it. Returns true if sent.
export async function sendMail({ subject, text, html }) {
  const t = transport();
  if (!t || !env.smtp.from || !env.smtp.to) {
    console.log('[mail] skipped (SMTP not configured):', subject);
    return false;
  }
  try {
    await t.sendMail({ from: env.smtp.from, to: env.smtp.to, subject, text, html });
    return true;
  } catch (err) {
    console.error('[mail] send failed:', err.message);
    return false;
  }
}
