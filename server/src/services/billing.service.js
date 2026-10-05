import mongoose from 'mongoose';
import Bill, { BILL_STATUS } from '../models/Bill.model.js';
import Payment from '../models/Payment.model.js';
import Refund from '../models/Refund.model.js';
import IpdSettlement from '../models/IpdSettlement.model.js';
import IpdAdmission from '../models/IpdAdmission.model.js';
import { LedgerEntry } from '../models/Finance.model.js';
import { generateNumber, NUMBER_PREFIXES } from '../utils/numberGenerator.js';
import { BadRequestError, NotFoundError, ConflictError } from '../utils/ApiError.js';
import { writeAudit } from '../middleware/audit.js';
import { regex } from '../utils/helpers.js';

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export const computeBillTotals = (items, extraDiscount = 0) => {
  let grossTotal = 0;
  let tax = 0;
  let totalDiscount = 0;

  const normalized = items.map((item) => {
    const qty = item.quantity || 1;
    const rate = item.rate || 0;
    const lineGross = qty * rate;
    const discountPct = item.discountPct || 0;
    const discountAmount = round2((lineGross * discountPct) / 100) + (item.discountAmount || 0);
    const taxable = lineGross - discountAmount;
    const gstAmount = round2((taxable * (item.gstPct || 0)) / 100);
    const total = round2(taxable + gstAmount);
    grossTotal += lineGross;
    totalDiscount += discountAmount;
    tax += gstAmount;
    return { ...item, quantity: qty, rate, discountAmount, gstAmount, total };
  });

  const finalDiscount = Math.min(extraDiscount || 0, Math.max(grossTotal - totalDiscount, 0));
  const discount = round2(totalDiscount + finalDiscount);
  const netTotal = round2(Math.max(grossTotal - discount + tax, 0));

  return { items: normalized, grossTotal: round2(grossTotal), discount, tax: round2(tax), netTotal };
};

/**
 * Core billing service: create/finalize bill with payment + ledger, transactionalially safe.
 */
export const createBillingService = async (payload, actor, session = null) => {
  const { patientId, billType, items, payment = null, admissionId, opdVisitId, doctorId, departmentId, billNumber = null, extraDiscount = 0, dialysisSessionId = null, appointmentId = null } = payload;

  const totals = computeBillTotals(items, extraDiscount);
  const nextNumber = billNumber || await generateNumber(NUMBER_PREFIXES.BILL, new Date().getFullYear(), session);

  const bill = await Bill.create([{
    billNumber: nextNumber,
    patientId,
    patientName: payload.patientName,
    patientUHID: payload.patientUHID,
    admissionId,
    opdVisitId,
    dialysisSessionId,
    appointmentId,
    doctorId,
    departmentId,
    billType,
    billDate: new Date(),
    items: totals.items,
    grossTotal: totals.grossTotal,
    discount: totals.discount,
    tax: totals.tax,
    netTotal: totals.netTotal,
paidAmount: 0,
    dueAmount: totals.netTotal,
    status: payload.status || BILL_STATUS.FINAL,
    createdBy: actor?.id,
    hospitalId: actor?.hospitalId,
    branchId: actor?.branchId,
  }], { session, ordered: true });

  if (payment) {
    if (!Number.isFinite(Number(payment.amount)) || payment.amount <= 0) {
      throw new BadRequestError('Embedded payment amount must be a positive number');
    }
    const { bill: settled } = await recordPaymentOnBill(bill[0], payment, actor, session);
    return settled;
  }
  return bill[0];
};

