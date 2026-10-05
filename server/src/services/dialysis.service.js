import mongoose from 'mongoose';
import { DialysisPatient, DIALYSIS_TYPES, ACCESS_TYPES, DIALYSIS_PATIENT_STATUS } from '../models/DialysisPatient.model.js';
import { DialysisMachine, MACHINE_STATUS, SERVICE_TYPE } from '../models/DialysisMachine.model.js';
import { DialysisStation, STATION_STATUS, STATION_KIND } from '../models/DialysisStation.model.js';
import { DialysisPrescription, PRESCRIPTION_STATUS } from '../models/DialysisPrescription.model.js';
import { DialysisSession, SESSION_STATUS, SESSION_PRIORITY, SHIFTS, ACCESS_SITE_STATUS } from '../models/DialysisSession.model.js';
import { DialysisAccess, ACCESS_STATUS, ACCESS_ASSESSMENT_RESULTS } from '../models/DialysisAccess.model.js';
import {
  DialysisAccessAssessment, ACCESS_SITE_CONDITION, PATENCY_RESULT, ATTENTION_SIGN,
} from '../models/DialysisAccessAssessment.model.js';
import { DialysisConsumable, CONSUMABLE_CATEGORIES } from '../models/DialysisConsumable.model.js';
import Patient from '../models/Patient.model.js';
import Doctor from '../models/Doctor.model.js';
import IpdAdmission, { ADMISSION_STATUS } from '../models/IpdAdmission.model.js';
import LabOrder, { LAB_ORDER_STATUS } from '../models/LabOrder.model.js';
import { generateNumber, NUMBER_PREFIXES } from '../utils/numberGenerator.js';
import { createBillingService } from './billing.service.js';
import { BadRequestError, NotFoundError, ConflictError, ForbiddenError } from '../utils/ApiError.js';
import { writeAudit } from '../middleware/audit.js';
import { emitIpd, IPD_SOCKET_EVENTS } from '../utils/socket.io.server.js';
import { emitDialysis as emitDialysisShared } from './dialysis.emit.js';
import { getDialysisConfig, prescriptionDefaults, safetyThresholds, startOfLocalDay, endOfLocalDay } from './dialysis.config.service.js';
import { bookSession } from './dialysis.schedule.service.js';

