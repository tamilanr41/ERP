import mongoose from 'mongoose';

export const RADIOLOGY_STATUS = {
  ORDERED: 'ORDERED',
  SCHEDULED: 'SCHEDULED',
  IN_PROGRESS: 'IN_PROGRESS',
  REPORTING: 'REPORTING',
  VERIFIED: 'VERIFIED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
};

const radiologyTestSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: String,
  modality: {
    type: String,
    enum: ['X_RAY', 'CT', 'MRI', 'ULTRASOUND', 'MAMMOGRAPHY', 'FLUOROSCOPY', 'PET', 'OTHER'],
    default: 'X_RAY',
  },
  price: { type: Number, default: 0 },
  preparation: String,
  active: { type: Boolean, default: true },
  hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
});

export const RadiologyTest = mongoose.model('RadiologyTest', radiologyTestSchema);

const radiologyOrderSchema = new mongoose.Schema(
  {
    radiologyOrderNumber: { type: String, unique: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
    opdVisitId: { type: mongoose.Schema.Types.ObjectId, ref: 'OpdVisit' },
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IpdAdmission' },
    orderedAt: { type: Date, default: Date.now, index: true },
    orderedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    tests: [
      {
        radiologyTestId: { type: mongoose.Schema.Types.ObjectId, ref: 'RadiologyTest' },
        testName: String,
        modality: String,
        price: Number,
        status: { type: String, enum: Object.values(RADIOLOGY_STATUS), default: RADIOLOGY_STATUS.ORDERED },
        scheduledAt: Date,
        scannedAt: Date,
        reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'RadiologyReport' },
      },
    ],
    clinicalHistory: String,
    priority: { type: String, enum: ['ROUTINE', 'URGENT', 'STAT'], default: 'ROUTINE' },
    status: { type: String, enum: Object.values(RADIOLOGY_STATUS), default: RADIOLOGY_STATUS.ORDERED, index: true },
    billId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill' },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

const radiologyReportSchema = new mongoose.Schema(
  {
    radiologyOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'RadiologyOrder', required: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    radiologyTestId: { type: mongoose.Schema.Types.ObjectId, ref: 'RadiologyTest' },
    testName: String,
    clinicalHistory: String,
    findings: String,
    impression: String,
    images: [String],
    docReferences: [String],
    radiologistId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
    typedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    enteredAt: Date,
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: Date,
    status: { type: String, enum: ['DRAFT', 'ENTERED', 'VERIFIED'], default: 'DRAFT' },
    releasedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    releasedAt: Date,
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

radiologyOrderSchema.index({ patientId: 1, orderedAt: -1 });

export default mongoose.model('RadiologyOrder', radiologyOrderSchema);
export const RadiologyReport = mongoose.model('RadiologyReport', radiologyReportSchema);