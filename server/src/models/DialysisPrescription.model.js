import mongoose from 'mongoose';

export const PRESCRIPTION_STATUS = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  MODIFIED: 'MODIFIED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
};

/**
 * DialysisPrescription — the nephrologist's written dialysis order.
 * A session always stores a snapshot so historical sessions stay readable
 * even after the prescription is later modified.
 */
const prescriptionSchema = new mongoose.Schema(
  {
    prescriptionNumber: { type: String, unique: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    dialysisPatientId: { type: mongoose.Schema.Types.ObjectId, ref: 'DialysisPatient', index: true },

    prescribedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
    prescribedByName: String,
    prescribedAt: { type: Date, default: Date.now },
    reviewDate: { type: Date, default: null },

    // ---- auditable version chain (spec 7): nothing is ever overwritten
    version: { type: Number, default: 1 },
    previousPrescriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'DialysisPrescription', default: null },
    supersededById: { type: mongoose.Schema.Types.ObjectId, ref: 'DialysisPrescription', default: null },
    activatedAt: { type: Date, default: null },
    suspendedAt: { type: Date, default: null },
    suspendedReason: { type: String, default: null },
    statusReason: { type: String, default: null },
    changeNote: { type: String, default: null },

    modality: { type: String, default: 'HEMODIALYSIS' },

    // prescription parameters
    durationMinutes: { type: Number, default: 240 },
    frequencyPerWeek: { type: Number, default: 2 },
    bloodFlowRate: { type: Number, default: 300 },      // ml/min
    dialysateFlowRate: { type: Number, default: 500 },  // ml/min
    dialysateCalcium: { type: String, default: null },
    dialysatePotassium: { type: Number, default: null },
    dialysateSodium: { type: Number, default: null },
    dialysateTemperature: { type: Number, default: null },
    dialyserType: { type: String, default: null },
    filterType: { type: String, default: null },

    targetDryWeightKg: { type: Number, default: null },
    ultrafiltrationGoalMl: { type: Number, default: null },
    maxUltrafiltrationMl: { type: Number, default: null },
    heparinPrimeUnits: { type: Number, default: null },
    heparinMaintenanceUnits: { type: Number, default: null },
    heparinProtocol: { type: String, default: null },
    anticoagulation: { type: String, default: null },
    potassiumTarget: { type: String, default: null },

    // ---- access + medication orders carried on the prescription (spec 7)
    accessType: { type: String, default: null },
    accessSide: { type: String, enum: ['LEFT', 'RIGHT', 'NOT_APPLICABLE', null], default: null },
    accessSite: { type: String, default: null },
    medicationOrders: [new mongoose.Schema({
      name: String,
      dose: String,
      frequency: String,
      route: String,
      timing: String,
      note: String,
    }, { _id: true })],
    specialInstructions: { type: String, default: null },

    // pre/post checks required by this prescription
    preChecklist: {
      weight: { type: Boolean, default: true },
      bp: { type: Boolean, default: true },
      accessSite: { type: Boolean, default: true },
      labs: { type: Boolean, default: true },
    },
    requiredLabs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'LabTest' }],

    status: { type: String, enum: Object.values(PRESCRIPTION_STATUS), default: PRESCRIPTION_STATUS.ACTIVE },
    notes: String,

    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true, minimize: false },
);

prescriptionSchema.index({ patientId: 1, status: 1, prescribedAt: -1 });

export const DialysisPrescription = mongoose.model('DialysisPrescription', prescriptionSchema);
export default DialysisPrescription;
