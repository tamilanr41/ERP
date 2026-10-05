import mongoose from 'mongoose';

export const DIAGNOSIS_STATUS = {
  PROVISIONAL: 'PROVISIONAL',
  CONFIRMED: 'CONFIRMED',
  RULED_OUT: 'RULED_OUT',
  RESOLVED: 'RESOLVED',
};

export const DIAGNOSIS_TYPES = {
  PROVISIONAL: 'PROVISIONAL',
  PRIMARY: 'PRIMARY',
  SECONDARY: 'SECONDARY',
  FINAL: 'FINAL',
};

/**
 * VisitDiagnosis — a single diagnosis entry for a visit.
 * Multiple rows per visit support primary/secondary + ICD-10 coded + provisional/confirmed.
 */
const visitDiagnosisSchema = new mongoose.Schema(
  {
    visitId: { type: mongoose.Schema.Types.ObjectId, ref: 'OpdVisit', required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },

    icd10Code: String,
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: Object.values(DIAGNOSIS_TYPES), default: DIAGNOSIS_TYPES.PRIMARY },
    status: { type: String, enum: Object.values(DIAGNOSIS_STATUS), default: DIAGNOSIS_STATUS.PROVISIONAL },
    onsetDate: Date,
    notes: String,

    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

visitDiagnosisSchema.index({ visitId: 1, type: 1, status: 1 });

export default mongoose.model('VisitDiagnosis', visitDiagnosisSchema);
