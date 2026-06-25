import { Router } from 'express';
import * as uploads from '../controllers/uploads.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

// Get a short-lived presigned URL to upload a photo to R2.
router.post('/presign', uploads.presign);

export default router;
