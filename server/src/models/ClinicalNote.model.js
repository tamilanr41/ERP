import mongoose from 'mongoose';

export const CLINICAL_NOTE_TYPES = {
  GENERAL: 'GENERAL',
  CHIEF_COMPLAINT: 'CHIEF_COMPLAINT',
  HPI: 'HPI',
  EXAMINATION: 'EXAMINATION',
  ASSESSMENT: 'ASSESSMENT',
  PLAN: 'PLAN',
  NURSING: 'NURSING',
  FOLLOW_UP: 'FOLLOW_UP',
  INITIAL_ASSESSMENT: 'INITIAL_ASSESSMENT',
};

/**
 * ClinicalNote — a free-text clinical note attached to a visit/patient.
 * Every note records author + timestamp; edits are audit-logged.
 */
const clinicalNoteSchema = new mongoose.Schema(
  {
    visitId: { type: mongoose.Schema.Types.ObjectId, ref: 'OpdVisit', index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IpdAdmission' },
    // dialysis notes are raised against a sitting, not an admission, so the
    // session has to be recorded or the note cannot be traced back to it
    dialysisSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'DialysisSession', index: true },

    noteType: { type: String, enum: Object.values(CLINICAL_NOTE_TYPES), default: CLINICAL_NOTE_TYPES.GENERAL },
    body: { type: String, required: true, trim: true },

    // structured payload for INITIAL_ASSESSMENT notes (and other typed notes)
    structured: { type: mongoose.Schema.Types.Mixed },

    // doctor visit context (section 13)
    specialty: String,

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

clinicalNoteSchema.index({ visitId: 1, createdAt: -1 });
clinicalNoteSchema.index({ admissionId: 1, createdAt: -1 });

// clinical documentation is append-only
clinicalNoteSchema.pre('deleteOne', { document: false, query: true }, function forbidDelete(next) {
  next(new Error('Clinical notes cannot be deleted — add a correction note instead'));
});
clinicalNoteSchema.pre('deleteMany', { document: false, query: true }, function forbidDelete(next) {
  next(new Error('Clinical notes cannot be deleted — add a correction note instead'));
});

export default mongoose.model('ClinicalNote', clinicalNoteSchema);
