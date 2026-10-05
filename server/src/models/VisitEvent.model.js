import mongoose from 'mongoose';

export const VISIT_EVENT_TYPES = {
  VISIT_CREATED: 'VISIT_CREATED',
  VITALS_RECORDED: 'VITALS_RECORDED',
  DIAGNOSIS_ADDED: 'DIAGNOSIS_ADDED',
  DIAGNOSIS_UPDATED: 'DIAGNOSIS_UPDATED',
  ORDER_CREATED: 'ORDER_CREATED',
  ORDER_CANCELLED: 'ORDER_CANCELLED',
  ORDER_STATUS_CHANGED: 'ORDER_STATUS_CHANGED',
  PRESCRIPTION_CREATED: 'PRESCRIPTION_CREATED',
  PRESCRIPTION_FINALIZED: 'PRESCRIPTION_FINALIZED',
  PRESCRIPTION_AMENDED: 'PRESCRIPTION_AMENDED',
  PRESCRIPTION_DISPENSED: 'PRESCRIPTION_DISPENSED',
  LAB_RESULT_RELEASED: 'LAB_RESULT_RELEASED',
  RADIOLOGY_SCHEDULED: 'RADIOLOGY_SCHEDULED',
  RADIOLOGY_REPORTS_RELEASED: 'RADIOLOGY_REPORTS_RELEASED',
  BILL_GENERATED: 'BILL_GENERATED',
  PAYMENT_RECEIVED: 'PAYMENT_RECEIVED',
  FOLLOWUP_CREATED: 'FOLLOWUP_CREATED',
  FOLLOWUP_COMPLETED: 'FOLLOWUP_COMPLETED',
  NOTE_ADDED: 'NOTE_ADDED',
  VISIT_CLOSED: 'VISIT_CLOSED',
  VISIT_REFERRED: 'VISIT_REFERRED',
  VISIT_ADMITTED: 'VISIT_ADMITTED',
  // Queue movements. The timeline is the only record of how long a patient
  // actually waited, so being called and being marked absent have to be in it.
  VISIT_CALLED: 'VISIT_CALLED',
  VISIT_COMPLETED: 'VISIT_COMPLETED',
  VISIT_IN_CONSULTATION: 'VISIT_IN_CONSULTATION',
  VISIT_NO_SHOW: 'VISIT_NO_SHOW',
  VISIT_CANCELLED: 'VISIT_CANCELLED',
  DOCUMENT_UPLOADED: 'DOCUMENT_UPLOADED',
};

/**
 * VisitEvent — immutable, append-only timeline for a visit.
 * Mirrors the key audit actions so the OPD workspace timeline can be rendered
 * without hardcoding client-side events.
 */
const visitEventSchema = new mongoose.Schema(
  {
    visitId: { type: mongoose.Schema.Types.ObjectId, ref: 'OpdVisit', required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', index: true },
    type: { type: String, enum: Object.values(VISIT_EVENT_TYPES), required: true },
    title: { type: String, required: true },
    description: String,
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    actorName: String,
    actorRole: String,
    departmentName: String,
    happenedAt: { type: Date, default: Date.now, index: true },
    meta: mongoose.Schema.Types.Mixed,
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

visitEventSchema.index({ visitId: 1, happenedAt: -1 });

export default mongoose.model('VisitEvent', visitEventSchema);
