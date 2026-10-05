import { Router } from 'express';
import {
  createBillController,
  listBillsController,
  getBillController,
  createPaymentController,
  createRefundController,
  cancelBillController,
  listPaymentsController,
  collectionSummaryController,
  outstandingController,
} from '../controllers/billing.controller.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idempotency } from '../middleware/idempotency.js';
import { body, param } from 'express-validator';

const router = Router();
router.use(authenticate);
router.use(idempotency);

router.get('/collection/summary', requirePermission('BILLING_VIEW', 'FINANCE_VIEW'), collectionSummaryController);
router.get('/outstanding', requirePermission('BILLING_VIEW', 'FINANCE_VIEW'), outstandingController);

router.get('/', requirePermission('BILLING_VIEW'), listBillsController);
router.post('/', requirePermission('BILLING_CREATE'), validate([
  body('patientId').isMongoId().withMessage('Valid patient required'),
  body('billType').isIn(['OPD', 'IPD', 'PHARMACY', 'LAB', 'RADIOLOGY', 'OT', 'PACKAGE', 'PROCEDURE', 'ROOM_CHARGE', 'CONSULTATION', 'NURSING', 'MISCELLANEOUS']).withMessage('Valid bill type required'),
  body('items').isArray({ min: 1 }).withMessage('Bill items required'),
  body('payment.mode').optional().isIn(['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'WALLET', 'CHEQUE', 'INSURANCE', 'CREDIT', 'SPONSOR']),
]), createBillController);
router.get('/:id', requirePermission('BILLING_VIEW'), validate([param('id').isMongoId()]), getBillController);
  router.patch('/:id/cancel', requirePermission('BILLING_CREATE', 'BILLING_REFUND'), validate([
    param('id').isMongoId(),
    body('reason').optional().trim(),
  ]), cancelBillController);

router.get('/payments/list', requirePermission('PAYMENT_VIEW', 'BILLING_VIEW'), listPaymentsController);
router.post('/payments', requirePermission('PAYMENT_CREATE'), validate([
  body('billId').isMongoId().withMessage('Valid bill required'),
  body('amount').isFloat({ gt: 0 }).withMessage('Valid amount required'),
  body('mode').isIn(['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'WALLET', 'CHEQUE', 'INSURANCE', 'CREDIT', 'SPONSOR']),
]), createPaymentController);
router.post('/refunds', requirePermission('BILLING_REFUND'), validate([
  body('billId').isMongoId(),
  body('paymentId').optional().isMongoId(),
  body('amount').isFloat({ gt: 0 }),
  body('reason').trim().notEmpty(),
  body('refundedVia').optional().isIn(['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'WALLET', 'CHEQUE']),
]), createRefundController);

export default router;