import OpdVisit from '../models/OpdVisit.model.js';
import Prescription from '../models/Prescription.model.js';
import Appointment, { APPOINTMENT_STATUS } from '../models/Appointment.model.js';
import VitalRecord from '../models/VitalRecord.model.js';
import VisitDiagnosis, { DIAGNOSIS_STATUS, DIAGNOSIS_TYPES } from '../models/VisitDiagnosis.model.js';
import ClinicalOrder from '../models/ClinicalOrder.model.js';
import ClinicalNote from '../models/ClinicalNote.model.js';
import FollowUp from '../models/FollowUp.model.js';
import VisitEvent from '../models/VisitEvent.model.js';
import Bill from '../models/Bill.model.js';
import Payment from '../models/Payment.model.js';
import Patient from '../models/Patient.model.js';
import ExaminationTemplate from '../models/ExaminationTemplate.model.js';
import DiagnosisMaster from '../models/DiagnosisMaster.model.js';
import { generateNumber, NUMBER_PREFIXES, generateOpdNumber } from '../utils/numberGenerator.js';
import { BadRequestError, NotFoundError } from '../utils/ApiError.js';

export const createOpdVisit = async (payload, actor) => {
  const { patientId, appointmentId } = payload;
  const patient = await Patient.findById(patientId);
  if (!patient) throw new BadRequestError('Patient not found');

  let status = 'IN_PROGRESS';
  let appointment = null;
  if (appointmentId) {
    appointment = await Appointment.findById(appointmentId);
    if (APPOINTMENT_STATUS && appointment && appointment.status === APPOINTMENT_STATUS.COMPLETED) {
      throw new BadRequestError('Appointment already completed');
    }
  }

  const opdNumber = await generateOpdNumber();
  const { heightCm, weightKg, ...restVitals } = payload.vitals || {};
  const bmi = heightCm && weightKg ? (weightKg / Math.pow(heightCm / 100, 2)).toFixed(2) : null;
  const visit = await OpdVisit.create({
    opdNumber,
    patientId,
    appointmentId,
    visitType: payload.visitType || 'NEW',
    chiefComplaint: payload.chiefComplaint,
    historyOfPresentingIllness: payload.historyOfPresentingIllness,
    departmentId: payload.departmentId,
    doctorId: payload.doctorId,
    status,
    vitals: { heightCm, weightKg, bmi, ...restVitals },
    hospitalId: actor?.hospitalId || payload.hospitalId,
    branchId: actor?.branchId || payload.branchId,
    createdBy: actor?.id,
  });

  if (appointment) {
    appointment.status = APPOINTMENT_STATUS.IN_PROGRESS;
    await appointment.save();
  }

  await VisitEvent.create({
    visitId: visit._id,
    patientId,
    visit: visit._id,
    type: 'VISIT_CREATED',
    title: 'OPD visit created',
    happenedAt: new Date(),
    actorId: actor?.id,
    touchedBy: actor?.id,
    host: null,
    branchId: visit.branchId,
  });

  return visit;
};

export const completeOpdVisit = async (id, payload, actor) => {
  const visit = await OpdVisit.findById(id);
  if (!visit) throw new NotFoundError('OPD visit not found');

  const vitals = payload.vitals || {};
  Object.assign(visit, {
    ...payload,
    vitals: { ...vitals, bmi: computeBMI(vitals.heightCm, vitals.weightKg) },
    status: payload.status || 'COMPLETED',
  });
  await visit.save();

  await VisitEvent.create({
    visitId: visit._id,
    patientId: visit.patientId,
    type: 'VISIT_CLOSED',
    title: 'OPD visit completed',
    happenedAt: new Date(),
    actorId: actor?.id,
  });

  if (visit.appointmentId) {
    await Appointment.findByIdAndUpdate(visit.appointmentId, { status: APPOINTMENT_STATUS.COMPLETED, completedAt: new Date() });
  }
  return visit;
};

