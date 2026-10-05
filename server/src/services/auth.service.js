import User, { USER_STATUS } from '../models/User.model.js';
import Role from '../models/Role.model.js';
import Permission from '../models/Permission.model.js';
import Hospital from '../models/Hospital.model.js';
import Department from '../models/Department.model.js';
import Doctor from '../models/Doctor.model.js';
import { UnauthorizedError, BadRequestError } from '../utils/ApiError.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../middleware/auth.js';
import { writeAudit } from '../middleware/audit.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

/**
 * Users are displayed everywhere as `name` (audit trails, clinical records,
 * nursing notes, orders). Older records predate that field, so fill it once.
 */
export const backfillUserNames = async () => {
  const missing = await User.countDocuments({ $or: [{ name: { $exists: false } }, { name: null }, { name: '' }] });
  if (!missing) return 0;
  const res = await User.updateMany(
    { $or: [{ name: { $exists: false } }, { name: null }, { name: '' }] },
    [{ $set: { name: { $concat: ['$firstName', ' ', { $ifNull: ['$lastName', ''] }] } } }],
  );
  return res.modifiedCount || 0;
};

export const bootstrapRoles = async () => {
  await Permission.ensureDefaults();
  const allPermissions = (await Permission.find({}).lean()).map((p) => p.code);

  const roleDefs = [
    { name: 'SUPER_ADMIN', displayName: 'Super Admin', isSystem: true, permissions: ['*'] },
    { name: 'HOSPITAL_ADMIN', displayName: 'Hospital Admin', permissions: allPermissions },
    { name: 'DOCTOR', displayName: 'Doctor', permissions: [
      'PATIENT_VIEW', 'PATIENT_TIMELINE_VIEW', 'APPOINTMENT_VIEW', 'OPD_VIEW', 'OPD_CREATE', 'OPD_EDIT',
      'VITALS_CREATE', 'PRESCRIPTION_CREATE', 'PRESCRIPTION_VIEW', 'DOCTOR_ORDER_CREATE',
      'IPD_VIEW', 'IPD_TRANSFER', 'IPD_DISCHARGE', 'IPD_CLINICAL_RECORD', 'NURSING_RECORD',
      'DIALYSIS_VIEW', 'DIALYSIS_PRESCRIBE', 'DIALYSIS_SCHEDULE', 'DIALYSIS_SESSION_RUN', 'DIALYSIS_REPORT_VIEW',
      'LAB_VIEW', 'LAB_ORDER_CREATE', 'RADIOLOGY_VIEW', 'RADIOLOGY_ORDER_CREATE',
'EMERGENCY_VIEW', 'REPORT_VIEW', 'DASHBOARD_VIEW', 'NOTIFICATION_VIEW', 'BILLING_VIEW',
        'TELEMEDICINE_VIEW', 'TELEMEDICINE_CONSULT', 'TELEMEDICINE_BOOK', 'TELEMEDICINE_EDIT',
      ] },
      { name: 'NURSE', displayName: 'Nurse', permissions: [
      'PATIENT_VIEW', 'IPD_VIEW', 'BED_VIEW', 'VITALS_CREATE', 'OPD_VIEW', 'EMERGENCY_VIEW',
      'EMERGENCY_CREATE', 'PRESCRIPTION_VIEW', 'LAB_VIEW', 'RADIOLOGY_VIEW', 'DASHBOARD_VIEW', 'NOTIFICATION_VIEW',
      'NURSING_RECORD', 'IPD_CLINICAL_RECORD', 'DIALYSIS_VIEW', 'DIALYSIS_SESSION_RUN', 'DIALYSIS_SCHEDULE',
    ] },
    { name: 'RECEPTIONIST', displayName: 'Receptionist', permissions: [
      'PATIENT_VIEW', 'PATIENT_CREATE', 'PATIENT_EDIT', 'PATIENT_DOCUMENT_UPLOAD', 'PATIENT_TIMELINE_VIEW',
'APPOINTMENT_VIEW', 'APPOINTMENT_CREATE', 'APPOINTMENT_EDIT', 'APPOINTMENT_CANCEL',
        'OPD_VIEW', 'DASHBOARD_VIEW', 'NOTIFICATION_VIEW', 'BILLING_VIEW', 'PAYMENT_VIEW',
        'TELEMEDICINE_VIEW', 'TELEMEDICINE_BOOK', 'TELEMEDICINE_EDIT',
      'IPD_VIEW', 'IPD_ADMIT', 'BED_VIEW', 'IPD_TRANSFER', 'IPD_DOCUMENT_UPLOAD', 'ADVANCE_COLLECT',
    ] },
    { name: 'PHARMACIST', displayName: 'Pharmacist', permissions: [
      'PHARMACY_VIEW', 'PHARMACY_SALE', 'PHARMACY_PURCHASE', 'PHARMACY_RETURN', 'PHARMACY_STOCK_ADJUST',
      'PHARMACY_DISPENSE', 'INVENTORY_VIEW', 'PATIENT_VIEW', 'DASHBOARD_VIEW', 'NOTIFICATION_VIEW',
      'BILLING_VIEW', 'PAYMENT_CREATE', 'REPORT_VIEW', 'IPD_VIEW', 'IPD_MEDICATION_ISSUE',
    ] },
    { name: 'LAB_TECHNICIAN', displayName: 'Lab Technician', permissions: [
      'LAB_VIEW', 'LAB_SAMPLE', 'LAB_RESULT_ENTER', 'LAB_ORDER_CREATE', 'PATIENT_VIEW', 'DASHBOARD_VIEW',
      'REPORT_VIEW', 'NOTIFICATION_VIEW',
    ] },
    { name: 'RADIOLOGY_TECHNICIAN', displayName: 'Radiology Technician', permissions: [
      'RADIOLOGY_VIEW', 'RADIOLOGY_ORDER_CREATE', 'RADIOLOGY_REPORT', 'PATIENT_VIEW', 'DASHBOARD_VIEW', 'NOTIFICATION_VIEW',
    ] },
    { name: 'OT_STAFF', displayName: 'OT Staff', permissions: [
      'OT_VIEW', 'OT_BOOK', 'OT_MANAGE', 'PATIENT_VIEW', 'DASHBOARD_VIEW', 'NOTIFICATION_VIEW',
    ] },
    { name: 'BILLING_STAFF', displayName: 'Billing Staff', permissions: [
      'PATIENT_VIEW', 'BILLING_VIEW', 'BILLING_CREATE', 'BILLING_EXECUTE', 'BILLING_REFUND',
      'PAYMENT_CREATE', 'PAYMENT_VIEW', 'DASHBOARD_VIEW', 'REPORT_VIEW', 'REPORT_EXPORT', 'NOTIFICATION_VIEW',
      'IPD_VIEW', 'IPD_BILLING', 'ADVANCE_COLLECT', 'IPD_DISCHARGE_BILLING',
'DIALYSIS_VIEW', 'DIALYSIS_BILLING', 'DIALYSIS_REPORT_VIEW', 'DIALYSIS_REPORT_EXPORT',
        'TELEMEDICINE_VIEW', 'TELEMEDICINE_BILLING',
      ] },
    { name: 'INSURANCE_STAFF', displayName: 'Insurance Staff', permissions: [
      'INSURANCE_VIEW', 'INSURANCE_CLAIM_CREATE', 'INSURANCE_CLAIM_MANAGE', 'INSURANCE_PREAUTH', 'INSURANCE_SETTLE',
      'PATIENT_VIEW', 'BILLING_VIEW', 'REPORT_VIEW', 'DASHBOARD_VIEW', 'NOTIFICATION_VIEW',
      'IPD_VIEW', 'IPD_INSURANCE_LINK', 'DIALYSIS_VIEW', 'DIALYSIS_BILLING',
    ] },
    { name: 'HR_STAFF', displayName: 'HR Staff', permissions: [
      'EMPLOYEE_VIEW', 'EMPLOYEE_CREATE', 'EMPLOYEE_EDIT', 'PAYROLL_MANAGE', 'USER_VIEW', 'DASHBOARD_VIEW',
    ] },
    { name: 'ACCOUNTANT', displayName: 'Accountant', permissions: [
      'FINANCE_VIEW', 'EXPENSE_CREATE', 'BILLING_VIEW', 'PAYMENT_VIEW', 'PAYMENT_CREATE', 'BILLING_REFUND',
      'INSURANCE_VIEW', 'INSURANCE_SETTLE', 'REPORT_VIEW', 'REPORT_EXPORT', 'DASHBOARD_VIEW', 'NOTIFICATION_VIEW',
    ] },
    { name: 'STORE_MANAGER', displayName: 'Store Manager', permissions: [
      'INVENTORY_VIEW', 'INVENTORY_MANAGE', 'SUPPLIER_MANAGE', 'PHARMACY_VIEW', 'PHARMACY_PURCHASE',
      'DASHBOARD_VIEW', 'REPORT_VIEW', 'NOTIFICATION_VIEW',
    ] },
    { name: 'INVENTORY_STAFF', displayName: 'Inventory Staff', permissions: [
      'INVENTORY_VIEW', 'INVENTORY_MANAGE', 'DASHBOARD_VIEW', 'NOTIFICATION_VIEW',
    ] },
    { name: 'PATIENT', displayName: 'Patient', permissions: [
'APPOINTMENT_VIEW', 'APPOINTMENT_CREATE', 'PATIENT_TIMELINE_VIEW', 'NOTIFICATION_VIEW', 'BILLING_VIEW',
        'TELEMEDICINE_VIEW', 'TELEMEDICINE_JOIN_OWN',
    ] },
    { name: 'MANAGEMENT', displayName: 'Management', permissions: [
      'DASHBOARD_VIEW', 'REPORT_VIEW', 'REPORT_EXPORT', 'BILLING_VIEW', 'FINANCE_VIEW', 'AUDIT_VIEW',
      'PATIENT_VIEW', 'APPOINTMENT_VIEW', 'OPD_VIEW', 'IPD_VIEW', 'PHARMACY_VIEW', 'LAB_VIEW',
      'RADIOLOGY_VIEW', 'NOTIFICATION_VIEW', 'EMPLOYEE_VIEW', 'INVENTORY_VIEW', 'INSURANCE_VIEW',
      'DIALYSIS_VIEW', 'DIALYSIS_REPORT_VIEW', 'DIALYSIS_REPORT_EXPORT', 'BILLING_EXECUTE',
    ] },
  ];

  for (const def of roleDefs) {
    // system roles are the source of truth — refresh them on every boot so new
    // permission codes reach existing roles (and therefore existing users)
    await Role.updateOne(
      { name: def.name },
      {
        $set: {
          displayName: def.displayName,
          permissions: def.permissions.includes('*') ? ['*'] : [...new Set(def.permissions)],
        },
        $setOnInsert: { isSystem: !!def.isSystem },
      },
      { upsert: true },
    );
  }

  // denormalise role permissions onto users so the auth middleware stays fast
  const roles = await Role.find({}).lean();
  for (const role of roles) {
    await User.updateMany({ role: role._id }, { $set: { permissions: role.permissions } });
  }
};

