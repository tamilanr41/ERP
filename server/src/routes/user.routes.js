import { Router } from 'express';
import {
  listRoles,
  listPermissions,
  createUser,
  listUsers,
  getUser,
  updateUser,
  setUserStatus,
} from '../controllers/user.controller.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { createUserRules, updateUserRules, setUserStatusRules } from '../validators/auth.validators.js';

const router = Router();
router.use(authenticate);

router.get('/roles', listRoles);
router.get('/permissions', listPermissions);

router.get('/', requirePermission('USER_VIEW', 'USER_CREATE'), listUsers);
router.post('/', requirePermission('USER_CREATE'), createUserRules, createUser);
router.get('/:id', requirePermission('USER_VIEW'), getUser);
router.put('/:id', requirePermission('USER_EDIT'), updateUserRules, updateUser);
router.patch('/:id/status', requirePermission('USER_EDIT'), setUserStatusRules, setUserStatus);

export default router;