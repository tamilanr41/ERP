import mongoose from 'mongoose';

/**
 * OPD is a queue department: a patient is checked in, waits on a token, is
 * called into a consultation and leaves. Without those states the only thing
 * the system can express is "IN_PROGRESS", so the front desk has no waiting
 * list, the doctor has no calling list, and nobody can tell a patient who
 * arrived first from one who has been waiting an hour.
 */
export const OPD_VISIT_STATUS = {
  WAITING: 'WAITING',
  CALLED: 'CALLED',
  IN_CONSULTATION: 'IN_CONSULTATION',
  COMPLETED: 'COMPLETED',
  REFERRED: 'REFERRED',
  ADMITTED: 'ADMITTED',
  NO_SHOW: 'NO_SHOW',
  CANCELLED: 'CANCELLED',
};

/**
 * Legal moves. A visit cannot be jumped from WAITING straight to ADMITTED, and a
 * closed visit can never be reopened - which the enum alone would have allowed.
 */
export const OPD_VISIT_TRANSITIONS = {
  WAITING: ['CALLED', 'IN_CONSULTATION', 'NO_SHOW', 'CANCELLED'],
  CALLED: ['IN_CONSULTATION', 'WAITING', 'NO_SHOW', 'CANCELLED'],
  IN_CONSULTATION: ['COMPLETED', 'REFERRED', 'ADMITTED'],
  COMPLETED: [],
  REFERRED: ['COMPLETED', 'IN_CONSULTATION'],
  ADMITTED: ['COMPLETED'],
  NO_SHOW: ['WAITING'],
  CANCELLED: [],
};

export const canTransitionOpdVisit = (from, to) =>
  OPD_VISIT_TRANSITIONS[from]?.includes(to) ?? false;

/**
 * Status groupings, defined once so a query and a state machine cannot disagree
 * about what "still open" means.
 */
export const OPD_OPEN_STATES = [
  OPD_VISIT_STATUS.WAITING,
  OPD_VISIT_STATUS.CALLED,
  OPD_VISIT_STATUS.IN_CONSULTATION,
];

/** Left the department: nothing more will be recorded against these. */
export const OPD_CLOSED_STATES = [
  OPD_VISIT_STATUS.COMPLETED,
  OPD_VISIT_STATUS.REFERRED,
  OPD_VISIT_STATUS.ADMITTED,
];

/** Registered but not seen, or explicitly stood down. */
export const OPD_STOOD_DOWN_STATES = [OPD_VISIT_STATUS.NO_SHOW, OPD_VISIT_STATUS.CANCELLED];

const vitalsSchema = {
  temperature: Number,
  pulse: Number,
  bpSystolic: Number,
  bpDiastolic: Number,
  respiratoryRate: Number,
  spo2: Number,
  heightCm: Number,
  weightKg: Number,
  bmi: Number,
  bloodSugar: Number,
};

const diagnosisSchema = {
  provisional: String,
  final: String,
  icdCode: String,
};

const referralSchema = {
  toDoctor: String,
  toDepartment: String,
  reason: String,
  notes: String,
  referredAt: Date,
};

const opdVisitSchema = new mongoose.Schema(
  {
    opdNumber: { type: String, unique: true },
    // Queue position. tokenSeq is unique per doctor per day (see the partial
    // index below) so two clerks registering simultaneously cannot hand out the
    // same number, which is the whole point of showing it to a patient.
    queueToken: { type: String },
    tokenSeq: { type: Number },
    tokenDate: { type: String },
    checkedInAt: Date,
    calledAt: Date,
    consultStartedAt: Date,
    consultEndedAt: Date,
    calledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', index: true },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IpdAdmission' },
    visitDate: { type: Date, default: Date.now, index: true },
    visitType: { type: String, enum: ['NEW', 'FOLLOW_UP', 'WALK_IN', 'EMERGENCY'], default: 'NEW' },
    chiefComplaint: String,
    historyOfPresentingIllness: String,
    pastHistory: String,
    pastMedicalHistory: String,
    pastSurgicalHistory: String,
    familyHistory: String,
    personalHistory: String,
    medicationHistory: String,
    allergies: [String],
    vitals: vitalsSchema,
    examination: {
      general: String,
      systemic: String,
      templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExaminationTemplate' },
      specialty: String,
      templateName: String,
      sections: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    diagnosis: diagnosisSchema,
    treatmentPlan: String,
    advice: String,
    followUpDate: Date,
    referral: referralSchema,
    admission: mongoose.Schema.Types.Mixed,
    closeNotes: String,
    status: {
      type: String,
      enum: Object.values(OPD_VISIT_STATUS),
      default: OPD_VISIT_STATUS.WAITING,
    },
    statusHistory: {
      type: [{
        from: String,
        to: String,
        at: { type: Date, default: Date.now },
        actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        note: String,
      }],
      default: [],
    },
    noShowMarkedAt: Date,
    consultedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    vitalsStatus: { type: String, enum: ['PENDING', 'COMPLETED'], default: 'PENDING' },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

opdVisitSchema.index({ patientId: 1, visitDate: -1 });
opdVisitSchema.index({ doctorId: 1, visitDate: -1 });
opdVisitSchema.index({ status: 1, doctorId: 1, tokenSeq: 1 });

/**
 * A token number is only unique within one doctor's queue for one day. Without
 * this, two concurrent registrations - which both read a max() and then insert -
 * produce two patients both holding "Token 7", and the front desk has no way to
 * pick between them.
 */
opdVisitSchema.index(
  { doctorId: 1, tokenDate: 1, tokenSeq: 1 },
  { unique: true, partialFilterExpression: { tokenSeq: { $type: 'number' } } },
);

export default mongoose.model('OpdVisit', opdVisitSchema);