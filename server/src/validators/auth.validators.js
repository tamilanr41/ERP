import { body } from 'express-validator';
import { validate } from '../middleware/validate.js';

export const loginRules = validate([
  body('usernameOrEmail').trim().notEmpty().withMessage('Username or email is required'),
  body('password').notEmpty().withMessage('Password is required'),
]);

export const refreshRules = validate([
  body('refreshToken').notEmpty().withMessage('Refresh token is required'),
]);

export const changePasswordRules = validate([
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).*$/)
    .withMessage('New password must contain uppercase, lowercase and a number'),
]);

export const resetPasswordRules = validate([
  body('token').notEmpty().withMessage('Reset token is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
]);

export const forgotPasswordRules = validate([
  body('email').isEmail().withMessage('Valid email is required'),
]);

export const createUserRules = validate([
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('roleId').isMongoId().withMessage('Valid role is required'),
  body('phone').optional().matches(/^[0-9+ -]{8,15}$/).withMessage('Invalid phone number'),
]);

export const updateUserRules = validate([
  body('firstName').optional().trim().notEmpty(),
  body('email').optional().isEmail(),
  body('roleId').optional().isMongoId(),
]);

export const setUserStatusRules = validate([
  body('status').isIn(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'LOCKED']).withMessage('Invalid status'),
]);

// An administrator setting a colleague's password bypasses the complexity rule
// used for self-service changes on purpose: a temporary credential handed over
// at a nursing station should not fail validation, only the length floor holds.
export const adminResetPasswordRules = validate([
  body('newPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
]);