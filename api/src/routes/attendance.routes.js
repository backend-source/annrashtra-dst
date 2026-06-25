import { Router } from 'express';
import * as attendance from '../controllers/attendance.controller.js';
import { authenticate, requireRole, scopeToOwnData } from '../middleware/auth.js';
import { requireClientUuid } from '../middleware/idempotency.js';

const router = Router();

router.use(authenticate);

// Supervisor/admin review list of check-ins (for canopy verification).
router.get('/', requireRole('supervisor', 'admin'), attendance.list);

// A promoter's own recent check-ins (so the app can offer check-out).
router.get('/mine', attendance.mine);

// Promoter check-in (offline-safe, territory-checked) and check-out.
router.post('/check-in', scopeToOwnData, requireClientUuid, attendance.checkIn);
router.post('/:id/check-out', attendance.checkOut);

// Supervisor/admin verifies canopy activity, or overrides a flagged check-in.
router.post('/:id/verify', requireRole('supervisor', 'admin'), attendance.verify);
router.post('/:id/override', requireRole('supervisor', 'admin'), attendance.override);

export default router;