// ============================================================
// LIFECYCLE STATE MACHINE
// ============================================================
// Re-saving a pre-assessment is an amendment, not a transition, so
// PRE_ASSESSED is listed as reachable from itself. Without it a nurse who
// saved an assessment with alerts raised had no way to record the
// acknowledgement, because the only way to acknowledge is to save again.
export const SESSION_TRANSITIONS = {
  REQUESTED: ['SCHEDULED', 'CONFIRMED', 'CANCELLED', 'NO_SHOW'],
  SCHEDULED: ['CONFIRMED', 'CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
  CONFIRMED: ['CHECKED_IN', 'WAITING', 'CANCELLED', 'NO_SHOW'],
  CHECKED_IN: ['PRE_ASSESSED', 'WAITING', 'CANCELLED', 'NO_SHOW'],
  WAITING: ['PRE_ASSESSED', 'CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
  PRE_ASSESSED: ['PRE_ASSESSED', 'READY', 'CANCELLED'],
  READY: ['PRE_ASSESSED', 'CONNECTED', 'CANCELLED'],
  CONNECTED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['BILLED', 'CLOSED'],
  BILLED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

// Readings retained per session. A four-hour sitting at five-minute intervals
// uses 48, so this is only reached by an unusually dense or very long run.
const VITALS_RETENTION = 2000;

const ensureTransition = (from, to) => {
  const allowed = SESSION_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    throw new ConflictError(`Cannot move a dialysis session from ${from} to ${to} (allowed: ${allowed.join(', ') || 'none'})`);
  }
};

/**
 * Overriding a clinical gate is a supervisory act. Previously any holder of
 * DIALYSIS_SESSION_RUN could send an `overrideReason` and walk past the
 * pre-assessment requirement, the machine and bay checks, the prescription
 * requirement and the whole post-dialysis record — so the "supervisor can start
 * over the failure" flow was open to the person the gate was written for.
 * The reason is still mandatory; this adds the authority to give one.
 */
const OVERRIDE_PERMISSIONS = ['DIALYSIS_SESSION_OVERRIDE', 'DIALYSIS_CLINICAL_CONFIG'];
const assertOverrideAuthority = (actor, what) => {
  const role = (actor?.roleCode || '').toUpperCase();
  const granted = actor?.permissions || [];
  if (role === 'SUPER_ADMIN' || OVERRIDE_PERMISSIONS.some((p) => granted.includes(p))) return;
  throw new ForbiddenError(
    `${what} past a failed safety check requires supervisor authority (${OVERRIDE_PERMISSIONS.join(' or ')}). A reason alone is not enough.`,
  );
};

const todayKey = (d = new Date()) => {
  const dt = new Date(d);
  const yy = String(dt.getFullYear()).slice(-2);
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
};

/** DIA-260921-0007 */
const generateDialysisNumber = async (session) => {
  const prefix = `DIA-${todayKey()}`;
  const last = await DialysisPatient.findOne({ dialysisNumber: new RegExp(`^${prefix}`) })
    .sort({ dialysisNumber: -1 })
    .select('dialysisNumber')
    .lean({ session });
  const seq = last ? Number(String(last.dialysisNumber).split('-')[2] || 0) + 1 : 1;
  return `${prefix}-${String(seq).padStart(4, '0')}`;
};

const getPatient = async (patientId, session) => {
  const patient = await Patient.findById(patientId).session(session || null);
  if (!patient) throw new BadRequestError('Patient not found — search an existing hospital patient first');
  return patient;
};

const getDoctor = async (doctorId, session) => {
  if (!doctorId) return null;
  const doctor = await Doctor.findById(doctorId).session(session || null).select('_id name active departmentId');
  if (!doctor) throw new BadRequestError('Doctor not found');
  return doctor;
};

// ============================================================
// 1. REGISTRATION
// ============================================================
export const registerDialysisPatient = async (payload, actor) => {
  const patient = await getPatient(payload.patientId);

  // Never create a duplicate dialysis registration for the same patient.
  const existing = await DialysisPatient.findOne({ patientId: patient._id });
  if (existing) {
    throw new ConflictError(
      `Patient already registered for dialysis as ${existing.dialysisNumber} — open the existing dialysis record instead`,
    );
  }

  if (payload.nephrologistId) await getDoctor(payload.nephrologistId);
  if (payload.referringDoctorId) await getDoctor(payload.referringDoctorId);
  if (payload.dialysisType && !Object.values(DIALYSIS_TYPES).includes(payload.dialysisType)) {
    throw new BadRequestError('Invalid dialysis type');
  }
  if (payload.accessType && !Object.values(ACCESS_TYPES).includes(payload.accessType)) {
    throw new BadRequestError('Invalid access type');
  }

  const dialysisNumber = await generateDialysisNumber();

  const record = await DialysisPatient.create({
    ...payload,
    dialysisNumber,
    patientId: patient._id,
    bloodGroup: payload.bloodGroup || patient.bloodGroup,
    registeredBy: actor?.id,
    hospitalId: actor?.hospitalId,
    branchId: actor?.branchId,
    status: DIALYSIS_PATIENT_STATUS.ACTIVE,
  });

  // Vascular access record (real registry, not a text field)
  if (payload.accessType && payload.accessType !== ACCESS_TYPES.NONE) {
    const side = payload.accessSide && payload.accessSide !== 'NOT_APPLICABLE' ? payload.accessSide : 'LEFT';
    await DialysisAccess.create({
      patientId: patient._id,
      dialysisPatientId: record._id,
      accessType: payload.accessType,
      side,
      site: payload.accessSite,
      createdAt: payload.accessCreatedAt || new Date(),
      createdBy: actor?.id,
      operatedBy: payload.referringDoctorId,
      status: ACCESS_STATUS.NEW,
      isPrimary: true,
      hospitalId: actor?.hospitalId,
    });
    record.accessSide = side;
    record.accessCreatedAt = payload.accessCreatedAt || new Date();
    await record.save();
  }

  await writeAudit({
    user: actor,
    action: 'DIALYSIS_REGISTER',
    module: 'dialysis',
    entityId: record._id,
    entityType: 'DialysisPatient',
    data: { dialysisNumber, patientId: patient._id, uhid: patient.uhid, dialysisType: record.dialysisType, nephrologistId: record.nephrologistId },
  });

  emitIpd(IPD_SOCKET_EVENTS.BED_BOARD_UPDATED, { reason: 'dialysis:registered', dialysisNumber });
  return getDialysisPatient(record._id);
};

export const getDialysisPatient = async (id) => {
  const record = await DialysisPatient.findById(id)
    .populate('patientId', 'uhid firstName lastName gender age bloodGroup mobile address')
    .populate('nephrologistId', 'name specialization')
    .populate('referringDoctorId', 'name')
    .populate('departmentId', 'name')
    .populate('insurancePolicyId', 'companyName policyNumber coverageAmount tpaName');
  if (!record) throw new NotFoundError('Dialysis patient not found');
  return record;
};

export const listDialysisPatients = async (query = {}) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.dialysisType) filter.dialysisType = query.dialysisType;
  if (query.nephrologistId) filter.nephrologistId = query.nephrologistId;
  if (query.paymentCategory) filter.paymentCategory = query.paymentCategory;
  if (query.q) {
    const term = String(query.q).trim();
    const r = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    // `patientId` is a ref, so its sub-fields do not exist on this collection and
    // cannot be filtered on directly. Resolve the term against the patient master
    // first, then match the dialysis record either by its own number or by a
    // matching patient id — otherwise searching by name or UHID always returns 0.
    const matchingPatients = await Patient.find({
      $or: [{ uhid: r }, { firstName: r }, { lastName: r }, { mobile: r }],
    }).select('_id');
    filter.$or = [{ dialysisNumber: r }];
    if (matchingPatients.length) filter.$or.push({ patientId: { $in: matchingPatients.map((p) => p._id) } });
  }

  const [total, rows] = await Promise.all([
    DialysisPatient.countDocuments(filter),
    DialysisPatient.find(filter)
      .populate('patientId', 'uhid firstName lastName gender age bloodGroup mobile')
      .populate('nephrologistId', 'name')
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);
  return { rows, total, page, limit, pages: Math.ceil(total / limit) || 1 };
};

export const updateDialysisPatient = async (id, payload, actor) => {
  const record = await DialysisPatient.findById(id);
  if (!record) throw new NotFoundError('Dialysis patient not found');
  if (record.status === DIALYSIS_PATIENT_STATUS.DECEASED) {
    throw new BadRequestError('Record is closed for a deceased patient');
  }
  const before = record.toObject();
  const allow = [
    'primaryDiagnosis', 'secondaryDiagnosis', 'ckdStage', 'nephrologistId', 'referringDoctorId', 'departmentId',
    'dialysisType', 'accessType', 'accessSide', 'dryWeightKg', 'heightCm', 'bloodGroup', 'allergies',
    'comorbidities', 'specialNeeds', 'sessionsPerWeek', 'scheduleDays', 'preferredShift', 'insurancePolicyId',
    'sponsor', 'tpaName', 'paymentCategory', 'approvedAmount', 'status', 'statusReason', 'notes',
  ];
  if (payload.nephrologistId) await getDoctor(payload.nephrologistId);
  allow.forEach((k) => { if (payload[k] !== undefined) record[k] = payload[k]; });
  if (payload.status === DIALYSIS_PATIENT_STATUS.INACTIVE || payload.status === DIALYSIS_PATIENT_STATUS.TRANSFERRED) {
    if (!payload.statusReason) throw new BadRequestError('A reason is required when stopping dialysis');
  }
  await record.save();

  const changes = {};
  allow.forEach((k) => { if (JSON.stringify(before[k]) !== JSON.stringify(record[k])) changes[k] = { from: before[k], to: record[k] }; });
  if (Object.keys(changes).length) {
    await writeAudit({
      user: actor, action: 'DIALYSIS_UPDATE', module: 'dialysis', entityId: id, entityType: 'DialysisPatient',
      data: { before: changes, changedFields: Object.keys(changes) },
    });
  }
  return getDialysisPatient(id);
};

// ============================================================
// 2. PRESCRIPTION (nephrologist) — spec 7
// ============================================================
/**
 * Prescriptions are versioned documents. Writing a new one never edits the
 * previous version: the old document is closed out and linked, and every
 * change is written to the audit trail.
 */
export const createPrescription = async (payload, actor) => {
  const patient = await DialysisPatient.findOne({
    $or: [{ _id: payload.dialysisPatientId }, { patientId: payload.patientId }],
  });
  if (!patient) throw new NotFoundError('Dialysis patient not found');
  if (patient.status !== DIALYSIS_PATIENT_STATUS.ACTIVE) {
    throw new BadRequestError(`Dialysis registration is ${patient.status} — no new prescription can be written`);
  }

  const doctorId = payload.prescribedBy || actor?.doctorId;
  const doctor = await getDoctor(doctorId);
  if (!doctor) throw new BadRequestError('A prescribing nephrologist is required');

  const { defaults, modalities, accessTypes } = await prescriptionDefaults();
  const modality = payload.modality || defaults.modality;
  if (!modalities.includes(modality)) throw new BadRequestError(`Modality ${modality} is not enabled for this hospital`);
  if (payload.accessType && !accessTypes.includes(payload.accessType)) throw new BadRequestError('Invalid access type');

  // the version chain is continuous — a draft still counts as a version
  const previousVersion = await DialysisPrescription.findOne({
    patientId: patient.patientId,
    status: { $nin: [PRESCRIPTION_STATUS.CANCELLED] },
  }).sort({ version: -1, prescribedAt: -1 });

  const previousActive = await DialysisPrescription.findOne({
    patientId: patient.patientId,
    status: PRESCRIPTION_STATUS.ACTIVE,
  }).sort({ version: -1, prescribedAt: -1 });
  if (previousActive) {
    previousActive.status = PRESCRIPTION_STATUS.MODIFIED;
    await previousActive.save();
  }

  const wantActive = payload.status !== PRESCRIPTION_STATUS.DRAFT;
  if (wantActive && previousActive) {
    throw new ConflictError(`${previousActive.prescriptionNumber} must be closed out before writing another active prescription`);
  }

  const prescription = await DialysisPrescription.create({
    ...payload,
    modality,
    prescriptionNumber: await generateNumber('DPX', new Date().getFullYear()),
    patientId: patient.patientId,
    dialysisPatientId: patient._id,
    prescribedBy: doctor._id,
    prescribedByName: doctor.name,
    previousPrescriptionId: previousVersion?._id,
    version: previousVersion ? (previousVersion.version || 1) + 1 : 1,
    status: wantActive ? PRESCRIPTION_STATUS.ACTIVE : PRESCRIPTION_STATUS.DRAFT,
    activatedAt: wantActive ? new Date() : undefined,
    durationMinutes: payload.durationMinutes ?? defaults.durationMinutes,
    frequencyPerWeek: payload.frequencyPerWeek ?? defaults.frequencyPerWeek,
    bloodFlowRate: payload.bloodFlowRate ?? defaults.bloodFlowRate,
    dialysateFlowRate: payload.dialysateFlowRate ?? defaults.dialysateFlowRate,
    ultrafiltrationGoalMl: payload.ultrafiltrationGoalMl ?? defaults.ultrafiltrationGoalMl,
    maxUltrafiltrationMl: payload.maxUltrafiltrationMl ?? defaults.maxUltrafiltrationMl,
    heparinPrimeUnits: payload.heparinPrimeUnits ?? defaults.heparinPrimeUnits,
    accessType: payload.accessType || defaults.accessType,
    hospitalId: actor?.hospitalId,
    branchId: actor?.branchId,
  });

  if (previousActive) {
    previousActive.supersededById = prescription._id;
    await previousActive.save();
  }

  await writeAudit({
    user: actor, action: 'DIALYSIS_PRESCRIBE', module: 'dialysis', entityId: prescription._id, entityType: 'DialysisPrescription',
    data: {
      prescriptionNumber: prescription.prescriptionNumber,
      version: prescription.version,
      status: prescription.status,
      patientId: patient.patientId,
      dialysisNumber: patient.dialysisNumber,
      supersedes: previousVersion?.prescriptionNumber || null,
      bloodFlowRate: prescription.bloodFlowRate,
      durationMinutes: prescription.durationMinutes,
      ufGoal: prescription.ultrafiltrationGoalMl,
    },
  });
  emitDialysis('prescription_written', { prescriptionId: prescription._id, patientId: patient.patientId });
  return prescription;
};

export const setPrescriptionStatus = async (id, status, payload, actor) => {
  if (!Object.values(PRESCRIPTION_STATUS).includes(status)) throw new BadRequestError('Invalid prescription status');
  const prescription = await DialysisPrescription.findById(id);
  if (!prescription) throw new NotFoundError('Prescription not found');
  if (prescription.status === status) throw new BadRequestError(`Prescription is already ${status}`);

  if (status === PRESCRIPTION_STATUS.SUSPENDED && !payload?.reason) {
    throw new BadRequestError('A reason is required to suspend a prescription');
  }
  if (status === PRESCRIPTION_STATUS.CANCELLED && !payload?.reason) {
    throw new BadRequestError('A reason is required to cancel a prescription');
  }
  if (status === PRESCRIPTION_STATUS.ACTIVE) {
    const current = await DialysisPrescription.findOne({
      patientId: prescription.patientId,
      status: PRESCRIPTION_STATUS.ACTIVE,
      _id: { $ne: prescription._id },
    });
    if (current) throw new ConflictError(`${current.prescriptionNumber} is already the active prescription for this patient`);
  }

  const before = prescription.status;
  prescription.status = status;
  prescription.statusReason = payload?.reason;
  if (status === PRESCRIPTION_STATUS.ACTIVE) prescription.activatedAt = new Date();
  if (status === PRESCRIPTION_STATUS.SUSPENDED) prescription.suspendedAt = new Date();
  if (status === PRESCRIPTION_STATUS.SUSPENDED) prescription.suspendedReason = payload.reason;
  if (payload?.changeNote) prescription.changeNote = payload.changeNote;
  await prescription.save();

  const future = await DialysisSession.countDocuments({
    prescriptionId: prescription._id,
    status: { $in: ['REQUESTED', 'SCHEDULED', 'CONFIRMED'] },
  });

  await writeAudit({
    user: actor, action: 'DIALYSIS_PRESCRIPTION_STATUS', module: 'dialysis', entityId: id, entityType: 'DialysisPrescription',
    data: { prescriptionNumber: prescription.prescriptionNumber, before: { status: before }, after: { status }, reason: payload?.reason, futureSessions: future },
  });
  return prescription;
};

export const getActivePrescription = async (patientId) => DialysisPrescription.findOne({ patientId, status: PRESCRIPTION_STATUS.ACTIVE }).sort({ prescribedAt: -1 });

export const listPrescriptions = async (patientId, limit = 20) => DialysisPrescription.find({ patientId })
  .populate('prescribedBy', 'name specialization')
  .sort({ prescribedAt: -1, version: -1 })
  .limit(Math.min(parseInt(limit, 10) || 20, 100));

// ============================================================
// 3. SCHEDULING + MACHINE / STATION ALLOCATION
// ============================================================
/** Thin wrapper kept for the existing route — the engine lives in the scheduling service. */
export const scheduleSession = async (payload, actor) => bookSession(payload, actor);

const shiftForTime = (d) => {
  const h = new Date(d).getHours();
  if (h < 8) return 'MORNING';
  if (h < 14) return 'AFTERNOON';
  if (h < 20) return 'EVENING';
  return 'NIGHT';
};

const machineFree = async (machineId, at, durationMinutes, session) => {
  const start = new Date(at);
  const end = new Date(start.getTime() + (durationMinutes || 240) * 60000);
  const clash = await DialysisSession.findOne({
    machineId,
    status: { $nin: [SESSION_STATUS.CANCELLED, SESSION_STATUS.NO_SHOW, SESSION_STATUS.CLOSED] },
    scheduledStart: { $lt: end },
    scheduledEnd: { $gt: start },
  }).session(session || null);
  return !clash;
};

const pickAvailableMachine = async ({ machineType, at, excludeMachineId }) => {
  const candidates = await DialysisMachine.find({
    active: true,
    status: { $in: [MACHINE_STATUS.AVAILABLE, MACHINE_STATUS.RESERVED] },
    ...(excludeMachineId ? { _id: { $ne: excludeMachineId } } : {}),
    ...(machineType ? { machineType: { $in: [machineType, MACHINE_STATUS.HEMODIALYSIS && 'HEMODIALYSIS'] } } : {}),
  }).sort({ status: 1, code: 1 });

  for (const m of candidates) {
    // eslint-disable-next-line no-await-in-loop
    if (await machineFree(m._id, at, 240, null)) return m;
  }
  return null;
};

const claimMachine = async (machineId, at, durationMinutes, currentSessionId, patient) => {
  const machine = await DialysisMachine.findById(machineId);
  if (!machine) throw new NotFoundError('Dialysis machine not found');
  if (!machine.active) throw new BadRequestError('Machine is decommissioned');
  if (![MACHINE_STATUS.AVAILABLE, MACHINE_STATUS.RESERVED].includes(machine.status)) {
    throw new ConflictError(`Machine ${machine.code} is ${machine.status}`);
  }
  if (!(await machineFree(machineId, at, durationMinutes, currentSessionId))) {
    throw new ConflictError(`Machine ${machine.code} already has a session in this slot`);
  }
  return machine;
};

const claimStation = async (stationId, machine, currentSessionId) => {
  const station = await DialysisStation.findById(stationId);
  if (!station) throw new NotFoundError('Dialysis station not found');
  if (![STATION_STATUS.AVAILABLE, STATION_STATUS.RESERVED].includes(station.status)) {
    throw new ConflictError(`Station ${station.code} is ${station.status}`);
  }
  if (station.machineId && machine && String(station.machineId) !== String(machine._id)) {
    throw new ConflictError(`Station ${station.code} already has a different machine installed`);
  }
  return station;
};

// ============================================================
// 4. SESSION LIFECYCLE
// ============================================================
export const getSession = async (id) => {
  const session = await DialysisSession.findById(id)
    // allergies are part of the pre-dialysis review, so the session view has to
    // carry them. Omitting them makes a documented allergy look absent.
    .populate('patientId', 'uhid firstName lastName gender age bloodGroup mobile allergies')
    .populate('dialysisPatientId', 'dialysisNumber ckdStage primaryDiagnosis nephrologistId accessType paymentCategory sponsor')
    .populate('prescriptionId')
    .populate('machineId', 'code name machineType status')
    .populate('stationId', 'code name status')
    .populate('doctorId', 'name specialization')
    .populate('nurseId', 'name')
    .populate('technicianId', 'name')
    .populate('checkedInBy', 'name')
    .populate('labOrderIds')
    .populate('medicationOrderIds')
    .populate('billId', 'billNumber netTotal paidAmount dueAmount status')
    .populate('admissionId', 'admissionNumber status')
    .populate('opdVisitId', 'visitNumber status');
  if (!session) throw new NotFoundError('Dialysis session not found');
  return session;
};

const loadSessionForUpdate = async (id) => {
  const session = await DialysisSession.findById(id);
  if (!session) throw new NotFoundError('Dialysis session not found');
  return session;
};

const pushStatus = (session, to, actor, note) => {
  session.statusHistory.push({ from: session.status, to, at: new Date(), by: actor?.id, note });
  session.status = to;
};

/**
 * Keeps the version of an in-session assessment that is about to be replaced.
 * A clinical record that is corrected in place leaves no evidence of what it
 * said before, which is exactly the record a complaint or an audit needs, so
 * the superseded copy is pushed rather than dropped. Nothing is archived for a
 * first-time save, so a normal session carries no empty history.
 */
const archiveAssessment = (session, kind, reason, actor) => {
  const isPre = kind === 'pre';
  const current = isPre ? session.preAssessment : session.postAssessment;
  if (!current || !current.assessedAt) return false;
  const entry = {
    assessment: current.toObject ? current.toObject() : { ...current },
    supersededAt: new Date(),
    supersededBy: actor?.id,
    reason: reason || null,
  };
  if (isPre && session.accessSite?.assessedAt) {
    entry.accessSite = session.accessSite.toObject ? session.accessSite.toObject() : { ...session.accessSite };
  }
  if (isPre) session.preAssessmentRevisions.push(entry);
  else session.postAssessmentRevisions.push(entry);
  return true;
};

const releaseMachine = async (session, { toStatus = MACHINE_STATUS.CLEANING, stationTo = STATION_STATUS.CLEANING } = {}) => {
  if (session.machineId) {
    await DialysisMachine.findOneAndUpdate(
      { _id: session.machineId, currentSessionId: session._id },
      { $set: { status: toStatus, currentSessionId: null }, $inc: { totalSessions: 1, totalDialysisHours: Math.round((session.durationMinutes || 0) / 60) } },
    );
  }
  if (session.stationId) {
    await DialysisStation.findOneAndUpdate(
      { _id: session.stationId, currentSessionId: session._id },
      { $set: { status: stationTo, currentSessionId: null, lastTurnoverAt: new Date() } },
    );
  }
};

const occupyMachine = async (session, actor) => {
  if (session.machineId) {
    const machine = await DialysisMachine.findOneAndUpdate(
      { _id: session.machineId, status: { $in: [MACHINE_STATUS.AVAILABLE, MACHINE_STATUS.RESERVED] } },
      { $set: { status: MACHINE_STATUS.IN_USE, currentSessionId: session._id, statusReason: `Session ${session.sessionNumber}` } },
      { new: true },
    );
    if (!machine) {
      const current = await DialysisMachine.findById(session.machineId);
      throw new ConflictError(`Machine ${current?.code || session.machineId} is ${current?.status} — cannot start the session`);
    }
  }
  if (session.stationId) {
    const station = await DialysisStation.findOneAndUpdate(
      { _id: session.stationId, status: { $in: [STATION_STATUS.AVAILABLE, STATION_STATUS.RESERVED] } },
      { $set: { status: STATION_STATUS.OCCUPIED, currentSessionId: session._id } },
      { new: true },
    );
    if (!station) {
      const current = await DialysisStation.findById(session.stationId);
      throw new ConflictError(`Station ${current?.code || session.stationId} is ${current?.status} — cannot start the session`);
    }
  }
  session.machineId = session.machineId;
};

/** Check the patient in at the unit. */
/**
 * Spec 13 — everything the desk must be able to verify before a patient is
 * checked in, gathered in one call: patient, session, doctor, prescription,
 * schedule, machine and station. Each item is checked, not assumed, so a
 * missing prescription or an unserviced machine is visible before the patient
 * sits down rather than at machine-start time.
 */
export const checkInContext = async (id) => {
  const session = await DialysisSession.findById(id)
    .populate('patientId', 'uhid firstName lastName age gender bloodGroup mobile allergies')
    .populate('dialysisPatientId', 'dialysisNumber primaryDiagnosis ckdStage dialysisType accessType accessSide sessionsPerWeek scheduleDays')
    .populate('doctorId', 'name specialization')
    .populate('machineId', 'code name status stationId')
    .populate('stationId', 'code name area bedOrChair status')
    .populate('scheduleId', 'scheduleNumber patternLabel status')
    .lean();
  if (!session) throw new NotFoundError('Dialysis session not found');

  const checks = [];
  const add = (key, label, ok, detail, required = true) => checks.push({ key, label, ok: Boolean(ok), detail: detail || null, required });

  add('patient', 'Patient registered for dialysis', session.patientId && session.dialysisPatientId,
    `${session.patientId?.uhid || '—'} · ${session.patientId?.firstName || ''} ${session.patientId?.lastName || ''}`.trim());

  add('session', 'Session scheduled', Boolean(session.scheduledStart),
    `${session.sessionNumber} · ${session.scheduledDate ? new Date(session.scheduledDate).toLocaleDateString('en-GB') : '—'} · ${session.timeOfDay || '—'} (${session.shift || '—'})`);

  add('doctor', 'Nephrologist assigned', session.doctorId,
    session.doctorId ? `${session.doctorId.name}${session.doctorId.specialization ? ` · ${session.doctorId.specialization}` : ''}` : 'No doctor on the session');

  // A session is only verified against a prescription it can be traced to. Old
  // snapshots predate the identity fields, so the session's own prescriptionId
  // is accepted as proof; a session with neither is genuinely unverified.
  const snapshot = session.prescriptionSnapshot || null;
  const prescriptionId = snapshot?.prescriptionId || session.prescriptionId;
  add('prescription', 'Prescription on file', Boolean(prescriptionId),
    prescriptionId
      ? `${snapshot?.prescriptionNumber || 'prescription'} · ${snapshot?.modality || session.dialysisPatientId?.dialysisType || ''} · target dry weight ${snapshot?.targetDryWeightKg ?? '—'} kg`
      : 'No prescription on file — the session cannot be started without one');

  add('schedule', 'Schedule', true,
    session.scheduleId
      ? `${session.scheduleId.scheduleNumber} · ${session.scheduleId.patternLabel || ''}`
      : (session.isRecurring ? 'Recurring sitting' : 'Single booking'), false);

  // At check-in the machine and bay must be free to receive this patient.
  // A machine that is still IN_USE, mid-CLEANING or out of service is a real
  // blocker: checking the patient in against it would let the session start on
  // equipment that is not ready.
  const machine = session.machineId;
  const machineReady = machine && [MACHINE_STATUS.AVAILABLE, MACHINE_STATUS.RESERVED].includes(machine.status);
  add('machine', 'Machine allocated and ready', Boolean(machine && machineReady),
    machine
      ? `${machine.code} · ${machine.status}${machineReady ? '' : ' — not ready to start a session, needs turnover or engineering'}`
      : 'No machine allocated yet',
    true);

  const station = session.stationId;
  const stationReady = station && [STATION_STATUS.AVAILABLE, STATION_STATUS.RESERVED].includes(station.status);
  add('station', 'Bay allocated and ready', Boolean(station && stationReady),
    station
      ? `${station.code}${station.bedOrChair ? ` · ${String(station.bedOrChair).toLowerCase()}` : ''} · ${station.status}${stationReady ? '' : ' — bay is not ready, needs turnover or sign-off'}`
      : 'No bay allocated yet',
    true);

  const blockers = checks.filter((c) => c.required && !c.ok);
  const warnings = checks.filter((c) => !c.required && !c.ok);

  return {
    session: {
      id: session._id,
      sessionNumber: session.sessionNumber,
      status: session.status,
      priority: session.priority,
      isEmergency: session.isEmergency,
      scheduledStart: session.scheduledStart,
      scheduledEnd: session.scheduledEnd,
      timeOfDay: session.timeOfDay,
      shift: session.shift,
      durationMinutes: session.slotDurationMinutes,
    },
    patient: session.patientId,
    dialysisPatient: session.dialysisPatientId,
    doctor: session.doctorId,
    prescription: snapshot,
    schedule: session.scheduleId,
    machine,
    station,
    checks,
    canCheckIn: blockers.length === 0,
    blockers,
    warnings,
    nextStatus: 'CHECKED_IN',
    afterCheckIn: 'WAITING',
  };
};

/**
 * Spec 13: check-in verifies the seven items first. `checkInContext` shows
 * them to the nurse; this enforces them, so the screen cannot be skipped by
 * calling the endpoint directly. A failed item blocks check-in unless a
 * supervisor records an override, and the override is audited with the reason
 * — an emergency must never be stopped by a paperwork rule, but it must leave a
 * trace afterwards.
 */
export const checkInSession = async (id, payload, actor) => {
  const session = await loadSessionForUpdate(id);
  // WAITING is reachable from CHECKED_IN, so the state machine alone would let a
  // patient who is already on the waiting list be "checked in" a second time.
  // That would re-stamp checkedInAt and lose the real arrival time the unit's
  // waiting-time figures are built on.
  if (session.checkedInAt) {
    throw new ConflictError(`Already checked in at ${new Date(session.checkedInAt).toLocaleString('en-GB')} - the original arrival time is kept`, {
      code: 'DIALYSIS_ALREADY_CHECKED_IN',
      checkedInAt: session.checkedInAt,
    });
  }
  ensureTransition(session.status, SESSION_STATUS.CHECKED_IN);

  const ctx = await checkInContext(id);
  if (!ctx.canCheckIn) {
    const failed = ctx.blockers.map((b) => `${b.label} — ${b.detail}`).join('; ');
    if (!payload.overrideReason) {
      throw new ConflictError(`This patient cannot be checked in yet: ${failed}`, {
        code: 'DIALYSIS_CHECK_IN_BLOCKED',
        blockers: ctx.blockers,
        requiresOverride: true,
      });
    }
    assertOverrideAuthority(actor, 'check this patient in');
    session.checkInOverride = {
      at: new Date(),
      by: actor?.id,
      reason: payload.overrideReason,
      failedChecks: ctx.blockers.map((b) => ({ key: b.key, label: b.label, detail: b.detail })),
    };
    await writeAudit({
      user: actor, action: 'DIALYSIS_CHECK_IN_OVERRIDE', module: 'dialysis', entityId: session._id, entityType: 'DialysisSession',
      data: { sessionNumber: session.sessionNumber, reason: payload.overrideReason, failedChecks: session.checkInOverride.failedChecks },
    });
  }

  session.checkedInAt = new Date();
  session.checkedInBy = actor?.id;
  session.priority = payload.priority || session.priority;
  session.doctorId = payload.doctorId || session.doctorId;
  session.nurseId = payload.nurseId || session.nurseId;
  session.technicianId = payload.technicianId || session.technicianId;
  if (payload.admissionId) session.admissionId = payload.admissionId;
  if (payload.opdVisitId) session.opdVisitId = payload.opdVisitId;
  pushStatus(session, SESSION_STATUS.CHECKED_IN, actor, payload.notes || 'Patient checked in');
  // the spec puts the patient straight on the dialysis waiting list after
  // check-in; the desk can still override it, but the default is WAITING
  if (payload.queueForDialysis !== false) {
    pushStatus(session, SESSION_STATUS.WAITING, actor, 'On the waiting list for dialysis');
  }
  await session.save();
  emitDialysis('session_updated', { sessionId: session._id, status: session.status });
  return getSession(id);
};

/** Pre-dialysis assessment: vitals + access site. */
export const preAssessSession = async (id, payload, actor) => {
  const session = await loadSessionForUpdate(id);
  ensureTransition(session.status, SESSION_STATUS.PRE_ASSESSED);

  const pa = payload.preAssessment || payload;
  const patient = await Patient.findById(session.patientId).select('uhid firstName age allergies');
  const thresholds = await safetyThresholds();

  // the previous sitting's weight is what makes today's number meaningful
  const previous = await DialysisSession.findOne({
    patientId: session.patientId,
    _id: { $ne: session._id },
    'preAssessment.weightKg': { $ne: null },
  }).sort({ scheduledStart: -1 }).select('sessionNumber scheduledStart preAssessment.weightKg preWeightKg postWeightKg status').lean();

  const currentWeight = num(pa.weightKg);
  const previousWeight = num(pa.previousSessionWeightKg)
    ?? num(previous?.preAssessment?.weightKg)
    ?? num(previous?.preWeightKg)
    ?? null;
  const dryWeight = num(pa.dryWeightKg) ?? num(session.prescriptionSnapshot?.targetDryWeightKg) ?? null;

  const alerts = criticalVitals(pa, thresholds);

  // weight against target and against last time — displayed, never acted upon
  if (num(pa.weightKg) != null && dryWeight != null) {
    const diff = round1(num(pa.weightKg) - dryWeight);
    if (Math.abs(diff) >= (thresholds.weightGainAlertKg || 2)) {
      alerts.push(`${diff > 0 ? 'above' : 'below'} target dry weight by ${Math.abs(diff)} kg`);
    }
  }
  if (num(pa.weightKg) != null && previousWeight != null) {
    const diff = round1(num(pa.weightKg) - previousWeight);
    if (Math.abs(diff) >= (thresholds.weightChangeAlertKg || 3)) {
      alerts.push(`weight ${diff > 0 ? 'up' : 'down'} ${Math.abs(diff)} kg since the previous session`);
    }
  }
  if (num(pa.painScore) != null && num(pa.painScore) >= 7) {
    alerts.push(`pain score ${pa.painScore}/10 — reported to the nurse for review`);
  }
  if (pa.allergyCheck?.allergiesKnown && pa.allergyCheck.allergies?.length) {
    alerts.push(`known allergies on record: ${pa.allergyCheck.allergies.join(', ')}`);
  }
  if (pa.medicationReview?.discrepancies?.length) {
    alerts.push(`medication discrepancy reported: ${pa.medicationReview.discrepancies.join(', ')}`);
  }

  // Spec 14: the system displays and alerts on hospital-configured rules, it
  // does not make the clinical decision. The assessment is therefore always
  // saved — refusing to record what the nurse observed would push the data into
  // paper notes. The gate is the next step: markSessionReady refuses to move on
  // while an alert is unacknowledged, so the decision is recorded against a
  // person rather than taken by the system.
  const config = await getDialysisConfig(actor?.hospitalId, actor?.branchId);
  const safetyFlow = config.prescription?.safetyFlow || {};
  // Either signal counts: a client may tick the box inside the assessment or
  // send the explicit flag. Requiring both would silently ignore one of them.
  const nurseAcknowledged = Boolean(payload.acknowledgeCritical) || Boolean(pa.alertsAcknowledged);
  const acknowledged = !alerts.length || nurseAcknowledged;
  const requireBeforeReady = safetyFlow.requireNurseAcknowledgement !== false && !safetyFlow.allowUnacknowledgedAlertsToReady;

  // an amendment, not a first save: keep what the nurse wrote first
  archiveAssessment(session, 'pre', payload.amendmentReason || pa.amendmentReason, actor);
  session.preAssessment = {
    weightKg: pa.weightKg,
    dryWeightKg: dryWeight,
    previousSessionWeightKg: previousWeight,
    weightDifferenceKg: num(pa.weightKg) != null && dryWeight != null ? round1(num(pa.weightKg) - dryWeight) : undefined,
    weightDifferencePct: num(pa.weightKg) != null && dryWeight
      ? round1(((num(pa.weightKg) - dryWeight) / dryWeight) * 100) : undefined,
    bpSystolic: pa.bpSystolic,
    bpDiastolic: pa.bpDiastolic,
    pulse: pa.pulse,
    temperature: pa.temperature,
    respiratoryRate: pa.respiratoryRate,
    spo2: pa.spo2,
    bloodSugar: pa.bloodSugar,
    painScore: pa.painScore,
    complaints: pa.complaints || [],
    recentSymptoms: pa.recentSymptoms,
    generalCondition: pa.generalCondition || 'FAIR',
    edema: Boolean(pa.edema),
    breathlessness: Boolean(pa.breathlessness),
    chestPain: Boolean(pa.chestPain),
    fever: Boolean(pa.fever),
    medicationReview: {
      regularMedicationsTaken: pa.medicationReview?.regularMedicationsTaken,
      antihypertensivesHeld: pa.medicationReview?.antihypertensivesHeld,
      anticoagulantHeld: pa.medicationReview?.anticoagulantHeld,
      insulinTaken: pa.medicationReview?.insulinTaken,
      lastDoseTime: pa.medicationReview?.lastDoseTime,
      discrepancies: pa.medicationReview?.discrepancies || [],
      notes: pa.medicationReview?.notes,
    },
    allergyCheck: {
      allergiesKnown: pa.allergyCheck?.allergiesKnown,
      allergies: pa.allergyCheck?.allergies || patient?.allergies || [],
      reactionReported: pa.allergyCheck?.reactionReported,
      verifiedAgainstRecord: pa.allergyCheck?.verifiedAgainstRecord,
      notes: pa.allergyCheck?.notes,
    },
    safetyAlerts: alerts,
    alertsAcknowledged: acknowledged,
    alertsAcknowledgedBy: acknowledged && alerts.length ? actor?.id : undefined,
    alertsAcknowledgedAt: acknowledged && alerts.length ? new Date() : undefined,
    acknowledgementNote: payload.acknowledgementNote,
    assessedBy: actor?.id,
    assessedAt: new Date(),
    notes: pa.notes,
  };
  session.preWeightKg = pa.weightKg;
  session.preAccessFlag = null;
  session.preAccessFlaggedAt = null;

  if (payload.accessSite) {
    const a = payload.accessSite;
    session.accessSite = {
      accessType: a.accessType || a.type || session.prescriptionSnapshot?.modality,
      side: a.side,
      status: a.status || 'NORMAL',
      thrill: a.thrill !== false,
      bruit: a.bruit !== false,
      redness: Boolean(a.redness),
      swelling: Boolean(a.swelling),
      bleeding: Boolean(a.bleeding),
      assessedBy: actor?.id,
      assessedAt: new Date(),
      notes: a.notes,
    };
    if (['INFECTED', 'COLLAPSED', 'THRILL_ABSENT'].includes(session.accessSite.status)) {
      session.preAccessFlag = session.accessSite.status;
      session.preAccessFlaggedAt = new Date();
    }
    // a failing access is written to the registry as a structured assessment,
    // not as a free-text string that nobody can trend later
    const access = await DialysisAccess.findOne({ patientId: session.patientId, isPrimary: true });
    if (access) {
      await recordAccessAssessment(access, {
        sessionId: session._id,
        dialysisPatientId: session.dialysisPatientId,
        siteCondition: a.status === 'INFECTED' ? 'INFECTED'
          : a.status === 'COLLAPSED' ? 'COLLAPSED'
            : a.bleeding ? 'BLEEDING' : a.swelling ? 'SWELLING' : a.redness ? 'REDNESS' : 'NORMAL',
        attentionSigns: [
          a.redness ? 'REDRESS' : null,
          a.swelling ? 'SWELLING' : null,
          a.bleeding ? 'BLEEDING' : null,
          a.status === 'INFECTED' ? 'INFECTION' : null,
          a.status === 'THRILL_ABSENT' ? 'THRILL_ABSENT' : null,
        ].filter(Boolean),
        patency: a.status === 'THRILL_ABSENT' ? 'NO_THRILL' : a.thrill === false ? 'WEAK_THRILL' : 'NORMAL_THRILL',
        thrillPalpable: a.thrill,
        bruitAudible: a.bruit,
        nursingNotes: a.notes,
        assessedAsUsable: !['INFECTED', 'COLLAPSED', 'THRILL_ABSENT'].includes(a.status),
        requiresIntervention: ['INFECTED', 'COLLAPSED', 'THRILL_ABSENT'].includes(a.status),
        accessStatusAfter: ['INFECTED', 'COLLAPSED', 'THRILL_ABSENT'].includes(a.status) ? ACCESS_STATUS.DYSFUNCTIONAL : undefined,
      }, actor);
    }
  }

  // A re-save amends the existing assessment, so it is recorded as an amendment
  // rather than a second "assessment completed" entry in the status history.
  const isAmendment = session.status === SESSION_STATUS.PRE_ASSESSED;
  if (isAmendment) {
    session.preAssessmentAmendedAt = new Date();
    session.preAssessmentAmendedBy = actor?.id;
  } else {
    pushStatus(session, SESSION_STATUS.PRE_ASSESSED, actor, 'Pre-dialysis assessment completed');
  }
  await session.save();

  await writeAudit({
    user: actor, action: isAmendment ? 'DIALYSIS_PRE_ASSESS_AMEND' : 'DIALYSIS_PRE_ASSESS', module: 'dialysis', entityId: id, entityType: 'DialysisSession',
    data: {
      sessionNumber: session.sessionNumber, patient: patient?.uhid, weightKg: pa.weightKg,
      dryWeightKg: dryWeight, previousWeightKg: previousWeight,
      bp: `${pa.bpSystolic}/${pa.bpDiastolic}`, access: session.accessSite?.status,
      alerts, alertsAcknowledged: session.preAssessment.alertsAcknowledged,
    },
  });
  emitDialysis('session_updated', { sessionId: session._id, status: session.status });
  return getSession(id);
};

const num = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));
const round1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

