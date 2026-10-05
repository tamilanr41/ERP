import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idempotency } from '../middleware/idempotency.js';
import { success, created } from '../utils/apiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { writeAudit } from '../middleware/audit.js';
import {
  createTransferRequest,
  approveTransfer,
  completeTransfer,
  listTransfers,
  listPendingTransfers,
  listIpdDocuments,
  linkDocument,
  documentsForAdmission,
} from '../services/ipd.transfer.service.js';
import {
  listIpdReports,
  runIpdReport,
  reportHeader,
  reportToCsv,
  reportToXlsx,
  reportToHtml,
  reportToPdf,
} from '../services/ipd.report.service.js';

const router = Router();
router.use(authenticate);
router.use(idempotency);

const VIEW = ['IPD_VIEW', 'BED_VIEW', 'IPD_REPORT_VIEW'];
const TRANSFER = ['IPD_TRANSFER_REQUEST', 'IPD_TRANSFER', 'IPD_ADMIT', 'IPD_DISCHARGE'];
const DOC_VIEW = ['IPD_VIEW', 'IPD_DOCUMENT_UPLOAD', 'PATIENT_DOCUMENT_UPLOAD'];
const DOC_WRITE = ['IPD_DOCUMENT_UPLOAD', 'PATIENT_DOCUMENT_UPLOAD'];
const REPORT_VIEW = ['IPD_REPORT_VIEW', 'REPORT_VIEW'];
const REPORT_EXPORT = ['IPD_REPORT_EXPORT', 'REPORT_EXPORT'];

const REPORT_KEYS = [
  'admission_register', 'daily_admission', 'department_admission', 'doctor_admission', 'admission_type',
  'bed_occupancy', 'ward_occupancy', 'room_occupancy', 'bed_availability', 'bed_utilization', 'bed_transfer',
  'discharge_register', 'daily_discharge', 'expected_discharge', 'discharge_type', 'length_of_stay', 'doctor_discharge',
  'diagnosis_report', 'doctor_visit_report', 'nursing_report', 'vital_report', 'procedure_report', 'medication_report', 'investigation_report',
  'ip_collection', 'daily_billing', 'room_rent', 'service_charges', 'advance_collection', 'outstanding', 'refund', 'discount', 'insurance_report', 'sponsor_report',
  'average_length_of_stay', 'admission_vs_discharge', 'ward_performance', 'doctor_workload', 'document_register',
];

// ===== controllers =====
export const listPendingTransfersController = asyncHandler(async (req, res) => {
  success(res, await listPendingTransfers(), 'Pending transfer requests fetched');
});
export const listTransfersController = asyncHandler(async (req, res) => {
  success(res, await listTransfers(req.params.id), 'Transfers fetched');
});
export const createTransferController = asyncHandler(async (req, res) => {
  const transfer = await createTransferRequest(req.params.id, req.body, req.user);
  await writeAudit({ user: req.user, action: 'IPD_TRANSFER_REQUEST', module: 'ipd', entityId: transfer._id, entityType: 'PatientTransfer', data: { type: transfer.transferType, to: transfer.to, reason: transfer.reason }, req });
  created(res, transfer, `Transfer ${transfer.transferNumber} requested`);
});
export const approveTransferController = asyncHandler(async (req, res) => {
  const transfer = await approveTransfer(req.params.transferId, req.body, req.user);
  await writeAudit({ user: req.user, action: 'IPD_TRANSFER_APPROVE', module: 'ipd', entityId: transfer._id, entityType: 'PatientTransfer', data: { status: transfer.status }, req });
  success(res, transfer, `Transfer ${transfer.status.toLowerCase()}`);
});
export const completeTransferController = asyncHandler(async (req, res) => {
  const transfer = await completeTransfer(req.params.transferId, req.body, req.user);
  await writeAudit({ user: req.user, action: 'IPD_TRANSFER_COMPLETE', module: 'ipd', entityId: transfer._id, entityType: 'PatientTransfer', data: { type: transfer.transferType, bedReleased: transfer.bedReleased, bedAllocated: transfer.bedAllocated }, req });
  success(res, transfer, 'Transfer completed');
});

