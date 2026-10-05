import mongoose from 'mongoose';

export const MACHINE_STATUS = {
  AVAILABLE: 'AVAILABLE',
  IN_USE: 'IN_USE',
  CLEANING: 'CLEANING',
  MAINTENANCE: 'MAINTENANCE',
  BLOCKED: 'BLOCKED',
  OUT_OF_SERVICE: 'OUT_OF_SERVICE',
  RESERVED: 'RESERVED',
  DECOMMISSIONED: 'DECOMMISSIONED',
};

export const MACHINE_TYPE = {
  HEMODIALYSIS: 'HEMODIALYSIS',
  CRRT: 'CRRT',
  HDF: 'HDF',
  PERITONEAL: 'PERITONEAL',
  MOBILE: 'MOBILE',
};

export const SERVICE_TYPE = {
  INSTALLATION: 'INSTALLATION',
  PREVENTIVE: 'PREVENTIVE',
  REPAIR: 'REPAIR',
  CALIBRATION: 'CALIBRATION',
  SOFTWARE_UPGRADE: 'SOFTWARE_UPGRADE',
  DEEP_CLEAN: 'DEEP_CLEAN',
  DECOMMISSION: 'DECOMMISSION',
};

/** Every intervention on a machine is kept, so "last/next maintenance" is evidence, not a guess. */
const serviceRecordSchema = new mongoose.Schema({
  at: { type: Date, default: Date.now },
  type: { type: String, enum: Object.values(SERVICE_TYPE), required: true },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  vendorName: String,
  engineerName: String,
  ticketNumber: String,
  details: String,
  partsReplaced: [String],
  machineStatusAfter: String,
  nextServiceDue: Date,
  downtimeMinutes: Number,
}, { _id: true });

/** A dialysis machine and the bay/station it is installed in. */
const machineSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, index: true },
    name: String,
    machineType: { type: String, enum: Object.values(MACHINE_TYPE), default: MACHINE_TYPE.HEMODIALYSIS },
    manufacturer: String,
    model: String,
    serialNumber: { type: String, unique: true, sparse: true, index: true, trim: true },
    softwareVersion: String,

    stationId: { type: mongoose.Schema.Types.ObjectId, ref: 'DialysisStation', index: true },
    location: String,
    capacity: { type: Number, default: 1 },

    status: { type: String, enum: Object.values(MACHINE_STATUS), default: MACHINE_STATUS.AVAILABLE },
    statusReason: String,
    statusChangedAt: Date,
    currentSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'DialysisSession' },

    dialyserType: String,
    maxBloodFlow: Number,
    installedOn: Date,
    lastServicedAt: Date,
    nextServiceDue: Date,
    serviceIntervalDays: { type: Number, default: 90 },
    warrantyEndsOn: Date,
    serviceHistory: [serviceRecordSchema],
    totalSessions: { type: Number, default: 0 },
    totalDialysisHours: { type: Number, default: 0 },

    active: { type: Boolean, default: true },
    // Set when the machine is retired from the roster. The record itself is
    // kept, because its service history and session numbers must stay auditable.
    decommissionedAt: Date,
    decommissionReason: String,
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

machineSchema.index({ status: 1, machineType: 1 });
machineSchema.index({ nextServiceDue: 1 });

export const DialysisMachine = mongoose.model('DialysisMachine', machineSchema);
export default DialysisMachine;
