import mongoose from 'mongoose';

export const REFUND_STATUS = {
  PROCESSED: 'PROCESSED',
  CANCELLED: 'CANCELLED',
};

const refundSchema = new mongoose.Schema(
  {
    refundNumber: { type: String, unique: true },
    billId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill' },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', index: true },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    reason: { type: String, required: true },
    originalPaymentMode: String,
    refundedVia: { type: String, enum: ['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'WALLET', 'CHEQUE'], default: 'CASH' },
    refundedAt: { type: Date, default: Date.now, index: true },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: Object.values(REFUND_STATUS), default: REFUND_STATUS.PROCESSED },
    notes: String,
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

export default mongoose.model('Refund', refundSchema);