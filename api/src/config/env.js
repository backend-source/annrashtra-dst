import dotenv from 'dotenv';
dotenv.config();

const isProd = (process.env.NODE_ENV || 'development') === 'production';

function required(name) {
  const v = process.env[name];
  if (!v) {
    // Fail fast in production; warn in dev so the skeleton still boots.
    const msg = `Missing required env var: ${name}`;
    if (isProd) throw new Error(msg);
    console.warn(`[env] ${msg} (continuing in dev)`);
  }
  return v;
}

// In production a real secret MUST be supplied; never fall back to a known string.
function jwtSecret() {
  const v = process.env.JWT_SECRET;
  if (v) return v;
  if (isProd) throw new Error('JWT_SECRET is required in production');
  console.warn('[env] JWT_SECRET not set — using an insecure dev default');
  return 'dev-only-insecure-secret';
}

export const env = {
  port: parseInt(process.env.PORT || '8080', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd,
  databaseUrl: required('DATABASE_URL'),
  // Comma-separated allowed browser origins for CORS (the dashboard URL in prod).
  // Empty in dev => allow all.
  corsOrigin: process.env.CORS_ORIGIN || '',
  jwtSecret: jwtSecret(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',
  otpTtlSeconds: parseInt(process.env.OTP_TTL_SECONDS || '300', 10),
  // Temporary: when true, login skips OTP (direct login by mobile) — for use until
  // MSG91/DLT is live. Defaults to false so OTP is required (secure by default).
  otpDisabled: process.env.OTP_DISABLED === 'true',
  msg91: {
    authKey: process.env.MSG91_AUTH_KEY,
    senderId: process.env.MSG91_SENDER_ID,
    otpTemplateId: process.env.MSG91_OTP_TEMPLATE_ID,
    whatsappNumber: process.env.MSG91_WHATSAPP_NUMBER,
    webhookSecret: process.env.MSG91_WEBHOOK_SECRET, // optional shared secret for delivery callbacks
  },
  // SMTP for alert emails (provider-agnostic: Resend, SES, Mailgun, etc.). When
  // unset, alert emails are skipped (never blocks the action that triggered them).
  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.ALERT_EMAIL_FROM,
    to: process.env.ALERT_EMAIL_TO, // comma-separated recipients
  },
  // Cloudflare R2 (S3-compatible) for promoter photos. When unset, the presign
  // endpoint returns 503 and the app keeps capturing photos locally.
  r2: {
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucket: process.env.R2_BUCKET,
    publicBase: (process.env.R2_PUBLIC_BASE || '').replace(/\/$/, ''), // no trailing slash
  },
};
