import crypto from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env.js';
import { ApiError } from '../middleware/errorHandler.js';

const ALLOWED_FOLDERS = new Set(['selfies', 'canopy', 'leads']);
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

let _client = null;
function client() {
  const { accountId, accessKeyId, secretAccessKey } = env.r2;
  if (!accountId || !accessKeyId || !secretAccessKey || !env.r2.bucket || !env.r2.publicBase) {
    throw new ApiError(503, 'Photo storage is not configured yet');
  }
  if (!_client) {
    _client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return _client;
}

// Sanitise a client-supplied filename to a short, safe suffix (keep the extension).
function safeName(name) {
  const base = (name || 'photo.jpg').split(/[\\/]/).pop();
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-40);
}

/**
 * Issue a short-lived presigned PUT URL so the app can upload a photo straight to
 * R2, plus the public URL the app then stores on the attendance/lead record.
 */
export async function presignUpload(user, { folder, filename, contentType }) {
  if (!ALLOWED_FOLDERS.has(folder)) throw new ApiError(400, 'invalid folder');
  if (!ALLOWED_TYPES.has(contentType)) throw new ApiError(400, 'contentType must be a JPEG, PNG or WebP image');

  const key = `${folder}/${user.id}/${Date.now()}_${crypto.randomUUID()}_${safeName(filename)}`;
  const cmd = new PutObjectCommand({ Bucket: env.r2.bucket, Key: key, ContentType: contentType });
  const uploadUrl = await getSignedUrl(client(), cmd, { expiresIn: 300 }); // 5 min
  return { uploadUrl, publicUrl: `${env.r2.publicBase}/${key}`, key };
}
