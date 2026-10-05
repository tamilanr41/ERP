import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idempotency } from '../middleware/idempotency.js';
import {
  listChargesController,
  updateChargeController,
  previewBillingController,
  runDailyBillingController,
  runDailyBillingAllController,
  collectAdvanceController,
  listAdvancesController,
  adjustAdvanceController,
  refundAdvanceController,
  getAlertConfigController,
  setAlertConfigController,
  checkAdvanceAlertController,
  acknowledgeAlertController,
  admissionInsuranceController,
  linkInsuranceController,
  dischargeDashboardController,
  dischargeReadinessController,
  updateReadinessController,
  buildFinalBillController,
  finaliseSettlementController,
  getSettlementController,
  initiateDischargeController,
  advanceStageController,
  buildSummaryController,
  signSummaryController,
  summaryPdfController,
  summaryPrintController,
} from '../controllers/ipd.billing.controller.js';

const router = Router();
router.use(authenticate);
router.use(idempotency);

const BILL = ['BILLING_VIEW', 'PAYMENT_VIEW', 'IPD_BILLING'];
const BILL_WRITE = ['BILLING_CREATE', 'PAYMENT_CREATE', 'IPD_BILLING'];
const DISCHARGE = ['IPD_DISCHARGE', 'IPD_DISCHARGE_BILLING'];
const DISCHARGE_WRITE = ['IPD_DISCHARGE', 'IPD_DISCHARGE_BILLING', 'IPD_ADMIT'];

// ===== 26. configurable charges + daily billing =====
router.get('/billing/charges', requirePermission(...BILL), listChargesController);
router.patch('/billing/charges/:serviceCode', requirePermission(...BILL_WRITE), validate([
  param('serviceCode').isIn(Object.values({
    ROOM_RENT: 'ROOM_RENT', NURSING: 'NURSING', DOCTOR_VISIT: 'DOCTOR_VISIT', PROCEDURE: 'PROCEDURE',
    LABORATORY: 'LABORATORY', RADIOLOGY: 'RADIOLOGY', PHARMACY: 'PHARMACY', CONSUMABLES: 'CONSUMABLES',
    OT: 'OT', IMPLANTS: 'IMPLANTS', PHYSIOTHERAPY: 'PHYSIOTHERAPY', DIET: 'DIET', BLOOD_BANK: 'BLOOD_BANK',
    OTHER_SERVICES: 'OTHER_SERVICES',
  })),
  body('rate').optional().isFloat({ min: 0 }),
  body('autoCapture').optional().isBoolean(),
]), updateChargeController);

router.get('/billing/daily-preview/:id', requirePermission(...BILL), validate([
  param('id').isMongoId(),
  query('date').optional().isISO8601(),
]), previewBillingController);

router.post('/billing/daily-run/:id', requirePermission(...BILL_WRITE), validate([
  param('id').isMongoId(),
  body('date').optional().isISO8601(),
]), runDailyBillingController);

router.post('/billing/daily-run', requirePermission(...BILL_WRITE), validate([
  body('date').optional().isISO8601(),
]), runDailyBillingAllController);

