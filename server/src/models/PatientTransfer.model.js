import mongoose from 'mongoose';

export const TRANSFER_TYPES = {
  WARD: 'WARD',
  ICU: 'ICU',
  OT: 'OT',
  RADIOLOGY: 'RADIOLOGY',
  LAB: 'LAB',
  ANOTHER_HOSPITAL: 'ANOTHER_HOSPITAL',
};

export const TRANSFER_STATUS = {
  REQUESTED: 'REQUESTED',
  APPROVED: 'APPROVED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
};

export const TRANSPORT_MODES = ['AMBULANCE', 'CAB', 'WHEELCHAIR', 'STRETCHER', 'WALKING', 'NEONATAL_AMBULANCE', 'BLUE_LIGHT'];

/**
 * PatientTransfer — movement of an admitted patient between wards, units or
 * hospitals. Intra-hospital transfers may move the bed allocation; transfers
 * out of the hospital release the bed.
 */
const patientTransferSchema = new mongoose.Schema(
  {
    transferNumber: { type: String, unique: true, index: true },
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IpdAdmission', required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    admissionNumber: String,
    patientName: String,

    transferType: { type: String, enum: Object.values(TRANSFER_TYPES), required: true, index: true },

    from: {
      wardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ward' },
      wardName: String,
      roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
      roomNumber: String,
      bedId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bed' },
      bedNumber: String,
    },
    to: {
      wardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ward' },
      wardName: String,
      roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
      roomNumber: String,
      bedId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bed' },
      bedNumber: String,
      hospitalName: String,
      hospitalAddress: String,
      contactNumber: String,
      contactPerson: String,
    },

    reason: String,
    clinicalNotes: String,
    transportMode: { type: String, enum: TRANSPORT_MODES, default: 'AMBULANCE' },
    vehicleNumber: String,
    attendantName: String,
    attendantPhone: String,
    attendantRelation: String,
    nurseId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    requestedAt: { type: Date, default: Date.now, index: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    rejectedReason: String,
    departedAt: Date,
    arrivedAt: Date,
    completedAt: Date,

    status: { type: String, enum: Object.values(TRANSFER_STATUS), default: TRANSFER_STATUS.REQUESTED, index: true },
    bedReleased: { type: Boolean, default: false },
    bedAllocated: { type: Boolean, default: false },

    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

patientTransferSchema.index({ admissionId: 1, requestedAt: -1 });
patientTransferSchema.index({ status: 1, transferType: 1 });

export default mongoose.model('PatientTransfer', patientTransferSchema);
