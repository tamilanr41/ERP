import { isValid, parseISO, startOfDay, endOfDay, format } from 'date-fns';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { BadRequestError } from '../utils/ApiError.js';
import Hospital from '../models/Hospital.model.js';
import Branch from '../models/Branch.model.js';
import Department from '../models/Department.model.js';
import Doctor from '../models/Doctor.model.js';
import Patient from '../models/Patient.model.js';
import OpdVisit from '../models/OpdVisit.model.js';
import Appointment from '../models/Appointment.model.js';
import VisitDiagnosis from '../models/VisitDiagnosis.model.js';
import ClinicalOrder from '../models/ClinicalOrder.model.js';
import Prescription from '../models/Prescription.model.js';
import LookupFollowUp from '../models/FollowUp.model.js';
import Bill from '../models/Bill.model.js';
import Payment from '../models/Payment.model.js';
import LookupRefund from '../models/Refund.model.js';

const TZ = 'Asia/Kolkata';

export const LETTERHEAD = {
  name: 'ZhanX Medical Centre',
  address: '42, Hospital Road, Madurai, Tamil Nadu - 625020',
  phone: '+91 452 400 2200',
  email: 'care@zhanxhealth.in',
};

const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (v) => (v ? new Date(v).toLocaleDateString('en-IN') : '—');
const dt = (v) => (v ? new Date(v).toLocaleString('en-IN') : '—');
const pName = (p) => (p ? [p.firstName, p.lastName].filter(Boolean).join(' ') : '—');
const fmtLong = (d) => format(d, 'dd MMM yyyy');

export const dateRange = (q) => {
  const from = q.from && isValid(parseISO(q.from)) ? parseISO(q.from) : startOfDay(new Date(Date.now() - 29 * 86400000));
  const to = q.to && isValid(parseISO(q.to)) ? parseISO(q.to) : new Date();
  if (from > to) throw new BadRequestError('Date From cannot be after Date To');
  return { from: startOfDay(from), to: endOfDay(to) };
};

const visitFilter = (q, { from, to }) => {
  const f = { visitDate: { $gte: from, $lte: to } };
  if (q.doctorId) f.doctorId = q.doctorId;
  if (q.departmentId) f.departmentId = q.departmentId;
  if (q.visitType) f.visitType = q.visitType;
  if (q.status) f.status = q.status;
  if (q.patientId) f.patientId = q.patientId;
  return f;
};

const patientFilter = async (q) => {
  if (q.patientId) return q.patientId;
  if (q.uhid) {
    const p = await Patient.findOne({ uhid: String(q.uhid).trim().toUpperCase() }).select('_id').lean();
    if (p) return p._id;
  }
  return null;
};

const billFilter = (q, { from, to }) => {
  const f = { billDate: { $gte: from, $lte: to } };
  if (!q.skipOpdScope) f.billType = { $in: ['OPD', 'CONSULTATION'] };
  if (q.doctorId) f.doctorId = q.doctorId;
  if (q.departmentId) f.departmentId = q.departmentId;
  if (q.patientId) f.patientId = q.patientId;
  return f;
};

const LOOKUPS = {
  patient: [
    { $lookup: { from: 'patients', localField: 'patientId', foreignField: '_id', as: 'p' } },
    { $unwind: { path: '$p', preserveNullAndEmptyArrays: true } },
  ],
  doctor: [
    { $lookup: { from: 'doctors', localField: 'doctorId', foreignField: '_id', as: 'd' } },
    { $unwind: { path: '$d', preserveNullAndEmptyArrays: true } },
  ],
  department: [
    { $lookup: { from: 'departments', localField: 'departmentId', foreignField: '_id', as: 'dep' } },
    { $unwind: { path: '$dep', preserveNullAndEmptyArrays: true } },
  ],
};

const PANEL = {
  uhid: { $ifNull: ['$p.uhid', '—'] },
  patient: { $cond: [{ $eq: [{ $ifNull: ['$p', null] }, null] }, '—', { $concat: ['$p.firstName', ' ', { $ifNull: ['$p.lastName', ''] }] }] },
  doctor: { $ifNull: ['$d.name', '—'] },
  department: { $ifNull: ['$dep.name', '—'] },
};

const dayKey = { $dateToString: { format: '%Y-%m-%d', date: '$visitDate', timezone: TZ } };
const weekKey = { $dateToString: { format: '%G-W%V', date: '$visitDate', timezone: TZ } };
const monthKey = { $dateToString: { format: '%Y-%m', date: '$visitDate', timezone: TZ } };

/** Derive sensible totals for a report by summing numeric-looking columns. */
const autoTotals = (columns, rows) => {
  const NUM_HINT = /amount|fee|total|revenue|count|visits|consult|units|qty|wait|collected|paid|due|discount|refund|price|rate|minutes|sittings/i;
  const sums = columns.map((c) => ({ label: c, value: 0, isNum: NUM_HINT.test(c) }));
  for (const row of rows) {
    row.forEach((v, i) => {
      if (typeof v === 'number' || (typeof v === 'string' && /^[\d.,₹]+$/.test(v.replace(/₹|,/g, '')))) {
        const n = typeof v === 'number' ? v : Number(v.replace(/₹|,/g, ''));
        if (!Number.isNaN(n)) sums[i].value += n;
      }
    });
  }
  const totals = [{ label: 'Total Records', value: rows.length }];
  sums.forEach((s) => {
    if (s.isNum && s.value !== 0) totals.push({ label: s.label, value: Math.round(s.value * 100) / 100, money: /amount|fee|total|revenue|collected|paid|due|discount|refund|price|rate/i.test(s.label) });
  });
  return totals;
};

// ============================================================================
// REPORT CATALOG
// ============================================================================
const buildVisitReport = async (q, project, sort) => {
  const { from, to } = dateRange(q);
  const pages = await OpdVisit.aggregate([
    { $match: visitFilter(q, { from, to }) },
    ...LOOKUPS.patient, ...LOOKUPS.doctor, ...LOOKUPS.department,
    { $project: project },
    ...(sort ? [{ $sort: sort }] : []),
    { $limit: Math.min(parseInt(q.limit, 10) || 1000, 5000) },
  ]);
  return pages;
};

