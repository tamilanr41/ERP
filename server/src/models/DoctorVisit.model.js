import mongoose from 'mongoose';

export const DOCTOR_VISIT_TYPES = {
  ROUND: 'ROUND',
  PROGRESS_NOTE: 'PROGRESS_NOTE',
  EMERGENCY: 'EMERGENCY',
  SPECIALIST: 'SPECIALIST',
  CONSULTATION: 'CONSULTATION',
};

/**
 * DoctorVisit — a single structured doctor round / visit record for an IPD
 * admission. Each visit is a separate clinical record (never overwritten);
 * daily progress notes are distinct entries created by repeated rounds.
 */
const doctorVisitSchema = new mongoose.Schema(
  {
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IpdAdmission', required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    visitNumber: { type: String, unique: true, index: true },

    visitType: { type: String, enum: Object.values(DOCTOR_VISIT_TYPES), default: DOCTOR_VISIT_TYPES.ROUND },
    visitDate: { type: Date, default: Date.now, index: true },

    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', index: true },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    specialty: String,

    clinicalNotes: String,
    examination: String,
    assessment: String,
    diagnosis: String,
    plan: String,

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

doctorVisitSchema.index({ admissionId: 1, visitDate: -1 });
doctorVisitSchema.index({ doctorId: 1, visitDate: -1 });

export default mongoose.model('DoctorVisit', doctorVisitSchema);