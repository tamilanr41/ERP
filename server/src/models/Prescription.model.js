import mongoose from 'mongoose';

const prescriptionItemSchema = new mongoose.Schema({
  medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine' },
  medicineName: { type: String, required: true },
  dosage: String,
  route: { type: String, default: 'ORAL' },
  frequency: String,
  duration: String,
  quantity: { type: Number, default: 1 },
  instructions: String,
  timing: { type: String, enum: ['BEFORE_FOOD', 'AFTER_FOOD', 'WITH_FOOD', 'ANY_TIME'], default: 'AFTER_FOOD' },
  notes: String,
});

const prescriptionSchema = new mongoose.Schema(
  {
    rxNumber: { type: String, unique: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
    opdVisitId: { type: mongoose.Schema.Types.ObjectId, ref: 'OpdVisit' },
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IpdAdmission' },
    // A teleconsultation has no OpdVisit row, so without this the prescription
    // could not be traced back to the consultation that produced it.
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', index: true },
    prescriptionDate: { type: Date, default: Date.now, index: true },
    diagnosis: String,
    advice: String,
    followUpDate: Date,
    items: [prescriptionItemSchema],
    isDispensed: { type: Boolean, default: false },
    dispensedAt: Date,
    dispensedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['DRAFT', 'SIGNED', 'AMENDED', 'DISPENSED', 'CANCELLED'], default: 'DRAFT' },
    isSigned: { type: Boolean, default: false },
    signedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    signedAt: Date,
    isDispensedLocked: { type: Boolean, default: false },
    amendReason: String,
    amendedFromId: { type: mongoose.Schema.Types.ObjectId, ref: 'Prescription' },
    amendmentNumber: Number,
    amendmentDate: Date,
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

prescriptionSchema.index({ patientId: 1, prescriptionDate: -1 });
prescriptionSchema.index({ isDispensed: 1 });
prescriptionSchema.index({ status: 1 });
prescriptionSchema.index({ amendedFromId: 1 });

export default mongoose.model('Prescription', prescriptionSchema);