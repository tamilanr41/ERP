import crypto from 'crypto';
import Appointment, {
  APPOINTMENT_STATUS,
  APPOINTMENT_PAYMENT_STATUS,
} from '../models/Appointment.model.js';
import Bill, { BILL_STATUS } from '../models/Bill.model.js';
import Patient from '../models/Patient.model.js';
import Doctor from '../models/Doctor.model.js';
import config from '../config/index.js';
import { BadRequestError, NotFoundError, ConflictError, ForbiddenError } from '../utils/ApiError.js';
import { writeAudit } from '../middleware/audit.js';

const DAY = 24 * 60 * 60 * 1000;
const dayWindow = (d) => ({ $gte: d, $lt: new Date(d.getTime() + DAY) });

/**
 * The signalling room key. It is a random value, not the appointment id, so a
 * participant cannot walk the room list and guess a consultation to join — the
 * id is visible in ordinary API payloads to staff with APPOINTMENT_VIEW.
 */
const newRoomId = () => `telemed_${crypto.randomBytes(18).toString('hex')}`;

const loadAppointment = async (id) => {
  const appointment = await Appointment.findById(id);
  if (!appointment) throw new NotFoundError('Appointment not found');
  return appointment;
};

const requireTelemedicine = (appointment) => {
  // Must test for TELEMEDICINE specifically. Testing membership in
  // CONSULTATION_MODES would accept IN_PERSON too, since that list names both.
  if (appointment.consultationMode !== 'TELEMEDICINE') {
    throw new BadRequestError(
      `Appointment ${appointment.appointmentNumber} is an in-person appointment, not a teleconsultation`,
    );
  }
};

