import { Router } from 'express';
import * as attendance from '../controllers/attendance.controller.js';
import { authenticate, requireRole, scopeToOwnData } from '../middleware/auth.js';
import { requireClientUuid } from '../middleware/idempotency.js';

const router = Router();

router.use(authenticate);

// Promoter check-in (offline-safe, territory-checked) and check-out.
router.post('/check-in', scopeToOwnData, requireClientUuid, attendance.checkIn);
router.post('/:id/check-out', attendance.checkOut);

// Supervisor/admin verifies canopy activity.
router.post('/:id/verify', requireRole('supervisor', 'admin'), attendance.verify);

export default router;