const REPORTS = {
  // ---------- PATIENT ----------
  'op-registration': {
    title: 'OP Registration Report', category: 'PATIENT', filters: ['from', 'to', 'patient'],
    build: async (q) => {
      const { from, to } = dateRange(q);
      const pid = await patientFilter(q);
      const match = { createdAt: { $gte: from, $lte: to }, deletedAt: null };
      if (pid) match._id = pid;
      const rows = await Patient.aggregate([
        { $match: match },
        { $project: { uhid: 1, reg: '$registrationNumber', name: 1, firstName: 1, lastName: 1, gender: 1, mobile: 1, bloodGroup: 1, city: '$address.city', createdAt: 1 } },
        { $sort: { createdAt: 1 } },
        { $limit: Math.min(parseInt(q.limit, 10) || 1000, 5000) },
      ]);
      const out = rows.map((r) => [r.uhid, pName(r), r.gender, r.mobile, r.bloodGroup || '—', r.city || '—', dt(r.createdAt)]);
      return { columns: ['UHID', 'Patient', 'Gender', 'Mobile', 'Blood Group', 'City', 'Registered At'], rows: out, totals: [{ label: 'Total Registrations', value: rows.length }] };
    },
  },
  'op-visit-register': {
    title: 'OP Visit Register', category: 'PATIENT', filters: ['from', 'to', 'doctor', 'department', 'visitType', 'status', 'patient'],
    build: async (q) => {
      const pid = await patientFilter(q);
      const project = { ...PANEL, opd: '$opdNumber', dob: '$p.dateOfBirth', gender: '$p.gender', type: '$visitType', status: 1, visitDate: 1, complaint: { $ifNull: ['$chiefComplaint', '—'] } };
      const rows = await buildVisitReport({ ...q, patientId: pid || undefined }, project, { visitDate: -1 });
      const out = rows.map((r) => [r.opd, dt(r.visitDate), r.uhid, r.patient, date(r.dob), r.gender, data3(r), r.type, r.doctor, r.department, r.status]);
      const total = out.length;
      return { columns: ['OP No', 'Date', 'UHID', 'Patient', 'DOB', 'Gender', 'Age', 'Type', 'Doctor', 'Department', 'Status'], rows: out, totals: [{ label: 'Total Visits', value: total }, { label: 'Completed', value: rows.filter((r) => r.status === 'COMPLETED').length }] };
      function data3(r) { const dob = r.dob ? new Date(r.dob) : null; if (!dob) return '—'; const a = (Date.now() - dob.getTime()) / 31557600000; return `${Math.floor(a)}y`; }
    },
  },
  'patient-visit-history': {
    title: 'Patient Visit History', category: 'PATIENT', filters: ['from', 'to', 'patient', 'uhid'],
    build: async (q) => {
      const pid = await patientFilter(q);
      const project = { ...PANEL, opd: '$opdNumber', visitDate: 1, type: '$visitType', status: 1, complaint: { $ifNull: ['$chiefComplaint', '—'] }, finalDx: { $ifNull: ['$diagnosis.final', '—'] }, followUp: { $ifNull: ['$followUpDate', null] } };
      const rows = await buildVisitReport({ ...q, patientId: pid || undefined }, project, { visitDate: -1 });
      const out = rows.map((r) => [r.opd, dt(r.visitDate), r.uhid, r.patient, r.type, r.doctor, r.complaint, r.finalDx, r.status, r.followUp ? date(r.followUp) : '—']);
      return { columns: ['OP No', 'Visit Date', 'UHID', 'Patient', 'Type', 'Doctor', 'Complaint', 'Diagnosis', 'Status', 'Next Follow-up'], rows: out, totals: [{ label: 'Total Visits', value: rows.length }], message: pid ? null : 'Apply a Patient / UHID filter for one patient\u2019s full history.' };
    },
  },
  'new-patient': {
    title: 'New Patient Report', category: 'PATIENT', filters: ['from', 'to'],
    build: async (q) => {
      const { from, to } = dateRange(q);
      const rows = await OpdVisit.aggregate([
        { $group: { _id: '$patientId', first: { $min: '$visitDate' }, visits: { $sum: 1 } } },
        { $match: { first: { $gte: from, $lte: to } } },
        ...LOOKUPS.patient,
        { $project: { uhid: { $ifNull: ['$p.uhid', '—'] }, name: { $cond: [{ $eq: [{ $ifNull: ['$p', null] }, null] }, '—', { $concat: ['$p.firstName', ' ', { $ifNull: ['$p.lastName', ''] }] }] }, gender: '$p.gender', mobile: { $ifNull: ['$p.mobile', '—'] }, first: 1, visits: 1 } },
        { $sort: { first: 1 } },
        { $limit: Math.min(parseInt(q.limit, 10) || 1000, 5000) },
      ]);
      const out = rows.map((r) => [r.uhid, r.name, r.gender, r.mobile, dt(r.first), r.visits]);
      return { columns: ['UHID', 'Patient', 'Gender', 'Mobile', 'First Visit', 'Total Visits'], rows: out, totals: [{ label: 'New Patients', value: rows.length }] };
    },
  },
  'followup-patient': {
    title: 'Follow-up Patient Report', category: 'PATIENT', filters: ['from', 'to', 'doctor', 'department', 'patient'],
    build: async (q) => {
      const { from, to } = dateRange(q);
      const pid = await patientFilter(q);
      const match = { date: { $gte: from, $lte: to } };
      if (q.doctorId) match.doctorId = q.doctorId;
      if (q.departmentId) match.departmentId = q.departmentId;
      if (pid) match.patientId = pid;
      const rows = await LookupFollowUp.aggregate([
        { $match: match },
        ...LOOKUPS.patient, ...LOOKUPS.doctor, ...LOOKUPS.department,
        { $project: { ...PANEL, no: '$followUpNumber', date: 1, reason: { $ifNull: ['$reason', '—'] }, status: 1, reminder: { $ifNull: ['$reminderDate', null] } } },
        { $sort: { date: 1 } },
        { $limit: Math.min(parseInt(q.limit, 10) || 1000, 5000) },
      ]);
      const out = rows.map((r) => [r.no, r.uhid, r.patient, dt(r.date), r.doctor, r.department, r.reason, r.reminder ? date(r.reminder) : '—', r.status]);
      return { columns: ['Follow-up No', 'UHID', 'Patient', 'Date', 'Doctor', 'Department', 'Reason', 'Reminder', 'Status'], rows: out, totals: [{ label: 'Total Follow-ups', value: rows.length }] };
    },
  },

  // ---------- DOCTOR ----------
  'doctor-op-count': {
    title: 'Doctor-wise OP Count', category: 'DOCTOR', filters: ['from', 'to', 'department', 'visitType'],
    build: async (q) => {
      const { from, to } = dateRange(q);
      const match = visitFilter(q, { from, to }); delete match.doctorId;
      const rows = await OpdVisit.aggregate([
        { $match: match },
        ...LOOKUPS.doctor, ...LOOKUPS.department,
        { $group: { _id: '$d._id', doctor: { $first: { $ifNull: ['$d.name', '—'] } }, dept: { $first: { $ifNull: ['$dep.name', '—'] } }, visits: { $sum: 1 }, newP: { $sum: { $cond: [{ $eq: ['$visitType', 'NEW'] }, 1, 0] } }, followups: { $sum: { $cond: [{ $eq: ['$visitType', 'FOLLOW_UP'] }, 1, 0] } }, walkins: { $sum: { $cond: [{ $eq: ['$visitType', 'WALK_IN'] }, 1, 0] } }, completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } }, referred: { $sum: { $cond: [{ $eq: ['$status', 'REFERRED'] }, 1, 0] } } } },
        { $project: { _id: 0, doctor: 1, dept: 1, visits: 1, newP: 1, followups: 1, walkins: 1, completed: 1, referred: 1 } },
        { $sort: { visits: -1 } },
      ]);
      return { columns: ['Doctor', 'Department', 'Total', 'New', 'Follow-up', 'Walk-in', 'Completed', 'Referred'], rows: rows.map((r) => [r.doctor, r.dept, r.visits, r.newP, r.followups, r.walkins, r.completed, r.referred]), totals: rows.length ? [{ label: 'Total Consults', value: rows.reduce((a, r) => a + r.visits, 0) }] : [] };
    },
  },
  'doctor-collection': {
    title: 'Doctor-wise Collection', category: 'DOCTOR', filters: ['from', 'to', 'department'],
    build: async (q) => {
      const { from, to } = dateRange(q);
      const f = billFilter({ ...q, skipOpdScope: true }, { from, to });
      const rows = await Bill.aggregate([
        { $match: f },
        ...LOOKUPS.doctor, ...LOOKUPS.department,
        { $group: { _id: '$doctorId', doctor: { $first: { $ifNull: ['$d.name', '—'] } }, dept: { $first: { $ifNull: ['$dep.name', '—'] } }, billed: { $sum: '$netTotal' }, collected: { $sum: '$paidAmount' }, pending: { $sum: '$dueAmount' }, bills: { $sum: 1 } } },
        { $project: { _id: 0, doctor: 1, dept: 1, bills: 1, billed: 1, collected: 1, pending: 1 } },
        { $sort: { collected: -1 } },
      ]);
      const out = rows.map((r) => [r.doctor, r.dept, r.bills, money(r.billed), money(r.collected), money(r.pending)]);
      return { columns: ['Doctor', 'Department', 'Bills', 'Billed Amount', 'Collected', 'Pending'], rows: out, totals: [{ label: 'Total Billed', value: rows.reduce((a, r) => a + r.billed, 0), money: true }, { label: 'Collected', value: rows.reduce((a, r) => a + r.collected, 0), money: true }, { label: 'Pending', value: rows.reduce((a, r) => a + r.pending, 0), money: true }] };
    },
  },
  'doctor-consultation': {
    title: 'Doctor-wise Consultation', category: 'DOCTOR', filters: ['from', 'to', 'department', 'visitType'],
    build: async (q) => {
      const { from, to } = dateRange(q);
      const match = visitFilter(q, { from, to }); delete match.doctorId;
      const rows = await OpdVisit.aggregate([
        { $match: match },
        ...LOOKUPS.doctor, ...LOOKUPS.department,
        { $group: { _id: '$d._id', doctor: { $first: { $ifNull: ['$d.name', '—'] } }, dept: { $first: { $ifNull: ['$dep.name', '—'] } }, consults: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } }, referred: { $sum: { $cond: [{ $eq: ['$status', 'REFERRED'] }, 1, 0] } }, diagnosed: { $sum: { $cond: [['$diagnosis.final'], 1, 0] } } } },
        { $project: { _id: 0, doctor: 1, dept: 1, consults: 1, completed: 1, referred: 1, diagnosed: 1 } },
        { $sort: { consults: -1 } },
      ]);
      return { columns: ['Doctor', 'Department', 'Consults', 'Completed', 'Referred', 'With Diagnosis'], rows: rows.map((r) => [r.doctor, r.dept, r.consults, r.completed, r.referred, r.diagnosed]), totals: [{ label: 'Total Consults', value: rows.reduce((a, r) => a + r.consults, 0) }] };
    },
  },
  'doctor-performance': {
    title: 'Doctor Performance Summary', category: 'DOCTOR', filters: ['from', 'to', 'department'],
    build: async (q) => {
      const { from, to } = dateRange(q);
      const match = visitFilter(q, { from, to }); delete match.doctorId;
      const [visits, rx] = await Promise.all([
        OpdVisit.aggregate([
          { $match: match },
          ...LOOKUPS.doctor,
          { $group: { _id: '$d._id', doctor: { $first: { $ifNull: ['$d.name', '—'] } }, consults: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } }, referred: { $sum: { $cond: [{ $eq: ['$status', 'REFERRED'] }, 1, 0] } }, assigned: { $addToSet: '$patientId' } } },
          { $project: { _id: 0, doctor: 1, consults: 1, completed: 1, referred: 1, patients: { $size: '$assigned' } } },
        ]),
        LookupFollowUp.aggregate([
          { $match: { date: { $gte: from, $lte: to } } },
          ...LOOKUPS.doctor,
          { $group: { _id: '$d._id', doctor: { $first: { $ifNull: ['$d.name', '—'] } }, followups: { $sum: 1 } } },
        ]),
      ]);
      const rxMap = new Map(rx.map((r) => [String(r._id), r.followups]));
      const out = visits.map((r) => [r.doctor, r.consults, r.completed, r.referred, r.patients, rxMap.get(String(r._id)) || 0]);
      return { columns: ['Doctor', 'Consults', 'Completed', 'Referred', 'Unique Patients', 'Follow-ups Scheduled'], rows: out, totals: [{ label: 'Total Consults', value: visits.reduce((a, r) => a + r.consults, 0) }] };
    },
  },

  // ---------- DEPARTMENT ----------
  'department-op-count': {
    title: 'Department-wise OP Count', category: 'DEPARTMENT', filters: ['from', 'to', 'doctor', 'visitType'],
    build: async (q) => {
      const { from, to } = dateRange(q);
      const match = visitFilter(q, { from, to }); delete match.departmentId;
      const rows = await OpdVisit.aggregate([
        { $match: match },
        ...LOOKUPS.department,
        { $group: { _id: '$dep._id', department: { $first: { $ifNull: ['$dep.name', 'Unassigned'] } }, visits: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } }, referred: { $sum: { $cond: [{ $eq: ['$status', 'REFERRED'] }, 1, 0] } } } },
        { $project: { _id: 0, department: 1, visits: 1, completed: 1, referred: 1 } },
        { $sort: { visits: -1 } },
      ]);
      return { columns: ['Department', 'Total Visits', 'Completed', 'Referred'], rows: rows.map((r) => [r.department, r.visits, r.completed, r.referred]), totals: [{ label: 'Total Visits', value: rows.reduce((a, r) => a + r.visits, 0) }] };
    },
  },
  'department-revenue': {
    title: 'Department-wise Revenue', category: 'DEPARTMENT', filters: ['from', 'to', 'doctor'],
    build: async (q) => {
      const { from, to } = dateRange(q);
      const rows = await Bill.aggregate([
        { $match: billFilter({ ...q, skipOpdScope: true }, { from, to }) },
        ...LOOKUPS.department,
        { $group: { _id: '$dep._id', department: { $first: { $ifNull: ['$dep.name', 'Unassigned'] } }, billed: { $sum: '$netTotal' }, collected: { $sum: '$paidAmount' }, pending: { $sum: '$dueAmount' }, bills: { $sum: 1 } } },
        { $project: { _id: 0, department: 1, bills: 1, billed: 1, collected: 1, pending: 1 } },
        { $sort: { billed: -1 } },
      ]);
      const out = rows.map((r) => [r.department, r.bills, money(r.billed), money(r.collected), money(r.pending)]);
      return { columns: ['Department', 'Bills', 'Billed Amount', 'Collected', 'Pending'], rows: out, totals: [{ label: 'Total Billed', value: rows.reduce((a, r) => a + r.billed, 0), money: true }, { label: 'Collected', value: rows.reduce((a, r) => a + r.collected, 0), money: true }, { label: 'Pending', value: rows.reduce((a, r) => a + r.pending, 0), money: true }] };
    },
  },
  'department-patient-flow': {
    title: 'Department-wise Patient Flow', category: 'DEPARTMENT', filters: ['from', 'to', 'doctor', 'reportBy'],
    build: async (q) => {
      const { from, to } = dateRange(q);
      const key = q.reportBy === 'month' ? monthKey : q.reportBy === 'week' ? weekKey : dayKey;
      const rows = await OpdVisit.aggregate([
        { $match: visitFilter(q, { from, to }) },
        ...LOOKUPS.department,
        { $group: { _id: { dept: { $ifNull: ['$dep.name', 'Unassigned'] }, day: key }, count: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } } } },
        { $project: { _id: 0, day: '$_id.day', department: '$_id.dept', count: 1, completed: 1 } },
        { $sort: { day: 1, department: 1 } },
      ]);
      const out = rows.map((r) => [r.day, r.department, r.count, r.completed]);
      const dCount = new Set(rows.map((r) => r.department)).size;
      return { columns: ['Period', 'Department', 'Visits', 'Completed'], rows: out, totals: [{ label: 'Total Visits', value: rows.reduce((a, r) => a + r.count, 0) }, { label: 'Departments', value: dCount }] };
    },
  },

  // ---------- QUEUE ----------
  'queue-token': {
    title: 'Token Report', category: 'QUEUE', filters: ['from', 'to', 'doctor', 'department', 'patient'],
    build: async (q) => {
      const { from, to } = dateRange(q);
      const pid = await patientFilter(q);
      const match = { date: { $gte: from, $lte: to } };
      if (q.doctorId) match.doctorId = q.doctorId;
      if (q.departmentId) match.departmentId = q.departmentId;
      if (pid) match.patientId = pid;
      const rows = await Appointment.aggregate([
        { $match: match },
        ...LOOKUPS.patient, ...LOOKUPS.doctor, ...LOOKUPS.department,
        { $project: { ...PANEL, no: '$appointmentNumber', token: { $ifNull: ['$tokenNumber', '—'] }, time: { $ifNull: ['$time', '—'] }, status: 1, checkedIn: { $ifNull: ['$checkedInAt', null] } } },
        { $sort: { date: 1, token: 1 } },
        { $limit: Math.min(parseInt(q.limit, 10) || 1000, 5000) },
      ]);
      const out = rows.map((r) => [r.no, date(r.date), r.token, r.time, r.uhid, r.patient, r.doctor, r.department, r.status, r.checkedIn ? dt(r.checkedIn) : '—']);
      return { columns: ['Appt No', 'Date', 'Token', 'Time', 'UHID', 'Patient', 'Doctor', 'Department', 'Status', 'Checked In'], rows: out, totals: [{ label: 'Total Tokens', value: rows.length }] };
    },
  },
  'queue-waiting-time': {
    title: 'Waiting Time Report', category: 'QUEUE', filters: ['from', 'to', 'doctor', 'department'],
    build: async (q) => {
      const { from, to } = dateRange(q);
      const match = { date: { $gte: from, $lte: to }, checkedInAt: { $ne: null } };
      if (q.doctorId) match.doctorId = q.doctorId;
      if (q.departmentId) match.departmentId = q.departmentId;
      const rows = await Appointment.aggregate([
        { $match: match },
        ...LOOKUPS.doctor, ...LOOKUPS.department,
        { $project: { doctor: { $ifNull: ['$d.name', '—'] }, dept: { $ifNull: ['$dep.name', '—'] }, date: 1, bookTime: '$createdAt', checkIn: '$checkedInAt', status: 1 } },
        { $group: { _id: { doc: '$doctor', dept: '$dept', date: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: TZ } } }, appts: { $sum: 1 }, waitSum: { $sum: { $divide: [{ $subtract: ['$checkIn', '$bookTime'] }, 60000] } } } },
        { $project: { _id: 0, doctor: '$_id.doc', date: '$_id.date', department: '$_id.dept', appts: 1, avgWaitMins: { $divide: ['$waitSum', { $max: ['$appts', 1] }] } } },
        { $sort: { date: 1, avgWaitMins: -1 } },
      ]);
      const out = rows.map((r) => [r.doctor, r.department, r.date, r.appts, Math.round(r.avgWaitMins)]);
      return { columns: ['Doctor', 'Department', 'Date', 'Appointments', 'Avg Wait (min)'], rows: out, totals: [{ label: 'Total Appointments', value: rows.reduce((a, r) => a + r.appts, 0) }] };
    },
  },
  'queue-doctor': {
    title: 'Doctor Queue Report', category: 'QUEUE', filters: ['from', 'to', 'department'],
    build: async (q) => {
      const qd = q.from ? { from: q.from, to: q.to || q.from } : { from: q.from, to: q.to };
      const { from, to } = dateRange(qd);
      const match = { date: { $gte: from, $lte: to } };
      if (q.departmentId) match.departmentId = q.departmentId;
      const rows = await Appointment.aggregate([
        { $match: match },
        ...LOOKUPS.doctor,
        { $group: { _id: '$d._id', doctor: { $first: { $ifNull: ['$d.name', '—'] } }, date: { $first: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: TZ } } }, booked: { $sum: 1 }, checkedIn: { $sum: { $cond: [{ $in: ['$status', ['CHECKED_IN', 'WAITING', 'IN_CONSULTATION']] }, 1, 0] } }, done: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } }, noShow: { $sum: { $cond: [{ $eq: ['$status', 'NO_SHOW'] }, 1, 0] } }, waiting: { $sum: { $cond: [{ $in: ['$status', ['CHECKED_IN', 'WAITING']] }, 1, 0] } } } },
        { $project: { _id: 0, doctor: 1, date: 1, booked: 1, checkedIn: 1, waiting: 1, done: 1, noShow: 1 } },
        { $sort: { date: 1, doctor: 1 } },
      ]);
      const out = rows.map((r) => [r.doctor, r.date, r.booked, r.checkedIn, r.waiting, r.done, r.noShow]);
      return { columns: ['Doctor', 'Date', 'Booked', 'Checked-in', 'Waiting', 'Completed', 'No-show'], rows: out, totals: [{ label: 'Total Booked', value: rows.reduce((a, r) => a + r.booked, 0) }] };
    },
  },
  'queue-no-show': {
    title: 'No-show Report', category: 'QUEUE', filters: ['from', 'to', 'doctor', 'department'],
    build: async (q) => {
      const { from, to } = dateRange(q);
      const match = { date: { $gte: from, $lte: to }, status: 'NO_SHOW' };
      if (q.doctorId) match.doctorId = q.doctorId;
      if (q.departmentId) match.departmentId = q.departmentId;
      const rows = await Appointment.aggregate([
        { $match: match },
        ...LOOKUPS.patient, ...LOOKUPS.doctor, ...LOOKUPS.department,
        { $project: { ...PANEL, no: '$appointmentNumber', date: 1, time: { $ifNull: ['$time', '—'] }, type: { $ifNull: ['$type', '—'] } } },
        { $sort: { date: -1 } },
        { $limit: Math.min(parseInt(q.limit, 10) || 1000, 5000) },
      ]);
      const out = rows.map((r) => [r.no, date(r.date), r.time, r.uhid, r.patient, r.doctor, r.department, r.type]);
      return { columns: ['Appt No', 'Date', 'Time', 'UHID', 'Patient', 'Doctor', 'Department', 'Type'], rows: out, totals: [{ label: 'Total No-shows', value: rows.length }] };
    },
  },

  // ---------- FINANCIAL ----------
  'op-collection': {
    title: 'OP Collection Report', category: 'FINANCIAL', filters: ['from', 'to', 'doctor', 'department', 'paymentMode', 'reportBy'],
    build: async (q) => {
      const { from, to } = dateRange(q);
      const key = q.reportBy === 'month' ? '%Y-%m' : q.reportBy === 'week' ? '%G-W%V' : '%Y-%m-%d';
      const match = { paidAt: { $gte: from, $lte: to }, status: 'SUCCESS' };
      if (q.paymentMode) match.mode = q.paymentMode;
      const rows = await Payment.aggregate([
        { $match: match },
        {
          $lookup: { from: 'bills', localField: 'billId', foreignField: '_id', as: 'b' },
        },
        { $unwind: { path: '$b', preserveNullAndEmptyArrays: true } },
        { $match: q.doctorId ? { 'b.doctorId': q.doctorId } : {}, ...(q.departmentId ? { 'b.departmentId': q.departmentId } : {}) },
        { $group: { _id: { key: { $dateToString: { format: key, date: '$paidAt', timezone: TZ } }, mode: '$mode' }, count: { $sum: 1 }, collected: { $sum: '$amount' } } },
        { $project: { _id: 0, period: '$_id.key', mode: '$_id.mode', count: 1, collected: 1 } },
        { $sort: { period: 1, mode: 1 } },
      ]);
      const out = rows.map((r) => [r.period, r.mode, r.count, money(r.collected)]);
      return { columns: ['Period', 'Payment Mode', 'Payments', 'Collected'], rows: out, totals: [{ label: 'Total Collected', value: rows.reduce((a, r) => a + r.collected, 0), money: true }, { label: 'Payments', value: rows.reduce((a, r) => a + r.count, 0) }] };
    },
  },
  'payment-mode': {
    title: 'Payment Mode Report', category: 'FINANCIAL', filters: ['from', 'to', 'reportBy'],
    build: async (q) => {
      const { from, to } = dateRange(q);
      const rows = await Payment.aggregate([
        { $match: { paidAt: { $gte: from, $lte: to }, status: 'SUCCESS' } },
        { $group: { _id: '$mode', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
        { $project: { _id: 0, mode: { $ifNull: ['$_id', '—'] }, count: 1, amount: 1 } },
        { $sort: { amount: -1 } },
      ]);
      const out = rows.map((r) => [r.mode, r.count, money(r.amount), rows.length ? `${Math.round((100 * r.amount) / rows.reduce((a, x) => a + x.amount, 0))}%` : '—']);
      const total = rows.reduce((a, r) => a + r.amount, 0);
      return { columns: ['Mode', 'Payments', 'Amount', 'Share'], rows: out, totals: [{ label: 'Total Collected', value: total, money: true }, { label: 'Total Payments', value: rows.reduce((a, r) => a + r.count, 0) }] };
    },
  },
  'discount': {
    title: 'Discount Report', category: 'FINANCIAL', filters: ['from', 'to', 'doctor', 'department', 'patient'],
    build: async (q) => {
      const { from, to } = dateRange(q);
      const pid = await patientFilter(q);
      const match = billFilter({ ...q, skipOpdScope: true, patientId: pid || undefined }, { from, to });
      match.discount = { $gt: 0 };
      const rows = await Bill.aggregate([
        { $match: match },
        ...LOOKUPS.patient, ...LOOKUPS.doctor,
        { $project: { _id: 0, no: '$billNumber', uhid: '$p.uhid', patient: { $cond: [{ $eq: [{ $ifNull: ['$p', null] }, null] }, '$patientName', { $concat: ['$p.firstName', ' ', { $ifNull: ['$p.lastName', ''] }] }] }, date: '$billDate', gross: '$grossTotal', discount: 1, tax: 1, net: '$netTotal', doc: { $ifNull: ['$d.name', '—'] }, mode: { $ifNull: ['$paymentMode', '—'] } } },
        { $sort: { date: -1 } },
        { $limit: Math.min(parseInt(q.limit, 10) || 1000, 5000) },
      ]);
      const out = rows.map((r) => [r.no, date(r.date), r.uhid, r.patient, r.doc, money(r.gross), money(r.discount), money(r.net), r.mode]);
      return { columns: ['Bill No', 'Date', 'UHID', 'Patient', 'Doctor', 'Gross', 'Discount', 'Net', 'Mode'], rows: out, totals: [{ label: 'Total Discount', value: rows.reduce((a, r) => a + r.discount, 0), money: true }, { label: 'Net Billed', value: rows.reduce((a, r) => a + r.net, 0), money: true }] };
    },
  },
  'refund': {
    title: 'Refund Report', category: 'FINANCIAL', filters: ['from', 'to', 'patient'],
    build: async (q) => {
      const { from, to } = dateRange(q);
      const pid = await patientFilter(q);
      const match = { refundedAt: { $gte: from, $lte: to }, status: 'PROCESSED' };
      if (pid) match.patientId = pid;
      const rows = await LookupRefund.aggregate([
        { $match: match },
        ...LOOKUPS.patient,
        { $project: { _id: 0, no: '$refundNumber', uhid: '$p.uhid', patient: { $cond: [{ $eq: [{ $ifNull: ['$p', null] }, null] }, '—', { $concat: ['$p.firstName', ' ', { $ifNull: ['$p.lastName', ''] }] }] }, date: '$refundedAt', amount: 1, reason: 1, via: { $ifNull: ['$refundedVia', '—'] }, status: 1 } },
        { $sort: { date: -1 } },
        { $limit: Math.min(parseInt(q.limit, 10) || 1000, 5000) },
      ]);
      const out = rows.map((r) => [r.no, r.uhid, r.patient, dt(r.date), money(r.amount), r.via, r.reason || '—', r.status]);
      return { columns: ['Refund No', 'UHID', 'Patient', 'Refunded At', 'Amount', 'Mode', 'Reason', 'Status'], rows: out, totals: [{ label: 'Total Refunded', value: rows.reduce((a, r) => a + r.amount, 0), money: true }] };
    },
  },
  'pending-due': {
    title: 'Pending Due Report', category: 'FINANCIAL', filters: ['from', 'to', 'doctor', 'department', 'patient'],
    build: async (q) => {
      const { from, to } = dateRange(q);
      const pid = await patientFilter(q);
      const match = billFilter({ ...q, skipOpdScope: true, patientId: pid || undefined }, { from, to });
      match.dueAmount = { $gt: 0 };
      match.status = { $in: ['PENDING', 'FINAL', 'PARTIALLY_PAID'] };
      const rows = await Bill.aggregate([
        { $match: match },
        ...LOOKUPS.patient, ...LOOKUPS.doctor,
        { $project: { _id: 0, no: '$billNumber', uhid: '$p.uhid', patient: '$patientName', date: '$billDate', net: '$netTotal', paid: '$paidAmount', due: '$dueAmount', mode: { $ifNull: ['$paymentMode', '—'] }, status: 1 } },
        { $sort: { due: -1 } },
        { $limit: Math.min(parseInt(q.limit, 10) || 2000, 5000) },
      ]);
      const out = rows.map((r) => [r.no, date(r.date), r.uhid, r.patient, money(r.net), money(r.paid), money(r.due), r.mode, r.status]);
      return { columns: ['Bill No', 'Date', 'UHID', 'Patient', 'Bill Amount', 'Paid', 'Due', 'Mode', 'Status'], rows: out, totals: [{ label: 'Total Due', value: rows.reduce((a, r) => a + r.due, 0), money: true }, { label: 'Bills', value: rows.length }] };
    },
  },
  'credit': {
    title: 'Credit Report', category: 'FINANCIAL', filters: ['from', 'to', 'doctor', 'department', 'patient'],
    build: async (q) => {
      const { from, to } = dateRange(q);
      const pid = await patientFilter(q);
      const match = billFilter({ ...q, skipOpdScope: true, patientId: pid || undefined }, { from, to });
      match.$or = [{ paymentMode: 'CREDIT' }, { status: { $in: ['FINAL', 'PARTIALLY_PAID', 'PENDING'] }, dueAmount: { $gt: 0 } }];
      const rows = await Bill.aggregate([
        { $match: match },
        ...LOOKUPS.patient,
        { $project: { _id: 0, no: '$billNumber', uhid: '$p.uhid', patient: '$patientName', date: '$billDate', net: '$netTotal', paid: '$paidAmount', due: '$dueAmount', status: 1 } },
        { $sort: { due: -1 } },
        { $limit: Math.min(parseInt(q.limit, 10) || 2000, 5000) },
      ]);
      const out = rows.map((r) => [r.no, date(r.date), r.uhid, r.patient, money(r.net), money(r.paid), money(r.due), r.status]);
      return { columns: ['Bill No', 'Date', 'UHID', 'Patient', 'Bill Amount', 'Paid', 'Balance', 'Status'], rows: out, totals: [{ label: 'Outstanding Credit', value: rows.reduce((a, r) => a + r.due, 0), money: true }, { label: 'Bills', value: rows.length }] };
    },
  },

  // ---------- CLINICAL ----------
  'diagnosis': {
    title: 'Diagnosis Report', category: 'CLINICAL', filters: ['from', 'to', 'doctor', 'patient'],
    build: async (q) => {
      const { from, to } = dateRange(q);
      const pid = await patientFilter(q);
      const visitIds = (await OpdVisit.find(visitFilter({ ...q, patientId: pid || undefined }, { from, to })).select('_id').lean()).map((v) => v._id);
      if (!visitIds.length) return { columns: ['ICD Code', 'Diagnosis', 'Count'], rows: [], totals: [] };
      const rows = await VisitDiagnosis.aggregate([
        { $match: { visitId: { $in: visitIds } } },
        { $group: { _id: { icd: { $ifNull: ['$icd10Code', '—'] }, name: '$name' }, count: { $sum: 1 } } },
        { $project: { _id: 0, icd: '$_id.icd', name: '$_id.name', count: 1 } },
        { $sort: { count: -1 } },
        { $limit: 60 },
      ]);
      const out = rows.map((r) => [r.icd, r.name, r.count]);
      return { columns: ['ICD Code', 'Diagnosis', 'Count'], rows: out, totals: [{ label: 'Diagnoses Recorded', value: rows.reduce((a, r) => a + r.count, 0) }] };
    },
  },
  'investigation-order': {
    title: 'Investigation Order Report', category: 'CLINICAL', filters: ['from', 'to', 'department', 'patient'],
    build: async (q) => {
      const { from, to } = dateRange(q);
      const pid = await patientFilter(q);
      const match = { orderedAt: { $gte: from, $lte: to } };
      if (q.departmentId) match.departmentId = q.departmentId;
      if (pid) match.patientId = pid;
      const rows = await ClinicalOrder.aggregate([
        { $match: match },
        ...LOOKUPS.patient, ...LOOKUPS.department,
        { $project: { _id: 0, no: '$orderNumber', uhid: '$p.uhid', patient: { $cond: [{ $eq: [{ $ifNull: ['$p', null] }, null] }, '—', { $concat: ['$p.firstName', ' ', { $ifNull: ['$p.lastName', ''] }] }] }, category: 1, name: 1, priority: 1, status: 1, dept: { $ifNull: ['$dep.name', '—'] }, at: '$orderedAt' } },
        { $sort: { at: -1 } },
        { $limit: Math.min(parseInt(q.limit, 10) || 1000, 5000) },
      ]);
      const out = rows.map((r) => [r.no, r.uhid, r.patient, r.category, r.name, r.priority, r.status, r.dept, dt(r.at)]);
      return { columns: ['Order No', 'UHID', 'Patient', 'Category', 'Investigation', 'Priority', 'Status', 'Department', 'Ordered At'], rows: out, totals: [{ label: 'Total Orders', value: rows.length }, { label: 'Lab', value: rows.filter((r) => r.category === 'LAB').length }, { label: 'Radiology', value: rows.filter((r) => r.category === 'RADIOLOGY').length }] };
    },
  },
  'prescription': {
    title: 'Prescription Report', category: 'CLINICAL', filters: ['from', 'to', 'doctor'],
    build: async (q) => {
      const { from, to } = dateRange(q);
      const match = { createdAt: { $gte: from, $lte: to } };
      if (q.doctorId) match.doctorId = q.doctorId;
      const key = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TZ } };
      const rows = await Prescription.aggregate([
        { $match: match },
        { $group: { _id: key, total: { $sum: 1 }, signed: { $sum: { $cond: [{$gte: [{ $ifNull: ['$status', ''] }, 'SIGNED']}, 1, 0] } }, dispensed: { $sum: { $cond: [{ $eq: [{ $ifNull: ['$isDispensed', false] }, true] }, 1, 0] } } } },
        { $project: { _id: 0, date: '$_id', total: 1, signed: 1, dispensed: 1 } },
        { $sort: { date: 1 } },
      ]);
      const out = rows.map((r) => [r.date, r.total, r.signed, r.dispensed]);
      return { columns: ['Date', 'Total', 'Signed', 'Dispensed'], rows: out, totals: [{ label: 'Total Prescriptions', value: rows.reduce((a, r) => a + r.total, 0) }] };
    },
  },
  'referral': {
    title: 'Referral Report', category: 'CLINICAL', filters: ['from', 'to', 'doctor', 'department', 'patient'],
    build: async (q) => {
      const { from, to } = dateRange(q);
      const pid = await patientFilter(q);
      const rows = await OpdVisit.aggregate([
        { $match: visitFilter({ ...q, patientId: pid || undefined }, { from, to }) },
        { $match: { 'referral.toDoctor': { $ne: null } } },
        ...LOOKUPS.patient, ...LOOKUPS.doctor, ...LOOKUPS.department,
        { $project: { ...PANEL, opd: '$opdNumber', toDoc: { $ifNull: ['$referral.toDoctor', '—'] }, toDep: { $ifNull: ['$referral.toDepartment', '—'] }, reason: { $ifNull: ['$referral.reason', '—'] }, at: { $ifNull: ['$referral.referredAt', '$visitDate'] } } },
        { $sort: { at: -1 } },
        { $limit: Math.min(parseInt(q.limit, 10) || 1000, 5000) },
      ]);
      const out = rows.map((r) => [r.opd, r.uhid, r.patient, r.doctor, r.toDoc, r.toDep, r.reason, dt(r.at)]);
      return { columns: ['OP No', 'UHID', 'Patient', 'Referred By', 'To Doctor', 'To Department', 'Reason', 'Referred At'], rows: out, totals: [{ label: 'Total Referrals', value: rows.length }] };
    },
  },
  'followup': {
    title: 'Follow-up Report', category: 'CLINICAL', filters: ['from', 'to', 'doctor', 'department', 'patient'],
    build: async (q) => {
      const { from, to } = dateRange(q);
      const pid = await patientFilter(q);
      const match = { createdAt: { $gte: from, $lte: to } };
      if (q.doctorId) match.doctorId = q.doctorId;
      if (q.departmentId) match.departmentId = q.departmentId;
      if (pid) match.patientId = pid;
      const rows = await LookupFollowUp.aggregate([
        { $match: match },
        ...LOOKUPS.patient, ...LOOKUPS.doctor, ...LOOKUPS.department,
        { $project: { ...PANEL, no: '$followUpNumber', date: 1, reason: { $ifNull: ['$reason', '—'] }, status: 1, appt: { $toString: { $ifNull: ['$appointmentId', null] } } } },
        { $sort: { date: 1 } },
        { $limit: Math.min(parseInt(q.limit, 10) || 1000, 5000) },
      ]);
      const out = rows.map((r) => [r.no, r.uhid, r.patient, dt(r.date), r.doctor, r.department, r.reason, r.status]);
      return { columns: ['Follow-up No', 'UHID', 'Patient', 'Date', 'Doctor', 'Department', 'Reason', 'Status'], rows: out, totals: [{ label: 'Total Follow-ups', value: rows.length }] };
    },
  },

  // ---------- MANAGEMENT ----------
  ...mgmtReports(),
};

