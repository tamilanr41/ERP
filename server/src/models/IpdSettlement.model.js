import mongoose from 'mongoose';

/**
 * IpdSettlement — the calculated final in-patient bill for one admission.
 * Every figure is derived from bill items, advances, insurance and sponsor
 * records. No total is ever entered manually.
 */
const settlementLineSchema = new mongoose.Schema(
  {
    category: { type: String, required: true }, // ROOM_RENT | NURSING | DOCTOR_VISIT | ...
    label: { type: String, required: true },
    quantity: { type: Number, default: 0 },
    rate: { type: Number, default: 0 },
    amount: { type: Number, default: 0 },
  },
  { _id: false },
);

const ipdSettlementSchema = new mongoose.Schema(
  {
    settlementNumber: { type: String, unique: true, index: true },
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IpdAdmission', required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', index: true },
    finalBillId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill' },

    // category-wise aggregation of every configured service
    categories: [settlementLineSchema],

    grossTotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    netTotal: { type: Number, default: 0 },

    insuranceAdjustment: { type: Number, default: 0 },
    sponsorAdjustment: { type: Number, default: 0 },
    creditAdjustment: { type: Number, default: 0 },
    advanceAdjusted: { type: Number, default: 0 },
    advanceAvailable: { type: Number, default: 0 },
    paid: { type: Number, default: 0 },
    refunded: { type: Number, default: 0 },

    netPayable: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },

    // sponsor / credit split
    sponsor: {
      name: String,
      company: String,
      agreement: String,
      coverageLimit: Number,
      approvedAmount: { type: Number, default: 0 },
      sponsorPayable: { type: Number, default: 0 },
      patientPayable: { type: Number, default: 0 },
      pendingApproval: { type: Boolean, default: false },
      patientResponsibility: Number,
    },
    insurance: {
      company: String,
      policyNumber: String,
      policyHolder: String,
      tpa: String,
      claimNumber: String,
      preauthNumber: String,
      approvedAmount: { type: Number, default: 0 },
      rejectedAmount: { type: Number, default: 0 },
      status: String,
    },

    status: { type: String, enum: ['DRAFT', 'FINAL', 'SETTLED'], default: 'DRAFT', index: true },
    finalisedAt: Date,
    finalisedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

ipdSettlementSchema.index({ admissionId: 1, createdAt: -1 });

export default mongoose.model('IpdSettlement', ipdSettlementSchema);
