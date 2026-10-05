import { success, created } from '../utils/apiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { writeAudit } from '../middleware/audit.js';
import {
  listAppointments,
  createAppointment,
  updateAppointmentStatus,
  rescheduleAppointment,
  getTodayQueue,
} from '../services/appointment.service.js';

export const listController = asyncHandler(async (req, res) => {
  const result = await listAppointments(req.query);
  success(res, result.data, 'Appointments fetched', result.pagination);
});

export const createController = asyncHandler(async (req, res) => {
  const appointment = await createAppointment(req.body, req.user);
  await writeAudit({ user: req.user, action: 'APPOINTMENT_CREATE', module: 'appointments', entityId: appointment._id, entityType: 'Appointment', req });
  created(res, appointment, 'Appointment booked');
});

export const statusController = asyncHandler(async (req, res) => {
  const appointment = await updateAppointmentStatus(req.params.id, req.body.status, req.user, {
    cancelledReason: req.body.cancelledReason || undefined,
  });
  await writeAudit({ user: req.user, action: `APPOINTMENT_${req.body.status}`, module: 'appointments', entityId: req.params.id, entityType: 'Appointment', req });
  success(res, appointment, `Appointment ${req.body.status.toLowerCase()}`);
});

export const rescheduleController = asyncHandler(async (req, res) => {
  const appointment = await rescheduleAppointment(req.params.id, req.body, req.user);
  await writeAudit({ user: req.user, action: 'APPOINTMENT_RESCHEDULE', module: 'appointments', entityId: req.params.id, entityType: 'Appointment', req });
  success(res, appointment, 'Appointment rescheduled');
});

export const queueController = asyncHandler(async (req, res) => {
  const queue = await getTodayQueue(req.query);
  success(res, queue, 'Queue fetched');
});