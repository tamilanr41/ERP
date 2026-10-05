import mongoose from 'mongoose';

export const DISCHARGE_SUMMARY_STATUS = { DRAFT: 'DRAFT', FINAL: 'FINAL' };

/**
 * DischargeSummary — the professional in-patient discharge document.
 * Content can be auto-assembled from the admission record, then refined and
 * signed by the consultant before it is marked FINAL.
 */
const dischargeSummarySchema = new mongoose.Schema(
  {
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IpdAdmission', required: true, unique: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    admissionDate: Date,
    dischargeDate: { type: Date, default: Date.now },
    lengthOfStayDays: Number,

    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    consultantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
    wardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ward' },
    bedId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bed' },
    hospitalName: String,

    // ===== clinical content =====
    chiefComplaint: String,
    history: String,                      // history of present illness
    pastHistory: String,
    examination: String,
    diagnosis: String,
    investigations: String,
    treatmentGiven: String,
    proceduresPerformed: [String],
    surgery: String,
    hospitalCourse: String,
    conditionAtDischarge: String,
    complications: String,

    // ===== discharge prescriptions / follow-up / advice =====
    medicationsOnDischarge: [
      { medicineName: String, genericName: String, strength: String, dosage: String, frequency: String, duration: String, instructions: String },
    ],
    followUps: [
      { date: Date, doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' }, doctorName: String, department: String, notes: String },
    ],
    advice: {
      diet: String,
      activity: String,
      warningSigns: String,
      emergencyInstructions: String,
    },

    doctorSignature: {
      signedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
      signedByName: String,
      signedAt: Date,
      signatureRef: String,
      digitalSignatureUrl: String,
    },

    dischargeType: { type: String, default: 'NORMAL' },
    deathDetails: {
      causeOfDeath: String,
      timeOfDeath: Date,
      certifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
      mortuaryRef: String,
    },

    medicalCertificate: String,
    billingSummary: {
      totalAmount: Number,
      paidAmount: Number,
      dueAmount: Number,
      advanceAdjusted: Number,
    },

    preparedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
    status: { type: String, enum: Object.values(DISCHARGE_SUMMARY_STATUS), default: DISCHARGE_SUMMARY_STATUS.DRAFT },
    finalisedAt: Date,
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

export default mongoose.model('DischargeSummary', dischargeSummarySchema);