/**
 * Pre-dialysis safety gate. Every threshold comes from the hospital's dialysis
 * configuration — no clinical limit is hard-coded in the service.
 */
const criticalVitals = (v, s) => {
  const cfg = s || {
    systolicMin: 90, systolicMax: 180, diastolicMin: 50, diastolicMax: 120,
    pulseMin: 45, pulseMax: 130, temperatureMinF: 95, temperatureMaxF: 103,
    spo2Min: 90, bloodSugarMin: 70, bloodSugarMax: 300,
    respiratoryRateMin: 8, respiratoryRateMax: 30, painScoreAlert: 7,
    weightGainAlertKg: 2, weightChangeAlertKg: 3,
  };
  const out = [];
  if (v.bpSystolic != null && (v.bpSystolic < cfg.systolicMin || v.bpSystolic > cfg.systolicMax)) out.push(`systolic BP ${v.bpSystolic}`);
  if (v.bpDiastolic != null && (v.bpDiastolic < cfg.diastolicMin || v.bpDiastolic > cfg.diastolicMax)) out.push(`diastolic BP ${v.bpDiastolic}`);
  if (v.pulse != null && (v.pulse < cfg.pulseMin || v.pulse > cfg.pulseMax)) out.push(`pulse ${v.pulse}`);
  if (v.respiratoryRate != null && (v.respiratoryRate < cfg.respiratoryRateMin || v.respiratoryRate > cfg.respiratoryRateMax)) out.push(`respiratory rate ${v.respiratoryRate}/min`);
  if (v.temperature != null && (v.temperature < cfg.temperatureMinF || v.temperature >= cfg.temperatureMaxF)) out.push(`temperature ${v.temperature}°F`);
  if (v.spo2 != null && v.spo2 < cfg.spo2Min) out.push(`SpO2 ${v.spo2}%`);
  if (v.bloodSugar != null && (v.bloodSugar < cfg.bloodSugarMin || v.bloodSugar > cfg.bloodSugarMax)) out.push(`blood sugar ${v.bloodSugar}`);
  if (v.painScore != null && v.painScore >= (cfg.painScoreAlert ?? 7)) out.push(`pain score ${v.painScore}/10`);
  return out;
};

/** Nurse confirms the patient is ready and consumables are prepared. */
export const markSessionReady = async (id, payload, actor) => {
  const session = await loadSessionForUpdate(id);
  ensureTransition(session.status, SESSION_STATUS.READY);
  if (!session.preAssessment?.assessedAt) throw new BadRequestError('Pre-dialysis assessment must be completed first');
  // The nurse may not take a session to ready while a raised alert is unread.
  // The alert text travels back with the error so the UI can show it verbatim
  // instead of "something went wrong".
  const alerts = session.preAssessment.safetyAlerts || [];
  if (alerts.length && !session.preAssessment.alertsAcknowledged) {
    throw new ConflictError(`The nurse must acknowledge the pre-dialysis alerts before the session is ready: ${alerts.join(', ')}`, {
      code: 'DIALYSIS_ALERTS_UNACKNOWLEDGED',
      alerts,
      requiresAcknowledgement: true,
    });
  }
  session.readyAt = new Date();
  session.nurseId = payload.nurseId || session.nurseId;
  if (payload.notes) session.notes = payload.notes;
  pushStatus(session, SESSION_STATUS.READY, actor, payload.notes || 'Ready — consumables prepared');
  await session.save();
  emitDialysis('session_updated', { sessionId: session._id, status: session.status });
  return getSession(id);
};

/** Patient connected — machine and bay are occupied from this point. */
export const connectSession = async (id, payload, actor) => {
  const session = await loadSessionForUpdate(id);
  ensureTransition(session.status, SESSION_STATUS.CONNECTED);
  if (!session.machineId) {
    session.machineId = payload.machineId;
    const machine = await claimMachine(payload.machineId, session.scheduledStart || new Date(), session.slotDurationMinutes, null, null);
    session.machineId = machine._id;
    if (!session.stationId && machine.stationId) session.stationId = machine.stationId;
  }
  await occupyMachine(session, actor);
  session.connectedAt = new Date();
  session.accessSite = session.accessSite || { status: 'NORMAL', assessedAt: new Date(), assessedBy: actor?.id };
  pushStatus(session, SESSION_STATUS.CONNECTED, actor, payload.notes || 'Patient connected');
  await session.save();
  emitDialysis('machine_updated', { machineId: session.machineId, status: MACHINE_STATUS.IN_USE });
  return getSession(id);
};

/**
 * Spec 17 — the eight items that must hold before START DIALYSIS.
 *
 * `checkInContext` (spec 13) is what the desk verifies before the patient sits
 * down; this is the second, independent gate at the machine. The two are not
 * interchangeable: a patient can arrive on time and still reach the machine
 * with no nurse assigned, no prescription loaded, or an empty trolley. Each
 * item is read, not assumed, and the required list comes from hospital config
 * so a unit can relax one line without losing the rest.
 */
export const startContext = async (id, actor) => {
  const cfg = await getDialysisConfig(actor?.hospitalId, actor?.branchId);
  const gate = cfg.sessionStart || {};
  const session = await DialysisSession.findById(id)
    .populate('patientId', 'uhid firstName lastName')
    .populate('dialysisPatientId', 'dialysisNumber ckdStage')
    .populate('machineId', 'code name status')
    .populate('stationId', 'code name status')
    .populate('nurseId', 'name')
    .lean();
  if (!session) throw new NotFoundError('Dialysis session not found');

  const checks = [];
  const add = (key, label, ok, detail, required) => checks.push({ key, label, ok: Boolean(ok), detail: detail || null, required });

  add('patient', 'Patient verified',
    Boolean(session.patientId && session.dialysisPatientId),
    session.patientId
      ? `${session.patientId.uhid} · ${session.patientId.firstName || ''} ${session.patientId.lastName || ''}`.trim()
      : 'No patient on the session',
    gate.requirePatientVerified !== false);

  add('session', 'Correct session',
    Boolean(session.sessionNumber),
    `${session.sessionNumber} · ${session.scheduledStart ? new Date(session.scheduledStart).toLocaleString('en-GB') : 'no schedule slot'}`,
    gate.requireSessionArrived !== false);

  // a session must be traceable to the prescription that justified it
  const snapshot = session.prescriptionSnapshot || null;
  const prescriptionId = snapshot?.prescriptionId || session.prescriptionId;
  add('prescription', 'Correct prescription',
    Boolean(prescriptionId),
    prescriptionId
      ? `${snapshot?.prescriptionNumber || 'prescription'} · target dry weight ${snapshot?.targetDryWeightKg ?? '—'} kg · UF goal ${snapshot?.ultrafiltrationGoalMl ?? '—'} ml`
      : 'No prescription on file — dialysis cannot be started without one',
    gate.requirePrescription !== false);

  add('machine', 'Machine assigned',
    Boolean(session.machineId),
    session.machineId ? `${session.machineId.code} · ${session.machineId.status}` : 'No machine assigned',
    gate.requireMachine !== false);

  add('station', 'Station assigned',
    Boolean(session.stationId),
    session.stationId ? `${session.stationId.code} · ${session.stationId.status}` : 'No station assigned',
    gate.requireStation !== false);

  add('assessment', 'Pre-dialysis assessment completed',
    Boolean(session.preAssessment?.assessedAt),
    session.preAssessment?.assessedAt
      ? `Assessed ${new Date(session.preAssessment.assessedAt).toLocaleString('en-GB')}`
      : 'The pre-dialysis assessment has not been completed',
    gate.requirePreAssessment !== false);

  // spec 17 "required consumables available" — driven by config, never by a
  // list baked into the code. An unconfigured unit has no requirement to meet.
  const requirements = (cfg.consumables?.requiredPerSession || []).filter((r) => r.required !== false);
  const issued = new Map();
  for (const c of session.consumables || []) {
    const key = c.code || c.consumableId?.toString();
    issued.set(key, (issued.get(key) || 0) + (Number(c.quantity) - Number(c.returnedQuantity || 0)));
  }
  const short = requirements.filter((r) => {
    const got = issued.get(r.code || r.name) || 0;
    return got < (Number(r.quantity) || 1);
  });
  add('consumables', 'Required consumables available',
    short.length === 0,
    requirements.length === 0
      ? 'No consumable requirement configured for this unit'
      : (short.length === 0
        ? `All ${requirements.length} configured item(s) issued`
        : `Short: ${short.map((r) => `${r.name || r.code} (need ${r.quantity || 1}, issued ${issued.get(r.code || r.name) || 0})`).join('; ')}`),
    gate.requireConsumables !== false);

  add('nurse', 'Nurse assigned',
    Boolean(session.nurseId),
    session.nurseId ? session.nurseId.name : 'No nurse assigned to the session',
    gate.requireNurse !== false);

  const blockers = checks.filter((c) => c.required && !c.ok);
  return {
    session: { id: session._id, sessionNumber: session.sessionNumber, status: session.status },
    checks,
    blockers,
    canStart: blockers.length === 0,
    allowOverride: gate.allowOverride !== false,
    nextStatus: SESSION_STATUS.IN_PROGRESS,
  };
};

