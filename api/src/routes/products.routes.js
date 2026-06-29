import { Router } from 'express';
import * as products from '../controllers/products.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

// Anyone authenticated can read the catalogue/pricing.
router.get('/', products.list);

// Only admin adds a product or edits price/active/points (the "Products & pricing" screen).
router.post('/', requireRole('admin'), products.create);
router.patch('/:id', requireRole('admin'), products.update);

export default router;
