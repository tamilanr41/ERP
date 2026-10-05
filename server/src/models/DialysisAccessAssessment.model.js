import mongoose from 'mongoose';

export const ACCESS_SITE_CONDITION = {
  NORMAL: 'NORMAL',
  REDNESS: 'REDNESS',
  SWELLING: 'SWELLING',
  BLEEDING: 'BLEEDING',
  INFECTED: 'INFECTED',
  SCARRING: 'SCARRING',
  COLLAPSED: 'COLLAPSED',
  DISLODGED: 'DISLODGED',
};

export const PATENCY_RESULT = {
  NORMAL_THRILL: 'NORMAL_THRILL',
  WEAK_THRILL: 'WEAK_THRILL',
  NO_THRILL: 'NO_THRILL',
  COLLAPSED: 'COLLAPSED',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
  NOT_ASSESSED: 'NOT_ASSESSED',
};

/** Findings a nurse must explicitly declare either way, so "no abnormality" is also evidence. */
export const ATTENTION_SIGN = {
  REDNESS: 'REDNESS',
  SWELLING: 'SWELLING',
  BLEEDING: 'BLEEDING',
  INFECTION: 'INFECTION',
  THRILL_ABSENT: 'THRILL_ABSENT',
  BRUIT_ABNORMAL: 'BRUIT_ABNORMAL',
  PAIN: 'PAIN',
  COLD_PALM: 'COLD_PALM',
  CATHETER_EXIT_DISCHARGE: 'CATHETER_EXIT_DISCHARGE',
  CRYSTALLISATION: 'CRYSTALLISATION',
  DISLODGED_CANNULA: 'DISLODGED_CANNULA',
  OTHER: 'OTHER',
};

/**
 * One structured nursing assessment of a vascular access. The registry keeps a
 * running summary; this keeps the dated evidence behind it, because "when did
 * the fistula first lose its thrill" is a question the notes alone cannot answer.
 */
const accessAssessmentSchema = new mongoose.Schema(
  {
    accessId: { type: mongoose.Schema.Types.ObjectId, ref: 'DialysisAccess', required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    dialysisPatientId: { type: mongoose.Schema.Types.ObjectId, ref: 'DialysisPatient', index: true },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'DialysisSession' },

    assessedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assessedByName: String,
    assessedAt: { type: Date, default: Date.now, index: true },

    siteCondition: { type: String, enum: Object.values(ACCESS_SITE_CONDITION), default: ACCESS_SITE_CONDITION.NORMAL },
    attentionSigns: { type: [String], enum: Object.values(ATTENTION_SIGN), default: [] },
    otherSign: String,

    // patency — thrill/bruit for a fistula or graft, blood flow for a catheter
    patency: { type: String, enum: Object.values(PATENCY_RESULT), default: PATENCY_RESULT.NOT_ASSESSED },
    thrillPalpable: Boolean,
    bruitAudible: Boolean,
    catheterBloodFlow: String,
    catheterExitSiteCondition: String,

    nursingNotes: String,
    nursingPlan: String,
    reportedToDoctor: Boolean,
    reportedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },

    // the nurse's own verdict — the system never derives a clinical decision
    assessedAsUsable: { type: Boolean, default: true },
    requiresIntervention: { type: Boolean, default: false },
    interventionPlan: String,

    accessStatusAfter: String,
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
  },
  { timestamps: true },
);

accessAssessmentSchema.index({ accessId: 1, assessedAt: -1 });

export const DialysisAccessAssessment = mongoose.model('DialysisAccessAssessment', accessAssessmentSchema);
export default DialysisAccessAssessment;