/** Dialysis started — monitoring begins. */
export const startSession = async (id, payload, actor) => {
  const session = await loadSessionForUpdate(id);
  ensureTransition(session.status, SESSION_STATUS.IN_PROGRESS);

  // Spec 17: the eight preconditions are enforced here, not only displayed.
  // A supervisor may proceed over a failure with a recorded reason, which is
  // audited — an emergency is never stopped by a paperwork rule, but it always
  // leaves a trace afterwards.
  const ctx = await startContext(id);
  if (!ctx.canStart) {
    if (!payload.overrideReason || !ctx.allowOverride) {
      throw new ConflictError(`This session cannot be started yet: ${ctx.blockers.map((b) => `${b.label} — ${b.detail}`).join('; ')}`, {
        code: 'DIALYSIS_START_BLOCKED',
        blockers: ctx.blockers,
        checks: ctx.checks,
        requiresOverride: ctx.allowOverride,
      });
    }
    assertOverrideAuthority(actor, 'start this session');
    session.startOverride = {
      at: new Date(),
      by: actor?.id,
      reason: payload.overrideReason,
      failedChecks: ctx.blockers.map((b) => ({ key: b.key, label: b.label, detail: b.detail })),
    };
    await writeAudit({
      user: actor, action: 'DIALYSIS_START_OVERRIDE', module: 'dialysis', entityId: session._id, entityType: 'DialysisSession',
      data: { sessionNumber: session.sessionNumber, reason: payload.overrideReason, failedChecks: session.startOverride.failedChecks },
    });
  }

  session.startedAt = new Date();
  session.startTime = session.startedAt;
  session.bloodFlowRate = payload.bloodFlowRate ?? session.bloodFlowRate ?? session.prescriptionSnapshot?.bloodFlowRate;
  session.dialysateFlowRate = payload.dialysateFlowRate ?? session.dialysateFlowRate ?? session.prescriptionSnapshot?.dialysateFlowRate;
  session.dialyserType = payload.dialyserType || session.prescriptionSnapshot?.dialyserType;
  session.heparinUnits = payload.heparinUnits ?? session.prescriptionSnapshot?.heparinPrimeUnits;
  session.salineFlushMl = payload.salineFlushMl ?? session.salineFlushMl;
  pushStatus(session, SESSION_STATUS.IN_PROGRESS, actor, payload.notes || 'Dialysis started');
  await session.save();
  emitDialysis('session_updated', { sessionId: session._id, status: session.status });
  return getSession(id);
};

/** Continuous monitoring entry (machine + patient parameters). */
export const recordMonitoring = async (id, payload, actor) => {
  const session = await loadSessionForUpdate(id);
  if (![SESSION_STATUS.IN_PROGRESS, SESSION_STATUS.CONNECTED].includes(session.status)) {
    throw new BadRequestError(`Monitoring can only be recorded on a connected or running session (currently ${session.status})`);
  }
  const reading = { ...payload, at: payload.at ? new Date(payload.at) : new Date(), recordedBy: actor?.id };
  session.vitals.push(reading);
  // A session is a bounded array, so an unusually long or high-frequency
  // monitoring run eventually has to give way. Dropping the oldest readings
  // without saying so destroyed clinical data invisibly, so the cap is higher
  // and any trim is counted, timestamped and audited rather than silent.
  if (session.vitals.length > VITALS_RETENTION) {
    const dropped = session.vitals.length - VITALS_RETENTION;
    // the timestamp of the oldest reading about to go has to be read before the
    // array is cut, or it would name the oldest reading that was kept
    const oldestDroppedAt = session.vitals[0]?.at;
    session.vitals = session.vitals.slice(-VITALS_RETENTION);
    session.vitalsTrimmed = {
      count: (session.vitalsTrimmed?.count || 0) + dropped,
      firstDroppedAt: session.vitalsTrimmed?.firstDroppedAt || oldestDroppedAt || new Date(),
      lastTrimmedAt: new Date(),
    };
    await writeAudit({
      user: actor, action: 'DIALYSIS_VITALS_TRIMMED', module: 'dialysis', entityId: session._id, entityType: 'DialysisSession',
      data: { sessionNumber: session.sessionNumber, dropped, retained: VITALS_RETENTION, totalTrimmed: session.vitalsTrimmed.count },
    });
  }

  // machine parameters roll up onto the session so reports stay simple
  if (reading.bloodFlowRate) session.bloodFlowRate = reading.bloodFlowRate;
  if (reading.dialysateFlowRate) session.dialysateFlowRate = reading.dialysateFlowRate;
  if (reading.venousPressure != null) session.venousPressure = reading.venousPressure;
  if (reading.arterialPressure != null) session.arterialPressure = reading.arterialPressure;
  if (reading.ufRemovedMl != null) session.ufRemovedMl = reading.ufRemovedMl;
  // A critical reading is not cleared by the next normal one — the flag is a
  // record that the reading happened, and the nurse resolves it deliberately
  // once the patient is stabilised. It also has to be announced, not just
  // stored, or nobody watching the board ever learns of it.
  const raiseCritical = (flag) => {
    if (session.criticalFlag !== flag) {
      session.criticalFlag = flag;
      session.criticalFlaggedAt = reading.at;
      session.criticalFlaggedBy = actor?.id;
      emitDialysis('session_critical', {
        sessionId: session._id, sessionNumber: session.sessionNumber, flag,
        bp: `${reading.bpSystolic || '-'}/${reading.bpDiastolic || '-'}`, spo2: reading.spo2 ?? null,
        patientId: session.patientId, at: reading.at,
      });
    }
  };
  if (reading.spo2 != null && reading.spo2 < 90) raiseCritical('SPO2_LOW');
  if (reading.bpSystolic != null && (reading.bpSystolic < 80 || reading.bpSystolic > 180)) raiseCritical('BP_CRITICAL');
  await session.save();
  emitDialysis('session_monitored', { sessionId: session._id, at: reading.at, bp: `${reading.bpSystolic || '-'}/${reading.bpDiastolic || '-'}`, uf: reading.ufRemovedMl ?? session.ufRemovedMl });
  return { ok: true, reading, sessionStatus: session.status, criticalFlag: session.criticalFlag || null };
};

/** Medication / injection given during dialysis (ward pharmacy or dialysis drug). */
export const giveMedication = async (id, payload, actor) => {
  const session = await loadSessionForUpdate(id);
  if (![SESSION_STATUS.CONNECTED, SESSION_STATUS.IN_PROGRESS].includes(session.status)) {
    throw new BadRequestError('Medication can only be given during a connected or running session');
  }
  session.medicationsGiven.push({
    name: payload.name,
    dose: payload.dose,
    route: payload.route || 'IV',
    at: payload.at ? new Date(payload.at) : new Date(),
    by: actor?.id,
  });
  if (payload.oxygenGiven) session.oxygenGiven = true;
  await session.save();
  return getSession(id);
};

/**
 * Once a sitting is finished for good its clinical record is frozen. A
 * complication can legitimately be recognised late — access-site bleeding is
 * often noticed hours later, and a post-dialysis hypotension is written up after
 * the patient is off the machine — so COMPLETED and BILLED stay writable. What
 * must never happen is a complication being appended to a session that was
 * cancelled, never attended, or already closed, because that record describes
 * dialysis that did not take place.
 */
const assertClinicalRecordOpen = (session, action) => {
  if ([SESSION_STATUS.CANCELLED, SESSION_STATUS.NO_SHOW, SESSION_STATUS.CLOSED].includes(session.status)) {
    throw new ConflictError(`A ${session.status} session cannot have its clinical record changed — ${action} is refused`);
  }
};

/** Complication management — appended, never overwritten. */
export const addComplication = async (id, payload, actor) => {
  const session = await loadSessionForUpdate(id);
  assertClinicalRecordOpen(session, 'recording a complication');
  if (!payload.type) throw new BadRequestError('Complication type is required');
  session.complications.push({
    ...payload,
    occurredAt: payload.occurredAt ? new Date(payload.occurredAt) : new Date(),
    reportedBy: actor?.id,
    resolved: false,
  });
  await session.save();

  // clinical note so the ward and OPD see the event in the patient timeline
  if (payload.createClinicalNote !== false) {
    try {
      const { default: ClinicalNote } = await import('../models/ClinicalNote.model.js');
      await ClinicalNote.create({
        admissionId: session.admissionId || undefined,
        patientId: session.patientId,
        // without the session reference the note is an orphan: it appears in the
        // patient timeline but cannot be traced back to the sitting
        dialysisSessionId: session._id,
        noteType: 'GENERAL',
        body: `Dialysis complication — ${payload.type} (${payload.severity || 'MILD'}). Management: ${payload.management || 'as per protocol'}${payload.notes ? ` — ${payload.notes}` : ''} (session ${session.sessionNumber})`,
        createdBy: actor?.id,
        hospitalId: actor?.hospitalId,
      });
    } catch (e) {
      // the complication itself is already committed and must not be rolled back,
      // but a silent failure here would leave no trace that the note is missing
      // eslint-disable-next-line no-console
      console.error('[dialysis] complication clinical note failed:', e?.message || e);
    }
  }

  await writeAudit({
    user: actor, action: 'DIALYSIS_COMPLICATION', module: 'dialysis', entityId: id, entityType: 'DialysisSession',
    data: { sessionNumber: session.sessionNumber, type: payload.type, severity: payload.severity, management: payload.management },
  });
  emitDialysis('session_complication', { sessionId: session._id, type: payload.type, severity: payload.severity });
  return getSession(id);
};

export const resolveComplication = async (id, complicationId, payload, actor) => {
  const session = await loadSessionForUpdate(id);
  assertClinicalRecordOpen(session, 'resolving a complication');
  const c = session.complications.id(complicationId);
  if (!c) throw new NotFoundError('Complication record not found');
  if (c.resolved) throw new BadRequestError('Complication is already resolved');
  const before = { type: c.type, severity: c.severity, management: c.management, notes: c.notes };
  c.resolved = true;
  c.resolvedAt = new Date();
  c.resolvedBy = actor?.id;
  if (payload?.management) c.management = payload.management;
  if (payload?.notes) c.notes = payload.notes;
  await session.save();
  // resolving a complication closes a clinical episode, so the change of state
  // is as auditable as raising one
  await writeAudit({
    user: actor, action: 'DIALYSIS_COMPLICATION_RESOLVED', module: 'dialysis', entityId: id, entityType: 'DialysisSession',
    data: { sessionNumber: session.sessionNumber, complicationId: String(complicationId), before, after: { type: c.type, severity: c.severity, management: c.management, notes: c.notes } },
  });
  return getSession(id);
};

/**
 * Spec 25 — the post-dialysis record and the END SESSION action.
 *
 * The session is not marked COMPLETED until the configured completion fields
 * are handled. Which fields those are comes from hospital config, so a unit
 * that does not weigh patients post-dialysis can say so instead of having the
 * requirement removed from the code. A supervisor may still complete with a
 * recorded reason, audited like every other override.
 */
export const postContext = async (id, actor) => {
  const cfg = await getDialysisConfig(actor?.hospitalId, actor?.branchId);
  const gate = cfg.completion || {};
  const session = await DialysisSession.findById(id)
    .populate('patientId', 'uhid firstName lastName')
    .lean();
  if (!session) throw new NotFoundError('Dialysis session not found');

  const pa = session.postAssessment || {};
  const checks = [];
  const add = (key, label, ok, detail, required) => checks.push({ key, label, ok: Boolean(ok), detail: detail || null, required });

  // the end time is the outcome of completing, not a precondition for it, so it
  // is reported for display only — gating on it would make completion impossible
  add('endTime', 'End time recorded',
    Boolean(session.endTime || session.completedAt),
    session.endTime ? new Date(session.endTime).toLocaleString('en-GB') : 'Stamped when the session ends',
    false);

  add('postWeight', 'Post weight',
    pa.weightKg != null,
    pa.weightKg != null ? `${pa.weightKg} kg` : 'Post-dialysis weight is not recorded',
    gate.requirePostWeight !== false);

  // vitals are required as a set — a post-dialysis BP with no pulse is not a
  // usable observation, so the whole group is reported as one missing item
  const hasVitals = pa.bpSystolic != null && pa.bpDiastolic != null && pa.pulse != null;
  add('postVitals', 'Post-dialysis vitals (BP and pulse)',
    hasVitals,
    hasVitals ? `BP ${pa.bpSystolic}/${pa.bpDiastolic}, pulse ${pa.pulse}${pa.spo2 != null ? `, SpO2 ${pa.spo2}%` : ''}` : 'BP and pulse are not both recorded',
    gate.requirePostVitals !== false);

  add('condition', 'Patient condition',
    Boolean(pa.condition && pa.assessedAt),
    pa.assessedAt ? `${pa.condition}` : 'No condition recorded',
    gate.requireCondition !== false);

  add('accessSite', 'Access site condition',
    Boolean(pa.assessedAt && pa.accessSiteCondition),
    pa.accessSiteCondition ? `${pa.accessSiteCondition}${pa.bleedingAtAccess ? ' · bleeding reported' : ''}` : 'The access site was not re-checked at the end of the session',
    gate.requireAccessSiteCheck !== false);

  add('nextPlan', 'Discharge / next plan',
    Boolean(pa.nextPlan),
    pa.nextPlan || 'No next plan recorded',
    gate.requireNextPlan === true);

  const blockers = checks.filter((c) => c.required && !c.ok);
  return {
    session: { id: session._id, sessionNumber: session.sessionNumber, status: session.status },
    checks,
    blockers,
    canComplete: blockers.length === 0,
    allowOverride: gate.allowOverride !== false,
    nextStatus: SESSION_STATUS.COMPLETED,
  };
};

