import { success, created } from '../utils/apiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { writeAudit } from '../middleware/audit.js';
import {
  createBillingService,
  createPaymentService,
  createRefundService,
  cancelBillService,
  listBills,
  getBill,
  listPayments,
  collectionSummary,
  outstandingReport,
} from '../services/billing.service.js';

export const createBillController = asyncHandler(async (req, res) => {
  const bill = await createBillingService(req.body, req.user);
  await writeAudit({ user: req.user, action: 'BILLING_CREATE', module: 'billing', entityId: bill._id, entityType: 'Bill', req });
  created(res, bill, `Bill created: ${bill.billNumber}`);
});

export const listBillsController = asyncHandler(async (req, res) => {
  const result = await listBills(req.query);
  success(res, result.data, 'Bills fetched', result.pagination);
});

export const getBillController = asyncHandler(async (req, res) => {
  success(res, await getBill(req.params.id), 'Bill fetched');
});

export const createPaymentController = asyncHandler(async (req, res) => {
  const bill = await createPaymentService(req.body, req.user);
  const Payment = (await import('../models/Payment.model.js')).default;
  const payment = await Payment.findOne({ billId: bill._id }).sort({ paidAt: -1 });
  await writeAudit({ user: req.user, action: 'PAYMENT_CREATE', module: 'billing', entityId: payment?.transactionId, entityType: 'Payment', data: { amount: req.body.amount, mode: req.body.mode }, req });
  success(res, bill, 'Payment recorded');
});

export const createRefundController = asyncHandler(async (req, res) => {
  const refund = await createRefundService(req.body, req.user);
  const bill = await getBill(req.body.billId);
  await writeAudit({ user: req.user, action: 'BILLING_REFUND', module: 'billing', entityId: refund._id, entityType: 'Refund', data: { amount: req.body.amount, paymentId: req.body.paymentId }, req });
  created(res, { refund, bill }, 'Refund processed');
});

export const cancelBillController = asyncHandler(async (req, res) => {
  const bill = await cancelBillService(req.params.id, req.body, req.user);
  await writeAudit({ user: req.user, action: 'BILLING_CANCEL', module: 'billing', entityId: bill._id, entityType: 'Bill', data: { reason: req.body.reason }, req });
  success(res, bill, 'Bill cancelled');
});

export const listPaymentsController = asyncHandler(async (req, res) => {
  const result = await listPayments(req.query);
  success(res, result.data, 'Payments fetched', result.pagination);
});

export const collectionSummaryController = asyncHandler(async (req, res) => {
  success(res, await collectionSummary(req.query), 'Collection summary');
});

export const outstandingController = asyncHandler(async (req, res) => {
  success(res, await outstandingReport(), 'Outstanding report');
});