export const listOpdVisits = async (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const filter = {};
  if (query.patientId) filter.patientId = query.patientId;
  if (query.doctorId) filter.doctorId = query.doctorId;
  if (query.status) filter.status = query.status;
  if (query.from || query.to) {
    filter.visitDate = {};
    if (query.from) filter.visitDate.$gte = new Date(query.from);
    if (query.to) filter.visitDate.$lte = new Date(query.to);
  }

  const [total, visits] = await Promise.all([
    OpdVisit.countDocuments(filter),
    OpdVisit.find(filter)
      .populate('patientId', 'uhid firstName lastName mobile gender photo age')
      .populate('doctorId', 'name specialization')
      .populate('departmentId', 'name')
      .sort({ visitDate: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
  ]);

  const visitIds = visits.map((v) => v._id);
  const billingMap = new Map();
  if (visitIds.length) {
    const agg = await Bill.aggregate([
      { $match: { opdVisitId: { $in: visitIds } } },
      {
        $group: {
          _id: '$opdVisitId',
          billCount: { $sum: 1 },
          totalGross: { $sum: '$grossTotal' },
          totalPaid: { $sum: '$paidAmount' },
          totalDue: { $sum: '$dueAmount' },
          outstandingCount: {
            $sum: { $cond: [{ $and: [{ $gt: ['$dueAmount', 0.01] }, { $ne: ['$status', 'CANCELLED'] }] }, 1, 0] },
          },
        },
      },
    ]);
    agg.forEach((r) => billingMap.set(String(r._id), r));
  }
  const data = visits.map((v) => ({
    ...v.toObject(),
    billing: billingMap.get(String(v._id)) || { billCount: 0, totalGross: 0, totalPaid: 0, totalDue: 0, outstandingCount: 0 },
  }));
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

export const getOpdVisit = async (id) => {
  const visit = await OpdVisit.findById(id)
    .populate('patientId', 'uhid firstName lastName mobile gender dob age bloodGroup photo address allergies medicalHistory')
    .populate('doctorId', 'name specialization qualification')
    .populate('departmentId', 'name')
    .populate('appointmentId');
  if (!visit) throw new NotFoundError('OPD visit not found');
  return visit;
};

export const createPrescription = async (payload, actor, session = null) => {
  const prescription = new Prescription({
    ...payload,
    rxNumber: await generateNumber(NUMBER_PREFIXES.PRESCRIPTION, new Date().getFullYear(), session),
    createdBy: actor?.id,
    hospitalId: actor?.hospitalId || payload.hospitalId,
    branchId: actor?.branchId,
  });
  await prescription.save({ session });
  return prescription;
};

export const listPrescriptions = async (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const filter = {};
  if (query.patientId) filter.patientId = query.patientId;
  if (query.doctorId) filter.doctorId = query.doctorId;
  if (query.isDispensed !== undefined) filter.isDispensed = query.isDispensed === 'true';

  const [total, data] = await Promise.all([
    Prescription.countDocuments(filter),
    Prescription.find(filter)
      .populate('patientId', 'uhid firstName lastName mobile')
      .populate('doctorId', 'name')
      .sort({ prescriptionDate: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
  ]);
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

export const getPrescription = async (id) => {
  const prescription = await Prescription.findById(id)
    .populate('patientId', 'uhid firstName lastName mobile')
    .populate('doctorId', 'name')
    .populate('opdVisitId');
  if (!prescription) throw new NotFoundError('Prescription not found');
  return prescription;
};

export const finalizePrescriptionService = async (prescriptionId, actor) => {
  const prescription = await Prescription.findById(prescriptionId);
  if (!prescription) throw new NotFoundError('Prescription not found');
  if (!prescription.items?.length) throw new BadRequestError('Cannot finalize a prescription without medication items');
  if (prescription.status === 'SIGNED') throw new BadRequestError('Prescription is already signed');
  if (prescription.status === 'DISPENSED') throw new BadRequestError('Dispensed prescription cannot be re-signed');
  if (prescription.status === 'CANCELLED') throw new BadRequestError('Cancelled prescription cannot be signed');

  prescription.status = 'SIGNED';
  prescription.isSigned = true;
  prescription.signedBy = actor?.id;
  prescription.signedAt = new Date();
  await prescription.save();

  const signed = await Prescription.findById(prescriptionId).populate('patientId', 'uhid firstName lastName mobile').populate('doctorId', 'name');
  return signed;
};

export const amendPrescriptionService = async (prescriptionId, payload, actor) => {
  const original = await Prescription.findById(prescriptionId);
  if (!original) throw new NotFoundError('Prescription not found');
  if (original.status !== 'SIGNED') throw new BadRequestError('Only signed prescriptions can be amended');
  if (original.isDispensedLocked) throw new BadRequestError('Prescription is locked for dispensing and cannot be amended');

  const next = (original.amendmentNumber || 0) + 1;
  const amendment = new Prescription({
    rxNumber: original.rxNumber,
    patientId: original.patientId,
    doctorId: original.doctorId,
    opdVisitId: original.opdVisitId,
    admissionId: original.admissionId,
    prescriptionDate: new Date(),
    diagnosis: payload.diagnosis ?? original.diagnosis,
    advice: payload.advice ?? original.advice,
    followUpDate: payload.followUpDate ?? original.followUpDate,
    items: payload.items?.length ? payload.items : original.items,
    amendReason: payload.amendReason,
    amendedFromId: original._id,
    amendmentNumber: next,
    amendmentDate: new Date(),
    createdBy: actor?.id,
    hospitalId: original.hospitalId,
    branchId: original.branchId,
  });

  await Promise.all([amendment.save(), Prescription.updateOne({ _id: original._id }, { status: 'AMENDED' })]);

  const populated = await Prescription.findById(amendment._id).populate('patientId', 'uhid firstName lastName mobile').populate('doctorId', 'name');
  return populated;
};

export const listPrescriptionAmendmentsService = async (prescriptionId) => {
  await Prescription.findById(prescriptionId);
  return Prescription.find({ amendedFromId: prescriptionId })
    .populate('patientId', 'uhid firstName lastName mobile')
    .populate('doctorId', 'name')
    .sort({ amendmentNumber: 1 });
};

const computeBMI = (heightCm, weightKg) => {
  if (!heightCm || !weightKg) return 0;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 100) / 100;
};

export const listVitalsService = async (visitId) =>
  VitalRecord.find({ visitId }).populate('recordedBy', 'firstName lastName').sort({ recordedAt: -1 }).limit(50);

export const recordVitalsService = async (visitId, payload, actor, session = null) => {
  const visit = await OpdVisit.findById(visitId);
  if (!visit) throw new NotFoundError('OPD visit not found');
  const bmi = computeBMI(payload.heightCm, payload.weightKg);
  const vital = await VitalRecord.create(
    [{
      visitId,
      patientId: visit.patientId,
      ...payload,
      bmi: payload.bmi || bmi || undefined,
      recordedBy: actor?.id,
      recordedAt: payload.recordedAt || new Date(),
      source: payload.source || 'MANUAL',
      hospitalId: actor?.hospitalId || visit.hospitalId,
      branchId: actor?.branchId || visit.branchId,
    }],
    { session },
  );
  visit.vitalsStatus = 'COMPLETED';
  await visit.save({ session });
  await VisitEvent.create({ visitId, patientId: visit.patientId, type: 'VITALS_RECORDED', title: 'Vitals recorded — ready for doctor', happenedAt: new Date(), actorId: actor?.id });
  return vital[0];
};

export const listVisitDiagnosesService = async (visitId) => VisitDiagnosis.find({ visitId }).sort({ createdAt: 1 });

export const addVisitDiagnosisService = async (visitId, payload, actor, session = null) => {
  const visit = await OpdVisit.findById(visitId);
  if (!visit) throw new NotFoundError('OPD visit not found');
  const type = payload.type || DIAGNOSIS_TYPES.PRIMARY;
  const diagnosis = await VisitDiagnosis.create(
    [{
      visitId,
      patientId: visit.patientId,
      ...payload,
      type,
      status: payload.status || (type === DIAGNOSIS_TYPES.PROVISIONAL ? DIAGNOSIS_STATUS.PROVISIONAL : DIAGNOSIS_STATUS.CONFIRMED),
      addedBy: actor?.id,
      hospitalId: actor?.hospitalId || visit.hospitalId,
      branchId: actor?.branchId || visit.branchId,
    }],
    { session },
  );
  await VisitEvent.create({ visitId, patientId: visit.patientId, type: 'DIAGNOSIS_ADDED', title: `Diagnosis added: ${payload.name || ''}`, happenedAt: new Date(), actorId: actor?.id });
  return diagnosis[0];
};

export const updateVisitDiagnosisService = async (diagnosisId, payload, actor) => {
  const diagnosis = await VisitDiagnosis.findById(diagnosisId);
  if (!diagnosis) throw new NotFoundError('Visit diagnosis not found');
  Object.assign(diagnosis, payload);
  diagnosis.status = payload.status || diagnosis.status;
  await diagnosis.save();
  await VisitEvent.create({ visitId: diagnosis.visitId, patientId: diagnosis.patientId, type: 'DIAGNOSIS_UPDATED', title: 'Diagnosis updated', happenedAt: new Date(), actorId: actor?.id });
  return diagnosis;
};

export const removeVisitDiagnosisService = async (diagnosisId) => {
  const diagnosis = await VisitDiagnosis.findByIdAndDelete(diagnosisId);
  if (!diagnosis) throw new NotFoundError('Visit diagnosis not found');
  return diagnosis;
};

export const listClinicalOrdersService = async (visitId) => ClinicalOrder.find({ visitId }).sort({ createdAt: 1 });

export const createClinicalOrderService = async (visitId, payload, actor, session = null) => {
  const visit = await OpdVisit.findById(visitId);
  if (!visit) throw new NotFoundError('OPD visit not found');
  const orderNumber = await generateNumber(NUMBER_PREFIXES.LAB_ORDER, new Date().getFullYear(), session);
  const order = await ClinicalOrder.create(
    [{ orderNumber, visitId, patientId: visit.patientId, category: payload.category, name: payload.name, code: payload.code, priority: payload.priority || 'ROUTINE', status: payload.status || 'ORDERED', departmentId: payload.departmentId, instructions: payload.instructions, labOrderId: payload.labOrderId, radiologyOrderId: payload.radiologyOrderId, orderedBy: actor?.id, hospitalId: actor?.hospitalId || visit.hospitalId, branchId: actor?.branchId || visit.branchId }],
    { session },
  );
  await VisitEvent.create({ visitId, patientId: visit.patientId, type: 'ORDER_CREATED', title: `Order: ${payload.name}`, happenedAt: new Date(), actorId: actor?.id });
  return order[0];
};

export const updateClinicalOrderStatusService = async (orderId, payload, actor) => {
  const order = await ClinicalOrder.findById(orderId);
  if (!order) throw new NotFoundError('Clinical order not found');
  order.status = payload.status || order.status;
  await order.save();
  await VisitEvent.create({ visitId: order.visitId, patientId: order.patientId, type: 'ORDER_STATUS_CHANGED', title: `Order ${order.status}`, happenedAt: new Date(), actorId: actor?.id });
  return order;
};

export const listClinicalNotesService = async (visitId) => ClinicalNote.find({ visitId }).sort({ createdAt: 1 });

export const createClinicalNoteService = async (visitId, payload, actor, session = null) => {
  const visit = await OpdVisit.findById(visitId);
  if (!visit) throw new NotFoundError('OPD visit not found');
  const note = await ClinicalNote.create(
    [{ visitId, patientId: visit.patientId, noteType: payload.noteType || 'GENERAL', body: payload.body, createdBy: actor?.id, hospitalId: actor?.hospitalId || visit.hospitalId }],
    { session },
  );
  await VisitEvent.create({ visitId, patientId: visit.patientId, type: 'NOTE_ADDED', title: 'Clinical note added', happenedAt: new Date(), actorId: actor?.id });
  return note[0];
};

export const updateClinicalNoteService = async (noteId, payload, actor) => {
  const note = await ClinicalNote.findById(noteId);
  if (!note) throw new NotFoundError('Clinical note not found');
  Object.assign(note, payload);
  await note.save();
  return note;
};

export const removeClinicalNoteService = async (noteId) => {
  const note = await ClinicalNote.findById(noteId);
  if (!note) throw new NotFoundError('Clinical note not found');
  await ClinicalNote.findByIdAndDelete(noteId);
  return note;
};

export const listFollowUpsService = async (visitId) => FollowUp.find({ visitId }).sort({ date: 1 });

export const listAllFollowUpsService = async (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.doctorId) filter.doctorId = query.doctorId;
  if (query.from || query.to) {
    filter.date = {};
    if (query.from) filter.date.$gte = new Date(query.from);
    if (query.to) filter.date.$lte = new Date(query.to);
  }
  const [total, data] = await Promise.all([
    FollowUp.countDocuments(filter),
    FollowUp.find(filter)
      .populate('patientId', 'uhid firstName lastName mobile gender')
      .populate('doctorId', 'name specialization')
      .populate('visitId', 'opdNumber visitDate')
      .sort({ date: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
  ]);
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

export const scheduleFollowUpService = async (visitId, payload, actor, session = null) => {
  const visit = await OpdVisit.findById(visitId);
  if (!visit) throw new NotFoundError('OPD visit not found');
  const followUpNumber = await generateNumber(NUMBER_PREFIXES.FOLLOWUP, new Date().getFullYear(), session);
  const f = await FollowUp.create(
    [{ followUpNumber, visitId, patientId: visit.patientId, date: payload.date, doctorId: payload.doctorId, departmentId: payload.departmentId, reason: payload.reason, reminderEnabled: payload.reminderEnabled ?? true, status: 'SCHEDULED', hospitalId: actor?.hospitalId || visit.hospitalId, createdById: actor?.id }],
    { session },
  );
  await VisitEvent.create({ visitId, patientId: visit.patientId, type: 'FOLLOWUP_CREATED', title: 'Follow-up scheduled', happenedAt: new Date(), actorId: actor?.id });
  return f[0];
};

export const completeFollowUpService = async (followUpId, payload, actor) => {
  const f = await FollowUp.findById(followUpId);
  if (!f) throw new NotFoundError('Follow-up not found');
  f.status = 'COMPLETED';
  f.completedOn = new Date();
  await f.save();
  await VisitEvent.create({ visitId: f.visitId, patientId: f.patientId, type: 'FOLLOWUP_COMPLETED', title: 'Follow-up completed', happenedAt: new Date(), actorId: actor?.id });
  return f;
};

export const getVisitWorkspaceService = async (visitId) => {
  const [visit, vitals, diagnoses, orders, notes, followUps, examinationTemplates] = await Promise.all([
    getOpdVisit(visitId),
    listVitalsService(visitId),
    listVisitDiagnosesService(visitId),
    listClinicalOrdersService(visitId),
    listClinicalNotesService(visitId),
    listFollowUpsService(visitId),
    listExaminationTemplatesService(),
  ]);
  return { visit, vitals, diagnoses, orders, notes, followUps, examinationTemplates };
};

export const getVisitTimelineService = async (visitId) =>
  VisitEvent.find({ visitId }).sort({ happenedAt: -1 }).limit(100);

export const getPatientClinicalHistoryService = async (patientId) => {
  const patient = await Patient.findById(patientId);
  if (!patient) throw new NotFoundError('Patient not found');
  const [visits, diagnoses, orders, prescriptions] = await Promise.all([
    OpdVisit.find({ patientId })
      .populate('doctorId', 'name specialization')
      .populate('departmentId', 'name')
      .sort({ visitDate: -1 })
      .limit(8),
    VisitDiagnosis.find({ patientId })
      .populate('visitId', 'opdNumber visitDate')
      .sort({ createdAt: -1 })
      .limit(40),
    ClinicalOrder.find({ patientId, category: { $in: ['LAB', 'RADIOLOGY', 'PROCEDURE'] } })
      .populate('visitId', 'opdNumber visitDate')
      .sort({ orderedAt: -1 })
      .limit(40),
    Prescription.find({ patientId })
      .populate('doctorId', 'name')
      .populate('opdVisitId', 'opdNumber')
      .sort({ prescriptionDate: -1 })
      .limit(6),
  ]);
  return { visits, diagnoses, orders, prescriptions, allergies: normalizeStringList(patient.allergies), medicalHistory: normalizeStringList(patient.medicalHistory) };
};

const normalizeStringList = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  return String(value).split(',').map((s) => s.trim()).filter(Boolean);
};

export const getVisitBillingService = async (visitId) => {
  const bills = await Bill.find({ opdVisitId: visitId })
    .populate('patientId', 'uhid firstName lastName')
    .populate('doctorId', 'name')
    .populate('departmentId', 'name')
    .populate('createdBy', 'firstName lastName')
    .sort({ billDate: 1 });
  const billIds = bills.map((b) => b._id);
  const payments = billIds.length
    ? await Payment.find({ billId: { $in: billIds } })
        .populate('receivedBy', 'firstName lastName')
        .populate('billId', 'billNumber')
        .sort({ paidAt: 1 })
    : [];

  const summary = bills.reduce(
    (acc, b) => {
      acc.billCount += 1;
      acc.totalGross += b.grossTotal || 0;
      acc.totalPaid += b.paidAmount || 0;
      acc.totalDue += b.dueAmount || 0;
      if (b.status !== 'CANCELLED' && (b.dueAmount || 0) > 0.01) acc.outstandingCount += 1;
      return acc;
    },
    { billCount: 0, totalGross: 0, totalPaid: 0, totalDue: 0, outstandingCount: 0 },
  );

  return { bills, payments, summary };
};

export const closeVisitService = async (visitId, payload, actor) => {
  const visit = await OpdVisit.findById(visitId);
  if (!visit) throw new NotFoundError('OPD visit not found');
  visit.status = 'COMPLETED';
  visit.closeNotes = payload.closeNotes || visit.closeNotes;
  await visit.save();
  await VisitEvent.create({ visitId, patientId: visit.patientId, type: 'VISIT_CLOSED', title: 'Visit closed', happenedAt: new Date(), actorId: actor?.id });
  return visit;
};

export const referVisitService = async (visitId, payload, actor) => {
  const visit = await OpdVisit.findById(visitId);
  if (!visit) throw new NotFoundError('OPD visit not found');
  visit.status = 'REFERRED';
  visit.referral = payload;
  await visit.save();
  await VisitEvent.create({ visitId, patientId: visit.patientId, type: 'VISIT_REFERRED', title: `Referred to ${payload.toDoctor || payload.toDepartment || 'another doctor'}`, happenedAt: new Date(), actorId: actor?.id });
  return visit;
};

export const admitVisitService = async (visitId, payload, actor) => {
  const visit = await OpdVisit.findById(visitId);
  if (!visit) throw new NotFoundError('OPD visit not found');
  visit.status = 'ADMITTED';
  visit.admission = payload;
  await visit.save();
  await VisitEvent.create({ visitId, patientId: visit.patientId, type: 'VISIT_ADMITTED', title: 'Visit admitted to ward', happenedAt: new Date(), actorId: actor?.id });
  return visit;
};

/* ---------------------------------------------------------------------------
 * Clinical examination templates (configurable per specialty)
 * ------------------------------------------------------------------------- */
export const listExaminationTemplatesService = async ({ includeInactive = false, specialty } = {}) => {
  const q = { ...(includeInactive ? {} : { isActive: true }), ...(specialty ? { specialty } : {}) };
  return ExaminationTemplate.find(q).sort({ specialty: 1, name: 1 });
};

export const createExaminationTemplateService = async (payload, actor) => {
  const existing = await ExaminationTemplate.findOne({ name: payload.name, ...(actor?.hospitalId ? { hospitalId: actor.hospitalId } : {}) });
  if (existing) throw new BadRequestError('An examination template with this name already exists');
  return ExaminationTemplate.create({
    ...payload,
    isActive: payload.isActive ?? true,
    hospitalId: actor?.hospitalId,
    branchId: actor?.branchId,
    createdBy: actor?.id,
  });
};

export const updateExaminationTemplateService = async (id, payload) => {
  const template = await ExaminationTemplate.findById(id);
  if (!template) throw new NotFoundError('Examination template not found');
  Object.assign(template, payload);
  await template.save();
  return template;
};

export const deleteExaminationTemplateService = async (id) => {
  const template = await ExaminationTemplate.findByIdAndDelete(id);
  if (!template) throw new NotFoundError('Examination template not found');
  return template;
};

/* ---------------------------------------------------------------------------
 * Diagnosis search — master dictionary + the patient's own previous diagnoses
 * ------------------------------------------------------------------------- */
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const searchDiagnosesService = async ({ q = '', patientId } = {}) => {
  const term = q.trim();
  const termCond = term
    ? { $or: [{ name: { $regex: escapeRegex(term), $options: 'i' } }, { icd10Code: { $regex: escapeRegex(term), $options: 'i' } }, { synonyms: { $regex: escapeRegex(term), $options: 'i' } }] }
    : {};
  const previousCond = { ...(patientId ? { patientId } : {}), ...(term ? termCond : {}) };
  const [master, previous] = await Promise.all([
    DiagnosisMaster.find({ ...termCond, isActive: true }).sort({ name: 1 }).limit(8),
    VisitDiagnosis.find(previousCond).populate('visitId', 'opdNumber visitDate').populate('addedBy', 'firstName lastName').sort({ createdAt: -1 }).limit(patientId ? 15 : 8),
  ]);
  return { master, previous };
};

/* ---------------------------------------------------------------------------
 * Seeders — default examination templates per specialty + diagnosis dictionary
 * ------------------------------------------------------------------------- */
const EXAM_SELECTS = {
  presence: { type: 'select', options: ['Present', 'Absent'] },
  normalabnormal: { type: 'select', options: ['Normal', 'Abnormal'] },
};

const baseExamSections = (extras = {}) => [
  {
    key: 'general',
    title: 'General Examination',
    order: 1,
    fields: [
      { key: 'condition', label: 'General condition', type: 'select', options: ['Alert & oriented', 'Drowsy', 'Distressed', 'Conscious, disoriented'] },
      { key: 'pallor', label: 'Pallor', ...EXAM_SELECTS.presence },
      { key: 'icterus', label: 'Icterus', ...EXAM_SELECTS.presence },
      { key: 'cyanosis', label: 'Cyanosis', ...EXAM_SELECTS.presence },
      { key: 'clubbing', label: 'Clubbing', ...EXAM_SELECTS.presence },
      { key: 'lymphadenopathy', label: 'Lymphadenopathy', ...EXAM_SELECTS.presence },
      { key: 'oedema', label: 'Oedema', ...EXAM_SELECTS.presence },
      { key: 'notes', label: 'General examination notes', type: 'textarea', placeholder: 'Build, nutrition, gait…' },
    ],
  },
  {
    key: 'system',
    title: 'System Examination',
    order: 2,
    fields: [
      { key: 'notes', label: 'System-wise findings', type: 'textarea', placeholder: 'CVS, RS, CNS, P/A — positive findings per system…' },
      ...(extras.system || []),
    ],
  },
  {
    key: 'physical',
    title: 'Physical Examination',
    order: 3,
    fields: [
      { key: 'build', label: 'Build / habitus', type: 'text' },
      { key: 'gait', label: 'Gait & posture', type: 'text' },
      { key: 'notes', label: 'Physical findings', type: 'textarea' },
      ...(extras.physical || []),
    ],
  },
  {
    key: 'vitalsSummary',
    title: 'Vitals Summary',
    order: 4,
    fields: [
      { key: 'vitals', label: 'Latest vitals', type: 'vitals' },
      { key: 'comments', label: 'Vitals comments / trends', type: 'textarea', placeholder: 'Trends, abnormal readings, need for repeat…' },
    ],
  },
  {
    key: 'findings',
    title: 'Clinical Findings',
    order: 5,
    fields: [
      { key: 'notes', label: 'Findings / impression', type: 'textarea', placeholder: 'Salient positive & negative findings…' },
      ...(extras.findings || []),
    ],
  },
];

const EXAM_SPECIALTY_EXTRAS = {
  'General Medicine': {},
  'Cardiology': {
    system: [
      { key: 'jvp', label: 'JVP', ...EXAM_SELECTS.normalabnormal },
      { key: 'pulse', label: 'Pulse character', type: 'select', options: ['Normal', 'Weak', 'Collapsing', 'Jerky'] },
      { key: 'heartSounds', label: 'Heart sounds', type: 'select', options: ['Normal', 'Added sounds', 'Muffled'] },
      { key: 'murmur', label: 'Murmur', type: 'textarea', placeholder: 'Grade / site / radiation' },
    ],
  },
  'Orthopaedics': {
    system: [
      { key: 'deformity', label: 'Deformity / posture', type: 'textarea' },
      { key: 'rangeOfMotion', label: 'Range of motion', type: 'select', options: ['Full', 'Restricted', 'Painful', 'Fixed'] },
      { key: 'power', label: 'Muscle power', type: 'select', options: ['5/5', '4/5', '3/5', '2/5', '1/5', '0/5'] },
      { key: 'tenderness', label: 'Tenderness', ...EXAM_SELECTS.presence },
    ],
  },
  'Paediatrics': {
    physical: [
      { key: 'weightForAge', label: 'Weight-for-age', type: 'select', options: ['Normal', 'Wasted', 'Severely wasted'] },
      { key: 'heightForAge', label: 'Height-for-age', type: 'select', options: ['Normal', 'Stunted'] },
      { key: 'developmental', label: 'Developmental milestones', type: 'textarea' },
      { key: 'immunization', label: 'Immunization status', type: 'select', options: ['Up-to-date', 'Partial', 'Unknown'] },
    ],
  },
  'Dermatology': {
    system: [
      { key: 'lesionType', label: 'Primary lesion', type: 'select', options: ['Macule', 'Papule', 'Nodule', 'Plaque', 'Vesicle', 'Bulla', 'Pustule', 'Ulcer'] },
      { key: 'distribution', label: 'Distribution', type: 'select', options: ['Localised', 'Dermatomal', 'Symmetrical', 'Asymmetrical', 'Generalised'] },
      { key: 'morphology', label: 'Morphology / scaling', type: 'textarea' },
    ],
  },
  'ENT': {
    system: [
      { key: 'pinnaAuditory', label: 'Pinna & auditory canal', type: 'textarea' },
      { key: 'tympanicMembrane', label: 'Tympanic membrane', type: 'select', options: ['Intact', 'Perforated', 'Inflamed', 'Retracted'] },
      { key: 'hearing', label: 'Hearing', type: 'select', options: ['Normal', 'Reduced — conductive', 'Reduced — sensorineural'] },
      { key: 'nasal', label: 'Nasal cavity / septum', type: 'textarea' },
      { key: 'throat', label: 'Oropharynx / tonsils', type: 'textarea' },
    ],
  },
  'Ophthalmology': {
    system: [
      { key: 'visualAcuity', label: 'Visual acuity', type: 'text', placeholder: 'e.g. 6/6, 6/36' },
      { key: 'pupils', label: 'Pupils', type: 'select', options: ['Normal', 'Reactive', 'Fixed', 'Anisocoria'] },
      { key: 'anteriorSegment', label: 'Anterior segment', type: 'textarea' },
      { key: 'lens', label: 'Lens', type: 'select', options: ['Clear', 'Nuclear sclerosis', 'Cataract', 'Pseudophakia', 'Aphakia'] },
      { key: 'fundus', label: 'Fundus', type: 'textarea' },
    ],
  },
  'Gynaecology': {
    system: [
      { key: 'lmp', label: 'LMP', type: 'text', placeholder: 'DD/MM/YYYY' },
      { key: 'perSpeculum', label: 'Per speculum', type: 'textarea' },
      { key: 'perVaginal', label: 'Per vaginal', type: 'textarea' },
      { key: 'pelvicExam', label: 'Pelvic / abdominal exam', type: 'textarea' },
    ],
  },
  'Dental': {
    system: [
      { key: 'oralHygiene', label: 'Oral hygiene', type: 'select', options: ['Good', 'Fair', 'Poor'] },
      { key: 'occlusion', label: 'Occlusion', type: 'select', options: ['Normal', 'Class I', 'Class II', 'Class III'] },
      { key: 'caries', label: 'Caries', type: 'select', options: ['None', '1-3 lesions', 'Multiple'] },
      { key: 'periodontal', label: 'Periodontal status', type: 'select', options: ['Healthy', 'Gingivitis', 'Periodontitis'] },
      { key: 'mucosaTeeth', label: 'Mucosa, teeth & restoration', type: 'textarea' },
    ],
  },
  'Urology': {
    system: [
      { key: 'renalAngle', label: 'Renal angle tenderness', ...EXAM_SELECTS.presence },
      { key: 'bladder', label: 'Bladder / suprapubic', type: 'textarea' },
      { key: 'digitalRectal', label: 'DRE / prostate', type: 'textarea' },
      { key: 'genital', label: 'Genital examination', type: 'textarea' },
    ],
  },
};

export const seedExaminationTemplates = async () => {
  await Promise.all(
    Object.entries(EXAM_SPECIALTY_EXTRAS).map(async ([specialty, extras]) => {
      const name = `${specialty} — Clinical Examination`;
      await ExaminationTemplate.updateOne(
        { name },
        {
          $setOnInsert: {
            name,
            specialty,
            description: `Default ${specialty} clinical-examination template`,
            sections: baseExamSections(extras),
            isActive: true,
          },
        },
        { upsert: true },
      );
    }),
  );
};

const DIAGNOSIS_MASTER_SEED = [
  { name: 'Essential (primary) hypertension', icd10Code: 'I10', category: 'General Medicine' },
  { name: 'Type 2 diabetes mellitus', icd10Code: 'E11.9', category: 'General Medicine' },
  { name: 'Acute upper respiratory tract infection', icd10Code: 'J06.9', category: 'General Medicine' },
  { name: 'Acute pharyngitis', icd10Code: 'J02.9', category: 'General Medicine' },
  { name: 'Acute gastroenteritis', icd10Code: 'A09', category: 'General Medicine', synonyms: ['Diarrhoea', 'Loose stools'] },
  { name: 'Gastro-oesophageal reflux disease', icd10Code: 'K21.9', category: 'General Medicine', synonyms: ['GERD', 'Reflux'] },
  { name: 'Iron deficiency anaemia', icd10Code: 'D50.9', category: 'General Medicine' },
  { name: 'Community-acquired pneumonia', icd10Code: 'J18.9', category: 'General Medicine' },
  { name: 'Bronchial asthma', icd10Code: 'J45.9', category: 'General Medicine' },
  { name: 'Urinary tract infection', icd10Code: 'N39.0', category: 'General Medicine', synonyms: ['UTI'] },
  { name: 'Hypothyroidism', icd10Code: 'E03.9', category: 'General Medicine' },
  { name: 'Hyperthyroidism', icd10Code: 'E05.9', category: 'General Medicine' },
  { name: 'Migraine', icd10Code: 'G43.9', category: 'Neurology' },
  { name: 'Depression', icd10Code: 'F32.9', category: 'Psychiatry' },
  { name: 'Generalised anxiety disorder', icd10Code: 'F41.9', category: 'Psychiatry' },
  { name: 'Acute myocardial infarction', icd10Code: 'I21.9', category: 'Cardiology' },
  { name: 'Congestive cardiac failure', icd10Code: 'I50.9', category: 'Cardiology', synonyms: ['CCF', 'Heart failure'] },
  { name: 'Atrial fibrillation', icd10Code: 'I48', category: 'Cardiology' },
  { name: 'Osteoarthritis (knee)', icd10Code: 'M17.9', category: 'Orthopaedics' },
  { name: 'Mechanical low back pain', icd10Code: 'M54.5', category: 'Orthopaedics' },
  { name: 'Fracture of radius', icd10Code: 'S52.5', category: 'Orthopaedics', synonyms: ['Wrist fracture'] },
  { name: 'Sprain of ankle', icd10Code: 'S93.4', category: 'Orthopaedics' },
  { name: 'Atopic dermatitis', icd10Code: 'L20.9', category: 'Dermatology', synonyms: ['Eczema'] },
  { name: 'Psoriasis', icd10Code: 'L40.9', category: 'Dermatology' },
  { name: 'Tinea corporis', icd10Code: 'B35.4', category: 'Dermatology' },
  { name: 'Otitis media (suppurative)', icd10Code: 'H66.9', category: 'ENT' },
  { name: 'Allergic rhinitis', icd10Code: 'J30.4', category: 'ENT' },
  { name: 'Tonsillitis', icd10Code: 'J03.9', category: 'ENT' },
  { name: 'Conjunctivitis', icd10Code: 'H10.9', category: 'Ophthalmology' },
  { name: 'Cataract', icd10Code: 'H26.9', category: 'Ophthalmology' },
  { name: 'Refractive error', icd10Code: 'H52.0', category: 'Ophthalmology' },
  { name: 'Polycystic ovary syndrome', icd10Code: 'E28.2', category: 'Gynaecology', synonyms: ['PCOS'] },
  { name: 'Dysmenorrhoea', icd10Code: 'N94.6', category: 'Gynaecology' },
  { name: 'Leiomyoma of uterus', icd10Code: 'D25.9', category: 'Gynaecology', synonyms: ['Fibroid'] },
  { name: 'Dental caries', icd10Code: 'K02.9', category: 'Dental' },
  { name: 'Gingivitis', icd10Code: 'K05.1', category: 'Dental' },
  { name: 'Renal calculus', icd10Code: 'N20.0', category: 'Urology', synonyms: ['Kidney stone'] },
  { name: 'Benign prostatic hyperplasia', icd10Code: 'N40', category: 'Urology', synonyms: ['BPH'] },
  { name: 'Acute pyelonephritis', icd10Code: 'N10', category: 'Urology' },
  { name: 'Cellulitis', icd10Code: 'L03.9', category: 'General Medicine' },
  { name: 'Wound, lower limb', icd10Code: 'S81.9', category: 'General Medicine', synonyms: ['Laceration'] },
  { name: 'Dengue fever', icd10Code: 'A90', category: 'General Medicine', synonyms: ['Dengue'] },
  { name: 'Typhoid fever', icd10Code: 'A01.0', category: 'General Medicine', synonyms: ['Enteric fever'] },
];

export const seedDiagnosisMaster = async () => {
  await Promise.all(
    DIAGNOSIS_MASTER_SEED.map(async (d) => {
      await DiagnosisMaster.updateOne({ name: d.name }, { $setOnInsert: { ...d, isActive: true } }, { upsert: true });
    }),
  );
};
