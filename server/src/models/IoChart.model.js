import mongoose from 'mongoose';

/**
 * IoChart — clinical intake / output record for an IPD admission.
 * Every entry is validated: volumes must be non-negative finite numbers.
 */
export const IO_INPUT_TYPES = ['ORAL', 'IV_FLUID', 'BLOOD', 'TUBE_FEED', 'OTHER_INPUT'];
export const IO_OUTPUT_TYPES = ['URINE', 'DRAIN', 'VOMITUS', 'STOOL', 'OTHER_OUTPUT'];
export const IO_SHIFTS = ['MORNING', 'EVENING', 'NIGHT'];

const ioEntrySchema = new mongoose.Schema(
  {
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IpdAdmission', required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },

    recordedAt: { type: Date, default: Date.now, index: true },
    entryDate: { type: String, index: true }, // YYYY-MM-DD for fast daily grouping
    hour: { type: Number, min: 0, max: 23 },
    shift: { type: String, enum: IO_SHIFTS, default: 'MORNING' },

    input: {
      oral: { type: Number, min: 0, default: 0 },
      ivFluid: { type: Number, min: 0, default: 0 },
      blood: { type: Number, min: 0, default: 0 },
      tubeFeed: { type: Number, min: 0, default: 0 },
      otherInput: { type: Number, min: 0, default: 0 },
    },
    output: {
      urine: { type: Number, min: 0, default: 0 },
      drain: { type: Number, min: 0, default: 0 },
      vomitus: { type: Number, min: 0, default: 0 },
      stool: { type: Number, min: 0, default: 0 },
      otherOutput: { type: Number, min: 0, default: 0 },
    },

    notes: String,
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

ioEntrySchema.index({ admissionId: 1, recordedAt: -1 });
ioEntrySchema.index({ admissionId: 1, entryDate: 1, hour: 1 });

export const ioEntryTotals = (e) => {
  const i = e.input || {};
  const o = e.output || {};
  return {
    inputTotal: ['oral', 'ivFluid', 'blood', 'tubeFeed', 'otherInput']
      .reduce((s, k) => s + (Number(i[k]) || 0), 0),
    outputTotal: ['urine', 'drain', 'vomitus', 'stool', 'otherOutput']
      .reduce((s, k) => s + (Number(o[k]) || 0), 0),
  };
};

export default mongoose.model('IoChartEntry', ioEntrySchema);
