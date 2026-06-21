import { Router } from 'express';
import * as outbox from '../controllers/outbox.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// Public: MSG91 delivery callback (no JWT; optionally gated by a shared secret).
// Declared before authenticate so the provider can reach it.
router.post('/webhook', outbox.webhook);

router.use(authenticate);

// Trigger a send pass on demand (admin). Production uses the interval worker.
router.post('/process', requireRole('admin'), outbox.process);

export default router;
