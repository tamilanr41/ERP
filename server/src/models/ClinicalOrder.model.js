import mongoose from 'mongoose';

export const CLINICAL_ORDER_CATEGORIES = {
  LAB: 'LAB',
  RADIOLOGY: 'RADIOLOGY',
  PROCEDURE: 'PROCEDURE',
  MEDICATION: 'MEDICATION',
  DIET: 'DIET',
  NURSING_INSTRUCTION: 'NURSING_INSTRUCTION',
  PHYSIOTHERAPY: 'PHYSIOTHERAPY',
  BLOOD_REQUEST: 'BLOOD_REQUEST',
  SPECIALIST_REFERRAL: 'SPECIALIST_REFERRAL',
  OTHER: 'OTHER',
};

export const CLINICAL_ORDER_PRIORITY = {
  STAT: 'STAT',
  URGENT: 'URGENT',
  ROUTINE: 'ROUTINE',
};

export const CLINICAL_ORDER_STATUS = {
  ORDERED: 'ORDERED',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  SCHEDULED: 'SCHEDULED',
  COLLECTED: 'COLLECTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  REJECTED: 'REJECTED',
};

/**
 * ClinicalOrder — unified clinical order covering lab / radiology / procedure /
 * medication / referral / diet. Linked to live LabOrder|RadiologyOrder when a
 * downstream sub-system fulfils it, so the OPD workspace and the Lab/Radiology
 * worklists stay in sync.
 */
const clinicalOrderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true, index: true },
    visitId: { type: mongoose.Schema.Types.ObjectId, ref: 'OpdVisit', index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IpdAdmission' },

    category: { type: String, enum: Object.values(CLINICAL_ORDER_CATEGORIES), required: true, index: true },
    name: { type: String, required: true, trim: true },
    code: String,                         // lab test code / radiology code
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', index: true }, // routing
    priority: { type: String, enum: Object.values(CLINICAL_ORDER_PRIORITY), default: CLINICAL_ORDER_PRIORITY.ROUTINE },
    status: { type: String, enum: Object.values(CLINICAL_ORDER_STATUS), default: CLINICAL_ORDER_STATUS.ORDERED, index: true },

    instructions: String,
    orderedAt: { type: Date, default: Date.now, index: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', index: true },
  orderedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // downstream order refs to keep worklists in sync
    labOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'LabOrder' },
    radiologyOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'RadiologyOrder' },

    cancelledAt: Date,
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    cancellationReason: String,

    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

clinicalOrderSchema.index({ status: 1, category: 1, orderedAt: -1 });
clinicalOrderSchema.index({ patientId: 1, orderedAt: -1 });

export default mongoose.model('ClinicalOrder', clinicalOrderSchema);
