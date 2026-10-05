import mongoose from 'mongoose';

export const LAB_ORDER_STATUS = {
  ORDERED: 'ORDERED',
  BILLED: 'BILLED',
  SAMPLE_COLLECTED: 'SAMPLE_COLLECTED',
  PROCESSING: 'PROCESSING',
  RESULT_ENTERED: 'RESULT_ENTERED',
  VERIFIED: 'VERIFIED',
  REPORTED: 'REPORTED',
  CANCELLED: 'CANCELLED',
};

const labOrderItemSchema = new mongoose.Schema({
  labTestId: { type: mongoose.Schema.Types.ObjectId, ref: 'LabTest', required: true },
  testName: String,
  price: Number,
  status: { type: String, enum: Object.values(LAB_ORDER_STATUS), default: LAB_ORDER_STATUS.ORDERED },
  sampleId: { type: mongoose.Schema.Types.ObjectId, ref: 'LabSample' },
  resultId: { type: mongoose.Schema.Types.ObjectId, ref: 'LabResult' },
});

const labOrderSchema = new mongoose.Schema(
  {
    labOrderNumber: { type: String, unique: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
    opdVisitId: { type: mongoose.Schema.Types.ObjectId, ref: 'OpdVisit' },
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IpdAdmission' },
    dialysisSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'DialysisSession', index: true },
    orderedAt: { type: Date, default: Date.now, index: true },
    orderedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    priority: { type: String, enum: ['ROUTINE', 'URGENT', 'STAT'], default: 'ROUTINE' },
    items: [labOrderItemSchema],
    clinicalNotes: String,
    status: { type: String, enum: Object.values(LAB_ORDER_STATUS), default: LAB_ORDER_STATUS.ORDERED, index: true },
    billId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill' },
    isCritical: { type: Boolean, default: false },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

labOrderSchema.index({ patientId: 1, orderedAt: -1 });
labOrderSchema.index({ status: 1, orderedAt: -1 });

export default mongoose.model('LabOrder', labOrderSchema);

const labSampleSchema = new mongoose.Schema(
  {
    sampleNumber: { type: String },
    labOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'LabOrder', required: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    labTestId: { type: mongoose.Schema.Types.ObjectId, ref: 'LabTest' },
    testName: String,
    sampleType: String,
    container: String,
    collectedAt: Date,
    collectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    receivedAt: Date,
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['PENDING', 'COLLECTED', 'RECEIVED', 'PROCESSING', 'COMPLETED', 'REJECTED'], default: 'PENDING' },
    rejectionReason: String,
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

const labResultSchema = new mongoose.Schema(
  {
    labOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'LabOrder', required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IpdAdmission' },
    labTestId: { type: mongoose.Schema.Types.ObjectId, ref: 'LabTest', required: true },
    testName: String,
    sampleId: { type: mongoose.Schema.Types.ObjectId, ref: 'LabSample' },
    values: [
      {
        parameter: String,
        value: String,
        unit: String,
        normalRange: String,
        flag: { type: String, enum: ['LOW', 'HIGH', 'NORMAL', 'CRITICAL_LOW', 'CRITICAL_HIGH'], default: 'NORMAL' },
      },
    ],
    comments: String,
    enteredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    enteredAt: Date,
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: Date,
    status: { type: String, enum: ['PENDING', 'DRAFT', 'ENTERED', 'VERIFIED', 'REPORTED'], default: 'PENDING' },
    isCritical: { type: Boolean, default: false },
    releasedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    releasedAt: Date,
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

export const LabSample = mongoose.model('LabSample', labSampleSchema);
export const LabResult = mongoose.model('LabResult', labResultSchema);