function mgmtReports() {
  const byPeriod = (key, cols) => async (q) => {
    const { from, to } = dateRange(q);
    const visits = await OpdVisit.aggregate([
      { $match: visitFilter(q, { from, to }) },
      { $group: { _id: key, visits: { $sum: 1 }, newP: { $sum: { $cond: [{ $eq: ['$visitType', 'NEW'] }, 1, 0] } }, followUps: { $sum: { $cond: [{ $eq: ['$visitType', 'FOLLOW_UP'] }, 1, 0] } }, walkins: { $sum: { $cond: [{ $eq: ['$visitType', 'WALK_IN'] }, 1, 0] } }, completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } }, referred: { $sum: { $cond: [{ $eq: ['$status', 'REFERRED'] }, 1, 0] } } } },
      { $project: { _id: 0, period: '$_id', visits: 1, newP: 1, followUps: 1, walkins: 1, completed: 1, referred: 1 } },
      { $sort: { period: 1 } },
    ]);
    const bills = q.reportBy === 'none'
      ? []
      : await Bill.aggregate([
          { $match: billFilter({ skipOpdScope: true }, { from, to }) },
          { $group: { _id: { $dateToString: { format: key === monthKey ? '%Y-%m' : key === weekKey ? '%G-W%V' : '%Y-%m-%d', date: '$billDate', timezone: TZ } }, net: { $sum: '$netTotal' }, collected: { $sum: '$paidAmount' } } },
        ]);
    const rev = new Map(bills.map((b) => [String(b._id), b]));
    const out = visits.map((r) => {
      const b = rev.get(String(r.period));
      return [r.period, r.visits, r.newP, r.followUps, r.walkins, r.completed, r.referred, b ? money(b.net) : money(0), b ? money(b.collected) : money(0)];
    });
    return { columns: [...cols, 'Billed', 'Collected'], rows: out, totals: [{ label: 'Total Visits', value: visits.reduce((a, x) => a + x.visits, 0) }, { label: 'Total Completed', value: visits.reduce((a, x) => a + x.completed, 0) }, { label: 'Total Billed', value: bills.reduce((a, x) => a + x.net, 0), money: true }, { label: 'Total Collected', value: bills.reduce((a, x) => a + x.collected, 0), money: true }] };
  };
  const base = ['Period', 'Visits', 'New', 'Follow-up', 'Walk-in', 'Completed', 'Referred'];
  return {
    'opd-summary-daily': { title: 'Daily OPD Summary', category: 'MANAGEMENT', filters: ['from', 'to', 'doctor', 'department'], build: byPeriod(dayKey, base) },
    'opd-summary-weekly': { title: 'Weekly OPD Summary', category: 'MANAGEMENT', filters: ['from', 'to', 'doctor', 'department'], build: byPeriod(weekKey, base) },
    'opd-summary-monthly': { title: 'Monthly OPD Summary', category: 'MANAGEMENT', filters: ['from', 'to', 'doctor', 'department'], build: byPeriod(monthKey, base) },
    'opd-trend': { title: 'OPD Trend', category: 'MANAGEMENT', filters: ['from', 'to', 'doctor', 'department'], build: byPeriod(dayKey, base) },
    'patient-flow': {
      title: 'Patient Flow', category: 'MANAGEMENT', filters: ['from', 'to', 'doctor', 'department'],
      build: async (q) => {
        const { from, to } = dateRange(q);
        const rows = await OpdVisit.aggregate([
          { $match: visitFilter(q, { from, to }) },
          ...LOOKUPS.department,
          { $project: { dept: { $ifNull: ['$dep.name', 'Unassigned'] }, hour: { $dateToString: { format: '%H', date: '$visitDate', timezone: TZ } }, status: 1, visitType: 1 } },
          { $group: { _id: { dept: '$dept', hour: '$hour' }, count: { $sum: 1 } } },
          { $project: { _id: 0, dept: '$_id.dept', hour: '$_id.hour', count: 1 } },
          { $sort: { dept: 1, hour: 1 } },
        ]);
        const out = rows.map((r) => [r.dept, `${r.hour}:00`, r.count]);
        const maxH = new Map(); rows.forEach((r) => maxH.set(r.dept, Math.max(maxH.get(r.dept) || 0, r.count)));
        return { columns: ['Department', 'Hour', 'Visits'], rows: out, totals: [{ label: 'Total Visits', value: rows.reduce((a, r) => a + r.count, 0) }, { label: 'Departments', value: maxH.size }] };
      },
    },
    'department-performance': {
      title: 'Department Performance', category: 'MANAGEMENT', filters: ['from', 'to', 'doctor'],
      build: async (q) => {
        const { from, to } = dateRange(q);
        const match = visitFilter(q, { from, to }); delete match.departmentId;
        const [visits, bills] = await Promise.all([
          OpdVisit.aggregate([
            { $match: match },
            ...LOOKUPS.department,
            { $group: { _id: '$dep._id', department: { $first: { $ifNull: ['$dep.name', 'Unassigned'] } }, visits: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } }, referred: { $sum: { $cond: [{ $eq: ['$status', 'REFERRED'] }, 1, 0] } }, doctors: { $addToSet: '$doctorId' } } },
          ]),
          Bill.aggregate([
            { $match: billFilter({ skipOpdScope: true }, { from, to }) },
            ...LOOKUPS.department,
            { $group: { _id: '$dep._id', department: { $first: { $ifNull: ['$dep.name', 'Unassigned'] } }, billed: { $sum: '$netTotal' }, collected: { $sum: '$paidAmount' } } },
          ]),
        ]);
        const rev = new Map(bills.map((b) => [String(b._id), b]));
        const out = visits.map((r) => {
          const b = rev.get(String(r._id));
          return [r.department, r.visits, r.doctors.filter(Boolean).length, r.completed, r.referred, b ? money(b.billed) : money(0), b ? money(b.collected) : money(0)];
        });
        return { columns: ['Department', 'Visits', 'Doctors', 'Completed', 'Referred', 'Billed', 'Collected'], rows: out, totals: [{ label: 'Total Visits', value: visits.reduce((a, r) => a + r.visits, 0) }, { label: 'Total Billed', value: bills.reduce((a, r) => a + r.billed, 0), money: true }] };
      },
    },
  };
}