export const listDocumentsController = asyncHandler(async (req, res) => {
  success(res, await listIpdDocuments(req.params.id), 'IPD documents fetched');
});
export const groupedDocumentsController = asyncHandler(async (req, res) => {
  success(res, await documentsForAdmission(req.params.id), 'IPD documents grouped');
});
export const linkDocumentController = asyncHandler(async (req, res) => {
  const doc = await linkDocument(req.params.id, req.body, req.user);
  await writeAudit({ user: req.user, action: 'IPD_DOCUMENT_LINK', module: 'ipd', entityId: doc._id, entityType: 'PatientDocument', data: { documentType: doc.documentType, title: doc.title }, req });
  created(res, doc, 'Document linked to admission');
});

export const listReportsController = asyncHandler(async (req, res) => {
  success(res, listIpdReports(), 'IPD report catalogue');
});

const buildReport = async (req) => {
  const data = await runIpdReport(req.params.key, req.query);
  const header = await reportHeader(data, req.user);
  return { data, header };
};

export const runReportController = asyncHandler(async (req, res) => {
  const { data } = await buildReport(req);
  await writeAudit({ user: req.user, action: 'IPD_REPORT_VIEW', module: 'ipd', entityType: 'Report', data: { report: data.key }, req });
  success(res, data, `${data.name} generated`);
});

export const exportReportController = asyncHandler(async (req, res) => {
  const { data, header } = await buildReport(req);
  const format = req.params.format;
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `ipd-${data.key}-${stamp}`;
  await writeAudit({ user: req.user, action: 'IPD_REPORT_EXPORT', module: 'ipd', entityType: 'Report', data: { report: data.key, format }, req });

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    return res.send(reportToCsv(data, header));
  }
  if (format === 'print') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(reportToHtml(data, header));
  }
  if (format === 'xlsx') {
    const buffer = await reportToXlsx(data, header);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
    return res.send(Buffer.from(buffer));
  }
  const buffer = await reportToPdf(data, header);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}.pdf"`);
  return res.send(buffer);
});

// ===== 36. patient transfer =====
router.get('/transfers/pending', requirePermission(...VIEW), listPendingTransfersController);
router.get('/admissions/:id/transfers', requirePermission(...VIEW), validate([param('id').isMongoId()]), listTransfersController);
router.post('/admissions/:id/transfers', requirePermission(...TRANSFER), validate([
  param('id').isMongoId(),
  body('transferType').isIn(['WARD', 'ICU', 'OT', 'RADIOLOGY', 'LAB', 'ANOTHER_HOSPITAL']),
  body('reason').notEmpty().withMessage('Transfer reason is required'),
]), createTransferController);
router.patch('/transfers/:transferId/approve', requirePermission(...TRANSFER), validate([param('transferId').isMongoId()]), approveTransferController);
router.post('/transfers/:transferId/complete', requirePermission(...TRANSFER), validate([param('transferId').isMongoId()]), completeTransferController);

// ===== 38. IPD documents =====
router.get('/admissions/:id/documents', requirePermission(...DOC_VIEW), validate([param('id').isMongoId()]), listDocumentsController);
router.get('/admissions/:id/documents/grouped', requirePermission(...DOC_VIEW), validate([param('id').isMongoId()]), groupedDocumentsController);
router.post('/admissions/:id/documents', requirePermission(...DOC_WRITE), validate([
  param('id').isMongoId(),
  body('title').notEmpty().withMessage('Document title required'),
]), linkDocumentController);

// ===== 39/40. IPD reporting centre =====
router.get('/reports/catalogue', requirePermission(...REPORT_VIEW), listReportsController);
router.get('/reports/:key/export.:format', requirePermission(...REPORT_EXPORT), validate([
  param('key').isIn(REPORT_KEYS),
  param('format').isIn(['pdf', 'csv', 'xlsx', 'print']),
  query('from').optional().isISO8601(),
  query('to').optional().isISO8601(),
]), exportReportController);
router.get('/reports/:key', requirePermission(...REPORT_VIEW), validate([
  param('key').isIn(REPORT_KEYS),
  query('from').optional().isISO8601(),
  query('to').optional().isISO8601(),
]), runReportController);

export default router;
