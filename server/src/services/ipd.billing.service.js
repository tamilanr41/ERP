import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import IpdAdmission, { ADMISSION_STATUS, DISCHARGE_STAGE, DISCHARGE_TYPE } from '../models/IpdAdmission.model.js';
import Bill from '../models/Bill.model.js';
import IpdServiceCharge, { IPD_SERVICE_CODES, BILLING_FREQUENCY } from '../models/IpdServiceCharge.model.js';
import IpdAdvance, { ADVANCE_TYPES, ADVANCE_STATUS, ADVANCE_MODES } from '../models/IpdAdvance.model.js';
import IpdSettlement from '../models/IpdSettlement.model.js';
import DischargeSummary from '../models/DischargeSummary.model.js';
import DoctorVisit from '../models/DoctorVisit.model.js';
import ClinicalNote, { CLINICAL_NOTE_TYPES } from '../models/ClinicalNote.model.js';
import NursingNote from '../models/NursingNote.model.js';
import MedicationChart, { MED_ADMIN_STATUS } from '../models/MedicationChart.model.js';
import LabOrder, { LAB_ORDER_STATUS } from '../models/LabOrder.model.js';
import RadiologyOrder, { RADIOLOGY_STATUS } from '../models/RadiologyOrder.model.js';
import ProcedureRecord, { PROCEDURE_STATUS } from '../models/ProcedureRecord.model.js';
import DietOrder from '../models/DietOrder.model.js';
import BloodRequest, { BLOOD_REQUEST_STATUS } from '../models/BloodRequest.model.js';
import PhysiotherapyRequest from '../models/PhysiotherapyRequest.model.js';
import PharmacyRequest, { PHARMACY_REQUEST_STATUS } from '../models/PharmacyRequest.model.js';
import Surgery from '../models/Surgery.model.js';
import Patient from '../models/Patient.model.js';
import Hospital from '../models/Hospital.model.js';
import FollowUp from '../models/FollowUp.model.js';
import InsuranceCompany, { PreAuthorization, InsuranceClaim } from '../models/Insurance.model.js';
import Notification, { NOTIFICATION_TYPES } from '../models/Notification.model.js';
import { generateNumber, NUMBER_PREFIXES } from '../utils/numberGenerator.js';
import { computeBillTotals, round2, createBillingService } from './billing.service.js';
import { BadRequestError, NotFoundError, ConflictError } from '../utils/ApiError.js';
import { emitIpd, IPD_SOCKET_EVENTS } from '../utils/socket.io.server.js';

const ACTIVE_STATUSES = [ADMISSION_STATUS.ADMITTED, ADMISSION_STATUS.TRANSFERRED, ADMISSION_STATUS.DISCHARGE_PLANNED];
const round = (n) => round2(Number(n) || 0);
const sum = (arr, pick) => round(arr.reduce((s, x) => s + (Number(pick ? pick(x) : x) || 0), 0));

const getAdmission = async (id) => {
  const admission = await IpdAdmission.findById(id);
  if (!admission) throw new NotFoundError('Admission not found');
  return admission;
};

// ============================================================
// 26. CONFIGURABLE CHARGE CATALOGUE
// ============================================================
const DEFAULT_CHARGES = [
  { serviceCode: IPD_SERVICE_CODES.ROOM_RENT, label: 'Room Rent', billingFrequency: BILLING_FREQUENCY.DAILY, autoCapture: true, rate: 0, taxPct: 0 },
  { serviceCode: IPD_SERVICE_CODES.NURSING, label: 'Nursing Charges', billingFrequency: BILLING_FREQUENCY.DAILY, autoCapture: true, rate: 0 },
  { serviceCode: IPD_SERVICE_CODES.DOCTOR_VISIT, label: 'Doctor Visit', billingFrequency: BILLING_FREQUENCY.PER_EVENT, autoCapture: true, rate: 0 },
  { serviceCode: IPD_SERVICE_CODES.LABORATORY, label: 'Laboratory', billingFrequency: BILLING_FREQUENCY.PER_EVENT, autoCapture: true, rate: 0 },
  { serviceCode: IPD_SERVICE_CODES.RADIOLOGY, label: 'Radiology & Imaging', billingFrequency: BILLING_FREQUENCY.PER_EVENT, autoCapture: true, rate: 0 },
  { serviceCode: IPD_SERVICE_CODES.BLOOD_BANK, label: 'Blood Bank', billingFrequency: BILLING_FREQUENCY.PER_UNIT, autoCapture: true, rate: 0 },
  { serviceCode: IPD_SERVICE_CODES.OT, label: 'OT Charges', billingFrequency: BILLING_FREQUENCY.PER_EVENT, autoCapture: true, rate: 0 },
  { serviceCode: IPD_SERVICE_CODES.CONSUMABLES, label: 'Consumables', billingFrequency: BILLING_FREQUENCY.PER_EVENT, autoCapture: true, rate: 0 },
  { serviceCode: IPD_SERVICE_CODES.IMPLANTS, label: 'Implants', billingFrequency: BILLING_FREQUENCY.PER_EVENT, autoCapture: false, rate: 0 },
  { serviceCode: IPD_SERVICE_CODES.PROCEDURE, label: 'Procedures', billingFrequency: BILLING_FREQUENCY.PER_EVENT, autoCapture: false, billedAtSource: true },
  { serviceCode: IPD_SERVICE_CODES.PHARMACY, label: 'Pharmacy', billingFrequency: BILLING_FREQUENCY.PER_EVENT, autoCapture: false, billedAtSource: true },
  { serviceCode: IPD_SERVICE_CODES.PHYSIOTHERAPY, label: 'Physiotherapy', billingFrequency: BILLING_FREQUENCY.PER_SESSION, autoCapture: false, billedAtSource: true },
  { serviceCode: IPD_SERVICE_CODES.DIET, label: 'Diet', billingFrequency: BILLING_FREQUENCY.PER_DAY, autoCapture: false, billedAtSource: true },
  { serviceCode: IPD_SERVICE_CODES.OTHER_SERVICES, label: 'Other Services', billingFrequency: BILLING_FREQUENCY.MANUAL, autoCapture: false },
];

export const ensureChargeConfig = async () => {
  for (const def of DEFAULT_CHARGES) {
    // eslint-disable-next-line no-await-in-loop
    const existing = await IpdServiceCharge.findOne({ serviceCode: def.serviceCode });
    if (!existing) {
      // eslint-disable-next-line no-await-in-loop
      await IpdServiceCharge.create({ ...def, billingFrequency: Object.values(BILLING_FREQUENCY).includes(def.billingFrequency) ? def.billingFrequency : BILLING_FREQUENCY.DAILY });
    }
  }
};

export const listChargeConfig = async () => IpdServiceCharge.find({}).populate('departmentId', 'name').sort({ serviceCode: 1 });