export const loginUser = async ({ usernameOrEmail, password }, req) => {
  const query = { $or: [{ username: usernameOrEmail }, { email: usernameOrEmail }] };
  const user = await User.findOne(query).populate('role');

  if (!user) {
    // prevent user enumeration timing
    await new Promise((r) => setTimeout(r, 300));
    throw new UnauthorizedError('Invalid credentials');
  }

  if (user.status === 'LOCKED' && user.lockUntil && user.lockUntil > new Date()) {
    throw new UnauthorizedError('Account locked. Try again later.');
  }
  if (user.status === 'INACTIVE' || user.status === 'SUSPENDED') {
    throw new UnauthorizedError('Account is deactivated. Contact administrator.');
  }

  const ok = await user.comparePassword(password);
  if (!ok) {
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      user.status = USER_STATUS.LOCKED;
      user.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
      await user.save();
      await writeAudit({ user, action: 'LOGIN_LOCKED', module: 'auth', req });
      throw new UnauthorizedError(`Account locked for ${LOCK_MINUTES} minutes after repeated failures`);
    }
    await user.save();
    throw new UnauthorizedError('Invalid credentials');
  }

  user.failedLoginAttempts = 0;
  user.status = USER_STATUS.ACTIVE;
  user.lockUntil = undefined;
  user.lastLoginAt = new Date();
  await user.save();

  const role = user.role;
  const permissions = Array.from(new Set([...(role?.permissions || [])]));
  const base = {
    sub: user._id.toString(),
    username: user.username,
    roleCode: user.roleCode || role?.name,
  };

  const accessToken = signAccessToken(base);
  const refreshToken = signRefreshToken({ ...base, type: 'refresh' });

  await writeAudit({ user, action: 'LOGIN', module: 'auth', req, entityId: user._id, entityType: 'User' });

  return {
    accessToken,
    refreshToken,
    user: user.toSafeJSON(),
    permissions: permissions.includes('*') ? ['*'] : permissions,
  };
};

