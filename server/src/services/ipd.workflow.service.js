import mongoose from 'mongoose';
import IpdAdmission, { ADMISSION_STATUS } from '../models/IpdAdmission.model.js';
import MedicationChart, { MED_ADMIN_STATUS } from '../models/MedicationChart.model.js';
import ClinicalOrder from '../models/ClinicalOrder.model.js';
import LabOrder, { LAB_ORDER_STATUS, LabResult, LabSample } from '../models/LabOrder.model.js';
import LabTest from '../models/LabTest.model.js';
import RadiologyOrder, { RADIOLOGY_STATUS, RadiologyReport, RadiologyTest } from '../models/RadiologyOrder.model.js';
import Surgery from '../models/Surgery.model.js';
import IoChartEntry, { ioEntryTotals, IO_INPUT_TYPES, IO_OUTPUT_TYPES } from '../models/IoChart.model.js';
import ProcedureRecord, { PROCEDURE_STATUS, PROCEDURE_CATEGORIES } from '../models/ProcedureRecord.model.js';
import DietOrder, { DIET_TYPES, MEAL_TYPES, MEAL_STATUS } from '../models/DietOrder.model.js';
import BloodRequest, { BLOOD_COMPONENTS, BLOOD_REQUEST_STATUS } from '../models/BloodRequest.model.js';
import PhysiotherapyRequest, { PHYSIO_REQUEST_STATUS, PHYSIO_SESSION_STATUS } from '../models/PhysiotherapyRequest.model.js';
import PharmacyRequest, { PHARMACY_REQUEST_STATUS } from '../models/PharmacyRequest.model.js';
import Medicine from '../models/Medicine.model.js';
import MedicineBatch from '../models/MedicineBatch.model.js';
import Patient from '../models/Patient.model.js';
import Notification, { NOTIFICATION_TYPES } from '../models/Notification.model.js';
import { generateNumber, NUMBER_PREFIXES } from '../utils/numberGenerator.js';
import { createBillingService } from './billing.service.js';
import { BadRequestError, NotFoundError, ConflictError } from '../utils/ApiError.js';
import { emitIpd, IPD_SOCKET_EVENTS } from '../utils/socket.io.server.js';

const ACTIVE_STATUSES = [
  ADMISSION_STATUS.ADMITTED,
  ADMISSION_STATUS.TRANSFERRED,
  ADMISSION_STATUS.DISCHARGE_PLANNED,
  ADMISSION_STATUS.WAITING_FOR_BED,
];

const requireActiveAdmission = async (id) => {
  const admission = await IpdAdmission.findById(id).select('patientId admissionNumber status uhid consultantDoctorId departmentId');
  if (!admission) throw new NotFoundError('Admission not found');
  if (!ACTIVE_STATUSES.includes(admission.status)) {
    throw new BadRequestError(`Admission is ${admission.status} — documentation closed`);
  }
  return admission;
};

const nonNegative = (value, label) => {
  if (value === undefined || value === null || value === '') return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new BadRequestError(`${label} must be a positive number`);
  return Math.round(n * 100) / 100;
};

// ============================================================
// 16. MAR — MEDICATION ADMINISTRATION RECORD
// ============================================================
const FREQ_TIMES = {
  OD: [8], BD: [8, 20], TDS: [8, 14, 20], QID: [6, 12, 18, 24], HS: [22],
  ONCE: [8], STAT: [0], PRN: [], EVERY_4H: [2, 6, 10, 14, 18, 22], EVERY_6H: [6, 12, 18], EVERY_8H: [6, 14, 22],
};

const defaultTimesFor = (frequency, startDate) => {
  const key = String(frequency || 'OD').toUpperCase().replace(/[^A-Z0-9_]/g, '');
  const hours = FREQ_TIMES[key] ?? FREQ_TIMES.OD;
  const base = startDate ? new Date(startDate) : new Date();
  return hours.map((h) => {
    const d = new Date(base);
    d.setHours(Math.min(h, 23), 0, 0, 0);
    return d;
  });
};

/** Create MAR rows (SCHEDULED) for a charted medicine — never marks GIVEN. */
export const scheduleMedication = async (chartId, payload, actor) => {
  const chart = await MedicationChart.findById(chartId);
  if (!chart) throw new NotFoundError('Medication chart not found');

  const times = payload.times?.length
    ? payload.times.map((t) => new Date(t))
    : defaultTimesFor(payload.frequency || chart.frequency, payload.from || new Date());

  if (!times.length) throw new BadRequestError('No administration times could be derived — supply explicit times');

  for (const t of times) {
    if (Number.isNaN(new Date(t).getTime())) throw new BadRequestError('Invalid scheduled time');
    chart.administrations.push({
      scheduledTime: t,
      status: MED_ADMIN_STATUS.SCHEDULED,
      scheduledBy: actor?.id,
      doseGiven: payload.doseGiven || chart.dosage,
    });
  }
  await chart.save();
  emitIpd(IPD_SOCKET_EVENTS.MEDICATION_SCHEDULE, { chartId, slots: times.length, medicine: chart.medicineName }, chart.admissionId);
  return chart;
};

export const listMar = async (admissionId) => {
  const charts = await MedicationChart.find({ admissionId })
    .populate('orderedBy', 'name')
    .populate('administrations.administeredBy', 'name')
    .populate('administrations.scheduledBy', 'name')
    .sort({ createdAt: 1 });

  const rows = [];
  for (const c of charts) {
    for (const a of c.administrations || []) {
      rows.push({
        chartId: c._id,
        administrationId: a._id,
        medicineId: c.medicineId,
        medicineName: c.medicineName,
        genericName: c.genericName,
        strength: c.strength,
        dosage: a.doseGiven || c.dosage,
        route: c.route,
        frequency: c.frequency,
        scheduledTime: a.scheduledTime,
        administeredTime: a.givenTime,
        status: a.status,
        nurse: a.administeredBy?.name || null,
        remarks: a.remark || a.note || null,
        prescribedBy: c.orderedBy?.name || null,
      });
    }
  }
  return rows.sort((x, y) => new Date(x.scheduledTime || 0) - new Date(y.scheduledTime || 0));
};

