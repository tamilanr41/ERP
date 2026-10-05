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
  RESCHEDULED: 'RESCHEDULED',
  // legacy aliases kept for stored data
  SCHEDULED: 'SCHEDULED',
  IN_PROGRESS: 'IN_PROGRESS',
};

export const CONSULTATION_MODES = ['IN_PERSON', 'TELEMEDICINE'];

export const APPOINTMENT_TYPES = ['OPD', 'FOLLOW_UP', 'EMERGENCY', 'VIRTUAL', 'PROCEDURE'];

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
  // A reschedule is not terminal: the moved slot can still be confirmed, and the
  // original date and time are preserved on rescheduledFrom.
  RESCHEDULED: ['CONFIRMED', 'ARRIVED', 'CHECKED_IN', 'WAITING', 'CANCELLED', 'NO_SHOW'],
  SCHEDULED: ['CONFIRMED', 'CANCELLED', 'NO_SHOW'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
});

export const APPOINTMENT_PAYMENT_STATUS = {
  UNBILLED: 'UNBILLED',
  UNPAID: 'UNPAID',
  PARTIAL: 'PARTIAL',
  PAID: 'PAID',
  WAIVED: 'WAIVED',
  REFUNDED: 'REFUNDED',
};

/**
 * Every status transition is appended here. The live `status` field only records
 * where an appointment is now; without this list a cancellation reason or the
 * moment a consultation actually started cannot be reconstructed afterwards,
 * which is what a medico-legal record of a teleconsultation requires.
 */
const statusHistorySchema = new mongoose.Schema(
  {
    from: String,
    to: { type: String, required: true },
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reason: String,
  },
  { _id: false },
);

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
    // TELEMEDICINE drives the remote-consult path: room lifecycle, consent and
    // the payment gate. IN_PERSON is the default so existing rows keep working.
    consultationMode: { type: String, enum: CONSULTATION_MODES, default: 'IN_PERSON', index: true },
    status: { type: String, enum: Object.values(APPOINTMENT_STATUS), default: APPOINTMENT_STATUS.REQUESTED, index: true },
    statusHistory: { type: [statusHistorySchema], default: [] },
    reason: String,
    symptoms: String,
    visitType: { type: String, enum: ['NEW', 'FOLLOW_UP', 'WALK_IN'], default: 'NEW' },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
    bookedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // Fee is snapshotted at booking. Doctor.consultationFee can change later, and
    // a bill raised after a price change must still charge what the patient was
    // quoted when they booked.
    consultationFee: { type: Number, default: 0 },
    feeOverriddenBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    billId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill' },
    paymentStatus: {
      type: String,
      enum: Object.values(APPOINTMENT_PAYMENT_STATUS),
      default: APPOINTMENT_PAYMENT_STATUS.UNBILLED,
    },
    paidAmount: { type: Number, default: 0 },
    checkedInAt: Date,
    checkedInBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    consultationStartedAt: Date,
    consultationEndedAt: Date,
    consultationEndedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    completedAt: Date,
    cancelledAt: Date,
    cancelledReason: String,
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rescheduledFrom: { type: String }, // "YYYY-MM-DD HH:mm" the slot it moved off
    // Teleconsultation room. roomId is the signalling room key; no media or
    // recording is implied by its presence.
    roomId: { type: String, index: true },
    roomOpenedAt: Date,
    roomClosedAt: Date,
    patientJoinedAt: Date,
    doctorJoinedAt: Date,
    consent: {
      videoConsent: { type: Boolean, default: false },
      recordedAt: Date,
      recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      // Telehealth data crosses a network boundary, so who accepted and from
      // where is retained alongside the consultation timestamps.
      ip: String,
    },
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
appointmentSchema.index({ consultationMode: 1, date: 1, status: 1 });

export default mongoose.model('Appointment', appointmentSchema);