import mongoose from 'mongoose';

export const PAYMENT_STATUS = {
  SUCCESS: 'SUCCESS',
  CANCELLED: 'CANCELLED',
  PENDING: 'PENDING',
};

const paymentSchema = new mongoose.Schema(
  {
    transactionId: { type: String, unique: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', index: true },
    billId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill', index: true },
    settlementId: { type: mongoose.Schema.Types.ObjectId, ref: 'IpdSettlement', index: true },
    // a dialysis payment has to be traceable to the sitting it settles, so a
    // session's takings can be reconciled without joining through the bill
    dialysisSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'DialysisSession', index: true },
    isFinalBillPayment: { type: Boolean, default: false },
    amount: { type: Number, required: true, min: 0 },
    mode: {
      type: String,
      enum: ['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'WALLET', 'CHEQUE', 'INSURANCE', 'CREDIT', 'SPONSOR'],
      required: true,
    },
    receiptNumber: String,
    referenceNumber: String,
    paidAt: { type: Date, default: Date.now, index: true },
    paymentType: { type: String, enum: ['BILL_PAYMENT', 'ADVANCE', 'DEPOSIT', 'PARTIAL'], default: 'BILL_PAYMENT' },
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: Object.values(PAYMENT_STATUS), default: PAYMENT_STATUS.SUCCESS },
    notes: String,
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

paymentSchema.index({ patientId: 1, paidAt: -1 });
paymentSchema.index({ mode: 1, paidAt: -1 });
paymentSchema.index({ receivedBy: 1, paidAt: -1 });
paymentSchema.index({ billId: 1, amount: 1, mode: 1, paidAt: 1 });
paymentSchema.index({ dialysisSessionId: 1, paidAt: -1 });

/**
 * A gateway reference is the proof the money moved, so the same one can only
 * ever fund one bill once. The service checks this first for a clear message,
 * but two clerks can pass that check at the same instant, so the database is
 * what actually makes it impossible. The partial filter keeps cash payments
 * (no reference) out of it, which is why they are not all colliding on null.
 */
paymentSchema.index(
  { billId: 1, referenceNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { referenceNumber: { $type: 'string' } },
    name: 'uniq_reference_per_bill',
  },
);

// historical payment records are append-only: never silently removed
paymentSchema.pre('deleteOne', { document: false, query: true }, function forbidDelete(next) {
  next(new Error('Payment records are permanent — raise a refund instead'));
});
paymentSchema.pre('deleteMany', { document: false, query: true }, function forbidDelete(next) {
  next(new Error('Payment records are permanent — raise a refund instead'));
});
paymentSchema.pre('findOneAndUpdate', { document: false, query: true }, function protectHistory(next) {
  const update = this.getUpdate() || {};
  const keys = Object.keys(update.$set || update);
  const forbidden = ['amount', 'mode', 'billId', 'paidAt', 'transactionId'];
  if (keys.some((k) => forbidden.includes(k))) {
    next(new Error('Payment history cannot be modified — create an adjustment or refund'));
    return;
  }
  next();
});

export default mongoose.model('Payment', paymentSchema);