import CashierShift, { CASHIER_SHIFT_STATUS } from '../models/CashierShift.model.js';
import Payment from '../models/Payment.model.js';
import Refund from '../models/Refund.model.js';
import { generateNumber, NUMBER_PREFIXES } from '../utils/numberGenerator.js';
import { BadRequestError, NotFoundError, ConflictError } from '../utils/ApiError.js';
import { round2 } from './billing.service.js';

const MODE_GROUPS = ['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'WALLET', 'CHEQUE', 'INSURANCE'];

const getShiftWindow = (shift) => ({
  $gte: shift.openedAt,
  $lte: shift.closedAt || new Date(),
});

export const getCurrentShift = async (actor) => {
  const shift = await CashierShift.findOne({ cashierId: actor.id, status: CASHIER_SHIFT_STATUS.OPEN }).sort({ openedAt: -1 });
  if (!shift) return null;
  return enrichShift(shift);
};

export const getShift = async (shiftId) => {
  const shift = await CashierShift.findById(shiftId);
  if (!shift) throw new NotFoundError('Cashier shift not found');
  return enrichShift(shift);
};

export const openShift = async ({ openingCash = 0, openingNote = '' }, actor) => {
  const existing = await CashierShift.findOne({ cashierId: actor.id, status: CASHIER_SHIFT_STATUS.OPEN });
  if (existing) throw new ConflictError(`Shift ${existing.shiftNumber} is already open`);

  const shiftNumber = await generateNumber(NUMBER_PREFIXES.CASHIER_SHIFT, new Date().getFullYear());

  const shift = await CashierShift.create({
    shiftNumber,
    cashierId: actor.id,
    openedBy: actor.id,
    openingCash: round2(openingCash || 0),
    openingNote: openingNote || undefined,
    hospitalId: actor.hospitalId,
    branchId: actor.branchId,
    status: CASHIER_SHIFT_STATUS.OPEN,
  });
  return enrichShift(shift);
};

export const closeShift = async (shiftId, { countedCash, closingNote = '' }, actor) => {
  const shift = await CashierShift.findById(shiftId);
  if (!shift) throw new NotFoundError('Cashier shift not found');
  if (shift.status !== CASHIER_SHIFT_STATUS.OPEN) throw new ConflictError('Shift is already closed');
  if (String(shift.cashierId) !== String(actor.id) && actor.roleCode !== 'SUPER_ADMIN') {
    throw new BadRequestError('Only the shift cashier may close it');
  }
  if (countedCash == null || countedCash < 0) throw new BadRequestError('Counted cash must be a non-negative number');

  const totals = await computeCloseTotals(shift);
  shift.countedCash = round2(countedCash);
  shift.expectedCash = round2(totals.expectedCash);
  shift.variance = round2(countedCash - totals.expectedCash);
  shift.paymentsTotal = round2(totals.paymentsTotal);
  shift.refundsTotal = round2(totals.refundsTotal);
  shift.transactions = totals.transactions;
  shift.closedAt = new Date();
  shift.closedBy = actor.id;
  shift.closingNote = closingNote || undefined;
  shift.status = CASHIER_SHIFT_STATUS.CLOSED;
  await shift.save();
  return enrichShift(shift);
};

const computeCloseTotals = async (shift) => {
  const window = getShiftWindow(shift);
  const cashierId = shift.cashierId;

  const [payments, refunds] = await Promise.all([
    Payment.find({ status: 'SUCCESS', receivedBy: cashierId, paidAt: window }),
    Refund.find({ status: 'PROCESSED', processedBy: cashierId, refundedAt: window }),
  ]);

  const byMode = {};
  for (const m of MODE_GROUPS) byMode[m] = 0;
  for (const p of payments) byMode[p.mode] = round2((byMode[p.mode] || 0) + p.amount);
  const paymentsTotal = round2(payments.reduce((s, p) => s + p.amount, 0));

  const refundByMode = {};
  for (const r of refunds) refundByMode[r.refundedVia] = round2((refundByMode[r.refundedVia] || 0) + r.amount);
  const refundsTotal = round2(refunds.reduce((s, r) => s + r.amount, 0));

  const cashCollected = (byMode.CASH || 0) - (refundByMode.CASH || 0);
  const expectedCash = round2(shift.openingCash + cashCollected);

  return { byMode, refundByMode, paymentsTotal, refundsTotal, expectedCash, cashCollected, transactions: payments.length + refunds.length };
};

export const enrichShift = async (shift) => {
  const doc = shift.toObject ? shift.toObject() : shift;
  const totals = shift.status === CASHIER_SHIFT_STATUS.CLOSED ? null : await computeCloseTotals(shift);
  const cashier = await (await import('../models/User.model.js')).default.findById(doc.cashierId).select('firstName lastName username');
  return {
    ...doc,
    cashier: cashier ? { _id: cashier._id, firstName: cashier.firstName, lastName: cashier.lastName, username: cashier.username } : null,
    live: totals,
  };
};

export const listShifts = async (query = {}) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.cashierId) filter.cashierId = query.cashierId;
  if (query.from || query.to) {
    filter.openedAt = {};
    if (query.from) filter.openedAt.$gte = new Date(query.from);
    if (query.to) filter.openedAt.$lte = new Date(query.to);
  }
  const [total, shifts] = await Promise.all([
    CashierShift.countDocuments(filter),
    CashierShift.find(filter).populate('cashierId', 'firstName lastName username').sort({ openedAt: -1 }).skip((page - 1) * limit).limit(limit),
  ]);
  return { data: shifts, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};