/** Nurse records the actual administration of a scheduled MAR row. */
export const recordMarAdministration = async (chartId, administrationId, payload, actor) => {
  const chart = await MedicationChart.findById(chartId);
  if (!chart) throw new NotFoundError('Medication chart not found');
  const row = chart.administrations.id(administrationId);
  if (!row) throw new NotFoundError('MAR row not found');

  const status = payload.status;
  if (!Object.values(MED_ADMIN_STATUS).includes(status)) throw new BadRequestError('Invalid MAR status');
  if (status === MED_ADMIN_STATUS.SCHEDULED) {
    throw new BadRequestError('A nurse must record the actual status — SCHEDULED cannot be re-saved as the final state');
  }

  row.status = status;
  row.givenTime = status === MED_ADMIN_STATUS.GIVEN ? (payload.givenTime ? new Date(payload.givenTime) : new Date()) : null;
  row.administeredBy = actor?.id;
  row.remark = payload.remark;
  if (row.doseGiven) row.doseGiven = payload.doseGiven;
  await chart.save();
  emitIpd(IPD_SOCKET_EVENTS.MAR_UPDATED, { chartId, status, nurse: actor?.name, at: new Date().toISOString() }, chart.admissionId);
  return chart;
};

export const listMedicationCharts = async (admissionId) => MedicationChart.find({ admissionId })
  .populate('orderedBy', 'name')
  .populate('administrations.administeredBy', 'name')
  .sort({ createdAt: -1 });

// ============================================================
// 17. PHARMACY INTEGRATION
// ============================================================
const batchesQuery = (medicineId, session = null) => MedicineBatch.find({
  medicineId,
  active: true,
  expiryDate: { $gt: new Date() },
  quantity: { $gt: 0 },
}).sort({ expiryDate: 1 }).session(session || null);

const availableBatches = async (medicineId) => batchesQuery(medicineId);

export const createPharmacyRequest = async (admissionId, payload, actor) => {
  const admission = await requireActiveAdmission(admissionId);
  if (!payload.medicineId) throw new BadRequestError('Medicine is required');

  const medicine = await Medicine.findById(payload.medicineId);
  if (!medicine) throw new NotFoundError('Medicine not found');

  const batches = await availableBatches(payload.medicineId);
  const availableStock = batches.reduce((s, b) => s + b.quantity, 0);

  const request = await PharmacyRequest.create({
    requestNumber: await generateNumber('PHR', new Date().getFullYear()),
    admissionId,
    patientId: admission.patientId,
    medicationChartId: payload.medicationChartId,
    medicineId: medicine._id,
    medicineName: medicine.name,
    strength: payload.strength,
    dosage: payload.dosage,
    route: payload.route,
    frequency: payload.frequency,
    quantityRequested: nonNegative(payload.quantityRequested, 'Quantity') || 1,
    availableStock,
    priority: payload.priority || 'ROUTINE',
    requestedBy: actor?.id,
    hospitalId: actor?.hospitalId,
    branchId: actor?.branchId,
  });
  return request;
};

export const listPharmacyRequests = async (admissionId) => PharmacyRequest.find({ admissionId })
  .populate('requestedBy', 'name')
  .populate('verifiedBy', 'name')
  .populate('dispensedBy', 'name')
  .sort({ createdAt: -1 });

export const verifyPharmacyRequest = async (requestId, payload, actor) => {
  const request = await PharmacyRequest.findById(requestId);
  if (!request) throw new NotFoundError('Pharmacy request not found');
  if (![PHARMACY_REQUEST_STATUS.REQUESTED, PHARMACY_REQUEST_STATUS.PARTIAL].includes(request.status)) {
    throw new BadRequestError(`Request cannot be verified from ${request.status}`);
  }
  const batches = await availableBatches(request.medicineId);
  const availableStock = batches.reduce((s, b) => s + b.quantity, 0);
  request.availableStock = availableStock;
  request.status = availableStock >= request.quantityRequested
    ? PHARMACY_REQUEST_STATUS.VERIFIED
    : PHARMACY_REQUEST_STATUS.PARTIAL;
  request.verificationNotes = payload?.notes;
  request.verifiedAt = new Date();
  request.verifiedBy = actor?.id;
  await request.save();
  return request;
};

