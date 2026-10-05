import mongoose from 'mongoose';

export const IPD_SERVICE_CODES = {
  ROOM_RENT: 'ROOM_RENT',
  NURSING: 'NURSING',
  DOCTOR_VISIT: 'DOCTOR_VISIT',
  PROCEDURE: 'PROCEDURE',
  LABORATORY: 'LABORATORY',
  RADIOLOGY: 'RADIOLOGY',
  PHARMACY: 'PHARMACY',
  CONSUMABLES: 'CONSUMABLES',
  OT: 'OT',
  IMPLANTS: 'IMPLANTS',
  PHYSIOTHERAPY: 'PHYSIOTHERAPY',
  DIET: 'DIET',
  BLOOD_BANK: 'BLOOD_BANK',
  DIALYSIS: 'DIALYSIS',
  OTHER_SERVICES: 'OTHER_SERVICES',
};

export const BILLING_FREQUENCY = {
  DAILY: 'DAILY',
  PER_EVENT: 'PER_EVENT',
  PER_UNIT: 'PER_UNIT',
  PER_SESSION: 'PER_SESSION',
  PER_DAY: 'PER_DAY',
  MANUAL: 'MANUAL',
};

/**
 * IpdServiceCharge — configurable charge catalogue for in-patient billing.
 * Daily billing reads this catalogue; nothing is typed as a total by hand.
 */
const ipdServiceChargeSchema = new mongoose.Schema(
  {
    serviceCode: { type: String, enum: Object.values(IPD_SERVICE_CODES), required: true, unique: true },
    label: { type: String, required: true },
    rate: { type: Number, min: 0, default: 0 },
    billingFrequency: { type: String, enum: Object.values(BILLING_FREQUENCY), default: BILLING_FREQUENCY.DAILY },
    // whether the daily billing run may post this charge automatically
    autoCapture: { type: Boolean, default: false },
    // when true, charges from this service are already billed at source and must not be captured again
    billedAtSource: { type: Boolean, default: false },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    taxPct: { type: Number, min: 0, default: 0 },
    active: { type: Boolean, default: true },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

export default mongoose.model('IpdServiceCharge', ipdServiceChargeSchema);
