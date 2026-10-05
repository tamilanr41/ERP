import mongoose from 'mongoose';

export const CASHIER_SHIFT_STATUS = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
};

const cashierShiftSchema = new mongoose.Schema(
  {
    shiftNumber: { type: String, unique: true },
    cashierId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    openedAt: { type: Date, default: Date.now },
    closedAt: Date,
    openedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    openingCash: { type: Number, default: 0 },
    countedCash: { type: Number, default: 0 },
    expectedCash: { type: Number, default: 0 },
    variance: { type: Number, default: 0 },
    paymentsTotal: { type: Number, default: 0 },
    refundsTotal: { type: Number, default: 0 },
    transactions: { type: Number, default: 0 },
    status: { type: String, enum: Object.values(CASHIER_SHIFT_STATUS), default: CASHIER_SHIFT_STATUS.OPEN, index: true },
    openingNote: String,
    closingNote: String,
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

cashierShiftSchema.index({ cashierId: 1, status: 1, openedAt: -1 });
cashierShiftSchema.index({ status: 1, openedAt: -1 });

export default mongoose.model('CashierShift', cashierShiftSchema);