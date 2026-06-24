import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query } from '../config/db.js';
import { ApiError } from '../middleware/errorHandler.js';
import { sendOtpSms } from '../integrations/msg91.js';

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

function issueToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

// Single entry point the app calls first. When OTP is disabled (temporary, until
// MSG91/DLT is live) this logs the user in directly by mobile. Otherwise it tells
// the app to fall back to the OTP flow — so the SAME app works in both modes and
// no rebuild is needed when OTP is turned back on.
export async function login(mobile) {
  if (!env.otpDisabled) return { otpRequired: true };
  if (!mobile) throw new ApiError(400, 'mobile is required');
  const { rows } = await query('SELECT id, role, name FROM users WHERE mobile = $1 AND status = $2', [mobile, 'active']);
  if (!rows[0]) throw new ApiError(404, 'No active user with that mobile');
  return { token: issueToken(rows[0]), user: rows[0] };
}

const OTP_COOLDOWN_MS = 30_000; // min gap between requests for a mobile
const OTP_MAX_PER_HOUR = 5;

// Step 1: request an OTP for a known user's mobile.
export async function requestLoginOtp(mobile) {
  if (!mobile) throw new ApiError(400, 'mobile is required');
  const { rows } = await query('SELECT id FROM users WHERE mobile = $1 AND status = $2', [mobile, 'active']);
  if (!rows[0]) throw new ApiError(404, 'No active user with that mobile');

  // Rate-limit OTP requests per mobile (this endpoint is unauthenticated).
  const recent = await query(
    `SELECT count(*)::int n, max(created_at) AS last
     FROM otp_verifications
     WHERE mobile = $1 AND purpose = 'login' AND created_at > now() - interval '1 hour'`,
    [mobile],
  );
  if (recent.rows[0].n >= OTP_MAX_PER_HOUR) {
    throw new ApiError(429, 'Too many OTP requests. Please try again later.');
  }
  const last = recent.rows[0].last;
  if (last && Date.now() - new Date(last).getTime() < OTP_COOLDOWN_MS) {
    throw new ApiError(429, 'Please wait a moment before requesting another OTP.');
  }

  const code = generateOtp();
  const codeHash = await bcrypt.hash(code, 8);
  const expiresAt = new Date(Date.now() + env.otpTtlSeconds * 1000);
  await query(
    `INSERT INTO otp_verifications (purpose, mobile, code_hash, expires_at)
     VALUES ('login', $1, $2, $3)`,
    [mobile, codeHash, expiresAt],
  );
  await sendOtpSms(mobile, code);
  return { sent: true };
}

// Step 2: verify the OTP and issue a JWT.
export async function verifyLoginOtp(mobile, code) {
  if (!mobile || !code) throw new ApiError(400, 'mobile and code are required');
  const { rows } = await query(
    `SELECT * FROM otp_verifications
     WHERE mobile = $1 AND purpose = 'login' AND consumed_at IS NULL AND expires_at > now()
     ORDER BY created_at DESC LIMIT 1`,
    [mobile],
  );
  const otp = rows[0];
  if (!otp) throw new ApiError(400, 'No valid OTP; request a new one');
  if (otp.attempts >= 5) throw new ApiError(429, 'Too many attempts; request a new OTP');

  const ok = await bcrypt.compare(code, otp.code_hash);
  if (!ok) {
    await query('UPDATE otp_verifications SET attempts = attempts + 1 WHERE id = $1', [otp.id]);
    throw new ApiError(401, 'Incorrect OTP');
  }
  await query('UPDATE otp_verifications SET consumed_at = now() WHERE id = $1', [otp.id]);

  const { rows: users } = await query('SELECT id, role, name FROM users WHERE mobile = $1', [mobile]);
  return { token: issueToken(users[0]), user: users[0] };
}
