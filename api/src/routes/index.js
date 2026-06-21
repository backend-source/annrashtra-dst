import { Router } from 'express';
import authRoutes from './auth.routes.js';
import leadsRoutes from './leads.routes.js';
import salesRoutes from './sales.routes.js';
import attendanceRoutes from './attendance.routes.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/leads', leadsRoutes);
router.use('/sales', salesRoutes);
router.use('/attendance', attendanceRoutes);

// Stubs for the remaining phase-2 verticals. Each follows the leads pattern:
// routes -> controller -> service -> repository, with requireClientUuid on writes.
// Implement next in this order; wired here so the shape is visible.
const notImplemented = (name) => (_req, res) =>
  res.status(501).json({ error: `${name} not implemented yet` });

router.use('/inventory', authenticate, notImplemented('inventory'));

export default router;
