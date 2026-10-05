import mongoose from 'mongoose';

export const RECURRING_STATUS = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
};

/**
 * A recurring dialysis schedule is the parent of a generated session series.
 * Every generated session carries `scheduleId` back to this document, so the
 * programme and the individual sittings are never unrelated records.
 */
const scheduleSchema = new mongoose.Schema(
  {
    scheduleNumber: { type: String, required: true, unique: true, index: true },

    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    dialysisPatientId: { type: mongoose.Schema.Types.ObjectId, ref: 'DialysisPatient', index: true },
    dialysisNumber: String,

    // ---- when
    startDate: { type: Date, required: true },
    endDate: { type: Date, default: null },
    timeOfDay: { type: String, default: '08:00' },
    slotDurationMinutes: { type: Number, default: 240 },
    preferredShift: { type: String, default: 'MORNING' },

    // ---- how often
    frequencyPerWeek: { type: Number, default: 3 },
    daysOfWeek: { type: [String], default: ['MON', 'WED', 'FRI'] },
    patternCode: { type: String, default: 'MWF' },
    patternLabel: String,

    // ---- where / who
    preferredMachineId: { type: mongoose.Schema.Types.ObjectId, ref: 'DialysisMachine', default: null },
    preferredStationId: { type: mongoose.Schema.Types.ObjectId, ref: 'DialysisStation', default: null },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', default: null },
    nurseId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    technicianId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    notes: String,
    statusReason: String,

    status: { type: String, enum: Object.values(RECURRING_STATUS), default: RECURRING_STATUS.DRAFT },
    autoGenerate: { type: Boolean, default: true },
    generateHorizonDays: { type: Number, default: 28 },

    totalPlanned: { type: Number, default: 0 },
    totalGenerated: { type: Number, default: 0 },
    lastGeneratedAt: Date,
    nextSessionDate: Date,
    generatedSessionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'DialysisSession' }],

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true, minimize: false },
);

scheduleSchema.index({ patientId: 1, status: 1 });
scheduleSchema.index({ status: 1, startDate: 1 });

export const DialysisSchedule = mongoose.model('DialysisSchedule', scheduleSchema);
export default DialysisSchedule;
