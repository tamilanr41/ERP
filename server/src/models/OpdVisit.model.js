import mongoose from 'mongoose';

const vitalsSchema = {
  temperature: Number,
  pulse: Number,
  bpSystolic: Number,
  bpDiastolic: Number,
  respiratoryRate: Number,
  spo2: Number,
  heightCm: Number,
  weightKg: Number,
  bmi: Number,
  bloodSugar: Number,
};

const diagnosisSchema = {
  provisional: String,
  final: String,
  icdCode: String,
};

const referralSchema = {
  toDoctor: String,
  toDepartment: String,
  reason: String,
  notes: String,
  referredAt: Date,
};

const opdVisitSchema = new mongoose.Schema(
  {
    opdNumber: { type: String, unique: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', index: true },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IpdAdmission' },
    visitDate: { type: Date, default: Date.now, index: true },
    visitType: { type: String, enum: ['NEW', 'FOLLOW_UP', 'WALK_IN', 'EMERGENCY'], default: 'NEW' },
    chiefComplaint: String,
    historyOfPresentingIllness: String,
    pastHistory: String,
    pastMedicalHistory: String,
    pastSurgicalHistory: String,
    familyHistory: String,
    personalHistory: String,
    medicationHistory: String,
    allergies: [String],
    vitals: vitalsSchema,
    examination: {
      general: String,
      systemic: String,
      templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExaminationTemplate' },
      specialty: String,
      templateName: String,
      sections: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    diagnosis: diagnosisSchema,
    treatmentPlan: String,
    advice: String,
    followUpDate: Date,
    referral: referralSchema,
    admission: mongoose.Schema.Types.Mixed,
    closeNotes: String,
    status: {
      type: String,
      enum: ['IN_PROGRESS', 'COMPLETED', 'REFERRED', 'ADMITTED'],
      default: 'IN_PROGRESS',
    },
    consultedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    vitalsStatus: { type: String, enum: ['PENDING', 'COMPLETED'], default: 'PENDING' },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

opdVisitSchema.index({ patientId: 1, visitDate: -1 });
opdVisitSchema.index({ doctorId: 1, visitDate: -1 });

export default mongoose.model('OpdVisit', opdVisitSchema);