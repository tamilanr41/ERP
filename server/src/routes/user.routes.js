import { Router } from 'express';
import {
  listRoles,
  listPermissions,
  createUser,
  listUsers,
  getUser,
  updateUser,
  setUserStatus,
  deleteUser,
  resetUserPassword,
} from '../controllers/user.controller.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { createUserRules, updateUserRules, setUserStatusRules, adminResetPasswordRules } from '../validators/auth.validators.js';

const router = Router();
router.use(authenticate);

router.get('/roles', listRoles);
router.get('/permissions', listPermissions);

router.get('/', requirePermission('USER_VIEW', 'USER_CREATE'), listUsers);
router.post('/', requirePermission('USER_CREATE'), createUserRules, createUser);
router.get('/:id', requirePermission('USER_VIEW'), getUser);
router.put('/:id', requirePermission('USER_EDIT'), updateUserRules, updateUser);
router.patch('/:id/status', requirePermission('USER_EDIT'), setUserStatusRules, setUserStatus);
router.patch('/:id/password', requirePermission('USER_EDIT'), adminResetPasswordRules, resetUserPassword);
router.delete('/:id', requirePermission('USER_DELETE'), deleteUser);

export default router;