// ============================================================================
// CATEGORY LIST + RUN
// ============================================================================
export const REPORT_CATEGORIES = ['PATIENT', 'DOCTOR', 'DEPARTMENT', 'QUEUE', 'FINANCIAL', 'CLINICAL', 'MANAGEMENT'];

export const listReports = () =>
  Object.entries(REPORTS).map(([key, r]) => ({
    key,
    title: r.title,
    category: r.category,
    filters: r.filters || ['from', 'to'],
  }));

export const getCatalog = (name) => REPORTS[name];

export const runReport = async (name, q) => {
  const rep = REPORTS[name];
  if (!rep) throw new BadRequestError(`Unknown report: ${name}`);
  const built = await rep.build(q || {});
  if (!built.totals) built.totals = autoTotals(built.columns, built.rows);
  built.key = name;
  built.title = rep.title;
  built.category = rep.category;
  return built;
};

export const reportMeta = async ({ rep, q, user }) => {
  const hosp = (await Hospital.findOne({ active: true }).lean()) || LETTERHEAD;
  const branch = q.branchId ? await Branch.findById(q.branchId).lean() : null;
  const dept = q.departmentId ? await Department.findById(q.departmentId).lean() : null;
  const doctor = q.doctorId ? await Doctor.findById(q.doctorId).lean() : null;
  const { from, to } = dateRange(q);
  const fromD = q.from ? fmtLong(from) : 'From beginning of period';
  const toD = q.to ? fmtLong(to) : fmtLong(to);
  return {
    hospital: {
      name: hosp.name || LETTERHEAD.name,
      address: [hosp.address?.line1, hosp.address?.line2].filter(Boolean).join(', ') || LETTERHEAD.address,
      city: [hosp.address?.city, hosp.address?.state].filter(Boolean).join(', '),
      pincode: hosp.address?.pincode || '',
      phone: hosp.phone || LETTERHEAD.phone,
      email: hosp.email || LETTERHEAD.email,
      gst: hosp.gstNumber || '',
      logo: hosp.logo || '',
      reportFooter: hosp.reportSettings?.footer || '',
    },
    reportName: rep.title,
    reportKey: rep.key,
    category: rep.category,
    period: fromD === toD ? fromD : `${fromD} — ${toD}`,
    from: from,
    to: to,
    branch: branch?.name || 'Main Hospital',
    department: dept?.name || (q.departmentId ? String(q.departmentId) : 'All Departments'),
    doctor: doctor?.name || (q.doctorId ? String(q.doctorId) : 'All Doctors'),
    generatedAt: new Date(),
    generatedBy: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || 'System' : 'System',
    role: user?.roleCode || '',
  };
};

