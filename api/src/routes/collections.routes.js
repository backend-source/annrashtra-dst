import { Router } from 'express';
import * as collections from '../controllers/collections.controller.js';
import { authenticate, requireRole, scopeToOwnData } from '../middleware/auth.js';
import { requireClientUuid } from '../middleware/idempotency.js';

const router = Router();

router.use(authenticate);

// Promoter hands over the day's cash (offline-safe).
router.post('/', scopeToOwnData, requireClientUuid, collections.create);

// List — promoter sees own, supervisor their team, admin all.
router.get('/', collections.list);

// Supervisor/admin verifies and confirms receipt.
router.post('/:id/confirm', requireRole('supervisor', 'admin'), collections.confirm);

export default router;
