import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import IpdAdmission, { ADMISSION_STATUS, DISCHARGE_TYPE } from '../models/IpdAdmission.model.js';
import IpdSettlement from '../models/IpdSettlement.model.js';
import IpdAdvance from '../models/IpdAdvance.model.js';
import Bill from '../models/Bill.model.js';
import Payment from '../models/Payment.model.js';
import Refund from '../models/Refund.model.js';
import DoctorVisit from '../models/DoctorVisit.model.js';
import VitalRecord from '../models/VitalRecord.model.js';
import NursingNote from '../models/NursingNote.model.js';
import MedicationChart from '../models/MedicationChart.model.js';
import ClinicalOrder from '../models/ClinicalOrder.model.js';
import LabOrder from '../models/LabOrder.model.js';
import RadiologyOrder from '../models/RadiologyOrder.model.js';
import ProcedureRecord from '../models/ProcedureRecord.model.js';
import PatientTransfer from '../models/PatientTransfer.model.js';
import PatientDocument from '../models/PatientDocument.model.js';
import { Bed, Ward, Room } from '../models/Bed.model.js';
import { InsuranceClaim } from '../models/Insurance.model.js';
import Hospital from '../models/Hospital.model.js';
import { round2 } from './billing.service.js';
import { NotFoundError } from '../utils/ApiError.js';

const ACTIVE_STATUSES = [ADMISSION_STATUS.ADMITTED, ADMISSION_STATUS.TRANSFERRED, ADMISSION_STATUS.DISCHARGE_PLANNED];
const dayStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const dayEnd = (d) => { const x = dayStart(d); x.setDate(x.getDate() + 1); return x; };
const sum = (arr, pick) => round2((arr || []).reduce((s, x) => s + (Number(pick ? pick(x) : x) || 0), 0));
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : '');
const fmtDT = (d) => (d ? new Date(d).toLocaleString('en-IN', { hour12: true }) : '');

const bounds = (q = {}) => {
  const from = q.from ? dayStart(q.from) : dayStart(new Date(Date.now() - 30 * 86400000));
  const to = q.to ? dayEnd(q.to) : dayEnd(new Date());
  return { from, to };
};
// mongo date filter for the reporting period
const range = (q) => {
  const { from, to } = bounds(q);
  return { $gte: from, $lt: to };
};

const patientNames = async (rows, key = 'patientId') => {
  const ids = [...new Set(rows.map((r) => {
    const raw = r[key]?._id || r[key];
    if (!raw) return null;
    return mongoose.isValidObjectId(String(raw)) ? String(raw) : null;
  }).filter(Boolean))];
  if (!ids.length) return new Map();
  const { default: Patient } = await import('../models/Patient.model.js');
  const patients = await Patient.find({ _id: { $in: ids } }).select('uhid firstName lastName').lean();
  return new Map(patients.map((p) => [String(p._id), `${p.uhid} · ${p.firstName} ${p.lastName || ''}`.trim()]));
};

const attachPatient = async (rows) => {
  const map = await patientNames(rows);
  return rows.map((r) => ({
    ...r,
    patient: map.get(String(r.patientId?._id || r.patientId)) || r.patientLabel || '',
  }));
};

// ============================================================
// 39. IPD REPORT REGISTRY
// ============================================================
const admissionRows = async (filter, extra = {}) => {
  const rows = await IpdAdmission.find(filter)
    .populate('patientId', 'uhid firstName lastName')
    .populate('wardId', 'name')
    .populate('bedId', 'bedNumber code')
    .populate('departmentId', 'name')
    .populate('consultantDoctorId', 'name')
    .sort({ admittedAt: -1 })
    .lean();
  return rows;
};

