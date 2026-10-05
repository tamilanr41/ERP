import mongoose from 'mongoose';

export const TRIAGE_LEVELS = ['CRITICAL', 'URGENT', 'SEMI_URGENT', 'NON_URGENT'];

export const EMERGENCY_STATUS = {
  REGISTERED: 'REGISTERED',
  TRIAGED: 'TRIAGED',
  IN_TREATMENT: 'IN_TREATMENT',
  ADMITTED: 'ADMITTED',
  DISCHARGED: 'DISCHARGED',
  TRANSFERRED: 'TRANSFERRED',
  DECEASED: 'DECEASED',
};

const emergencySchema = new mongoose.Schema(
  {
    emergencyNumber: { type: String, unique: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', index: true },
    registeredAt: { type: Date, default: Date.now, index: true },
    arrivalMode: { type: String, enum: ['AMBULANCE', 'WALK_IN', 'REFERRED', 'POLICE', 'OTHER'], default: 'WALK_IN' },
    triageLevel: { type: String, enum: TRIAGE_LEVELS },
    triagedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    triagedAt: Date,
    chiefComplaint: String,
    vitals: {
      temperature: Number,
      pulse: Number,
      bpSystolic: Number,
      bpDiastolic: Number,
      respiratoryRate: Number,
      spo2: Number,
      consciousness: String,
      painScore: Number,
    },
    assignedDoctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
    assignedNurseId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: [
      {
        text: String,
        author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        at: { type: Date, default: Date.now },
      },
    ],
    procedures: [{ type: String }],
    status: { type: String, enum: Object.values(EMERGENCY_STATUS), default: EMERGENCY_STATUS.REGISTERED, index: true },
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IpdAdmission' },
    dischargeAt: Date,
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

emergencySchema.index({ status: 1, registeredAt: -1, triageLevel: 1 });

export default mongoose.model('Emergency', emergencySchema);