export const recordPaymentOnBill = async (bill, paymentData, actor, session = null) => {
  const amount = round2(paymentData.amount || 0);
  const allowOverpay = Boolean(paymentData.allowOverpay);
  if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestError('Payment amount must be a positive number');
  if (amount > bill.dueAmount + 0.01 && !allowOverpay) {
    throw new ConflictError(`Payment amount exceeds due amount of ${bill.dueAmount}`);
  }

  // Section 50: a payment on an IPD admission must resolve to the settlement
  // that owns the bill, so the receipt can always be traced to the final bill.
  let settlementId = null;
  let isFinalBillPayment = Boolean(bill.isFinalBill);
  if (bill.admissionId) {
    const settlement = await IpdSettlement.findOne({ admissionId: bill.admissionId })
      .select('_id finalBillId status netTotal dueAmount');
    if (settlement) {
      settlementId = settlement._id;
      const admission = await IpdAdmission.findById(bill.admissionId).select('status admissionNumber');
      const discharged = admission && admission.status === 'DISCHARGED';
      if (discharged && settlement.finalBillId && String(settlement.finalBillId) !== String(bill._id)) {
        throw new BadRequestError(
          `Admission ${admission.admissionNumber} is discharged — payment must be received against the final bill only`,
        );
      }
    }
  }

  // A UPI or bank reference is the gateway's own proof the money moved. The
  // same reference arriving twice is a double capture, whether it is a retried
  // request or a genuine second submit, so it is refused before a transaction
  // or receipt number is issued rather than quietly becoming two payments.
  const reference = paymentData.referenceNumber ? String(paymentData.referenceNumber).trim() : null;
  if (reference) {
    const duplicate = await Payment.findOne({ billId: bill._id, referenceNumber: reference }).select('transactionId receiptNumber amount paidAt mode');
    if (duplicate) {
      throw new ConflictError(`Payment reference ${reference} is already recorded against this bill`, {
        code: 'DUPLICATE_PAYMENT',
        existing: {
          transactionId: duplicate.transactionId,
          receiptNumber: duplicate.receiptNumber,
          amount: duplicate.amount,
          mode: duplicate.mode,
          paidAt: duplicate.paidAt,
        },
      });
    }
  }

  const transactionId = await generateNumber(NUMBER_PREFIXES.PAYMENT, new Date().getFullYear(), session);
  const receiptNumber = await generateNumber(NUMBER_PREFIXES.RECEIPT, new Date().getFullYear(), session);

  let created;
  try {
    [created] = await Payment.create([{
      transactionId,
      receiptNumber,
      patientId: bill.patientId,
      billId: bill._id,
      dialysisSessionId: paymentData.dialysisSessionId,
      settlementId,
      isFinalBillPayment,
      amount,
      mode: paymentData.mode,
      referenceNumber: reference,
      paidAt: new Date(),
      paymentType: paymentData.amount >= bill.dueAmount - 0.01 ? 'BILL_PAYMENT' : 'PARTIAL',
      receivedBy: actor?.id,
      notes: paymentData.notes,
      hospitalId: actor?.hospitalId,
      branchId: actor?.branchId,
    }], { session, ordered: true });
  } catch (err) {
    // Two clerks submitted the same reference at the same instant. Both passed
    // the lookup above, so the unique index is what catches it — losing that
    // race is a double capture, not a server fault.
    if (reference && (err?.code === 11000 || err?.code === 11001)) {
      throw new ConflictError(`Payment reference ${reference} is already recorded against this bill`, {
        code: 'DUPLICATE_PAYMENT',
      });
    }
    throw err;
  }
  const payment = [created];

  // Crediting the bill is a read-modify-write, and a billing desk takes
  // payments at the same time. Loading paidAmount, adding to it in JavaScript
  // and saving loses every update but the last, so a patient who paid twice in
  // parallel ends up recorded as having paid once. The increment and the
  // remaining due are therefore derived by the database in one atomic step, and
  // the guard that rejects an overpayment is part of that same filter — so two
  // clerks cannot both slip past it either.
  // The two stages are ordered on purpose. The first stores the new paid total,
  // and the second derives what is still owed from that stored value — adding
  // the amount a second time here would quietly understate the bill.
  const credited = await Bill.findOneAndUpdate(
    {
      _id: bill._id,
      status: { $ne: BILL_STATUS.CANCELLED },
      ...(allowOverpay ? {} : { dueAmount: { $gte: amount } }),
    },
    [
      { $set: { paidAmount: { $add: [{ $ifNull: ['$paidAmount', 0] }, amount] } } },
      {
        $set: {
          dueAmount: { $max: [{ $subtract: [{ $ifNull: ['$netTotal', 0] }, { $ifNull: ['$paidAmount', 0] }] }, 0] },
          status: {
            $cond: [
              { $lte: [{ $max: [{ $subtract: [{ $ifNull: ['$netTotal', 0] }, { $ifNull: ['$paidAmount', 0] }] }, 0] }, 0.01] },
              BILL_STATUS.PAID,
              BILL_STATUS.PARTIALLY_PAID,
            ],
          },
        },
      },
    ],
    { new: true, session },
  );

  if (!credited) {
    // The payment is the durable record that money arrived, so it is never
    // dropped — if the bill will not take it, the payment is withdrawn again
    // rather than left behind as money the ledger has forgotten.
    await Payment.deleteOne({ _id: payment[0]._id }, { session });
    const current = await Bill.findById(bill._id).select('dueAmount status').lean();
    if (!current) throw new NotFoundError('Bill not found');
    if (current.status === BILL_STATUS.CANCELLED) throw new BadRequestError('Cannot pay a cancelled bill');
    throw new ConflictError(`Payment amount exceeds due amount of ${current.dueAmount}`);
  }
  bill = credited;

  // Ledger entries: debit receivable reduce + credit cash
  await LedgerEntry.create([
    {
      referenceType: 'PAYMENT',
      referenceId: payment[0]._id,
      entryType: 'CREDIT',
      account: 'RECEIVABLES',
      amount,
      description: `Payment ${transactionId} for ${bill.billNumber}`,
      enteredBy: actor?.id,
      hospitalId: actor?.hospitalId,
    },
    {
      referenceType: 'PAYMENT',
      referenceId: payment[0]._id,
      entryType: 'DEBIT',
      account: paymentData.mode === 'CARD' ? 'BANK' : 'CASH',
      amount,
      description: `Payment received ${transactionId}`,
      enteredBy: actor?.id,
      hospitalId: actor?.hospitalId,
    },
  ], { session, ordered: true });

  return { bill, payment: payment[0] };
};

