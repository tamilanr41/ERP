import mongoose from 'mongoose';

const buildingSchema = new mongoose.Schema(
  {
    name: String,
    floors: Number,
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
  },
  { timestamps: true },
);

const floorSchema = new mongoose.Schema(
  {
    buildingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Building' },
    name: String,
    level: Number,
  },
  { timestamps: true },
);

const wardSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    code: String,
    floorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Floor' },
    buildingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Building' },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    wardType: { type: String, enum: ['GENERAL', 'SEMI_PRIVATE', 'PRIVATE', 'ICU', 'NICU', 'PICU', 'EMERGENCY', 'OT', 'DELIVERY'], default: 'GENERAL' },
    roomCount: Number,
    bedCount: Number,
    chargePerDay: { type: Number, default: 0 },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const roomSchema = new mongoose.Schema(
  {
    roomNumber: { type: String, required: true },
    wardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ward', index: true },
    floorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Floor' },
    buildingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Building' },
    roomType: { type: String, enum: ['GENERAL', 'SEMI_PRIVATE', 'PRIVATE', 'ICU', 'NICU', 'PICU'], default: 'GENERAL' },
    chargePerDay: { type: Number, default: 0 },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const BED_STATUS = {
  AVAILABLE: 'AVAILABLE',
  OCCUPIED: 'OCCUPIED',
  RESERVED: 'RESERVED',
  CLEANING: 'CLEANING',
  MAINTENANCE: 'MAINTENANCE',
  BLOCKED: 'BLOCKED',
};

const bedSchema = new mongoose.Schema(
  {
    bedNumber: { type: String, required: true },
    code: { type: String, unique: true },
    wardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ward', index: true },
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
    floorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Floor' },
    buildingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Building' },
    bedType: { type: String, enum: ['GENERAL', 'SEMI_PRIVATE', 'PRIVATE', 'ICU', 'NICU', 'PICU', 'EMERGENCY'], default: 'GENERAL' },
    status: { type: String, enum: Object.values(BED_STATUS), default: BED_STATUS.AVAILABLE, index: true },
    chargePerDay: { type: Number, default: 0 },
    currentAdmissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IpdAdmission' },
    blockedReason: String,
  lastTurnoverAt: Date,
  turnoverBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

bedSchema.index({ wardId: 1, status: 1 });
bedSchema.index({ bedNumber: 1, status: 1 });

const bedHistorySchema = new mongoose.Schema(
  {
    bedId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bed', required: true, index: true },
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IpdAdmission' },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient' },
    action: { type: String, enum: ['ASSIGN', 'TRANSFER', 'RESERVE', 'RELEASE', 'CLEANING', 'MAINTENANCE', 'BLOCKED', 'AVAILABLE'] },
    from: String,
    to: String,
    reason: String,
    chargePerDay: Number,
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export const Building = mongoose.model('Building', buildingSchema);
export const Floor = mongoose.model('Floor', floorSchema);
export const Ward = mongoose.model('Ward', wardSchema);
export const Room = mongoose.model('Room', roomSchema);
export const Bed = mongoose.model('Bed', bedSchema);
export const BedHistory = mongoose.model('BedHistory', bedHistorySchema);

export default Bed;