import mongoose from 'mongoose';

export const APPOINTMENT_STATUS = {
  REQUESTED: 'REQUESTED',
  CONFIRMED: 'CONFIRMED',
  ARRIVED: 'ARRIVED',
  CHECKED_IN: 'CHECKED_IN',
  WAITING: 'WAITING',
  IN_CONSULTATION: 'IN_CONSULTATION',
  COMPLETED: 'COMPLETED',
  SKIPPED: 'SKIPPED',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'NO_SHOW',
  // legacy aliases kept for stored data
  SCHEDULED: 'SCHEDULED',
  IN_PROGRESS: 'IN_PROGRESS',
};

export const APPOINTMENT_FLOW = Object.freeze({
  REQUESTED: ['CONFIRMED', 'CANCELLED', 'NO_SHOW'],
  CONFIRMED: ['ARRIVED', 'CHECKED_IN', 'RESCHEDULED', 'CANCELLED', 'NO_SHOW'],
  ARRIVED: ['CHECKED_IN', 'WAITING', 'CANCELLED', 'NO_SHOW'],
  CHECKED_IN: ['WAITING', 'IN_CONSULTATION', 'CANCELLED', 'NO_SHOW'],
  WAITING: ['IN_CONSULTATION', 'CHECKED_IN', 'SKIPPED', 'CANCELLED', 'NO_SHOW'],
  IN_CONSULTATION: ['COMPLETED', 'CANCELLED', 'NO_SHOW'],
  COMPLETED: [],
  SKIPPED: ['WAITING', 'CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
  CANCELLED: [],
  NO_SHOW: ['ARRIVED', 'CHECKED_IN', 'WAITING', 'IN_CONSULTATION', 'COMPLETED'],
  SCHEDULED: ['CONFIRMED', 'CANCELLED', 'NO_SHOW'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
});

export const APPOINTMENT_TYPES = ['OPD', 'FOLLOW_UP', 'EMERGENCY', 'VIRTUAL', 'PROCEDURE'];

const appointmentSchema = new mongoose.Schema(
  {
    appointmentNumber: { type: String, unique: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true, index: true },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    date: { type: Date, required: true, index: true },
    time: { type: String }, // "HH:mm"
    slotNumber: Number,
    tokenNumber: { type: Number },
    type: { type: String, enum: APPOINTMENT_TYPES, default: 'OPD' },
    status: { type: String, enum: Object.values(APPOINTMENT_STATUS), default: APPOINTMENT_STATUS.REQUESTED, index: true },
    reason: String,
    symptoms: String,
    visitType: { type: String, enum: ['NEW', 'FOLLOW_UP', 'WALK_IN'], default: 'NEW' },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
    bookedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    checkedInAt: Date,
    checkedInBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    completedAt: Date,
    cancelledAt: Date,
    cancelledReason: String,
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    opdVisitId: { type: mongoose.Schema.Types.ObjectId, ref: 'OpdVisit' },
    reminderSent: Boolean,
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

appointmentSchema.index({ doctorId: 1, date: 1, time: 1 });
appointmentSchema.index({ doctorId: 1, date: 1, status: 1 });
appointmentSchema.index({ hospitalId: 1, date: 1, status: 1 });

export default mongoose.model('Appointment', appointmentSchema);