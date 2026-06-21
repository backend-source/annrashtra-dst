import dotenv from 'dotenv';
dotenv.config();

function required(name) {
  const v = process.env[name];
  if (!v) {
    // Fail fast in production; warn in dev so the skeleton still boots.
    const msg = `Missing required env var: ${name}`;
    if (process.env.NODE_ENV === 'production') throw new Error(msg);
    console.warn(`[env] ${msg} (continuing in dev)`);
  }
  return v;
}

export const env = {
  port: parseInt(process.env.PORT || '8080', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: process.env.JWT_SECRET || 'dev-only-insecure-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',
  otpTtlSeconds: parseInt(process.env.OTP_TTL_SECONDS || '300', 10),
  msg91: {
    authKey: process.env.MSG91_AUTH_KEY,
    senderId: process.env.MSG91_SENDER_ID,
    otpTemplateId: process.env.MSG91_OTP_TEMPLATE_ID,
    whatsappNumber: process.env.MSG91_WHATSAPP_NUMBER,
    webhookSecret: process.env.MSG91_WEBHOOK_SECRET, // optional shared secret for delivery callbacks
  },
};
