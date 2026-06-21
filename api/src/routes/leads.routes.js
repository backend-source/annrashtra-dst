import { Router } from 'express';
import * as leads from '../controllers/leads.controller.js';
import { authenticate, requireRole, scopeToOwnData } from '../middleware/auth.js';
import { requireClientUuid } from '../middleware/idempotency.js';

const router = Router();

router.use(authenticate);

// Capture a manual lead (offline-safe). Promoters are scoped to themselves.
router.post('/', scopeToOwnData, requireClientUuid, leads.create);

// List leads — promoters see only their own (enforced in the service).
router.get('/', leads.list);

// Verify / convert a lead (supervisor or admin). Awards points on transition.
router.patch('/:id/state', requireRole('supervisor', 'admin'), leads.updateState);

export default router;
