import rateLimit from 'express-rate-limit';
import config from '../config/index.js';

/**
 * Clinical workstations are chatty: the bed board, command centre, MAR and
 * billing desk all poll while an admission is open, and several consoles can
 * be open at once. The limit therefore has to allow sustained authenticated
 * traffic, while auth endpoints keep a tight, brute-force-proof limit.
 */
export const globalRateLimit = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  // never count static client assets or health probes against the API budget
  skip: (req) => req.path === '/health' || req.path.startsWith('/uploads'),
  message: { success: false, message: 'Too many requests, please try again later' },
});

export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Too many login attempts, please try again later' },
});

export const forgotPasswordRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many password reset attempts' },
});

export default globalRateLimit;