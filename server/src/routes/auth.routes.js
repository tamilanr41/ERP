import { Router } from 'express';
import { login, refresh, me, logout, changePassword, forgotPassword, resetPassword } from '../controllers/auth.controller.js';
import { loginRules, refreshRules, changePasswordRules, forgotPasswordRules, resetPasswordRules } from '../validators/auth.validators.js';
import { authenticate } from '../middleware/auth.js';
import { loginRateLimit, forgotPasswordRateLimit } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/login', loginRateLimit, loginRules, login);
router.post('/refresh', refreshRules, refresh);
router.post('/forgot-password', forgotPasswordRateLimit, forgotPasswordRules, forgotPassword);
router.post('/reset-password', resetPasswordRules, resetPassword);

router.use(authenticate);
router.get('/me', me);
router.post('/logout', logout);
router.post('/change-password', changePasswordRules, changePassword);

export default router;