export const listTelemedicineAppointments = async (query = {}) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const filter = { consultationMode: 'TELEMEDICINE' };

  if (query.status) filter.status = query.status;
  if (query.doctorId) filter.doctorId = query.doctorId;
  if (query.patientId) filter.patientId = query.patientId;
  if (query.date) {
    const d = new Date(query.date);
    if (!isNaN(d)) filter.date = dayWindow(d);
  } else if (query.from || query.to) {
    filter.date = {};
    if (query.from) filter.date.$gte = new Date(query.from);
    if (query.to) filter.date.$lte = new Date(query.to);
  }

  const [total, items] = await Promise.all([
    Appointment.countDocuments(filter),
    Appointment.find(filter)
      .populate('patientId', 'uhid firstName lastName mobile photo')
      .populate('doctorId', 'name specialization doctorCode')
      .sort({ date: 1, time: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
  ]);

  return { data: items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

/**
 * Load an appointment and confirm it really is a teleconsultation. Exported so
 * routes that only read or attach data (prescriptions, notes) apply the same
 * guard as the ones that drive the consultation lifecycle.
 */
export const assertConsultation = async (id) => {
  const appointment = await loadAppointment(id);
  requireTelemedicine(appointment);
  return appointment;
};

export const recordConsent = async (id, payload, actor) => {
  const appointment = await loadAppointment(id);
  requireTelemedicine(appointment);
  // An absent value is a missing decision and is refused; an explicit `false`
  // is a recorded refusal and must be storable, otherwise a patient who
  // declines video leaves no trace that consent was ever sought.
  if (typeof payload?.videoConsent !== 'boolean') {
    throw new BadRequestError('videoConsent must be explicitly accepted or declined');
  }
  appointment.consent = {
    videoConsent: Boolean(payload.videoConsent),
    recordedAt: new Date(),
    recordedBy: actor?.id,
    ip: payload.ip,
  };
  await appointment.save();
  return appointment;
};

const paymentSettled = async (appointment) => {
  if (!appointment.billId) return false;
  const bill = await Bill.findById(appointment.billId).select('status dueAmount paidAmount');
  if (!bill) return false;
  return bill.status === BILL_STATUS.PAID || (bill.dueAmount || 0) <= 0.01;
};

export const startConsultation = async (id, actor, opts = {}) => {
  const appointment = await loadAppointment(id);
  requireTelemedicine(appointment);

  const startable = [
    APPOINTMENT_STATUS.REQUESTED,
    APPOINTMENT_STATUS.SCHEDULED,
    APPOINTMENT_STATUS.RESCHEDULED,
    APPOINTMENT_STATUS.CONFIRMED,
    APPOINTMENT_STATUS.CHECKED_IN,
    APPOINTMENT_STATUS.WAITING,
  ];
  if (appointment.status === APPOINTMENT_STATUS.IN_CONSULTATION) {
    // Idempotent: a doctor whose browser retried should get the same room back
    // rather than an error, otherwise the retry starts a second consultation.
    return appointment;
  }
  if (!startable.includes(appointment.status)) {
    throw new BadRequestError(`Cannot start a consultation from status ${appointment.status}`);
  }

  if (config.telemedicine.requirePaymentBeforeConsultation) {
    const waived = appointment.paymentStatus === APPOINTMENT_PAYMENT_STATUS.WAIVED;
    if (!waived && !(await paymentSettled(appointment))) {
      throw new ConflictError(
        `Consultation fee of ${appointment.consultationFee} must be billed and settled before the consultation starts`,
        { code: 'CONSULTATION_FEE_DUE' },
      );
    }
  }

  const now = new Date();
  const from = appointment.status;
  appointment.status = APPOINTMENT_STATUS.IN_CONSULTATION;
  appointment.consultationStartedAt = appointment.consultationStartedAt || now;
  appointment.roomId = appointment.roomId || newRoomId();
  appointment.roomOpenedAt = appointment.roomOpenedAt || now;
  appointment.doctorJoinedAt = now;
  if (!appointment.checkedInAt) {
    appointment.checkedInAt = now;
    appointment.checkedInBy = actor?.id;
  }
  appointment.statusHistory.push({ from, to: APPOINTMENT_STATUS.IN_CONSULTATION, at: now, by: actor?.id, reason: opts?.reason });
  await appointment.save();

  await writeAudit({
    user: actor,
    action: 'TELEMEDICINE_CONSULTATION_STARTED',
    module: 'telemedicine',
    entityId: appointment._id,
    entityType: 'Appointment',
    data: { appointmentNumber: appointment.appointmentNumber, roomId: appointment.roomId },
  });

  return appointment;
};

export const endConsultation = async (id, actor, opts = {}) => {
  const appointment = await loadAppointment(id);
  requireTelemedicine(appointment);

  if (appointment.status !== APPOINTMENT_STATUS.IN_CONSULTATION) {
    if (appointment.status === APPOINTMENT_STATUS.COMPLETED) return appointment;
    throw new BadRequestError(`Cannot end a consultation that is ${appointment.status}`);
  }

  const now = new Date();
  const from = appointment.status;
  appointment.status = APPOINTMENT_STATUS.COMPLETED;
  appointment.consultationEndedAt = now;
  appointment.consultationEndedBy = actor?.id;
  appointment.completedAt = now;
  appointment.roomClosedAt = now;
  if (appointment.consultationStartedAt && now < appointment.consultationStartedAt) {
    throw new BadRequestError('Consultation end time precedes its start time');
  }
  appointment.statusHistory.push({
    from,
    to: APPOINTMENT_STATUS.COMPLETED,
    at: now,
    by: actor?.id,
    reason: opts?.reason,
  });
  await appointment.save();

  await writeAudit({
    user: actor,
    action: 'TELEMEDICINE_CONSULTATION_ENDED',
    module: 'telemedicine',
    entityId: appointment._id,
    entityType: 'Appointment',
    data: {
      appointmentNumber: appointment.appointmentNumber,
      durationMinutes: appointment.consultationStartedAt
        ? Math.round((now - appointment.consultationStartedAt) / 60000)
        : null,
    },
  });

  return appointment;
};

/**
 * Authorised join payload. Access is limited to the patient the appointment is
 * for and the doctor it is assigned to; everyone else needs
 * TELEMEDICINE_JOIN_ANY. Media is not proxied here — this returns the signalling
 * room plus the ICE servers the browser needs to negotiate a peer connection.
 */
export const joinConsultation = async (id, actor, opts = {}) => {
  const appointment = await loadAppointment(id);
  requireTelemedicine(appointment);

  const assignedDoctor =
    actor?.doctorId && String(appointment.doctorId) === String(actor.doctorId);
  let ownsPatient = false;
  if (actor?.patientId && String(appointment.patientId) === String(actor.patientId)) {
    ownsPatient = true;
  } else if (opts.patientId) {
    ownsPatient = String(appointment.patientId) === String(opts.patientId);
  }

  const privileged = (actor?.permissions || []).includes('TELEMEDICINE_JOIN_ANY');
  if (!assignedDoctor && !ownsPatient && !privileged) {
    throw new ForbiddenError('You are not a participant in this consultation');
  }

  if ([APPOINTMENT_STATUS.CANCELLED, APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.NO_SHOW].includes(appointment.status)) {
    throw new ConflictError(`This consultation is ${appointment.status} and can no longer be joined`);
  }

  // The role is derived from the appointment, never from the request, so a
  // patient cannot present themselves as the doctor. A contradicting claim is
  // refused outright rather than quietly corrected, because a client sending
  // the wrong role is about to render the wrong view.
  const derivedRole = assignedDoctor ? 'DOCTOR' : ownsPatient ? 'PATIENT' : 'OBSERVER';
  if (opts.role && opts.role !== derivedRole) {
    if (opts.role === 'PATIENT') {
      throw new ForbiddenError('This appointment does not belong to the signed-in patient');
    }
    throw new ForbiddenError(`You are joining as ${derivedRole}, not ${opts.role}`);
  }
  if (opts.patientId && !ownsPatient) {
    throw new ForbiddenError('This appointment does not belong to the signed-in patient');
  }

  if (!appointment.roomId) {
    appointment.roomId = newRoomId();
    appointment.roomOpenedAt = new Date();
  }
  if (ownsPatient && !appointment.patientJoinedAt) appointment.patientJoinedAt = new Date();
  await appointment.save();

  return {
    roomId: appointment.roomId,
    appointmentNumber: appointment.appointmentNumber,
    status: appointment.status,
    consultationStartedAt: appointment.consultationStartedAt,
    iceServers: config.telemedicine.iceServers,
    role: derivedRole,
  };
};

/**
 * Raise the consultation bill from the fee snapshotted at booking. The
 * uniq_appointment_bill index is the real guard against a double submit, so the
 * duplicate is caught here and returned as a conflict rather than a 500.
 */
export const generateConsultationBill = async (id, actor, opts = {}) => {
  const appointment = await loadAppointment(id);
  requireTelemedicine(appointment);

  if (appointment.billId) {
    const existing = await Bill.findById(appointment.billId).select('billNumber status netTotal dueAmount paidAmount');
    if (existing) return existing;
    // The referenced bill is gone; clear the pointer and let a new one be raised.
    appointment.billId = null;
  }

  const fee = Number(appointment.consultationFee || 0);
  if (!(fee > 0)) throw new BadRequestError('This appointment has no consultation fee to bill');

  const patient = await Patient.findById(appointment.patientId).select('uhid firstName lastName');
  if (!patient) throw new NotFoundError('Patient not found');

  try {
    const { createBillingService } = await import('./billing.service.js');
    const bill = await createBillingService(
      {
        patientId: appointment.patientId,
        patientName: [patient.firstName, patient.lastName].filter(Boolean).join(' '),
        patientUHID: patient.uhid,
        appointmentId: appointment._id,
        doctorId: appointment.doctorId,
        departmentId: appointment.departmentId,
        billType: 'CONSULTATION',
        items: [
          {
            itemType: 'CONSULTATION',
            name: `Teleconsultation - ${appointment.appointmentNumber}`,
            quantity: 1,
            rate: fee,
            gstPct: Number(opts.gstPct || 0),
          },
        ],
        payment: opts.payment || null,
        extraDiscount: Number(opts.extraDiscount || 0),
      },
      actor,
    );

    appointment.billId = bill._id;
    appointment.paymentStatus =
      bill.status === BILL_STATUS.PAID ? APPOINTMENT_PAYMENT_STATUS.PAID : APPOINTMENT_PAYMENT_STATUS.UNPAID;
    appointment.paidAmount = bill.paidAmount || 0;
    await appointment.save();
    return bill;
  } catch (err) {
    if (err?.code === 11000) {
      const concurrent = await Bill.findOne({ appointmentId: appointment._id });
      if (concurrent) {
        appointment.billId = concurrent._id;
        appointment.paymentStatus = APPOINTMENT_PAYMENT_STATUS.UNPAID;
        await appointment.save();
        return concurrent;
      }
      throw new ConflictError('A bill already exists for this consultation');
    }
    throw err;
  }
};

export const syncAppointmentPaymentState = async (billId, { session = null } = {}) => {
  const bill = await Bill.findById(billId).select('appointmentId status dueAmount paidAmount').session(session);
  if (!bill?.appointmentId) return null;
  // bill.appointmentId *is* the appointment's _id - it must not be matched
  // against the appointment's billId, which points the other way.
  const appointment = await Appointment.findById(bill.appointmentId).session(session);
  if (!appointment) return null;

  let paymentStatus = APPOINTMENT_PAYMENT_STATUS.UNPAID;
  if (bill.status === BILL_STATUS.PAID || (bill.dueAmount || 0) <= 0.01) paymentStatus = APPOINTMENT_PAYMENT_STATUS.PAID;
  else if (bill.status === BILL_STATUS.PARTIALLY_PAID || (bill.paidAmount || 0) > 0) paymentStatus = APPOINTMENT_PAYMENT_STATUS.PARTIAL;

  appointment.paymentStatus = paymentStatus;
  appointment.paidAmount = bill.paidAmount || 0;
  await appointment.save({ session });
  return appointment;
};

export const waiveConsultationFee = async (id, actor, opts = {}) => {
  const appointment = await loadAppointment(id);
  requireTelemedicine(appointment);
  if (appointment.billId) throw new ConflictError('This consultation already has a bill and cannot be waived');

  appointment.paymentStatus = APPOINTMENT_PAYMENT_STATUS.WAIVED;
  appointment.statusHistory.push({
    from: appointment.status,
    to: appointment.status,
    at: new Date(),
    by: actor?.id,
    reason: `Fee waived: ${opts.reason || 'no reason given'}`,
  });
  await appointment.save();

  await writeAudit({
    user: actor,
    action: 'TELEMEDICINE_FEE_WAIVED',
    module: 'telemedicine',
    entityId: appointment._id,
    entityType: 'Appointment',
    data: { appointmentNumber: appointment.appointmentNumber, amount: appointment.consultationFee, reason: opts.reason || null },
  });
  return appointment;
};

/**
 * Booked but never started: the patient waited past the grace period. Run on a
 * schedule; reports what it changed so the sweep can be audited.
 */
export const sweepNoShows = async (actor = null) => {
  const cutoff = new Date(Date.now() - config.telemedicine.noShowAfterMinutes * 60000);
  const candidates = await Appointment.find({
    consultationMode: 'TELEMEDICINE',
    status: {
      $in: [
        APPOINTMENT_STATUS.CONFIRMED,
        APPOINTMENT_STATUS.REQUESTED,
        APPOINTMENT_STATUS.SCHEDULED,
        APPOINTMENT_STATUS.RESCHEDULED,
        APPOINTMENT_STATUS.CHECKED_IN,
        APPOINTMENT_STATUS.WAITING,
      ],
    },
    date: { $lte: cutoff },
    consultationStartedAt: null,
    // statusHistory must be loaded: a bare select() would leave the array
    // undefined and the transition could not be recorded.
  }).select('_id appointmentNumber status date statusHistory');

  const marked = [];
  for (const appointment of candidates) {
    const from = appointment.status;
    appointment.status = APPOINTMENT_STATUS.NO_SHOW;
    appointment.statusHistory.push({
      from,
      to: APPOINTMENT_STATUS.NO_SHOW,
      at: new Date(),
      by: actor?.id,
      reason: `Not started within ${config.telemedicine.noShowAfterMinutes} minutes`,
    });
    await appointment.save();
    marked.push(appointment.appointmentNumber);
  }
  return { marked, count: marked.length };
};

export const getPrescriptionsForConsultation = async (id) => {
  await assertConsultation(id);
  const { default: Prescription } = await import('../models/Prescription.model.js');
  return Prescription.find({ appointmentId: id })
    .populate('doctorId', 'name doctorCode specialization')
    .sort({ prescriptionDate: -1 });
};

export const getConsultationDetail = async (id) => {
  const appointment = await Appointment.findById(id)
    .populate('patientId', 'uhid firstName lastName mobile photo gender dateOfBirth')
    .populate('doctorId', 'name specialization doctorCode consultationFee')
    .populate('departmentId', 'name')
    .populate('billId', 'billNumber status netTotal paidAmount dueAmount');
  if (!appointment) throw new NotFoundError('Appointment not found');
  const { default: Prescription } = await import('../models/Prescription.model.js');
  const prescriptions = await Prescription.find({ appointmentId: id }).select(
    'rxNumber prescriptionDate isSigned status',
  );
  return { ...appointment.toObject(), prescriptions };
};

export const listDoctorsOfferingTelemedicine = async () => {
  const doctors = await Doctor.find({ active: true, availability: true }).select(
    'name specialization doctorCode consultationFee availableDays opdTiming',
  );
  return doctors;
};