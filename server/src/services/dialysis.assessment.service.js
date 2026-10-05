import mongoose from 'mongoose';
import { DialysisAssessment, ASSESSMENT_STATUS, ENCOUNTER_TYPES } from '../models/DialysisAssessment.model.js';
import { DialysisPatient } from '../models/DialysisPatient.model.js';
import { DialysisSession, SESSION_STATUS } from '../models/DialysisSession.model.js';
import { DialysisAccess } from '../models/DialysisAccess.model.js';
import { DialysisPrescription, PRESCRIPTION_STATUS } from '../models/DialysisPrescription.model.js';
import ClinicalNote from '../models/ClinicalNote.model.js';
import { LabResult } from '../models/LabOrder.model.js';
import IpdAdmission, { ADMISSION_STATUS } from '../models/IpdAdmission.model.js';
import OpdVisit from '../models/OpdVisit.model.js';
import MedicationChart from '../models/MedicationChart.model.js';
import Doctor from '../models/Doctor.model.js';
import { generateNumber } from '../utils/numberGenerator.js';
import { prescriptionDefaults, schedulingConfig } from './dialysis.config.service.js';
import { writeAudit } from '../middleware/audit.js';
import { emitDialysis } from './dialysis.emit.js';
import { BadRequestError, NotFoundError } from '../utils/ApiError.js';

const COMPLETED = [SESSION_STATUS.COMPLETED, SESSION_STATUS.BILLED, SESSION_STATUS.CLOSED];

