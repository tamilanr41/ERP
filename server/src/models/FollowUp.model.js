import mongoose from 'mongoose';

export const FOLLOWUP_STATUS = {
  SCHEDULED: 'SCHEDULED',
  COMPLETED: 'COMPLETED',
  MISSED: 'MISSED',
  CANCELLED: 'CANCELLED',
};

/**
 * FollowUp — scheduled re-visit created at the end of an OPD consultation.
 * May create a linked Appointment so it appears in the Appointment calendar.
 */
const followUpSchema = new mongoose.Schema(
  {
    followUpNumber: { type: String, unique: true, index: true },
    visitId: { type: mongoose.Schema.Types.ObjectId, ref: 'OpdVisit', index: true },
  admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IpdAdmission', index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },

    date: { type: Date, required: true, index: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    reason: String,

    reminderEnabled: { type: Boolean, default: true },
    reminderDate: Date,
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },

    status: { type: String, enum: Object.values(FOLLOWUP_STATUS), default: FOLLOWUP_STATUS.SCHEDULED },
    source: { type: String, enum: ['OPD', 'IPD_DISCHARGE', 'MANUAL'], default: 'OPD' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

followUpSchema.index({ doctorId: 1, date: 1 });

export default mongoose.model('FollowUp', followUpSchema);
