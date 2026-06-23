import { Router } from 'express';
import * as inv from '../controllers/inventory.controller.js';
import { authenticate, requireRole, scopeToOwnData } from '../middleware/auth.js';
import { requireClientUuid } from '../middleware/idempotency.js';

const router = Router();

router.use(authenticate);

// Daily stock cycle (opening/refill/sold/closing). Promoter sees own; a
// supervisor/admin may pass ?promoter_id=.
router.get('/', inv.dailyCycle);

// Promoter records opening allocation (offline-safe).
router.post('/opening', scopeToOwnData, requireClientUuid, inv.recordOpening);

// Refill workflow: promoter requests; ADMIN approves/rejects; promoter confirms delivery.
router.post('/refill-requests', scopeToOwnData, requireClientUuid, inv.requestRefill);
router.get('/refill-requests', inv.listRefillRequests);
router.post('/refill-requests/:id/approve', requireRole('admin'), inv.approveRefill);
router.post('/refill-requests/:id/reject', requireRole('admin'), inv.rejectRefill);
router.post('/refill-requests/:id/confirm', inv.confirmRefill); // promoter (own) confirms delivery

export default router;