const pad = (n) => String(n).padStart(2, '0');
const datePart = (d) => {
  const dt = d ? new Date(d) : new Date();
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
};
const timePart = (d) => {
  const dt = d ? new Date(d) : new Date();
  return `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
};

const loadRecord = async (payload, session) => {
  const record = await DialysisPatient.findOne({
    $or: [{ _id: payload.dialysisPatientId }, { patientId: payload.patientId }],
  }).session(session || null);
  if (!record) throw new NotFoundError('Dialysis patient not found');
  return record;
};

const requireDoctor = async (doctorId, session) => {
  if (!doctorId) throw new BadRequestError('A nephrologist must sign every assessment');
  const doctor = await Doctor.findById(doctorId).session(session || null).select('_id name specialization active');
  if (!doctor) throw new BadRequestError('Doctor not found — every assessment must be attributed to a real doctor');
  if (doctor.active === false) throw new BadRequestError('An inactive doctor cannot sign a clinical assessment');
  return doctor;
};

const requireEncounter = (type, ref) => {
  if (!ENCOUNTER_TYPES.includes(type)) throw new BadRequestError('A valid encounter type is required on every assessment');
  if ((type === 'IPD' || type === 'OPD') && !ref) {
    throw new BadRequestError(`An ${type} assessment must be linked to its ${type} encounter`);
  }
  return type;
};

// ============================================================
// HISTORY BUNDLE — everything the nephrologist needs on one screen
// ============================================================
export const assessmentContext = async (dialysisPatientId) => {
  const record = await DialysisPatient.findById(dialysisPatientId)
    .populate('patientId', 'uhid firstName lastName gender age dateOfBirth bloodGroup mobile address email')
    .populate('nephrologistId', 'name specialization')
    .populate('referringDoctorId', 'name')
    .populate('insurancePolicyId', 'companyName policyNumber coverageAmount tpaName');
  if (!record) throw new NotFoundError('Dialysis patient not found');

  const patientId = record.patientId?._id;
  const [sessions, access, labs, medications, admissions, visits, activePrescription, assessments] = await Promise.all([
    DialysisSession.find({ patientId }).sort({ sessionDate: -1 }).limit(200).lean(),
    DialysisAccess.find({ patientId }).populate('operatedBy', 'name').sort({ isPrimary: -1, createdAt: -1 }).lean(),
    LabResult.find({ patientId }).sort({ enteredAt: -1 }).limit(30).populate('labTestId', 'name unit referenceRange').lean(),
    MedicationChart.find({ patientId }).sort({ createdAt: -1 }).limit(50).lean(),

    IpdAdmission.find({ patientId }).sort({ admittedAt: -1 }).limit(10).populate('bedId', 'bedNumber').lean(),
    OpdVisit.find({ patientId }).sort({ visitDate: -1 }).limit(10).lean(),
    DialysisPrescription.findOne({ patientId, status: PRESCRIPTION_STATUS.ACTIVE }).sort({ prescribedAt: -1 }).lean(),
    DialysisAssessment.find({ patientId }).sort({ assessmentDate: -1, createdAt: -1 }).limit(25)
      .populate('doctorId', 'name specialization').lean(),
  ]);

  const done = sessions.filter((s) => COMPLETED.includes(s.status));
  const withComp = sessions.filter((s) => (s.complications || []).length > 0);
  const last = done[0] || null;
  const first = done[done.length - 1] || null;

  const complicationMap = new Map();
  for (const s of withComp) {
    for (const c of s.complications || []) {
      const key = c.type;
      const cur = complicationMap.get(key) || { type: c.type, sessions: 0, lastOccurredAt: null, management: [], resolved: true };
      cur.sessions += 1;
      if (!cur.lastOccurredAt || new Date(c.occurredAt) > new Date(cur.lastOccurredAt)) {
        cur.lastOccurredAt = c.occurredAt;
        cur.management = c.management ? [c.management] : [];
        cur.resolved = Boolean(c.resolved);
      } else if (c.management && !cur.management.includes(c.management)) {
        cur.management.push(c.management);
      }
      if (!c.resolved) cur.resolved = false;
      complicationMap.set(key, cur);
    }
  }

  const yearsOnDialysis = first && record.registeredAt
    ? Math.round(((Date.now() - new Date(first.sessionDate).getTime()) / 86400000 / 365) * 10) / 10
    : 0;

  const defaults = await prescriptionDefaults();
  const scheduling = await schedulingConfig();

  return {
    patient: record,
    summary: {
      totalSessions: sessions.length,
      completedSessions: done.length,
      cancelledSessions: sessions.filter((s) => s.status === SESSION_STATUS.CANCELLED).length,
      noShowSessions: sessions.filter((s) => s.status === SESSION_STATUS.NO_SHOW).length,
      complicationSessions: withComp.length,
      complicationTypes: complicationMap.size,
      firstSessionDate: first?.sessionDate || null,
      lastSessionDate: last?.sessionDate || null,
      yearsOnDialysis,
      averageDurationMinutes: done.length ? Math.round(done.reduce((s, x) => s + (x.durationMinutes || 0), 0) / done.length) : 0,
      averageUfDeliveredPct: done.length ? Math.round(done.reduce((s, x) => s + (x.ufDeliveredPct || 0), 0) / done.length) : 0,
    },
    lastSession: last,
    complications: [...complicationMap.values()].sort((a, b) => b.sessions - a.sessions),
    allergies: (record.allergies || []).map((a) => (typeof a === 'string' ? { substance: a, severity: 'UNKNOWN' } : a)),
    comorbidities: (record.comorbidities || []).map((c) => (typeof c === 'string' ? { name: c, controlled: null } : c)),
    currentMedications: (medications || []).map((m) => ({
      name: m.medicineName,
      dose: m.dosage ? `${m.dosage}${m.strength ? ` ${m.strength}` : ''}` : m.dosage,
      frequency: m.frequency || m.frequencyTiming,
      route: m.route,
      indication: m.instructions,
    })).filter((m) => m.name),
    labs: (labs || []).map((l) => ({
      testName: l.labTestId?.name || l.testName,
      value: l.value ?? l.resultValue,
      unit: l.labTestId?.unit || l.unit,
      referenceRange: l.labTestId?.referenceRange || l.referenceRange,
      flag: l.isCritical ? 'CRITICAL' : l.abnormalFlag || 'NORMAL',
      testedAt: l.enteredAt || l.createdAt,
    })),
    access: access || [],
    admissions: admissions || [],
    visits: visits || [],
    activePrescription: activePrescription || null,
    prescriptionDefaults: defaults,
    scheduling,
    previousAssessments: assessments || [],
    doctors: await Doctor.find({ active: true }).select('_id name specialization departmentId').sort({ name: 1 }).lean(),
  };
};

// ============================================================
// CREATE / SIGN
// ============================================================
export const createAssessment = async (payload, actor) => {
  const record = await loadRecord(payload);
  const doctor = await requireDoctor(payload.doctorId || actor?.doctorId);
  const encounterType = requireEncounter(payload.encounterType, payload.encounterId || payload.admissionId || payload.opdVisitId);

  const when = payload.assessmentDate ? new Date(payload.assessmentDate) : new Date();
  if (Number.isNaN(when.getTime())) throw new BadRequestError('Invalid assessment date');
  const time = payload.assessmentTime || timePart(when);

  let encounterNumber = payload.encounterNumber;
  if (encounterType === 'IPD') {
    const admission = payload.admissionId
      ? await IpdAdmission.findById(payload.admissionId)
      : await IpdAdmission.findOne({ patientId: record.patientId, status: { $in: [ADMISSION_STATUS.ADMITTED, ADMISSION_STATUS.TRANSFERRED, ADMISSION_STATUS.DISCHARGE_PLANNED] } });
    if (!admission) throw new BadRequestError('No active admission found to attach this assessment to');
    payload.admissionId = admission._id;
    encounterNumber = admission.admissionNumber;
  } else if (encounterType === 'OPD') {
    const visit = payload.opdVisitId
      ? await OpdVisit.findById(payload.opdVisitId)
      : await OpdVisit.findOne({ patientId: record.patientId, status: { $ne: 'CANCELLED' } }).sort({ visitDate: -1 });
    if (!visit) throw new BadRequestError('No OPD visit found to attach this assessment to');
    payload.opdVisitId = visit._id;
    encounterNumber = visit.visitNumber;
  } else if (encounterType === 'DIALYSIS_UNIT' && payload.sessionId) {
    const session = await DialysisSession.findById(payload.sessionId);
    if (session) encounterNumber = session.sessionNumber;
  }

  if (!payload.clinicalAssessment || typeof payload.clinicalAssessment !== 'object') {
    throw new BadRequestError('A clinical assessment section is required');
  }
  if (!payload.plan || typeof payload.plan !== 'object' || !payload.plan.prescription?.modality) {
    throw new BadRequestError('A plan with at least a dialysis modality is required');
  }

  const previous = await DialysisAssessment.findOne({ patientId: record.patientId })
    .sort({ assessmentDate: -1, version: -1 });
  const version = previous ? (previous.version || 1) + 1 : 1;

  const [assessment] = await DialysisAssessment.create([{
    ...payload,
    assessmentNumber: await generateNumber('NAS', new Date().getFullYear()),
    patientId: record.patientId,
    dialysisPatientId: record._id,
    dialysisNumber: record.dialysisNumber,
    doctorId: doctor._id,
    doctorName: doctor.name,
    assessmentDate: when,
    assessmentTime: time,
    encounterType,
    encounterId: payload.encounterId || payload.admissionId || payload.opdVisitId || payload.sessionId,
    encounterNumber,
    version,
    previousAssessmentId: previous?._id,
    status: payload.status === ASSESSMENT_STATUS.DRAFT ? ASSESSMENT_STATUS.DRAFT : ASSESSMENT_STATUS.FINAL,
    signedAt: payload.status === ASSESSMENT_STATUS.DRAFT ? undefined : new Date(),
    signedBy: payload.status === ASSESSMENT_STATUS.DRAFT ? undefined : actor?.id,
    createdBy: actor?.id,
    hospitalId: actor?.hospitalId,
    branchId: actor?.branchId,
  }]);

  if (assessment.status === ASSESSMENT_STATUS.FINAL && previous && previous.status === ASSESSMENT_STATUS.FINAL) {
    previous.status = ASSESSMENT_STATUS.SUPERSEDED;
    previous.supersededById = assessment._id;
    await previous.save();
  }

  if (payload.admissionId) {
    await ClinicalNote.create({
      admissionId: payload.admissionId,
      patientId: record.patientId,
      noteType: 'ASSESSMENT',
      body: `Nephrology assessment ${assessment.assessmentNumber} (v${assessment.version}) by ${doctor.name} — plan: ${assessment.plan.prescription.modality}, ${assessment.plan.prescription.frequencyPerWeek || '—'}/week, ${assessment.plan.prescription.durationMinutes || '—'} min, UF goal ${assessment.plan.prescription.ultrafiltrationGoalMl ?? '—'} ml. ${assessment.doctorNotes || ''}`.trim(),
      structured: { assessmentId: assessment._id, assessmentNumber: assessment.assessmentNumber, plan: assessment.plan },
      createdBy: actor?.id,
      hospitalId: actor?.hospitalId,
    });
  }

  await writeAudit({
    user: actor, action: 'DIALYSIS_ASSESSMENT', module: 'dialysis', entityId: assessment._id, entityType: 'DialysisAssessment',
    data: {
      assessmentNumber: assessment.assessmentNumber, version: assessment.version, doctor: doctor.name,
      assessmentDate: when, assessmentTime: time, encounterType, encounterNumber, status: assessment.status,
      modality: assessment.plan.prescription.modality,
    },
  });
  emitDialysis('assessment_created', { assessmentId: assessment._id, patientId: record.patientId });
  return getAssessment(assessment._id);
};

export const getAssessment = async (id) => {
  const assessment = await DialysisAssessment.findById(id)
    .populate('patientId', 'uhid firstName lastName gender age bloodGroup mobile')
    .populate('dialysisPatientId', 'dialysisNumber ckdStage primaryDiagnosis')
    .populate('doctorId', 'name specialization')
    .populate('admissionId', 'admissionNumber status')
    .populate('opdVisitId', 'visitNumber status')
    .populate('sessionId', 'sessionNumber status')
    .populate('previousAssessmentId', 'assessmentNumber version assessmentDate')
    .populate('signedBy', 'name username');
  if (!assessment) throw new NotFoundError('Assessment not found');
  return assessment;
};

export const listAssessments = async (query = {}) => {
  const filter = {};
  if (query.patientId) filter.patientId = query.patientId;
  if (query.dialysisPatientId) filter.dialysisPatientId = query.dialysisPatientId;
  if (query.doctorId) filter.doctorId = query.doctorId;
  if (query.encounterType) filter.encounterType = query.encounterType;
  if (query.status) filter.status = query.status;
  if (query.from || query.to) {
    filter.assessmentDate = {};
    if (query.from) filter.assessmentDate.$gte = new Date(query.from);
    if (query.to) filter.assessmentDate.$lte = new Date(`${query.to}T23:59:59`);
  }
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const [total, rows] = await Promise.all([
    DialysisAssessment.countDocuments(filter),
    DialysisAssessment.find(filter)
      .populate('patientId', 'uhid firstName lastName')
      .populate('doctorId', 'name specialization')
      .sort({ assessmentDate: -1, assessmentTime: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);
  return { rows, total, page, limit, pages: Math.ceil(total / limit) || 1 };
};

/** An amendment creates a new signed version; the original is never edited. */
export const amendAssessment = async (id, payload, actor) => {
  const original = await DialysisAssessment.findById(id);
  if (!original) throw new NotFoundError('Assessment not found');
  if (original.status === ASSESSMENT_STATUS.SUPERSEDED) throw new BadRequestError('This assessment has already been superseded');

  const doctor = await requireDoctor(payload.doctorId || original.doctorId);
  const when = payload.assessmentDate ? new Date(payload.assessmentDate) : new Date();

  const [amended] = await DialysisAssessment.create([{
    ...original.toObject(),
    _id: undefined,
    assessmentNumber: await generateNumber('NAS', new Date().getFullYear()),
    doctorId: doctor._id,
    doctorName: doctor.name,
    assessmentDate: when,
    assessmentTime: payload.assessmentTime || timePart(when),
    encounterType: requireEncounter(payload.encounterType || original.encounterType, payload.encounterId || original.encounterId),
    ...payload,
    version: (original.version || 1) + 1,
    previousAssessmentId: original._id,
    amendedFromId: original._id,
    status: ASSESSMENT_STATUS.FINAL,
    signedAt: new Date(),
    signedBy: actor?.id,
    createdBy: actor?.id,
    createdAt: new Date(),
    updatedAt: new Date(),
  }]);

  original.status = ASSESSMENT_STATUS.SUPERSEDED;
  original.supersededById = amended._id;
  await original.save();

  await writeAudit({
    user: actor, action: 'DIALYSIS_ASSESSMENT_AMEND', module: 'dialysis', entityId: amended._id, entityType: 'DialysisAssessment',
    data: { original: original.assessmentNumber, amended: amended.assessmentNumber, version: amended.version },
  });
  return getAssessment(amended._id);
};

export const assessmentVersions = async (id) => {
  const assessment = await DialysisAssessment.findById(id).select('patientId').lean();
  if (!assessment) throw new NotFoundError('Assessment not found');
  return DialysisAssessment.find({ patientId: assessment.patientId })
    .populate('doctorId', 'name specialization')
    .sort({ assessmentDate: 1, version: 1 })
    .lean();
};

export { datePart, timePart };
