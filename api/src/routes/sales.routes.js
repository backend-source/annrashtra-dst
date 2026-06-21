import { Router } from 'express';
import * as sales from '../controllers/sales.controller.js';
import { authenticate, scopeToOwnData } from '../middleware/auth.js';
import { requireClientUuid } from '../middleware/idempotency.js';

const router = Router();

router.use(authenticate);

// Record a sale (offline-safe). Promoter is scoped to themselves; prices and total
// are computed server-side from the products table.
router.post('/', scopeToOwnData, requireClientUuid, sales.create);

export default router;
