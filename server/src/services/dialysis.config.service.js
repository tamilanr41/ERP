import { DialysisConfig, DEFAULT_RECURRENCE_PATTERNS, DEFAULT_SHIFT_DEFINITIONS } from '../models/DialysisConfig.model.js';
import { writeAudit } from '../middleware/audit.js';
import { NotFoundError, ForbiddenError } from '../utils/ApiError.js';

/**
 * Spec 27 — the charge components a unit bills for. These are the shipped
 * defaults; a hospital switches on the ones it actually charges for and sets
 * its own rate. Consumables are not a component because they are charged from
 * what was actually issued to the session, never from a standing price list.
 */
const FALLBACK_CHARGES = {
  components: [
    { code: 'DIALYSIS_SESSION', label: 'Dialysis session', basis: 'PER_SESSION', rate: 0, taxable: true, active: true },
    { code: 'STATION', label: 'Bay / chair', basis: 'PER_HOUR', rate: 0, taxable: false, active: false },
    { code: 'DOCTOR', label: 'Nephrologist professional fee', basis: 'PER_SESSION', rate: 0, taxable: true, active: false },
    { code: 'NURSING', label: 'Nursing care', basis: 'PER_HOUR', rate: 0, taxable: true, active: false },
    { code: 'MEDICATION', label: 'Medication administered', basis: 'FROM_MEDICATIONS', rate: 0, taxable: true, active: false },
    { code: 'LAB', label: 'Investigations', basis: 'FROM_LABS', rate: 0, taxable: true, active: false },
  ],
  requireReasonOnRateOverride: true,
};

/**
 * The settable sections are derived from the schema rather than listed by hand.
 * A hand-maintained list silently dropped every section added after it was
 * written — a config save would answer 200 and store nothing.
 */
const configSections = [...new Set(
  Object.keys(DialysisConfig.schema.paths)
    .filter((p) => p.includes('.'))
    .map((p) => p.split('.')[0]),
)];

// keys that are merged field-by-field rather than replaced wholesale
const NESTED_MERGE_KEYS = {
  prescription: ['defaults', 'safety', 'safetyFlow'],
};

const FALLBACK = {
  prescription: {
    modalities: ['HEMODIALYSIS', 'PERITONEAL', 'CRRT', 'SLED', 'HDF'],
    accessTypes: ['AV_FISTULA', 'AV_GRAFT', 'CVC', 'PD_CATHETER', 'BUTTON_HOLE', 'NONE'],
    durationOptions: [120, 180, 210, 240, 270, 300],
    defaults: {
      modality: 'HEMODIALYSIS', durationMinutes: 240, frequencyPerWeek: 3,
      bloodFlowRate: 300, dialysateFlowRate: 500, ultrafiltrationGoalMl: 2500,
      maxUltrafiltrationMl: 3500, heparinPrimeUnits: 5000, accessType: 'AV_FISTULA',
    },
    safety: {
      systolicMin: 90, systolicMax: 180, diastolicMin: 50, diastolicMax: 120,
      pulseMin: 45, pulseMax: 130, respiratoryRateMin: 8, respiratoryRateMax: 30,
      temperatureMinF: 95, temperatureMaxF: 103,
      spo2Min: 90, bloodSugarMin: 70, bloodSugarMax: 300,
      painScoreAlert: 7, weightGainAlertKg: 2, weightChangeAlertKg: 3,
    },
    safetyFlow: { requireNurseAcknowledgement: true, allowUnacknowledgedAlertsToReady: false },
  },
  units: {
    machineServiceIntervalDays: 90,
    serviceDueWarningDays: 14,
    defaultBedOrChair: 'CHAIR',
    requireTurnoverSignOff: true,
  },
  access: {
    siteConditions: ['NORMAL', 'REDNESS', 'SWELLING', 'BLEEDING', 'INFECTED', 'SCARRING', 'COLLAPSED', 'DISLODGED'],
    attentionSigns: ['REDRESS', 'SWELLING', 'BLEEDING', 'INFECTION', 'THRILL_ABSENT', 'BRUIT_ABNORMAL', 'PAIN', 'COLD_PALM', 'CATHETER_EXIT_DISCHARGE', 'CRYSTALLISATION', 'DISLODGED_CANNULA', 'OTHER'],
    patencyResults: ['NORMAL_THRILL', 'WEAK_THRILL', 'NO_THRILL', 'COLLAPSED', 'NOT_APPLICABLE', 'NOT_ASSESSED'],
    statuses: ['NEW', 'PATENT', 'DYSFUNCTIONAL', 'STENOSIS', 'THROMBOSIS', 'INFECTION', 'ANEURYSM', 'NEEDS_REVISION', 'DECOMMISSIONED'],
  },
  scheduling: {
    shifts: DEFAULT_SHIFT_DEFINITIONS,
    defaultShift: 'MORNING',
    recurrencePatterns: DEFAULT_RECURRENCE_PATTERNS,
    defaultDurationMinutes: 240,
    defaultPriority: 'ROUTINE',
    leadTimeDays: 30,
    maxAdvanceDays: 90,
    allowEmergencyOverflow: true,
  },
  slotGrid: { dayStart: '06:00', dayEnd: '22:00', slotMinutes: 60, visibleStations: 6, stationIds: [] },
  followUp: { reviewIntervalDays: 30, labPanel: [] },
  charges: FALLBACK_CHARGES,
};

