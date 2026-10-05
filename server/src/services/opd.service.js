import OpdVisit, {
  OPD_VISIT_STATUS,
  canTransitionOpdVisit,
  OPD_OPEN_STATES,
  OPD_CLOSED_STATES,
  OPD_STOOD_DOWN_STATES,
} from '../models/OpdVisit.model.js';
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
import Counter from '../models/Counter.model.js';
import { BadRequestError, NotFoundError } from '../utils/ApiError.js';

/* ---------------------------------------------------------------------------
 * Queue tokens
 * ------------------------------------------------------------------------- */
const padToken = (n) => String(n).padStart(3, '0');

export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Issue the next queue token for a doctor on a given day.
 *
 * Derived by incrementing a counter row rather than by reading max(tokenSeq) and
 * adding one: two clerks pressing "register" at the same time would otherwise
 * both read the same max and hand two patients the same number. $inc on a unique
 * counter is atomic, so the numbers can never collide.
 */
export const issueQueueToken = async (doctorId, when = new Date(), session = null) => {
  const tokenDate = dayKey(when);
  const key = `OPD_QUEUE_${doctorId || 'GENERAL'}_${tokenDate}`;
  const counter = await Counter.findOneAndUpdate(
    { key },
    {
      $inc: { seq: 1 },
      // Counter requires these; supplying them keeps the atomic $inc usable
      // without a second read.
      $setOnInsert: { prefix: 'OPDQ', year: Number(tokenDate.slice(0, 4)) },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).session(session || null);
  // Named tokenSeq to match the model field, so a caller cannot destructure a
  // non-existent key and silently persist an undefined queue position.
  return { tokenSeq: counter.seq, tokenDate, queueToken: `T-${padToken(counter.seq)}` };
};

const appendStatusHistory = (visit, from, to, actor, note) => {
  visit.statusHistory.push({ from, to, at: new Date(), actorId: actor?.id, note });
  visit.markModified('statusHistory');
};

/**
 * Move a visit between queue states, refusing anything the state machine does
 * not allow. Centralised so the transition and its audit entry cannot drift
 * apart, and so a closed visit cannot be silently reopened by any caller.
 */
export const transitionOpdVisit = async (visit, to, actor, note) => {
  const from = visit.status;
  if (!Object.values(OPD_VISIT_STATUS).includes(to)) {
    throw new BadRequestError(`Unknown OPD status: ${to}`);
  }
  // A no-op transition is treated as an error rather than a silent success:
  // these actions are all user-initiated, so from === to means a double submit
  // or a stale screen, and quietly returning hides it instead of surfacing it.
  if (from === to) {
    throw new BadRequestError(`Visit is already ${to.toLowerCase()}`);
  }
  if (!canTransitionOpdVisit(from, to)) {
    const legal = Object.entries({
      [from]: (await import('../models/OpdVisit.model.js')).OPD_VISIT_TRANSITIONS[from],
    })[0][1];
    throw new BadRequestError(
      `Cannot move a visit from ${from} to ${to}` + (legal?.length ? ` (allowed: ${legal.join(', ')})` : ' (this visit is already closed)'),
    );
  }

  visit.status = to;
  const now = new Date();
  if (to === OPD_VISIT_STATUS.CALLED) {
    visit.calledAt = now;
    visit.calledBy = actor?.id;
  }
  if (to === OPD_VISIT_STATUS.IN_CONSULTATION && !visit.consultStartedAt) visit.consultStartedAt = now;
  if ([OPD_VISIT_STATUS.COMPLETED, OPD_VISIT_STATUS.REFERRED, OPD_VISIT_STATUS.ADMITTED].includes(to)) {
    visit.consultEndedAt = visit.consultEndedAt || now;
  }
  if (to === OPD_VISIT_STATUS.NO_SHOW) visit.noShowMarkedAt = now;
  appendStatusHistory(visit, from, to, actor, note);

  await visit.save();
  await VisitEvent.create({
    visitId: visit._id,
    patientId: visit.patientId,
    type: to === OPD_VISIT_STATUS.NO_SHOW ? 'VISIT_NO_SHOW' : `VISIT_${to}`,
    title: `OPD status: ${from} -> ${to}`,
    happenedAt: now,
    actorId: actor?.id,
  });
  return visit;
};

export const createOpdVisit = async (payload, actor) => {
  const { patientId, appointmentId } = payload;
  const patient = await Patient.findById(patientId);
  if (!patient) throw new BadRequestError('Patient not found');

  let appointment = null;
  if (appointmentId) {
    appointment = await Appointment.findById(appointmentId);
    if (!appointment) throw new BadRequestError('Appointment not found');
    if (appointment.status === APPOINTMENT_STATUS.COMPLETED) {
      throw new BadRequestError('Appointment already completed');
    }
    if (String(appointment.patientId) !== String(patientId)) {
      // Registering someone else against a booked slot is how a visit ends up
      // filed under the wrong patient, so refuse rather than silently ignore.
      throw new BadRequestError('Appointment belongs to a different patient');
    }
    if (appointment.doctorId && !payload.doctorId) {
      payload.doctorId = String(appointment.doctorId);
    }
  }

  // One live visit per patient per doctor per day. A patient who genuinely needs
  // a second opinion, or a follow-up the same day, is a real scenario - so the
  // block is scoped to an unfinished visit, not to the patient forever.
  const tokenDate = dayKey();
  const duplicate = await OpdVisit.findOne({
    patientId,
    tokenDate,
    status: { $in: [OPD_VISIT_STATUS.WAITING, OPD_VISIT_STATUS.CALLED, OPD_VISIT_STATUS.IN_CONSULTATION] },
  }).select('opdNumber status doctorId');
  if (duplicate) {
    throw new BadRequestError(
      `Patient already has an unfinished OPD visit today (${duplicate.opdNumber}, ${duplicate.status.toLowerCase().replace('_', ' ')}). ` +
        'Complete or cancel it before registering again.',
    );
  }

  const opdNumber = await generateOpdNumber();
  const { queueToken, tokenSeq } = await issueQueueToken(payload.doctorId);
  const { heightCm, weightKg, ...restVitals } = payload.vitals || {};
  const bmi = heightCm && weightKg ? (weightKg / Math.pow(heightCm / 100, 2)).toFixed(2) : null;
  const visit = await OpdVisit.create({
    opdNumber,
    queueToken,
    tokenSeq,
    tokenDate,
    checkedInAt: new Date(),
    patientId,
    appointmentId,
    visitType: payload.visitType || 'NEW',
    chiefComplaint: payload.chiefComplaint,
    historyOfPresentingIllness: payload.historyOfPresentingIllness,
    departmentId: payload.departmentId,
    doctorId: payload.doctorId,
    status: OPD_VISIT_STATUS.WAITING,
    // Seeded as part of the insert: a push after create() only mutates the
    // in-memory doc, so the opening WAITING step never reached the timeline.
    statusHistory: [
      {
        from: null,
        to: OPD_VISIT_STATUS.WAITING,
        at: new Date(),
        actorId: actor?.id,
        note: `Token ${queueToken}`,
      },
    ],
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
    title: `OPD visit created - token ${queueToken}`,
    happenedAt: new Date(),
    actorId: actor?.id,
    touchedBy: actor?.id,
    host: null,
    branchId: visit.branchId,
  });

  return visit;
};

/**
 * Fields a clinician may write while completing a visit. Anything not listed is
 * ignored, because the old implementation spread the raw request body straight
 * onto the document - which let a caller move a visit to a different patient,
 * rewrite its opdNumber, or touch admissionId/status fields by including them.
 * Identity, queue position and billing links are never client-writable.
 */
const COMPLETABLE_FIELDS = [
  'visitType',
  'chiefComplaint',
  'historyOfPresentingIllness',
  'pastHistory',
  'pastMedicalHistory',
  'pastSurgicalHistory',
  'familyHistory',
  'personalHistory',
  'medicationHistory',
  'allergies',
  'examination',
  'diagnosis',
  'treatmentPlan',
  'advice',
  'followUpDate',
  'closeNotes',
];

export const completeOpdVisit = async (id, payload, actor) => {
  const visit = await OpdVisit.findById(id);
  if (!visit) throw new NotFoundError('OPD visit not found');

  // A clinical save is a note edit, so it is only blocked once the visit has
  // actually left the department. WAITING / CALLED / IN_CONSULTATION are all
  // still live, and refusing edits merely because the patient is in the waiting
  // room would stop the clinician recording anything on arrival.
  const UNEDITABLE = [...OPD_CLOSED_STATES, ...OPD_STOOD_DOWN_STATES];
  if (UNEDITABLE.includes(visit.status)) {
    throw new BadRequestError(`Visit is already ${visit.status.toLowerCase()} and can no longer be edited`);
  }

  const vitals = payload.vitals || {};
  for (const field of COMPLETABLE_FIELDS) {
    if (payload[field] !== undefined) visit[field] = payload[field];
  }
  visit.vitals = { ...visit.vitals, ...vitals, bmi: computeBMI(vitals.heightCm ?? visit.vitals?.heightCm, vitals.weightKg ?? visit.vitals?.weightKg) };
  if (Object.keys(vitals).length) visit.vitalsStatus = 'COMPLETED';
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

/**
 * Default order is by token within a doctor, which is the order the waiting room
 * is actually served in. Sorting by visitDate instead would show the newest
 * registration first and hide whoever has waited longest.
 */
const queueSortFor = (query) => {
  if (query.sort === 'wait') return { checkedInAt: 1 };
  if (query.sort === 'recent') return { visitDate: -1 };
  return { tokenSeq: 1, visitDate: 1 };
};

export const listOpdVisits = async (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const filter = {};
  if (query.patientId) filter.patientId = query.patientId;
  if (query.doctorId) filter.doctorId = query.doctorId;
  if (query.status) filter.status = { $in: String(query.status).split(',').filter(Boolean) };
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
      .sort(queueSortFor(query))
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
    // Computed per request so a stale stored value can never mislead the desk.
    waitingMins: v.status === OPD_VISIT_STATUS.WAITING ? minutesBetween(v.checkedInAt || v.visitDate) : null,
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
  if (payload.closeNotes !== undefined) visit.closeNotes = payload.closeNotes;
  await transitionOpdVisit(visit, OPD_VISIT_STATUS.COMPLETED, actor, payload.closeNotes);
  return visit;
};

export const referVisitService = async (visitId, payload, actor) => {
  const visit = await OpdVisit.findById(visitId);
  if (!visit) throw new NotFoundError('OPD visit not found');
  if (!payload.toDoctor && !payload.toDepartment) {
    throw new BadRequestError('A referral needs a destination doctor or department');
  }
  // Set before the transition and saved by it, so a rejected move cannot leave
  // a referral recorded against a visit that never became REFERRED.
  visit.referral = { ...payload, referredAt: new Date() };
  await transitionOpdVisit(visit, OPD_VISIT_STATUS.REFERRED, actor, payload.reason);
  return visit;
};

export const admitVisitService = async (visitId, payload, actor) => {
  const visit = await OpdVisit.findById(visitId);
  if (!visit) throw new NotFoundError('OPD visit not found');
  // An admission with nowhere to put the patient is not an admission. Mirrors
  // the referral destination check.
  if (!payload.ward && !payload.bed && !payload.bedId && !payload.ipdAdmissionId) {
    throw new BadRequestError('An admission needs a ward or bed');
  }
  visit.admission = { ...payload, admittedAt: new Date() };
  await transitionOpdVisit(visit, OPD_VISIT_STATUS.ADMITTED, actor, payload.reason);
  return visit;
};

/* ---------------------------------------------------------------------------
 * Queue board
 * ------------------------------------------------------------------------- */
/** Minutes between two moments; negative differences are clamped to 0. */
const minutesBetween = (from, to = new Date()) =>
  from ? Math.max(0, Math.round((to - from) / 60000)) : null;

/**
 * The front desk's view: who is waiting, who has been called, who is inside.
 * Wait time is derived here rather than stored so it can never go stale.
 */
/**
 * Move any pre-queue visits onto the current lifecycle.
 *
 * OPD used to have a single active status, IN_PROGRESS. That value is no longer
 * in the enum and no transition accepts it, so an unmigrated visit could be
 * opened but never closed, referred or admitted - it was stuck for good.
 *
 * IN_CONSULTATION is the only target that keeps it finishable. Mapping to
 * WAITING would drop it into a queue it was never issued a token for.
 *
 * Idempotent, so it runs on every boot like the other bootstrap steps and is a
 * no-op once the database is clean. Tokens are deliberately not back-dated:
 * a visit that predates the queue must not consume a number that was never
 * handed out, and leaving tokenSeq absent keeps these rows off today's board
 * (which filters on tokenDate) without breaking the partial unique index.
 *
 * @returns {Promise<number>} how many visits were migrated
 */
export const migrateLegacyOpdVisits = async () => {
  const legacy = await OpdVisit.find({ status: 'IN_PROGRESS' }).select('_id checkedInAt visitDate createdAt').lean();
  if (!legacy.length) return 0;

  const now = new Date();
  const ops = legacy.map((visit) => ({
    updateOne: {
      filter: { _id: visit._id, status: 'IN_PROGRESS' },
      update: {
        $set: {
          status: OPD_VISIT_STATUS.IN_CONSULTATION,
          consultStartedAt: visit.checkedInAt || visit.visitDate || visit.createdAt,
        },
        $push: {
          statusHistory: {
            from: null,
            to: OPD_VISIT_STATUS.IN_CONSULTATION,
            at: now,
            note: 'Migrated from IN_PROGRESS; no queue token was ever issued for this visit',
          },
        },
      },
    },
  }));

  const res = await OpdVisit.bulkWrite(ops, { ordered: false });
  return res.modifiedCount || 0;
};

export const getQueueBoardService = async ({ doctorId, departmentId, date } = {}) => {
  const tokenDate = date || dayKey();
  const filter = { tokenDate, status: { $in: OPD_OPEN_STATES } };
  if (doctorId) filter.doctorId = doctorId;
  if (departmentId) filter.departmentId = departmentId;

  const visits = await OpdVisit.find(filter)
    .populate('patientId', 'uhid firstName lastName gender age')
    .populate('doctorId', 'name specialization')
    .sort({ status: 1, tokenSeq: 1 });

  const now = new Date();
  const rows = visits.map((v) => ({
    _id: v._id,
    opdNumber: v.opdNumber,
    queueToken: v.queueToken,
    tokenSeq: v.tokenSeq,
    status: v.status,
    visitType: v.visitType,
    chiefComplaint: v.chiefComplaint,
    checkedInAt: v.checkedInAt,
    calledAt: v.calledAt,
    consultStartedAt: v.consultStartedAt,
    doctorId: v.doctorId,
    departmentId: v.departmentId,
    patient: v.patientId,
    waitingMins: v.status === OPD_VISIT_STATUS.WAITING ? minutesBetween(v.checkedInAt, now) : null,
    // How long the patient has been sitting since being called, or since
    // check-in if the doctor has not started them yet.
    seatedMins: v.calledAt ? minutesBetween(v.calledAt, now) : null,
    consultMins: v.consultStartedAt ? minutesBetween(v.consultStartedAt, now) : null,
  }));

  return {
    date: tokenDate,
    counts: {
      waiting: rows.filter((r) => r.status === OPD_VISIT_STATUS.WAITING).length,
      called: rows.filter((r) => r.status === OPD_VISIT_STATUS.CALLED).length,
      inConsultation: rows.filter((r) => r.status === OPD_VISIT_STATUS.IN_CONSULTATION).length,
    },
    // Longest current wait, so the desk can see who is being neglected.
    maxWaitingMins: rows.reduce((max, r) => (r.waitingMins != null && r.waitingMins > max ? r.waitingMins : max), 0),
    queue: rows,
  };
};

/**
 * Call the longest-waiting patient for a doctor. Idempotent in the sense that a
 * second call with no one waiting is a no-op returning null, so a double click on
 * a "Call next" button does not skip a patient.
 */
export const callNextPatientService = async (doctorId, actor) => {
  if (!doctorId) throw new BadRequestError('A doctor must be selected to call the next patient');
  const next = await OpdVisit.findOne({
    doctorId,
    tokenDate: dayKey(),
    status: OPD_VISIT_STATUS.WAITING,
  }).sort({ tokenSeq: 1 });

  if (!next) return null;
  await transitionOpdVisit(next, OPD_VISIT_STATUS.CALLED, actor);
  return next.populate('patientId', 'uhid firstName lastName gender age');
};

export const callVisitService = async (visitId, actor) => {
  const visit = await OpdVisit.findById(visitId);
  if (!visit) throw new NotFoundError('OPD visit not found');
  await transitionOpdVisit(visit, OPD_VISIT_STATUS.CALLED, actor);
  return visit;
};

export const startConsultationService = async (visitId, actor) => {
  const visit = await OpdVisit.findById(visitId);
  if (!visit) throw new NotFoundError('OPD visit not found');
  await transitionOpdVisit(visit, OPD_VISIT_STATUS.IN_CONSULTATION, actor);
  return visit;
};

export const markNoShowService = async (visitId, actor) => {
  const visit = await OpdVisit.findById(visitId);
  if (!visit) throw new NotFoundError('OPD visit not found');
  await transitionOpdVisit(visit, OPD_VISIT_STATUS.NO_SHOW, actor);
  return visit;
};

/**
 * Cancel at the desk - the one way out of a queue position. Kept apart from the
 * clinical transitions because a patient who cannot wait is not a clinical event.
 */
export const cancelVisitService = async (visitId, actor, reason) => {
  const visit = await OpdVisit.findById(visitId);
  if (!visit) throw new NotFoundError('OPD visit not found');
  await transitionOpdVisit(visit, OPD_VISIT_STATUS.CANCELLED, actor, reason);
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
