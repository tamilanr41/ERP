import mongoose from 'mongoose';

export const DIALYSIS_TYPES = {
  HEMODIALYSIS: 'HEMODIALYSIS',
  PERITONEAL: 'PERITONEAL',
  CRRT: 'CRRT',
  SLED: 'SLED',
  HDF: 'HDF',
};

export const ACCESS_TYPES = {
  AV_FISTULA: 'AV_FISTULA',
  AV_GRAFT: 'AV_GRAFT',
  CVC: 'CVC',
  PD_CATHETER: 'PD_CATHETER',
  BUTTON_HOLE: 'BUTTON_HOLE',
  NONE: 'NONE',
};

export const DIALYSIS_PATIENT_STATUS = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  INACTIVE: 'INACTIVE',
  TRANSFERRED: 'TRANSFERRED',
  DECEASED: 'DECEASED',
};

export const SCHEDULE_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

/**
 * DialysisPatient — a patient enrolled in a long-term dialysis programme.
 * One registration per hospital patient (enforced by a unique index) so the
 * same UHID is never duplicated.
 */
const dialysisPatientSchema = new mongoose.Schema(
  {
    dialysisNumber: { type: String, required: true, unique: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, unique: true, index: true },

    primaryDiagnosis: String,
    ckdStage: { type: String, enum: ['STAGE_1', 'STAGE_2', 'STAGE_3', 'STAGE_4', 'STAGE_5', 'ESRD', 'AKI', 'UNKNOWN'], default: 'UNKNOWN' },
    secondaryDiagnosis: [String],

    nephrologistId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', index: true },
    referringDoctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },

    dialysisType: { type: String, enum: Object.values(DIALYSIS_TYPES), default: DIALYSIS_TYPES.HEMODIALYSIS },
    accessType: { type: String, enum: Object.values(ACCESS_TYPES), default: ACCESS_TYPES.AV_FISTULA },
    accessSide: { type: String, enum: ['LEFT', 'RIGHT', 'NOT_APPLICABLE'], default: 'NOT_APPLICABLE' },
    accessCreatedAt: Date,

    insurancePolicyId: { type: mongoose.Schema.Types.ObjectId, ref: 'InsurancePolicy' },
    sponsor: String,
    tpaName: String,
    paymentCategory: { type: String, enum: ['CASH', 'INSURANCE', 'SPONSOR', 'CREDIT', 'GOVT_SCHEME'], default: 'CASH' },
    approvedAmount: Number,

    dryWeightKg: Number,
    heightCm: Number,
    bloodGroup: String,
    allergies: [String],
    comorbidities: [String],
    specialNeeds: String,

    sessionsPerWeek: { type: Number, default: 2 },
    scheduleDays: { type: [String], enum: SCHEDULE_DAYS, default: ['MON', 'WED', 'FRI'] },
    preferredShift: { type: String, enum: ['MORNING', 'AFTERNOON', 'EVENING', 'NIGHT'], default: 'MORNING' },

    status: { type: String, enum: Object.values(DIALYSIS_PATIENT_STATUS), default: DIALYSIS_PATIENT_STATUS.ACTIVE },
    statusReason: String,
    registeredAt: { type: Date, default: Date.now },
    registeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    totalSessions: { type: Number, default: 0 },
    completedSessions: { type: Number, default: 0 },
    lastSessionAt: Date,
    nextSessionAt: Date,
    lastBillId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill' },

    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

dialysisPatientSchema.index({ status: 1, nephrologistId: 1 });
dialysisPatientSchema.index({ dialysisNumber: 1, patientId: 1 });

export const DialysisPatient = mongoose.model('DialysisPatient', dialysisPatientSchema);
export default DialysisPatient;