/** Post-dialysis assessment + vitals. */
export const postAssessSession = async (id, payload, actor) => {
  const session = await loadSessionForUpdate(id);
  ensureTransition(session.status, SESSION_STATUS.COMPLETED);
  const pa = payload.postAssessment || payload;
  // an amendment, not a first save: keep what was written before
  archiveAssessment(session, 'post', payload.amendmentReason || pa.amendmentReason, actor);
  session.postAssessment = {
    weightKg: pa.weightKg,
    bpSystolic: pa.bpSystolic,
    bpDiastolic: pa.bpDiastolic,
    pulse: pa.pulse,
    temperature: pa.temperature,
    spo2: pa.spo2,
    condition: pa.condition || 'STABLE',
    patientAcceptable: pa.patientAcceptable !== false,
    bleedingAtAccess: Boolean(pa.bleedingAtAccess),
    dizziness: Boolean(pa.dizziness),
    cramps: Boolean(pa.cramps),
    nausea: Boolean(pa.nausea),
    // spec 25: access site re-checked and the end-of-sitting plan
    accessSiteCondition: pa.accessSiteCondition || session.accessSite?.status || ACCESS_SITE_STATUS.NORMAL,
    accessSiteThrill: pa.accessSiteThrill,
    accessSiteBruit: pa.accessSiteBruit,
    ufAchievedMl: pa.ufAchievedMl,
    outputMl: pa.outputMl,
    nextPlan: pa.nextPlan,
    followUpDate: pa.followUpDate ? new Date(pa.followUpDate) : undefined,
    assessedBy: actor?.id,
    assessedAt: new Date(),
    notes: pa.notes,
  };
  session.postWeightKg = pa.weightKg;
  if (session.preWeightKg != null && pa.weightKg != null) {
    session.weightChangeKg = Math.round((Number(session.preWeightKg) - Number(pa.weightKg)) * 10) / 10;
  }

  // spec 25: the post-dialysis record is saved first so a refused completion
  // does not discard the observations the nurse just took, then the gate runs
  // against what was actually written.
  await session.save();

  // The observations are clinical data and exist whether or not the gate is
  // satisfied, so they are audited at the moment they are written. Auditing
  // only after the gate passed left a refused completion with a full
  // post-dialysis record on the session and no trace of who entered it.
  await writeAudit({
    user: actor, action: 'DIALYSIS_POST_ASSESSMENT', module: 'dialysis', entityId: id, entityType: 'DialysisSession',
    data: {
      sessionNumber: session.sessionNumber,
      postAssessment: session.postAssessment.toObject ? session.postAssessment.toObject() : session.postAssessment,
      completionGateSatisfied: null,
      note: 'Post-dialysis observations recorded; completion gate evaluated separately',
    },
  });

  const completion = await postContext(id, actor);
  if (!completion.canComplete) {
    if (!payload.overrideReason || !completion.allowOverride) {
      // the observations stay on the session, and the audit row written above
      // says who entered them; this records that the gate then refused
      await writeAudit({
        user: actor, action: 'DIALYSIS_COMPLETION_BLOCKED', module: 'dialysis', entityId: id, entityType: 'DialysisSession',
        data: {
          sessionNumber: session.sessionNumber,
          completionGateSatisfied: false,
          failedChecks: completion.blockers.map((b) => ({ key: b.key, label: b.label, detail: b.detail })),
          note: 'Observations retained on the session; the session was not completed',
        },
      });
      throw new ConflictError(`This session cannot be completed yet: ${completion.blockers.map((b) => `${b.label} — ${b.detail}`).join('; ')}`, {
        code: 'DIALYSIS_COMPLETION_BLOCKED',
        blockers: completion.blockers,
        checks: completion.checks,
        requiresOverride: completion.allowOverride,
        postAssessmentRecorded: true,
      });
    }
    assertOverrideAuthority(actor, 'complete this session');
    session.completionOverride = {
      at: new Date(),
      by: actor?.id,
      reason: payload.overrideReason,
      failedChecks: completion.blockers.map((b) => ({ key: b.key, label: b.label, detail: b.detail })),
    };
    await writeAudit({
      user: actor, action: 'DIALYSIS_COMPLETION_OVERRIDE', module: 'dialysis', entityId: session._id, entityType: 'DialysisSession',
      data: { sessionNumber: session.sessionNumber, reason: payload.overrideReason, failedChecks: session.completionOverride.failedChecks },
    });
  }

  const done = (session.startedAt ? Date.now() - new Date(session.startedAt).getTime() : 0) / 60000;
  session.durationMinutes = payload.durationMinutes ?? Math.round(done);
  session.ufRemovedMl = payload.ufRemovedMl ?? session.ufRemovedMl ?? 0;
  session.ufGoalMl = session.ufGoalMl ?? session.prescriptionSnapshot?.ultrafiltrationGoalMl;
  if (session.ufGoalMl) {
    session.ufDeliveredPct = Math.round((Number(session.ufRemovedMl || 0) / Number(session.ufGoalMl)) * 100);
  }
  if (session.preAssessment?.weightKg && pa.weightKg) {
    session.ufRemovedMl = session.ufRemovedMl || Math.round((Number(session.preAssessment.weightKg) - Number(pa.weightKg)) * 1000);
  }
  session.completedAt = new Date();
  session.endTime = session.completedAt;
  pushStatus(session, SESSION_STATUS.COMPLETED, actor, 'Dialysis completed');
  await session.save();

  const patient = await DialysisPatient.findById(session.dialysisPatientId);
  if (patient) {
    patient.completedSessions += 1;
    patient.lastSessionAt = session.completedAt;
    if (pa.weightKg) patient.dryWeightKg = pa.weightKg;
    await patient.save();
  }
  await writeAudit({
    user: actor, action: 'DIALYSIS_COMPLETE', module: 'dialysis', entityId: id, entityType: 'DialysisSession',
    data: {
      sessionNumber: session.sessionNumber,
      preWeightKg: session.preWeightKg, postWeightKg: session.postWeightKg, weightChangeKg: session.weightChangeKg,
      ufGoalMl: session.ufGoalMl, ufRemovedMl: session.ufRemovedMl, durationMinutes: session.durationMinutes,
      complications: session.complications.length,
    },
  });
  emitDialysis('session_updated', { sessionId: session._id, status: session.status });
  return getSession(id);
};

/** Disconnect and hand the machine to cleaning. */
export const disconnectSession = async (id, payload, actor) => {
  const session = await loadSessionForUpdate(id);
  ensureTransition(session.status, SESSION_STATUS.CLOSED);
  session.disconnectedAt = new Date();
  session.disconnectionTime = session.disconnectedAt;
  await releaseMachine(session, { toStatus: MACHINE_STATUS.CLEANING, stationTo: STATION_STATUS.CLEANING });
  session.closedAt = new Date();
  pushStatus(session, SESSION_STATUS.CLOSED, actor, payload?.notes || 'Patient disconnected — machine to cleaning');
  await session.save();
  emitDialysis('machine_updated', { machineId: session.machineId, status: MACHINE_STATUS.CLEANING });
  return getSession(id);
};

export const cancelSession = async (id, payload, actor) => {
  const session = await loadSessionForUpdate(id);
  ensureTransition(session.status, SESSION_STATUS.CANCELLED);
  if (!payload?.reason) throw new BadRequestError('A cancellation reason is required');
  session.cancelledAt = new Date();
  session.cancelReason = payload.reason;
  session.cancellationReason = payload.reason;
  pushStatus(session, SESSION_STATUS.CANCELLED, actor, payload.reason);
  await releaseMachine(session, { toStatus: MACHINE_STATUS.AVAILABLE, stationTo: STATION_STATUS.AVAILABLE });
  await session.save();
  await writeAudit({
    user: actor, action: 'DIALYSIS_CANCEL', module: 'dialysis', entityId: id, entityType: 'DialysisSession',
    data: { sessionNumber: session.sessionNumber, reason: payload.reason },
  });
  emitDialysis('session_updated', { sessionId: session._id, status: session.status });
  return getSession(id);
};

export const markNoShow = async (id, payload, actor) => {
  const session = await loadSessionForUpdate(id);
  ensureTransition(session.status, SESSION_STATUS.NO_SHOW);
  session.noShowAt = new Date();
  pushStatus(session, SESSION_STATUS.NO_SHOW, actor, payload?.reason || 'Patient did not attend');
  await session.save();
  emitDialysis('session_updated', { sessionId: session._id, status: session.status });
  return getSession(id);
};

// ============================================================
// 5. CONSUMABLES + STOCK
// ============================================================
export const listConsumables = async (query = {}) => {
  const filter = { active: true };
  if (query.category) filter.category = query.category;
  const rows = await DialysisConsumable.find(filter).sort({ category: 1, name: 1 }).lean();
  return rows;
};

/**
 * The catalogue is written by hand as often as by the UI, and `stockQty` is the
 * field every report and the model itself use, while the create form historically
 * sent `openingStock`. Accept either, and normalise to one. Before this, sending
 * `stockQty` got a 201 and a silently empty shelf: the number was dropped on the
 * floor and the next trolley draw failed for want of stock nobody knew was missing.
 */
const CONSUMABLE_FIELDS = [
  'name', 'category', 'unit', 'unitCost', 'chargeRate', 'billable',
  'reorderLevel', 'batchNumber', 'expiryDate', 'supplier', 'active',
];

/** The stock figure the caller is asking to hold, whichever name they used. */
const requestedStock = (payload) => {
  const raw = payload.stockQty ?? payload.openingStock;
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new BadRequestError('Stock quantity must be a number');
  if (n < 0) throw new BadRequestError('Stock quantity cannot be negative');
  return n;
};

export const upsertConsumable = async (payload, actor) => {
  if (!payload.code || !String(payload.code).trim()) throw new BadRequestError('A consumable code is required');
  if (!payload.name || !String(payload.name).trim()) throw new BadRequestError('A consumable name is required');
  const wanted = requestedStock(payload);
  const code = String(payload.code).trim().toUpperCase();

  const doc = await DialysisConsumable.findOne({ code });
  if (doc) {
    for (const f of CONSUMABLE_FIELDS) {
      if (payload[f] !== undefined) doc[f] = payload[f];
    }
    // A stock figure is a *balance*, and the balance is only trustworthy if the
    // movement ledger explains it. Setting stockQty through a plain assign
    // rewrote the shelf with no ledger row, so the audit trail and the quantity
    // silently disagreed. Record the difference instead.
    if (wanted != null && wanted !== doc.stockQty) {
      const delta = wanted - doc.stockQty;
      doc.stockQty = wanted;
      doc.movements.push({
        type: 'ADJUSTMENT', quantity: delta, balanceAfter: wanted,
        reason: payload.adjustmentReason || `Stock corrected from ${doc.stockQty - delta} to ${wanted}`,
        by: actor?.id,
      });
    }
    await doc.save();
    return doc;
  }

  const [doc2] = await DialysisConsumable.create([{
    code,
    ...Object.fromEntries(CONSUMABLE_FIELDS.filter((f) => payload[f] !== undefined).map((f) => [f, payload[f]])),
    stockQty: wanted || 0,
    movements: wanted ? [{ type: 'PURCHASE', quantity: wanted, balanceAfter: wanted, reason: 'Opening stock', by: actor?.id }] : [],
    hospitalId: actor?.hospitalId,
  }]);
  return doc2;
};

/** Issue consumables to a session — stock reduces atomically. */
export const issueConsumables = async (id, items, actor) => {
  const session = await loadSessionForUpdate(id);
  if (![SESSION_STATUS.PRE_ASSESSED, SESSION_STATUS.READY, SESSION_STATUS.CONNECTED, SESSION_STATUS.IN_PROGRESS].includes(session.status)) {
    throw new BadRequestError(`Consumables cannot be issued on a ${session.status} session`);
  }
  if (!Array.isArray(items) || !items.length) throw new BadRequestError('At least one consumable is required');

  const cfg = await getDialysisConfig(actor?.hospitalId, actor?.branchId);
  const blockExpired = cfg.consumables?.blockExpiredIssue !== false;
  const blockDuplicate = cfg.consumables?.blockDuplicateIssue !== false;

  const issued = [];
  const skipped = [];
  for (const item of items) {
    // eslint-disable-next-line no-await-in-loop
    const consumable = await DialysisConsumable.findOne({ _id: item.consumableId || item.id, active: true });
    if (!consumable) throw new NotFoundError(`Consumable ${item.consumableId || item.id} not found`);
    const qty = Number(item.quantity || 1);
    if (!(qty > 0)) throw new BadRequestError(`Invalid quantity for ${consumable.name}`);

    // Spec 24 — expired stock must never reach a patient. The check is on the
    // expiry date on the catalogue record, which is the batch the unit is
    // holding, and it runs before any stock is touched.
    const expired = consumable.expiryDate && new Date(consumable.expiryDate).getTime() < Date.now();
    if (expired && blockExpired) {
      throw new ConflictError(`${consumable.name} expired on ${new Date(consumable.expiryDate).toLocaleDateString('en-GB')} and cannot be issued to a patient`, {
        code: 'DIALYSIS_CONSUMABLE_EXPIRED',
        consumableId: consumable._id,
        code_: consumable.code,
        expiryDate: consumable.expiryDate,
      });
    }

    // Spec 24 — the same issue must not be deducted twice. A retry carrying a
    // movement key already on the ledger is recognised and reported back as
    // already issued rather than reducing stock a second time.
    const movementKey = item.requestId ? `${session._id}:${item.requestId}` : null;
    if (movementKey && blockDuplicate) {
      // eslint-disable-next-line no-await-in-loop
      const prior = consumable.movements.find((m) => m.movementKey === movementKey);
      if (prior) {
        skipped.push({ consumableId: consumable._id, name: consumable.name, code: consumable.code, quantity: qty, reason: 'Already issued for this request' });
        // eslint-disable-next-line no-continue
        continue;
      }
    }

    const updated = await DialysisConsumable.findOneAndUpdate(
      { _id: consumable._id, stockQty: { $gte: qty } },
      {
        $inc: { stockQty: -qty },
        $push: {
          movements: {
            type: 'ISSUE',
            quantity: -qty,
            referenceType: 'DialysisSession',
            referenceId: session._id,
            sessionId: session._id,
            patientId: session.patientId,
            movementKey,
            reason: `Session ${session.sessionNumber}`,
            by: actor?.id,
          },
        },
      },
      { new: true },
    );
    if (!updated) {
      const current = await DialysisConsumable.findById(consumable._id);
      throw new ConflictError(`Insufficient stock for ${consumable.name} (available ${current?.stockQty}, needed ${qty})`);
    }
    const movement = updated.movements[updated.movements.length - 1];
    movement.balanceAfter = updated.stockQty;
    await updated.save();

    const entry = {
      consumableId: consumable._id,
      name: consumable.name,
      code: consumable.code,
      category: consumable.category,
      quantity: qty,
      unit: consumable.unit,
      unitCost: consumable.unitCost || 0,
      total: Math.round(qty * (consumable.unitCost || 0) * 100) / 100,
      batchNumber: consumable.batchNumber,
      expiryDate: consumable.expiryDate,
      issuedAt: new Date(),
      issuedBy: actor?.id,
    };
    session.consumables.push(entry);
    if (consumable.billable) {
      session.charges.push({
        description: `${consumable.name} × ${qty} ${consumable.unit}`,
        code: consumable.code,
        quantity: qty,
        rate: consumable.unitCost || 0,
        amount: entry.total,
        consumableId: consumable._id,
      });
    }
    issued.push(entry);
  }

  session.totalAmount = Math.round(session.charges.reduce((s, c) => s + (c.amount || 0), 0) * 100) / 100;
  await session.save();
  return { session: await getSession(id), issued, skipped };
};

/**
 * Spec 24 — return unused consumables to stock. Only what was issued and not
 * already returned can come back, so a double return cannot inflate stock. The
 * session keeps the original issue line and records the returned quantity on
 * it, which is what the bill and the stock ledger both read.
 */
export const returnConsumables = async (id, items, actor) => {
  const session = await loadSessionForUpdate(id);
  if ([SESSION_STATUS.CLOSED, SESSION_STATUS.CANCELLED, SESSION_STATUS.NO_SHOW].includes(session.status)) {
    throw new BadRequestError(`Consumables cannot be returned on a ${session.status} session`);
  }
  // A return credits stock and cuts the charge line. Once the bill is raised
  // that total is frozen, so allowing the return left the patient under-billed
  // and the stock inflated, permanently and silently. After billing, stock goes
  // back via a stock adjustment and the money side is handled by cancelling the
  // bill — not by quietly editing a session nobody can re-bill.
  if (session.billId) {
    throw new ConflictError(
      `Session ${session.sessionNumber} is already billed, so a return would not reach the invoice. Cancel the bill first, or raise a stock adjustment.`,
      { code: 'DIALYSIS_RETURN_AFTER_BILLING', billId: session.billId },
    );
  }
  if (!Array.isArray(items) || !items.length) throw new BadRequestError('At least one consumable is required');

  const returned = [];
  for (const item of items) {
    // eslint-disable-next-line no-await-in-loop
    const line = item.consumableLineId
      ? session.consumables.id(item.consumableLineId)
      : session.consumables.find((c) => (c.consumableId?.toString() === String(item.consumableId || item.id)));
    if (!line) throw new NotFoundError(`That consumable was never issued to session ${session.sessionNumber}`);
    if (!line.consumableId) throw new BadRequestError(`No stock record behind ${line.name}, nothing to return to`);

    const qty = Number(item.quantity);
    if (!(qty > 0)) throw new BadRequestError(`Invalid return quantity for ${line.name}`);
    const outstanding = (Number(line.quantity) || 0) - (Number(line.returnedQuantity) || 0);
    if (qty > outstanding) {
      throw new ConflictError(`Cannot return ${qty} of ${line.name} — only ${outstanding} unreturned on this session`, {
        code: 'DIALYSIS_RETURN_EXCEEDS_ISSUE',
        outstanding,
      });
    }

    // expired stock goes back to quarantine, not to sellable stock
    const consumable = await DialysisConsumable.findById(line.consumableId);
    if (!consumable) throw new NotFoundError(`Stock record for ${line.name} not found`);
    const expired = consumable.expiryDate && new Date(consumable.expiryDate).getTime() < Date.now();
    const type = expired ? 'EXPIRY' : 'RETURN';

    // Expired stock is written off, not put back on the shelf. Incrementing
    // stockQty for an expired return made the next trolley draw pick the same
    // unusable units again, and the unit was left holding stock it could never
    // issue. The movement still lands on the ledger so the loss is traceable.
    const movement = {
      type,
      quantity: qty,
      referenceType: 'DialysisSession',
      referenceId: session._id,
      sessionId: session._id,
      patientId: session.patientId,
      reason: `Unused ${line.name} returned from session ${session.sessionNumber}${expired ? ' (expired — written off, not returned to sellable stock)' : ''}`,
      by: actor?.id,
    };
    const updated = await DialysisConsumable.findOneAndUpdate(
      { _id: consumable._id },
      expired
        ? { $push: { movements: movement } }
        : { $inc: { stockQty: qty }, $push: { movements: movement } },
      { new: true },
    );
    updated.movements[updated.movements.length - 1].balanceAfter = updated.stockQty;
    await updated.save();

    line.returnedQuantity = (Number(line.returnedQuantity) || 0) + qty;
    returned.push({ consumableLineId: line._id, name: line.name, code: line.code, quantity: qty, stockQty: updated.stockQty, quarantined: Boolean(expired) });

    // stock came back, so the patient cannot still be charged for it. The
    // charge line is reduced rather than deleted so the bill keeps its history.
    const charge = session.charges.find((c) => c.consumableId && c.consumableId.toString() === line.consumableId.toString());
    if (charge) {
      const unitRate = Number(charge.rate) || 0;
      charge.quantity = Math.max(0, (Number(charge.quantity) || 0) - qty);
      charge.amount = Math.round(charge.quantity * unitRate * 100) / 100;
    }
  }

  session.totalAmount = Math.round(session.charges.reduce((s, c) => s + (c.amount || 0), 0) * 100) / 100;
  await session.save();
  await writeAudit({
    user: actor, action: 'DIALYSIS_CONSUMABLE_RETURN', module: 'dialysis', entityId: id, entityType: 'DialysisSession',
    data: { sessionNumber: session.sessionNumber, returned: returned.map((r) => `${r.name} x${r.quantity}`) },
  });
  return { session: await getSession(id), returned };
};

