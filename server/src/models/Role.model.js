import mongoose from 'mongoose';

export const ROLES = [
  'SUPER_ADMIN',
  'HOSPITAL_ADMIN',
  'RECEPTIONIST',
  'DOCTOR',
  'NURSE',
  'PHARMACIST',
  'LAB_TECHNICIAN',
  'RADIOLOGY_TECHNICIAN',
  'OT_STAFF',
  'BILLING_STAFF',
  'INSURANCE_STAFF',
  'HR_STAFF',
  'ACCOUNTANT',
  'STORE_MANAGER',
  'INVENTORY_STAFF',
  'PATIENT',
  'MANAGEMENT',
];

const roleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, uppercase: true, enum: ROLES },
    displayName: { type: String, required: true },
    description: { type: String },
    permissions: [{ type: String }], // permission codes
    isSystem: { type: Boolean, default: false },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export default mongoose.model('Role', roleSchema);