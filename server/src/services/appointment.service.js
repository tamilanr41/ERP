import Appointment, { APPOINTMENT_STATUS, APPOINTMENT_FLOW } from '../models/Appointment.model.js';
import { generateNumber, NUMBER_PREFIXES } from '../utils/numberGenerator.js';
import { BadRequestError, NotFoundError, ConflictError } from '../utils/ApiError.js';
import { regex } from '../utils/helpers.js';

export const listAppointments = async (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const filter = {};

  if (query.date) {
    const start = new Date(query.date);
    if (!isNaN(start)) {
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      filter.date = { $gte: start, $lt: end };
    }
  } else if (query.from || query.to) {
    filter.date = {};
    if (query.from) filter.date.$gte = new Date(query.from);
    if (query.to) filter.date.$lte = new Date(query.to);
  }
  if (query.doctorId) filter.doctorId = query.doctorId;
  if (query.patientId) filter.patientId = query.patientId;
  if (query.status) filter.status = query.status;
  if (query.departmentId) filter.departmentId = query.departmentId;
  if (query.specialty) {
    const Doctor = (await import('../models/Doctor.model.js')).default;
    const doctors = await Doctor.find({ specialization: regex(query.specialty) }).select('_id');
    filter.doctorId = { $in: doctors.map((d) => d._id) };
  }

  const [total, appointments] = await Promise.all([
    Appointment.countDocuments(filter),
    Appointment.find(filter)
      .populate('patientId', 'uhid firstName lastName mobile gender photo')
      .populate('doctorId', 'name specialization consultationFee')
      .populate('departmentId', 'name')
      .sort({ date: 1, time: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
  ]);
  return { data: appointments, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

export const createAppointment = async (payload, actor) => {
  const { patientId, doctorId, date, time } = payload;
  const start = new Date(date);
  if (isNaN(start)) throw new BadRequestError('Invalid appointment date');

  // Token: next token number for that doctor+date
  const tokenNumber = await Appointment.countDocuments({ doctorId, date: { $gte: start, $lt: new Date(start.getTime() + 24 * 60 * 60 * 1000) } }) + 1;

  // Double booking prevention: same doctor+date+time already booked (not cancelled/no-show)
  const existing = await Appointment.findOne({
    doctorId,
    date: { $gte: start, $lt: new Date(start.getTime() + 24 * 60 * 60 * 1000) },
    time,
    status: { $nin: [APPOINTMENT_STATUS.CANCELLED, APPOINTMENT_STATUS.NO_SHOW] },
  });
  if (existing) throw new ConflictError(`Slot already booked for doctor at ${time}`);

  // Prevent same patient booking same doctor at same slot
  const patientSelfConflict = await Appointment.findOne({
    patientId,
    doctorId,
    date: { $gte: start, $lt: new Date(start.getTime() + 24 * 60 * 60 * 1000) },
    time,
    status: { $nin: [APPOINTMENT_STATUS.CANCELLED, APPOINTMENT_STATUS.NO_SHOW] },
  });
  if (patientSelfConflict) throw new ConflictError('Patient already has an appointment at this slot');

  const appointmentNumber = await generateNumber(NUMBER_PREFIXES.APPOINTMENT, start.getFullYear());

  const appointment = await Appointment.create({
    ...payload,
    appointmentNumber,
    tokenNumber,
    bookedBy: actor?.id,
    hospitalId: actor?.hospitalId || payload.hospitalId,
    branchId: actor?.branchId,
    status: payload.status || APPOINTMENT_STATUS.REQUESTED,
  });

  const notif = (await import('../models/Notification.model.js')).default;
  await notif.create({
    user: actor?.id,
    type: 'APPOINTMENT',
    title: `Appointment ${appointmentNumber}`,
    message: `Appointment booked for ${doctorId} on ${date}`,
    referenceType: 'Appointment',
    referenceId: appointment._id,
  });

  return appointment;
};

export const updateAppointmentStatus = async (id, status, actor, opts = {}) => {
  const valid = Object.values(APPOINTMENT_STATUS);
  if (!valid.includes(status)) throw new BadRequestError('Invalid status');

  const appointment = await Appointment.findById(id);
  if (!appointment) throw new NotFoundError('Appointment not found');

  const allowed = APPOINTMENT_FLOW[appointment.status] || [];
  if (!allowed.includes(status)) {
    throw new BadRequestError(`Cannot move appointment from ${appointment.status} to ${status}`);
  }

  // Prevent double booking on confirm when switching to CONFIRMED
  if (status === APPOINTMENT_STATUS.CONFIRMED) {
    const start = new Date(appointment.date);
    const conflict = await Appointment.findOne({
      _id: { $ne: id },
      doctorId: appointment.doctorId,
      date: { $gte: start, $lt: new Date(start.getTime() + 24 * 60 * 60 * 1000) },
      time: appointment.time,
      status: { $nin: [APPOINTMENT_STATUS.CANCELLED, APPOINTMENT_STATUS.NO_SHOW] },
    });
    if (conflict) throw new ConflictError('Slot already occupied');
  }

  const updates = {
    status,
    ...([APPOINTMENT_STATUS.ARRIVED, APPOINTMENT_STATUS.CHECKED_IN].includes(status) && !appointment.checkedInAt
      ? { checkedInAt: new Date(), checkedInBy: actor?.id }
      : {}),
    ...(status === APPOINTMENT_STATUS.COMPLETED ? { completedAt: new Date() } : {}),
    ...(status === APPOINTMENT_STATUS.CANCELLED ? { cancelledAt: new Date(), cancelledBy: actor?.id, cancelledReason: opts?.cancelledReason } : {}),
  };
  Object.assign(appointment, updates);
  await appointment.save();
  return appointment;
};

export const rescheduleAppointment = async (id, payload, actor) => {
  const appointment = await Appointment.findById(id);
  if (!appointment) throw new NotFoundError('Appointment not found');
  const { date, time } = payload;
  const start = new Date(date);
  const conflict = await Appointment.findOne({
    _id: { $ne: id },
    doctorId: appointment.doctorId,
    date: { $gte: start, $lt: new Date(start.getTime() + 24 * 60 * 60 * 1000) },
    time,
    status: { $nin: [APPOINTMENT_STATUS.CANCELLED, APPOINTMENT_STATUS.NO_SHOW] },
  });
  if (conflict) throw new ConflictError(`New slot already booked at ${time}`);
  appointment.date = start;
  appointment.time = time;
  appointment.status = APPOINTMENT_STATUS.SCHEDULED;
  await appointment.save();
  return appointment;
};

export const getTodayQueue = async ({ doctorId } = {}) => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  const filter = { date: { $gte: start, $lt: end }, status: { $nin: [APPOINTMENT_STATUS.CANCELLED, APPOINTMENT_STATUS.NO_SHOW] } };
  if (doctorId) filter.doctorId = doctorId;

  const items = await Appointment.find(filter)
    .populate('patientId', 'uhid firstName lastName mobile gender photo age')
    .populate('doctorId', 'name specialization')
    .sort({ tokenNumber: 1 });

  return items;
};