import mongoose from 'mongoose';

export const CARE_PLAN_STATUS = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

/**
 * CarePlan — a structured nursing/clinical care plan for an admission with
 * tasks, owners and completion tracking (section 12 / 43).
 */
const carePlanTaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    notes: String,
    frequency: String,
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedRole: String,
    dueAt: Date,
    status: { type: String, enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED'], default: 'PENDING' },
    completedAt: Date,
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

const carePlanSchema = new mongoose.Schema(
  {
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IpdAdmission', required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },

    title: { type: String, required: true },
    diagnosis: String,
    goal: String,
    nursingDiagnosis: String,
    interventions: String,
    precautions: String,
    reviewAt: Date,

    status: { type: String, enum: CARE_PLAN_STATUS, default: 'PLANNED', index: true },
    tasks: [carePlanTaskSchema],

    authoredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
    approvedAt: Date,

    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

carePlanSchema.index({ admissionId: 1, createdAt: -1 });

export default mongoose.model('CarePlan', carePlanSchema);