export const dispensePharmacyRequest = async (requestId, payload, actor) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const request = await PharmacyRequest.findById(requestId).session(session);
    if (!request) throw new NotFoundError('Pharmacy request not found');
    if (![PHARMACY_REQUEST_STATUS.VERIFIED, PHARMACY_REQUEST_STATUS.PARTIAL].includes(request.status)) {
      throw new BadRequestError(`Request must be verified before dispensing (currently ${request.status})`);
    }

    const wanted = nonNegative(payload?.quantity, 'Dispensed quantity') || request.quantityRequested;
    const picks = Array.isArray(payload?.batches) && payload.batches.length
      ? payload.batches
      : null;

    const batches = await batchesQuery(request.medicineId, session);
    let remaining = wanted;
    const allocated = [];

    for (const b of batches) {
      if (remaining <= 0) break;
      const requestedQty = picks?.find((p) => String(p.batchId) === String(b._id))?.quantity;
      const take = requestedQty != null ? Math.min(Number(requestedQty), remaining, b.quantity) : Math.min(b.quantity, remaining);
      if (take <= 0) continue;

      // Section 50: stock is reduced with a conditional atomic update. If another
      // dispenser took the batch first, the update matches nothing and we stop —
      // stock can never go negative or be double-issued.
      const issued = await MedicineBatch.findOneAndUpdate(
        { _id: b._id, active: true, quantity: { $gte: take } },
        {
          $inc: { quantity: -take },
          $push: {
            movements: {
              type: 'ISSUE',
              quantity: -take,
              referenceType: 'PharmacyRequest',
              referenceId: request._id,
              admissionId: request.admissionId,
              patientId: request.patientId,
              reason: `IP ward issue — ${request.medicineName}`,
              by: actor?.id,
            },
          },
        },
        { new: true, session },
      );
      if (!issued) continue;

      issued.movements[issued.movements.length - 1].balanceAfter = issued.quantity;
      await issued.save({ session });

      remaining -= take;
      allocated.push({ batchId: b._id, batchNumber: b.batchNumber, expiryDate: b.expiryDate, quantity: take, rate: b.sellingRate || b.purchaseRate || 0 });
    }

    const dispensed = wanted - remaining;
    if (dispensed <= 0) throw new ConflictError('No stock available to dispense — batch(es) were exhausted by another issue');

    request.batches = allocated;
    request.quantityDispensed = dispensed;
    request.status = dispensed >= request.quantityRequested ? PHARMACY_REQUEST_STATUS.DISPENSED : PHARMACY_REQUEST_STATUS.PARTIAL;
    request.dispensedAt = new Date();
    request.dispensedBy = actor?.id;
    await request.save({ session });
    emitIpd(IPD_SOCKET_EVENTS.PHARMACY_ISSUE, {
      admissionId: request.admissionId, requestNumber: request.requestNumber, medicine: request.medicineName, quantity: dispensed,
    }, request.admissionId);

    // billing: post the dispensed value to the admission bill
    const charge = allocated.reduce((s, a) => s + a.quantity * (a.rate || 0), 0);
    if (charge > 0) {
      const bill = await createBillingService({
        patientId: request.patientId,
        admissionId: request.admissionId,
        billType: 'PHARMACY',
        items: [{
          itemType: 'MEDICINE',
          serviceCategory: 'PHARMACY',
          name: request.medicineName,
          description: `IP issue — ${allocated.map((a) => `${a.batchNumber} × ${a.quantity}`).join(', ')}`,
          quantity: dispensed,
          rate: Math.round((charge / dispensed) * 100) / 100,
          referenceId: request._id,
          referenceType: 'PharmacyRequest',
        }],
      }, actor);
      request.billId = bill._id;
      request.billedAt = new Date();
      await request.save({ session });
    }

    await session.commitTransaction();
    return request;
  } catch (err) {
    await session.abortTransaction().catch(() => {});
    throw err;
  } finally {
    session.endSession();
  }
};

export const returnPharmacyRequest = async (requestId, payload, actor) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const request = await PharmacyRequest.findById(requestId).session(session);
    if (!request) throw new NotFoundError('Pharmacy request not found');
    if (request.status !== PHARMACY_REQUEST_STATUS.DISPENSED && request.status !== PHARMACY_REQUEST_STATUS.PARTIAL) {
      throw new BadRequestError('Only dispensed medicine can be returned');
    }
    const qty = nonNegative(payload?.quantity, 'Return quantity');
    if (qty <= 0) throw new BadRequestError('Return quantity must be greater than 0');
    if (qty > request.quantityDispensed) throw new BadRequestError('Return quantity exceeds dispensed quantity');

    const wastage = nonNegative(payload?.wastageQuantity, 'Wastage quantity');
    if (qty + wastage > request.quantityDispensed) {
      throw new BadRequestError('Return + wastage exceeds dispensed quantity');
    }

    for (const b of request.batches || []) {
      const share = Math.min(qty, b.quantity);
      if (share <= 0) continue;
      const batch = await MedicineBatch.findById(b.batchId).session(session);
      if (batch) {
        batch.quantity = Math.max(0, batch.quantity + share);
        batch.movements.push({          type: 'RETURN',
          quantity: share,
          balanceAfter: batch.quantity,
          referenceType: 'PharmacyRequest',
          referenceId: request._id,
          admissionId: request.admissionId,
          patientId: request.patientId,
          reason: payload?.reason || 'IP ward return',
          by: actor?.id,
        });
        await batch.save({ session });
      }
    }

    if (wastage > 0 && request.batches?.length) {
      let left = wastage;
      for (const b of request.batches) {
        if (left <= 0) break;
        const share = Math.min(left, b.quantity);
        if (share <= 0) continue;
        const batch = await MedicineBatch.findById(b.batchId).session(session);
        if (batch) {
          batch.quantity = Math.max(0, batch.quantity - share);
          batch.movements.push({
            type: 'WASTAGE',
            quantity: -share,
            balanceAfter: batch.quantity,
            referenceType: 'PharmacyRequest',
            referenceId: request._id,
            admissionId: request.admissionId,
            patientId: request.patientId,
            reason: payload?.wastageReason || 'Wastage',
            by: actor?.id,
          });
          await batch.save({ session });
        }
        left -= share;
      }
    }

    request.quantityReturned = qty;
    request.wastageQuantity = wastage;
    request.wastageReason = payload?.wastageReason;
    request.returnedAt = new Date();
    request.returnedBy = actor?.id;
    request.status = PHARMACY_REQUEST_STATUS.RETURNED;
    await request.save({ session });

    await session.commitTransaction();
    return request;
  } catch (err) {
    await session.abortTransaction().catch(() => {});
    throw err;
  } finally {
    session.endSession();
  }
};

export const listPharmacyBatches = async (medicineId) => {
  const batches = await availableBatches(medicineId);
  return batches.map((b) => ({
    _id: b._id,
    batchNumber: b.batchNumber,
    expiryDate: b.expiryDate,
    quantity: b.quantity,
    rate: b.sellingRate || b.purchaseRate || 0,
  }));
};

// ============================================================
// 18. LAB INTEGRATION
// ============================================================
export const createLabOrderForAdmission = async (admissionId, payload, actor) => {
  const admission = await requireActiveAdmission(admissionId);
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) throw new BadRequestError('At least one lab test is required');

  const tests = await LabTest.find({ _id: { $in: items.map((i) => i.labTestId) } });
  if (tests.length !== items.length) throw new BadRequestError('One or more lab tests were not found');

  const { resolveDoctorId } = await import('./ipd.service.js');
  const doctorId = await resolveDoctorId(admission, payload, actor, { field: 'ordering doctor' });

  const [order] = await LabOrder.create([{
    labOrderNumber: await generateNumber(NUMBER_PREFIXES.LAB_ORDER, new Date().getFullYear()),
    patientId: admission.patientId,
    admissionId,
    doctorId,
    orderedBy: actor?.id,
    priority: payload.priority || 'ROUTINE',
    clinicalNotes: payload.clinicalNotes,
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
  }], { ordered: true });

  if (payload.clinicalOrderId) {
    await ClinicalOrder.findByIdAndUpdate(payload.clinicalOrderId, {
      labOrderId: order._id,
      status: 'IN_PROGRESS',
    });
  }
  return order;
};

