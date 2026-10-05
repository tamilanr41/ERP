import mongoose from 'mongoose';

const idempotencyRecordSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    key: { type: String, required: true },
    method: String,
    path: String,
    requestHash: String,
    status: { type: String, enum: ['IN_PROGRESS', 'DONE'], default: 'IN_PROGRESS' },
    statusCode: Number,
    responseBody: mongoose.Schema.Types.Mixed,
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

idempotencyRecordSchema.index({ userId: 1, key: 1 }, { unique: true });
idempotencyRecordSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('IdempotencyRecord', idempotencyRecordSchema);