import * as service from '../services/uploads.service.js';

// Promoter (or any authenticated user) asks for a presigned URL to upload one photo.
export async function presign(req, res, next) {
  try {
    res.json(await service.presignUpload(req.user, req.body));
  } catch (err) {
    next(err);
  }
}
