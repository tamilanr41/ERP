import mongoose from 'mongoose';

export const DEFAULT_SHIFT_DEFINITIONS = [
  { code: 'MORNING', label: 'Morning', startTime: '06:00', endTime: '12:00' },
  { code: 'AFTERNOON', label: 'Afternoon', startTime: '12:00', endTime: '18:00' },
  { code: 'EVENING', label: 'Evening', startTime: '18:00', endTime: '22:00' },
  { code: 'NIGHT', label: 'Night', startTime: '22:00', endTime: '06:00' },
];

export const DEFAULT_RECURRENCE_PATTERNS = [
  { code: 'MWF', label: 'Monday, Wednesday, Friday', days: ['MON', 'WED', 'FRI'], frequencyPerWeek: 3 },
  { code: 'TTS', label: 'Tuesday, Thursday, Saturday', days: ['TUE', 'THU', 'SAT'], frequencyPerWeek: 3 },
  { code: 'TWOTH', label: 'Monday & Thursday', days: ['MON', 'THU'], frequencyPerWeek: 2 },
  { code: 'ALTDAYS', label: 'Alternate days', days: ['MON', 'WED', 'FRI'], frequencyPerWeek: 3, note: 'Every other day' },
  { code: 'DAILY', label: 'Every day', days: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'], frequencyPerWeek: 7 },
  { code: 'BIWEEKLY', label: 'Once a fortnight', days: ['MON'], frequencyPerWeek: 0.5 },
  { code: 'WEEKLY', label: 'Once a week', days: ['SAT'], frequencyPerWeek: 1 },
];

/**
 * Hospital-configured dialysis rules. Nothing clinical is hard-coded in the
 * service layer: modality lists, dialysate defaults, anticoagulation options,
 * shifts, recurrence patterns and the slot-grid layout all live here so each
 * hospital can run its own protocol.
 */
const configSchema = new mongoose.Schema(
  {
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },

    prescription: {
      modalities: { type: [String], default: ['HEMODIALYSIS', 'PERITONEAL', 'CRRT', 'SLED', 'HDF'] },
      accessTypes: { type: [String], default: ['AV_FISTULA', 'AV_GRAFT', 'CVC', 'PD_CATHETER', 'BUTTON_HOLE', 'NONE'] },
      durationOptions: { type: [Number], default: [120, 180, 210, 240, 270, 300] },
      bloodFlowRange: { min: { type: Number, default: 50 }, max: { type: Number, default: 600 } },
      dialysateFlowRange: { min: { type: Number, default: 100 }, max: { type: Number, default: 1000 } },
      maxUfRange: { min: { type: Number, default: 0 }, max: { type: Number, default: 8000 } },

      // clinical defaults applied to every new prescription draft
      defaults: {
        modality: { type: String, default: 'HEMODIALYSIS' },
        durationMinutes: { type: Number, default: 240 },
        frequencyPerWeek: { type: Number, default: 3 },
        bloodFlowRate: { type: Number, default: 300 },
        dialysateFlowRate: { type: Number, default: 500 },
        dialysateCalcium: String,
        dialysatePotassium: Number,
        dialysateSodium: Number,
        dialysateTemperature: Number,
        dialyserType: String,
        ultrafiltrationGoalMl: { type: Number, default: 2500 },
        maxUltrafiltrationMl: { type: Number, default: 3500 },
        anticoagulationProtocol: String,
        heparinPrimeUnits: { type: Number, default: 5000 },
        accessType: { type: String, default: 'AV_FISTULA' },
      },

      // hospital thresholds used by the safety checks (never hard-coded rules)
      safety: {
        systolicMin: { type: Number, default: 90 },
        systolicMax: { type: Number, default: 180 },
        diastolicMin: { type: Number, default: 50 },
        diastolicMax: { type: Number, default: 120 },
        pulseMin: { type: Number, default: 45 },
        pulseMax: { type: Number, default: 130 },
        respiratoryRateMin: { type: Number, default: 8 },
        respiratoryRateMax: { type: Number, default: 30 },
        temperatureMinF: { type: Number, default: 95 },
        temperatureMaxF: { type: Number, default: 103 },
        spo2Min: { type: Number, default: 90 },
        bloodSugarMin: { type: Number, default: 70 },
        bloodSugarMax: { type: Number, default: 300 },
        painScoreAlert: { type: Number, default: 7 },
        // weight alerts are relative, so they work whatever the patient's dry weight is
        weightGainAlertKg: { type: Number, default: 2 },
        weightChangeAlertKg: { type: Number, default: 3 },
      },

      // pre-dialysis safety flow: the system alerts, the nurse decides
      safetyFlow: {
        requireNurseAcknowledgement: { type: Boolean, default: true },
        allowUnacknowledgedAlertsToReady: { type: Boolean, default: false },
      },
    },

    // machine and bay management (spec 11 & 12)
    units: {
      machineServiceIntervalDays: { type: Number, default: 90 },
      serviceDueWarningDays: { type: Number, default: 14 },
      defaultBedOrChair: { type: String, default: 'CHAIR' },
      requireTurnoverSignOff: { type: Boolean, default: true },
    },

    /**
     * Spec 23/24 — the consumable catalogue is hospital-defined, not a fixed
     * list. `categories` is the vocabulary the unit picks from and
     * `requiredPerSession` is what must be on the trolley before a session may
     * start. An empty requirement list means the hospital has not configured
     * one, and the gate stays open rather than inventing a requirement.
     */
    consumables: {
      categories: {
        type: [String],
        default: ['LINE_SET', 'DIALYSER', 'HEPARIN', 'CANNULA', 'DRUG', 'DRESSING', 'ANTICOAGULANT', 'SALINE', 'BLOOD_PRODUCT', 'FILTER', 'NEEDLE', 'OTHER'],
      },
      requiredPerSession: {
        type: [new mongoose.Schema({
          name: String,
          code: String,
          category: String,
          quantity: { type: Number, default: 1 },
          unit: String,
          required: { type: Boolean, default: true },
        }, { _id: false })],
        default: [],
      },
      // spec 24 forbids using expired stock on a patient
      blockExpiredIssue: { type: Boolean, default: true },
      // spec 24 forbids deducting the same issue twice on a retry
      blockDuplicateIssue: { type: Boolean, default: true },
    },

    /**
     * Spec 27 — the charge components a unit bills for, configured per hospital
     * rather than baked into the code. A component says how it is derived, not
     * what it costs: PER_SESSION and PER_MINUTE/PER_HOUR scale with the sitting,
     * and FROM_MEDICATIONS/FROM_LABS follow what was actually given or ordered.
     * Consumables are deliberately not listed here — they are charged from the
     * lines actually issued to the session, so a patient is never billed for
     * stock that was not used on them.
     */
    charges: {
      components: {
        type: [new mongoose.Schema({
          code: { type: String, required: true },
          label: String,
          basis: {
            type: String,
            enum: ['FIXED', 'PER_SESSION', 'PER_HOUR', 'PER_MINUTE', 'FROM_MEDICATIONS', 'FROM_LABS'],
            default: 'FIXED',
          },
          rate: { type: Number, default: 0 },
          taxable: { type: Boolean, default: true },
          active: { type: Boolean, default: true },
        }, { _id: false })],
        default: [
          { code: 'DIALYSIS_SESSION', label: 'Dialysis session', basis: 'PER_SESSION', rate: 0, taxable: true, active: true },
          { code: 'STATION', label: 'Bay / chair', basis: 'PER_HOUR', rate: 0, taxable: false, active: false },
          { code: 'DOCTOR', label: 'Nephrologist professional fee', basis: 'PER_SESSION', rate: 0, taxable: true, active: false },
          { code: 'NURSING', label: 'Nursing care', basis: 'PER_HOUR', rate: 0, taxable: true, active: false },
          { code: 'MEDICATION', label: 'Medication administered', basis: 'FROM_MEDICATIONS', rate: 0, taxable: true, active: false },
          { code: 'LAB', label: 'Investigations', basis: 'FROM_LABS', rate: 0, taxable: true, active: false },
        ],
      },
      // a rate that differs from the configured one has to say why, and is audited
      requireReasonOnRateOverride: { type: Boolean, default: true },
    },

    /**
     * Spec 17 — the eight items verified before START DIALYSIS. Each flag lets
     * a hospital relax a single line without disabling the gate wholesale. A
     * supervisor may still override a failure with a recorded reason, which is
     * audited the same way a check-in override is.
     */
    sessionStart: {
      requirePatientVerified: { type: Boolean, default: true },
      requireSessionArrived: { type: Boolean, default: true },
      requirePrescription: { type: Boolean, default: true },
      requireMachine: { type: Boolean, default: true },
      requireStation: { type: Boolean, default: true },
      requirePreAssessment: { type: Boolean, default: true },
      requireConsumables: { type: Boolean, default: true },
      requireNurse: { type: Boolean, default: true },
      allowOverride: { type: Boolean, default: true },
    },

    /**
     * Spec 25 — a session must not be marked COMPLETED until these post-dialysis
     * fields are handled. Turning a flag off makes that field optional for this
     * hospital; the gate is enforced from the config, never from the code.
     */
    completion: {
      requirePostWeight: { type: Boolean, default: true },
      requirePostVitals: { type: Boolean, default: true },
      requireCondition: { type: Boolean, default: true },
      requireAccessSiteCheck: { type: Boolean, default: true },
      requireNextPlan: { type: Boolean, default: false },
      allowOverride: { type: Boolean, default: true },
    },

    // access assessment vocabulary, configurable per hospital (spec 15)
    access: {
      siteConditions: { type: [String], default: ['NORMAL', 'REDNESS', 'SWELLING', 'BLEEDING', 'INFECTED', 'SCARRING', 'COLLAPSED', 'DISLODGED'] },
      attentionSigns: { type: [String], default: ['REDRESS', 'SWELLING', 'BLEEDING', 'INFECTION', 'THRILL_ABSENT', 'BRUIT_ABNORMAL', 'PAIN', 'COLD_PALM', 'CATHETER_EXIT_DISCHARGE', 'CRYSTALLISATION', 'DISLODGED_CANNULA', 'OTHER'] },
      patencyResults: { type: [String], default: ['NORMAL_THRILL', 'WEAK_THRILL', 'NO_THRILL', 'COLLAPSED', 'NOT_APPLICABLE', 'NOT_ASSESSED'] },
      statuses: { type: [String], default: ['NEW', 'PATENT', 'DYSFUNCTIONAL', 'STENOSIS', 'THROMBOSIS', 'INFECTION', 'ANEURYSM', 'NEEDS_REVISION', 'DECOMMISSIONED'] },
    },

    scheduling: {
      shifts: { type: [new mongoose.Schema({ code: String, label: String, startTime: String, endTime: String }, { _id: false })], default: DEFAULT_SHIFT_DEFINITIONS },
      defaultShift: { type: String, default: 'MORNING' },
      recurrencePatterns: { type: [new mongoose.Schema({ code: String, label: String, days: [String], frequencyPerWeek: Number, note: String }, { _id: false })], default: DEFAULT_RECURRENCE_PATTERNS },
      defaultDurationMinutes: { type: Number, default: 240 },
      defaultPriority: { type: String, default: 'ROUTINE' },
      leadTimeDays: { type: Number, default: 30 },
      maxAdvanceDays: { type: Number, default: 90 },
      allowEmergencyOverflow: { type: Boolean, default: true },
    },

    slotGrid: {
      dayStart: { type: String, default: '06:00' },
      dayEnd: { type: String, default: '22:00' },
      slotMinutes: { type: Number, default: 60 },
      visibleStations: { type: Number, default: 6 },
      stationIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'DialysisStation' }],
    },

    followUp: {
      reviewIntervalDays: { type: Number, default: 30 },
      labPanel: [{ name: String, frequency: String }],
    },

    active: { type: Boolean, default: true },
  },
  { timestamps: true, minimize: false },
);

export const DialysisConfig = mongoose.model('DialysisConfig', configSchema);
export default DialysisConfig;
