import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query } from '../config/db.js';
import { ApiError } from '../middleware/errorHandler.js';
import { sendOtpSms } from '../integrations/msg91.js';

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

// Step 1: request an OTP for a known user's mobile.
export async function requestLoginOtp(mobile) {
  if (!mobile) throw new ApiError(400, 'mobile is required');
  const { rows } = await query('SELECT id FROM users WHERE mobile = $1 AND status = $2', [mobile, 'active']);
  if (!rows[0]) throw new ApiError(404, 'No active user with that mobile');

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

  const { rows: users } = await query('SELECT id, role FROM users WHERE mobile = $1', [mobile]);
  const user = users[0];
  const token = jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
  return { token, user };
}
