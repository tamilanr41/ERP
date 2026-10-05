import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    prefix: { type: String, required: true },
    year: { type: Number, required: true },
    seq: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export default mongoose.model('Counter', counterSchema);