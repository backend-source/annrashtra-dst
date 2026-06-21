import { Router } from 'express';
import authRoutes from './auth.routes.js';
import leadsRoutes from './leads.routes.js';
import salesRoutes from './sales.routes.js';
import attendanceRoutes from './attendance.routes.js';
import inventoryRoutes from './inventory.routes.js';
import productsRoutes from './products.routes.js';
import { auditWrites } from '../middleware/audit.js';

const router = Router();

// Log every authenticated, successful write (wraps res.json; see middleware/audit.js).
router.use(auditWrites);

router.use('/auth', authRoutes);
router.use('/leads', leadsRoutes);
router.use('/sales', salesRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/products', productsRoutes);

export default router;
