import mongoose from 'mongoose';

/**
 * PatientIdentifier — every external identifier a patient carries (UHID, ABHA,
 * Aadhaar, passport, insurance, corporate, scheme). Kept separate from the
 * patient so identity documents can be versioned and audited.
 */
const patientIdentifierSchema = new mongoose.Schema(
  {
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    identifierType: {
      type: String,
      enum: ['UHID', 'ABHA', 'AADHAAR', 'PAN', 'PASSPORT', 'VOTER_ID', 'DRIVING_LICENSE', 'INSURANCE', 'CORPORATE', 'GOVT_SCHEME', 'RATION_CARD', 'OTHER'],
      required: true,
      index: true,
    },
    identifierValue: { type: String, required: true, trim: true },
    issuingAuthority: String,
    validFrom: Date,
    validTill: Date,
    isPrimary: { type: Boolean, default: false },
    verified: { type: Boolean, default: false },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: String,
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

patientIdentifierSchema.index({ identifierType: 1, identifierValue: 1 }, { unique: true });
patientIdentifierSchema.index({ patientId: 1, identifierType: 1 });

export default mongoose.model('PatientIdentifier', patientIdentifierSchema);