// ============================================================================
// EXPORT ENGINE (letterhead + totals on every surface)
// ============================================================================
export const reportToCsv = (rep) => {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = rep.columns.map(esc).join(',');
  const body = rep.rows.map((r) => r.map(esc).join(','));
  return [head, ...body].join('\r\n');
};

export const reportToExcel = async (rep, meta) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(rep.title.slice(0, 30) || 'Report');
  ws.columns = rep.columns.map((h) => ({ header: h, key: h, width: Math.max(h.length + 2, 16) }));
  ws.getRow(1).values = [meta.hospital.name];
  ws.getRow(1).font = { bold: true, size: 16 };
  ws.mergeCells(1, 1, 1, rep.columns.length);
  ws.getRow(2).values = [meta.hospital.address + (meta.hospital.city ? `, ${meta.hospital.city}` : '')];
  ws.getRow(2).font = { size: 9 };
  ws.mergeCells(2, 1, 2, rep.columns.length);
  ws.getRow(3).values = [`Phone: ${meta.hospital.phone}${meta.hospital.email ? `  |  ${meta.hospital.email}` : ''}`];
  ws.getRow(3).font = { size: 9 };
  ws.mergeCells(3, 1, 3, rep.columns.length);
  ws.getRow(4).values = [''];
  ws.getRow(5).values = ['Report Period', `${meta.period}`];
  ws.getRow(6).values = ['Branch', meta.branch];
  ws.getRow(7).values = ['Department', meta.department];
  ws.getRow(8).values = ['Generated By', meta.generatedBy];
  ws.getRow(9).values = ['Generated At', meta.generatedAt.toLocaleString('en-IN')];
  ws.getRow(10).values = [''];
  const hdr = ws.getRow(11);
  hdr.eachCell((c) => { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF142A57' } }; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.alignment = { vertical: 'middle' }; });
  hdr.height = 22;
  ws.addRows(rep.rows.map((r) => rep.columns.reduce((acc, c, i) => { acc[c] = r[i]; return acc; }, {})));
  if (rep.totals?.length) {
    const tr = ws.addRow(rep.columns.reduce((acc, c, i) => { acc[c] = i === 0 ? 'TOTAL' : ''; return acc; }, {}));
    rep.totals.forEach((t) => {
      const idx = rep.columns.indexOf(t.label);
      if (idx >= 0) tr.getCell(idx + 1).value = t.money ? `₹${t.value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : t.value;
    });
    tr.font = { bold: true };
    tr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4F8' } };
  }
  const sig = rep.columns.length - 1;
  ws.addRow([]);
  ws.addRow([]);
  const r1 = ws.addRow([`                    Generated by                             Authorized by`]);
  ws.mergeCells(r1.number, 1, r1.number, rep.columns.length);
  return wb.xlsx.writeBuffer();
};

export const reportToPdf = (rep, meta) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const rowH = 16;
    let y;
    const header = () => {
      doc.font('Helvetica-Bold').fontSize(15).text(meta.hospital.name, { align: 'center' });
      doc.font('Helvetica').fontSize(8).fillColor('#444').text(meta.hospital.address, { align: 'center' });
      if (meta.hospital.city) doc.text(meta.hospital.city, { align: 'center' });
      doc.text(`Phone: ${meta.hospital.phone}${meta.hospital.email ? `  |  ${meta.hospital.email}` : ''}${meta.hospital.gst ? `  |  GSTIN: ${meta.hospital.gst}` : ''}`, { align: 'center' });
      doc.moveDown(0.4);
      doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.margins.left + W, doc.y).strokeColor('#142A57').lineWidth(1.4).stroke();
      doc.fillColor('#000');
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').fontSize(12).text(meta.reportName.toUpperCase(), { align: 'center' });
      doc.font('Helvetica').fontSize(9).text(`Period: ${meta.period}   |   Branch: ${meta.branch}   |   Department: ${meta.department}`, { align: 'center' });
      doc.fontSize(8).fillColor('#555').text(`Generated: ${meta.generatedAt.toLocaleString('en-IN')} by ${meta.generatedBy}`, { align: 'center' });
      doc.fillColor('#000').moveDown(0.6);
    };
    header();
    y = doc.y;

    const cols = rep.columns;
    const widths = cols.map(() => W / cols.length);
    const fit = (s, max) => { s = String(s ?? ''); return s.length > max ? s.slice(0, max - 1) + '…' : s; };
    const drawHead = () => {
      let x = doc.page.margins.left;
      doc.font('Helvetica-Bold').fontSize(7.5);
      cols.forEach((c, i) => {
        doc.rect(x, y, widths[i], rowH).fill('#142A57');
        doc.fill('#fff').text(fit(c, Math.floor(widths[i] / 4.6)), x + 3, y + 4.5, { width: widths[i] - 6 });
        x += widths[i];
      });
      doc.fillColor('#000');
      y += rowH;
    };
    const drawRow = (r) => {
      if (y + rowH > doc.page.height - 70) { doc.addPage(); doc.font('Helvetica'); doc.fontSize(8).fillColor('#666').text('— continued —', { align: 'center' }); y = doc.y + 8; drawHead(); }
      let x = doc.page.margins.left;
      doc.font('Helvetica').fontSize(7.5);
      r.forEach((v, i) => {
        doc.rect(x, y, widths[i], rowH - 1).stroke('#d8dee6');
        doc.text(fit(v, Math.floor(widths[i] / 4.8)), x + 3, y + 4.5, { width: widths[i] - 6 });
        x += widths[i];
      });
      y += rowH;
    };
    drawHead();
    rep.rows.slice(0, 2000).forEach(drawRow);

    // Totals
    if (rep.totals?.length) {
      y += 8;
      if (y > doc.page.height - 90) { doc.addPage(); y = doc.page.margins.top; }
      doc.font('Helvetica-Bold').fontSize(9).text('SUMMARY', { align: 'left' });
      doc.fontSize(9);
      rep.totals.forEach((t) => {
        const val = t.money ? `₹${t.value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : t.value.toLocaleString('en-IN');
        doc.text(`${t.label}: ${val}`, { continued: false });
      });
    }

    // Signature
    y += 26;
    if (y > doc.page.height - 80) { doc.addPage(); y = doc.page.margins.top + 20; }
    doc.moveDown(2).fontSize(9).fillColor('#333');
    doc.text(`Generated by: ${meta.generatedBy}${meta.role ? ` (${meta.role})` : ''}`, { align: 'left' });
    doc.text('Authorized by: ____________________________', { align: 'right' });
    doc.moveDown(0.5).moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.margins.left + W, doc.y).strokeColor('#999').lineWidth(0.5).stroke();
    doc.fontSize(7).fillColor('#666').text(`${meta.hospital.name} ${meta.hospital.reportFooter ? `| ${meta.hospital.reportFooter}` : ''}`, { align: 'center' });
    doc.end();
  });

