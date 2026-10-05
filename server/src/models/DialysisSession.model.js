import mongoose from 'mongoose';

export const SESSION_STATUS = {
  REQUESTED: 'REQUESTED',
  SCHEDULED: 'SCHEDULED',
  CONFIRMED: 'CONFIRMED',
  CHECKED_IN: 'CHECKED_IN',
  WAITING: 'WAITING',
  PRE_ASSESSED: 'PRE_ASSESSED',
  READY: 'READY',
  CONNECTED: 'CONNECTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  BILLED: 'BILLED',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'NO_SHOW',
};

export const SESSION_PRIORITY = { ROUTINE: 'ROUTINE', URGENT: 'URGENT', EMERGENCY: 'EMERGENCY' };
export const SHIFTS = ['MORNING', 'AFTERNOON', 'EVENING', 'NIGHT'];

export const ACCESS_SITE_STATUS = {
  NORMAL: 'NORMAL',
  REDNESS: 'REDNESS',
  SWELLING: 'SWELLING',
  BLEEDING: 'BLEEDING',
  THRILL_ABSENT: 'THRILL_ABSENT',
  INFECTED: 'INFECTED',
  COLLAPSED: 'COLLAPSED',
};

const vitalsSchema = new mongoose.Schema({
  at: { type: Date, default: Date.now },
  temperature: Number,
  pulse: Number,
  respiratoryRate: Number,
  spo2: Number,
  bpSystolic: Number,
  bpDiastolic: Number,
  bloodSugar: Number,
  temperatureDialyzer: Number,
  venousPressure: Number,
  arterialPressure: Number,
  bloodFlowRate: Number,
  dialysateFlowRate: Number,
  ultrafiltrationRate: Number,
  ufRemovedMl: Number,
  systemicBloodFlow: Number,
  notes: String,
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { _id: true });

/**
 * NOTE: every nested object below is an explicit sub-schema. An inline object
 * whose first key is `type` is interpreted by Mongoose as a type spec, not as a
 * nested document — which silently turned accessSite into a String.
 */
const preAssessmentSchema = new mongoose.Schema({
  weightKg: Number,
  dryWeightKg: Number,
  previousSessionWeightKg: Number,
  weightDifferenceKg: Number,
  weightDifferencePct: Number,
  bpSystolic: Number,
  bpDiastolic: Number,
  pulse: Number,
  temperature: Number,
  respiratoryRate: Number,
  spo2: Number,
  bloodSugar: Number,
  painScore: Number,
  complaints: [String],
  recentSymptoms: String,
  generalCondition: { type: String, enum: ['GOOD', 'FAIR', 'POOR', 'UNSTABLE'], default: 'FAIR' },
  edema: Boolean,
  breathlessness: Boolean,
  chestPain: Boolean,
  fever: Boolean,

  // medication review — what the patient says they took this morning
  medicationReview: {
    regularMedicationsTaken: Boolean,
    antihypertensivesHeld: Boolean,
    anticoagulantHeld: Boolean,
    insulinTaken: Boolean,
    lastDoseTime: String,
    discrepancies: [String],
    notes: String,
  },
  // allergy check — recorded as found, never inferred
  allergyCheck: {
    allergiesKnown: Boolean,
    allergies: [String],
    reactionReported: String,
    verifiedAgainstRecord: Boolean,
    notes: String,
  },

  // alerts are computed from hospital-configured thresholds and shown to the
  // nurse; the nurse decides, the system never blocks on its own
  safetyAlerts: [String],
  alertsAcknowledged: Boolean,
  alertsAcknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  alertsAcknowledgedAt: Date,
  acknowledgementNote: String,

  assessedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assessedAt: Date,
  notes: String,
}, { _id: false });

const accessSiteSchema = new mongoose.Schema({
  accessType: String,
  site: String,
  side: String,
  status: { type: String, enum: Object.values(ACCESS_SITE_STATUS), default: ACCESS_SITE_STATUS.NORMAL },
  thrill: Boolean,
  bruit: Boolean,
  redness: Boolean,
  swelling: Boolean,
  bleeding: Boolean,
  assessedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assessedAt: Date,
  notes: String,
}, { _id: false });

const postAssessmentSchema = new mongoose.Schema({
  weightKg: Number,
  bpSystolic: Number,
  bpDiastolic: Number,
  pulse: Number,
  temperature: Number,
  spo2: Number,
  condition: { type: String, enum: ['STABLE', 'UNSTABLE', 'CRITICAL'], default: 'STABLE' },
  patientAcceptable: Boolean,
  bleedingAtAccess: Boolean,
  dizziness: Boolean,
  cramps: Boolean,
  nausea: Boolean,
  // spec 25: the access site is re-checked at the end of the sitting, not only
  // before it. A site that was fine at 07:00 can be inflamed at 12:00.
  accessSiteCondition: { type: String, enum: Object.values(ACCESS_SITE_STATUS), default: ACCESS_SITE_STATUS.NORMAL },
  accessSiteThrill: Boolean,
  accessSiteBruit: Boolean,
  // ultrafiltration actually delivered, and any recorded fluid output
  ufAchievedMl: Number,
  outputMl: Number,
  // the plan agreed at the end of the sitting
  nextPlan: String,
  followUpDate: Date,
  assessedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assessedAt: Date,
  notes: String,
}, { _id: false });

const complicationSchema = new mongoose.Schema({
  type: { type: String, required: true },
  severity: { type: String, enum: ['MILD', 'MODERATE', 'SEVERE'], default: 'MILD' },
  occurredAt: { type: Date, default: Date.now },
  vitalsAtOnset: new mongoose.Schema({
    bpSystolic: Number, bpDiastolic: Number, pulse: Number, spo2: Number, temperature: Number,
  }, { _id: false }),
  management: String,
  medicationGiven: [String],
  actionsTaken: String,
  resolved: { type: Boolean, default: false },
  resolvedAt: Date,
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notes: String,
}, { _id: true });

const consumableSchema = new mongoose.Schema({
  consumableId: { type: mongoose.Schema.Types.ObjectId, ref: 'DialysisConsumable' },
  name: String,
  code: String,
  category: String,
  quantity: Number,
  unit: String,
  unitCost: Number,
  total: Number,
  batchNumber: String,
  expiryDate: Date,
  issuedAt: { type: Date, default: Date.now },
  issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  returnedQuantity: { type: Number, default: 0 },
}, { _id: true });

const chargeLineSchema = new mongoose.Schema({
  description: String,
  code: String,
  quantity: { type: Number, default: 1 },
  rate: Number,
  amount: Number,
  consumableId: { type: mongoose.Schema.Types.ObjectId, ref: 'DialysisConsumable' },
}, { _id: true });

/**
 * DialysisSession — one complete dialysis treatment.
 * Sessions are append-only history: nothing overwrites a completed record.
 */
const sessionSchema = new mongoose.Schema(
  {
    sessionNumber: { type: String, required: true, unique: true, index: true },
    sessionDate: { type: Date, required: true, index: true },

    // ---- who
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    dialysisPatientId: { type: mongoose.Schema.Types.ObjectId, ref: 'DialysisPatient', index: true },
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IpdAdmission', index: true },   // IPD link
    opdVisitId: { type: mongoose.Schema.Types.ObjectId, ref: 'OpdVisit', index: true },        // OPD link

    // ---- what was ordered
    prescriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'DialysisPrescription' },
    // The session's own copy of the order it ran against. It records the
    // prescription's identity as well as its values, so a session started last
    // month can still be traced back to the prescription that justified it.
    prescriptionSnapshot: {
      prescriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'DialysisPrescription' },
      prescriptionNumber: String,
      version: Number,
      modality: String,
      durationMinutes: Number,
      frequencyPerWeek: Number,
      bloodFlowRate: Number,
      dialysateFlowRate: Number,
      dialysateCalcium: String,
      dialysatePotassium: Number,
      dialyserType: String,
      targetDryWeightKg: Number,
      ultrafiltrationGoalMl: Number,
      maxUltrafiltrationMl: Number,
      heparinPrimeUnits: Number,
      accessType: String,
      prescribedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
      prescribedByName: String,
      prescribedAt: Date,
    },

    // ---- where and when
    machineId: { type: mongoose.Schema.Types.ObjectId, ref: 'DialysisMachine', index: true },
    stationId: { type: mongoose.Schema.Types.ObjectId, ref: 'DialysisStation' },
    shift: { type: String, enum: SHIFTS, default: 'MORNING' },
    priority: { type: String, enum: SESSION_PRIORITY, default: SESSION_PRIORITY.ROUTINE },
    scheduledAt: Date,
    scheduledStart: Date,
    scheduledEnd: Date,
    slotDurationMinutes: { type: Number, default: 240 },
    timeOfDay: { type: String, default: '08:00' },

    // ---- recurring programme (spec 9): every generated sitting points home
    scheduleId: { type: mongoose.Schema.Types.ObjectId, ref: 'DialysisSchedule', index: true, default: null },
    isRecurring: { type: Boolean, default: false },
    scheduleSequence: Number,
    frequencyPerWeek: Number,

    // ---- reschedule chain (spec 8)
    rescheduledFromId: { type: mongoose.Schema.Types.ObjectId, ref: 'DialysisSession', default: null },
    rescheduledToId: { type: mongoose.Schema.Types.ObjectId, ref: 'DialysisSession', default: null },
    rescheduleCount: { type: Number, default: 0 },
    isEmergency: { type: Boolean, default: false },

    requestedAt: Date,
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    confirmedAt: Date,
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // ---- who is treating
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
    nurseId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    technicianId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    checkedInBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // ---- lifecycle stamps
    checkedInAt: Date,

    // Recorded when a supervisor checked a patient in despite a failed
    // verification, so an emergency is never blocked but is always traceable.
    checkInOverride: {
      at: Date,
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      reason: String,
      failedChecks: { type: [new mongoose.Schema({ key: String, label: String, detail: String }, { _id: false })], default: [] },
    },

    preAssessedAt: Date,
    // Re-saving an assessment is an amendment, tracked separately from the
    // original assessment so the change is visible in the audit trail.
    preAssessmentAmendedAt: Date,
    preAssessmentAmendedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // Recorded when a supervisor started a session over a failed spec 17
    // precondition, so an emergency is never blocked but is always traceable.
    startOverride: {
      at: Date,
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      reason: String,
      failedChecks: { type: [new mongoose.Schema({ key: String, label: String, detail: String }, { _id: false })], default: [] },
    },
    readyAt: Date,
    connectedAt: Date,
    startedAt: Date,
    completedAt: Date,
    disconnectedAt: Date,
    billedAt: Date,
    closedAt: Date,
    cancelledAt: Date,
    cancelReason: String,
    noShowAt: Date,

    // ---- pre dialysis
    preAssessment: { type: preAssessmentSchema, default: () => ({}) },
    accessSite: { type: accessSiteSchema, default: () => ({}) },
    /**
     * Re-saving an in-session assessment used to overwrite the previous one with
     * no trace, so a corrected weight or an access finding could not be defended
     * later. Every superseded version is kept here, newest last, alongside who
     * replaced it and why.
     */
    preAssessmentRevisions: [{
      assessment: { type: preAssessmentSchema, default: () => ({}) },
      accessSite: { type: accessSiteSchema, default: () => ({}) },
      supersededAt: Date,
      supersededBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      reason: String,
    }],

    // ---- treatment
    bloodFlowRate: Number,
    dialysateFlowRate: Number,
    dialysateTemperature: Number,
    venousPressure: Number,
    arterialPressure: Number,
    dialyserType: String,
    heparinUnits: Number,
    salineFlushMl: Number,
    oxygenGiven: Boolean,
    medicationsGiven: [{
      name: String,
      dose: String,
      route: String,
      at: Date,
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    }],

    preWeightKg: Number,
    postWeightKg: Number,
    weightChangeKg: Number,
    ufGoalMl: Number,
    ufRemovedMl: Number,
    ufDeliveredPct: Number,
    durationMinutes: Number,
    startTime: Date,
    endTime: Date,

    // ---- post dialysis
    postAssessment: { type: postAssessmentSchema, default: () => ({}) },
    postAssessmentRevisions: [{
      assessment: { type: postAssessmentSchema, default: () => ({}) },
      supersededAt: Date,
      supersededBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      reason: String,
    }],
    disconnectionTime: Date,
    // Recorded when a supervisor completed a session over a failed spec 25
    // completion check, so the gap is visible in the record after the fact.
    completionOverride: {
      at: Date,
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      reason: String,
      failedChecks: { type: [new mongoose.Schema({ key: String, label: String, detail: String }, { _id: false })], default: [] },
    },

    // ---- continuous monitoring
    vitals: [vitalsSchema],
    // Present only when readings have actually been dropped, so an ordinary
    // session looks untouched and a trimmed one is self-evidently not complete.
    vitalsTrimmed: {
      count: { type: Number, default: 0 },
      firstDroppedAt: Date,
      lastTrimmedAt: Date,
    },

    /**
     * A critical reading has to survive being written. These two were being set
     * on the document without existing here, so Mongoose strict mode threw them
     * away on every save and the command centre's critical-alert panel — which
     * reads these fields — could never see a single alert.
     */
    criticalFlag: { type: String, enum: ['SPO2_LOW', 'BP_CRITICAL', null], default: null },
    criticalFlaggedAt: Date,
    criticalFlaggedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // set from the pre-dialysis access check, cleared once the site is verified
    preAccessFlag: { type: String, default: null },
    preAccessFlaggedAt: Date,

    // ---- events
    complications: [complicationSchema],
    consumables: [consumableSchema],
    labOrderIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'LabOrder' }],
    medicationOrderIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'MedicationChart' }],

    // ---- money
    charges: [chargeLineSchema],
    totalAmount: { type: Number, default: 0 },
    billId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill' },
    paymentStatus: { type: String, enum: ['UNBILLED', 'BILLED', 'PARTIAL', 'PAID', 'INSURANCE_PENDING', 'WAIVED'], default: 'UNBILLED' },
    paidAmount: { type: Number, default: 0 },
    insuranceApprovedAmount: Number,
    insuranceClaimId: { type: mongoose.Schema.Types.ObjectId, ref: 'InsuranceClaim' },

    // ---- follow up
    nextSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'DialysisSession' },
    followUpRequired: { type: Boolean, default: false },
    followUpDate: Date,

    status: { type: String, enum: Object.values(SESSION_STATUS), default: SESSION_STATUS.SCHEDULED, index: true },
    statusHistory: [{
      from: String,
      to: String,
      at: { type: Date, default: Date.now },
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      note: String,
    }],

    notes: String,
    cancellationReason: String,
    emergencyReason: String,

    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true, minimize: false },
);

sessionSchema.index({ sessionDate: -1, shift: 1 });
sessionSchema.index({ patientId: 1, sessionDate: -1 });
sessionSchema.index({ machineId: 1, sessionDate: -1 });
sessionSchema.index({ status: 1, sessionDate: 1 });

export const DialysisSession = mongoose.model('DialysisSession', sessionSchema);
export default DialysisSession;
