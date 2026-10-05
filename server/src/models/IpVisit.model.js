import mongoose from 'mongoose';

/**
 * IpVisit — the encounter view of an admission: a single inpatient "visit" that
 * owns the bed allocation, clinical records, orders, services, billing and
 * discharge. The admission record and this visit share the same identity; the
 * visit carries the operational lifecycle used by reports and the timeline.
 */
const ipVisitSchema = new mongoose.Schema(
  {
    visitNumber: { type: String, unique: true, index: true },
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IpdAdmission', required: true, unique: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },

    admittedAt: { type: Date, default: Date.now, index: true },
    dischargedAt: Date,
    expectedDischargeAt: Date,

    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', index: true },
    consultantDoctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', index: true },

    wardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ward' },
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
    bedId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bed' },

    status: {
      type: String,
      enum: ['PLANNED', 'ADMITTED', 'IN_TREATMENT', 'DISCHARGE_PLANNED', 'DISCHARGED', 'CANCELLED'],
      default: 'PLANNED',
      index: true,
    },
    lengthOfStayDays: Number,

    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

ipVisitSchema.index({ patientId: 1, admittedAt: -1 });
ipVisitSchema.index({ status: 1, admittedAt: -1 });

export default mongoose.model('IpVisit', ipVisitSchema);
