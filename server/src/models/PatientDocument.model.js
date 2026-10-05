import mongoose from 'mongoose';

export const IPD_DOCUMENT_TYPES = [
  'ADMISSION_FORM',
  'CONSENT_FORM',
  'INITIAL_ASSESSMENT',
  'DOCTOR_PROGRESS_NOTE',
  'NURSING_NOTE',
  'INVESTIGATION_REPORT',
  'RADIOLOGY_REPORT',
  'PRESCRIPTION',
  'MAR',
  'PROCEDURE_NOTES',
  'OPERATION_NOTES',
  'INSURANCE_DOCUMENT',
  'DISCHARGE_SUMMARY',
  'FINAL_BILL',
  'RECEIPT',
  'ADVANCE_RECEIPT',
  'TRANSFER_NOTE',
  'IDENTITY_PROOF',
  'OTHER',
];

const patientDocumentSchema = new mongoose.Schema(
  {
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IpdAdmission', index: true },
    ipNumber: String,                       // snapshot of the IP number at creation

    title: { type: String, required: true },
    category: {
      type: String,
      enum: [
        'PATIENT_PHOTO', 'LAB_REPORT', 'SCAN_REPORT', 'PRESCRIPTION', 'INSURANCE_DOCUMENT',
        'DISCHARGE_SUMMARY', 'MEDICAL_CERTIFICATE', 'GENERAL',
      ],
      default: 'GENERAL',
    },
    documentType: { type: String, enum: IPD_DOCUMENT_TYPES, index: true },

    // generated documents point back at the record they were produced from
    sourceType: String,                     // DischargeSummary | Bill | Payment | IpdAdvance | ...
    sourceId: mongoose.Schema.Types.ObjectId,
    generatedAt: Date,
    contentSnapshot: mongoose.Schema.Types.Mixed,

    fileType: String,
    fileName: String,
    fileSize: Number,
    filePath: String,
    fileUrl: String,
    notes: String,
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdDate: { type: Date, default: Date.now, index: true },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

patientDocumentSchema.index({ patientId: 1, createdDate: -1 });
patientDocumentSchema.index({ admissionId: 1, documentType: 1 });
// one generated document per source record
patientDocumentSchema.index(
  { sourceType: 1, sourceId: 1 },
  { unique: true, partialFilterExpression: { sourceId: { $type: 'objectId' } } },
);

// clinical documents are never silently deleted — they are voided, not removed
patientDocumentSchema.pre('deleteOne', { document: false, query: true }, function forbidDelete(next) {
  next(new Error('Clinical documents cannot be deleted — void the document instead'));
});
patientDocumentSchema.pre('deleteMany', { document: false, query: true }, function forbidDelete(next) {
  next(new Error('Clinical documents cannot be deleted — void the document instead'));
});

export default mongoose.model('PatientDocument', patientDocumentSchema);