export const upsertChargeConfig = async (serviceCode, payload, actor) => {
  if (!Object.values(IPD_SERVICE_CODES).includes(serviceCode)) throw new BadRequestError('Unknown service code');
  const doc = await IpdServiceCharge.findOneAndUpdate(
    { serviceCode },
    {
      label: payload.label,
      rate: payload.rate != null ? round(payload.rate) : undefined,
      billingFrequency: payload.billingFrequency ? Object.values(BILLING_FREQUENCY).includes(payload.billingFrequency) ? payload.billingFrequency : BILLING_FREQUENCY.DAILY : undefined,
      autoCapture: payload.autoCapture,
      billedAtSource: payload.billedAtSource,
      taxPct: payload.taxPct != null ? Number(payload.taxPct) : undefined,
      departmentId: payload.departmentId,
      active: payload.active,
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  return doc;
};

const chargeMap = async () => {
  const list = await IpdServiceCharge.find({ active: true }).lean();
  const map = {};
  for (const c of list) map[c.serviceCode] = c;
  return map;
};

// ============================================================
// 26. DAILY IPD BILLING — automatic charge capture
// ============================================================
const dayKey = (d) => new Date(d).toISOString().slice(0, 10);
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOfDay = (d) => { const x = startOfDay(d); x.setDate(x.getDate() + 1); return x; };
const withinDay = (d, date) => d && dayKey(d) === dayKey(date);

const sameLine = (items, line) => items.some((i) =>
  i.serviceCategory === line.serviceCategory
  && String(i.referenceId || '') === String(line.referenceId || '')
  && i.serviceDate && line.serviceDate
  && dayKey(i.serviceDate) === dayKey(line.serviceDate));

/**
 * Build (but do not post) the charge lines for one admission for a given day.
 * Charges that are already billed at source (pharmacy issue, completed
 * procedure, diet order, physio session) are never double-captured.
 */
export const buildDailyChargeLines = async (admission, charges, date) => {
  const lines = [];
  const on = (code) => charges[code];
  const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);

  // --- room rent: the bed's own tariff wins over the configured default
  const room = on(IPD_SERVICE_CODES.ROOM_RENT);
  if (room?.autoCapture && admission.bedId) {
    const rate = admission.bedId.chargePerDay || room.rate || 0;
    if (rate > 0) {
      lines.push({
        itemType: 'ROOM', name: `Room Rent — ${admission.bedId.code || admission.bedId.bedNumber}`, code: 'ROOM',
        quantity: 1, rate, serviceDate: dayStart, serviceCategory: IPD_SERVICE_CODES.ROOM_RENT,
        departmentId: room.departmentId, referenceType: 'Bed', referenceId: admission.bedId._id, gstPct: room.taxPct || 0,
        description: `Accommodation charge for ${dayKey(date)}`,
      });
    }
  }

  // --- nursing: flat per-day configured rate
  const nursing = on(IPD_SERVICE_CODES.NURSING);
  if (nursing?.autoCapture && (nursing.rate || 0) > 0) {
    lines.push({
      itemType: 'NURSING', name: 'Nursing Charges', code: 'NURSING', quantity: 1, rate: nursing.rate,
      serviceDate: dayStart, serviceCategory: IPD_SERVICE_CODES.NURSING, departmentId: nursing.departmentId, gstPct: nursing.taxPct || 0,
      description: 'Nursing care for 24h',
    });
  }

  // --- doctor visits recorded that day
  const visitCfg = on(IPD_SERVICE_CODES.DOCTOR_VISIT);
  if (visitCfg?.autoCapture && (visitCfg.rate || 0) > 0) {
    const visits = await DoctorVisit.find({ admissionId: admission._id, visitDate: { $gte: dayStart, $lt: dayEnd } });
    for (const v of visits) {
      lines.push({
        itemType: 'CONSULTATION', name: `Doctor Visit — ${v.doctorId?.name || 'Consultant'}`, code: 'DOCTOR_VISIT',
        quantity: 1, rate: visitCfg.rate, serviceDate: v.visitDate, serviceCategory: IPD_SERVICE_CODES.DOCTOR_VISIT,
        departmentId: v.departmentId, referenceType: 'DoctorVisit', referenceId: v._id, gstPct: visitCfg.taxPct || 0,
        description: `${String(v.visitType || 'ROUND').toLowerCase()} visit`,
      });
    }
  }

  // --- laboratory: items of lab orders placed that day (not already billed)
  const labCfg = on(IPD_SERVICE_CODES.LABORATORY);
  if (labCfg?.autoCapture) {
    const labOrders = await LabOrder.find({ admissionId: admission._id, orderedAt: { $gte: dayStart, $lt: dayEnd } });
    for (const o of labOrders) {
      if (o.billId) continue;
      for (const item of o.items || []) {
        if (!item.price) continue;
        lines.push({
          itemType: 'TEST', name: `Lab — ${item.testName}`, code: item.labTestId?.toString?.() || 'LAB',
          quantity: 1, rate: item.price, serviceDate: o.orderedAt, serviceCategory: IPD_SERVICE_CODES.LABORATORY,
          referenceType: 'LabOrderItem', referenceId: o._id, gstPct: labCfg.taxPct || 0,
          description: `Lab order ${o.labOrderNumber || ''}`,
        });
      }
    }
  }

  // --- radiology: tests scheduled/scanned that day
  const radCfg = on(IPD_SERVICE_CODES.RADIOLOGY);
  if (radCfg?.autoCapture) {
    const radOrders = await RadiologyOrder.find({ admissionId: admission._id, orderedAt: { $gte: dayStart, $lt: dayEnd } });
    for (const o of radOrders) {
      if (o.billId) continue;
      for (const t of o.tests || []) {
        if (!t.price) continue;
        lines.push({
          itemType: 'TEST', name: `Imaging — ${t.testName}`, code: t.radiologyTestId?.toString?.() || 'RAD',
          quantity: 1, rate: t.price, serviceDate: t.scannedAt || o.orderedAt, serviceCategory: IPD_SERVICE_CODES.RADIOLOGY,
          referenceType: 'RadiologyOrderItem', referenceId: o._id, gstPct: radCfg.taxPct || 0,
          description: `${String(t.modality || '').replace(/_/g, ' ')} study`,
        });
      }
    }
  }

  // --- blood bank: units issued that day
  const bloodCfg = on(IPD_SERVICE_CODES.BLOOD_BANK);
  if (bloodCfg?.autoCapture) {
    const issued = await BloodRequest.find({
      admissionId: admission._id,
      status: { $in: [BLOOD_REQUEST_STATUS.ISSUED, BLOOD_REQUEST_STATUS.TRANSFUSED] },
      issuedAt: { $gte: dayStart, $lt: dayEnd },
    });
    for (const b of issued) {
      const units = b.unitsIssued || 0;
      if (!units) continue;
      lines.push({
        itemType: 'SERVICE', name: `Blood Bank — ${String(b.component).replace(/_/g, ' ')}`, code: 'BLOOD',
        quantity: units, rate: bloodCfg.rate || 0, serviceDate: b.issuedAt, serviceCategory: IPD_SERVICE_CODES.BLOOD_BANK,
        referenceType: 'BloodRequest', referenceId: b._id, gstPct: bloodCfg.taxPct || 0,
        description: b.bloodGroup ? `Group ${b.bloodGroup}` : undefined,
      });
    }
  }

  // --- OT charges + consumables for surgeries not yet billed
  const otCfg = on(IPD_SERVICE_CODES.OT);
  const consCfg = on(IPD_SERVICE_CODES.CONSUMABLES);
  const surgeries = await Surgery.find({
    admissionId: admission._id,
    status: { $in: ['COMPLETED', 'IN_PROGRESS'] },
    scheduledStart: { $gte: dayStart, $lt: dayEnd },
  });
  for (const s of surgeries) {
    if (!s.billId && otCfg?.autoCapture && (otCfg.rate || 0) > 0) {
      lines.push({
        itemType: 'OT', name: `OT — ${s.procedure}`, code: 'OT', quantity: 1, rate: otCfg.rate,
        serviceDate: s.actualStart || s.scheduledStart, serviceCategory: IPD_SERVICE_CODES.OT,
        referenceType: 'Surgery', referenceId: s._id, gstPct: otCfg.taxPct || 0,
      });
    }
    for (const c of s.consumables || []) {
      const amount = round((c.quantity || 1) * (c.rate || 0));
      if (!amount) continue;
      if (consCfg?.autoCapture) {
        lines.push({
          itemType: 'SERVICE', name: `Consumable — ${c.itemName}`, code: 'CONS', quantity: c.quantity || 1, rate: c.rate || 0,
          serviceDate: s.actualStart || s.scheduledStart, serviceCategory: IPD_SERVICE_CODES.CONSUMABLES,
          referenceType: 'SurgeryConsumable', referenceId: s._id,
        });
      }
    }
  }

  // --- procedure consumables for procedures completed that day (procedure fee itself is billed at source)
  if (consCfg?.autoCapture) {
    const procs = await ProcedureRecord.find({
      admissionId: admission._id,
      status: PROCEDURE_STATUS.COMPLETED,
      endTime: { $gte: dayStart, $lt: dayEnd },
    });
    for (const p of procs) {
      for (const c of p.consumables || []) {
        const amount = round((c.quantity || 1) * (c.rate || 0));
        if (!amount) continue;
        lines.push({
          itemType: 'SERVICE', name: `Consumable — ${c.itemName}`, code: 'CONS', quantity: c.quantity || 1, rate: c.rate || 0,
          serviceDate: p.endTime, serviceCategory: IPD_SERVICE_CODES.CONSUMABLES,
          referenceType: 'ProcedureConsumable', referenceId: p._id,
        });
      }
    }
  }

  return lines.filter((l) => (Number(l.rate) || 0) > 0);
};

/** Capture one day of configured charges for an admission into a bill. */
export const runDailyBilling = async (admissionId, options, actor) => {
  const date = options?.date ? new Date(options.date) : new Date();
  const admission = await IpdAdmission.findById(admissionId).populate('bedId', 'bedNumber code chargePerDay bedType');
  if (!admission) throw new NotFoundError('Admission not found');
  if (!ACTIVE_STATUSES.includes(admission.status)) {
    throw new BadRequestError(`Daily billing runs only for active admissions (this one is ${admission.status})`);
  }
  const charges = await chargeMap();
  const candidates = await buildDailyChargeLines(admission, charges, date);

  // idempotent: never post the same charge twice for the same service date
  const existingBills = await Bill.find({
    admissionId,
    billType: 'IPD',
    status: { $nin: ['CANCELLED'] },
    items: { $elemMatch: { serviceDate: { $gte: startOfDay(date), $lt: endOfDay(date) } } },
  }).select('items');
  const alreadyPosted = existingBills.flatMap((b) => (b.items || []).map((i) => i.toObject?.() ?? i));

  const lines = candidates.filter((l) => !alreadyPosted.some((x) =>
    x.serviceCategory === l.serviceCategory
    && String(x.referenceId || '') === String(l.referenceId || '')
    && x.serviceDate && l.serviceDate
    && dayKey(x.serviceDate) === dayKey(l.serviceDate)));

  if (!lines.length) {
    return { bill: null, lines: [], skipped: candidates.length, message: `All ${candidates.length} configured charge(s) for ${dayKey(date)} are already billed` };
  }

  const bill = await createBillingService({
    patientId: admission.patientId,
    admissionId: admission._id,
    departmentId: admission.departmentId,
    doctorId: admission.consultantDoctorId,
    billType: 'IPD',
    items: lines.map((l) => ({
      itemType: l.itemType,
      name: l.name,
      description: l.description,
      code: l.code,
      quantity: l.quantity,
      rate: l.rate,
      gstPct: l.gstPct || 0,
      serviceDate: l.serviceDate,
      departmentId: l.departmentId,
      serviceCategory: l.serviceCategory,
      // Section 50: every posted line keeps a real link back to the configured
      // service charge it came from, not just a category string.
      serviceChargeId: l.serviceChargeId || charges?.[l.serviceCategory]?._id || null,
      referenceId: l.referenceId,
      referenceType: l.referenceType,
    })),
  }, actor);
  return { bill, lines: bill.items, message: `${bill.items.length} charge line(s) captured for ${dayKey(date)}` };
};

/** Run daily billing for every active admission (nightly job / manual desk run). */
export const runDailyBillingAll = async (options, actor) => {
  const admissions = await IpdAdmission.find({ status: { $in: ACTIVE_STATUSES } }).select('_id admissionNumber patientId');
  const results = [];
  for (const a of admissions) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await runDailyBilling(a._id, options, actor);
      results.push({ admissionId: a._id, admissionNumber: a.admissionNumber, billId: r.bill?._id || null, lines: r.lines.length, message: r.message });
    } catch (err) {
      results.push({ admissionId: a._id, admissionNumber: a.admissionNumber, error: err.message });
    }
  }
  return results;
};

export const previewDailyBilling = async (admissionId, options) => {
  const admission = await IpdAdmission.findById(admissionId).populate('bedId', 'bedNumber code chargePerDay bedType');
  if (!admission) throw new NotFoundError('Admission not found');
  const charges = await chargeMap();
  const date = options?.date ? new Date(options.date) : new Date();
  const lines = await buildDailyChargeLines(admission, charges, date);
  const totals = computeBillTotals(lines);
  return { date: dayKey(date), lines, totals };
};

