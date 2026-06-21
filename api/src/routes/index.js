import { Router } from 'express';
import authRoutes from './auth.routes.js';
import leadsRoutes from './leads.routes.js';
import salesRoutes from './sales.routes.js';
import attendanceRoutes from './attendance.routes.js';
import inventoryRoutes from './inventory.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/leads', leadsRoutes);
router.use('/sales', salesRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/inventory', inventoryRoutes);

export default router;
