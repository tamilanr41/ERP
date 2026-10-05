import Role from '../models/Role.model.js';
import Permission from '../models/Permission.model.js';
import User from '../models/User.model.js';
import { BadRequestError } from '../utils/ApiError.js';

export const listRolesService = async (query = {}) => {
  const filter = {};
  if (query.search) {
    const r = new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ displayName: r }, { name: r }, { description: r }];
  }
  return Role.find(filter).sort({ name: 1 }).lean();
};

export const listPermissionsService = async () => Permission.find({}).sort({ module: 1, code: 1 }).lean();

export const setUserStatusService = async (id, status, actor) => {
  const valid = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'LOCKED'];
  if (!valid.includes(status)) throw new BadRequestError('Invalid status');
  if (actor?.id?.toString() === id?.toString() && status !== 'ACTIVE') {
    throw new BadRequestError('You cannot deactivate your own account');
  }
  const user = await User.findById(id).select('-passwordHash -refreshTokens');
  if (!user) throw new BadRequestError('User not found');
  user.status = status;
  if (status === 'ACTIVE') {
    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
  }
  await user.save();
  return user.toSafeJSON ? user.toSafeJSON() : user;
};

export const updateUserService = async (id, payload, actor) => {
  const allowed = ['firstName', 'lastName', 'phone', 'email', 'departmentId', 'roleId', 'permissions', 'status'];
  const update = {};
  for (const k of allowed) if (k in payload) update[k] = payload[k];
  if (update.roleId) {
    const role = await Role.findById(update.roleId);
    if (!role) throw new BadRequestError('Role not found');
    update.roleCode = role.name;
  }
  const user = await User.findByIdAndUpdate(id, update, { new: true }).select('-passwordHash -refreshTokens');
  if (!user) throw new BadRequestError('User not found');
  return user.toSafeJSON ? user.toSafeJSON() : user;
};