// ===== 27. advances =====
router.get('/billing/advances/:id', requirePermission(...BILL), validate([param('id').isMongoId()]), listAdvancesController);
router.post('/billing/advances/:id', requirePermission('ADVANCE_COLLECT', ...BILL_WRITE), validate([
  param('id').isMongoId(),
  body('amount').isFloat({ min: 0.01 }).withMessage('Advance amount required'),
  body('mode').isIn(['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'INSURANCE', 'SPONSOR', 'CREDIT', 'CHEQUE', 'WALLET']),
  body('advanceType').optional().isIn(['ADMISSION', 'ADDITIONAL', 'EMERGENCY', 'REFUNDABLE']),
]), collectAdvanceController);
router.post('/billing/advances/:id/adjust', requirePermission('ADVANCE_COLLECT', ...BILL_WRITE), validate([
  param('id').isMongoId(),
  body('billId').isMongoId().withMessage('Bill required'),
]), adjustAdvanceController);
router.post('/billing/advances/:id/:advanceId/refund', requirePermission('BILLING_REFUND', ...BILL_WRITE), validate([
  param('id').isMongoId(),
  param('advanceId').isMongoId(),
  body('amount').isFloat({ min: 0.01 }),
]), refundAdvanceController);

// ===== 28. advance alerts =====
router.get('/billing/alert-config', requirePermission(...BILL), getAlertConfigController);
router.patch('/billing/alert-config', requirePermission(...BILL_WRITE), validate([
  body('lowAdvance').optional().isFloat({ min: 0 }),
  body('criticalAdvance').optional().isFloat({ min: 0 }),
]), setAlertConfigController);
router.get('/billing/advance-alert/:id', requirePermission(...BILL), validate([param('id').isMongoId()]), checkAdvanceAlertController);
router.post('/billing/advance-alert/:id/acknowledge', requirePermission(...BILL_WRITE), validate([param('id').isMongoId()]), acknowledgeAlertController);

// ===== 29/30. insurance + sponsor =====
router.get('/billing/insurance/:id', requirePermission(...BILL), validate([param('id').isMongoId()]), admissionInsuranceController);
router.patch('/billing/insurance/:id', requirePermission('IPD_INSURANCE_LINK', ...BILL_WRITE), validate([
  param('id').isMongoId(),
  body('insurancePolicyId').optional().isMongoId(),
]), linkInsuranceController);

// ===== 31. discharge planning =====
router.get('/billing/discharge-dashboard', requirePermission(...BILL, 'IPD_VIEW'), validate([
  query('departmentId').optional().isMongoId(),
]), dischargeDashboardController);
router.get('/billing/discharge-readiness/:id', requirePermission(...BILL, 'IPD_VIEW'), validate([param('id').isMongoId()]), dischargeReadinessController);
router.patch('/billing/discharge-readiness/:id/:key', requirePermission(...DISCHARGE_WRITE, ...BILL_WRITE), validate([
  param('id').isMongoId(),
  param('key').isIn([
    'clinicalClearance', 'doctorClearance', 'nursingClearance', 'investigationsPending', 'pharmacyPending',
    'billingPending', 'insurancePending', 'documentsPending', 'followUpPlanned',
  ]),
  body('done').isBoolean(),
]), updateReadinessController);

// ===== 33/34. final bill + settlement =====
router.get('/billing/final/:id', requirePermission(...BILL), validate([param('id').isMongoId()]), getSettlementController);
router.post('/billing/final/:id/build', requirePermission(...BILL_WRITE), validate([param('id').isMongoId()]), buildFinalBillController);
router.post('/billing/final/:id/finalise', requirePermission(...BILL_WRITE), validate([param('id').isMongoId()]), finaliseSettlementController);

// ===== 34/35. discharge workflow =====
router.post('/billing/discharge/:id/initiate', requirePermission(...DISCHARGE), validate([
  param('id').isMongoId(),
  body('dischargeType').optional().isIn(['NORMAL', 'LAMA', 'DAMA', 'ABSCONDED', 'TRANSFERRED', 'DEATH', 'REFERRAL']),
]), initiateDischargeController);
router.post('/billing/discharge/:id/stage', requirePermission(...DISCHARGE), validate([
  param('id').isMongoId(),
  body('stage').isIn(['DISCHARGE_INITIATED', 'BILLING_PENDING', 'PAYMENT_PENDING', 'INSURANCE_PENDING', 'READY_FOR_DISCHARGE']),
]), advanceStageController);

// ===== 32. discharge summary =====
router.get('/billing/discharge-summary/:id', requirePermission(...BILL, 'IPD_VIEW'), validate([param('id').isMongoId()]), buildSummaryController);
router.post('/billing/discharge-summary/:id', requirePermission(...DISCHARGE), validate([param('id').isMongoId()]), buildSummaryController);
router.post('/billing/discharge-summary/:id/sign', requirePermission(...DISCHARGE), validate([
  param('id').isMongoId(),
  body('signedByName').notEmpty().withMessage('Signing doctor name required'),
]), signSummaryController);
router.get('/billing/discharge-summary/:id/pdf', requirePermission(...BILL, 'IPD_VIEW'), validate([param('id').isMongoId()]), summaryPdfController);
router.get('/billing/discharge-summary/:id/print', requirePermission(...BILL, 'IPD_VIEW'), validate([param('id').isMongoId()]), summaryPrintController);

export default router;