export const IPD_REPORTS = {
  // ===== ADMISSION =====
  admission_register: {
    group: 'ADMISSION',
    name: 'Admission Register',
    columns: ['admissionNumber', 'patient', 'admissionType', 'priority', 'department', 'consultant', 'ward', 'bed', 'admittedAt', 'status'],
    totals: (rows) => ({ admissions: rows.length }),
    run: async (q) => {
      const { from, to } = bounds(q);
      const rows = await admissionRows({ admittedAt: { $gte: from, $lt: to } }, q);
      return (await attachPatient(rows)).map((r) => ({
        admissionNumber: r.admissionNumber,
        patient: r.patient,
        admissionType: r.admissionType,
        priority: r.priority,
        department: r.departmentId?.name || '—',
        consultant: r.consultantDoctorId?.name || '—',
        ward: r.wardId?.name || '—',
        bed: r.bedId?.bedNumber || '—',
        admittedAt: fmtDT(r.admittedAt),
        status: r.status,
      }));
    },
  },
  daily_admission: {
    group: 'ADMISSION',
    name: 'Daily Admission Report',
    columns: ['date', 'count'],
    totals: (rows) => ({ total: sum(rows, (r) => r.count) }),
    run: async (q) => {
      const { from, to } = bounds(q);
      const rows = await admissionRows({ admittedAt: { $gte: from, $lt: to } }, q);
      const byDate = {};
      for (const r of rows) {
        const k = fmtDate(r.admittedAt);
        byDate[k] = (byDate[k] || 0) + 1;
      }
      return Object.entries(byDate).sort().map(([date, count]) => ({ date, count }));
    },
  },
  department_admission: {
    group: 'ADMISSION',
    name: 'Department-wise Admission',
    columns: ['department', 'count'],
    totals: (rows) => ({ total: sum(rows, (r) => r.count) }),
    run: async (q) => groupCount(await admissionRows({ ...(q.departmentId ? { departmentId: q.departmentId } : {}), admittedAt: range(q) }), (r) => r.departmentId?.name || 'Unassigned', 'department'),
  },
  doctor_admission: {
    group: 'ADMISSION',
    name: 'Doctor-wise Admission',
    columns: ['doctor', 'count'],
    totals: (rows) => ({ total: sum(rows, (r) => r.count) }),
    run: async (q) => groupCount(await admissionRows({ ...(q.doctorId ? { consultantDoctorId: q.doctorId } : {}), admittedAt: range(q) }), (r) => r.consultantDoctorId?.name || 'Unassigned', 'doctor'),
  },
  admission_type: {
    group: 'ADMISSION',
    name: 'Admission Type Report',
    columns: ['admissionType', 'count', 'averageStay'],
    totals: (rows) => ({ total: sum(rows, (r) => r.count) }),
    run: async (q) => {
      const rows = await admissionRows({ admittedAt: range(q) });
      const map = new Map();
      for (const r of rows) {
        const key = r.admissionType || 'ELECTIVE';
        const cur = map.get(key) || { admissionType: key, count: 0, stay: 0, n: 0 };
        cur.count += 1;
        if (r.dischargedAt) { cur.stay += Math.max(1, Math.ceil((new Date(r.dischargedAt) - new Date(r.admittedAt)) / 86400000)); cur.n += 1; }
        map.set(key, cur);
      }
      return [...map.values()].map((r) => ({ admissionType: r.admissionType, count: r.count, averageStay: r.n ? round2(r.stay / r.n) : 0 }));
    },
  },

  // ===== BED =====
  bed_occupancy: {
    group: 'BED',
    name: 'Bed Occupancy',
    columns: ['ward', 'total', 'occupied', 'available', 'reserved', 'cleaning', 'blocked', 'occupancyPct'],
    totals: (rows) => ({ total: sum(rows, (r) => r.total), occupied: sum(rows, (r) => r.occupied) }),
    run: async () => {
      const wards = await Ward.find({}).sort({ name: 1 }).lean();
      const beds = await Bed.find({}).select('wardId status').lean();
      return wards.map((w) => {
        const wb = beds.filter((b) => String(b.wardId) === String(w._id));
        const c = (s) => wb.filter((b) => b.status === s).length;
        const occupied = c('OCCUPIED');
        return {
          ward: w.name,
          total: wb.length,
          occupied,
          available: c('AVAILABLE'),
          reserved: c('RESERVED'),
          cleaning: c('CLEANING'),
          blocked: c('BLOCKED'),
          occupancyPct: wb.length ? Math.round((occupied / wb.length) * 100) : 0,
        };
      });
    },
  },
  ward_occupancy: {
    group: 'BED',
    name: 'Ward Occupancy',
    columns: ['ward', 'wardType', 'chargePerDay', 'occupied', 'total'],
    run: async () => {
      const wards = await Ward.find({}).sort({ name: 1 }).lean();
      const beds = await Bed.find({ wardId: { $in: wards.map((w) => w._id) } }).select('wardId status').lean();
      return wards.map((w) => {
        const wb = beds.filter((b) => String(b.wardId) === String(w._id));
        return { ward: w.name, wardType: w.wardType, chargePerDay: w.chargePerDay || 0, occupied: wb.filter((b) => b.status === 'OCCUPIED').length, total: wb.length };
      });
    },
  },
  room_occupancy: {
    group: 'BED',
    name: 'Room Occupancy',
    columns: ['ward', 'room', 'roomType', 'beds', 'occupied'],
    run: async () => {
      const rooms = await Room.find({}).populate('wardId', 'name').sort({ roomNumber: 1 }).lean();
      const beds = await Bed.find({}).select('roomId status').lean();
      return rooms.map((r) => {
        const rb = beds.filter((b) => String(b.roomId) === String(r._id));
        return { ward: r.wardId?.name || '—', room: r.roomNumber, roomType: r.roomType, beds: rb.length, occupied: rb.filter((b) => b.status === 'OCCUPIED').length };
      });
    },
  },
  bed_availability: {
    group: 'BED',
    name: 'Bed Availability',
    columns: ['bed', 'ward', 'bedType', 'status', 'chargePerDay'],
    run: async (q) => {
      const filter = {};
      if (q.wardId) filter.wardId = q.wardId;
      if (q.status) filter.status = q.status;
      const beds = await Bed.find(filter).populate('wardId', 'name').sort({ code: 1 }).lean();
      return beds.map((b) => ({ bed: b.code || b.bedNumber, ward: b.wardId?.name || '—', bedType: b.bedType, status: b.status, chargePerDay: b.chargePerDay || 0 }));
    },
  },
  bed_utilization: {
    group: 'BED',
    name: 'Bed Utilization (30 days)',
    columns: ['bed', 'ward', 'admissions', 'daysOccupied', 'utilizationPct'],
    run: async () => {
      const since = dayStart(new Date(Date.now() - 30 * 86400000));
      const rows = await admissionRows({ admittedAt: { $gte: since } });
      const map = new Map();
      for (const r of rows) {
        if (!r.bedId) continue;
        const key = String(r.bedId._id);
        const end = r.dischargedAt ? new Date(r.dischargedAt) : new Date();
        const days = Math.max(0.5, (end - new Date(r.admittedAt)) / 86400000);
        const cur = map.get(key) || { bed: r.bedId.bedNumber || r.bedId.code, ward: r.wardId?.name || '—', admissions: 0, daysOccupied: 0 };
        cur.admissions += 1;
        cur.daysOccupied += days;
        map.set(key, cur);
      }
      return [...map.values()]
        .map((r) => ({ ...r, daysOccupied: round2(r.daysOccupied), utilizationPct: Math.min(100, Math.round((r.daysOccupied / 30) * 100)) }))
        .sort((a, b) => b.utilizationPct - a.utilizationPct);
    },
  },
  bed_transfer: {
    group: 'BED',
    name: 'Bed Transfer Report',
    columns: ['dateTime', 'admissionNumber', 'patient', 'from', 'to', 'reason', 'by'],
    run: async (q) => {
      const { from, to } = bounds(q);
      const rows = await PatientTransfer.find({ requestedAt: { $gte: from, $lt: to } })
        .populate('patientId', 'uhid firstName lastName')
        .populate('requestedBy', 'name')
        .sort({ requestedAt: -1 }).lean();
      return rows.map((r) => ({
        dateTime: fmtDT(r.requestedAt),
        admissionNumber: r.admissionNumber,
        patient: r.patientId ? `${r.patientId.uhid} · ${r.patientId.firstName} ${r.patientId.lastName || ''}` : '',
        from: [r.from?.wardName, r.from?.roomNumber, r.from?.bedNumber].filter(Boolean).join('/') || '—',
        to: r.transferType === 'ANOTHER_HOSPITAL' ? r.to?.hospitalName : [r.to?.wardName, r.to?.roomNumber, r.to?.bedNumber].filter(Boolean).join('/') || '—',
        reason: r.reason,
        by: r.requestedBy?.name || '—',
      }));
    },
  },

  // ===== DISCHARGE =====
  discharge_register: {
    group: 'DISCHARGE',
    name: 'Discharge Register',
    columns: ['admissionNumber', 'patient', 'dischargeType', 'ward', 'consultant', 'admittedAt', 'dischargedAt', 'lengthOfStay', 'status'],
    run: async (q) => {
      const { from, to } = bounds(q);
      const rows = await admissionRows({ dischargedAt: { $gte: from, $lt: to } });
      return (await attachPatient(rows)).map((r) => ({
        admissionNumber: r.admissionNumber,
        patient: r.patient,
        dischargeType: r.dischargeType || 'NORMAL',
        ward: r.wardId?.name || '—',
        consultant: r.consultantDoctorId?.name || '—',
        admittedAt: fmtDT(r.admittedAt),
        dischargedAt: fmtDT(r.dischargedAt),
        lengthOfStay: r.admittedAt && r.dischargedAt ? Math.max(1, Math.ceil((new Date(r.dischargedAt) - new Date(r.admittedAt)) / 86400000)) : 0,
        status: r.status,
      }));
    },
  },
  daily_discharge: {
    group: 'DISCHARGE',
    name: 'Daily Discharge Report',
    columns: ['date', 'count'],
    totals: (rows) => ({ total: sum(rows, (r) => r.count) }),
    run: async (q) => {
      const { from, to } = bounds(q);
      const rows = await admissionRows({ dischargedAt: { $gte: from, $lt: to } });
      const byDate = {};
      for (const r of rows) { const k = fmtDate(r.dischargedAt); byDate[k] = (byDate[k] || 0) + 1; }
      return Object.entries(byDate).sort().map(([date, count]) => ({ date, count }));
    },
  },
  expected_discharge: {
    group: 'DISCHARGE',
    name: 'Expected Discharge',
    columns: ['admissionNumber', 'patient', 'expectedDischargeDate', 'ward', 'bed', 'readiness', 'status'],
    run: async () => {
      const rows = await IpdAdmission.find({
        status: { $in: ACTIVE_STATUSES },
        expectedDischargeDate: { $exists: true, $ne: null },
      }).populate('patientId', 'uhid firstName lastName').populate('wardId', 'name').populate('bedId', 'bedNumber').sort({ expectedDischargeDate: 1 }).lean();
      return (await attachPatient(rows)).map((r) => ({
        admissionNumber: r.admissionNumber,
        patient: r.patient,
        expectedDischargeDate: fmtDate(r.expectedDischargeDate),
        ward: r.wardId?.name || '—',
        bed: r.bedId?.bedNumber || '—',
        readiness: r.dischargeStage || 'NOT_STARTED',
        status: r.status,
      }));
    },
  },
  discharge_type: {
    group: 'DISCHARGE',
    name: 'Discharge Type Report',
    columns: ['dischargeType', 'count'],
    totals: (rows) => ({ total: sum(rows, (r) => r.count) }),
    run: async (q) => {
      const { from, to } = bounds(q);
      const rows = await admissionRows({ dischargedAt: { $gte: from, $lt: to } });
      return groupCount(rows, (r) => r.dischargeType || 'NORMAL', 'dischargeType');
    },
  },
  length_of_stay: {
    group: 'DISCHARGE',
    name: 'Length of Stay',
    columns: ['admissionNumber', 'patient', 'admittedAt', 'dischargedAt', 'lengthOfStay', 'ward', 'consultant'],
    totals: (rows) => ({ totalDischarges: rows.length, averageStay: rows.length ? round2(sum(rows, (r) => r.lengthOfStay) / rows.length) : 0 }),
    run: async (q) => {
      const { from, to } = bounds(q);
      const rows = await admissionRows({ dischargedAt: { $gte: from, $lt: to } });
      return (await attachPatient(rows)).map((r) => ({
        admissionNumber: r.admissionNumber,
        patient: r.patient,
        admittedAt: fmtDT(r.admittedAt),
        dischargedAt: fmtDT(r.dischargedAt),
        lengthOfStay: Math.max(1, Math.ceil((new Date(r.dischargedAt) - new Date(r.admittedAt)) / 86400000)),
        ward: r.wardId?.name || '—',
        consultant: r.consultantDoctorId?.name || '—',
      }));
    },
  },
  doctor_discharge: {
    group: 'DISCHARGE',
    name: 'Doctor-wise Discharge',
    columns: ['doctor', 'count', 'averageStay'],
    totals: (rows) => ({ total: sum(rows, (r) => r.count) }),
    run: async (q) => {
      const { from, to } = bounds(q);
      const rows = await admissionRows({ dischargedAt: { $gte: from, $lt: to } });
      const map = new Map();
      for (const r of rows) {
        const key = r.consultantDoctorId?.name || 'Unassigned';
        const stay = Math.max(1, Math.ceil((new Date(r.dischargedAt) - new Date(r.admittedAt)) / 86400000));
        const cur = map.get(key) || { doctor: key, count: 0, stay: 0 };
        cur.count += 1; cur.stay += stay; map.set(key, cur);
      }
      return [...map.values()].map((r) => ({ doctor: r.doctor, count: r.count, averageStay: round2(r.stay / r.count) }));
    },
  },

  // ===== CLINICAL =====
  diagnosis_report: {
    group: 'CLINICAL',
    name: 'Diagnosis Report',
    columns: ['admissionNumber', 'patient', 'admittingDiagnosis', 'provisionalDiagnosis', 'consultant', 'admittedAt'],
    run: async (q) => {
      const rows = await admissionRows({ ...(q.search ? { admittingDiagnosis: new RegExp(q.search, 'i') } : {}), ...range(q) });
      return (await attachPatient(rows)).map((r) => ({
        admissionNumber: r.admissionNumber, patient: r.patient,
        admittingDiagnosis: r.admittingDiagnosis, provisionalDiagnosis: r.provisionalDiagnosis,
        consultant: r.consultantDoctorId?.name || '—', admittedAt: fmtDate(r.admittedAt),
      }));
    },
  },
  doctor_visit_report: {
    group: 'CLINICAL',
    name: 'Doctor Visit Report',
    columns: ['dateTime', 'admissionNumber', 'doctor', 'visitType', 'diagnosis', 'plan'],
    totals: (rows) => ({ totalVisits: rows.length }),
    run: async (q) => {
      const visits = await DoctorVisit.find({ visitDate: range(q) }).populate('doctorId', 'name').populate('admissionId', 'admissionNumber').sort({ visitDate: -1 }).lean();
      return visits.map((v) => ({
        dateTime: fmtDT(v.visitDate), admissionNumber: v.admissionId?.admissionNumber || '—',
        doctor: v.doctorId?.name || '—', visitType: v.visitType,
        diagnosis: v.diagnosis || '—', plan: v.plan || '—',
      }));
    },
  },
  nursing_report: {
    group: 'CLINICAL',
    name: 'Nursing Report',
    columns: ['dateTime', 'admissionNumber', 'shift', 'noteType', 'status', 'nurse'],
    totals: (rows) => ({ totalNotes: rows.length }),
    run: async (q) => {
      const notes = await NursingNote.find({ recordedAt: range(q) }).populate('recordedBy', 'name').populate('admissionId', 'admissionNumber').sort({ recordedAt: -1 }).lean();
      return notes.map((n) => ({
        dateTime: fmtDT(n.recordedAt), admissionNumber: n.admissionId?.admissionNumber || '—',
        shift: n.shift, noteType: n.noteType, status: n.status, nurse: n.recordedBy?.name || '—',
      }));
    },
  },
  vital_report: {
    group: 'CLINICAL',
    name: 'Vital Report',
    columns: ['dateTime', 'admissionNumber', 'temperature', 'pulse', 'bp', 'spo2', 'respiratoryRate', 'source'],
    totals: (rows) => ({ totalReadings: rows.length }),
    run: async (q) => {
      const vitals = await VitalRecord.find({ admissionId: { $exists: true }, recordedAt: range(q) })
        .populate('admissionId', 'admissionNumber').sort({ recordedAt: -1 }).limit(2000).lean();
      return vitals.map((v) => ({
        dateTime: fmtDT(v.recordedAt), admissionNumber: v.admissionId?.admissionNumber || '—',
        temperature: v.temperature ?? '', pulse: v.pulse ?? '',
        bp: v.bpSystolic ? `${v.bpSystolic}/${v.bpDiastolic}` : '', spo2: v.spo2 ?? '',
        respiratoryRate: v.respiratoryRate ?? '', source: v.source,
      }));
    },
  },
  procedure_report: {
    group: 'CLINICAL',
    name: 'Procedure Report',
    columns: ['dateTime', 'admissionNumber', 'procedure', 'category', 'doctor', 'status', 'charge'],
    totals: (rows) => ({ totalProcedures: rows.length, totalCharge: sum(rows, (r) => r.charge) }),
    run: async (q) => {
      const procs = await ProcedureRecord.find({ procedureDate: range(q) })
        .populate('doctorId', 'name').populate('admissionId', 'admissionNumber').sort({ procedureDate: -1 }).lean();
      return procs.map((p) => ({
        dateTime: fmtDT(p.procedureDate), admissionNumber: p.admissionId?.admissionNumber || '—',
        procedure: p.name, category: p.category, doctor: p.doctorId?.name || '—', status: p.status, charge: p.charge || 0,
      }));
    },
  },
  medication_report: {
    group: 'CLINICAL',
    name: 'Medication Report',
    columns: ['admissionNumber', 'medicine', 'strength', 'dose', 'route', 'frequency', 'orderedBy', 'dateTime'],
    totals: (rows) => ({ totalMedicines: rows.length }),
    run: async (q) => {
      const charts = await MedicationChart.find({ createdAt: range(q) })
        .populate('orderedBy', 'name').populate('admissionId', 'admissionNumber').sort({ createdAt: -1 }).lean();
      return charts.map((m) => ({
        admissionNumber: m.admissionId?.admissionNumber || '—', medicine: m.medicineName, strength: m.strength || '',
        dose: m.dosage, route: m.route, frequency: m.frequency, orderedBy: m.orderedBy?.name || '—', dateTime: fmtDT(m.createdAt),
      }));
    },
  },
  investigation_report: {
    group: 'CLINICAL',
    name: 'Investigation Report (Lab + Imaging)',
    columns: ['dateTime', 'admissionNumber', 'type', 'item', 'status', 'orderedBy'],
    totals: (rows) => ({ totalOrders: rows.length }),
    run: async (q) => {
      const [labs, rads] = await Promise.all([
        LabOrder.find({ admissionId: { $exists: true }, orderedAt: range(q) }).populate('orderedBy', 'name').populate('admissionId', 'admissionNumber').lean(),
        RadiologyOrder.find({ admissionId: { $exists: true }, orderedAt: range(q) }).populate('orderedBy', 'name').populate('admissionId', 'admissionNumber').lean(),
      ]);
      return [
        ...labs.map((l) => ({ dateTime: fmtDT(l.orderedAt), admissionNumber: l.admissionId?.admissionNumber || '—', type: 'LAB', item: (l.items || []).map((i) => i.testName).join(', '), status: l.status, orderedBy: l.orderedBy?.name || '—' })),
        ...rads.map((r) => ({ dateTime: fmtDT(r.orderedAt), admissionNumber: r.admissionId?.admissionNumber || '—', type: 'IMAGING', item: (r.tests || []).map((t) => t.testName).join(', '), status: r.status, orderedBy: r.orderedBy?.name || '—' })),
      ].sort((a, b) => (a.dateTime < b.dateTime ? 1 : -1));
    },
  },

  // ===== FINANCIAL =====
  ip_collection: {
    group: 'FINANCIAL',
    name: 'IP Collection',
    columns: ['receipt', 'date', 'admissionNumber', 'patient', 'amount', 'mode', 'type', 'receivedBy'],
    totals: (rows) => ({ totalCollected: sum(rows, (r) => r.amount) }),
    run: async (q) => {
      const rows = await Payment.find({ paidAt: range(q) })
        .populate('receivedBy', 'name').populate('patientId', 'uhid firstName lastName')
        .populate('billId', 'billNumber admissionId').sort({ paidAt: -1 }).lean();
      return rows.map((p) => ({
        receipt: p.receiptNumber || p.transactionId, date: fmtDT(p.paidAt),
        admissionNumber: p.billId?.admissionId ? String(p.billId.admissionId).slice(-6) : '—',
        patient: p.patientId ? `${p.patientId.uhid} · ${p.patientId.firstName} ${p.patientId.lastName || ''}` : '',
        amount: p.amount, mode: p.mode, type: p.paymentType, receivedBy: p.receivedBy?.name || '—',
      }));
    },
  },
  daily_billing: {
    group: 'FINANCIAL',
    name: 'Daily Billing',
    columns: ['date', 'billNumber', 'admissionNumber', 'billType', 'items', 'netTotal', 'paid', 'due', 'status'],
    totals: (rows) => ({ netTotal: sum(rows, (r) => r.netTotal), paid: sum(rows, (r) => r.paid), due: sum(rows, (r) => r.due) }),
    run: async (q) => {
      const bills = await Bill.find({ billDate: range(q) }).populate('admissionId', 'admissionNumber').sort({ billDate: -1 }).lean();
      return bills.map((b) => ({
        date: fmtDate(b.billDate), billNumber: b.billNumber, admissionNumber: b.admissionId?.admissionNumber || '—',
        billType: b.billType, items: (b.items || []).length, netTotal: b.netTotal, paid: b.paidAmount, due: b.dueAmount, status: b.status,
      }));
    },
  },
  room_rent: {
    group: 'FINANCIAL',
    name: 'Room Rent',
    columns: ['admissionNumber', 'patient', 'ward', 'bed', 'days', 'rate', 'amount', 'from', 'to'],
    totals: (rows) => ({ totalRoomRent: sum(rows, (r) => r.amount) }),
    run: async (q) => {
      const bills = await Bill.find({
        billDate: range(q),
        items: { $elemMatch: { $or: [{ serviceCategory: 'ROOM_RENT' }, { itemType: 'ROOM' }] } },
      }).populate('admissionId', 'admissionNumber patientId wardId bedId').lean();
      return (await attachPatient(bills.map((b) => ({ ...b, patientId: b.admissionId?.patientId })))).map((b) => {
        const room = (b.items || []).filter((i) => i.serviceCategory === 'ROOM_RENT' || i.itemType === 'ROOM');
        return {
          admissionNumber: b.admissionId?.admissionNumber || '—', patient: b.patient,
          ward: b.admissionId?.wardId?.name || '—', bed: b.admissionId?.bedId?.bedNumber || '—',
          days: sum(room, (i) => i.quantity), rate: room[0]?.rate || 0, amount: sum(room, (i) => i.total),
          from: room[0]?.serviceDate ? fmtDate(room[0].serviceDate) : fmtDate(b.billDate), to: fmtDate(b.billDate),
        };
      });
    },
  },
  service_charges: {
    group: 'FINANCIAL',
    name: 'Service-wise Charges',
    columns: ['category', 'items', 'quantity', 'amount'],
    totals: (rows) => ({ total: sum(rows, (r) => r.amount) }),
    run: async (q) => {
      const bills = await Bill.find({ billDate: range(q) }).lean();
      const map = new Map();
      for (const b of bills) {
        for (const i of b.items || []) {
          const key = i.serviceCategory || (b.billType === 'PHARMACY' ? 'PHARMACY' : b.billType === 'LAB' ? 'LABORATORY' : b.billType === 'RADIOLOGY' ? 'RADIOLOGY' : b.billType === 'PROCEDURE' ? 'PROCEDURE' : 'OTHER_SERVICES');
          const cur = map.get(key) || { category: key, items: 0, quantity: 0, amount: 0 };
          cur.items += 1;
          cur.quantity += i.quantity || 0;
          cur.amount = round2(cur.amount + (i.total || 0));
          map.set(key, cur);
        }
      }
      return [...map.values()].sort((a, b) => b.amount - a.amount);
    },
  },
  advance_collection: {
    group: 'FINANCIAL',
    name: 'Advance Collection',
    columns: ['receipt', 'date', 'admissionNumber', 'patient', 'type', 'amount', 'adjusted', 'available', 'mode', 'by'],
    totals: (rows) => ({ totalAdvance: sum(rows, (r) => r.amount), available: sum(rows, (r) => r.available) }),
    run: async (q) => {
      const rows = await IpdAdvance.find({ collectedAt: range(q) })
        .populate('collectedBy', 'name').populate('patientId', 'uhid firstName lastName').sort({ collectedAt: -1 }).lean();
      return rows.map((a) => ({
        receipt: a.receiptNumber, date: fmtDT(a.collectedAt), admissionNumber: a.admissionNumber || '—',
        patient: a.patientId ? `${a.patientId.uhid} · ${a.patientId.firstName} ${a.patientId.lastName || ''}` : '',
        type: a.advanceType, amount: a.amount, adjusted: a.adjustedAmount, available: a.availableAmount,
        mode: a.mode, by: a.collectedBy?.name || '—',
      }));
    },
  },
  outstanding: {
    group: 'FINANCIAL',
    name: 'Outstanding',
    columns: ['admissionNumber', 'patient', 'bills', 'netTotal', 'paid', 'due', 'oldestBill'],
    totals: (rows) => ({ totalOutstanding: sum(rows, (r) => r.due) }),
    run: async () => {
      const bills = await Bill.find({ status: { $nin: ['CANCELLED', 'PAID'] }, dueAmount: { $gt: 0 } })
        .populate('admissionId', 'admissionNumber patientId').sort({ dueAmount: -1 }).lean();
      const map = new Map();
      for (const b of bills) {
        const key = String(b.admissionId?._id || b._id);
        const cur = map.get(key) || {
          admissionNumber: b.admissionId?.admissionNumber || '—',
          patientId: b.admissionId?.patientId,
          bills: 0, netTotal: 0, paid: 0, due: 0, oldestBill: fmtDate(b.billDate),
        };
        cur.bills += 1;
        cur.netTotal = round2(cur.netTotal + b.netTotal);
        cur.paid = round2(cur.paid + b.paidAmount);
        cur.due = round2(cur.due + b.dueAmount);
        if (fmtDate(b.billDate) < cur.oldestBill) cur.oldestBill = fmtDate(b.billDate);
        map.set(key, cur);
      }
      return (await attachPatient([...map.values()])).map(({ patientId, ...r }) => r);
    },
  },
  refund: {
    group: 'FINANCIAL',
    name: 'Refund',
    columns: ['date', 'receipt', 'admissionNumber', 'amount', 'mode', 'reason', 'by'],
    totals: (rows) => ({ totalRefunded: sum(rows, (r) => r.amount) }),
    run: async (q) => {
      const rows = await Refund.find({ refundedAt: range(q) })
        .populate('paymentId', 'receiptNumber billId').populate('billId', 'billNumber admissionId')
        .populate('processedBy', 'name').sort({ refundedAt: -1 }).lean();
      return rows.map((r) => ({
        date: fmtDT(r.refundedAt),
        receipt: r.paymentId?.receiptNumber || r.refundNumber,
        admissionNumber: r.billId?.admissionId ? String(r.billId.admissionId).slice(-6) : '—',
        amount: r.amount,
        mode: r.refundedVia,
        reason: r.reason || '—',
        by: r.processedBy?.name || '—',
      }));
    },
  },
  discount: {
    group: 'FINANCIAL',
    name: 'Discount Report',
    columns: ['billNumber', 'admissionNumber', 'date', 'gross', 'discount', 'percent', 'net', 'status'],
    totals: (rows) => ({ totalDiscount: sum(rows, (r) => r.discount) }),
    run: async (q) => {
      const bills = await Bill.find({ billDate: range(q), discount: { $gt: 0 } }).populate('admissionId', 'admissionNumber').sort({ discount: -1 }).lean();
      return bills.map((b) => ({
        billNumber: b.billNumber, admissionNumber: b.admissionId?.admissionNumber || '—', date: fmtDate(b.billDate),
        gross: b.grossTotal, discount: b.discount,
        percent: b.grossTotal ? round2((b.discount / b.grossTotal) * 100) : 0, net: b.netTotal, status: b.status,
      }));
    },
  },
  insurance_report: {
    group: 'FINANCIAL',
    name: 'Insurance / Claims',
    columns: ['claimNumber', 'admissionNumber', 'company', 'claimed', 'approved', 'rejected', 'patientResponsibility', 'status', 'date'],
    totals: (rows) => ({ claimed: sum(rows, (r) => r.claimed), approved: sum(rows, (r) => r.approved), rejected: sum(rows, (r) => r.rejected) }),
    run: async (q) => {
      const claims = await InsuranceClaim.find({ claimDate: range(q) })
        .populate('companyId', 'name').populate('admissionId', 'admissionNumber').sort({ claimDate: -1 }).lean();
      return claims.map((c) => ({
        claimNumber: c.claimNumber, admissionNumber: c.admissionId?.admissionNumber || '—',
        company: c.companyId?.name || '—', claimed: c.claimedAmount, approved: c.approvedAmount,
        rejected: c.rejectedAmount, patientResponsibility: c.patientResponsibility, status: c.status, date: fmtDate(c.claimDate),
      }));
    },
  },
  sponsor_report: {
    group: 'FINANCIAL',
    name: 'Sponsor / Credit Settlement',
    columns: ['settlement', 'admissionNumber', 'sponsor', 'company', 'bill', 'approved', 'sponsorPayable', 'patientPayable', 'status'],
    totals: (rows) => ({ totalBill: sum(rows, (r) => r.bill), sponsorPayable: sum(rows, (r) => r.sponsorPayable), patientPayable: sum(rows, (r) => r.patientPayable) }),
    run: async () => {
      const rows = await IpdSettlement.find({}).populate('admissionId', 'admissionNumber').sort({ createdAt: -1 }).lean();
      return rows.map((s) => ({
        settlement: s.settlementNumber, admissionNumber: s.admissionId?.admissionNumber || '—',
        sponsor: s.sponsor?.name || '—', company: s.sponsor?.company || '—', bill: s.netTotal,
        approved: s.sponsor?.approvedAmount || 0, sponsorPayable: s.sponsor?.sponsorPayable || 0,
        patientPayable: s.sponsor?.patientPayable || 0, status: s.status,
      }));
    },
  },

  // ===== OPERATIONS =====
  average_length_of_stay: {
    group: 'OPERATIONS',
    name: 'Average Length of Stay',
    columns: ['ward', 'discharges', 'totalDays', 'averageStay'],
    totals: (rows) => ({ discharges: sum(rows, (r) => r.discharges), averageStay: rows.length ? round2(sum(rows, (r) => r.totalDays) / sum(rows, (r) => r.discharges)) : 0 }),
    run: async (q) => {
      const { from, to } = bounds(q);
      const rows = await admissionRows({ dischargedAt: { $gte: from, $lt: to } });
      const map = new Map();
      for (const r of rows) {
        const key = r.wardId?.name || 'Unassigned';
        const stay = Math.max(1, Math.ceil((new Date(r.dischargedAt) - new Date(r.admittedAt)) / 86400000));
        const cur = map.get(key) || { ward: key, discharges: 0, totalDays: 0 };
        cur.discharges += 1; cur.totalDays += stay; map.set(key, cur);
      }
      return [...map.values()].map((r) => ({ ...r, averageStay: round2(r.totalDays / r.discharges) }));
    },
  },
  admission_vs_discharge: {
    group: 'OPERATIONS',
    name: 'Admission vs Discharge',
    columns: ['date', 'admissions', 'discharges'],
    totals: (rows) => ({ admissions: sum(rows, (r) => r.admissions), discharges: sum(rows, (r) => r.discharges), net: sum(rows, (r) => r.admissions) - sum(rows, (r) => r.discharges) }),
    run: async (q) => {
      const { from, to } = bounds(q);
      const [adm, dis] = await Promise.all([admissionRows({ admittedAt: { $gte: from, $lt: to } }), admissionRows({ dischargedAt: { $gte: from, $lt: to } })]);
      const dates = new Set();
      const map = new Map();
      for (const r of adm) { const k = fmtDate(r.admittedAt); dates.add(k); map.set(k, { date: k, admissions: 0, discharges: 0 }); }
      for (const r of dis) { const k = fmtDate(r.dischargedAt); dates.add(k); map.set(k, map.get(k) || { date: k, admissions: 0, discharges: 0 }); }
      for (const r of adm) map.get(fmtDate(r.admittedAt)).admissions += 1;
      for (const r of dis) map.get(fmtDate(r.dischargedAt)).discharges += 1;
      return [...map.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
    },
  },
  ward_performance: {
    group: 'OPERATIONS',
    name: 'Ward Performance',
    columns: ['ward', 'beds', 'occupied', 'occupancyPct', 'admissions', 'discharges', 'revenue'],
    run: async (q) => {
      const { from, to } = bounds(q);
      const [wards, beds, adms, bills] = await Promise.all([
        Ward.find({}).sort({ name: 1 }).lean(),
        Bed.find({}).select('wardId status').lean(),
        admissionRows({ admittedAt: { $gte: from, $lt: to } }),
        Bill.find({ billDate: { $gte: from, $lt: to }, admissionId: { $exists: true } }).populate('admissionId', 'wardId').lean(),
      ]);
      return wards.map((w) => {
        const wb = beds.filter((b) => String(b.wardId) === String(w._id));
        const occupied = wb.filter((b) => b.status === 'OCCUPIED').length;
        const wardAdms = adms.filter((a) => String(a.wardId) === String(w._id)).length;
        const revenue = sum(bills.filter((b) => String(b.admissionId?.wardId) === String(w._id)), (b) => b.netTotal);
        return { ward: w.name, beds: wb.length, occupied, occupancyPct: wb.length ? Math.round((occupied / wb.length) * 100) : 0, admissions: wardAdms, discharges: 0, revenue };
      });
    },
  },
  doctor_workload: {
    group: 'OPERATIONS',
    name: 'Doctor Workload',
    columns: ['doctor', 'admissions', 'activeAdmissions', 'rounds', 'procedures', 'discharges'],
    totals: (rows) => ({ admissions: sum(rows, (r) => r.admissions), rounds: sum(rows, (r) => r.rounds) }),
    run: async (q) => {
      const { from, to } = bounds(q);
      const [adms, visits, procs] = await Promise.all([
        admissionRows({ admittedAt: { $gte: from, $lt: to } }),
        DoctorVisit.find({ visitDate: { $gte: from, $lt: to } }).lean(),
        ProcedureRecord.find({ procedureDate: { $gte: from, $lt: to } }).lean(),
      ]);
      const doctorIds = [...new Set(adms.map((a) => a.consultantDoctorId?._id).filter(Boolean))];
      const doctors = doctorIds.length
        ? (await (await import('../models/Doctor.model.js')).default.find({ _id: { $in: doctorIds } }).select('name').lean())
        : [];
      const nameById = new Map(doctors.map((d) => [String(d._id), d.name]));
      const visitsByAdmission = new Map();
      for (const v of visits) {
        const k = String(v.admissionId);
        visitsByAdmission.set(k, (visitsByAdmission.get(k) || 0) + 1);
      }
      return doctors.map((doc) => {
        const mine = adms.filter((a) => String(a.consultantDoctorId?._id) === String(doc._id));
        return {
          doctor: nameById.get(String(doc._id)) || '—',
          admissions: mine.length,
          activeAdmissions: mine.filter((a) => ACTIVE_STATUSES.includes(a.status)).length,
          rounds: mine.reduce((s, a) => s + (visitsByAdmission.get(String(a._id)) || 0), 0),
          procedures: procs.filter((p) => mine.some((a) => String(a._id) === String(p.admissionId))).length,
          discharges: mine.filter((a) => a.dischargedAt).length,
        };
      }).sort((a, b) => b.admissions - a.admissions);
    },
  },
  document_register: {
    group: 'OPERATIONS',
    name: 'IP Document Register',
    columns: ['date', 'ipNumber', 'documentType', 'title', 'source', 'by'],
    totals: (rows) => ({ totalDocuments: rows.length }),
    run: async (q) => {
      const docs = await PatientDocument.find({ admissionId: { $exists: true }, createdDate: range(q) })
        .populate('uploadedBy', 'name').sort({ createdDate: -1 }).limit(1000).lean();
      return docs.map((d) => ({
        date: fmtDT(d.createdDate), ipNumber: d.ipNumber || '—', documentType: d.documentType || d.category,
        title: d.title, source: d.sourceType || 'upload', by: d.uploadedBy?.name || '—',
      }));
    },
  },
};

const groupCount = (rows, keyFn, column) => {
  const map = new Map();
  for (const r of rows) {
    const key = keyFn(r);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ [column]: key, count }));
};

