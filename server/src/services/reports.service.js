import { isValid, parseISO, startOfDay, endOfDay } from 'date-fns';
import { BadRequestError } from '../utils/ApiError.js';
import Patient from '../models/Patient.model.js';
import OpdVisit from '../models/OpdVisit.model.js';
import Prescription from '../models/Prescription.model.js';
import PharmacySale from '../models/PharmacySale.model.js';
import MedicineBatch from '../models/MedicineBatch.model.js';

const FC = (v) => ({ $concatArrays: [['$toUpper', { $substrCP: ['$' + v, 0, 1] }], [{ $substrCP: ['$' + v, 1, -1] }]] });
const days = (q) => {
  const from = q.from ? parseISO(q.from) : startOfDay(new Date(Date.now() - 29 * 86400000));
  const to = q.to ? parseISO(q.to) : new Date();
  if (!isValid(from) || !isValid(to)) throw new BadRequestError('Invalid date range');
  return { from: startOfDay(from), to: endOfDay(to) };
};

const ONE = [
  { $lookup: { from: 'patients', localField: 'patientId', foreignField: '_id', as: 'pt' } },
  { $unwind: { path: '$pt', preserveNullAndEmptyArrays: true } },
  { $lookup: { from: 'users', localField: 'doctorId', foreignField: '_id', as: 'doc' } },
  { $unwind: { path: '$doc', preserveNullAndEmptyArrays: true } },
];