export const listAdmissionLabOrders = async (admissionId) => {
  const orders = await LabOrder.find({ admissionId })
    .populate('doctorId', 'name')
    .populate('orderedBy', 'name')
    .populate('items.resultId')
    .sort({ orderedAt: -1 });
  const results = await LabResult.find({ admissionId })
    .populate('verifiedBy', 'name')
    .populate('enteredBy', 'name')
    .sort({ enteredAt: -1 })
    .lean();
  // Section 50: a result becomes clinically actionable for the treating team
  // only after verification. Unverified values are still listed (lab staff need
  // them) but are explicitly marked as not yet released to the doctor.
  const marked = results.map((r) => ({
    ...r,
    releasedToDoctor: ['VERIFIED', 'REPORTED'].includes(r.status),
    awaitingVerification: !['VERIFIED', 'REPORTED'].includes(r.status),
  }));
  return { orders, results: marked };
};

const notifyRoles = async (roleCodes, payload) => {
  try {
    await Notification.create(roleCodes.map((roleCode) => ({
      roleCode,
      type: NOTIFICATION_TYPES.CRITICAL_LAB_RESULT,
      severity: 'CRITICAL',
      ...payload,
    })));
  } catch {
    // notification delivery must never fail the clinical action
  }
};

/** Mark a lab result critical and alert the consultant + nursing + authorised roles. */
export const flagCriticalLabResult = async (resultId, payload, actor) => {
  const result = await LabResult.findById(resultId);
  if (!result) throw new NotFoundError('Lab result not found');

  result.isCritical = true;
  if (Array.isArray(payload.values)) {
    for (const v of result.values) {
      const match = payload.values.find((x) => x.parameter === v.parameter);
      if (match?.flag) v.flag = match.flag;
    }
  }
  if (payload.comments) result.comments = payload.comments;
  await result.save();

  const admission = await IpdAdmission.findById(result.admissionId).select('admissionNumber consultantDoctorId departmentId');
  await notifyRoles(['DOCTOR', 'NURSE_IN_CHARGE', 'LAB_TECHNICIAN', 'SUPER_ADMIN'], {
    title: `CRITICAL lab result — ${result.testName || 'Test'}`,
    message: `${admission?.admissionNumber || 'IPD'}: ${result.testName || 'Test'} has a critical value. Review immediately.${payload.comments ? ` ${payload.comments}` : ''}`,
    link: admission ? `/ipd/admission/${admission._id}?tab=lab` : undefined,
    referenceType: 'LabResult',
    referenceId: result._id,
  });
  emitIpd(IPD_SOCKET_EVENTS.LAB_CRITICAL, {
    admissionId: result.admissionId, admissionNumber: admission?.admissionNumber, test: result.testName, comments: payload.comments,
  }, result.admissionId);

  return result;
};

// ============================================================
// 19. RADIOLOGY INTEGRATION
// ============================================================
export const createRadiologyOrderForAdmission = async (admissionId, payload, actor) => {
  const admission = await requireActiveAdmission(admissionId);
  const requested = Array.isArray(payload.tests) ? payload.tests : (Array.isArray(payload.items) ? payload.items : []);
  if (!requested.length) throw new BadRequestError('At least one imaging study is required');

  const studies = await RadiologyTest.find({ _id: { $in: requested.map((i) => i.radiologyTestId) } });
  if (studies.length !== requested.length) throw new BadRequestError('One or more imaging studies were not found');

  const { resolveDoctorId } = await import('./ipd.service.js');
  const doctorId = await resolveDoctorId(admission, payload, actor, { field: 'ordering doctor' });

  const [order] = await RadiologyOrder.create([{
    radiologyOrderNumber: await generateNumber(NUMBER_PREFIXES.RADIOLOGY_ORDER, new Date().getFullYear()),
    patientId: admission.patientId,
    admissionId,
    doctorId,
    orderedBy: actor?.id,
    clinicalHistory: payload.clinicalHistory,
    priority: payload.priority || 'ROUTINE',
    status: RADIOLOGY_STATUS.ORDERED,
    tests: studies.map((t) => ({
      radiologyTestId: t._id,
      testName: t.name,
      modality: t.modality,
      price: t.price || 0,
      status: RADIOLOGY_STATUS.ORDERED,
      scheduledAt: payload.scheduledAt ? new Date(payload.scheduledAt) : undefined,
    })),
    hospitalId: actor?.hospitalId,
    branchId: actor?.branchId,
  }], { ordered: true });

  if (payload.clinicalOrderId) {
    await ClinicalOrder.findByIdAndUpdate(payload.clinicalOrderId, {
      radiologyOrderId: order._id,
      status: 'IN_PROGRESS',
    });
  }
  return order;
};

export const listAdmissionRadiologyOrders = async (admissionId) => {
  const orders = await RadiologyOrder.find({ admissionId })
    .populate('doctorId', 'name')
    .populate('orderedBy', 'name')
    .populate('tests.reportId')
    .sort({ orderedAt: -1 });
  const reports = await RadiologyReport.find({ patientId: (await IpdAdmission.findById(admissionId).select('patientId'))?.patientId })
    .populate('radiologistId', 'name')
    .populate('verifiedBy', 'name')
    .sort({ enteredAt: -1 });
  return { orders, reports };
};