export const listIpdReports = () => Object.entries(IPD_REPORTS).map(([key, def]) => ({
  key,
  name: def.name,
  group: def.group,
  columns: def.columns,
}));

export const runIpdReport = async (key, query = {}) => {
  const def = IPD_REPORTS[key];
  if (!def) throw new NotFoundError(`Unknown IPD report: ${key}`);
  const rows = await def.run(query);
  const totals = def.totals ? def.totals(rows) : null;
  const { from, to } = bounds(query);
  return {
    key,
    name: def.name,
    group: def.group,
    columns: def.columns,
    rows,
    totals,
    meta: { from, to },
  };
};

// ============================================================
// 40. REPORT FORMAT — hospital letterhead + totals + authorisation
// ============================================================
const escapeHtml = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = (n) => (typeof n === 'number' ? n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : n);

export const reportHeader = async (meta, user) => {
  const hospital = await Hospital.findOne({}).lean().catch(() => null);
  return {
    hospitalName: hospital?.name || 'ZhanX Medical Centre',
    address: hospital?.address?.line1
      ? `${hospital.address.line1}${hospital.address.city ? `, ${hospital.address.city}` : ''}${hospital.address.state ? `, ${hospital.address.state}` : ''}${hospital.address.pincode ? ` - ${hospital.address.pincode}` : ''}`
      : '42, Hospital Road, Madurai, Tamil Nadu - 625020',
    reportName: meta.name,
    dateRange: `${fmtDate(meta.meta?.from || new Date())} to ${fmtDate(new Date((meta.meta?.to || new Date()).getTime() - 1))}`,
    branch: meta.branch || 'Main Branch',
    department: meta.department || 'All Departments',
    generatedDate: new Date().toLocaleString('en-IN'),
    generatedBy: user?.name || user?.username || 'System',
  };
};

