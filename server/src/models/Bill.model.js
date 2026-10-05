import mongoose from 'mongoose';

export const BILL_STATUS = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  FINAL: 'FINAL',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  OVERPAID: 'OVERPAID',
  REFUNDED: 'REFUNDED',
  CANCELLED: 'CANCELLED',
  SUPERSEDED: 'SUPERSEDED',
};

export const BILL_TYPES = [
  'OPD',
  'IPD',
  'PHARMACY',
  'LAB',
  'RADIOLOGY',
  'OT',
  'PACKAGE',
  'PROCEDURE',
  'ROOM_CHARGE',
  'CONSULTATION',
  'NURSING',
  'MISCELLANEOUS',
  'DIALYSIS',
];

export const PAYMENT_MODES = ['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'WALLET', 'CHEQUE', 'INSURANCE', 'CREDIT', 'SPONSOR'];

const billItemSchema = new mongoose.Schema({
  itemType: {
    type: String,
    enum: ['SERVICE', 'TEST', 'MEDICINE', 'OT', 'PACKAGE', 'ROOM', 'CONSULTATION', 'PROCEDURE', 'MISCELLANEOUS', 'NURSING', 'CONSUMABLE', 'DIALYSIS'],
    default: 'SERVICE',
  },
  name: { type: String, required: true },
  description: String,
  code: String,
  serviceDate: Date,                                  // date the service was delivered (daily IPD charge lines)
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  departmentName: String,
    serviceCategory: String,                            // ROOM_RENT | NURSING | LAB | ... (IPD charge code)
    serviceChargeId: { type: mongoose.Schema.Types.ObjectId, ref: 'IpdServiceCharge' },
  quantity: { type: Number, default: 1, min: 0 },
  rate: { type: Number, default: 0 },
  discountPct: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  gstPct: { type: Number, default: 0 },
  gstAmount: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  referenceId: mongoose.Schema.Types.ObjectId, // e.g. labOrder item, pharmacy sale item
  referenceType: String,
});

const billSchema = new mongoose.Schema(
  {
    billNumber: { type: String, unique: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    patientName: String,
    patientUHID: String,
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IpdAdmission' },
    opdVisitId: { type: mongoose.Schema.Types.ObjectId, ref: 'OpdVisit' },
    // a dialysis bill has to name the sitting it charges for, otherwise the money
    // cannot be traced back to the treatment that earned it
    dialysisSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'DialysisSession', index: true },
    // a teleconsultation bill has to name the appointment that earned it, the
    // same way a dialysis bill names its sitting
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', index: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    billType: { type: String, enum: BILL_TYPES, required: true, index: true },
    isFinalBill: { type: Boolean, default: false },   // consolidated IPD final bill (one per admission)
  supersededBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill' }, // final bill that replaced this one
    billDate: { type: Date, default: Date.now, index: true },
    items: [billItemSchema],
    grossTotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    netTotal: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0 },
    dueAmount: { type: Number, default: 0 }, // computed
    status: { type: String, enum: Object.values(BILL_STATUS), default: BILL_STATUS.DRAFT, index: true },
    paymentMode: { type: String, enum: PAYMENT_MODES },
    insuranceClaimId: { type: mongoose.Schema.Types.ObjectId, ref: 'InsuranceClaim' },
    insurerShare: { type: Number, default: 0 },
    cancelledReason: String,
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    cancelledAt: Date,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

billSchema.index({ patientId: 1, billDate: -1 });
billSchema.index({ status: 1, billDate: -1 });
billSchema.index({ billType: 1, billDate: 1 });
billSchema.index({ admissionId: 1, billDate: -1 });
billSchema.index({ isFinalBill: 1, admissionId: 1 });

// One living bill per dialysis sitting. The partial filter deliberately excludes
// CANCELLED, SUPERSEDED and REFUNDED so that cancelling a bill frees the sitting
// to be re-billed — a cancelled bill is history, not a duplicate.
billSchema.index(
  { dialysisSessionId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      dialysisSessionId: { $type: 'objectId' },
      status: { $in: [BILL_STATUS.DRAFT, BILL_STATUS.PENDING, BILL_STATUS.FINAL, BILL_STATUS.PARTIALLY_PAID, BILL_STATUS.PAID, BILL_STATUS.OVERPAID] },
    },
    name: 'uniq_dialysis_bill_per_session',
  },
);

// One living consultation bill per appointment. Without this, a double click on
// "generate bill" raises two bills for a single teleconsultation and the patient
// is charged twice. Excludes CANCELLED/SUPERSEDED/REFUNDED so a cancelled bill
// frees the appointment to be re-billed.
billSchema.index(
  { appointmentId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      appointmentId: { $type: 'objectId' },
      status: { $in: [BILL_STATUS.DRAFT, BILL_STATUS.PENDING, BILL_STATUS.FINAL, BILL_STATUS.PARTIALLY_PAID, BILL_STATUS.PAID, BILL_STATUS.OVERPAID] },
    },
    name: 'uniq_appointment_bill',
  },
);

// financial history: a bill is cancelled (status change) — never deleted
billSchema.pre('deleteOne', { document: false, query: true }, function forbidDelete(next) {
  next(new Error('Bills cannot be deleted — cancel the bill instead'));
});
billSchema.pre('deleteMany', { document: false, query: true }, function forbidDelete(next) {
  next(new Error('Bills cannot be deleted — cancel the bill instead'));
});

export default mongoose.model('Bill', billSchema);