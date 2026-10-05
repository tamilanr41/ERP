import mongoose from 'mongoose';

export const EXPENSE_CATEGORIES = [
  'SALARY',
  'UTILITIES',
  'MAINTENANCE',
  'MEDICAL_SUPPLIES',
  'ADMINISTRATIVE',
  'EQUIPMENT',
  'RENT',
  'MARKETING',
  'INSURANCE',
  'TAX',
  'OTHER',
];

const ledgerSchema = new mongoose.Schema({
  referenceType: {
    type: String,
    enum: ['BILL', 'PAYMENT', 'REFUND', 'EXPENSE', 'PURCHASE', 'PHARMACY_SALE', 'ADVANCE'],
    index: true,
  },
  referenceId: mongoose.Schema.Types.ObjectId,
  entryType: { type: String, enum: ['DEBIT', 'CREDIT'], required: true },
  account: { type: String, required: true }, // e.g. CASH, BANK, RECEIVABLES, REVENUE, EXPENSE
  amount: { type: Number, required: true },
  description: String,
  enteredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  entryDate: { type: Date, default: Date.now, index: true },
  hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
});

const expenseSchema = new mongoose.Schema(
  {
    expenseNumber: { type: String, unique: true },
    category: { type: String, enum: EXPENSE_CATEGORIES, required: true },
    payee: String,
    amount: { type: Number, required: true, min: 0 },
    description: String,
    expenseDate: { type: Date, default: Date.now, index: true },
    paymentMode: { type: String, enum: ['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'WALLET', 'CHEQUE'], default: 'CASH' },
    referenceNumber: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

ledgerSchema.index({ referenceType: 1, referenceId: 1 });

export const LedgerEntry = mongoose.model('LedgerEntry', ledgerSchema);
export default mongoose.model('Expense', expenseSchema);