export const reportToCsv = (data, header) => {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    esc(header.hospitalName), esc(header.address), esc(`Report: ${header.reportName}`),
    esc(`Period: ${header.dateRange}`), esc(`Branch: ${header.branch} | Department: ${header.department}`),
    esc(`Generated: ${header.generatedDate} by ${header.generatedBy}`), '',
    data.columns.map(esc).join(','),
    ...data.rows.map((r) => data.columns.map((c) => esc(r[c])).join(',')),
  ];
  if (data.totals) {
    lines.push('');
    lines.push(esc('TOTALS'));
    for (const [k, v] of Object.entries(data.totals)) lines.push(`${esc(k)},${esc(typeof v === 'number' ? money(v) : v)}`);
  }
  lines.push('', esc('This is a computer generated report.'), esc(`Authorized by: ${header.generatedBy}`));
  return lines.join('\r\n');
};

export const reportToXlsx = async (data, header) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = header.generatedBy;
  const ws = wb.addWorksheet(data.group.charAt(0) + data.group.slice(1).toLowerCase());

  ws.mergeCells('A1:F1');
  const titleCell = ws.getCell('A1');
  titleCell.value = header.hospitalName;
  titleCell.font = { size: 16, bold: true, color: { argb: 'FF1E3A8A' } };
  titleCell.alignment = { horizontal: 'center' };
  ws.mergeCells('A2:F2');
  ws.getCell('A2').value = header.address;
  ws.getCell('A2').alignment = { horizontal: 'center' };
  ws.mergeCells('A3:F3');
  ws.getCell('A3').value = header.reportName;
  ws.getCell('A3').font = { size: 12, bold: true };
  ws.getCell('A3').alignment = { horizontal: 'center' };

  ws.addRow([]);
  ws.addRow([`Period: ${header.dateRange}`, '', `Branch: ${header.branch}`, '', `Department: ${header.department}`]);
  ws.addRow([`Generated: ${header.generatedDate}`, '', `By: ${header.generatedBy}`]);
  ws.addRow([]);

  const headRow = ws.addRow(data.columns);
  headRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });

  for (const r of data.rows) {
    const row = ws.addRow(data.columns.map((c) => r[c]));
    row.eachCell((cell, i) => {
      if (typeof data.rows[0]?.[data.columns[i]] === 'number') cell.numFmt = '#,##0.00';
    });
  }

  if (data.totals) {
    ws.addRow([]);
    const t = ws.addRow(['TOTALS']);
    t.font = { bold: true };
    for (const [k, v] of Object.entries(data.totals)) ws.addRow([k, typeof v === 'number' ? v : String(v)]);
  }

  ws.addRow([]);
  ws.addRow(['This is a computer generated report.']);
  ws.addRow([`Authorized by: ${header.generatedBy}`]);

  data.columns.forEach((c, i) => { ws.getColumn(i + 1).width = Math.min(42, Math.max(14, String(c).length + 4)); });
  ws.views = [{ state: 'frozen', ySplit: headRow.number }];

  return wb.xlsx.writeBuffer();
};

