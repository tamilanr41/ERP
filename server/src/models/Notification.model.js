import mongoose from 'mongoose';

export const NOTIFICATION_TYPES = {
  APPOINTMENT: 'APPOINTMENT',
  LAB_RESULT: 'LAB_RESULT',
  CRITICAL_LAB_RESULT: 'CRITICAL_LAB_RESULT',
  PAYMENT_DUE: 'PAYMENT_DUE',
  LOW_STOCK: 'LOW_STOCK',
  MEDICINE_EXPIRY: 'MEDICINE_EXPIRY',
  INSURANCE_APPROVAL: 'INSURANCE_APPROVAL',
  BED_AVAILABILITY: 'BED_AVAILABILITY',
  DISCHARGE: 'DISCHARGE',
  TASK: 'TASK',
};

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    roleCode: { type: String, index: true }, // broadcast to a role when user is null
    type: { type: String, enum: Object.values(NOTIFICATION_TYPES), required: true },
    title: { type: String, required: true },
    message: String,
    severity: { type: String, enum: ['INFO', 'SUCCESS', 'WARNING', 'CRITICAL'], default: 'INFO' },
    link: String,
    referenceType: String,
    referenceId: mongoose.Schema.Types.ObjectId,
    read: { type: Boolean, default: false },
    readAt: Date,
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

notificationSchema.index({ user: 1, read: 1, createdAt: -1 });
notificationSchema.index({ roleCode: 1, read: 1, createdAt: -1 });

export default mongoose.model('Notification', notificationSchema);