/**
 * Reads the hospital's dialysis configuration, creating the default document on
 * first use. Every clinical default, threshold, shift and recurrence pattern
 * used anywhere in the module comes from here.
 */
export const getDialysisConfig = async (hospitalId = null, branchId = null) => {
  const scoped = await DialysisConfig.findOne({ active: true, hospitalId: hospitalId ?? null, branchId: branchId ?? null }).lean();
  const config = scoped || await DialysisConfig.findOne({ active: true, hospitalId: null }).lean();
  if (!config) {
    const [created] = await DialysisConfig.create([{ hospitalId, branchId }]);
    return mergeConfig(created.toObject());
  }
  return mergeConfig(config);
};

const mergeConfig = (config) => ({
  ...FALLBACK,
  ...config,
  prescription: {
    ...FALLBACK.prescription,
    ...(config.prescription || {}),
    defaults: { ...FALLBACK.prescription.defaults, ...((config.prescription || {}).defaults || {}) },
    safety: { ...FALLBACK.prescription.safety, ...((config.prescription || {}).safety || {}) },
    // Sections added after a hospital's config was first written are merged in
    // here, so an existing hospital never reads as if the rule is unset.
    safetyFlow: { ...FALLBACK.prescription.safetyFlow, ...((config.prescription || {}).safetyFlow || {}) },
  },
  ...Object.fromEntries(configSections
    .filter((s) => s !== 'prescription')
    .map((s) => [s, { ...(FALLBACK[s] || {}), ...(config[s] || {}) }])),
});

/**
 * The parts of the dialysis configuration that decide whether a clinical gate
 * fires. Someone who manages equipment has a legitimate reason to change shift
 * grids and unit lists, and no legitimate reason to switch off the requirement
 * for a pre-dialysis assessment, the expiry block, or the completion record.
 */
const CLINICAL_SECTIONS = {
  prescription: ['safety', 'safetyFlow', 'defaults'],
  sessionStart: '*',
  completion: '*',
  access: '*',
  charges: '*',
  consumables: ['blockExpiredIssue', 'requireReasonForManualIssue'],
};

const clinicalTouches = (payload) => Object.entries(CLINICAL_SECTIONS).filter(([section, keys]) => {
  const body = payload?.[section];
  if (!body || typeof body !== 'object') return false;
  if (keys === '*') return true;
  return keys.some((k) => body[k] !== undefined);
});

