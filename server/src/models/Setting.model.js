import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema(
  {
    group: { type: String, required: true, index: true }, // general | hospital | billing | tax | pharmacy | lab | radiology | notifications | numbering | print
    key: { type: String, required: true },
    value: mongoose.Schema.Types.Mixed,
    description: String,
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
  },
  { timestamps: true },
);

settingsSchema.index({ group: 1, key: 1, hospitalId: 1 }, { unique: true });

export default mongoose.model('Setting', settingsSchema);