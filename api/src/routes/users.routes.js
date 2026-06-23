import { Router } from 'express';
import * as users from '../controllers/users.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);
router.get('/', requireRole('admin', 'supervisor'), users.list);

export default router;
