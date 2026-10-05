import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import User from '../models/User.model.js';
import Role from '../models/Role.model.js';
import { UnauthorizedError } from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

export const signAccessToken = (payload) =>
  jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.accessExpires });

export const signRefreshToken = (payload) =>
  jwt.sign(payload, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExpires });

export const verifyAccessToken = (token) => jwt.verify(token, config.jwt.secret);

export const verifyRefreshToken = (token) => jwt.verify(token, config.jwt.refreshSecret);

/**
 * populateUser: loads user + role and injects into req.user with resolved permissions
 */
const loadUser = async (userId) => {
  const user = await User.findById(userId).populate('role');
  if (!user) return null;
  const role = user.role;
  const permissions = Array.from(new Set([...(user.permissions || []), ...(role?.permissions || [])]));
  return {
    id: user._id,
    username: user.username,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    roleId: user.role,
    roleCode: user.roleCode || role?.name,
    roleName: role?.displayName || user.roleCode,
    departmentId: user.departmentId,
    hospitalId: user.hospitalId,
    branchId: user.branchId,
    doctorId: user.doctorId,
    employeeId: user.employeeId,
    status: user.status,
    permissions,
  };
};

export const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new UnauthorizedError('Authentication required');

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch (err) {
    throw new UnauthorizedError('Invalid or expired token');
  }

  const currentUser = await loadUser(decoded.sub || decoded.id);
  if (!currentUser) throw new UnauthorizedError('User no longer exists');

  if (currentUser.status !== 'ACTIVE' || !req.bypassActiveCheck) {
    if (currentUser.status !== 'ACTIVE') throw new UnauthorizedError('Account is not active');
  }

  req.user = currentUser;
  req.tenant = {
    organizationId: currentUser.organizationId || null,
    hospitalId: currentUser.hospitalId || null,
    branchId: currentUser.branchId || null,
  };
  next();
});

/**
 * requirePermission - granular RBAC enforcement on every protected route
 */
export const requirePermission = (...permissions) =>
  asyncHandler(async (req, res, next) => {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const granted = req.user.permissions || [];
    const role = (req.user.roleCode || '').toUpperCase();
    if (role === 'SUPER_ADMIN') return next();
    const allowed = granted.some((p) => permissions.includes(p));
    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: `Permission denied. Required: ${permissions.join(', ')}`,
      });
    }
    next();
  });

export const requireRole = (...roles) =>
  asyncHandler(async (req, res, next) => {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const role = (req.user.roleCode || '').toUpperCase();
    if (role === 'SUPER_ADMIN' || roles.includes(role)) return next();
    return res.status(403).json({ success: false, message: `Role required: ${roles.join(', ')}` });
  });

export default authenticate;