import mongoose from 'mongoose';

export const ADVANCE_TYPES = {
  ADMISSION: 'ADMISSION',
  ADDITIONAL: 'ADDITIONAL',
  EMERGENCY: 'EMERGENCY',
  REFUNDABLE: 'REFUNDABLE',
};

export const ADVANCE_MODES = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'INSURANCE', 'SPONSOR', 'CREDIT', 'CHEQUE', 'WALLET'];

export const ADVANCE_STATUS = {
  UNADJUSTED: 'UNADJUSTED',
  PARTIAL: 'PARTIAL',
  ADJUSTED: 'ADJUSTED',
  REFUNDED: 'REFUNDED',
  CANCELLED: 'CANCELLED',
};

/**
 * IpdAdvance — deposit/advance collected against an in-patient admission.
 * Kept separate from bill payments so it can be adjusted (consumed) against
 * bills, refunded, or left available as credit.
 */
const ipdAdvanceSchema = new mongoose.Schema(
  {
    receiptNumber: { type: String, unique: true, index: true },
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IpdAdmission', required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    admissionNumber: String,
    patientName: String,
    uhid: String,

    advanceType: { type: String, enum: Object.values(ADVANCE_TYPES), default: ADVANCE_TYPES.ADMISSION },
    amount: { type: Number, required: true, min: 0.01 },
    adjustedAmount: { type: Number, min: 0, default: 0 },
    refundedAmount: { type: Number, min: 0, default: 0 },
    availableAmount: { type: Number, min: 0, default: 0 },

    mode: { type: String, enum: ADVANCE_MODES, required: true },
    referenceNumber: String,
    collectedAt: { type: Date, default: Date.now, index: true },
    collectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    status: { type: String, enum: Object.values(ADVANCE_STATUS), default: ADVANCE_STATUS.UNADJUSTED, index: true },
    adjustments: [
      {
        billId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill' },
        billNumber: String,
        amount: Number,
        at: { type: Date, default: Date.now },
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        note: String,
      },
    ],
    refundHistory: [
      { amount: Number, at: { type: Date, default: Date.now }, by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, reason: String, mode: String },
    ],

    isRefundable: { type: Boolean, default: true },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

ipdAdvanceSchema.index({ admissionId: 1, collectedAt: -1 });

export default mongoose.model('IpdAdvance', ipdAdvanceSchema);