// ============================================================
// 27. ADVANCE COLLECTION
// ============================================================
export const collectAdvance = async (admissionId, payload, actor) => {
  const admission = await getAdmission(admissionId);
  const amount = round(payload.amount);
  if (!(amount > 0)) throw new BadRequestError('Advance amount must be greater than zero');
  if (!ADVANCE_MODES.includes(payload.mode)) throw new BadRequestError('Invalid payment mode');
  if (payload.advanceType && !Object.values(ADVANCE_TYPES).includes(payload.advanceType)) {
    throw new BadRequestError('Invalid advance type');
  }

  const patient = await Patient.findById(admission.patientId).select('firstName lastName uhid');
  const [advance] = await IpdAdvance.create([{
    receiptNumber: await generateNumber(NUMBER_PREFIXES.RECEIPT, new Date().getFullYear()),
    admissionId,
    patientId: admission.patientId,
    admissionNumber: admission.admissionNumber,
    patientName: patient ? `${patient.firstName} ${patient.lastName || ''}`.trim() : undefined,
    uhid: patient?.uhid,
    advanceType: payload.advanceType || ADVANCE_TYPES.ADMISSION,
    amount,
    availableAmount: amount,
    mode: payload.mode,
    referenceNumber: payload.referenceNumber,
    collectedBy: actor?.id,
    isRefundable: payload.isRefundable !== false,
    hospitalId: actor?.hospitalId,
    branchId: actor?.branchId,
  }], { ordered: true });

  // section 38: the advance receipt is itself a document
  const { registerGeneratedDocument } = await import('./ipd.transfer.service.js');
  await registerGeneratedDocument({
    admissionId,
    patientId: admission.patientId,
    ipNumber: admission.admissionNumber,
    documentType: 'ADVANCE_RECEIPT',
    sourceType: 'IpdAdvance',
    sourceId: advance._id,
    title: `Advance Receipt ${advance.receiptNumber}`,
    snapshot: { amount: advance.amount, mode: advance.mode, advanceType: advance.advanceType },
    actor,
  }).catch(() => {});

  return advance;
};

export const listAdvances = async (admissionId) => IpdAdvance.find({ admissionId })
  .populate('collectedBy', 'name')
  .populate('adjustments.by', 'name')
  .sort({ collectedAt: -1 });

export const advanceSummary = async (admissionId) => {
  const advances = await IpdAdvance.find({ admissionId, status: { $ne: ADVANCE_STATUS.CANCELLED } }).lean();
  const total = sum(advances, (a) => a.amount);
  const adjusted = sum(advances, (a) => a.adjustedAmount);
  const refunded = sum(advances, (a) => a.refundedAmount);
  const available = sum(advances, (a) => a.availableAmount);
  return { totalAdvance: total, adjustedAmount: adjusted, refundedAmount: refunded, availableAdvance: available, count: advances.length };
};

/** Apply available advance against a bill (consumes the deposit). */
export const adjustAdvanceToBill = async (admissionId, payload, actor) => {
  const bill = await Bill.findOne({ _id: payload.billId, admissionId });
  if (!bill) throw new NotFoundError('Bill not found for this admission');
  if (bill.dueAmount <= 0) throw new BadRequestError('This bill has no outstanding amount');

  const amount = round(payload.amount || bill.dueAmount);
  if (amount <= 0) throw new BadRequestError('Adjustment amount must be positive');
  if (amount > bill.dueAmount + 0.01) throw new ConflictError('Adjustment exceeds the bill due amount');

  const advances = await IpdAdvance.find({
    admissionId,
    status: { $in: [ADVANCE_STATUS.UNADJUSTED, ADVANCE_STATUS.PARTIAL] },
    availableAmount: { $gt: 0 },
  }).sort({ collectedAt: 1 });

  let remaining = amount;
  const used = [];
  for (const adv of advances) {
    if (remaining <= 0) break;
    const take = Math.min(round(adv.availableAmount), remaining);
    if (take <= 0) continue;
    adv.availableAmount = round(adv.availableAmount - take);
    adv.adjustedAmount = round(adv.adjustedAmount + take);
    adv.status = adv.availableAmount <= 0 ? ADVANCE_STATUS.ADJUSTED : ADVANCE_STATUS.PARTIAL;
    adv.adjustments.push({ billId: bill._id, billNumber: bill.billNumber, amount: take, by: actor?.id, note: payload.note });
    // eslint-disable-next-line no-await-in-loop
    await adv.save();
    used.push({ receiptNumber: adv.receiptNumber, amount: take });
    remaining = round(remaining - take);
  }

  if (!used.length) throw new BadRequestError('No advance balance available to adjust');

  const adjusted = round(amount - remaining);
  bill.paidAmount = round(bill.paidAmount + adjusted);
  bill.dueAmount = round(Math.max(bill.netTotal - bill.paidAmount, 0));
  bill.status = bill.dueAmount <= 0 ? 'PAID' : bill.paidAmount > 0 ? 'PARTIALLY_PAID' : bill.status;
  await bill.save();

  return { bill, applied: adjusted, remaining, used };
};

export const refundAdvance = async (advanceId, payload, actor) => {
  const advance = await IpdAdvance.findById(advanceId);
  if (!advance) throw new NotFoundError('Advance not found');
  const amount = round(payload.amount);
  if (!(amount > 0)) throw new BadRequestError('Refund amount must be greater than zero');
  if (amount > advance.availableAmount) throw new ConflictError('Refund exceeds available advance');
  if (!advance.isRefundable) throw new BadRequestError('This advance is marked non-refundable');

  advance.availableAmount = round(advance.availableAmount - amount);
  advance.refundedAmount = round(advance.refundedAmount + amount);
  advance.refundHistory.push({ amount, by: actor?.id, reason: payload.reason, mode: payload.mode || advance.mode });
  advance.status = advance.availableAmount <= 0 && advance.adjustedAmount > 0
    ? ADVANCE_STATUS.ADJUSTED
    : advance.availableAmount <= 0 ? ADVANCE_STATUS.REFUNDED : advance.status;
  await advance.save();
  return advance;
};

// ============================================================
// 28. ADVANCE ALERTS
// ============================================================
export const ALERT_THRESHOLD_DEFAULTS = { lowAdvance: 5000, criticalAdvance: 2000, estimatedBillBuffer: 0 };

const alertConfig = async () => {
  const { default: Setting } = await import('../models/Setting.model.js');
  const doc = await Setting.findOne({ key: 'ipd.advanceAlert' }).lean().catch(() => null);
  return { ...ALERT_THRESHOLD_DEFAULTS, ...(doc?.value || {}) };
};

export const getAdvanceAlertConfig = async () => alertConfig();

export const setAdvanceAlertConfig = async (value, actor) => {
  const { default: Setting } = await import('../models/Setting.model.js');
  await Setting.findOneAndUpdate({ key: 'ipd.advanceAlert' }, { key: 'ipd.advanceAlert', value: { ...ALERT_THRESHOLD_DEFAULTS, ...value } }, { upsert: true, new: true });
  return { key: 'ipd.advanceAlert', value: { ...ALERT_THRESHOLD_DEFAULTS, ...value } };
};

const notifyBillingTeam = async (payload) => {
  try {
    await Notification.create(['BILLING', 'RECEPTIONIST', 'HOSPITAL_ADMIN', 'SUPER_ADMIN'].map((roleCode) => ({
      roleCode,
      type: NOTIFICATION_TYPES.PAYMENT_DUE,
      severity: payload.level === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
      ...payload,
    })));
  } catch {
    // alerts must never break the billing run
  }
};

/**
 * Estimate the running bill, compare with advances and raise an alert.
 * Financial alerts are informational only — clinical care is never blocked.
 */
export const checkAdvanceAlert = async (admissionId, actor) => {
  const admission = await getAdmission(admissionId);
  const config = await alertConfig();
  const [bills, summary] = await Promise.all([
    Bill.find({ admissionId, status: { $nin: ['CANCELLED', 'DRAFT'] } }),
    advanceSummary(admissionId),
  ]);
  const estimated = sum(bills, (b) => b.netTotal);
  const paid = sum(bills, (b) => b.paidAmount);
  const due = sum(bills, (b) => b.dueAmount);
  const outstanding = round(Math.max(estimated - paid - summary.adjustedAmount, 0));
  const netAvailable = round(summary.availableAdvance);

  let level = 'OK';
  let message = null;
  if (netAvailable <= 0 && due > 0) {
    level = 'CRITICAL';
    message = 'No advance balance and an outstanding bill. Collect payment or arrange credit/sponsor approval.';
  } else if (netAvailable < config.criticalAdvance) {
    level = 'CRITICAL';
    message = `Advance balance below critical threshold (₹${netAvailable} < ₹${config.criticalAdvance}).`;
  } else if (netAvailable < config.lowAdvance) {
    level = 'WARNING';
    message = `Advance balance below configured threshold (₹${netAvailable} < ₹${config.lowAdvance}).`;
  }

  admission.advanceAlert = {
    level,
    message,
    estimatedBill: estimated,
    totalAdvance: summary.totalAdvance,
    outstanding,
    raisedAt: new Date(),
  };
  await admission.save();

  if (level !== 'OK') {
    await notifyBillingTeam({
      title: `Advance alert — ${admission.admissionNumber}`,
      message: `${message} Estimated bill ₹${estimated}, advance ₹${summary.totalAdvance}, outstanding ₹${outstanding}. Clinical care is not blocked.`,
      link: `/ipd/billing?admission=${admissionId}`,
      referenceType: 'IpdAdmission',
      referenceId: admission._id,
    });
    emitIpd(IPD_SOCKET_EVENTS.ADVANCE_ALERT, {
      admissionId, admissionNumber: admission.admissionNumber, level, estimatedBill: estimated, totalAdvance: summary.totalAdvance, outstanding,
    }, admissionId);
  }

  return {
    admissionId, admissionNumber: admission.admissionNumber, level, message,
    estimatedBill: estimated, totalAdvance: summary.totalAdvance, availableAdvance: netAvailable,
    paid, outstanding, due, blocking: false,
  };
};

