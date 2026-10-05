import mongoose from 'mongoose';

const medicineBatchSchema = new mongoose.Schema(
  {
    medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true, index: true },
    batchNumber: { type: String, required: true },
    manufacturingDate: Date,
    expiryDate: { type: Date, required: true, index: true },
    purchaseRate: { type: Number, default: 0 },
    sellingRate: { type: Number, default: 0 },
    mrp: { type: Number, default: 0 },
    quantity: { type: Number, default: 0 }, // current available quantity
    initialQuantity: Number,
    location: String,
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
    // full batch traceability: issue / return / wastage / expiry write-off
    movements: [
      {
        type: { type: String, enum: ['PURCHASE_IN', 'GRN', 'ISSUE', 'RETURN', 'WASTAGE', 'EXPIRY_WRITE_OFF', 'ADJUSTMENT'], required: true },
        quantity: { type: Number, required: true }, // signed: +in / -out
        balanceAfter: Number,
        referenceType: String,
        referenceId: mongoose.Schema.Types.ObjectId,
        admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IpdAdmission' },
        patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient' },
        reason: String,
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        at: { type: Date, default: Date.now },
      },
    ],
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

medicineBatchSchema.index({ medicineId: 1, expiryDate: 1 });
medicineBatchSchema.index({ batchNumber: 1, expiryDate: 1 });
medicineBatchSchema.index({ expiryDate: 1, quantity: 1 });

export default mongoose.model('MedicineBatch', medicineBatchSchema);