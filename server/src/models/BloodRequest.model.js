import mongoose from 'mongoose';

export const BLOOD_COMPONENTS = ['WHOLE_BLOOD', 'PACKED_RBC', 'PLATELETS', 'FRESH_FROZEN_PLASMA', 'CRYOPRECIPITATE'];

export const BLOOD_REQUEST_STATUS = {
  REQUESTED: 'REQUESTED',
  SCREENING: 'SCREENING',
  AVAILABLE: 'AVAILABLE',
  PARTIAL: 'PARTIAL',
  ISSUED: 'ISSUED',
  TRANSFUSED: 'TRANSFUSED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
};

/**
 * BloodRequest — IPD blood bank request with full traceability from request
 * through screening, issue, transfusion and reaction monitoring.
 */
const transfusionReactionSchema = new mongoose.Schema(
  {
    occurred: { type: Boolean, default: false },
    type: String,
    severity: { type: String, enum: ['MILD', 'MODERATE', 'SEVERE'] },
    notes: String,
    monitoredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reportedAt: Date,
  },
  { _id: false },
);

const bloodRequestSchema = new mongoose.Schema(
  {
    requestNumber: { type: String, unique: true, index: true },
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IpdAdmission', required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    admissionNumber: String,
    uhid: String,

    bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'UNKNOWN'], default: 'UNKNOWN' },
    component: { type: String, enum: BLOOD_COMPONENTS, required: true },
    unitsRequested: { type: Number, min: 1, required: true },
    unitsIssued: { type: Number, min: 0, default: 0 },

    priority: { type: String, enum: ['ROUTINE', 'URGENT', 'STAT'], default: 'ROUTINE' },
    reason: String,
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    requestedAt: { type: Date, default: Date.now, index: true },
    neededBy: Date,

    status: { type: String, enum: Object.values(BLOOD_REQUEST_STATUS), default: BLOOD_REQUEST_STATUS.REQUESTED, index: true },
    screeningNotes: String,
    screenedAt: Date,
    screenedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    collectionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'BloodCollection' }],
    issuedAt: Date,
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    billId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill' },

    transfusedAt: Date,
    transfusedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    startedAt: Date,
    endedAt: Date,
    reaction: { type: transfusionReactionSchema, default: () => ({ occurred: false }) },

    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

bloodRequestSchema.index({ admissionId: 1, requestedAt: -1 });
bloodRequestSchema.index({ status: 1, priority: 1, neededBy: 1 });

export default mongoose.model('BloodRequest', bloodRequestSchema);