export const updateRadiologyOrder = async (orderId, payload, actor) => {
  const order = await RadiologyOrder.findById(orderId);
  if (!order) throw new NotFoundError('Radiology order not found');
  const allowed = Object.values(RADIOLOGY_STATUS);
  if (payload.status && !allowed.includes(payload.status)) throw new BadRequestError('Invalid radiology status');

  if (payload.status) {
    order.status = payload.status;
    for (const item of order.tests) {
      if (!item.status || item.status !== RADIOLOGY_STATUS.VERIFIED) item.status = payload.status;
    }
  }
  if (payload.scheduledAt) {
    const when = new Date(payload.scheduledAt);
    for (const item of order.tests) item.scheduledAt = when;
    if (!order.status || order.status === RADIOLOGY_STATUS.ORDERED) order.status = RADIOLOGY_STATUS.SCHEDULED;
  }
  if (payload.scannedAt) {
    const when = new Date(payload.scannedAt);
    for (const item of order.tests) item.scannedAt = when;
    if (order.status === RADIOLOGY_STATUS.SCHEDULED) order.status = RADIOLOGY_STATUS.IN_PROGRESS;
  }
  await order.save();
  return order;
};

export const saveRadiologyReport = async (payload, actor) => {
  if (!payload.radiologyOrderId) throw new BadRequestError('Radiology order is required');
  const order = await RadiologyOrder.findById(payload.radiologyOrderId);
  if (!order) throw new NotFoundError('Radiology order not found');
  const item = payload.itemId
    ? order.tests.find((t) => String(t._id) === String(payload.itemId))
    : order.tests[0];

  const [report] = await RadiologyReport.create([{
    radiologyOrderId: order._id,
    patientId: order.patientId,
    radiologyTestId: item?.radiologyTestId,
    testName: item?.testName,
    clinicalHistory: payload.clinicalHistory,
    findings: payload.findings,
    impression: payload.impression,
    images: payload.images || [],
    docReferences: payload.docReferences || [],
    radiologistId: payload.radiologistId,
    typedBy: actor?.id,
    enteredAt: new Date(),
    status: 'ENTERED',
    hospitalId: actor?.hospitalId,
    branchId: actor?.branchId,
  }], { ordered: true });

  if (item) {
    item.reportId = report._id;
    item.status = RADIOLOGY_STATUS.REPORTING;
    await order.save();
  }
  return report;
};

export const verifyRadiologyReport = async (reportId, actor) => {
  const report = await RadiologyReport.findById(reportId);
  if (!report) throw new NotFoundError('Report not found');
  report.status = 'VERIFIED';
  report.verifiedBy = actor?.id;
  report.verifiedAt = new Date();

  const order = await RadiologyOrder.findById(report.radiologyOrderId);
  if (order) {
  const item = order.tests.find((t) => String(t.reportId) === String(reportId));
  if (item) item.status = RADIOLOGY_STATUS.VERIFIED;
    const allVerified = order.tests.every((i) => i.status === RADIOLOGY_STATUS.VERIFIED || i.status === RADIOLOGY_STATUS.COMPLETED);
    order.status = allVerified ? RADIOLOGY_STATUS.COMPLETED : RADIOLOGY_STATUS.REPORTING;
    await order.save();
  }
  await report.save();

  if (order?.admissionId) {
    await notifyRoles(['DOCTOR', 'RADIOLOGY_TECHNICIAN', 'SUPER_ADMIN'], {
      type: NOTIFICATION_TYPES.LAB_RESULT,
      severity: 'INFO',
      title: `Imaging report verified — ${report.testName || 'Study'}`,
      message: `Report for IP ${order.admissionId} has been verified and released for doctor review.`,
      link: `/ipd/admission/${order.admissionId}?tab=radiology`,
      referenceType: 'RadiologyReport',
      referenceId: report._id,
    });
  }
  return report;
};

// ============================================================
// 20. INPUT / OUTPUT CHART
// ============================================================
export const recordIoEntry = async (admissionId, payload, actor) => {
  const admission = await requireActiveAdmission(admissionId);
  const when = payload.recordedAt ? new Date(payload.recordedAt) : new Date();
  if (Number.isNaN(when.getTime())) throw new BadRequestError('Invalid recorded time');

  const input = {
    oral: nonNegative(payload.input?.oral, 'Oral fluids'),
    ivFluid: nonNegative(payload.input?.ivFluid, 'IV fluids'),
    blood: nonNegative(payload.input?.blood, 'Blood'),
    tubeFeed: nonNegative(payload.input?.tubeFeed, 'Tube feeds'),
    otherInput: nonNegative(payload.input?.otherInput, 'Other input'),
  };
  const output = {
    urine: nonNegative(payload.output?.urine, 'Urine'),
    drain: nonNegative(payload.output?.drain, 'Drain'),
    vomitus: nonNegative(payload.output?.vomitus, 'Vomiting'),
    stool: nonNegative(payload.output?.stool, 'Stool'),
    otherOutput: nonNegative(payload.output?.otherOutput, 'Other output'),
  };
  const inputTotal = Object.values(input).reduce((s, v) => s + v, 0);
  const outputTotal = Object.values(output).reduce((s, v) => s + v, 0);
  if (inputTotal === 0 && outputTotal === 0) throw new BadRequestError('Record at least one input or output value');

  const entry = await IoChartEntry.create({
    admissionId,
    patientId: admission.patientId,
    recordedAt: when,
    entryDate: when.toISOString().slice(0, 10),
    hour: when.getHours(),
    shift: payload.shift || (when.getHours() < 14 ? 'MORNING' : when.getHours() < 20 ? 'EVENING' : 'NIGHT'),
    input,
    output,
    notes: payload.notes,
    recordedBy: actor?.id,
    hospitalId: actor?.hospitalId,
    branchId: actor?.branchId,
  });
  const out = entry.toObject();
  const t = ioEntryTotals(out);
  return { ...out, ...t, balance: Math.round((t.inputTotal - t.outputTotal) * 100) / 100 };
};

