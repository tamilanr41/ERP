import mongoose from 'mongoose';

const nursingNoteSchema = new mongoose.Schema(
  {
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IpdAdmission', required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    shift: { type: String, enum: ['MORNING', 'EVENING', 'NIGHT'], default: 'MORNING' },
    noteType: { type: String, enum: ['DAILY_PROGRESS', 'NURSING_NOTE', 'PAIN_ASSESSMENT', 'FALL_RISK', 'PRESSURE_SORE_RISK', 'PATIENT_OBSERVATION', 'HYGIENE', 'MOBILITY', 'FEEDING', 'SLEEP', 'ELIMINATION', 'SPECIAL_INSTRUCTIONS', 'HANDOVER', 'CARE_PLAN', 'TASK'], default: 'NURSING_NOTE' },
    note: { type: String, required: true },
    status: { type: String, enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED'], default: 'PENDING' },
    taskDueAt: Date,
    vitals: {
      temperature: Number,
      pulse: Number,
      bpSystolic: Number,
      bpDiastolic: Number,
      respiratoryRate: Number,
      spo2: Number,
      painScore: Number,
      gcs: Number,
    },
    intakeOutput: {
      intakeMl: Number,
      outputMl: Number,
      urineMl: Number,
      ivFluidMl: Number,
    },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recordedAt: { type: Date, default: Date.now },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

nursingNoteSchema.index({ admissionId: 1, recordedAt: -1 });

export default mongoose.model('NursingNote', nursingNoteSchema);