export const acknowledgeAdvanceAlert = async (admissionId, actor) => {
  const admission = await getAdmission(admissionId);
  admission.advanceAlert = { ...(admission.advanceAlert || {}), acknowledgedAt: new Date(), acknowledgedBy: actor?.id };
  await admission.save();
  return admission.advanceAlert;
};

// ============================================================
// 29/30. INSURANCE, TPA, SPONSOR + CREDIT
// ============================================================
export const admissionInsurance = async (admissionId) => {
  const admission = await IpdAdmission.findById(admissionId).populate('insurancePolicyId').populate('sponsor');
  if (!admission) throw new NotFoundError('Admission not found');

  const policy = admission.insurancePolicyId;
  const [preauths, claims] = await Promise.all([
    PreAuthorization.find({ admissionId }).populate('companyId', 'name').sort({ requestedDate: -1 }),
    InsuranceClaim.find({ admissionId }).populate('companyId', 'name').populate('policyId', 'policyNumber sumInsured').sort({ claimDate: -1 }),
  ]);

  const company = policy ? await InsuranceCompany.findById(policy.companyId).select('name tpaName') : null;
  const claim = claims[0] || null;
  const preauth = preauths[0] || null;

  return {
    policy: policy ? {
      _id: policy._id,
      policyNumber: policy.policyNumber,
      policyHolder: policy.policyHolderName || policy.insuredName,
      company: company?.name,
      tpa: policy.coverage?.tpaName || company?.tpaName,
      sumInsured: policy.sumInsured,
      coverage: policy.coverage,
    } : null,
    preauth,
    claim,
    preauths,
    claims,
    sponsor: admission.sponsor || null,
    paymentCategory: admission.paymentCategory,
  };
};

export const linkInsuranceToAdmission = async (admissionId, payload, actor) => {
  const admission = await getAdmission(admissionId);
  if (payload.policyId) admission.insurancePolicyId = payload.policyId;
  if (payload.sponsor !== undefined) admission.sponsor = payload.sponsor;
  if (payload.paymentCategory) admission.paymentCategory = payload.paymentCategory;
  if (payload.insurancePolicyId) admission.insurancePolicyId = payload.insurancePolicyId;
  await admission.save();
  return admission;
};

// ============================================================
// 31. DISCHARGE PLANNING + READINESS
// ============================================================
const READINESS_KEYS = [
  { key: 'clinicalClearance', label: 'Clinical clearance', auto: false },
  { key: 'doctorClearance', label: 'Doctor clearance', auto: false },
  { key: 'nursingClearance', label: 'Nursing clearance', auto: false },
  { key: 'investigationsPending', label: 'Investigation pending', auto: true },
  { key: 'pharmacyPending', label: 'Pharmacy pending', auto: true },
  { key: 'billingPending', label: 'Billing pending', auto: true },
  { key: 'insurancePending', label: 'Insurance pending', auto: true },
  { key: 'documentsPending', label: 'Documents pending', auto: true },
  { key: 'followUpPlanned', label: 'Follow-up planned', auto: false },
];

const isDone = (x) => Boolean(x?.done);

export const dischargeReadiness = async (admissionId) => {
  const admission = await IpdAdmission.findById(admissionId).populate('bedId', 'bedNumber code chargePerDay');
  if (!admission) throw new NotFoundError('Admission not found');

  const [labs, rads, pharmacies, bills, summary, insurance, summaryDoc, followUps] = await Promise.all([
    LabOrder.find({ admissionId, status: { $nin: [LAB_ORDER_STATUS.VERIFIED, LAB_ORDER_STATUS.REPORTED, LAB_ORDER_STATUS.CANCELLED] } }).select('_id labOrderNumber status'),
    RadiologyOrder.find({ admissionId, status: { $nin: [RADIOLOGY_STATUS.VERIFIED, RADIOLOGY_STATUS.COMPLETED, RADIOLOGY_STATUS.CANCELLED] } }).select('_id radiologyOrderNumber status'),
    PharmacyRequest.find({ admissionId, status: { $in: [PHARMACY_REQUEST_STATUS.REQUESTED, PHARMACY_REQUEST_STATUS.VERIFIED, PHARMACY_REQUEST_STATUS.PARTIAL] } }).select('_id requestNumber status'),
    Bill.find({ admissionId, status: { $nin: ['CANCELLED', 'SUPERSEDED'] } }),
    advanceSummary(admissionId),
    admissionInsurance(admissionId),
    DischargeSummary.findOne({ admissionId }),
    FollowUp.find({ $or: [{ admissionId }, { admissionId: { $exists: false }, patientId: admission.patientId }] })
      .sort({ date: 1 }).limit(5),
  ]);

  const due = sum(bills, (b) => b.dueAmount);
  const investigations = [
    ...labs.map((x) => `Lab ${x.labOrderNumber || x._id}`),
    ...rads.map((x) => `Imaging ${x.radiologyOrderNumber || x._id}`),
  ];
  const insurancePending = admission.paymentCategory === 'INSURANCE' && !(insurance.preauth && insurance.preauth.status !== 'REJECTED');

  const current = admission.dischargeReadiness || {};
  const manual = (key) => ({
    done: isDone(current[key]),
    note: current[key]?.note,
    by: current[key]?.by,
    at: current[key]?.at,
  });

  const items = {
    clinicalClearance: manual('clinicalClearance'),
    doctorClearance: manual('doctorClearance'),
    nursingClearance: manual('nursingClearance'),
    investigationsPending: { done: investigations.length === 0, auto: true, note: investigations.length ? `Pending: ${investigations.join(', ')}` : 'All investigations reported & verified' },
    pharmacyPending: { done: pharmacies.length === 0, auto: true, note: pharmacies.length ? `Awaiting pharmacy: ${pharmacies.map((p) => p.requestNumber).join(', ')}` : 'No pending pharmacy requests' },
    billingPending: { done: due <= 0, auto: true, note: due > 0 ? `Outstanding ₹${due.toLocaleString('en-IN')}` : 'No outstanding' },
    insurancePending: { done: !insurancePending, auto: true, note: insurancePending ? 'Insurance pre-authorisation pending' : 'Insurance cleared / not applicable' },
    documentsPending: { done: Boolean(summaryDoc), auto: true, note: summaryDoc ? 'Discharge summary drafted' : 'Discharge summary not drafted' },
    followUpPlanned: { done: (followUps || []).length > 0 || isDone(current.followUpPlanned), note: current.followUpPlanned?.note, by: current.followUpPlanned?.by, at: current.followUpPlanned?.at },
  };

  const requiredKeys = ['clinicalClearance', 'doctorClearance', 'nursingClearance', 'investigationsPending', 'pharmacyPending', 'billingPending', 'documentsPending'];
  const allRequiredDone = requiredKeys.every((k) => isDone(items[k]));
  const anyDone = requiredKeys.some((k) => isDone(items[k]));

  let readiness = 'NOT_READY';
  if (admission.status === ADMISSION_STATUS.DISCHARGED) readiness = 'COMPLETED';
  else if (allRequiredDone) readiness = 'READY';
  else if (admission.status === ADMISSION_STATUS.DISCHARGE_PLANNED || anyDone) readiness = 'PLANNED';

  return {
    admissionId,
    admissionNumber: admission.admissionNumber,
    status: admission.status,
    dischargeType: admission.dischargeType,
    stage: admission.dischargeStage,
    expectedDischargeDate: admission.expectedDischargeDate,
    readiness,
    items: READINESS_KEYS.map(({ key, label }) => ({ key, label, ...items[key] })),
    financial: { due, availableAdvance: summary.availableAdvance, totalAdvance: summary.totalAdvance },
    followUps: followUps || [],
  };
};

/**
 * Section 49/50: the single gate every discharge path must pass.
 * Throws with the exact outstanding reasons — never allows an inconsistent
 * clinical or financial state to reach DISCHARGED.
 */
export const assertDischargeCleared = async (admissionId, { skipSummary = false } = {}) => {
  const admission = await IpdAdmission.findById(admissionId);
  if (!admission) throw new NotFoundError('Admission not found');

  const blockers = [];

  if (!admission.consultantDoctorId) blockers.push('Consultant doctor not assigned');

  const readiness = await dischargeReadiness(admissionId);
  for (const key of ['clinicalClearance', 'doctorClearance', 'nursingClearance', 'investigationsPending', 'pharmacyPending', 'billingPending', 'insurancePending']) {
    const item = readiness.items.find((i) => i.key === key);
    if (item && !item.done) blockers.push(`${item.label} pending${item.note ? ` (${item.note})` : ''}`);
  }

  if (!skipSummary) {
    const summaryDoc = await DischargeSummary.findOne({ admissionId });
    if (!summaryDoc) blockers.push('Discharge summary not prepared');
    else if (summaryDoc.status !== 'FINAL' && !summaryDoc.doctorSignature?.signedAt) {
      blockers.push('Discharge summary not signed by the treating doctor');
    }
  }

  const settlement = await getSettlement(admissionId).catch(() => null);
  if (!settlement?.finalBillId) blockers.push('Final bill not generated');
  if ((settlement?.dueAmount ?? settlement?.balance ?? 0) > 0.01) {
    blockers.push(`Outstanding balance ₹${(settlement?.dueAmount ?? settlement?.balance ?? 0).toLocaleString('en-IN')} — payment pending`);
  }
  if (settlement?.status && !['FINAL', 'SETTLED'].includes(settlement.status)) {
    blockers.push(`Settlement is ${settlement.status} — finalise the bill first`);
  }

  if (blockers.length) {
    throw new BadRequestError(`Discharge blocked — ${blockers.join('; ')}`);
  }

  return { readiness, settlement };
};

