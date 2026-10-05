import mongoose from 'mongoose';

export const PROCEDURE_STATUS = {
  PLANNED: 'PLANNED',
  SCHEDULED: 'SCHEDULED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
};

export const PROCEDURE_CATEGORIES = [
  'DIAGNOSTIC', 'THERAPEUTIC', 'SURGICAL', 'ENDOSCOPIC', 'OBSTETRIC',
  'CARDIAC', 'NEURO', 'ORTHO', 'UROLOGY', 'GYNEC', 'ENT', 'OPHTHALMIC', 'OTHER',
];

/**
 * ProcedureRecord — an IPD procedure (non-OT bedside/ward procedure such as
 * central line insertion, lumbar puncture, wound care, endoscopy, etc.).
 * Charges are posted to the admission bill when the procedure is completed.
 */
const procedureRecordSchema = new mongoose.Schema(
  {
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IpdAdmission', required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    clinicalOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'ClinicalOrder' },

    name: { type: String, required: true },
    category: { type: String, enum: PROCEDURE_CATEGORIES, default: 'OTHER' },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
    assistantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
    nurseId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    procedureDate: { type: Date, default: Date.now, index: true },
    startTime: Date,
    endTime: Date,

    indication: String,
    procedureNotes: String,
    complications: String,

    consumables: [
      { itemName: String, quantity: { type: Number, min: 0, default: 1 }, rate: { type: Number, min: 0, default: 0 }, total: Number },
    ],
    medicines: [
      { medicineName: String, quantity: { type: Number, min: 0, default: 1 }, rate: { type: Number, min: 0, default: 0 } },
    ],
    equipment: [String],

    status: { type: String, enum: Object.values(PROCEDURE_STATUS), default: PROCEDURE_STATUS.PLANNED, index: true },
    charge: { type: Number, min: 0, default: 0 },
    billId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill' },
    billedAt: Date,

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

procedureRecordSchema.index({ admissionId: 1, procedureDate: -1 });
procedureRecordSchema.index({ status: 1, procedureDate: 1 });

export default mongoose.model('ProcedureRecord', procedureRecordSchema);