export const createPaymentService = async (payload, actor, session = null) => {
  const bill = await Bill.findById(payload.billId).session(session);
  if (!bill) throw new NotFoundError('Bill not found');
  if (bill.status === BILL_STATUS.CANCELLED) throw new BadRequestError('Cannot pay a cancelled bill');
  const { bill: settled } = await recordPaymentOnBill(bill, payload, actor, session);

  // A consultation bill is settled through this generic payments route, so the
  // appointment's own paymentStatus is refreshed here. Left stale, the
  // consultation would keep reading UNPAID after the money arrived and the
  // pre-consultation payment gate would stay closed on a fully paid visit.
  if (settled?.appointmentId) {
    const { syncAppointmentPaymentState } = await import('./telemedicine.service.js');
    await syncAppointmentPaymentState(settled._id, { session });
  }

  return settled;
};

export const cancelBillService = async (billId, payload = {}, actor, session = null) => {
  const bill = await Bill.findById(billId).session(session);
  if (!bill) throw new NotFoundError('Bill not found');
  if (bill.status === BILL_STATUS.CANCELLED) throw new BadRequestError('Bill is already cancelled');
  if ((bill.paidAmount || 0) > 0.01 && bill.status !== BILL_STATUS.REFUNDED) {
    throw new BadRequestError('Cannot cancel a bill with collected payments. Refund payments first.');
  }
  bill.status = BILL_STATUS.CANCELLED;
  bill.cancelledReason = payload.reason;
  bill.cancelledBy = actor?.id;
  bill.cancelledAt = new Date();
  await bill.save({ session });

  // A cancelled bill must stop holding the dialysis sitting hostage. The session
  // kept a billId pointing at a dead bill forever, so the charges could never be
  // raised again and the money screen kept showing a stale total.
  if (bill.dialysisSessionId) {
    const { default: DialysisSession } = await import('../models/DialysisSession.model.js');
    const sitting = await DialysisSession.findOneAndUpdate(
      { _id: bill.dialysisSessionId, billId: bill._id },
      { $set: { billId: null, totalAmount: 0, paidAmount: 0, paymentStatus: 'UNBILLED' } },
      { session, new: true },
    );
    if (sitting) {
      await writeAudit({
        user: actor, action: 'DIALYSIS_BILL_CANCELLED', module: 'dialysis', entityId: sitting._id, entityType: 'DialysisSession',
        data: { sessionNumber: sitting.sessionNumber, billId: bill._id, billNumber: bill.billNumber, reason: payload.reason || null },
      });
    }
  }

  // A cancelled consultation bill must stop pointing at a dead bill too, or the
  // appointment keeps a billId nothing can be charged against and the unique
  // uniq_appointment_bill index refuses to let it be re-billed.
  if (bill.appointmentId) {
    const { default: Appointment } = await import('../models/Appointment.model.js');
    const freed = await Appointment.findOneAndUpdate(
      { _id: bill.appointmentId, billId: bill._id },
      { $set: { billId: null, paymentStatus: 'UNBILLED', paidAmount: 0 } },
      { session, new: true },
    );
    if (freed) {
      await writeAudit({
        user: actor, action: 'APPOINTMENT_BILL_CANCELLED', module: 'telemedicine', entityId: freed._id, entityType: 'Appointment',
        data: { appointmentNumber: freed.appointmentNumber, billId: bill._id, billNumber: bill.billNumber, reason: payload.reason || null },
      });
    }
  }

  return bill;
};

