import mongoose from 'mongoose';

export const PHYSIO_SESSION_STATUS = {
  SCHEDULED: 'SCHEDULED',
  COMPLETED: 'COMPLETED',
  SKIPPED: 'SKIPPED',
  CANCELLED: 'CANCELLED',
};

export const PHYSIO_REQUEST_STATUS = {
  REQUESTED: 'REQUESTED',
  ACCEPTED: 'ACCEPTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
};

/**
 * PhysiotherapyRequest — IPD physiotherapy prescription with session tracking
 * (total vs completed sessions, therapist notes and progress per session).
 */
const physioSessionSchema = new mongoose.Schema(
  {
    sessionNumber: Number,
    scheduledAt: Date,
    completedAt: Date,
    therapistId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    therapistName: String,
    procedurePerformed: String,
    notes: String,
    progress: { type: String, enum: ['NO_PROGRESS', 'SLOW', 'MODERATE', 'GOOD', 'COMPLETED'], default: 'MODERATE' },
    status: { type: String, enum: Object.values(PHYSIO_SESSION_STATUS), default: PHYSIO_SESSION_STATUS.SCHEDULED },
  },
  { timestamps: true },
);

const physiotherapyRequestSchema = new mongoose.Schema(
  {
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IpdAdmission', required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    clinicalOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'ClinicalOrder' },

    procedure: { type: String, required: true },
    indication: String,
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
    therapistId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    therapistName: String,

    totalSessions: { type: Number, min: 1, default: 1 },
    completedSessions: { type: Number, min: 0, default: 0 },

    status: { type: String, enum: Object.values(PHYSIO_REQUEST_STATUS), default: PHYSIO_REQUEST_STATUS.REQUESTED, index: true },
    notes: String,
    sessions: [physioSessionSchema],

    chargePerSession: { type: Number, min: 0, default: 0 },
    billId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill' },
    billedSessions: { type: Number, min: 0, default: 0 },

    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

physiotherapyRequestSchema.index({ admissionId: 1, createdAt: -1 });

export default mongoose.model('PhysiotherapyRequest', physiotherapyRequestSchema);
