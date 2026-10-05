import mongoose from 'mongoose';

const employeeSchema = new mongoose.Schema(
  {
    employeeCode: { type: String, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    firstName: { type: String, required: true },
    lastName: { type: String },
    gender: { type: String, enum: ['MALE', 'FEMALE', 'OTHER'] },
    dateOfBirth: Date,
    category: {
      type: String,
      enum: ['DOCTOR', 'NURSE', 'TECHNICIAN', 'PHARMACIST', 'RECEPTIONIST', 'ADMIN', 'SUPPORT_STAFF', 'MANAGEMENT'],
      required: true,
    },
    designation: String,
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    phone: String,
    email: String,
    address: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      pincode: String,
    },
    joiningDate: Date,
    resignationDate: Date,
    salary: {
      basic: Number,
      allowances: Number,
      deductions: Number,
      monthlyPay: Number,
    },
    bank: {
      accountNumber: String,
      ifsc: String,
      bankName: String,
    },
    idProof: {
      type: { type: String },
      number: String,
    },
    documents: [String],
    status: {
      type: String,
      enum: ['ACTIVE', 'ON_LEAVE', 'RESIGNED', 'TERMINATED'],
      default: 'ACTIVE',
    },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

employeeSchema.index({ employeeCode: 1, firstName: 1, lastName: 1, phone: 1 });

export default mongoose.model('Employee', employeeSchema);