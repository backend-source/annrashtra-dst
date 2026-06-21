import { Router } from 'express';
import * as locations from '../controllers/locations.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);
router.get('/', locations.list);

export default router;
