import { success, created } from '../utils/apiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { writeAudit } from '../middleware/audit.js';
import { listRolesService, listPermissionsService, setUserStatusService, updateUserService, deleteUserService, resetUserPasswordService } from '../services/user.service.js';
import { createUserService } from '../services/auth.service.js';

export const listRoles = asyncHandler(async (req, res) => {
  success(res, await listRolesService(req.query), 'Roles fetched');
});

export const listPermissions = asyncHandler(async (req, res) => {
  success(res, await listPermissionsService(), 'Permissions fetched');
});

export const createUser = asyncHandler(async (req, res) => {
  const user = await createUserService(req.body, req.user);
  await writeAudit({ user: req.user, action: 'USER_CREATE', module: 'users', entityId: user._id, entityType: 'User', req });
  created(res, user.toSafeJSON(), 'User created');
});

export const listUsers = asyncHandler(async (req, res) => {
  const { listUsersService } = await import('../services/auth.service.js');
  const result = await listUsersService(req.query);
  success(res, result.data, 'Users fetched', result.pagination);
});

export const getUser = asyncHandler(async (req, res) => {
  const { default: User } = await import('../models/User.model.js');
  const user = await User.findById(req.params.id).select('-passwordHash -refreshTokens').populate('role', 'name displayName').populate('departmentId', 'name');
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  success(res, user, 'User fetched');
});

export const updateUser = asyncHandler(async (req, res) => {
  const user = await updateUserService(req.params.id, req.body, req.user);
  await writeAudit({ user: req.user, action: 'USER_UPDATE', module: 'users', entityId: req.params.id, entityType: 'User', data: { ...req.body }, req });
  success(res, user, 'User updated');
});

export const setUserStatus = asyncHandler(async (req, res) => {
  const user = await setUserStatusService(req.params.id, req.body.status, req.user);
  await writeAudit({ user: req.user, action: 'USER_STATUS_CHANGE', module: 'users', entityId: req.params.id, entityType: 'User', data: { status: req.body.status }, req });
  success(res, user, 'User status updated');
});

export const deleteUser = asyncHandler(async (req, res) => {
  const user = await deleteUserService(req.params.id, req.user);
  await writeAudit({ user: req.user, action: 'USER_DELETE', module: 'users', entityId: req.params.id, entityType: 'User', req });
  success(res, user, 'User deactivated');
});

export const resetUserPassword = asyncHandler(async (req, res) => {
  const result = await resetUserPasswordService(req.params.id, req.body.newPassword, req.user);
  await writeAudit({
    user: req.user,
    action: 'USER_PASSWORD_RESET',
    module: 'users',
    entityId: req.params.id,
    entityType: 'User',
    req,
  });
  success(res, result, 'Password reset. The user must sign in again.');
});