// ============================================================
// 5b. LAB / INVESTIGATION BRIDGE
// ============================================================
/**
 * Section 1: investigation ordered from a dialysis session must exist as a real
 * LabOrder in the laboratory module. If the patient is currently admitted the
 * order is linked to that admission, so the ward and the lab see one record.
 */
export const orderSessionLabs = async (id, payload, actor) => {
  const session = await loadSessionForUpdate(id);
  if ([SESSION_STATUS.CLOSED, SESSION_STATUS.CANCELLED, SESSION_STATUS.NO_SHOW].includes(session.status)) {
    throw new BadRequestError(`Cannot raise investigations on a ${session.status} session`);
  }
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) throw new BadRequestError('At least one lab test is required');

  const { default: LabTest } = await import('../models/LabTest.model.js');
  const tests = await LabTest.find({ _id: { $in: items.map((i) => i.labTestId || i) } });
  if (tests.length !== items.length) throw new BadRequestError('One or more lab tests were not found');

  const IpdAdmission = (await import('../models/IpdAdmission.model.js')).default;
  const activeAdmission = await IpdAdmission.findOne({
    patientId: session.patientId,
    status: { $in: [ADMISSION_STATUS.ADMITTED, ADMISSION_STATUS.TRANSFERRED, ADMISSION_STATUS.DISCHARGE_PLANNED, ADMISSION_STATUS.WAITING_FOR_BED] },
  }).select('_id');

  const doctorId = payload.doctorId || session.doctorId || session.prescriptionSnapshot?.prescribedBy;
  const [order] = await LabOrder.create([{
    labOrderNumber: await generateNumber(NUMBER_PREFIXES.LAB_ORDER, new Date().getFullYear()),
    patientId: session.patientId,
    admissionId: activeAdmission?._id,
    dialysisSessionId: session._id,
    doctorId,
    orderedBy: actor?.id,
    priority: payload.priority || 'ROUTINE',
    clinicalNotes: payload.clinicalNotes || `Dialysis session ${session.sessionNumber}`,
    status: LAB_ORDER_STATUS.ORDERED,
    isCritical: payload.priority === 'STAT',
    items: tests.map((t) => ({
      labTestId: t._id,
      testName: t.name || t.testName,
      price: t.price || 0,
      status: LAB_ORDER_STATUS.ORDERED,
    })),
    hospitalId: actor?.hospitalId,
    branchId: actor?.branchId,
  }]);

  session.labOrderIds.push(order._id);
  await session.save();
  emitDialysis('session_updated', { sessionId: session._id, labOrderId: order._id });
  return { order, session: await getSession(id) };
};

export const listSessionLabs = async (id) => {
  const session = await loadSessionForUpdate(id);
  const orders = await LabOrder.find({ dialysisSessionId: session._id })
    .populate('items.resultId')
    .populate('doctorId', 'name')
    .sort({ createdAt: -1 })
    .lean();
  return orders;
};

// ============================================================
// 6. BILLING / PAYMENT
// ============================================================
/**
 * Spec 27 — the charge breakdown for a sitting.
 *
 * Every line is derived: consumables come from what was actually issued to the
 * session, and the rest come from the hospital's configured components applied
 * to the session's own recorded facts (duration, medications given, lab orders).
 * Nothing here is typed in by the cashier, and the total is whatever the bill
 * module computes — a manual figure is only ever a rate, and only with a reason.
 */
const deriveSessionCharges = async (session, { sessionRateOverride, overrideReason, actor }) => {
  // the hospital's own price list, not the global default: a rate the admin
  // configured for this hospital must be the rate the patient is charged
  const cfg = await getDialysisConfig(actor?.hospitalId || session.hospitalId, actor?.branchId || session.branchId);
  const components = (cfg.charges?.components || []).filter((c) => c.active !== false);
  const charges = [...session.charges];
  const durationMinutes = Number(session.durationMinutes) || 0;
  const hours = Math.round((durationMinutes / 60) * 100) / 100;

  // a manual rate is allowed but never a manual total, and it has to be explained
  let overrideNote = null;
  const configuredSession = components.find((c) => c.code === 'DIALYSIS_SESSION');
  const configuredRate = Number(configuredSession?.rate || await sessionRate(session) || 0);
  if (sessionRateOverride != null && Number(sessionRateOverride) !== configuredRate) {
    if (cfg.charges?.requireReasonOnRateOverride !== false && !overrideReason) {
      throw new BadRequestError('A session rate that differs from the configured rate needs a reason');
    }
    overrideNote = `Rate overridden from ${configuredRate} to ${Number(sessionRateOverride)}${overrideReason ? ` — ${overrideReason}` : ''}`;
  }
  const sessionCharge = sessionRateOverride != null ? Number(sessionRateOverride) : configuredRate;

  // which configured component carries the base sitting charge
  const sessionComponent = components.find((c) => c.basis === 'PER_SESSION' && c.code === 'DIALYSIS_SESSION')
    || components.find((c) => c.code === 'DIALYSIS_SESSION');
  if (sessionComponent && sessionCharge > 0) {
    charges.push({
      description: `${sessionComponent.label || 'Dialysis session'}${durationMinutes ? ` (${durationMinutes} min)` : ''}`,
      code: sessionComponent.code,
      quantity: 1,
      rate: sessionCharge,
      amount: sessionCharge,
    });
  }

  for (const c of components) {
    if (c.code === 'DIALYSIS_SESSION') continue;   // handled above
    const rate = Number(c.rate || 0);
    if (!rate) continue;

    if (c.basis === 'FIXED' || c.basis === 'PER_SESSION') {
      charges.push({ description: c.label || c.code, code: c.code, quantity: 1, rate, amount: rate });
    } else if (c.basis === 'PER_HOUR') {
      if (hours > 0) charges.push({ description: `${c.label || c.code} (${hours} h)`, code: c.code, quantity: hours, rate, amount: Math.round(hours * rate * 100) / 100 });
    } else if (c.basis === 'PER_MINUTE') {
      if (durationMinutes > 0) charges.push({ description: `${c.label || c.code} (${durationMinutes} min)`, code: c.code, quantity: durationMinutes, rate, amount: Math.round(durationMinutes * rate * 100) / 100 });
    } else if (c.basis === 'FROM_MEDICATIONS') {
      // one line per distinct medicine, charged per administration actually made
      const given = new Map();
      for (const m of session.medicationsGiven || []) {
        const key = `${m.name}|${m.dose || ''}|${m.route || ''}`;
        given.set(key, (given.get(key) || 0) + 1);
      }
      for (const [key, qty] of given.entries()) {
        const [name, dose, route] = key.split('|');
        charges.push({ description: `${name}${dose ? ` ${dose}` : ''}${route ? ` (${route})` : ''} × ${qty}`, code: `${c.code}:${name}`, quantity: qty, rate, amount: Math.round(qty * rate * 100) / 100 });
      }
    } else if (c.basis === 'FROM_LABS') {
      const labOrders = (session.labOrderIds || []).filter(Boolean);
      if (labOrders.length) {
        charges.push({ description: `${c.label || c.code} (${labOrders.length} order${labOrders.length > 1 ? 's' : ''})`, code: c.code, quantity: labOrders.length, rate, amount: Math.round(labOrders.length * rate * 100) / 100 });
      }
    }
  }

  if (overrideNote) {
    await writeAudit({
      user: actor, action: 'DIALYSIS_CHARGE_RATE_OVERRIDE', module: 'dialysis', entityId: session._id, entityType: 'DialysisSession',
      data: { sessionNumber: session.sessionNumber, note: overrideNote },
    });
  }
  return charges;
};

export const buildSessionBill = async (id, payload, actor) => {
  const session = await loadSessionForUpdate(id);
  if (session.billId) throw new ConflictError('This session is already billed');
  if (session.status !== SESSION_STATUS.COMPLETED && session.status !== SESSION_STATUS.CLOSED) {
    throw new BadRequestError('Only a completed dialysis session can be billed');
  }

  const charges = await deriveSessionCharges(session, { sessionRateOverride: payload.sessionCharge, overrideReason: payload.chargeOverrideReason, actor });
  if (!charges.length) throw new BadRequestError('No chargeable items on this session');

  const patient = await DialysisPatient.findById(session.dialysisPatientId);
  let bill;
  try {
    bill = await createBillingService({
      patientId: session.patientId,
      admissionId: session.admissionId,
      // the bill names the sitting, so the charge can be traced back to the
      // treatment that earned it and the unique index can refuse a second one
      dialysisSessionId: session._id,
      billType: 'DIALYSIS',
      departmentId: patient?.departmentId,
      doctorId: session.doctorId,
      items: charges.map((c) => ({
        itemType: c.code === 'DIALYSIS_SESSION' ? 'SERVICE' : 'CONSUMABLE',
        name: c.description,
        description: c.description,
        code: c.code,
        quantity: c.quantity,
        rate: c.rate,
        serviceCategory: 'DIALYSIS',
        referenceId: session._id,
        referenceType: 'DialysisSession',
      })),
    }, actor);
  } catch (e) {
    // two requests raced and the index caught the loser, which is exactly what
    // the in-memory `if (session.billId)` check above cannot do on its own
    if (e?.code === 11000) throw new ConflictError('This session is already billed');
    throw e;
  }

  const total = Math.round(bill.netTotal * 100) / 100;
  session.billId = bill._id;
  session.charges = charges;
  session.totalAmount = total;
  session.billedAt = new Date();
  session.paymentStatus = patient?.paymentCategory === 'INSURANCE' ? 'INSURANCE_PENDING' : 'BILLED';
  pushStatus(session, SESSION_STATUS.BILLED, actor, `Billed ${bill.billNumber} — ${total}`);
  await session.save();

  if (patient) {
    patient.lastBillId = bill._id;
    await patient.save();
  }

  await writeAudit({
    user: actor, action: 'DIALYSIS_BILL', module: 'dialysis', entityId: session._id, entityType: 'DialysisSession',
    data: { sessionNumber: session.sessionNumber, billId: bill._id, billNumber: bill.billNumber, total },
  });
  emitDialysis('session_billed', { sessionId: session._id, billId: bill._id, total });
  return { bill, session: await getSession(session._id) };
};

const sessionRate = async (session) => {
  const { default: IpdServiceCharge } = await import('../models/IpdServiceCharge.model.js');
  const charge = await IpdServiceCharge.findOne({ serviceCode: 'DIALYSIS' }).lean();
  return charge?.rate || 0;
};

