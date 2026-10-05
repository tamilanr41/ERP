import mongoose from 'mongoose';

export const DIET_TYPES = {
  REGULAR: 'REGULAR',
  LIQUID: 'LIQUID',
  SOFT: 'SOFT',
  DIABETIC: 'DIABETIC',
  LOW_SALT: 'LOW_SALT',
  HIGH_PROTEIN: 'HIGH_PROTEIN',
  NPO: 'NPO',
  CUSTOM: 'CUSTOM',
};

export const MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACKS'];

export const MEAL_STATUS = {
  ORDERED: 'ORDERED',
  KITCHEN_REQUESTED: 'KITCHEN_REQUESTED',
  PREPARING: 'PREPARING',
  DISPATCHED: 'DISPATCHED',
  DELIVERED: 'DELIVERED',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  CANCELLED: 'CANCELLED',
};

/**
 * DietOrder — IPD diet prescription with a per-meal kitchen dispatch trail.
 * Diet charges are posted to the admission bill when the order is placed
 * (configurable per meal via chargePerDay).
 */
const dietOrderSchema = new mongoose.Schema(
  {
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IpdAdmission', required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },

    dietType: { type: String, enum: Object.values(DIET_TYPES), required: true },
    customDescription: String,
    instructions: String,

    orderDate: { type: Date, default: Date.now, index: true },
    validFrom: Date,
    validTill: Date,

    orderedByDoctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
    orderedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, default: MEAL_STATUS.ORDERED, index: true },

    chargePerDay: { type: Number, min: 0, default: 0 },
    billId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill' },
    billedAt: Date,

    meals: [
      {
        meal: { type: String, enum: MEAL_TYPES },
        items: String,
        status: { type: String, enum: Object.values(MEAL_STATUS), default: MEAL_STATUS.ORDERED },
        kitchenRequestedAt: Date,
        kitchenRequestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        preparingAt: Date,
        dispatchedAt: Date,
        deliveredAt: Date,
        deliveredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        acknowledgedAt: Date,
        acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        remarks: String,
      },
    ],

    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

dietOrderSchema.index({ admissionId: 1, orderDate: -1 });

export default mongoose.model('DietOrder', dietOrderSchema);
