import mongoose from 'mongoose';

const supplierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    code: String,
    type: { type: String, enum: ['MEDICINE', 'EQUIPMENT', 'GENERAL', 'SURGICAL', 'LAB', 'OT', 'OTHER'], default: 'MEDICINE' },
    contact: {
      person: String,
      phone: String,
      email: String,
    },
    address: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      pincode: String,
    },
    gstNumber: String,
    panNumber: String,
    bank: {
      accountNumber: String,
      ifsc: String,
      bankName: String,
    },
    outstanding: { type: Number, default: 0 },
    notes: String,
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

supplierSchema.index({ name: 'text', 'contact.phone': 1, gstNumber: 1 });

export default mongoose.model('Supplier', supplierSchema);