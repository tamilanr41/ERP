import { success, created } from '../utils/apiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { loginUser, refreshAccessToken, changePasswordService, createUserService, listUsersService } from '../services/auth.service.js';
import { writeAudit } from '../middleware/audit.js';

export const login = asyncHandler(async (req, res) => {
  const result = await loginUser(req.body, req);
  success(res, result, 'Login successful');
});

export const refresh = asyncHandler(async (req, res) => {
  const result = await refreshAccessToken(req.body.refreshToken);
  success(res, result, 'Token refreshed');
});

export const me = asyncHandler(async (req, res) => {
  success(res, req.user, 'Current user');
});

export const logout = asyncHandler(async (req, res) => {
  if (req.user) {
    await writeAudit({ user: req.user, action: 'LOGOUT', module: 'auth', req, entityId: req.user.id });
  }
  success(res, null, 'Logged out');
});

export const changePassword = asyncHandler(async (req, res) => {
  await changePasswordService(req.user?.id, req.body);
  await writeAudit({ user: req.user, action: 'CHANGE_PASSWORD', module: 'auth', req });
  success(res, null, 'Password changed successfully');
});

export const forgotPassword = asyncHandler(async (req, res) => {
  // In production this sends an email with reset link. For now we acknowledge safely.
  success(res, null, 'If an account exists for this email, a reset link has been sent');
});

export const resetPassword = asyncHandler(async (req, res) => {
  // Placeholder: full token based reset implemented via email provider in production.
  success(res, null, 'Password reset flow not configured');
});

export const createUser = asyncHandler(async (req, res) => {
  const user = await createUserService(req.body, req.user);
  await writeAudit({ user: req.user, action: 'USER_CREATE', module: 'users', entityId: user._id, entityType: 'User', req });
  created(res, user.toSafeJSON(), 'User created');
});

export const listUsers = asyncHandler(async (req, res) => {
  const result = await listUsersService(req.query);
  success(res, result.data, 'Users fetched', result.pagination);
});

export const listRoles = asyncHandler(async (req, res) => {
  const { listRoles } = await import('../services/user.service.js');
  const roles = await listRoles(req.query);
  success(res, roles, 'Roles fetched');
});

export const listPermissions = asyncHandler(async (req, res) => {
  const { listPermissions } = await import('../services/user.service.js');
  success(res, await listPermissions(), 'Permissions fetched');
});

export const setUserStatus = asyncHandler(async (req, res) => {
  const { setUserStatusService } = await import('../services/user.service.js');
  const user = await setUserStatusService(req.params.id, req.body.status, req.user);
  await writeAudit({ user: req.user, action: 'USER_STATUS_CHANGE', module: 'users', entityId: req.params.id, entityType: 'User', data: { status: req.body.status }, req });
  success(res, user, 'User status updated');
});

export const updateUser = asyncHandler(async (req, res) => {
  const { updateUserService } = await import('../services/user.service.js');
  const user = await updateUserService(req.params.id, req.body, req.user);
  await writeAudit({ user: req.user, action: 'USER_UPDATE', module: 'users', entityId: req.params.id, entityType: 'User', req });
  success(res, user, 'User updated');
});