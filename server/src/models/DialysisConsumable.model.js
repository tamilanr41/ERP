import mongoose from 'mongoose';

export const CONSUMABLE_CATEGORIES = {
  LINE_SET: 'LINE_SET',
  DIALYSER: 'DIALYSER',
  HEPARIN: 'HEPARIN',
  CANNULA: 'CANNULA',
  DRUG: 'DRUG',
  DRESSING: 'DRESSING',
  ANTICOAGULANT: 'ANTICOAGULANT',
  SALINE: 'SALINE',
  BLOOD_PRODUCT: 'BLOOD_PRODUCT',
  OTHER: 'OTHER',
};

/**
 * Dialysis consumable catalogue with live stock.
 * Stock is reduced with a conditional atomic update at issue time so two
 * machines can never consume the same batch twice.
 *
 * `category` is deliberately not an enum. Spec 23 requires the catalogue to be
 * configurable per hospital, and the categories a unit stocks vary widely. The
 * list below is only the seed vocabulary offered in the UI; the vocabulary in
 * force for a given unit comes from its DialysisConfig.
 */
const consumableSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    category: { type: String, default: CONSUMABLE_CATEGORIES.OTHER },
    unit: { type: String, default: 'unit' },
    unitCost: { type: Number, default: 0 },
    chargeRate: { type: Number, default: 0 },
    billable: { type: Boolean, default: true },

    stockQty: { type: Number, default: 0 },
    reorderLevel: { type: Number, default: 0 },
    batchNumber: String,
    expiryDate: Date,
    supplier: String,

    movements: [{
      type: { type: String, enum: ['PURCHASE', 'ISSUE', 'RETURN', 'ADJUSTMENT', 'WASTAGE', 'EXPIRY'], required: true },
      quantity: Number,
      balanceAfter: Number,
      referenceType: String,
      referenceId: { type: mongoose.Schema.Types.ObjectId },
      sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'DialysisSession' },
      patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient' },
      /**
       * Idempotency token for an issue. The UI sends one per trolley line; a
       * retried request carrying a token that is already on the ledger is
       * recognised and not deducted a second time (spec 24).
       */
      movementKey: String,
      reason: String,
      at: { type: Date, default: Date.now },
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    }],

    active: { type: Boolean, default: true },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
  },
  { timestamps: true },
);

consumableSchema.index({ category: 1, active: 1 });
consumableSchema.index({ 'movements.movementKey': 1 }, { sparse: true });

export const DialysisConsumable = mongoose.model('DialysisConsumable', consumableSchema);
export default DialysisConsumable;
