import { Router } from 'express';
import * as reports from '../controllers/reports.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

// Role-scoped overview: promoter (self), supervisor (team), admin (all).
router.get('/overview', reports.overview);

// Promoter's own dashboard (stock in hand, leads, cash/UPI in hand, points).
router.get('/me', reports.me);

// Cash & UPI running-balance ledger (role-scoped) — powers the dashboard balance view.
router.get('/ledger', reports.ledger);

// Admin: send a test alert email (to verify SMTP config).
router.post('/test-email', requireRole('admin'), reports.testEmail);

// CSV export: type = sales | leads | attendance | inventory.
router.get('/export/:type', reports.exportReport);

export default router;
