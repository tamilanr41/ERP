import mongoose from 'mongoose';

export const MED_ADMIN_STATUS = {
  SCHEDULED: 'SCHEDULED',
  GIVEN: 'GIVEN',
  MISSED: 'MISSED',
  HELD: 'HELD',
  REFUSED: 'REFUSED',
  CANCELLED: 'CANCELLED',
};

const medicationChartSchema = new mongoose.Schema(
  {
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IpdAdmission', index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine' },
    medicineName: { type: String, required: true },
    genericName: String,
    strength: String,
    dosage: String,
    route: String,
    frequency: String,
    duration: String,
    frequencyTiming: String,
    startDate: Date,
    endDate: Date,
    instructions: String,
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', index: true },
  orderedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    prescribedAt: { type: Date, default: Date.now },
    administrations: [
      {
        scheduledTime: { type: Date, index: true },
        givenTime: Date,
        status: { type: String, enum: Object.values(MED_ADMIN_STATUS), default: MED_ADMIN_STATUS.SCHEDULED },
        administeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        scheduledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        note: String,
        remark: String,
        doseGiven: String,
      },
    ],
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

export default mongoose.model('MedicationChart', medicationChartSchema);