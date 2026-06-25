import { Router } from 'express';
import * as locations from '../controllers/locations.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

// Promoters get their assigned spots; supervisors/admins get all.
router.get('/', locations.list);

// Admin manages the canopy-spot master (name, coordinates, radius, assignment).
router.post('/', requireRole('admin'), locations.create);
router.patch('/:id', requireRole('admin'), locations.update);
router.delete('/:id', requireRole('admin'), locations.remove);

export default router;
