import { Router } from 'express';
import * as locations from '../controllers/locations.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

// Promoter gets their own spots; supervisor their team's; admin all.
router.get('/', locations.list);

// Promoter proposes a spot from their current GPS (pending until confirmed).
router.post('/propose', requireRole('promoter'), locations.propose);

// Supervisor/admin confirms or rejects a proposed spot.
router.post('/:id/confirm', requireRole('supervisor', 'admin'), locations.confirm);
router.post('/:id/reject', requireRole('supervisor', 'admin'), locations.reject);

// Admin can rename/adjust or delete a spot (coordinates come from the promoter's GPS).
router.patch('/:id', requireRole('admin'), locations.update);
router.delete('/:id', requireRole('admin'), locations.remove);

export default router;
