import mongoose from 'mongoose';

const branchSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', index: true },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    name: { type: String, required: true },
    code: { type: String, uppercase: true },
    address: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      pincode: String,
      country: { type: String, default: 'India' },
    },
    phone: String,
    email: String,
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export default mongoose.model('Branch', branchSchema);