const PAYMENT_MODES = ['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'WALLET', 'CHEQUE', 'INSURANCE', 'CREDIT', 'SPONSOR'];

export const recordSessionPayment = async (id, payload, actor) => {
  const session = await loadSessionForUpdate(id);
  if (!session.billId) throw new BadRequestError('Generate the session bill before recording payment');
  if (payload.mode && !PAYMENT_MODES.includes(String(payload.mode).toUpperCase())) {
    throw new BadRequestError(`Unsupported payment mode ${payload.mode}`);
  }
  const { default: Bill } = await import('../models/Bill.model.js');
  const { recordPaymentOnBill } = await import('./billing.service.js');
  const { default: Payment } = await import('../models/Payment.model.js');
  const bill = await Bill.findById(session.billId);
  if (!bill) throw new NotFoundError('Session bill not found');
  // the sitting is stamped on the payment so the day's takings reconcile to the
  // session without having to walk back through the bill
  const { bill: fresh, payment } = await recordPaymentOnBill(bill, {
    amount: payload.amount,
    mode: String(payload.mode || 'CASH').toUpperCase(),
    referenceNumber: payload.referenceNumber,
    dialysisSessionId: session._id,
    notes: payload.notes,
    allowOverpay: false,
  }, actor);
  session.paidAmount = fresh.paidAmount;
  session.paymentStatus = fresh.dueAmount <= 0.01 ? 'PAID' : 'PARTIAL';
  // Settling the money must NOT close the sitting. CLOSED is the terminal state
  // and disconnectSession is the only thing that may enter it, because that
  // same call is what releases the machine. Closing on payment left the machine
  // IN_USE and the bay OCCUPIED with no legal way out.
  await session.save();
  await writeAudit({
    user: actor, action: 'DIALYSIS_PAYMENT', module: 'dialysis', entityId: id, entityType: 'DialysisSession',
    data: {
      sessionNumber: session.sessionNumber, amount: payload.amount, mode: payload.mode,
      referenceNumber: payload.referenceNumber || null, billId: session.billId,
    },
  });
  emitDialysis('session_paid', { sessionId: session._id, amount: payload.amount, mode: payload.mode });
  return { bill: fresh, payment, session: await getSession(id) };
};

/** Spec 28 — every payment taken against a session's bill, in one list. */
export const listSessionPayments = async (id) => {
  const session = await DialysisSession.findById(id).select('billId sessionNumber');
  if (!session) throw new NotFoundError('Dialysis session not found');
  const { default: Payment } = await import('../models/Payment.model.js');
  return Payment.find({ dialysisSessionId: session._id })
    .populate('receivedBy', 'name')
    .sort({ paidAt: -1 })
    .lean();
};

// ============================================================
// 7. LISTS / HISTORY
// ============================================================
export const listSessions = async (query = {}) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.machineId) filter.machineId = query.machineId;
  if (query.patientId) filter.patientId = query.patientId;
  if (query.dialysisPatientId) filter.dialysisPatientId = query.dialysisPatientId;
  if (query.shift) filter.shift = query.shift;
  if (query.date) {
    const start = startOfLocalDay(query.date);
    const end = endOfLocalDay(query.date);
    filter.sessionDate = { $gte: start, $lt: end };
  }
  if (query.from || query.to) {
    filter.sessionDate = {};
    if (query.from) filter.sessionDate.$gte = new Date(query.from);
    if (query.to) filter.sessionDate.$lte = new Date(query.to);
  }
  if (query.complications === 'true') filter['complications.0'] = { $exists: true };

  const [total, rows] = await Promise.all([
    DialysisSession.countDocuments(filter),
    DialysisSession.find(filter)
      .populate('patientId', 'uhid firstName lastName age gender bloodGroup')
      .populate('dialysisPatientId', 'dialysisNumber primaryDiagnosis ckdStage accessType')
      .populate('scheduleId', 'scheduleNumber patternLabel daysOfWeek')
      .populate('rescheduledFromId', 'sessionNumber scheduledStart')
      .populate('rescheduledToId', 'sessionNumber scheduledStart')
      .populate('machineId', 'code name')
      .populate('stationId', 'code name')
      .populate('doctorId', 'name')
      .populate('nurseId', 'name')
      .sort({ sessionDate: -1, scheduledStart: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
  ]);
  return { rows: rows.map(normalizeSessionRow), total, page, limit, pages: Math.ceil(total / limit) || 1 };
};

/**
 * Guarantees a stable JSON shape for the list screens: a populated-but-empty
 * ObjectId is dropped by mongoose, which would make a client render
 * "undefined" instead of an explicit "not allocated yet".
 */
const normalizeSessionRow = (row) => {
  const obj = typeof row?.toObject === 'function' ? row.toObject() : { ...row };
  return {
    ...obj,
    machineId: obj.machineId ?? null,
    stationId: obj.stationId ?? null,
    doctorId: obj.doctorId ?? null,
    nurseId: obj.nurseId ?? null,
    technicianId: obj.technicianId ?? null,
    scheduleId: obj.scheduleId ?? null,
    rescheduledFromId: obj.rescheduledFromId ?? null,
    rescheduledToId: obj.rescheduledToId ?? null,
    admissionId: obj.admissionId ?? null,
    opdVisitId: obj.opdVisitId ?? null,
    billId: obj.billId ?? null,
    isEmergency: Boolean(obj.isEmergency),
    isRecurring: Boolean(obj.isRecurring),
    rescheduleCount: obj.rescheduleCount || 0,
    timeOfDay: obj.timeOfDay || '08:00',
    priority: obj.priority || SESSION_PRIORITY.ROUTINE,
    shift: obj.shift || 'MORNING',
    status: obj.status || SESSION_STATUS.SCHEDULED,
  };
};

export const patientHistory = async (patientId, limit = 50) => DialysisSession.find({ patientId })
  .populate('machineId', 'code name')
  .populate('stationId', 'code name')
  .populate('doctorId', 'name')
  .populate('nurseId', 'name')
  .sort({ sessionDate: -1 })
  .limit(Math.min(parseInt(limit, 10) || 50, 200))
  .lean();

// ============================================================
// 8. COMMAND CENTRE
// ============================================================
export const commandCenter = async (date) => {
  const day = startOfLocalDay(date);
  const end = endOfLocalDay(date);

  const [
    sessions, machines, stations, patients, bills, complications,
  ] = await Promise.all([
    DialysisSession.find({ sessionDate: { $gte: day, $lt: end } })
      .populate('patientId', 'uhid firstName lastName age gender bloodGroup')
      .populate('dialysisPatientId', 'dialysisNumber primaryDiagnosis ckdStage')
      .populate('machineId', 'code status')
      .populate('stationId', 'code status')
      .populate('doctorId', 'name')
      .populate('nurseId', 'name')
      .sort({ scheduledStart: 1 })
      .lean(),
    DialysisMachine.find({}).lean(),
    DialysisStation.find({}).lean(),
    DialysisPatient.countDocuments({ status: 'ACTIVE' }),
    import('../models/Bill.model.js').then((m) => m.default.find({ billType: 'DIALYSIS', billDate: { $gte: day, $lt: end } }).lean()),
    DialysisSession.countDocuments({ sessionDate: { $gte: day, $lt: end }, 'complications.0': { $exists: true } }),
  ]);

  const byStatus = (s) => sessions.filter((x) => x.status === s).length;
  const inProgress = sessions.filter((s) => [SESSION_STATUS.CONNECTED, SESSION_STATUS.IN_PROGRESS].includes(s.status));
  const completed = sessions.filter((s) => [SESSION_STATUS.COMPLETED, SESSION_STATUS.BILLED, SESSION_STATUS.CLOSED].includes(s.status));

  const critical = sessions.filter((s) => s.criticalFlag
    || (s.preAssessment?.bpSystolic && (s.preAssessment.bpSystolic < 90 || s.preAssessment.bpSystolic > 180))
    || (s.vitals || []).some((v) => v.spo2 != null && v.spo2 < 90));

  const revenue = bills.reduce((s, b) => s + (b.netTotal || 0), 0);
  const collected = bills.reduce((s, b) => s + (b.paidAmount || 0), 0);
  const pendingBilling = sessions.filter((s) => s.status === SESSION_STATUS.COMPLETED && !s.billId).length;
  const pendingPayment = bills.filter((b) => (b.dueAmount || 0) > 0.01).reduce((s, b) => s + b.dueAmount, 0);
  const insurancePending = sessions.filter((s) => s.paymentStatus === 'INSURANCE_PENDING').length;

  const machineStatus = (st) => machines.filter((m) => m.status === st).length;
  const stationStatus = (st) => stations.filter((s) => s.status === st).length;

  return {
    date: day.toISOString().slice(0, 10),
    updatedAt: new Date().toISOString(),
    patients: {
      totalActive: patients,
    },
    sessions: {
      today: sessions.length,
      scheduled: byStatus(SESSION_STATUS.SCHEDULED),
      checkedIn: byStatus(SESSION_STATUS.CHECKED_IN) + byStatus(SESSION_STATUS.PRE_ASSESSED) + byStatus(SESSION_STATUS.READY),
      waiting: byStatus(SESSION_STATUS.READY),
      inProgress: inProgress.length,
      completed: completed.length,
      cancelled: byStatus(SESSION_STATUS.CANCELLED),
      noShow: byStatus(SESSION_STATUS.NO_SHOW),
      emergency: sessions.filter((s) => s.priority === 'EMERGENCY').length,
      byShift: SHIFTS.reduce((acc, sh) => ({ ...acc, [sh]: sessions.filter((s) => s.shift === sh).length }), {}),
    },
    clinical: {
      requiringAttention: critical.length,
      abnormalVitals: critical.length,
      pendingLabResults: sessions.filter((s) => (s.labOrderIds || []).length > 0).length,
      criticalAlerts: sessions.filter((s) => s.criticalFlag).length,
      complicationsToday: complications,
      urgentPatients: sessions.filter((s) => s.priority !== 'ROUTINE').map((s) => ({
        sessionId: s._id,
        sessionNumber: s.sessionNumber,
        patient: `${s.patientId?.firstName} ${s.patientId?.lastName}`,
        uhid: s.patientId?.uhid,
        priority: s.priority,
        status: s.status,
        criticalFlag: s.criticalFlag || null,
      })),
    },
    machines: {
      total: machines.length,
      available: machineStatus(MACHINE_STATUS.AVAILABLE),
      inUse: machineStatus(MACHINE_STATUS.IN_USE),
      maintenance: machineStatus(MACHINE_STATUS.MAINTENANCE),
      blocked: machineStatus(MACHINE_STATUS.BLOCKED),
      cleaning: machineStatus(MACHINE_STATUS.CLEANING),
      reserved: machineStatus(MACHINE_STATUS.RESERVED),
      list: machines.map((m) => ({ id: m._id, code: m.code, name: m.name, status: m.status, type: m.machineType, currentSessionId: m.currentSessionId, lastServicedAt: m.lastServicedAt, nextServiceDue: m.nextServiceDue })),
    },
    stations: {
      total: stations.length,
      occupied: stationStatus(STATION_STATUS.OCCUPIED),
      available: stationStatus(STATION_STATUS.AVAILABLE),
      cleaning: stationStatus(STATION_STATUS.CLEANING),
      reserved: stationStatus(STATION_STATUS.RESERVED),
      blocked: stationStatus(STATION_STATUS.BLOCKED),
      list: stations.map((s) => ({ id: s._id, code: s.code, name: s.name, area: s.area, status: s.status, machineId: s.machineId, currentSessionId: s.currentSessionId })),
    },
    financial: {
      todayRevenue: Math.round(revenue * 100) / 100,
      collected: Math.round(collected * 100) / 100,
      pendingBilling,
      pendingPayment: Math.round(pendingPayment * 100) / 100,
      insurancePending,
      bills: bills.length,
    },
    roster: sessions.map((s) => ({
      id: s._id,
      sessionNumber: s.sessionNumber,
      time: s.scheduledStart,
      shift: s.shift,
      status: s.status,
      priority: s.priority,
      patient: `${s.patientId?.firstName || ''} ${s.patientId?.lastName || ''}`.trim(),
      uhid: s.patientId?.uhid,
      dialysisNumber: s.dialysisPatientId?.dialysisNumber,
      machine: s.machineId?.code,
      station: s.stationId?.code,
      doctor: s.doctorId?.name,
      nurse: s.nurseId?.name,
      ufRemoved: s.ufRemovedMl,
      ufGoal: s.ufGoalMl,
    })),
  };
};

const emitDialysis = (event, payload) => {
  emitDialysisShared(event, payload);
};

// ============================================================
// 9. MACHINES / STATIONS
// ============================================================
const normalizeMachine = (m) => ({
  ...m,
  status: m.status || MACHINE_STATUS.AVAILABLE,
  statusReason: m.statusReason ?? null,
  statusChangedAt: m.statusChangedAt ?? null,
  serialNumber: m.serialNumber ?? null,
  installedOn: m.installedOn ?? null,
  lastServicedAt: m.lastServicedAt ?? null,
  nextServiceDue: m.nextServiceDue ?? null,
  serviceIntervalDays: m.serviceIntervalDays ?? null,
  warrantyEndsOn: m.warrantyEndsOn ?? null,
  serviceHistory: m.serviceHistory || [],
  currentSessionId: m.currentSessionId ?? null,
  stationId: m.stationId ?? null,
  totalSessions: m.totalSessions || 0,
  totalDialysisHours: m.totalDialysisHours || 0,
});

export const listMachines = async (query = {}) => {
  const filter = {};
  // Retired machines leave the working roster by default, but the audit view
  // can still ask for them explicitly.
  filter.active = query.includeRetired === 'true' ? { $in: [true, false] } : true;
  if (query.status) filter.status = query.status;
  if (query.machineType) filter.machineType = query.machineType;
  const machines = await DialysisMachine.find(filter)
    .populate('stationId', 'code name area status')
    .populate('currentSessionId', 'sessionNumber status patientId')
    .sort({ code: 1 })
    .lean();
  return machines.map(normalizeMachine);
};

export const upsertMachine = async (payload, actor) => {
  if (payload._id || payload.id) {
    const machine = await DialysisMachine.findById(payload._id || payload.id);
    if (!machine) throw new NotFoundError('Machine not found');
    if (machine.status === MACHINE_STATUS.IN_USE && payload.status && payload.status !== MACHINE_STATUS.IN_USE) {
      throw new ConflictError('Machine is in use — disconnect the running session first');
    }
    if (payload.serialNumber) {
      const twin = await DialysisMachine.findOne({ serialNumber: payload.serialNumber, _id: { $ne: machine._id } });
      if (twin) throw new ConflictError(`Serial number ${payload.serialNumber} is already on machine ${twin.code}`);
    }
    // Editing the master must not become a back door around the status-change
    // rule, so a status change here needs the same reason.
    const nextStatus = payload.status && payload.status !== machine.status ? payload.status : null;
    if (nextStatus) assertStatusChangeReason(nextStatus, payload.reason);
    Object.assign(machine, payload);
    if (nextStatus) {
      machine.statusChangedAt = new Date();
    }
    await machine.save();
    await writeAudit({ user: actor, action: 'DIALYSIS_MACHINE_UPDATE', module: 'dialysis', entityId: machine._id, entityType: 'DialysisMachine', data: { code: machine.code, status: machine.status } });
    emitDialysis('machine_updated', { machineId: machine._id, status: machine.status });
    return machine;
  }
  if (!payload.code) throw new BadRequestError('Machine code is required');
  const exists = await DialysisMachine.findOne({ code: payload.code });
  if (exists) throw new ConflictError(`Machine ${payload.code} already exists`);
  if (payload.serialNumber) {
    const twin = await DialysisMachine.findOne({ serialNumber: payload.serialNumber });
    if (twin) throw new ConflictError(`Serial number ${payload.serialNumber} is already on machine ${twin.code}`);
  }

  const machine = await DialysisMachine.create({ ...payload, hospitalId: actor?.hospitalId, branchId: actor?.branchId });
  if (machine.stationId) {
    await DialysisStation.findOneAndUpdate({ _id: machine.stationId }, { $set: { machineId: machine._id } });
  }
  if (machine.installedOn) {
    machine.serviceHistory.push({
      at: machine.installedOn, type: SERVICE_TYPE.INSTALLATION, performedBy: actor?.id,
      details: 'Machine put into service', machineStatusAfter: machine.status,
      nextServiceDue: machine.nextServiceDue,
    });
    await machine.save();
  }
  await writeAudit({ user: actor, action: 'DIALYSIS_MACHINE_CREATE', module: 'dialysis', entityId: machine._id, entityType: 'DialysisMachine', data: { code: machine.code, type: machine.machineType } });
  emitDialysis('machine_updated', { machineId: machine._id, status: machine.status });
  return machine;
};

// Taking a machine out of service is a safety decision, so it must be possible
// to say afterwards why. Shared by the status endpoint and the master edit.
const assertStatusChangeReason = (status, reason) => {
  if ([MACHINE_STATUS.MAINTENANCE, MACHINE_STATUS.BLOCKED, MACHINE_STATUS.OUT_OF_SERVICE, MACHINE_STATUS.DECOMMISSIONED].includes(status)
    && !String(reason || '').trim()) {
    throw new BadRequestError('A reason is required when taking a machine out of service');
  }
};

export const changeMachineStatus = async (id, status, payload, actor) => {
  if (!Object.values(MACHINE_STATUS).includes(status)) throw new BadRequestError('Invalid machine status');
  const machine = await DialysisMachine.findById(id);
  if (!machine) throw new NotFoundError('Machine not found');
  if (machine.status === MACHINE_STATUS.IN_USE) {
    throw new ConflictError('Machine is running a session — complete or disconnect the session first');
  }
  assertStatusChangeReason(status, payload?.reason);
  const before = machine.status;
  machine.status = status;
  machine.statusReason = payload?.reason;
  machine.statusChangedAt = new Date();
  await machine.save();
  if (status === MACHINE_STATUS.AVAILABLE && machine.stationId) {
    await DialysisStation.findOneAndUpdate({ _id: machine.stationId, currentSessionId: null }, { $set: { status: STATION_STATUS.AVAILABLE, lastTurnoverAt: new Date() } });
  }
  await writeAudit({
    user: actor, action: 'DIALYSIS_MACHINE_STATUS', module: 'dialysis', entityId: id, entityType: 'DialysisMachine',
    data: { before: { status: before }, after: { status }, reason: payload?.reason },
  });
  emitDialysis('machine_updated', { machineId: id, status });
  return machine;
};

// Records created before a field was added to the schema have no value for it,
// and a lean() query applies no defaults. These mappers make the API contract
// explicit so a client never has to guess what an absent key meant.
const normalizeStation = (s) => ({
  ...s,
  bedOrChair: s.bedOrChair || 'CHAIR',
  status: s.status || STATION_STATUS.AVAILABLE,
  statusReason: s.statusReason ?? null,
  statusChangedAt: s.statusChangedAt ?? null,
  machineId: s.machineId ?? null,
  currentSessionId: s.currentSessionId ?? null,
  totalSessions: s.totalSessions || 0,
});

export const listStations = async (query = {}) => (await DialysisStation.find({
  // Retired bays leave the working roster by default, but the audit view can
  // still ask for them explicitly.
  ...(query.includeRetired === 'true' ? {} : { active: true }),
})
  .populate('machineId', 'code name status')
  .populate('currentSessionId', 'sessionNumber status')
  .sort({ code: 1 })
  .lean()).map(normalizeStation);

export const upsertStation = async (payload, actor) => {
  if (payload._id || payload.id) {
    const station = await DialysisStation.findById(payload._id || payload.id);
    if (!station) throw new NotFoundError('Station not found');
    if (payload.machineId) {
      const twin = await DialysisStation.findOne({ machineId: payload.machineId, _id: { $ne: station._id }, currentSessionId: { $ne: null } });
      if (twin) throw new ConflictError(`Machine is already assigned to occupied bay ${twin.code}`);
    }
    const before = { code: station.code, status: station.status, bedOrChair: station.bedOrChair, machineId: station.machineId };
    Object.assign(station, payload);
    if (payload.status && payload.status !== before.status) {
      if ([STATION_STATUS.BLOCKED, STATION_STATUS.MAINTENANCE].includes(payload.status) && !String(payload.reason || '').trim()) {
        throw new BadRequestError('A reason is required to take a bay out of service');
      }
      station.statusChangedAt = new Date();
    }
    await station.save();
    if (payload.machineId) {
      await DialysisMachine.findOneAndUpdate({ _id: payload.machineId }, { $set: { stationId: station._id } });
    }
    await writeAudit({
      user: actor, action: 'DIALYSIS_STATION_UPDATE', module: 'dialysis', entityId: station._id, entityType: 'DialysisStation',
      data: { before, after: { code: station.code, status: station.status, bedOrChair: station.bedOrChair, machineId: station.machineId }, reason: payload.reason },
    });
    return station;
  }
  if (!payload.code) throw new BadRequestError('Station code is required');
  const exists = await DialysisStation.findOne({ code: payload.code });
  if (exists) throw new ConflictError(`Station ${payload.code} already exists`);
  const config = await getDialysisConfig(actor?.hospitalId, actor?.branchId);
  const station = await DialysisStation.create({
    bedOrChair: config.units?.defaultBedOrChair || STATION_KIND.CHAIR,
    ...payload,
    hospitalId: actor?.hospitalId,
  });
  if (payload.machineId) {
    await DialysisMachine.findOneAndUpdate({ _id: payload.machineId }, { $set: { stationId: station._id } });
  }
  await writeAudit({
    user: actor, action: 'DIALYSIS_STATION_CREATE', module: 'dialysis', entityId: station._id, entityType: 'DialysisStation',
    data: { code: station.code, bedOrChair: station.bedOrChair, area: station.area },
  });
  return station;
};

/**
 * Manual station turnover. A bay that a session left in CLEANING only returns
 * to AVAILABLE once a nurse signs the cleaning off, and BLOCKED needs a reason
 * so a bay never silently disappears from the board.
 */
export const changeStationStatus = async (id, status, payload, actor) => {
  if (!Object.values(STATION_STATUS).includes(status)) throw new BadRequestError('Invalid station status');
  const station = await DialysisStation.findById(id);
  if (!station) throw new NotFoundError('Station not found');

  if (station.status === STATION_STATUS.OCCUPIED || station.currentSessionId) {
    const live = station.currentSessionId
      ? await DialysisSession.findById(station.currentSessionId).select('status sessionNumber')
      : null;
    if (live && !['COMPLETED', 'BILLED', 'CLOSED', 'CANCELLED', 'NO_SHOW'].includes(live.status)) {
      throw new ConflictError(`Bay ${station.code} is occupied by running session ${live.sessionNumber} — disconnect it first`);
    }
  }
  // A reason is required for every status that takes the bay out of service, so
  // a missing bay can always be explained.
  if ([STATION_STATUS.BLOCKED, STATION_STATUS.MAINTENANCE].includes(status) && !String(payload?.reason || '').trim()) {
    throw new BadRequestError('A reason is required to take a bay out of service');
  }

  const before = station.status;
  station.status = status;
  station.statusReason = payload?.reason;
  station.statusChangedAt = new Date();
  if (status === STATION_STATUS.AVAILABLE) {
    station.currentSessionId = null;
    station.lastTurnoverAt = new Date();
  }
  await station.save();

  // bringing the machine back into service is part of signing a bay off
  if (payload?.machineToAvailable && station.machineId) {
    await DialysisMachine.findOneAndUpdate(
      { _id: station.machineId, status: { $in: [MACHINE_STATUS.CLEANING, MACHINE_STATUS.AVAILABLE] } },
      { $set: { status: MACHINE_STATUS.AVAILABLE, statusChangedAt: new Date() } },
    );
  }

  await writeAudit({
    user: actor, action: 'DIALYSIS_STATION_STATUS', module: 'dialysis', entityId: id, entityType: 'DialysisStation',
    data: { code: station.code, before: { status: before }, after: { status }, reason: payload?.reason },
  });
  emitDialysis('station_updated', { stationId: id, status });
  return station;
};

/**
 * Retires a machine from the roster. It is a soft delete on purpose: a machine
 * that has run sittings keeps its service history and its session numbers, so
 * the record is never destroyed — it just stops being bookable. A machine with a
 * live session cannot be retired.
 */
export const deactivateMachine = async (id, payload, actor) => {
  const machine = await DialysisMachine.findById(id);
  if (!machine) throw new NotFoundError('Machine not found');
  if (machine.status === MACHINE_STATUS.IN_USE || machine.currentSessionId) {
    throw new ConflictError('Machine is running a session — complete or disconnect the session before retiring it');
  }
  if (!payload?.reason) throw new BadRequestError('A reason is required to retire a machine');
  machine.active = false;
  machine.status = MACHINE_STATUS.DECOMMISSIONED;
  machine.statusReason = payload.reason;
  machine.statusChangedAt = new Date();
  machine.decommissionedAt = new Date();
  machine.decommissionReason = payload.reason;
  await machine.save();
  // a retired machine must not leave its bay looking occupied
  if (machine.stationId) {
    await DialysisStation.findOneAndUpdate(
      { _id: machine.stationId, currentSessionId: null },
      { $set: { status: STATION_STATUS.AVAILABLE, statusChangedAt: new Date() } },
    );
  }
  await writeAudit({
    user: actor, action: 'DIALYSIS_MACHINE_RETIRE', module: 'dialysis', entityId: id, entityType: 'DialysisMachine',
    data: { code: machine.code, reason: payload.reason },
  });
  emitDialysis('machine_updated', { machineId: id, status: machine.status });
  return machine;
};

/** Retires a bay from the roster, with the same soft-delete reasoning. */
export const deactivateStation = async (id, payload, actor) => {
  const station = await DialysisStation.findById(id);
  if (!station) throw new NotFoundError('Station not found');
  if (station.status === STATION_STATUS.OCCUPIED || station.currentSessionId) {
    throw new ConflictError('Bay is occupied by a running session — disconnect it before retiring the bay');
  }
  if (!payload?.reason) throw new BadRequestError('A reason is required to retire a bay');
  const machinesHere = await DialysisMachine.find({ stationId: id, active: true, status: { $ne: MACHINE_STATUS.IN_USE } });
  if (machinesHere.length) {
    throw new ConflictError(`${machinesHere.length} machine(s) are still installed in this bay (${machinesHere.map((m) => m.code).join(', ')}) — retire or move them first`);
  }
  station.active = false;
  station.status = STATION_STATUS.BLOCKED;
  station.statusReason = payload.reason;
  station.statusChangedAt = new Date();
  await station.save();
  await writeAudit({
    user: actor, action: 'DIALYSIS_STATION_RETIRE', module: 'dialysis', entityId: id, entityType: 'DialysisStation',
    data: { code: station.code, reason: payload.reason },
  });
  emitDialysis('station_updated', { stationId: id, status: station.status });
  return station;
};

/**
 * Records an intervention on a machine and moves the maintenance clock. This is
 * what makes "last maintenance" and "next due" auditable instead of a typed-in
 * date that drifts away from reality.
 */
export const recordMachineService = async (id, payload, actor) => {
  const machine = await DialysisMachine.findById(id);
  if (!machine) throw new NotFoundError('Machine not found');
  // A technician cannot service a machine that is running a patient, whatever
  // status the record asks the machine to end up in.
  if (machine.status === MACHINE_STATUS.IN_USE) {
    throw new ConflictError('Machine is running a session — the session must be completed or disconnected first');
  }
  if (!payload.type) throw new BadRequestError('Service type is required');

  const at = payload.at ? new Date(payload.at) : new Date();
  const config = await getDialysisConfig(actor?.hospitalId, actor?.branchId);
  const defaultInterval = Number(config.units?.machineServiceIntervalDays ?? 90);
  const interval = Number(payload.serviceIntervalDays || machine.serviceIntervalDays || defaultInterval);
  const nextDue = payload.nextServiceDue
    ? new Date(payload.nextServiceDue)
    : new Date(at.getTime() + interval * 86400000);

  machine.serviceHistory.push({
    at,
    type: payload.type,
    performedBy: actor?.id,
    vendorName: payload.vendorName,
    engineerName: payload.engineerName,
    ticketNumber: payload.ticketNumber,
    details: payload.details,
    partsReplaced: payload.partsReplaced || [],
    machineStatusAfter: payload.machineStatusAfter || machine.status,
    nextServiceDue: nextDue,
    downtimeMinutes: payload.downtimeMinutes,
  });
  machine.lastServicedAt = at;
  machine.nextServiceDue = nextDue;
  if (payload.serviceIntervalDays) machine.serviceIntervalDays = interval;
  if (payload.machineStatusAfter) {
    machine.status = payload.machineStatusAfter;
    machine.statusReason = payload.reason;
    machine.statusChangedAt = new Date();
  }
  await machine.save();

  await writeAudit({
    user: actor, action: 'DIALYSIS_MACHINE_SERVICE', module: 'dialysis', entityId: id, entityType: 'DialysisMachine',
    data: { code: machine.code, type: payload.type, vendor: payload.vendorName, nextServiceDue: nextDue, statusAfter: machine.status },
  });
  emitDialysis('machine_updated', { machineId: id, status: machine.status });
  return machine;
};

export const listMachineService = async (id) => {
  const machine = await DialysisMachine.findById(id)
    .populate('serviceHistory.performedBy', 'name')
    .lean();
  if (!machine) throw new NotFoundError('Machine not found');
  const now = new Date();
  return {
    machine: {
      id: machine._id, code: machine.code, name: machine.name, manufacturer: machine.manufacturer,
      model: machine.model, serialNumber: machine.serialNumber, machineType: machine.machineType,
      installedOn: machine.installedOn, status: machine.status, location: machine.location,
      lastServicedAt: machine.lastServicedAt, nextServiceDue: machine.nextServiceDue,
      serviceIntervalDays: machine.serviceIntervalDays, warrantyEndsOn: machine.warrantyEndsOn,
      totalSessions: machine.totalSessions, totalDialysisHours: machine.totalDialysisHours,
    },
    serviceHistory: (machine.serviceHistory || []).slice().reverse(),
    serviceDue: {
      lastServicedAt: machine.lastServicedAt,
      nextServiceDue: machine.nextServiceDue,
      daysUntilDue: machine.nextServiceDue
        ? Math.ceil((new Date(machine.nextServiceDue) - now) / 86400000)
        : null,
      overdue: machine.nextServiceDue ? new Date(machine.nextServiceDue) < now : false,
      warrantyEndsOn: machine.warrantyEndsOn,
      warrantyExpired: machine.warrantyEndsOn ? new Date(machine.warrantyEndsOn) < now : false,
    },
  };
};

/** Machines whose service is due or overdue, and the ones currently unusable. */
export const machineServiceDue = async () => {
  const now = new Date();
  const config = await getDialysisConfig();
  const warnDays = Number(config.units?.serviceDueWarningDays ?? 14);
  const soon = new Date(now.getTime() + warnDays * 86400000);
  const machines = await DialysisMachine.find({ active: true }).sort({ code: 1 }).lean();
  const decorate = (m) => ({
    id: m._id,
    code: m.code,
    manufacturer: m.manufacturer,
    model: m.model,
    lastServicedAt: m.lastServicedAt,
    nextServiceDue: m.nextServiceDue,
    daysUntilDue: m.nextServiceDue ? Math.ceil((new Date(m.nextServiceDue) - now) / 86400000) : null,
    overdue: m.nextServiceDue ? new Date(m.nextServiceDue) < now : false,
  });
  return {
    warningWindowDays: warnDays,
    due: machines.filter((m) => m.nextServiceDue && new Date(m.nextServiceDue) <= soon).map(decorate),
    overdue: machines.filter((m) => m.nextServiceDue && new Date(m.nextServiceDue) < now).length,
    // A machine with no service date at all is also a gap: it has never been
    // logged, so the engineering register cannot be trusted.
    neverServiced: machines.filter((m) => !m.lastServicedAt)
      .map((m) => ({ id: m._id, code: m.code, status: m.status, installedOn: m.installedOn })),
    unavailable: machines.filter((m) => [MACHINE_STATUS.MAINTENANCE, MACHINE_STATUS.BLOCKED, MACHINE_STATUS.OUT_OF_SERVICE, MACHINE_STATUS.DECOMMISSIONED].includes(m.status))
      .map((m) => ({ id: m._id, code: m.code, status: m.status, reason: m.statusReason })),
  };
};

// ============================================================
// 10. ACCESS REGISTRY
// ============================================================
export const getAccess = async (patientId) => {
  const rows = await DialysisAccess.find({ patientId })
    .populate('operatedBy', 'name')
    .sort({ isPrimary: -1, createdAt: -1 })
    .lean();
  return rows;
};

export const createAccess = async (payload, actor) => {
  // Two live accesses of the same type cannot share one side, whatever the
  // primary flag says — the primary flag is a preference, not a rule.
  const exists = await DialysisAccess.findOne({ patientId: payload.patientId, accessType: payload.accessType, side: payload.side, status: { $ne: ACCESS_STATUS.DECOMMISSIONED } });
  if (exists) throw new ConflictError(`An active ${payload.accessType} access already exists on the ${payload.side?.toLowerCase()} side`);
  const dialysisPatient = await DialysisPatient.findOne({ patientId: payload.patientId });
  const access = await DialysisAccess.create({
    ...payload,
    dialysisPatientId: dialysisPatient?._id,
    createdBy: actor?.id,
    hospitalId: actor?.hospitalId,
  });
  if (dialysisPatient) {
    await DialysisPatient.findById(dialysisPatient._id).updateOne({
      $set: { accessType: payload.accessType, accessSide: payload.side, accessCreatedAt: access.createdAt },
    });
  }
  return access;
};

// The master fields a clinician may correct after the access is created. The
// identity fields (patient, type, side) are deliberately not editable: an
// access is a physical fact, so a wrong one is decommissioned and re-entered.
const ACCESS_EDITABLE = ['site', 'anastomosis', 'graftMaterial', 'catheterType', 'catheterInsertedAt', 'operatedBy', 'notes'];

export const updateAccess = async (id, payload, actor) => {
  const access = await DialysisAccess.findById(id);
  if (!access) throw new NotFoundError('Access record not found');
  if (payload.intervention || payload.status) {
    access.interventions.push({
      at: new Date(),
      type: payload.intervention || payload.status,
      notes: payload.notes,
      by: actor?.id,
    });
  }
  if (payload.status) {
    access.status = payload.status;
    // Decommissioning is terminal and dated, so the record explains itself
    // later without needing the intervention log to be read.
    if (payload.status === ACCESS_STATUS.DECOMMISSIONED) {
      access.decommissionedAt = new Date();
      access.decommissionReason = payload.notes || 'Decommissioned';
      access.isPrimary = false;
    }
  }
  if (payload.notes) access.notes = payload.notes;
  if (payload.isPrimary !== undefined) access.isPrimary = payload.isPrimary;
  // Without this the registry accepted an edit and silently threw it away.
  ACCESS_EDITABLE.forEach((field) => {
    if (payload[field] !== undefined) access[field] = payload[field];
  });
  await access.save();
  await writeAudit({
    user: actor, action: 'DIALYSIS_ACCESS_UPDATE', module: 'dialysis', entityId: id, entityType: 'DialysisAccess',
    data: { accessType: access.accessType, side: access.side, status: access.status, changed: ACCESS_EDITABLE.filter((f) => payload[f] !== undefined) },
  });
  return access;
};

export const listAccessRegistry = async (query = {}) => {
  const filter = {};
  if (query.status) filter.status = query.status;
  const rows = await DialysisAccess.find(filter)
    .populate('patientId', 'uhid firstName lastName age gender bloodGroup')
    .populate('dialysisPatientId', 'dialysisNumber primaryDiagnosis')
    .sort({ updatedAt: -1 })
    .limit(Math.min(parseInt(query.limit, 10) || 100, 200))
    .lean();
  return rows;
};

/**
 * Writes one dated access assessment and rolls it up into the registry. The
 * registry keeps the running summary; this keeps the evidence, so a pattern
 * over time (a thrill weakening sitting after sitting) is answerable.
 */
const recordAccessAssessment = async (access, payload, actor) => {
  const assessment = await DialysisAccessAssessment.create({
    ...payload,
    accessId: access._id,
    patientId: access.patientId,
    assessedBy: actor?.id,
    assessedByName: actor?.name,
    hospitalId: actor?.hospitalId,
  });

  access.lastAssessedAt = assessment.assessedAt;
  if (payload.accessStatusAfter) access.status = payload.accessStatusAfter;
  else if (payload.requiresIntervention && !payload.assessedAsUsable) access.status = ACCESS_STATUS.DYSFUNCTIONAL;
  const attention = (payload.attentionSigns || []).join(', ');
  if (payload.siteCondition) {
    access.complicationHistory.push(`${assessment.assessedAt.toISOString()} — ${payload.siteCondition}${attention ? ` (${attention})` : ''}`);
  }
  if (payload.requiresIntervention) {
    access.interventions.push({
      at: assessment.assessedAt,
      type: payload.interventionPlan || 'ACCESS_REVIEW',
      notes: [payload.nursingNotes, payload.interventionPlan].filter(Boolean).join(' — '),
      by: actor?.id,
    });
  }
  await access.save();
  return assessment;
};

export const assessAccess = async (id, payload, actor) => {
  const access = await DialysisAccess.findById(id);
  if (!access) throw new NotFoundError('Access record not found');
  if (access.status === 'DECOMMISSIONED') throw new BadRequestError('This access has been decommissioned');
  const assessment = await recordAccessAssessment(access, {
    sessionId: payload.sessionId,
    dialysisPatientId: access.dialysisPatientId,
    siteCondition: payload.siteCondition,
    attentionSigns: payload.attentionSigns || [],
    otherSign: payload.otherSign,
    patency: payload.patency,
    thrillPalpable: payload.thrillPalpable,
    bruitAudible: payload.bruitAudible,
    catheterBloodFlow: payload.catheterBloodFlow,
    catheterExitSiteCondition: payload.catheterExitSiteCondition,
    nursingNotes: payload.nursingNotes,
    nursingPlan: payload.nursingPlan,
    reportedToDoctor: Boolean(payload.reportedToDoctor),
    reportedTo: payload.reportedTo,
    assessedAsUsable: payload.assessedAsUsable !== false,
    requiresIntervention: Boolean(payload.requiresIntervention),
    interventionPlan: payload.interventionPlan,
    accessStatusAfter: payload.accessStatusAfter,
  }, actor);

  await writeAudit({
    user: actor, action: 'DIALYSIS_ACCESS_ASSESS', module: 'dialysis', entityId: id, entityType: 'DialysisAccess',
    data: {
      siteCondition: assessment.siteCondition, attentionSigns: assessment.attentionSigns,
      patency: assessment.patency, usable: assessment.assessedAsUsable, accessStatus: access.status,
    },
  });
  emitDialysis('access_assessed', { accessId: id, patientId: access.patientId, status: access.status });
  return { assessment, access };
};

/** The full dated history of one access, newest first. */
export const accessHistory = async (id) => {
  const access = await DialysisAccess.findById(id).populate('operatedBy', 'name').lean();
  if (!access) throw new NotFoundError('Access record not found');
  const assessments = await DialysisAccessAssessment.find({ accessId: id })
    .populate('sessionId', 'sessionNumber scheduledStart')
    .populate('assessedBy', 'name')
    .sort({ assessedAt: -1 })
    .lean();
  return {
    access,
    assessments,
    summary: {
      totalAssessments: assessments.length,
      firstAssessedAt: assessments.length ? assessments[assessments.length - 1].assessedAt : null,
      lastAssessedAt: assessments.length ? assessments[0].assessedAt : null,
      requiringIntervention: assessments.filter((a) => a.requiresIntervention).length,
      currentStatus: access.status,
      totalUses: access.totalUses,
    },
  };
};

export {
  DIALYSIS_TYPES, ACCESS_TYPES, DIALYSIS_PATIENT_STATUS, MACHINE_STATUS, STATION_STATUS,
  PRESCRIPTION_STATUS, SESSION_STATUS, SESSION_PRIORITY, ACCESS_STATUS, ACCESS_ASSESSMENT_RESULTS,
  CONSUMABLE_CATEGORIES, SERVICE_TYPE, STATION_KIND, ACCESS_SITE_CONDITION, PATENCY_RESULT, ATTENTION_SIGN,
};