export const updateReadinessItem = async (admissionId, key, payload, actor) => {  if (!READINESS_KEYS.some((k) => k.key === key)) throw new BadRequestError('Unknown readiness item');
  const admission = await getAdmission(admissionId);
  const cfg = READINESS_KEYS.find((k) => k.key === key);
  const current = admission.dischargeReadiness || {};
  const prev = current[key] || {};
  if (cfg.auto && payload.done === true) {
    // automatic items cannot be forced — they reflect real system state
    const fresh = await dischargeReadiness(admissionId);
    const computed = fresh.items.find((i) => i.key === key);
    if (computed?.done) {
      current[key] = { ...prev, done: true, auto: true };
      admission.dischargeReadiness = current;
      await admission.save();
      return fresh;
    }
    throw new BadRequestError('This item is derived from live data and is not clear yet');
  }
  current[key] = { ...prev, done: Boolean(payload.done), auto: false, note: payload.note, by: actor?.id, at: new Date() };
  admission.dischargeReadiness = current;
  admission.dischargeReadiness.updatedAt = new Date();
  await admission.save();
  const fresh = await dischargeReadiness(admissionId);
  emitIpd(IPD_SOCKET_EVENTS.DISCHARGE_READINESS, {
    admissionId, admissionNumber: admission.admissionNumber, key, done: Boolean(payload.done), readiness: fresh.readiness,
  }, admissionId);
  return fresh;
};

export const dischargePlanningDashboard = async (query = {}) => {
  const filter = { status: { $in: [...ACTIVE_STATUSES, ADMISSION_STATUS.WAITING_FOR_BED] } };
  if (query.departmentId) filter.departmentId = query.departmentId;
  const admissions = await IpdAdmission.find(filter)
    .populate('patientId', 'firstName lastName uhid gender')
    .populate('wardId', 'name')
    .populate('bedId', 'bedNumber code')
    .populate('consultantDoctorId', 'name')
    .sort({ expectedDischargeDate: 1, admittedAt: 1 })
    .limit(Math.min(parseInt(query.limit, 10) || 50, 200));

  const rows = [];
  for (const a of admissions) {
    // eslint-disable-next-line no-await-in-loop
    const r = await dischargeReadiness(a._id);
    rows.push({
      admissionId: a._id,
      admissionNumber: a.admissionNumber,
      patient: a.patientId ? `${a.patientId.firstName} ${a.patientId.lastName || ''}`.trim() : '',
      uhid: a.patientId?.uhid,
      ward: a.wardId?.name,
      bed: a.bedId?.bedNumber,
      consultant: a.consultantDoctorId?.name,
      status: a.status,
      stage: a.dischargeStage,
      dischargeType: a.dischargeType,
      expectedDischargeDate: a.expectedDischargeDate,
      lengthOfStay: a.admittedAt ? Math.max(1, Math.ceil((Date.now() - new Date(a.admittedAt)) / 86400000)) : 0,
      readiness: r.readiness,
      pendingItems: r.items.filter((i) => !i.done).map((i) => i.label),
      due: r.financial.due,
    });
  }
  return rows;
};

