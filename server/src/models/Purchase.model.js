import mongoose from 'mongoose';

const purchaseItemSchema = new mongoose.Schema({
  medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
  name: String,
  batchNumber: String,
  manufacturingDate: Date,
  expiryDate: Date,
  quantity: { type: Number, required: true, min: 0 },
  purchaseRate: { type: Number, default: 0 },
  sellingRate: { type: Number, default: 0 },
  mrp: { type: Number, default: 0 },
  gstPct: { type: Number, default: 0 },
  discountPct: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
});

export const PURCHASE_STATUS = {
  DRAFT: 'DRAFT',
  RECEIVED: 'RECEIVED',
  PARTIAL: 'PARTIAL',
  CANCELLED: 'CANCELLED',
};

const purchaseSchema = new mongoose.Schema(
  {
    purchaseNumber: { type: String, unique: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
    items: [purchaseItemSchema],
    purchaseDate: { type: Date, default: Date.now },
    receivedAt: Date,
    grossTotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    otherCharges: { type: Number, default: 0 },
    netTotal: { type: Number, default: 0 },
    status: { type: String, enum: Object.values(PURCHASE_STATUS), default: PURCHASE_STATUS.DRAFT },
    paymentMode: { type: String, enum: ['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT'], default: 'CREDIT' },
    paidAmount: { type: Number, default: 0 },
    dueAmount: { type: Number, default: 0 },
    invoiceNumber: String,
    notes: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

purchaseSchema.index({ supplierId: 1, purchaseDate: -1 });
purchaseSchema.index({ status: 1, purchaseDate: -1 });

export default mongoose.model('Purchase', purchaseSchema);

const purchaseReturnItemSchema = new mongoose.Schema({
  medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine' },
  name: String,
  batchNumber: String,
  quantity: { type: Number, required: true },
  rate: Number,
  total: Number,
});

const purchaseReturnSchema = new mongoose.Schema(
  {
    returnNumber: { type: String, unique: true },
    purchaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase', required: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
    items: [purchaseReturnItemSchema],
    returnDate: { type: Date, default: Date.now },
    reason: String,
    total: { type: Number, default: 0 },
    status: { type: String, enum: ['PROCESSED', 'CANCELLED'], default: 'PROCESSED' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

export const PurchaseReturn = mongoose.model('PurchaseReturn', purchaseReturnSchema);