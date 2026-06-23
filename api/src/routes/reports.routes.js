import { Router } from 'express';
import * as reports from '../controllers/reports.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

// Role-scoped overview: promoter (self), supervisor (team), admin (all).
router.get('/overview', reports.overview);

// CSV export: type = sales | leads | attendance | inventory.
router.get('/export/:type', reports.exportReport);

export default router;
