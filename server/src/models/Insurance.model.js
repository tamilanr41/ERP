import mongoose from 'mongoose';

const insuranceCompanySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    code: String,
    tpaName: String,
    tpaContact: {
      person: String,
      phone: String,
      email: String,
    },
    address: String,
    contactPhone: String,
    contactEmail: String,
    empanelled: { type: Boolean, default: true },
    notes: String,
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const insurancePolicySchema = new mongoose.Schema(
  {
    policyNumber: { type: String, required: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'InsuranceCompany', required: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    insuredName: String,
    relationship: String,
    sumInsured: Number,
    startDate: Date,
    endDate: Date,
    coverage: {
      roomRentLimit: Number,
      icuLimit: Number,
      preHospitalizationDays: { type: Number, default: 0 },
      postHospitalizationDays: { type: Number, default: 0 },
      inclusions: [String],
      exclusions: [String],
      // cashless network / TPA handling (section 29)
      cashless: { type: Boolean, default: false },
      tpaName: String,
      tpaId: { type: mongoose.Schema.Types.ObjectId, ref: 'InsuranceCompany' },
      tpaContact: String,
      corporateName: String,
      coveragePercent: { type: Number, default: 100 },
    },
    policyHolderName: String,
    active: { type: Boolean, default: true },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

export const CLAIM_STATUS = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  PARTIALLY_APPROVED: 'PARTIALLY_APPROVED',
  REJECTED: 'REJECTED',
  SETTLED: 'SETTLED',
};

export const PREAUTH_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  PARTIALLY_APPROVED: 'PARTIALLY_APPROVED',
  REJECTED: 'REJECTED',
};

const preAuthSchema = new mongoose.Schema(
  {
    preAuthNumber: { type: String, unique: true },
    policyId: { type: mongoose.Schema.Types.ObjectId, ref: 'InsurancePolicy', required: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'InsuranceCompany', required: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IpdAdmission' },
    requestedAmount: { type: Number, default: 0 },
    approvedAmount: { type: Number, default: 0 },
    rejectedAmount: { type: Number, default: 0 },
    tpaName: String,
    estimatedAmount: Number,
    diagnosis: String,
    treatmentPlan: String,
    requestedDate: { type: Date, default: Date.now },
    status: { type: String, enum: Object.values(PREAUTH_STATUS), default: PREAUTH_STATUS.PENDING, index: true },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    decidedAt: Date,
    remarks: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

preAuthSchema.index({ patientId: 1, requestedDate: -1 });
preAuthSchema.index({ status: 1, requestedDate: -1 });

const claimSchema = new mongoose.Schema(
  {
    claimNumber: { type: String, unique: true },
    policyId: { type: mongoose.Schema.Types.ObjectId, ref: 'InsurancePolicy', required: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'InsuranceCompany' },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IpdAdmission' },
    preAuthorizationNumber: String,
    claimedAmount: { type: Number, default: 0 },
    approvedAmount: { type: Number, default: 0 },
    rejectedAmount: { type: Number, default: 0 },
    patientResponsibility: { type: Number, default: 0 },
    insuranceResponsibility: { type: Number, default: 0 },
    claimDate: { type: Date, default: Date.now },
    diagnosis: String,
    treatmentSummary: String,
    documents: [String], // file urls
    status: { type: String, enum: Object.values(CLAIM_STATUS), default: CLAIM_STATUS.DRAFT, index: true },
    submittedAt: Date,
    approvedAt: Date,
    settledAt: Date,
    settlementAmount: Number,
    remarks: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

claimSchema.index({ patientId: 1, claimDate: -1 });
claimSchema.index({ status: 1, claimDate: -1 });

export default mongoose.model('InsuranceCompany', insuranceCompanySchema);
export const InsurancePolicy = mongoose.model('InsurancePolicy', insurancePolicySchema);
export const InsuranceClaim = mongoose.model('InsuranceClaim', claimSchema);
export const PreAuthorization = mongoose.model('PreAuthorization', preAuthSchema);