export const listIoEntries = async (admissionId) => {
  const entries = await IoChartEntry.find({ admissionId })
    .populate('recordedBy', 'name')
    .sort({ recordedAt: -1 })
    .limit(500);

  const withTotals = entries.map((e) => {
    const o = e.toObject();
    const t = ioEntryTotals(o);
    return { ...o, ...t, balance: Math.round((t.inputTotal - t.outputTotal) * 100) / 100 };
  });

  const sum = (list) => list.reduce((acc, e) => {
    acc.input += e.inputTotal;
    acc.output += e.outputTotal;
    for (const [k, v] of Object.entries(e.input || {})) acc.inputBreakdown[k] = (acc.inputBreakdown[k] || 0) + (Number(v) || 0);
    for (const [k, v] of Object.entries(e.output || {})) acc.outputBreakdown[k] = (acc.outputBreakdown[k] || 0) + (Number(v) || 0);
    return acc;
  }, { input: 0, output: 0, inputBreakdown: {}, outputBreakdown: {} });

  const bucket = (keyFn) => {
    const map = new Map();
    for (const e of withTotals) {
      const key = keyFn(e);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    }
    return [...map.entries()]
      .map(([key, list]) => {
        const t = sum(list);
        return { key, count: list.length, ...t, balance: Math.round((t.input - t.output) * 100) / 100 };
      })
      .sort((a, b) => (a.key < b.key ? -1 : 1));
  };

  return {
    entries: withTotals,
    totals: (() => { const t = sum(withTotals); return { ...t, balance: Math.round((t.input - t.output) * 100) / 100 }; })(),
    hourly: bucket((e) => e.entryDate),
    byShift: bucket((e) => e.shift),
  };
};

// ============================================================
// 21. PROCEDURE MANAGEMENT
// ============================================================
export const createProcedure = async (admissionId, payload, actor) => {
  const admission = await requireActiveAdmission(admissionId);
  if (!payload.name) throw new BadRequestError('Procedure name is required');
  if (payload.category && !PROCEDURE_CATEGORIES.includes(payload.category)) {
    throw new BadRequestError('Invalid procedure category');
  }
  const { resolveDoctorId } = await import('./ipd.service.js');
  const doctorId = await resolveDoctorId(admission, payload, actor, { field: 'performing doctor' });
  return ProcedureRecord.create({
    admissionId,
    patientId: admission.patientId,
    clinicalOrderId: payload.clinicalOrderId,
    name: payload.name,
    category: payload.category || 'OTHER',
    doctorId,
    assistantId: payload.assistantId,
    nurseId: payload.nurseId || actor?.id,
    procedureDate: payload.procedureDate || new Date(),
    indication: payload.indication,
    procedureNotes: payload.procedureNotes,
    consumables: payload.consumables || [],
    medicines: payload.medicines || [],
    equipment: payload.equipment || [],
    charge: nonNegative(payload.charge, 'Charge'),
    status: PROCEDURE_STATUS.PLANNED,
    createdBy: actor?.id,
    hospitalId: actor?.hospitalId,
    branchId: actor?.branchId,
  });
};

export const listProcedures = async (admissionId) => ProcedureRecord.find({ admissionId })
  .populate('doctorId', 'name')
  .populate('assistantId', 'name')
  .populate('nurseId', 'name')
  .populate('createdBy', 'name')
  .sort({ procedureDate: -1 });

export const updateProcedure = async (procedureId, payload, actor) => {
  const procedure = await ProcedureRecord.findById(procedureId);
  if (!procedure) throw new NotFoundError('Procedure not found');
  if (payload.status && !Object.values(PROCEDURE_STATUS).includes(payload.status)) {
    throw new BadRequestError('Invalid procedure status');
  }

  for (const k of ['name', 'indication', 'procedureNotes', 'complications', 'category', 'doctorId', 'assistantId', 'nurseId', 'startTime', 'endTime', 'equipment', 'consumables', 'medicines']) {
    if (payload[k] !== undefined) procedure[k] = payload[k];
  }
  if (payload.status) {
    procedure.status = payload.status;
    if (payload.status === PROCEDURE_STATUS.IN_PROGRESS && !procedure.startTime) procedure.startTime = new Date();
    if (payload.status === PROCEDURE_STATUS.COMPLETED) {
      procedure.endTime = procedure.endTime || new Date();
      if (Number(procedure.charge) > 0 && !procedure.billId) {
        const admission = await IpdAdmission.findById(procedure.admissionId).select('patientId departmentId');
        const bill = await createBillingService({
          patientId: admission.patientId,
          admissionId: procedure.admissionId,
          departmentId: admission.departmentId,
          billType: 'PROCEDURE',
          items: [{
            itemType: 'PROCEDURE',
            serviceCategory: 'PROCEDURE',
            name: procedure.name,
            description: `Procedure charge — ${procedure.name}`,
            quantity: 1,
            rate: procedure.charge,
            referenceId: procedure._id,
            referenceType: 'ProcedureRecord',
          }],
        }, actor);
        procedure.billId = bill._id;
        procedure.billedAt = new Date();
      }
    }
  }
  await procedure.save();
  return procedure;
};

// ============================================================
// 22. OT INTEGRATION
// ============================================================
export const createOtRequest = async (admissionId, payload, actor) => {
  const admission = await requireActiveAdmission(admissionId);
  if (!payload.procedure) throw new BadRequestError('Procedure name is required');
  if (!payload.surgeonId) throw new BadRequestError('Surgeon is required');
  if (!payload.scheduledStart) throw new BadRequestError('Scheduled start is required');

  return Surgery.create({
    patientId: admission.patientId,
    admissionId,
    otId: payload.otId,
    procedure: payload.procedure,
    diagnosis: payload.diagnosis || admission.patientId,
    surgeonId: payload.surgeonId,
    assistantSurgeons: payload.assistantSurgeons || [],
    anaesthetistId: payload.anaesthetistId,
    scheduledStart: new Date(payload.scheduledStart),
    estimatedDurationMin: payload.estimatedDurationMin,
    urgency: payload.urgency || 'ELECTIVE',
    status: 'SCHEDULED',
    bookedBy: actor?.id,
    hospitalId: actor?.hospitalId,
    branchId: actor?.branchId,
  });
};

