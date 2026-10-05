import mongoose from 'mongoose';

export const PHARMACY_REQUEST_STATUS = {
  REQUESTED: 'REQUESTED',
  VERIFIED: 'VERIFIED',
  DISPENSED: 'DISPENSED',
  PARTIAL: 'PARTIAL',
  RETURNED: 'RETURNED',
  CANCELLED: 'CANCELLED',
};

/**
 * PharmacyRequest — in-patient pharmacy request. The ward raises a request
 * against a medication chart entry, pharmacy verifies availability, selects a
 * batch, dispenses (deducting batch stock), and the ward can return unused
 * medicine (restoring stock). Wastage is recorded against the request.
 */
const pharmacyRequestSchema = new mongoose.Schema(
  {
    requestNumber: { type: String, unique: true, index: true },
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IpdAdmission', required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    medicationChartId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicationChart' },

    medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
    medicineName: { type: String, required: true },
    strength: String,
    dosage: String,
    route: String,
    frequency: String,

    quantityRequested: { type: Number, min: 1, required: true },
    quantityDispensed: { type: Number, min: 0, default: 0 },
    quantityReturned: { type: Number, min: 0, default: 0 },
    wastageQuantity: { type: Number, min: 0, default: 0 },
    wastageReason: String,

    status: { type: String, enum: Object.values(PHARMACY_REQUEST_STATUS), default: PHARMACY_REQUEST_STATUS.REQUESTED, index: true },
    priority: { type: String, enum: ['ROUTINE', 'URGENT', 'STAT'], default: 'ROUTINE' },

    batches: [
      {
        batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicineBatch' },
        batchNumber: String,
        expiryDate: Date,
        quantity: { type: Number, min: 0, default: 0 },
        rate: { type: Number, min: 0, default: 0 },
      },
    ],

    availableStock: Number,
    requestedAt: { type: Date, default: Date.now, index: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    verifiedAt: Date,
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verificationNotes: String,

    dispensedAt: Date,
    dispensedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    returnedAt: Date,
    returnedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    billId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill' },
    billedAt: Date,

    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

pharmacyRequestSchema.index({ admissionId: 1, status: 1, requestedAt: -1 });

export default mongoose.model('PharmacyRequest', pharmacyRequestSchema);