export const createRefundService = async (payload, actor, session = null) => {
  const { billId, amount, reason, refundNumber = null, paymentId = null } = payload;
  const bill = await Bill.findById(billId).session(session);
  if (!bill) throw new NotFoundError('Bill not found');
  if (!Number.isFinite(Number(amount)) || amount <= 0) throw new BadRequestError('Refund amount must be a positive number');
  if (!reason || !String(reason).trim()) throw new BadRequestError('Refund reason is required');
  if (amount > (bill.paidAmount || 0) + 0.01) throw new BadRequestError(`Cannot refund more than paid amount ${bill.paidAmount}`);

  // Section 50: the original payment must stay traceable. A refund is always
  // tied to a specific payment, and the cumulative refunded against that
  // payment can never exceed what was received on it.
  if (!paymentId) throw new BadRequestError('paymentId is required — a refund must reference the original payment');

  const payment = await Payment.findOne({ _id: paymentId, billId: bill._id }).session(session);
  if (!payment) throw new BadRequestError('Payment not found on this bill');

  const alreadyRefunded = await Refund.aggregate([
    { $match: { paymentId: payment._id, status: { $ne: 'CANCELLED' } } },
    { $group: { _id: '$paymentId', total: { $sum: '$amount' } } },
  ]);
  const refundedSoFar = round2(alreadyRefunded[0]?.total || 0);
  const refundableFromPayment = round2(payment.amount - refundedSoFar);
  if (amount > refundableFromPayment + 0.01) {
    throw new ConflictError(
      `Refund exceeds the unrefunded balance of payment ${payment.receiptNumber || payment.transactionId} (₹${refundableFromPayment} available)`,
    );
  }

  const originalPaymentMode = payment.mode;
  const refundPaymentId = payment._id;

  const nextNumber = refundNumber || await generateNumber(NUMBER_PREFIXES.REFUND, new Date().getFullYear(), session);

  const refund = await Refund.create([{
    refundNumber: nextNumber,
    billId,
    patientId: bill.patientId,
    paymentId: refundPaymentId,
    amount,
    reason,
    originalPaymentMode,
    refundedVia: payload.refundedVia || 'CASH',
    refundedAt: new Date(),
    processedBy: actor?.id,
    approvedBy: payload.approvedBy || actor?.id,
    notes: payload.notes,
    hospitalId: actor?.hospitalId,
    branchId: actor?.branchId,
    status: 'PROCESSED',
  }], { session, ordered: true });

  bill.paidAmount = round2(Math.max((bill.paidAmount || 0) - amount, 0));
  bill.dueAmount = round2(bill.netTotal - bill.paidAmount);
  if (bill.paidAmount <= 0.01) bill.status = BILL_STATUS.REFUNDED;
  else if (bill.dueAmount > 0) bill.status = BILL_STATUS.PARTIALLY_PAID;
  else bill.status = BILL_STATUS.PAID;
  await bill.save({ session });

  await LedgerEntry.create([
    {
      referenceType: 'REFUND',
      referenceId: refund[0]._id,
      entryType: 'DEBIT',
      account: 'CASH',
      amount,
      description: `Refund ${nextNumber}`,
      enteredBy: actor?.id,
      hospitalId: actor?.hospitalId,
    },
    {
      referenceType: 'REFUND',
      referenceId: refund[0]._id,
      entryType: 'CREDIT',
      account: 'RECEIVABLES',
      amount,
      description: `Refund ${nextNumber}`,
      enteredBy: actor?.id,
      hospitalId: actor?.hospitalId,
    },
  ], { session, ordered: true });

  return refund[0];
};

export const listBills = async (query = {}) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const filter = {};
if (query.patientId) filter.patientId = query.patientId;
  if (query.admissionId) filter.admissionId = query.admissionId;
  if (query.billType) filter.billType = query.billType;
  if (query.status) filter.status = query.status;
  if (query.isFinalBill === 'true') filter.isFinalBill = true;
  if (query.isFinalBill === 'false') filter.isFinalBill = false;
  if (query.opdVisitId) filter.opdVisitId = query.opdVisitId;
