import mongoose from 'mongoose';

/**
 * VitalRecord — one vitals measurement point for an OPD/IPD visit.
 * Kept as a separate collection (not embedded) so we can render history + trends
 * and record multiple readings per visit over time.
 */
export const VITAL_SOURCES = ['MANUAL', 'DEVICE', 'EMR_IMPORT', 'NURSE'];
export const VITAL_SOURCE = {
  MANUAL: 'MANUAL',
  DEVICE: 'DEVICE',
  EMR_IMPORT: 'EMR_IMPORT',
  NURSE: 'NURSE',
};

const vitalRecordSchema = new mongoose.Schema(
  {
    visitId: { type: mongoose.Schema.Types.ObjectId, ref: 'OpdVisit', index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IpdAdmission' },

    temperature: Number,          // °F
    bpSystolic: Number,
    bpDiastolic: Number,
    pulse: Number,
    respiratoryRate: Number,
    spo2: Number,
    heightCm: Number,
    weightKg: Number,
    bmi: Number,
    bloodSugar: Number,           // mg/dL
    painScore: { type: Number, min: 0, max: 10 },   // 0-10 subjective pain scale
    gcs: { type: Number, min: 3, max: 15 },         // Glasgow coma scale (3-15) where configured
    allergiesConfirmed: Boolean,          // nurse verified allergies with patient
    fallRisk: { type: String, enum: ['LOW', 'MODERATE', 'HIGH'] },
    priority: { type: String, enum: ['ROUTINE', 'URGENT', 'STAT'] },

    recordedAt: { type: Date, default: Date.now, index: true },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    source: { type: String, enum: VITAL_SOURCES, default: VITAL_SOURCE.MANUAL },
    notes: String,

    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

vitalRecordSchema.index({ visitId: 1, recordedAt: -1 });
vitalRecordSchema.index({ patientId: 1, recordedAt: -1 });

export default mongoose.model('VitalRecord', vitalRecordSchema);
