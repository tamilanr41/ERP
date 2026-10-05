import mongoose from 'mongoose';

export const ACCESS_STATUS = {
  PATENT: 'PATENT',
  DYSFUNCTIONAL: 'DYSFUNCTIONAL',
  STENOSIS: 'STENOSIS',
  THROMBOSIS: 'THROMBOSIS',
  INFECTION: 'INFECTION',
  ANEURYSM: 'ANEURYSM',
  NEEDS_REVISION: 'NEEDS_REVISION',
  NEW: 'NEW',
  // The access is no longer usable but stays on the record for history. A
  // decommissioned access must not block a new one on the same side.
  DECOMMISSIONED: 'DECOMMISSIONED',
};

export const ACCESS_ASSESSMENT_RESULTS = {
  GOOD: 'GOOD',
  ADEQUATE: 'ADEQUATE',
  POOR: 'POOR',
  FAILING: 'FAILING',
  INFECTED: 'INFECTED',
};

/** Vascular access registry — one live access per dialysis patient (plus history). */
const accessSchema = new mongoose.Schema(
  {
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    dialysisPatientId: { type: mongoose.Schema.Types.ObjectId, ref: 'DialysisPatient', index: true },
    accessType: { type: String, required: true },
    site: String,
    side: { type: String, enum: ['LEFT', 'RIGHT'], required: true },
    createdAt: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    operatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },

    anastomosis: String,
    graftMaterial: String,
    catheterType: String,
    catheterInsertedAt: Date,

    status: { type: String, enum: Object.values(ACCESS_STATUS), default: ACCESS_STATUS.NEW },
    isPrimary: { type: Boolean, default: true },
    lastAssessedAt: Date,
    lastUsedSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'DialysisSession' },
    totalUses: { type: Number, default: 0 },
    complicationHistory: [String],
    // Declared as an explicit sub-schema on purpose. Written inline as
    // `[{ type: String, ... }]`, mongoose reads `type` as the *element* type
    // and the whole field silently becomes [String] — which then rejects every
    // intervention object and makes recording one impossible.
    interventions: {
      type: [new mongoose.Schema({
        at: { type: Date, default: Date.now },
        type: String,
        notes: String,
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      }, { _id: false })],
      default: [],
    },

    decommissionedAt: Date,
    decommissionReason: String,
    notes: String,
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
  },
  { timestamps: true },
);

accessSchema.index({ patientId: 1, isPrimary: 1 });

export const DialysisAccess = mongoose.model('DialysisAccess', accessSchema);
export default DialysisAccess;
