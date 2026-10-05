import mongoose from 'mongoose';

const doctorSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    doctorCode: { type: String, unique: true },
    name: { type: String, required: true },
    qualification: [String],
    specialization: String,
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', index: true },
    registrationNumber: { type: String },
    consultationFee: { type: Number, default: 0 },
    followUpFee: { type: Number, default: 0 },
    commissionPct: { type: Number, default: 0 }, // for referral commission config
    opdTiming: {
      start: String,
      end: String,
    },
    availableDays: [{ type: Number, min: 0, max: 6 }], // 0=Sunday ... 6=Saturday
    availability: { type: Boolean, default: true },
    contact: {
      phone: String,
      email: String,
    },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

doctorSchema.index({ name: 'text', specialization: 'text', doctorCode: 'text' });

export default mongoose.model('Doctor', doctorSchema);