export const updateDialysisConfig = async (payload, actor) => {
  const hospitalId = actor?.hospitalId;
  const branchId = actor?.branchId;

  // Checked here rather than only on the route: the route permission is an OR,
  // so an equipment manager passes it, and this is the only place that cannot
  // be sidestepped by another caller.
  const clinical = clinicalTouches(payload);
  if (clinical.length) {
    const role = (actor?.roleCode || '').toUpperCase();
    const granted = actor?.permissions || [];
    const allowed = role === 'SUPER_ADMIN' || granted.includes('DIALYSIS_CLINICAL_CONFIG');
    if (!allowed) {
      throw new ForbiddenError(
        `Changing dialysis clinical safety settings requires DIALYSIS_CLINICAL_CONFIG (attempted: ${clinical.map(([s]) => s).join(', ')})`,
      );
    }
  }

  let config = await DialysisConfig.findOne({ hospitalId, branchId });
  if (!config) {
    const [created] = await DialysisConfig.create([{ hospitalId, branchId }]);
    config = created;
  }
  const before = config.toObject();

  configSections.forEach((section) => {
    if (!payload[section] || typeof payload[section] !== 'object') return;
    Object.entries(payload[section]).forEach(([key, value]) => {
      if (NESTED_MERGE_KEYS[section]?.includes(key)) {
        config[section][key] = { ...(config[section]?.[key] || {}), ...value };
      } else {
        config[section][key] = value;
      }
    });
  });
  if (payload.active !== undefined) config.active = Boolean(payload.active);
  await config.save();

  const changes = {};
  configSections.forEach((section) => {
    if (JSON.stringify(before[section]) !== JSON.stringify(config[section])) {
      changes[section] = { from: before[section], to: config[section] };
    }
  });
  if (Object.keys(changes).length) {
    await writeAudit({
      user: actor, action: 'DIALYSIS_CONFIG_UPDATE', module: 'dialysis', entityId: config._id, entityType: 'DialysisConfig',
      data: { before: changes, changedSections: Object.keys(changes) },
    });
  }
  return config;
};

/** Clinical safety thresholds — hospital-configured, never hard-coded. */
export const safetyThresholds = async () => {
  const config = await getDialysisConfig();
  return config.prescription.safety;
};

export const prescriptionDefaults = async () => {
  const config = await getDialysisConfig();
  return {
    defaults: config.prescription.defaults,
    safety: config.prescription.safety,
    modalities: config.prescription.modalities,
    accessTypes: config.prescription.accessTypes,
    durationOptions: config.prescription.durationOptions,
    bloodFlowRange: config.prescription.bloodFlowRange,
    dialysateFlowRange: config.prescription.dialysateFlowRange,
    maxUfRange: config.prescription.maxUfRange,
  };
};

export const schedulingConfig = async () => {
  const config = await getDialysisConfig();
  return {
    ...config.scheduling,
    slotGrid: config.slotGrid,
    labPanel: config.followUp.labPanel,
    reviewIntervalDays: config.followUp.reviewIntervalDays,
  };
};

export const timeToMinutes = (t) => {
  const [h, m] = String(t || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/**
 * Parses a calendar day in the hospital's local timezone. `new Date('2026-09-26')`
 * is parsed as UTC midnight, which in IST lands on the previous local day once
 * normalised — so a plain date string must be split and built locally.
 */
export const parseLocalDay = (value, fallback = new Date()) => {
  if (value instanceof Date) return new Date(value);
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  const d = value ? new Date(value) : new Date(fallback);
  return Number.isNaN(d.getTime()) ? new Date(fallback) : d;
};

export const startOfLocalDay = (value) => {
  const d = parseLocalDay(value);
  d.setHours(0, 0, 0, 0);
  return d;
};

export const endOfLocalDay = (value) => {
  const d = startOfLocalDay(value);
  d.setDate(d.getDate() + 1);
  return d;
};

export const minutesToTime = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export const shiftForTime = (d, config = null) => {
  const hour = new Date(d).getHours();
  const shifts = config?.scheduling?.shifts || DEFAULT_SHIFT_DEFINITIONS;
  const t = hour * 60;
  const found = shifts.find((sh) => {
    const s = timeToMinutes(sh.startTime);
    const e = timeToMinutes(sh.endTime);
    return e > s ? t >= s && t < e : t >= s || t < e;
  });
  return found?.code || (hour < 8 ? 'MORNING' : hour < 14 ? 'AFTERNOON' : hour < 20 ? 'EVENING' : 'NIGHT');
};

export const requireConfig = async () => {
  const config = await getDialysisConfig();
  if (!config) throw new NotFoundError('Dialysis configuration missing');
  return config;
};

export default { getDialysisConfig, updateDialysisConfig, safetyThresholds, prescriptionDefaults, schedulingConfig };
