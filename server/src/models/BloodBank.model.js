import mongoose from 'mongoose';

const bloodDonorSchema = new mongoose.Schema(
  {
    donorNumber: { type: String, unique: true },
    name: { type: String, required: true },
    age: Number,
    gender: { type: String, enum: ['MALE', 'FEMALE', 'OTHER'] },
    bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], required: true },
    phone: String,
    email: String,
    address: String,
    lastDonationDate: Date,
    totalDonations: { type: Number, default: 0 },
    medicalClearance: Boolean,
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const bloodCollectionSchema = new mongoose.Schema(
  {
    collectionNumber: { type: String, unique: true },
    donorId: { type: mongoose.Schema.Types.ObjectId, ref: 'BloodDonor' },
    donorName: String,
    bloodGroup: { type: String, required: true },
    component: {
      type: String,
      enum: ['WHOLE_BLOOD', 'PACKED_RBC', 'PLATELETS', 'FRESH_FROZEN_PLASMA', 'CRYOPRECIPITATE'],
      default: 'WHOLE_BLOOD',
    },
    collectionDate: { type: Date, default: Date.now },
    expiryDate: { type: Date, required: true, index: true },
    units: { type: Number, default: 1 },
    bloodGroupVerified: Boolean,
    hivTested: Boolean,
    hepatitisTested: Boolean,
    collectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['AVAILABLE', 'ISSUED', 'EXPIRED', 'DISCARDED', 'RESERVED'], default: 'AVAILABLE' },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

const bloodIssuanceSchema = new mongoose.Schema(
  {
    issueNumber: { type: String, unique: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient' },
    collectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'BloodCollection' },
    bloodGroup: String,
    component: String,
    units: Number,
    issueDate: { type: Date, default: Date.now },
    crossMatchResult: { type: String, enum: ['COMPATIBLE', 'INCOMPATIBLE', 'NOT_DONE'], default: 'NOT_DONE' },
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    transfusionNotes: String,
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

export default mongoose.model('BloodDonor', bloodDonorSchema);
export const BloodCollection = mongoose.model('BloodCollection', bloodCollectionSchema);
export const BloodIssuance = mongoose.model('BloodIssuance', bloodIssuanceSchema);