if (query.appointmentId) filter.appointmentId = query.appointmentId;
  if (query.search) {
    const r = regex(query.search);
    filter.$or = [{ billNumber: r }, { patientName: r }, { patientUHID: r }];
  }
  if (query.from || query.to) {
    filter.billDate = {};
    if (query.from) filter.billDate.$gte = new Date(query.from);
    if (query.to) filter.billDate.$lte = new Date(query.to);
  }

  const [total, bills] = await Promise.all([
    Bill.countDocuments(filter),
    Bill.find(filter)
      .populate('patientId', 'uhid firstName lastName mobile')
      .populate('createdBy', 'firstName lastName')
      .sort({ billDate: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
  ]);
  return { data: bills, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

export const getBill = async (id) => {
const bill = await Bill.findById(id)
    .populate('patientId', 'uhid firstName lastName mobile gender address dateOfBirth')
    .populate('admissionId', 'admissionNumber')
    .populate('opdVisitId', 'opdNumber visitType doctorId departmentId')
    .populate('doctorId', 'name specialization doctorCode')
    .populate('departmentId', 'name')
    .populate('createdBy', 'firstName lastName');
  if (!bill) throw new NotFoundError('Bill not found');
  const payments = await Payment.find({ billId: bill._id }).sort({ paidAt: -1 });
  return { ...bill.toObject(), payments };
};

export const listPayments = async (query = {}) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const filter = {};
  if (query.patientId) filter.patientId = query.patientId;
  if (query.billId) filter.billId = query.billId;
  if (query.settlementId) filter.settlementId = query.settlementId;
  if (query.mode) filter.mode = query.mode;
  if (query.receivedBy) filter.receivedBy = query.receivedBy;
  if (query.from || query.to) {
    filter.paidAt = {};
    if (query.from) filter.paidAt.$gte = new Date(query.from);
    if (query.to) filter.paidAt.$lte = new Date(query.to);
  }
  const [total, payments] = await Promise.all([
    Payment.countDocuments(filter),
    Payment.find(filter).populate('patientId', 'uhid firstName lastName').populate('receivedBy', 'firstName lastName').populate('billId', 'billNumber')
      .sort({ paidAt: -1 }).skip((page - 1) * limit).limit(limit),
  ]);
  return { data: payments, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

/**
 * Daily collection summary (server-side aggregation, never from frontend state)
 */
export const collectionSummary = async ({ from, to } = {}) => {
  const start = from ? new Date(from) : new Date(new Date().setHours(0, 0, 0, 0));
  const end = to ? new Date(new Date(to).setHours(23, 59, 59, 999)) : new Date(new Date().setHours(23, 59, 59, 999));
  const match = { paidAt: { $gte: start, $lte: end }, status: 'SUCCESS' };

  const [byMode, byUser, totals] = await Promise.all([
    Payment.aggregate([{ $match: match }, { $group: { _id: '$mode', total: { $sum: '$amount' }, count: { $sum: 1 } } }, { $sort: { total: -1 } }]),
    Payment.aggregate([
      { $match: match },
      { $lookup: { from: 'users', localField: 'receivedBy', foreignField: '_id', as: 'u' } },
      { $unwind: { path: '$u', preserveNullAndEmptyArrays: true } },
      { $group: { _id: '$receivedBy', name: { $first: { $concat: ['$u.firstName', ' ', { $ifNull: ['$u.lastName', ''] }] } }, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]),
    Payment.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
  ]);

  return {
    from: start,
    to: end,
    total: totals[0]?.total || 0,
    transactions: totals[0]?.count || 0,
    byMode,
    byUser,
  };
};

export const outstandingReport = async () => {
  const bills = await Bill.aggregate([
    { $match: { status: { $in: ['FINAL', 'PENDING', 'PARTIALLY_PAID'] }, dueAmount: { $gt: 0 } } },
    { $lookup: { from: 'patients', localField: 'patientId', foreignField: '_id', as: 'p' } },
    { $unwind: { path: '$p', preserveNullAndEmptyArrays: true } },
    { $project: { billNumber: 1, billDate: 1, billType: 1, netTotal: 1, paidAmount: 1, dueAmount: 1, 'p.uhid': 1, 'p.firstName': 1, 'p.lastName': 1, 'p.mobile': 1 } },
    { $sort: { dueAmount: -1 } },
  ]);
  const totalOutstanding = bills.reduce((s, b) => s + b.dueAmount, 0);
  return { totalOutstanding, count: bills.length, bills };
};
