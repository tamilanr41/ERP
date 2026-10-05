import mongoose from 'mongoose';

export const ADMISSION_STATUS = {
  ADMISSION_REQUESTED: 'ADMISSION_REQUESTED',
  APPROVED: 'APPROVED',
  WAITING_FOR_BED: 'WAITING_FOR_BED',
  BED_ALLOCATED: 'BED_ALLOCATED',
  ADMITTED: 'ADMITTED',
  TRANSFER_REQUESTED: 'TRANSFER_REQUESTED',
  TRANSFERRED: 'TRANSFERRED',
  DISCHARGE_PLANNED: 'DISCHARGE_PLANNED',
  DISCHARGED: 'DISCHARGED',
  CANCELLED: 'CANCELLED',
};

export const DISCHARGE_STAGE = {
  DISCHARGE_INITIATED: 'DISCHARGE_INITIATED',
  BILLING_PENDING: 'BILLING_PENDING',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  INSURANCE_PENDING: 'INSURANCE_PENDING',
  READY_FOR_DISCHARGE: 'READY_FOR_DISCHARGE',
  DISCHARGED: 'DISCHARGED',
};

export const DISCHARGE_TYPE = {
  NORMAL: 'NORMAL',
  LAMA: 'LAMA',
  DAMA: 'DAMA',
  ABSCONDED: 'ABSCONDED',
  TRANSFERRED: 'TRANSFERRED',
  DEATH: 'DEATH',
  REFERRAL: 'REFERRAL',
};

const dischargeReadinessItemSchema = {
  key: String,
  label: String,
  done: { type: Boolean, default: false },
  auto: { type: Boolean, default: false },
  note: String,
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  at: Date,
};

const dischargeReadinessSchema = new mongoose.Schema(
  {
    clinicalClearance: dischargeReadinessItemSchema,
    doctorClearance: dischargeReadinessItemSchema,
    nursingClearance: dischargeReadinessItemSchema,
    investigationsPending: dischargeReadinessItemSchema,
    pharmacyPending: dischargeReadinessItemSchema,
    billingPending: dischargeReadinessItemSchema,
    insurancePending: dischargeReadinessItemSchema,
    documentsPending: dischargeReadinessItemSchema,
    followUpPlanned: dischargeReadinessItemSchema,
    updatedAt: Date,
  },
  { _id: false },
);

const attendantSchema = {
  name: String,
  relation: String,
  phone: String,
};

const ipdAdmissionSchema = new mongoose.Schema(
  {
    admissionNumber: { type: String, unique: true },
    ipNumber: { type: String, unique: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    opdVisitId: { type: mongoose.Schema.Types.ObjectId, ref: 'OpdVisit' },
    emergencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Emergency' },
    admittedAt: { type: Date, default: Date.now },
    dischargedAt: Date,
    admissionType: { type: String, enum: ['EMERGENCY', 'ELECTIVE', 'OPD', 'TRANSFER', 'DAY_CARE'], default: 'ELECTIVE' },
    priority: { type: String, enum: ['ROUTINE', 'URGENT', 'STAT'], default: 'ROUTINE' },
    paymentCategory: { type: String, enum: ['CASH', 'INSURANCE', 'SPONSOR', 'CREDIT', 'GOVT_SCHEME'], default: 'CASH' },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', index: true },
    consultantDoctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', index: true },
    referringDoctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
    provisionalDiagnosis: String,
    expectedDischargeDate: Date,
    dischargePlannedAt: Date,
    dischargePlanningNotes: String,
    wardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ward' },
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
    bedId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bed', index: true },
    bedHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: 'BedHistory' }],
    admittingDiagnosis: String,
    chiefComplaint: String,
    admittingDoctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
    careTeam: [
      {
        doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
        role: String,
      },
    ],
    attendant: attendantSchema,
    emergencyContact: { name: String, phone: String },
    sponsor: {
      name: String,
      relation: String,
      company: String,
      fundingLimit: Number,
      note: String,
    },
    insurancePolicyId: { type: mongoose.Schema.Types.ObjectId, ref: 'InsurancePolicy' },
    estimatedStayDays: Number,
    notes: String,
    status: { type: String, enum: Object.values(ADMISSION_STATUS), default: ADMISSION_STATUS.ADMITTED, index: true },

    // ===== discharge workflow (sections 31, 34, 35) =====
    dischargeStage: { type: String, enum: Object.values(DISCHARGE_STAGE), index: true },
    dischargeType: { type: String, enum: Object.values(DISCHARGE_TYPE), default: DISCHARGE_TYPE.NORMAL },
    dischargeInitiatedAt: Date,
    dischargeInitiatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    dischargeReason: String,
    // type-specific documentation (LAMA/DAMA form, death summary, referral note, absconding report…)
    dischargeDocuments: {
      documentType: String,
      referenceNumber: String,
      signedBy: String,
      relation: String,
      witnessedBy: String,
      notes: String,
      recordedAt: Date,
      recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    deathDetails: {
      causeOfDeath: String,
      timeOfDeath: Date,
      certifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
      mortuaryRef: String,
    },
    dischargeReadiness: { type: dischargeReadinessSchema },
    advanceAlert: {
      level: String,
      message: String,
      estimatedBill: Number,
      totalAdvance: Number,
      outstanding: Number,
      raisedAt: Date,
      acknowledgedAt: Date,
      acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },

    dischargedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    dischargeSummaryId: { type: mongoose.Schema.Types.ObjectId, ref: 'DischargeSummary' },
    admittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

ipdAdmissionSchema.index({ patientId: 1, status: 1 });
ipdAdmissionSchema.index({ departmentId: 1, admittedAt: -1 });
ipdAdmissionSchema.index({ bedId: 1, status: 1 });

export default mongoose.model('IpdAdmission', ipdAdmissionSchema);