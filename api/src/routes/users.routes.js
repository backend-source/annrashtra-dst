import { Router } from 'express';
import * as users from '../controllers/users.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);
router.get('/', requireRole('admin', 'supervisor'), users.list);

// Admin adds a promoter/supervisor to the roster.
router.post('/', requireRole('admin'), users.create);
// Admin activates/deactivates or deletes a team member.
router.patch('/:id/status', requireRole('admin'), users.setStatus);
router.delete('/:id', requireRole('admin'), users.remove);

export default router;
