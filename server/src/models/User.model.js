import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

export const EMPLOYEE_CATEGORIES = [
  'DOCTOR',
  'NURSE',
  'TECHNICIAN',
  'PHARMACIST',
  'RECEPTIONIST',
  'ADMIN',
  'SUPPORT_STAFF',
  'MANAGEMENT',
];

export const USER_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  SUSPENDED: 'SUSPENDED',
  LOCKED: 'LOCKED',
};

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    email: { type: String, unique: true, sparse: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true, index: true },
    roleCode: { type: String, uppercase: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, trim: true },
    name: { type: String, trim: true },
    phone: { type: String },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    profilePicture: { type: String },
    status: { type: String, enum: Object.values(USER_STATUS), default: USER_STATUS.ACTIVE },
    lastLoginAt: { type: Date },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
    passwordChangedAt: { type: Date },
    refreshTokens: [{ type: String, select: false }],
    permissions: [{ type: String }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

userSchema.pre('save', async function hashPassword(next) {
  if (!this.name || this.isModified('firstName') || this.isModified('lastName')) {
    this.name = [this.firstName, this.lastName].filter(Boolean).join(' ');
  }
  if (!this.isModified('passwordHash')) return next();
  const salt = await bcrypt.genSalt(10);
  this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
  return next();
});

userSchema.pre('findOneAndUpdate', function syncName(next) {
  const update = this.getUpdate() || {};
  const set = update.$set || update;
  if (set.firstName || set.lastName) {
    const fn = set.firstName ?? this.get('firstName');
    const ln = set.lastName ?? this.get('lastName');
    if (fn) set.name = [fn, ln].filter(Boolean).join(' ');
  }
  return next();
});

userSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.refreshTokens;
  return obj;
};

userSchema.index({ status: 1, role: 1 });
userSchema.index({ firstName: 'text', lastName: 'text', email: 'text', phone: 'text', username: 'text' });

export default mongoose.model('User', userSchema);