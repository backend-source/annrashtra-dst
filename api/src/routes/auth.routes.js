import { Router } from 'express';
import * as auth from '../controllers/auth.controller.js';

const router = Router();

router.post('/otp/request', auth.requestOtp);
router.post('/otp/verify', auth.verifyOtp);

export default router;
