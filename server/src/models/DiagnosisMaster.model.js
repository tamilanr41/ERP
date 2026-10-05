import mongoose from 'mongoose';

/**
 * DiagnosisMaster — searchable dictionary of common diagnoses with ICD-10 codes,
 * used by the doctor workstation diagnosis search alongside the patient's own
 * previous VisitDiagnosis entries. Category maps to a specialty/group.
 */
const diagnosisMasterSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    icd10Code: String,
    category: String,
    synonyms: [String],
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

diagnosisMasterSchema.index({ name: 'text', synonyms: 'text', icd10Code: 1 });
diagnosisMasterSchema.index({ category: 1, isActive: 1 });

export default mongoose.model('DiagnosisMaster', diagnosisMasterSchema);