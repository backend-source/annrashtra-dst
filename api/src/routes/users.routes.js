import { Router } from 'express';
import * as users from '../controllers/users.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);
router.get('/', requireRole('admin', 'supervisor'), users.list);

// Admin adds a promoter to the roster.
router.post('/', requireRole('admin'), users.create);

export default router;
