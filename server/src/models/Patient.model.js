import mongoose from 'mongoose';

const addressSchema = {
  line1: String,
  line2: String,
  area: String,
  city: String,
  district: String,
  state: String,
  pincode: String,
  country: { type: String, default: 'India' },
};

const patientSchema = new mongoose.Schema(
  {
    uhid: { type: String, required: true, unique: true },
    registrationNumber: { type: String, unique: true, sparse: true },
    firstName: { type: String, required: true },
    middleName: { type: String },
    lastName: { type: String },
    dateOfBirth: { type: Date },
    age: {
      years: Number,
      months: Number,
      days: Number,
    },
    gender: { type: String, enum: ['MALE', 'FEMALE', 'OTHER'], required: true },
    bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'UNKNOWN'], default: 'UNKNOWN' },
    mobile: { type: String, required: true, index: true },
    alternatePhone: String,
    email: String,
    address: addressSchema,
    occupation: String,
    maritalStatus: { type: String, enum: ['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'OTHER'] },
    emergencyContact: {
      name: String,
      relation: String,
      phone: String,
    },
    idProof: {
      type: { type: String, enum: ['AADHAAR', 'PAN', 'PASSPORT', 'DRIVING_LICENSE', 'VOTER_ID', 'OTHER'] },
      number: String,
    },
    abhaId: String,
    photo: String,
    allergies: [String],
    medicalHistory: [String],
    surgicalHistory: [String],
    familyHistory: [String],
    currentMedications: [String],
    specialAlerts: [String],
    registrationDate: { type: Date, default: Date.now },
    registeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'MERGED'], default: 'ACTIVE' },
    mergedInto: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient' },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

patientSchema.methods.fullName = function () {
  return [this.firstName, this.lastName].filter(Boolean).join(' ');
};

patientSchema.index({ firstName: 1, lastName: 1 });
patientSchema.index({ uhid: 1, mobile: 1, 'idProof.number': 1 });
patientSchema.index({ 'idProof.number': 1 });
patientSchema.index({
  uhid: 'text',
  firstName: 'text',
  lastName: 'text',
  mobile: 'text',
  email: 'text',
  'idProof.number': 'text',
});

export default mongoose.model('Patient', patientSchema);