export const listOtRequests = async (admissionId) => Surgery.find({ admissionId })
  .populate('surgeonId', 'name')
  .populate('assistantSurgeons', 'name')
  .populate('anaesthetistId', 'name')
  .sort({ scheduledStart: -1 });

export const updateOtRequest = async (surgeryId, payload, actor) => {
  const surgery = await Surgery.findById(surgeryId);
  if (!surgery) throw new NotFoundError('OT request not found');
  for (const k of ['status', 'preOpChecklist', 'intraOpNotes', 'postOpNotes', 'findings', 'complications', 'consumables', 'medicinesUsed', 'scheduledStart', 'scheduledEnd', 'actualStart', 'actualEnd']) {
    if (payload[k] !== undefined) surgery[k] = payload[k];
  }
  await surgery.save();
  return surgery;
};

// ============================================================
// 23. DIET MANAGEMENT
// ============================================================
export const createDietOrder = async (admissionId, payload, actor) => {
  const admission = await requireActiveAdmission(admissionId);
  if (!payload.dietType || !Object.values(DIET_TYPES).includes(payload.dietType)) {
    throw new BadRequestError('Valid diet type is required');
  }
  const meals = (Array.isArray(payload.meals) && payload.meals.length ? payload.meals : MEAL_TYPES).map((m) => {
    const meal = typeof m === 'string' ? m : m.meal;
    return {
      meal,
      items: typeof m === 'string' ? undefined : m.items,
      status: MEAL_STATUS.ORDERED,
    };
  });

  const order = await DietOrder.create({
    admissionId,
    patientId: admission.patientId,
    dietType: payload.dietType,
    customDescription: payload.customDescription,
    instructions: payload.instructions,
    validFrom: payload.validFrom,
    validTill: payload.validTill,
    orderedByDoctorId: payload.doctorId,
    orderedBy: actor?.id,
    chargePerDay: nonNegative(payload.chargePerDay, 'Diet charge'),
    meals,
    hospitalId: actor?.hospitalId,
    branchId: actor?.branchId,
  });

  if (order.chargePerDay > 0) {
    const bill = await createBillingService({
      patientId: admission.patientId,
      admissionId,
      billType: 'IPD',
      items: [{
        itemType: 'SERVICE',
        serviceCategory: 'DIET',
        name: `Diet — ${payload.dietType}`,
        description: payload.customDescription || `Diet order (${payload.dietType})`,
        quantity: 1,
        rate: order.chargePerDay,
        referenceId: order._id,
        referenceType: 'DietOrder',
      }],
    }, actor);
    order.billId = bill._id;
    order.billedAt = new Date();
    await order.save();
  }
  return order;
};

export const listDietOrders = async (admissionId) => DietOrder.find({ admissionId })
  .populate('orderedByDoctorId', 'name')
  .populate('orderedBy', 'name')
  .sort({ orderDate: -1 });

export const updateDietMeal = async (orderId, mealName, payload, actor) => {
  const order = await DietOrder.findById(orderId);
  if (!order) throw new NotFoundError('Diet order not found');
  const meal = order.meals.find((m) => m.meal === mealName);
  if (!meal) throw new NotFoundError('Meal not found on this order');

  const status = payload.status;
  if (!status || !Object.values(MEAL_STATUS).includes(status)) throw new BadRequestError('Invalid meal status');

  const stamp = {
    KITCHEN_REQUESTED: ['kitchenRequestedAt', actor?.id],
    PREPARING: ['preparingAt', undefined],
    DISPATCHED: ['dispatchedAt', undefined],
    DELIVERED: ['deliveredAt', actor?.id],
    ACKNOWLEDGED: ['acknowledgedAt', actor?.id],
  }[status];
  if (stamp) {
    meal[stamp[0]] = new Date();
    if (stamp[1]) meal[stamp[1]] = stamp[1];
  }
  meal.status = status;
  if (payload.remarks !== undefined) meal.remarks = payload.remarks;
  await order.save();
  return order;
};

// ============================================================
// 24. BLOOD BANK INTEGRATION
// ============================================================
export const createBloodRequest = async (admissionId, payload, actor) => {
  const admission = await requireActiveAdmission(admissionId);
  if (!payload.component || !BLOOD_COMPONENTS.includes(payload.component)) {
    throw new BadRequestError('Valid blood component is required');
  }
  const units = Number(payload.unitsRequested);
  if (!Number.isFinite(units) || units <= 0) throw new BadRequestError('Units must be greater than 0');

  const patient = await Patient.findById(admission.patientId).select('uhid bloodGroup');
  return BloodRequest.create({
    requestNumber: await generateNumber('BDR', new Date().getFullYear()),
    admissionId,
    patientId: admission.patientId,
    admissionNumber: admission.admissionNumber,
    uhid: patient?.uhid,
    bloodGroup: payload.bloodGroup || patient?.bloodGroup || 'UNKNOWN',
    component: payload.component,
    unitsRequested: units,
    priority: payload.priority || 'ROUTINE',
    reason: payload.reason,
    doctorId: payload.doctorId,
    neededBy: payload.neededBy,
    requestedBy: actor?.id,
    hospitalId: actor?.hospitalId,
    branchId: actor?.branchId,
  });
};

export const listBloodRequests = async (admissionId) => BloodRequest.find({ admissionId })
  .populate('doctorId', 'name')
  .populate('requestedBy', 'name')
  .populate('issuedBy', 'name')
  .sort({ requestedAt: -1 });

