import mongoose from 'mongoose';

export const ENCOUNTER_TYPES = ['DIALYSIS_UNIT', 'OPD', 'IPD', 'EMERGENCY', 'TELEHEALTH', 'DAY_CARE'];

export const ASSESSMENT_STATUS = {
  DRAFT: 'DRAFT',
  FINAL: 'FINAL',
  SUPERSEDED: 'SUPERSEDED',
  AMENDED: 'AMENDED',
};

const allergySchema = new mongoose.Schema({
  substance: { type: String, required: true },
  reaction: String,
  severity: { type: String, enum: ['MILD', 'MODERATE', 'SEVERE', 'UNKNOWN'], default: 'UNKNOWN' },
  recordedAt: Date,
}, { _id: true });

const medicationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  dose: String,
  frequency: String,
  route: String,
  indication: String,
  since: Date,
}, { _id: true });

const labSchema = new mongoose.Schema({
  testName: String,
  value: String,
  unit: String,
  referenceRange: String,
  flag: { type: String, enum: ['NORMAL', 'LOW', 'HIGH', 'CRITICAL'], default: 'NORMAL' },
  testedAt: Date,
}, { _id: true });

const accessHistorySchema = new mongoose.Schema({
  accessId: { type: mongoose.Schema.Types.ObjectId, ref: 'DialysisAccess' },
  accessType: String,
  side: String,
  site: String,
  createdAt: Date,
  status: String,
  totalUses: Number,
  interventions: [String],
  complicationHistory: [String],
}, { _id: true });

const complicationSchema = new mongoose.Schema({
  type: { type: String, required: true },
  sessions: { type: Number, default: 1 },
  lastOccurredAt: Date,
  management: String,
  resolved: Boolean,
}, { _id: true });

const investigationSchema = new mongoose.Schema({
  name: String,
  priority: { type: String, enum: ['ROUTINE', 'URGENT', 'STAT'], default: 'ROUTINE' },
  note: String,
}, { _id: true });

/**
 * A nephrology assessment is a signed, self-contained clinical document.
 * History is copied in (not just referenced) so the note stays readable and
 * auditable years later, exactly as it was written on the day.
 */
const assessmentSchema = new mongoose.Schema(
  {
    assessmentNumber: { type: String, unique: true, index: true },

    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    dialysisPatientId: { type: mongoose.Schema.Types.ObjectId, ref: 'DialysisPatient', index: true },
    dialysisNumber: String,

    // ---- mandatory clinical identity: doctor + date + time + encounter
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true, index: true },
    doctorName: String,
    assessmentDate: { type: Date, required: true, index: true },
    assessmentTime: { type: String, required: true },
    encounterType: { type: String, enum: ENCOUNTER_TYPES, required: true, default: 'DIALYSIS_UNIT' },
    encounterId: { type: mongoose.Schema.Types.ObjectId },
    encounterNumber: String,
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IpdAdmission' },
    opdVisitId: { type: mongoose.Schema.Types.ObjectId, ref: 'OpdVisit' },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'DialysisSession' },

    // ---- 1. patient history
    patientHistory: {
      firstRegisteredAt: Date,
      uhid: String,
      ageYears: Number,
      gender: String,
      primaryDiagnosis: String,
      ckdOnsetDate: Date,
      ckdStage: String,
      esrdDate: Date,
      dialysisInitiationDate: Date,
      renalAetiology: String,
      familyHistory: String,
      socialHistory: String,
    },

    // ---- 2. CKD / ESRD history
    ckdHistory: {
      currentStage: String,
      egfr: Number,
      creatinine: Number,
      urea: Number,
      proteinuria: String,
      progressionNotes: String,
      dialysisInitiationDate: Date,
      yearsOnDialysis: Number,
      transplantHistory: String,
      priorModalities: [String],
    },

    // ---- 3. relevant medical history
    medicalHistory: {
      conditions: [String],
      surgeries: [String],
      hospitalisations: [String],
      obstetricHistory: String,
      immunizationStatus: String,
    },

    // ---- 4. comorbidities
    comorbidities: [{
      name: { type: String, required: true },
      since: Date,
      controlled: Boolean,
      note: String,
    }],

    // ---- 5. previous dialysis history
    previousDialysis: {
      totalSessions: Number,
      completedSessions: Number,
      firstSessionDate: Date,
      lastSessionDate: Date,
      currentModality: String,
      sessionsPerWeek: Number,
      scheduleDays: [String],
      averageDurationMinutes: Number,
      averageUfDeliveredPct: Number,
      lastKtV: Number,
      lastUrr: Number,
      adequacyAdequate: Boolean,
      machineUsed: String,
      accessType: String,
    },

    // ---- 6. previous complications
    previousComplications: [complicationSchema],
    complicationEpisodeCount: { type: Number, default: 0 },

    // ---- 7. allergies
    allergies: [allergySchema],

    // ---- 8. current medications
    currentMedications: [medicationSchema],

    // ---- 9. previous laboratory results
    previousLabResults: [labSchema],

    // ---- 10. access history
    accessHistory: [accessHistorySchema],

    // ---- 11. clinical assessment
    clinicalAssessment: {
      generalCondition: String,
      volumeStatus: String,
      bloodPressure: String,
      pulse: Number,
      temperature: Number,
      spo2: Number,
      weightKg: Number,
      dryWeightKg: Number,
      oedema: Boolean,
      breathlessness: Boolean,
      chestPain: Boolean,
      pallor: Boolean,
      pedalOedema: Boolean,
      raisedJVP: Boolean,
      pulmonaryCrackles: Boolean,
      accessThrill: Boolean,
      accessBruit: Boolean,
      symptoms: [String],
      examinationNotes: String,
    },

    // ---- 12. doctor notes
    doctorNotes: String,

    // ---- 13. plan
    plan: {
      prescription: {
        modality: String,
        frequencyPerWeek: Number,
        daysOfWeek: [String],
        durationMinutes: Number,
        targetDryWeightKg: Number,
        ultrafiltrationGoalMl: Number,
        maxUltrafiltrationMl: Number,
        bloodFlowRate: Number,
        dialysateFlowRate: Number,
        dialyserType: String,
        anticoagulation: String,
        accessType: String,
        accessSide: String,
      },
      investigations: [investigationSchema],
      medicationOrders: [medicationSchema],
      dietaryAdvice: String,
      fluidAdvice: String,
      patientEducation: String,
      specialInstructions: String,
      followUpDate: Date,
      nextReviewDate: Date,
      referral: String,
    },

    // ---- audit
    status: { type: String, enum: Object.values(ASSESSMENT_STATUS), default: ASSESSMENT_STATUS.DRAFT },
    version: { type: Number, default: 1 },
    previousAssessmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'DialysisAssessment' },
    amendedFromId: { type: mongoose.Schema.Types.ObjectId, ref: 'DialysisAssessment' },
    supersededById: { type: mongoose.Schema.Types.ObjectId, ref: 'DialysisAssessment' },
    signedAt: Date,
    signedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true, minimize: false },
);

assessmentSchema.index({ patientId: 1, assessmentDate: -1 });
assessmentSchema.index({ dialysisPatientId: 1, assessmentDate: -1 });
assessmentSchema.index({ doctorId: 1, assessmentDate: -1 });

export const DialysisAssessment = mongoose.model('DialysisAssessment', assessmentSchema);
export default DialysisAssessment;