export const refreshAccessToken = async (refreshToken) => {
  if (!refreshToken) throw new UnauthorizedError('Refresh token required');
  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    throw new UnauthorizedError('Invalid refresh token');
  }
  const user = await User.findById(decoded.sub).populate('role');
  if (!user || user.status !== 'ACTIVE') throw new UnauthorizedError('User not active');
  const role = user.role;
  return {
    accessToken: signAccessToken({
      sub: user._id.toString(),
      username: user.username,
      roleCode: user.roleCode || role?.name,
    }),
    user: user.toSafeJSON(),
    permissions: Array.from(new Set([...(role?.permissions || [])])),
  };
};

export const changePasswordService = async (userId, { currentPassword, newPassword }) => {
  const user = await User.findById(userId);
  if (!user) throw new BadRequestError('User not found');
  const ok = await user.comparePassword(currentPassword);
  if (!ok) throw new BadRequestError('Current password is incorrect');
  user.passwordHash = newPassword; // hashed by pre-save hook
  user.passwordChangedAt = new Date();
  await user.save();
  return true;
};

export const createUserService = async (payload, actor) => {
  const { roleId, permissions = undefined, ...rest } = payload;
  const role = await Role.findById(roleId);
  if (!role) throw new BadRequestError('Role not found');

  const username = payload.username || payload.email.split('@')[0];
  const user = await User.create({
    ...rest,
    username,
    roleCode: role.name,
    passwordHash: payload.password || 'Temp@12345',
    permissions: permissions || undefined,
    createdBy: actor?.id,
    hospitalId: actor?.hospitalId || null,
    branchId: actor?.branchId || null,
  });
  return user;
};

export const listUsersService = async (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.roleCode) filter.roleCode = query.roleCode;
  if (query.search) {
    const r = new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ username: r }, { firstName: r }, { lastName: r }, { email: r }, { phone: r }];
  }

  const [total, users] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter)
      .select('-passwordHash -refreshTokens')
      .populate('role', 'name displayName')
      .populate('departmentId', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
  ]);

  return { data: users, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

export { User };