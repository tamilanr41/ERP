import mongoose from 'mongoose';

export const STATION_STATUS = {
  AVAILABLE: 'AVAILABLE',
  OCCUPIED: 'OCCUPIED',
  CLEANING: 'CLEANING',
  RESERVED: 'RESERVED',
  BLOCKED: 'BLOCKED',
  MAINTENANCE: 'MAINTENANCE',
};

export const STATION_KIND = {
  BED: 'BED',
  CHAIR: 'CHAIR',
  STATION: 'STATION',
};

/** A physical dialysis bay — the unit a machine occupies and a patient sits in. */
const stationSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, index: true },
    name: String,
    // a dialysis chair is not a ward bed — the distinction drives cleaning rota,
    // linen sets and the billing of bed vs chair occupancy
    bedOrChair: { type: String, enum: Object.values(STATION_KIND), default: STATION_KIND.CHAIR },
    area: String,
    floor: String,
    wardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ward' },

    status: { type: String, enum: Object.values(STATION_STATUS), default: STATION_STATUS.AVAILABLE },
    statusReason: String,
    statusChangedAt: Date,
    currentSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'DialysisSession' },
    machineId: { type: mongoose.Schema.Types.ObjectId, ref: 'DialysisMachine' },
    notes: String,

    totalSessions: { type: Number, default: 0 },
    lastTurnoverAt: Date,

    active: { type: Boolean, default: true },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
  },
  { timestamps: true },
);

stationSchema.index({ status: 1, area: 1 });

export const DialysisStation = mongoose.model('DialysisStation', stationSchema);
export default DialysisStation;
