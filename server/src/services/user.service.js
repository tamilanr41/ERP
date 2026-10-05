import Role from '../models/Role.model.js';
import Permission from '../models/Permission.model.js';
import User from '../models/User.model.js';
import { BadRequestError, NotFoundError } from '../utils/ApiError.js';

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
  const user = await User.findById(id);
  if (!user) throw new BadRequestError('User not found');

  if (status !== 'ACTIVE') await assertNotLastSuperAdmin(user, 'deactivate');

  // `status` and `active` are two fields for the same fact, and the login guard
  // and the super-admin guard both read them. Writing only `status` left rows
  // that said INACTIVE while still claiming active: true, which kept the person
  // in every "active users" listing and miscounted the remaining super admins.
  user.status = status;
  user.active = status === 'ACTIVE';

  if (status === 'ACTIVE') {
    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
  } else {
    // Stand the account down everywhere, not just at the next login.
    user.refreshTokens = [];
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
    // The caller speaks roleId, the document stores `role`. Writing roleId into
    // the document would be dropped by Mongoose's strict mode, so reassigning a
    // role used to look like it worked and change nothing.
    update.role = role._id;
    update.roleCode = role.name;
    delete update.roleId;
  }
  const user = await User.findByIdAndUpdate(id, update, { new: true }).select('-passwordHash -refreshTokens');
  if (!user) throw new BadRequestError('User not found');
  return user.toSafeJSON ? user.toSafeJSON() : user;
};

/**
 * Retire an account instead of removing the row.
 *
 * Users are referenced from everywhere - bill headers, lab results, OPD
 * visits, audit trails. Hard-deleting one would either cascade into clinical
 * history or leave dangling ids in the middle of a signed-off report, so the
 * account is deactivated and the person stops being able to sign in.
 */
export const deleteUserService = async (id, actor) => {
  if (actor?.id?.toString() === id?.toString()) {
    throw new BadRequestError('You cannot deactivate your own account');
  }

  const user = await User.findById(id);
  if (!user) throw new NotFoundError('User not found');

  await assertNotLastSuperAdmin(user, 'deactivate');

  user.active = false;
  user.status = 'INACTIVE';
  // Force a re-login so a refresh token minted before the change cannot keep the
  // session alive after the account was stood down.
  user.refreshTokens = [];
  await user.save();

  return user.toSafeJSON ? user.toSafeJSON() : user;
};

/**
 * Administrative password reset.
 *
 * Deliberately goes through document.save() rather than findByIdAndUpdate:
 * the bcrypt hash only runs in a pre('save') hook, so a query-based update
 * would store the new password in plaintext and nobody could ever log in again.
 */
export const resetUserPasswordService = async (id, newPassword, actor) => {
  if (!newPassword || String(newPassword).length < 8) {
    throw new BadRequestError('Password must be at least 8 characters');
  }
  if (actor?.id?.toString() === id?.toString()) {
    throw new BadRequestError('Use Change Password for your own account');
  }

  const user = await User.findById(id);
  if (!user) throw new NotFoundError('User not found');

  await assertNotLastSuperAdmin(user, 'reset the password of');

  user.passwordHash = newPassword;
  user.passwordChangedAt = new Date();
  user.refreshTokens = [];
  user.failedLoginAttempts = 0;
  user.lockUntil = undefined;
  await user.save();

  return { _id: user._id, username: user.username, passwordChangedAt: user.passwordChangedAt };
};

/**
 * Losing the only super admin locks everyone out of the entire system with no
 * in-app way back in, so it is refused rather than left to operator error.
 */
const assertNotLastSuperAdmin = async (target, action) => {
  if (target.roleCode !== 'SUPER_ADMIN' || target.active === false) return;
  const remaining = await User.countDocuments({
    roleCode: 'SUPER_ADMIN',
    active: true,
    status: 'ACTIVE',
    _id: { $ne: target._id },
  });
  if (remaining === 0) {
    throw new BadRequestError(
      `This is the last active super admin. Create another super admin before you ${action} this one.`,
    );
  }
};