export const reportToPrintHtml = (rep, meta) => {
  const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const th = rep.columns.map((c) => `<th>${esc(c)}</th>`).join('');
  const rows = rep.rows.slice(0, 2000).map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('');
  const totals = rep.totals?.map((t) => `<div class="sum"><span>${esc(t.label)}</span><b>${t.money ? money(t.value) : t.value.toLocaleString('en-IN')}</b></div>`).join('') || '';
  const ext = (s) => esc(s);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${ext(rep.title)}</title>
<style>
  * { box-sizing: border-box; } body { font-family: 'Segoe UI', Arial, sans-serif; color: #111; margin: 0; padding: 24px; font-size: 12px; }
  .head { text-align: center; border-bottom: 3px solid #142A57; padding-bottom: 10px; margin-bottom: 14px; }
  .head h1 { margin: 0 0 2px; font-size: 22px; letter-spacing: 0.5px; }
  .head .addr { font-size: 11px; color: #333; }
  .head .phone { font-size: 10px; color: #555; }
  .report-title { text-align: center; font-size: 16px; font-weight: 700; margin: 4px 0 2px; }
  .report-meta { text-align: center; font-size: 11px; color: #333; margin-bottom: 12px; }
  .report-meta .gen { color: #777; font-size: 10px; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th { background: #142A57; color: #fff; font-size: 10px; text-align: left; padding: 6px 7px; text-transform: uppercase; letter-spacing: 0.3px; }
  td { border: 1px solid #cfd6df; padding: 5px 7px; font-size: 11px; }
  tr:nth-child(even) td { background: #f4f7fb; }
  .totals { margin-top: 12px; padding-top: 8px; border-top: 2px solid #142A57; display: flex; flex-wrap: wrap; gap: 18px; }
  .totals .sum span { color: #555; font-size: 11px; margin-right: 6px; } .totals .sum b { font-size: 12px; }
  .tfoot { margin-top: 34px; display: flex; justify-content: space-between; font-size: 11px; color: #333; }
  .sig { text-align: right; }
  @media print { body { padding: 0; } .no-print { display: none; } }
</style></head><body>
  <div class="no-print" style="margin-bottom:12px">
    <button onclick="window.print()" style="padding:8px 16px;font-size:12px;font-weight:600">Print</button>
  </div>
  <div class="head">
    <h1>${ext(meta.hospital.name)}</h1>
    <div class="addr">${ext(meta.hospital.address)}${meta.hospital.city ? `, ${ext(meta.hospital.city)}` : ''}</div>
    <div class="phone">Phone: ${ext(meta.hospital.phone)}${meta.hospital.email ? ` | ${ext(meta.hospital.email)}` : ''}</div>
  </div>
  <div class="report-title">${ext(rep.title)}</div>
  <div class="report-meta">
    Report Period: <b>${ext(meta.period)}</b> &nbsp;|&nbsp; Branch: <b>${ext(meta.branch)}</b> &nbsp;|&nbsp; Department: <b>${ext(meta.department)}</b><br>
    <span class="gen">Generated on ${meta.generatedAt.toLocaleString('en-IN')} by ${ext(meta.generatedBy)}</span>
  </div>
  <table><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table>
  ${totals ? `<div class="totals">${totals}</div>` : ''}
  <div class="tfoot">
    <span>Generated by: ${ext(meta.generatedBy)}${meta.role ? ` (${ext(meta.role)})` : ''}</span>
    <span class="sig">Authorized by: ____________________</span>
  </div>
</body></html>`;
};