const REPORTS = {
  'op-registration': {
    title: 'OP Registration Report',
    build: async (q) => {
      const { from, to } = days(q);
      const rows = await Patient.aggregate([
        { $match: { createdAt: { $gte: from, $lte: to } } },
        { $project: { uhid: 1, _id: 1, firstName: 1, middleName: 1, lastName: 1, gender: 1, mobile: 1, dateOfBirth: 1, abhaId: 1, createdAt: 1 } },
        { $sort: { createdAt: 1 } },
        { $limit: Math.min(parseInt(q.limit, 10) || 500, 2000) },
      ]);
      return {
        columns: ['UHID', 'Name', 'Gender', 'Mobile', 'Blood', 'Registered At'],
        rows: rows.map((r) => [r.uhid, [r.firstName, r.middleName, r.lastName].filter(Boolean).join(' '), r.gender, r.mobile, r.bloodGroup || '—', new Date(r.createdAt).toLocaleString('en-IN')]),
      };
    },
  },
  'op-visit-register': {
    title: 'OP Visit Register',
    build: async (q) => {
      const { from, to } = days(q);
      const rows = await OpdVisit.aggregate([
        { $match: { visitDate: { $gte: from, $lte: to } } },
        ...ONE,
        { $project: { uhid: '$pt.uhid', pName: { $concat: ['$pt.firstName', ' ', { $ifNull: ['$pt.lastName', ''] }] }, dName: '$doc.name', visitType: 1, status: 1, visitDate: 1, completedAt: 1 } },
        { $sort: { visitDate: -1 } },
        { $limit: Math.min(parseInt(q.limit, 10) || 500, 2000) },
      ]);
      return {
        columns: ['UHID', 'Patient', 'Doctor', 'Type', 'Status', 'Visit Date'],
        rows: rows.map((r) => [r.uhid, r.pName, r.dName || '—', (r.visitType || '—').toUpperCase(), r.status, new Date(r.visitDate).toLocaleString('en-IN')]),
      };
    },
  },
  'doctor-op-count': {
    title: 'Doctor-wise OP Count',
    build: async (q) => {
      const { from, to } = days(q);
      const rows = await OpdVisit.aggregate([
        { $match: { visitDate: { $gte: from, $lte: to } } },
        ...ONE,
        { $group: { _id: '$doc._id', name: { $first: '$doc.name' }, consults: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } }, referred: { $sum: { $cond: [{ $eq: ['$status', 'REFERRED'] }, 1, 0] } } } },
        { $project: { _id: 0, doctor: { $ifNull: ['$name', 'Unassigned'] }, consults: 1, completed: 1, referred: 1 } },
        { $sort: { consults: -1 } },
      ]);
      return { columns: ['Doctor', 'Total Consults', 'Completed', 'Referred'], rows: rows.map((r) => [r.doctor, r.consults, r.completed, r.referred]) };
    },
  },
  'department-op-count': {
    title: 'Department-wise OP Count',
    build: async (q) => {
      const { from, to } = days(q);
      const rows = await OpdVisit.aggregate([
        { $match: { visitDate: { $gte: from, $lte: to } } },
        { $group: { _id: { $ifNull: ['$department', 'UNASSIGNED'] }, visits: { $sum: 1 } } },
        { $project: { _id: 0, department: '$_id', visits: 1 } },
        { $sort: { visits: -1 } },
      ]);
      return { columns: ['Department', 'Visits'], rows: rows.map((r) => [r.department, r.visits]) };
    },
  },
  diagnosis: {
    title: 'Diagnosis Report',
    build: async (q) => {
      const { from, to } = days(q);
      const visitIds = (await OpdVisit.find({ visitDate: { $gte: from, $lte: to } }).select('_id').lean()).map((v) => v._id);
      const rows = await OpdVisit.aggregate([
        { $match: { _id: { $in: visitIds }, 'diagnoses.0': { $exists: true } } },
        { $unwind: '$diagnoses' },
        { $group: { _id: '$diagnoses.code', diagnosis: { $first: '$diagnoses.name' }, count: { $sum: 1 } } },
        { $project: { _id: 0, code: '$_id', diagnosis: 1, count: 1 } },
        { $sort: { count: -1 } },
        { $limit: 60 },
      ]);
      return { columns: ['Code', 'Diagnosis', 'Count'], rows: rows.map((r) => [r.code || '—', r.diagnosis || '—', r.count]) };
    },
  },
  prescription: {
    title: 'Prescription Report',
    build: async (q) => {
      const { from, to } = days(q);
      const rows = await Prescription.aggregate([
        { $match: { prescriptionDate: { $gte: from, $lte: to } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$prescriptionDate' } }, total: { $sum: 1 }, dispensed: { $sum: { $cond: ['$isDispensed', 1, 0] } }, signed: { $sum: { $cond: [{ $gte: ['$status', 'SIGNED'] }, 1, 0] } } } },
        { $project: { _id: 0, date: '$_id', total: 1, dispensed: 1, signed: 1 } },
        { $sort: { date: 1 } },
      ]);
      return { columns: ['Date', 'Total', 'Signed', 'Dispensed'], rows: rows.map((r) => [r.date, r.total, r.signed, r.dispensed]) };
    },
  },
  referral: {
    title: 'Referral Report',
    build: async (q) => {
      const { from, to } = days(q);
      const rows = await OpdVisit.aggregate([
        { $match: { visitDate: { $gte: from, $lte: to }, status: 'REFERRED' } },
        ...ONE,
        { $project: { uhid: '$pt.uhid', pName: { $concat: ['$pt.firstName', ' ', { $ifNull: ['$pt.lastName', ''] }] }, toDept: '$referral.toDepartment', toDoc: '$referral.toDoctor', reason: '$referral.reason', priority: '$referral.priority', referDate: '$referral.referralDate' } },
        { $sort: { referDate: -1 } },
        { $limit: Math.min(parseInt(q.limit, 10) || 500, 2000) },
      ]);
      return { columns: ['UHID', 'Patient', 'To Department', 'To Doctor', 'Reason', 'Priority', 'Referral Date'], rows: rows.map((r) => [r.uhid, r.pName, r.toDept || '—', r.toDoc || '—', r.reason || '—', r.priority || '—', r.referDate ? new Date(r.referDate).toLocaleString('en-IN') : '—']) };
    },
  },
  followup: {
    title: 'Follow-up Report',
    build: async (q) => {
      const { from, to } = days(q);
      const rows = await OpdVisit.aggregate([
        { $match: { 'followUps.0': { $exists: true } } },
        { $unwind: '$followUps' },
        { $match: { 'followUps.followUpDate': { $gte: from, $lte: to } } },
        ...ONE,
        { $project: { uhid: '$pt.uhid', pName: { $concat: ['$pt.firstName', ' ', { $ifNull: ['$pt.lastName', ''] }] }, reason: '$followUps.reason', date: '$followUps.followUpDate', status: '$followUps.status' } },
        { $sort: { date: 1 } },
        { $limit: Math.min(parseInt(q.limit, 10) || 500, 2000) },
      ]);
      return { columns: ['UHID', 'Patient', 'Reason', 'Follow-up Date', 'Status'], rows: rows.map((r) => [r.uhid, r.pName, r.reason || '—', new Date(r.date).toLocaleString('en-IN'), r.status || '—']) };
    },
  },
  'pharmacy-sales': {
    title: 'Pharmacy Sales Report',
    build: async (q) => {
      const { from, to } = days(q);
      const rows = await PharmacySale.aggregate([
        { $match: { saleDate: { $gte: from, $lte: to }, status: 'COMPLETED' } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$saleDate' } }, sales: { $sum: 1 }, revenue: { $sum: '$netTotal' }, tax: { $sum: '$tax' } } },
        { $project: { _id: 0, date: '$_id', sales: 1, revenue: 1, tax: 1 } },
        { $sort: { date: 1 } },
      ]);
      return { columns: ['Date', 'Sales', 'Revenue (₹)', 'Tax (₹)'], rows: rows.map((r) => [r.date, r.sales, (r.revenue || 0).toFixed(2), (r.tax || 0).toFixed(2)]) };
    },
  },
  expiry: {
    title: 'Medicines Expiring Soon',
    build: async (q) => {
      const { from, to } = days(q);
      const rows = await MedicineBatch.aggregate([
        { $match: { expiryDate: { $gte: from, $lte: to }, quantity: { $gt: 0 } } },
        { $lookup: { from: 'medicines', localField: 'medicineId', foreignField: '_id', as: 'med' } },
        { $unwind: { path: '$med', preserveNullAndEmptyArrays: true } },
        { $project: { _id: 0, medicine: { $ifNull: ['$med.name', '—'] }, batch: '$batchNumber', qty: '$quantity', expiry: '$expiryDate' } },
        { $sort: { expiry: 1 } },
      ]);
      return { columns: ['Medicine', 'Batch', 'Quantity', 'Expiry'], rows: rows.map((r) => [r.medicine, r.batch, r.qty, new Date(r.expiry).toLocaleDateString('en-IN')]) };
    },
  },
};

export const listReportsService = () => Object.entries(REPORTS).map(([key, r]) => ({ key, title: r.title }));

export const runReportService = async (name, query) => {
  const rep = REPORTS[name];
  if (!rep) throw new BadRequestError(`Unknown report: ${name}`);
  const data = await rep.build(query || {});
  data.generatedAt = new Date();
  return data;
};

export const reportToCsv = (rep) => {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [rep.columns.map(esc).join(','), ...rep.rows.map((r) => r.map(esc).join(','))].join('\r\n');
};
