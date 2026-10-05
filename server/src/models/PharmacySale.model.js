import mongoose from 'mongoose';

export const SALE_STATUS = {
  COMPLETED: 'COMPLETED',
  RETURNED: 'RETURNED',
  CANCELLED: 'CANCELLED',
};

export const SALE_TYPES = ['OTC', 'PRESCRIPTION', 'IPD_ISSUE'];

const pharmacySaleItemSchema = new mongoose.Schema({
  medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
  name: { type: String, required: true },
  batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicineBatch', required: true },
  batchNumber: String,
  quantity: { type: Number, required: true, min: 1 },
  rate: { type: Number, default: 0 },
  mrp: { type: Number, default: 0 },
  gstPct: { type: Number, default: 0 },
  discountPct: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  returnedQuantity: { type: Number, default: 0 },
});

const pharmacySaleSchema = new mongoose.Schema(
  {
    saleNumber: { type: String, unique: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', index: true },
    prescriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Prescription' },
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IpdAdmission' },
    items: [pharmacySaleItemSchema],
    saleDate: { type: Date, default: Date.now, index: true },
    saleType: { type: String, enum: SALE_TYPES, default: 'OTC' },
    grossTotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    netTotal: { type: Number, default: 0 },
    billId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill' },
    status: { type: String, enum: Object.values(SALE_STATUS), default: SALE_STATUS.COMPLETED },
    cashier: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: String,
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

pharmacySaleSchema.index({ patientId: 1, saleDate: -1 });
pharmacySaleSchema.index({ saleDate: -1, status: 1 });

export default mongoose.model('PharmacySale', pharmacySaleSchema);

const pharmacySaleReturnSchema = new mongoose.Schema(
  {
    returnNumber: { type: String, unique: true },
    saleId: { type: mongoose.Schema.Types.ObjectId, ref: 'PharmacySale', required: true },
    items: [
      {
        saleItemId: mongoose.Schema.Types.ObjectId,
        medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine' },
        name: String,
        batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicineBatch' },
        batchNumber: String,
        quantity: { type: Number, min: 1 },
        rate: Number,
        refundAmount: Number,
      },
    ],
    reason: String,
    returnDate: { type: Date, default: Date.now },
    status: { type: String, enum: ['PROCESSED', 'CANCELLED'], default: 'PROCESSED' },
    refunded: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

export const PharmacySaleReturn = mongoose.model('PharmacySaleReturn', pharmacySaleReturnSchema);