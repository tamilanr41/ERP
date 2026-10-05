import asyncHandler from '../utils/asyncHandler.js';
import { createPrescription } from '../services/opd.service.js';
import { assertConsultation } from '../services/telemedicine.service.js';
import { writeAudit } from '../middleware/audit.js';
import {
  listTelemedicineAppointments,
  getConsultationDetail,
  recordConsent,
  startConsultation,
  endConsultation,
  joinConsultation,
  generateConsultationBill,
  waiveConsultationFee,
  listDoctorsOfferingTelemedicine,
  getPrescriptionsForConsultation,
} from '../services/telemedicine.service.js';

export const listController = asyncHandler(async (req, res) => {
  const result = await listTelemedicineAppointments(req.query);
  res.json({ success: true, data: result.data, pagination: result.pagination });
});

export const detailController = asyncHandler(async (req, res) => {
  const appointment = await getConsultationDetail(req.params.id);
  res.json({ success: true, data: appointment });
});

export const consentController = asyncHandler(async (req, res) => {
  const appointment = await recordConsent(req.params.id, req.body, req.user);
  res.json({ success: true, message: 'Consent recorded', data: { appointmentId: appointment._id, consent: appointment.consent } });
});

export const startController = asyncHandler(async (req, res) => {
  const appointment = await startConsultation(req.params.id, req.user, req.body);
  res.json({
    success: true,
    message: 'Consultation started',
    data: { appointmentId: appointment._id, status: appointment.status, roomId: appointment.roomId, consultationStartedAt: appointment.consultationStartedAt },
  });
});

export const endController = asyncHandler(async (req, res) => {
  const appointment = await endConsultation(req.params.id, req.user, req.body);
  res.json({
    success: true,
    message: 'Consultation ended',
    data: {
      appointmentId: appointment._id,
      status: appointment.status,
      consultationStartedAt: appointment.consultationStartedAt,
      consultationEndedAt: appointment.consultationEndedAt,
    },
  });
});

export const joinController = asyncHandler(async (req, res) => {
  const session = await joinConsultation(req.params.id, req.user, req.body);
  res.json({ success: true, data: session });
});

export const billController = asyncHandler(async (req, res) => {
  const bill = await generateConsultationBill(req.params.id, req.user, req.body);
  res.json({
    success: true,
    message: 'Consultation bill generated',
    data: { billId: bill._id, billNumber: bill.billNumber, status: bill.status, netTotal: bill.netTotal, dueAmount: bill.dueAmount },
  });
});

export const waiveController = asyncHandler(async (req, res) => {
  const appointment = await waiveConsultationFee(req.params.id, req.user, req.body);
  res.json({ success: true, message: 'Consultation fee waived', data: { appointmentId: appointment._id, paymentStatus: appointment.paymentStatus } });
});

export const doctorsController = asyncHandler(async (req, res) => {
  const doctors = await listDoctorsOfferingTelemedicine();
  res.json({ success: true, data: doctors });
});

/**
 * Prescriptions written during a consultation. The appointmentId is taken from
 * the path, never from the body, so a prescription cannot be filed against a
 * different consultation than the one being written.
 */
export const createPrescriptionController = asyncHandler(async (req, res) => {
  // assertConsultation keeps the mode and existence checks identical to every
  // other teleconsultation entry point without starting the consultation.
  await assertConsultation(req.params.id);

  const prescription = await createPrescription(
    { ...req.body, appointmentId: req.params.id },
    req.user,
  );
  await writeAudit({
    user: req.user,
    action: 'TELEMEDICINE_PRESCRIPTION_CREATE',
    module: 'telemedicine',
    entityId: prescription._id,
    entityType: 'Prescription',
    req,
  });
  res.status(201).json({
    success: true,
    message: 'Prescription created for consultation',
    data: { _id: prescription._id, rxNumber: prescription.rxNumber, appointmentId: prescription.appointmentId },
  });
});

export const listPrescriptionsController = asyncHandler(async (req, res) => {
  const prescriptions = await getPrescriptionsForConsultation(req.params.id);
  res.json({ success: true, data: prescriptions });
});