export const updateBloodRequest = async (requestId, payload, actor) => {
  const request = await BloodRequest.findById(requestId);
  if (!request) throw new NotFoundError('Blood request not found');
  const status = payload.status;
  if (!status || !Object.values(BLOOD_REQUEST_STATUS).includes(status)) throw new BadRequestError('Invalid blood request status');

  request.status = status;
  if (status === BLOOD_REQUEST_STATUS.SCREENING) {
    request.screenedAt = new Date();
    request.screenedBy = actor?.id;
    request.screeningNotes = payload.notes;
  }
  if (status === BLOOD_REQUEST_STATUS.AVAILABLE || status === BLOOD_REQUEST_STATUS.PARTIAL) {
    request.unitsIssued = Number(payload.unitsIssued || request.unitsRequested);
  }
  if (status === BLOOD_REQUEST_STATUS.ISSUED) {
    request.issuedAt = new Date();
    request.issuedBy = actor?.id;
    request.unitsIssued = Number(payload.unitsIssued || request.unitsRequested);
    if (Array.isArray(payload.collectionIds)) request.collectionIds = payload.collectionIds;
  }
  if (status === BLOOD_REQUEST_STATUS.TRANSFUSED) {
    request.startedAt = payload.startedAt ? new Date(payload.startedAt) : new Date();
    request.endedAt = payload.endedAt ? new Date(payload.endedAt) : new Date();
    request.transfusedAt = new Date();
    request.transfusedBy = actor?.id;
  }
  if (status === BLOOD_REQUEST_STATUS.REJECTED && payload.notes) request.screeningNotes = payload.notes;

  if (payload.reaction) {
    request.reaction = {
      occurred: Boolean(payload.reaction.occurred),
      type: payload.reaction.type,
      severity: payload.reaction.severity,
      notes: payload.reaction.notes,
      monitoredBy: actor?.id,
      reportedAt: new Date(),
    };
  }
  await request.save();
  return request;
};

// ============================================================
// 25. PHYSIOTHERAPY
// ============================================================
export const createPhysioRequest = async (admissionId, payload, actor) => {
  const admission = await requireActiveAdmission(admissionId);
  if (!payload.procedure) throw new BadRequestError('Physiotherapy procedure is required');
  const total = Math.max(1, parseInt(payload.totalSessions, 10) || 1);

  return PhysiotherapyRequest.create({
    admissionId,
    patientId: admission.patientId,
    clinicalOrderId: payload.clinicalOrderId,
    procedure: payload.procedure,
    indication: payload.indication,
    doctorId: payload.doctorId,
    therapistId: payload.therapistId,
    therapistName: payload.therapistName,
    totalSessions: total,
    chargePerSession: nonNegative(payload.chargePerSession, 'Session charge'),
    notes: payload.notes,
    sessions: Array.from({ length: total }, (_, i) => ({
      sessionNumber: i + 1,
      scheduledAt: payload.firstSessionAt ? new Date(new Date(payload.firstSessionAt).getTime() + i * 86400000) : undefined,
      status: PHYSIO_SESSION_STATUS.SCHEDULED,
    })),
    requestedBy: actor?.id,
    hospitalId: actor?.hospitalId,
    branchId: actor?.branchId,
  });
};

export const listPhysioRequests = async (admissionId) => PhysiotherapyRequest.find({ admissionId })
  .populate('doctorId', 'name')
  .populate('therapistId', 'name')
  .sort({ createdAt: -1 });

export const recordPhysioSession = async (requestId, sessionId, payload, actor) => {
  const request = await PhysiotherapyRequest.findById(requestId);
  if (!request) throw new NotFoundError('Physiotherapy request not found');
  const session = request.sessions.id(sessionId);
  if (!session) throw new NotFoundError('Session not found');

  const status = payload.status || PHYSIO_SESSION_STATUS.COMPLETED;
  if (!Object.values(PHYSIO_SESSION_STATUS).includes(status)) throw new BadRequestError('Invalid session status');

  session.status = status;
  session.therapistId = actor?.id;
  session.therapistName = session.therapistName || actor?.name;
  session.procedurePerformed = payload.procedurePerformed;
  session.notes = payload.notes;
  if (payload.progress) session.progress = payload.progress;
  if (status === PHYSIO_SESSION_STATUS.COMPLETED) session.completedAt = new Date();

  request.completedSessions = request.sessions.filter((s) => s.status === PHYSIO_SESSION_STATUS.COMPLETED).length;
  if (request.completedSessions >= request.totalSessions) request.status = PHYSIO_REQUEST_STATUS.COMPLETED;
  else if (request.completedSessions > 0) request.status = PHYSIO_REQUEST_STATUS.IN_PROGRESS;
  await request.save();

  // bill each completed session once
  if (status === PHYSIO_SESSION_STATUS.COMPLETED && request.chargePerSession > 0) {
    const alreadyBilled = request.sessions.filter((s) => s.status === PHYSIO_SESSION_STATUS.COMPLETED).length;
    if (alreadyBilled > (request.billedSessions || 0)) {
      const bill = await createBillingService({
        patientId: request.patientId,
        admissionId: request.admissionId,
        billType: 'IPD',
        items: [{
          itemType: 'SERVICE',
          serviceCategory: 'PHYSIOTHERAPY',
          name: `Physiotherapy — ${request.procedure}`,
          description: `Session ${session.sessionNumber} of ${request.totalSessions}`,
          quantity: 1,
          rate: request.chargePerSession,
          referenceId: request._id,
          referenceType: 'PhysiotherapyRequest',
        }],
      }, actor);
      request.billId = bill._id;
      request.billedSessions = alreadyBilled;
      request.billedAt = new Date();
      await request.save();
    }
  }
  return request;
};

export const listPhysioStats = async (admissionId) => {
  const requests = await PhysiotherapyRequest.find({ admissionId }).select('procedure totalSessions completedSessions status');
  return requests.map((r) => ({
    procedure: r.procedure,
    totalSessions: r.totalSessions,
    completedSessions: r.completedSessions,
    status: r.status,
  }));
};

export const IPD_WORKFLOW_ENUMS = {
  IO_INPUT_TYPES,
  IO_OUTPUT_TYPES,
  PROCEDURE_STATUS,
  PROCEDURE_CATEGORIES,
  DIET_TYPES,
  MEAL_TYPES,
  MEAL_STATUS,
  BLOOD_COMPONENTS,
  BLOOD_REQUEST_STATUS,
  PHYSIO_REQUEST_STATUS,
  PHYSIO_SESSION_STATUS,
  PHARMACY_REQUEST_STATUS,
  MED_ADMIN_STATUS,
  LAB_ORDER_STATUS,
  RADIOLOGY_STATUS,
};
