import mongoose from 'mongoose';

const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    legalName: String,
    code: { type: String, unique: true, uppercase: true },
    type: { type: String, enum: ['HOSPITAL_GROUP', 'MULTI_SPECIALTY', 'SINGLE_HOSPITAL', 'CLINIC', 'OTHER'], default: 'SINGLE_HOSPITAL' },
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
    website: String,
    gstNumber: String,
    panNumber: String,
    // SaaS / subscription
    plan: { type: String, enum: ['STARTER', 'PROFESSIONAL', 'ENTERPRISE', 'TRIAL'], default: 'TRIAL' },
    status: { type: String, enum: ['ACTIVE', 'SUSPENDED', 'CANCELLED'], default: 'ACTIVE' },
    subscriptionExpiresAt: Date,
    maxHospitals: { type: Number, default: 1 },
    featureFlags: { type: Map, of: Boolean },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export default mongoose.model('Organization', organizationSchema);