// ============================================================
// 33. FINAL IPD BILL + 34. SETTLEMENT
// ============================================================
export const buildFinalBill = async (admissionId, options, actor) => {
  const admission = await IpdAdmission.findById(admissionId).populate('bedId', 'bedNumber code').populate('wardId', 'name');
  if (!admission) throw new NotFoundError('Admission not found');

  // one consolidated FINAL bill per admission (idempotent, flagged so it is
  // never confused with the ordinary per-service IPD bills)
  let finalBill = await Bill.findOne({ admissionId, isFinalBill: true });

  const [bills, insurance, summary] = await Promise.all([
    // Superseded interim bills are still consolidated — otherwise rebuilding the
    // final bill (e.g. on finalise) would blank out every line.
    Bill.find({ admissionId, status: { $nin: ['CANCELLED'] } }),
    admissionInsurance(admissionId),
    advanceSummary(admissionId),
  ]);

  const otherBills = bills.filter((b) => !finalBill || String(b._id) !== String(finalBill._id));
  const BILLTYPE_CATEGORY = {
    ROOM_CHARGE: IPD_SERVICE_CODES.ROOM_RENT,
    NURSING: IPD_SERVICE_CODES.NURSING,
    CONSULTATION: IPD_SERVICE_CODES.DOCTOR_VISIT,
    LAB: IPD_SERVICE_CODES.LABORATORY,
    RADIOLOGY: IPD_SERVICE_CODES.RADIOLOGY,
    OT: IPD_SERVICE_CODES.OT,
    PROCEDURE: IPD_SERVICE_CODES.PROCEDURE,
    PHARMACY: IPD_SERVICE_CODES.PHARMACY,
  };
  const REFERENCE_CATEGORY = {
    PharmacyRequest: IPD_SERVICE_CODES.PHARMACY,
    ProcedureRecord: IPD_SERVICE_CODES.PROCEDURE,
    DietOrder: IPD_SERVICE_CODES.DIET,
    PhysiotherapyRequest: IPD_SERVICE_CODES.PHYSIOTHERAPY,
  };
  const items = otherBills.flatMap((b) => (b.items || []).map((i) => {
    const o = i.toObject?.() ?? i;
    return {
      ...o,
      // legacy bills predate serviceCategory — infer from source, then bill type
      serviceCategory: o.serviceCategory
        || REFERENCE_CATEGORY[o.referenceType]
        || BILLTYPE_CATEGORY[b.billType]
        || IPD_SERVICE_CODES.OTHER_SERVICES,
    };
  }));
  const totals = computeBillTotals(items);

  if (!finalBill) {
    const created = await createBillingService({
      patientId: admission.patientId,
      admissionId,
      departmentId: admission.departmentId,
      doctorId: admission.consultantDoctorId,
      billType: 'IPD',
      status: 'FINAL',
      items: items.map((i) => ({
        itemType: i.itemType, name: i.name, description: i.description, code: i.code, quantity: i.quantity,
        rate: i.rate, discountPct: i.discountPct, discountAmount: i.discountAmount, gstPct: i.gstPct,
        serviceDate: i.serviceDate, departmentId: i.departmentId, departmentName: i.departmentName,
        serviceCategory: i.serviceCategory, referenceId: i.referenceId, referenceType: i.referenceType,
      })),
    }, actor);
    finalBill = await Bill.findById(created._id);
    finalBill.isFinalBill = true;
    finalBill.status = 'FINAL';
    await finalBill.save();
  } else if (finalBill.items.length !== items.length) {
    // refresh the consolidated bill when new service bills appeared
    const totals = computeBillTotals(items);
    finalBill.items = totals.items;
    finalBill.grossTotal = totals.grossTotal;
    finalBill.discount = totals.discount;
    finalBill.tax = totals.tax;
    finalBill.netTotal = totals.netTotal;
    finalBill.dueAmount = round(Math.max(totals.netTotal - finalBill.paidAmount, 0));
    await finalBill.save();
  }

  // Section 50: the final bill is the single receivable for the admission. The
  // interim service bills stay on record for audit, but they are superseded so
  // the patient is never billed twice for the same stay. Any payment already
  // received on them is still counted in the settlement.
  const superseded = otherBills.filter((b) => b.status !== 'SUPERSEDED' && b.status !== 'CANCELLED');
  if (superseded.length) {
    await Bill.updateMany(
      { _id: { $in: superseded.map((b) => b._id) } },
      { $set: { status: 'SUPERSEDED', supersededBy: finalBill._id } },
    );
  }

  // category-wise roll-up of the final bill
  const categoryMap = new Map();
  for (const i of finalBill.items || []) {
    const key = i.serviceCategory || 'OTHER_SERVICES';
    const cur = categoryMap.get(key) || { category: key, label: i.name, quantity: 0, rate: 0, amount: 0 };
    cur.quantity = round(cur.quantity + (i.quantity || 0));
    cur.amount = round(cur.amount + (i.total || 0));
    if (!cur.rate && i.rate) cur.rate = i.rate;
    categoryMap.set(key, cur);
  }

  // insurance / sponsor adjustments
  const claim = insurance.claim;
  const approvedInsurance = round(
    (claim?.approvedAmount || 0)
    + (insurance.preauth?.approvedAmount && !claim ? insurance.preauth.approvedAmount : 0),
  );
  const insuranceAdjustment = Math.min(approvedInsurance, round(finalBill.netTotal));
  const rejectedInsurance = round(claim?.rejectedAmount || 0);

  const sponsorCfg = admission.sponsor || {};
  // A sponsor/credit bill is NOT waived: only the explicitly approved amount is
  // adjusted. Without an approved limit the whole balance stays payable.
  const sponsorApprovedLimit = round(
    sponsorCfg.fundingLimit
      || (sponsorCfg.approvedAmount || 0)
      || (admission.paymentCategory === 'INSURANCE' ? 0 : 0),
  );
  const sponsorAdjustment = Math.min(sponsorApprovedLimit, round(Math.max(finalBill.netTotal - insuranceAdjustment, 0)));
  const creditAdjustment = admission.paymentCategory === 'CREDIT' ? sponsorAdjustment : 0;

  // payments made directly against bills (this INCLUDES advances already adjusted onto bills)
  const paidTotal = round(sum(otherBills, (b) => b.paidAmount) + round(finalBill.paidAmount || 0));
  const advanceAlreadyApplied = summary.adjustedAmount;
  const advanceStillAvailable = summary.availableAdvance;
  const directPaidExcludingAdvance = round(Math.max(paidTotal - advanceAlreadyApplied, 0));

  const receivable = round(Math.max(finalBill.netTotal - insuranceAdjustment - sponsorAdjustment, 0));
  const netPayable = round(Math.max(receivable - advanceStillAvailable, 0));
  const balance = round(Math.max(netPayable - directPaidExcludingAdvance, 0));
  const refunds = round(sum(await IpdAdvance.find({ admissionId }).lean(), (a) => a.refundedAmount));

  const existingSettlement = await IpdSettlement.findOne({ admissionId }).select('settlementNumber').lean();
  const settlementNumber = existingSettlement?.settlementNumber || await generateNumber('STL', new Date().getFullYear());

  // section 38: register the final bill as a generated document
  const { registerGeneratedDocument } = await import('./ipd.transfer.service.js');
  await registerGeneratedDocument({
    admissionId,
    patientId: admission.patientId,
    ipNumber: admission.admissionNumber,
    documentType: 'FINAL_BILL',
    sourceType: 'Bill',
    sourceId: finalBill._id,
    title: `Final Bill — ${admission.admissionNumber}`,
    snapshot: { billNumber: finalBill.billNumber, netTotal: finalBill.netTotal, dueAmount: finalBill.dueAmount },
    actor,
  }).catch(() => {});

  const settlement = await IpdSettlement.findOneAndUpdate(
    { admissionId },
    {
      $set: {
        settlementNumber,
        patientId: admission.patientId,
        finalBillId: finalBill._id,
        categories: [...categoryMap.values()],
        grossTotal: finalBill.grossTotal,
        discount: finalBill.discount,
        tax: finalBill.tax,
        netTotal: finalBill.netTotal,
        insuranceAdjustment,
        sponsorAdjustment,
        creditAdjustment,
        advanceAdjusted: round(advanceAlreadyApplied + advanceStillAvailable),
        advanceAvailable: advanceStillAvailable,
        paid: paidTotal,
        refunded: refunds,
        netPayable,
        balance,
        sponsor: {
          name: sponsorCfg.name,
          company: sponsorCfg.company,
          agreement: sponsorCfg.note,
          coverageLimit: sponsorCfg.fundingLimit,
          approvedAmount: sponsorAdjustment,
          sponsorPayable: sponsorAdjustment,
          patientPayable: round(Math.max(finalBill.netTotal - insuranceAdjustment - sponsorAdjustment, 0)),
          pendingApproval: round(Math.max(finalBill.netTotal - insuranceAdjustment - sponsorAdjustment, 0)) > 0 && sponsorApprovedLimit === 0,
          patientResponsibility: claim?.patientResponsibility,
        },
        insurance: {
          company: insurance.policy?.company,
          policyNumber: insurance.policy?.policyNumber,
          policyHolder: insurance.policy?.policyHolder,
          tpa: insurance.policy?.tpa,
          claimNumber: claim?.claimNumber,
          preauthNumber: insurance.preauth?.preAuthNumber,
          approvedAmount: approvedInsurance,
          rejectedAmount: rejectedInsurance,
          status: claim?.status || insurance.preauth?.status || null,
        },
        hospitalId: actor?.hospitalId,
        branchId: actor?.branchId,
      },
      $setOnInsert: { status: 'DRAFT' },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  return { admission, finalBill, settlement };
};

export const finaliseSettlement = async (admissionId, actor) => {
  const { finalBill, settlement } = await buildFinalBill(admissionId, {}, actor);
  settlement.status = 'FINAL';
  settlement.finalisedAt = new Date();
  settlement.finalisedBy = actor?.id;
  await settlement.save();
  if (finalBill) {
    finalBill.status = 'FINAL';
    await finalBill.save();
  }
  return settlement;
};

export const getSettlement = async (admissionId) => {
  const settlement = await IpdSettlement.findOne({ admissionId });
  if (!settlement) throw new NotFoundError('Final bill has not been generated for this admission');
  return refreshSettlementTotals(settlement);
};

/**
 * Section 50/51: the settlement balance must never be a stale snapshot. Payments,
 * refunds and advance adjustments happen after the bill is built, so the live
 * position is recomputed on every read (and persisted when it moved).
 */
const refreshSettlementTotals = async (settlement) => {
  const [finalBill, interimBills, advances] = await Promise.all([
    Bill.findById(settlement.finalBillId).select('netTotal paidAmount dueAmount'),
    Bill.find({ admissionId: settlement.admissionId, isFinalBill: { $ne: true }, status: { $nin: ['CANCELLED'] } }).select('paidAmount'),
    IpdAdvance.find({ admissionId: settlement.admissionId }).lean(),
  ]);

  const paidTotal = round(sum(interimBills, (b) => b.paidAmount) + round(finalBill?.paidAmount || 0));
  const advanceAvailable = round(sum(advances, (a) => a.availableAmount));
  const advanceAdjusted = round(sum(advances, (a) => a.adjustedAmount));
  const refunded = round(sum(advances, (a) => a.refundedAmount));
  const receivable = round(Math.max((finalBill?.netTotal || settlement.netTotal) - (settlement.insuranceAdjustment || 0) - (settlement.sponsorAdjustment || 0), 0));
  const netPayable = round(Math.max(receivable - advanceAvailable, 0));
  const directPaid = round(Math.max(paidTotal - advanceAdjusted, 0));
  const balance = round(Math.max(netPayable - directPaid, 0));

  const changed = settlement.balance !== balance
    || settlement.paid !== paidTotal
    || settlement.advanceAvailable !== advanceAvailable
    || settlement.advanceAdjusted !== round(advanceAdjusted + advanceAvailable)
    || settlement.refunded !== refunded
    || settlement.netPayable !== netPayable;

  if (changed) {
    settlement.paid = paidTotal;
    settlement.balance = balance;
    settlement.netPayable = netPayable;
    settlement.advanceAvailable = advanceAvailable;
    settlement.advanceAdjusted = round(advanceAdjusted + advanceAvailable);
    settlement.refunded = refunded;
    await settlement.save();
  }
  return settlement;
};

// ============================================================
// 34. DISCHARGE SETTLEMENT WORKFLOW
// ============================================================
const STAGE_ORDER = [
  DISCHARGE_STAGE.DISCHARGE_INITIATED,
  DISCHARGE_STAGE.BILLING_PENDING,
  DISCHARGE_STAGE.PAYMENT_PENDING,
  DISCHARGE_STAGE.INSURANCE_PENDING,
  DISCHARGE_STAGE.READY_FOR_DISCHARGE,
  DISCHARGE_STAGE.DISCHARGED,
];

const TYPE_REQUIREMENTS = {
  [DISCHARGE_TYPE.NORMAL]: [],
  [DISCHARGE_TYPE.LAMA]: ['signedBy', 'relation'],
  [DISCHARGE_TYPE.DAMA]: ['signedBy', 'relation', 'witnessedBy'],
  [DISCHARGE_TYPE.ABSCONDED]: ['notes'],
  [DISCHARGE_TYPE.TRANSFERRED]: ['notes'],
  [DISCHARGE_TYPE.REFERRAL]: ['notes', 'documentType'],
  [DISCHARGE_TYPE.DEATH]: [],
};

export const initiateDischarge = async (admissionId, payload, actor) => {
  const admission = await getAdmission(admissionId);
  if ([ADMISSION_STATUS.DISCHARGED, ADMISSION_STATUS.CANCELLED].includes(admission.status)) {
    throw new BadRequestError(`Admission is already ${admission.status}`);
  }
  const type = payload.dischargeType || DISCHARGE_TYPE.NORMAL;
  if (!Object.values(DISCHARGE_TYPE).includes(type)) throw new BadRequestError('Invalid discharge type');

  const docs = payload.documents || {};
  const missing = (TYPE_REQUIREMENTS[type] || []).filter((k) => !docs[k]);
  if (missing.length) {
    throw new BadRequestError(`Documentation required for ${type} discharge: missing ${missing.join(', ')}`);
  }
  if (type === DISCHARGE_TYPE.DEATH && !payload.deathDetails?.causeOfDeath) {
    throw new BadRequestError('Cause of death is required for a death discharge');
  }

  admission.dischargeType = type;
  admission.dischargeReason = payload.reason;
  admission.dischargeInitiatedAt = new Date();
  admission.dischargeInitiatedBy = actor?.id;
  admission.dischargeDocuments = {
    documentType: docs.documentType || (type === DISCHARGE_TYPE.LAMA ? 'LAMA_FORM' : type === DISCHARGE_TYPE.DAMA ? 'DAMA_FORM' : undefined),
    referenceNumber: docs.referenceNumber,
    signedBy: docs.signedBy,
    relation: docs.relation,
    witnessedBy: docs.witnessedBy,
    notes: docs.notes,
    recordedAt: new Date(),
    recordedBy: actor?.id,
  };
  if (type === DISCHARGE_TYPE.DEATH) {
    admission.deathDetails = {
      causeOfDeath: payload.deathDetails.causeOfDeath,
      timeOfDeath: payload.deathDetails.timeOfDeath ? new Date(payload.deathDetails.timeOfDeath) : new Date(),
      certifiedBy: payload.deathDetails.certifiedBy,
      mortuaryRef: payload.deathDetails.mortuaryRef,
    };
  }
  admission.dischargeStage = DISCHARGE_STAGE.DISCHARGE_INITIATED;
  if (admission.status !== ADMISSION_STATUS.DISCHARGE_PLANNED) admission.status = ADMISSION_STATUS.DISCHARGE_PLANNED;
  await admission.save();
  return { admission, stage: admission.dischargeStage, next: STAGE_ORDER[1] };
};

export const advanceDischargeStage = async (admissionId, stage, actor) => {
  const admission = await getAdmission(admissionId);
  if (!Object.values(DISCHARGE_STAGE).includes(stage)) throw new BadRequestError('Invalid discharge stage');
  if (stage === DISCHARGE_STAGE.DISCHARGED) {
    throw new BadRequestError('Use the discharge endpoint to complete the discharge');
  }

  const fromIdx = STAGE_ORDER.indexOf(admission.dischargeStage || DISCHARGE_STAGE.DISCHARGE_INITIATED);
  const toIdx = STAGE_ORDER.indexOf(stage);
  if (toIdx < fromIdx) throw new BadRequestError('Discharge stage cannot move backwards');

  if (stage === DISCHARGE_STAGE.READY_FOR_DISCHARGE) {
    // eslint-disable-next-line no-await-in-loop
    const readiness = await dischargeReadiness(admissionId);
    if (admission.paymentCategory === 'INSURANCE') {
      // eslint-disable-next-line no-await-in-loop
      const ins = await admissionInsurance(admissionId);
      const cleared = ins.claim?.status === 'SETTLED' || ins.claim?.status === 'APPROVED' || ins.preauth?.status === 'APPROVED';
      if (!cleared) throw new BadRequestError('Insurance clearance pending — approve or settle the claim first');
    }
    // eslint-disable-next-line no-await-in-loop
    const { settlement } = await buildFinalBill(admissionId, {}, actor);
    if (settlement.balance > 0) {
      throw new BadRequestError(`Billing clearance pending — outstanding ₹${settlement.balance.toLocaleString('en-IN')}`);
    }
    const blocking = readiness.items.filter((i) => ['clinicalClearance', 'doctorClearance', 'nursingClearance', 'documentsPending'].includes(i.key) && !i.done);
    if (blocking.length) {
      throw new BadRequestError(`Clearance pending: ${blocking.map((i) => i.label).join(', ')}`);
    }
  }

  admission.dischargeStage = stage;
  await admission.save();
  return { admissionId, stage, next: STAGE_ORDER[toIdx + 1] || null };
};

// ============================================================
// 32. DISCHARGE SUMMARY (assemble, finalise, PDF)
// ============================================================
const joinSentences = (arr) => (arr || []).filter(Boolean).join('; ');

export const buildDischargeSummary = async (admissionId, overrides, actor) => {
  const admission = await IpdAdmission.findById(admissionId)
    .populate('patientId', 'firstName lastName uhid age gender bloodGroup')
    .populate('bedId', 'bedNumber code')
    .populate('wardId', 'name')
    .populate('departmentId', 'name')
    .populate('consultantDoctorId', 'name specialization')
    .populate('dischargeSummaryId');
  if (!admission) throw new NotFoundError('Admission not found');

  const hospital = await Hospital.findOne({}).lean().catch(() => null);
  const [visits, assessments, notes, procedures, surgeries, labs, rads, charts, followUps, bills] = await Promise.all([
    DoctorVisit.find({ admissionId }).populate('doctorId', 'name').sort({ visitDate: 1 }),
    ClinicalNote.find({ admissionId, noteType: CLINICAL_NOTE_TYPES.INITIAL_ASSESSMENT }).sort({ createdAt: 1 }),
    ClinicalNote.find({ admissionId, noteType: { $in: [CLINICAL_NOTE_TYPES.ASSESSMENT, CLINICAL_NOTE_TYPES.PLAN] } }).sort({ createdAt: 1 }),
    ProcedureRecord.find({ admissionId }).sort({ procedureDate: 1 }),
    Surgery.find({ admissionId }).populate('surgeonId', 'name').sort({ scheduledStart: 1 }),
    LabOrder.find({ admissionId }).populate('items.resultId').sort({ orderedAt: 1 }),
    RadiologyOrder.find({ admissionId }).populate('tests.reportId').sort({ orderedAt: 1 }),
    MedicationChart.find({ admissionId }).sort({ createdAt: 1 }),
    FollowUp.find({ patientId: admission.patientId }).populate('doctorId', 'name').sort({ date: 1 }),
    Bill.find({ admissionId, status: { $nin: ['CANCELLED', 'SUPERSEDED'] } }),
  ]);

  const assessment = assessments[0]?.structured || {};
  const investigations = [
    ...labs.map((l) => `Lab: ${(l.items || []).map((i) => i.testName).join(', ')} (${l.status})`),
    ...rads.map((r) => `Imaging: ${(r.tests || []).map((t) => t.testName).join(', ')} (${r.status})`),
  ];
  const hospitalCourse = joinSentences([
    ...visits.map((v) => `${v.visitDate ? new Date(v.visitDate).toISOString().slice(0, 10) : ''} ${v.diagnosis || v.assessment || v.clinicalNotes || ''}`.trim()),
    ...notes.map((n) => n.body),
  ]);
  const proceduresPerformed = [
    ...procedures.map((p) => p.name),
    ...surgeries.map((s) => s.procedure),
  ];

  const dischargeMeds = charts
    .filter((c) => {
      const given = (c.administrations || []).some((a) => a.status === MED_ADMIN_STATUS.GIVEN);
      return given || !c.endDate;
    })
    .map((c) => ({
      medicineName: c.medicineName,
      genericName: c.genericName,
      strength: c.strength,
      dosage: c.dosage,
      frequency: c.frequency,
      duration: c.duration,
      instructions: c.instructions,
    }));

  const dischargeDate = admission.dischargedAt || new Date();
  const priorSummary = await DischargeSummary.findOne({ admissionId }).select('followUps').lean();
  const followUpPlan = (overrides?.followUps?.length ? overrides.followUps
    : (priorSummary?.followUps?.length ? priorSummary.followUps
      : (followUps || []).map((f) => ({ date: f.date, doctorId: f.doctorId?._id, doctorName: f.doctorId?.name, department: f.department, notes: f.notes }))));
  const content = {
    hospitalName: hospital?.name || 'Hospital',
    admissionDate: admission.admittedAt,
    dischargeDate,
    lengthOfStayDays: admission.admittedAt ? Math.max(1, Math.ceil((dischargeDate - new Date(admission.admittedAt)) / 86400000)) : undefined,
    departmentId: admission.departmentId?._id,
    consultantId: admission.consultantDoctorId?._id,
    wardId: admission.wardId?._id,
    bedId: admission.bedId?._id,
    chiefComplaint: overrides?.chiefComplaint ?? admission.chiefComplaint ?? assessment.complaint,
    history: overrides?.history ?? assessment.hpi,
    pastHistory: overrides?.pastHistory ?? [assessment.pastMedical, assessment.pastSurgical].filter(Boolean).join('; '),
    examination: overrides?.examination ?? assessment.physicalExam,
    diagnosis: overrides?.diagnosis ?? admission.provisionalDiagnosis ?? admission.admittingDiagnosis,
    investigations: overrides?.investigations ?? (investigations.length ? investigations.join(' | ') : undefined),
    treatmentGiven: overrides?.treatmentGiven ?? admission.dischargePlanningNotes,
    proceduresPerformed,
    surgery: surgeries.length ? surgeries.map((s) => `${s.procedure} (${s.surgeonId?.name || 'surgeon'}) on ${new Date(s.scheduledStart).toISOString().slice(0, 10)}`).join('; ') : undefined,
    hospitalCourse,
    conditionAtDischarge: overrides?.conditionAtDischarge || 'Stable',
    complications: admission.dischargeType === DISCHARGE_TYPE.DEATH ? admission.deathDetails?.causeOfDeath : undefined,
    medicationsOnDischarge: overrides?.medicationsOnDischarge?.length ? overrides.medicationsOnDischarge : dischargeMeds,
    followUps: followUpPlan,
    advice: overrides?.advice || { diet: 'As advised by dietician', activity: 'Light activity as tolerated', warningSigns: 'Fever, breathlessness, bleeding, severe pain', emergencyInstructions: 'Contact hospital emergency immediately if symptoms worsen' },
    dischargeType: admission.dischargeType,
    deathDetails: admission.deathDetails,
    medicalCertificate: overrides?.medicalCertificate,
    billingSummary: {
      totalAmount: sum(bills, (b) => b.netTotal),
      paidAmount: sum(bills, (b) => b.paidAmount),
      dueAmount: sum(bills, (b) => b.dueAmount),
      advanceAdjusted: 0,
    },
  };

  const existing = await DischargeSummary.findOne({ admissionId });
  const doc = existing || new DischargeSummary({ admissionId, patientId: admission.patientId });
  Object.assign(doc, content);
  doc.preparedBy = actor?.id;
  doc.status = admission.status === ADMISSION_STATUS.DISCHARGED ? 'FINAL' : 'DRAFT';
  if (doc.status === 'FINAL') doc.finalisedAt = new Date();
  await doc.save();

  // section 38: register the generated document against the admission
  const { registerGeneratedDocument } = await import('./ipd.transfer.service.js');
  await registerGeneratedDocument({
    admissionId,
    patientId: admission.patientId,
    ipNumber: admission.admissionNumber,
    documentType: 'DISCHARGE_SUMMARY',
    sourceType: 'DischargeSummary',
    sourceId: doc._id,
    title: `Discharge Summary — ${admission.admissionNumber}`,
    snapshot: { diagnosis: doc.diagnosis, conditionAtDischarge: doc.conditionAtDischarge, dischargeType: doc.dischargeType, status: doc.status },
    actor,
  }).catch(() => {});

  if (admission.status === ADMISSION_STATUS.DISCHARGED && admission.dischargeSummaryId !== doc._id) {
    admission.dischargeSummaryId = doc._id;
    await admission.save();
  }

  // Section 50: a discharge must leave a follow-up trail. Every planned follow-up
  // on the summary is persisted as a real, admission-linked FollowUp record so
  // the post-discharge journey is tracked (and readiness can verify it).
  if (admission.status === ADMISSION_STATUS.DISCHARGED && (doc.followUps || []).length) {
    for (const fu of doc.followUps) {
      if (!fu?.date) continue;
      const exists = await FollowUp.findOne({
        admissionId,
        date: new Date(fu.date),
        $or: [{ followUpNumber: { $exists: true } }],
        notes: fu.notes,
      });
      if (exists) continue;
      await FollowUp.create({
        followUpNumber: await generateNumber(NUMBER_PREFIXES.FOLLOWUP, new Date().getFullYear()),
        admissionId,
        patientId: admission.patientId,
        date: new Date(fu.date),
        doctorId: fu.doctorId || admission.consultantDoctorId?._id || admission.consultantDoctorId,
        departmentId: fu.department || admission.departmentId?._id || admission.departmentId,
        reason: fu.notes || 'Post-discharge follow-up',
        status: 'SCHEDULED',
        source: 'IPD_DISCHARGE',
        createdBy: actor?.id,
      });
    }
  }
  return doc;
};

export const signDischargeSummary = async (admissionId, payload, actor) => {
  const doc = await DischargeSummary.findOne({ admissionId });
  if (!doc) throw new NotFoundError('Discharge summary not created yet');
  doc.doctorSignature = {
    signedBy: payload.signedBy,
    signedByName: payload.signedByName,
    signedAt: new Date(),
    signatureRef: payload.signatureRef,
  };
  doc.status = 'FINAL';
  doc.finalisedAt = new Date();
  doc.reviewedBy = payload.signedBy;
  await doc.save();
  return doc;
};

const money = (n) => `Rs. ${round(n).toLocaleString('en-IN')}`;

export const dischargeSummaryPdf = async (admissionId) => {
  const [summary, admission] = await Promise.all([
    DischargeSummary.findOne({ admissionId })
      .populate('patientId', 'firstName lastName uhid age gender bloodGroup')
      .populate('consultantId', 'name specialization')
      .populate('wardId', 'name')
      .populate('bedId', 'bedNumber'),
    IpdAdmission.findById(admissionId).populate('dischargeSummaryId'),
  ]);
  if (!summary) throw new NotFoundError('Discharge summary not found');

  const doc = new PDFDocument({ margin: 42, size: 'A4' });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const p = summary.patientId || {};
  const line = (label, value, opts = {}) => {
    if (!value) return;
    doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor('#334155');
    doc.text(`${label}: `, { continued: true });
    doc.font('Helvetica').fillColor('#0f172a').text(String(value));
    doc.moveDown(0.15);
  };
  const section = (title) => {
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1e3a8a').text(title.toUpperCase());
    doc.moveTo(doc.x, doc.y + 2).lineTo(553, doc.y + 2).strokeColor('#cbd5e1').stroke();
    doc.moveDown(0.35);
  };

  doc.font('Helvetica-Bold').fontSize(16).fillColor('#1e3a8a').text(summary.hospitalName || 'HOSPITAL', { align: 'center' });
  doc.font('Helvetica').fontSize(10).fillColor('#475569').text('DISCHARGE SUMMARY', { align: 'center' });
  doc.moveDown(0.6);

  doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a');
  doc.text(`Patient: ${p.firstName || ''} ${p.lastName || ''}`);
  doc.font('Helvetica').fontSize(9);
  doc.text(`UHID: ${p.uhid || '-'}      IP No: ${admission?.admissionNumber || '-'}`);
  doc.text(`Age / Sex: ${p.age || (p.dateOfBirth ? '' : '-')} / ${p.gender || '-'}      Blood Group: ${p.bloodGroup || '-'}`);
  doc.text(`Admission: ${summary.admissionDate ? new Date(summary.admissionDate).toLocaleDateString('en-IN') : '-'}     Discharge: ${summary.dischargeDate ? new Date(summary.dischargeDate).toLocaleDateString('en-IN') : '-'}`);
  doc.text(`Ward / Bed: ${summary.wardId?.name || '-'} / ${summary.bedId?.bedNumber || '-'}     Consultant: ${summary.consultantId?.name || '-'}`);
  doc.text(`Length of stay: ${summary.lengthOfStayDays || '-'} days     Discharge type: ${summary.dischargeType || 'NORMAL'}`);

  section('Clinical');
  line('Chief complaint', summary.chiefComplaint);
  line('History', summary.history);
  line('Past history', summary.pastHistory);
  line('Examination', summary.examination);
  line('Diagnosis', summary.diagnosis);
  line('Investigations', summary.investigations);
  line('Treatment given', summary.treatmentGiven);
  line('Procedures', (summary.proceduresPerformed || []).join(', '));
  line('Surgery', summary.surgery);
  line('Hospital course', summary.hospitalCourse);
  line('Condition at discharge', summary.conditionAtDischarge);
  if (summary.deathDetails?.causeOfDeath) line('Cause of death', summary.deathDetails.causeOfDeath);

  section('Discharge medication');
  const meds = summary.medicationsOnDischarge || [];
  if (!meds.length) doc.font('Helvetica').fontSize(9).fillColor('#64748b').text('None prescribed.');
  for (const m of meds) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a').text(`• ${m.medicineName}${m.strength ? ` (${m.strength})` : ''}`);
    doc.font('Helvetica').fontSize(9).fillColor('#334155').text(`   ${[m.dosage, m.frequency, m.duration].filter(Boolean).join(' · ')}${m.instructions ? ` — ${m.instructions}` : ''}`);
  }

  section('Follow-up');
  const fus = summary.followUps || [];
  if (!fus.length) doc.font('Helvetica').fontSize(9).fillColor('#64748b').text('Not specified.');
  for (const f of fus) {
    doc.font('Helvetica').fontSize(9).fillColor('#0f172a').text(`• ${f.date ? new Date(f.date).toLocaleDateString('en-IN') : 'To be decided'} — ${f.doctorName || f.doctorId?.name || 'Consultant'}${f.department ? ` (${f.department})` : ''}${f.notes ? ` · ${f.notes}` : ''}`);
  }

  section('Advice');
  line('Diet', summary.advice?.diet);
  line('Activity', summary.advice?.activity);
  line('Warning signs', summary.advice?.warningSigns);
  line('Emergency instructions', summary.advice?.emergencyInstructions);

  if (summary.billingSummary?.totalAmount) {
    section('Billing');
    line('Total', money(summary.billingSummary.totalAmount));
    line('Paid', money(summary.billingSummary.paidAmount));
    line('Due', money(summary.billingSummary.dueAmount));
  }

  doc.moveDown(1.5);
  doc.font('Helvetica').fontSize(8).fillColor('#64748b').text('This is a computer-generated discharge summary.', { align: 'center' });
  doc.moveDown(1.2);
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a').text('_______________________________', { align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor('#334155').text(summary.doctorSignature?.signedByName || summary.consultantId?.name || 'Consultant', { align: 'right' });
  doc.font('Helvetica').fontSize(8).fillColor('#64748b').text(summary.doctorSignature?.signedAt ? `Signed ${new Date(summary.doctorSignature.signedAt).toLocaleString('en-IN')}` : 'Signature pending', { align: 'right' });

  doc.end();
  return done;
};

export const dischargeSummaryPrintHtml = async (admissionId) => {
  const [summary, admission] = await Promise.all([
    DischargeSummary.findOne({ admissionId }).populate('patientId', 'firstName lastName uhid age gender bloodGroup').populate('consultantId', 'name').populate('wardId', 'name').populate('bedId', 'bedNumber'),
    IpdAdmission.findById(admissionId),
  ]);
  if (!summary) throw new NotFoundError('Discharge summary not found');
  const p = summary.patientId || {};
  const esc = (v) => String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const dl = (rows) => `<table>${rows.filter(Boolean).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>Discharge Summary ${esc(admission?.admissionNumber || '')}</title>
<style>
  body{font-family:Georgia,serif;color:#0f172a;margin:32px;line-height:1.5}
  h1{text-align:center;font-size:22px;margin:0} h2{text-align:center;font-size:13px;color:#475569;font-weight:normal;margin:4px 0 18px}
  h3{font-size:12px;text-transform:uppercase;color:#1e3a8a;border-bottom:1px solid #cbd5e1;padding-bottom:4px;margin:18px 0 8px}
  table{width:100%;border-collapse:collapse;font-size:13px} th{text-align:left;width:200px;vertical-align:top;color:#475569;font-weight:600;padding:3px 0} td{padding:3px 0}
  ul{font-size:13px;margin:0;padding-left:18px} .sig{margin-top:40px;text-align:right}
  @media print{body{margin:12mm}}
</style></head><body>
<h1>${esc(summary.hospitalName || 'HOSPITAL')}</h1>
<h2>DISCHARGE SUMMARY</h2>
${dl([
    ['Patient', `${p.firstName || ''} ${p.lastName || ''}`],
    ['UHID / IP No', `${p.uhid || '-'} / ${admission?.admissionNumber || '-'}`],
    ['Age / Sex / Blood group', `${p.age || '-'} / ${p.gender || '-'} / ${p.bloodGroup || '-'}`],
    ['Admission date', summary.admissionDate ? new Date(summary.admissionDate).toLocaleDateString('en-IN') : '-'],
    ['Discharge date', summary.dischargeDate ? new Date(summary.dischargeDate).toLocaleDateString('en-IN') : '-'],
    ['Ward / Bed', `${summary.wardId?.name || '-'} / ${summary.bedId?.bedNumber || '-'}`],
    ['Consultant', summary.consultantId?.name || '-'],
    ['Length of stay', `${summary.lengthOfStayDays || '-'} days`],
    ['Discharge type', summary.dischargeType || 'NORMAL'],
  ])}
<h3>Clinical</h3>
${dl([
    ['Chief complaint', summary.chiefComplaint],
    ['History', summary.history],
    ['Past history', summary.pastHistory],
    ['Examination', summary.examination],
    ['Diagnosis', summary.diagnosis],
    ['Investigations', summary.investigations],
    ['Treatment given', summary.treatmentGiven],
    ['Procedures', (summary.proceduresPerformed || []).join(', ')],
    ['Surgery', summary.surgery],
    ['Hospital course', summary.hospitalCourse],
    ['Condition at discharge', summary.conditionAtDischarge],
  ])}
<h3>Discharge medication</h3>
${(summary.medicationsOnDischarge || []).length ? `<ul>${summary.medicationsOnDischarge.map((m) => `<li><b>${esc(m.medicineName)}</b> ${esc(m.strength || '')} — ${esc([m.dosage, m.frequency, m.duration].filter(Boolean).join(' · '))}${m.instructions ? ` — ${esc(m.instructions)}` : ''}</li>`).join('')}</ul>` : '<p>None prescribed.</p>'}
<h3>Follow-up</h3>
${(summary.followUps || []).length ? `<ul>${summary.followUps.map((f) => `<li>${esc(f.date ? new Date(f.date).toLocaleDateString('en-IN') : 'To be decided')} — ${esc(f.doctorName || f.doctorId?.name || 'Consultant')}${f.department ? ` (${esc(f.department)})` : ''}</li>`).join('')}</ul>` : '<p>Not specified.</p>'}
<h3>Advice</h3>
${dl([['Diet', summary.advice?.diet], ['Activity', summary.advice?.activity], ['Warning signs', summary.advice?.warningSigns], ['Emergency instructions', summary.advice?.emergencyInstructions]])}
${summary.billingSummary?.totalAmount ? `<h3>Billing</h3>${dl([['Total', money(summary.billingSummary.totalAmount)], ['Paid', money(summary.billingSummary.paidAmount)], ['Due', money(summary.billingSummary.dueAmount)]])}` : ''}
<div class="sig">
  <p>_______________________________</p>
  <p>${esc(summary.doctorSignature?.signedByName || summary.consultantId?.name || 'Consultant')}</p>
  <p><small>${summary.doctorSignature?.signedAt ? `Signed ${new Date(summary.doctorSignature.signedAt).toLocaleString('en-IN')}` : 'Signature pending'}</small></p>
</div>
</body></html>`;
};