export const reportToHtml = (data, header) => `<!doctype html><html><head><meta charset="utf-8">
<title>${escapeHtml(header.reportName)}</title><style>
  body{font-family:"Segoe UI",Arial,sans-serif;color:#0f172a;margin:24px;font-size:12px}
  .head{text-align:center;border-bottom:2px solid #1e3a8a;padding-bottom:10px;margin-bottom:12px}
  .head h1{font-size:20px;margin:0;color:#1e3a8a} .head p{margin:2px 0;color:#475569;font-size:11px}
  .meta{display:flex;flex-wrap:wrap;gap:14px;font-size:11px;color:#334155;margin-bottom:10px}
  table{width:100%;border-collapse:collapse;font-size:11px}
  th{background:#1e3a8a;color:#fff;padding:6px 7px;text-align:left;font-size:10px;text-transform:uppercase}
  td{padding:5px 7px;border-bottom:1px solid #e2e8f0} tr:nth-child(even) td{background:#f8fafc}
  tfoot td{font-weight:700;background:#eef2ff}
  .sign{margin-top:34px;display:flex;justify-content:space-between;font-size:11px}
  footer{margin-top:26px;border-top:1px solid #cbd5e1;padding-top:8px;text-align:center;font-size:10px;color:#64748b}
  @media print{body{margin:10mm}}
</style></head><body>
<div class="head"><h1>${escapeHtml(header.hospitalName)}</h1><p>${escapeHtml(header.address)}</p>
<h2 style="font-size:14px;margin:6px 0 0">${escapeHtml(header.reportName)}</h2></div>
<div class="meta"><span><b>Period:</b> ${escapeHtml(header.dateRange)}</span><span><b>Branch:</b> ${escapeHtml(header.branch)}</span>
<span><b>Department:</b> ${escapeHtml(header.department)}</span><span><b>Generated:</b> ${escapeHtml(header.generatedDate)}</span>
<span><b>By:</b> ${escapeHtml(header.generatedBy)}</span></div>
<table><thead><tr>${data.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
<tbody>${data.rows.length ? data.rows.map((r) => `<tr>${data.columns.map((c) => `<td>${escapeHtml(typeof r[c] === 'number' ? money(r[c]) : r[c])}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${data.columns.length}">No records for this period</td></tr>`}</tbody>
${data.totals ? `<tfoot><tr><td colspan="${data.columns.length}"><b>TOTALS</b> &nbsp; ${Object.entries(data.totals).map(([k, v]) => `${escapeHtml(k)}: ${escapeHtml(typeof v === 'number' ? money(v) : v)}`).join(' &nbsp;|&nbsp; ')}</td></tr></tfoot>` : ''}
</table>
<div class="sign"><span>_______________________<br>Authorized By</span><span>_______________________<br>Checked By</span></div>
<footer>This is a computer generated report.</footer></body></html>`;

export const reportToPdf = (data, header) => new Promise((resolve, reject) => {
  const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.on('error', reject);

  const left = 36;
  const right = 559;
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#1e3a8a').text(header.hospitalName, left, 36, { align: 'center', width: right - left });
  doc.font('Helvetica').fontSize(8.5).fillColor('#475569').text(header.address, { align: 'center' });
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').fontSize(12).text(header.reportName, { align: 'center' });
  doc.moveDown(0.4);
  doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor('#1e3a8a').lineWidth(1.5).stroke();
  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(8).fillColor('#334155');
  doc.text(`Period: ${header.dateRange}     Branch: ${header.branch}     Department: ${header.department}`, left);
  doc.text(`Generated: ${header.generatedDate}     By: ${header.generatedBy}`);
  doc.moveDown(0.6);

  const cols = data.columns;
  const tableWidth = right - left;
  const colWidth = tableWidth / cols.length;
  const rowH = 15;
  const drawHeader = () => {
    const y = doc.y;
    doc.rect(left, y, tableWidth, rowH).fill('#1e3a8a');
    doc.font('Helvetica-Bold').fontSize(7).fillColor('#ffffff');
    cols.forEach((c, i) => doc.text(String(c).toUpperCase(), left + i * colWidth + 3, y + 4, { width: colWidth - 6, ellipsis: true, lineBreak: false }));
    doc.y = y + rowH;
  };
  drawHeader();

  doc.font('Helvetica').fontSize(7.5).fillColor('#0f172a');
  data.rows.forEach((row, r) => {
    if (doc.y > 520) { doc.addPage(); drawHeader(); doc.font('Helvetica').fontSize(7.5).fillColor('#0f172a'); }
    const y = doc.y;
    if (r % 2 === 0) doc.rect(left, y, tableWidth, rowH).fill('#f8fafc');
    cols.forEach((c, i) => {
      const v = row[c];
      doc.fillColor('#0f172a').text(v == null ? '' : (typeof v === 'number' ? money(v) : String(v)), left + i * colWidth + 3, y + 4, { width: colWidth - 6, ellipsis: true, lineBreak: false });
    });
    doc.y = y + rowH;
  });

  if (data.totals) {
    doc.moveDown(0.4);
    doc.rect(left, doc.y, tableWidth, 16).fill('#eef2ff');
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#1e3a8a').text(
      Object.entries(data.totals).map(([k, v]) => `${k}: ${typeof v === 'number' ? money(v) : v}`).join('   |   '),
      left + 4, doc.y + 4, { width: tableWidth - 8, lineBreak: false, ellipsis: true },
    );
    doc.y += 16;
  }

  doc.moveDown(2);
  const signY = Math.min(doc.y + 20, 540);
  doc.font('Helvetica').fontSize(8).fillColor('#334155');
  doc.text('_______________________', left, signY, { continued: false });
  doc.text('Authorized By', left, signY + 10);
  doc.text('_______________________', right - 160, signY);
  doc.text('Checked By', right - 160, signY + 10);
  doc.fontSize(7.5).fillColor('#64748b');
  doc.text('This is a computer generated report.', left, 570, { align: 'center', width: tableWidth });
  doc.end();
});
