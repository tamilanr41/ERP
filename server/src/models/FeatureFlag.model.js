import mongoose from 'mongoose';

const featureFlagSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    name: String,
    description: String,
    category: { type: String, enum: ['CLINICAL', 'FINANCE', 'PLATFORM', 'SAAS', 'INTEGRATION', 'AI'], default: 'PLATFORM' },
    enabled: { type: Boolean, default: true },
    defaultValue: { type: Boolean, default: true },
    auditable: { type: Boolean, default: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export default mongoose.model('FeatureFlag', featureFlagSchema);