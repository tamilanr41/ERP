import mongoose from 'mongoose';

const hospitalSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', index: true },
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true, uppercase: true },
    logo: { type: String },
    address: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      pincode: String,
      country: { type: String, default: 'India' },
    },
    phone: { type: String },
    email: { type: String },
    website: { type: String },
    gstNumber: { type: String },
    panNumber: { type: String },
    registrationNumber: { type: String },
    nabhAccreditation: { type: String },
    emergencyContact: { type: String },
    billing: {
      invoicePrefix: { type: String, default: 'BILL' },
      receiptPrefix: { type: String, default: 'REC' },
      patientIdPrefix: { type: String, default: 'UHID' },
      admissionPrefix: { type: String, default: 'IPD' },
      opdPrefix: { type: String, default: 'OPD' },
      defaultDiscountPct: { type: Number, default: 0 },
      taxInclusive: { type: Boolean, default: false },
    },
    tax: {
      defaultGstPct: { type: Number, default: 0 },
      currency: { type: String, default: 'INR' },
      currencySymbol: { type: String, default: '₹' },
    },
    timezone: { type: String, default: 'Asia/Kolkata' },
    prescriptionSettings: {
      autoRxNumber: { type: Boolean, default: true },
      rxPrefix: { type: String, default: 'RX' },
      showHospitalHeader: { type: Boolean, default: true },
    },
    reportSettings: {
      footer: String,
      showLogo: { type: Boolean, default: true },
    },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export default mongoose.model('Hospital', hospitalSchema);