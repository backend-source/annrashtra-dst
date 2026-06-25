import { Router } from 'express';
import * as collections from '../controllers/collections.controller.js';
import { authenticate, requireRole, scopeToOwnData } from '../middleware/auth.js';
import { requireClientUuid } from '../middleware/idempotency.js';

const router = Router();

router.use(authenticate);

// Promoter hands over the day's cash + UPI (offline-safe).
router.post('/', scopeToOwnData, requireClientUuid, collections.create);

// List — promoter sees own, supervisor their team, admin all.
router.get('/', collections.list);

// Supervisor/admin verifies the handover (can edit the amounts) -> 'verified'.
router.post('/:id/verify', requireRole('supervisor', 'admin'), collections.verify);

// Promoter gives final acceptance -> 'received' (or disputes -> back to supervisor).
// Ownership is enforced in the service (only the promoter who submitted it).
router.post('/:id/accept', collections.accept);
router.post('/:id/dispute', collections.dispute);

export default router;
