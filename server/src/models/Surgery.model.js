import mongoose from 'mongoose';

const otSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    code: String,
    location: String,
    equipment: [String],
    available: { type: Boolean, default: true },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const surgeryChecklistSchema = new mongoose.Schema({
  item: String,
  completed: { type: Boolean, default: false },
  completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  completedAt: Date,
  notes: String,
});

const surgerySchema = new mongoose.Schema(
  {
    surgeryNumber: { type: String, unique: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IpdAdmission' },
    opdVisitId: { type: mongoose.Schema.Types.ObjectId, ref: 'OpdVisit' },
    otId: { type: mongoose.Schema.Types.ObjectId, ref: 'OT' },
    procedure: { type: String, required: true },
    diagnosis: String,
    surgeonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
    assistantSurgeons: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' }],
    anaesthetistId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
    otStaff: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    scheduledStart: { type: Date, required: true, index: true },
    scheduledEnd: Date,
    actualStart: Date,
    actualEnd: Date,
    estimatedDurationMin: Number,
    urgency: { type: String, enum: ['ELECTIVE', 'URGENT', 'EMERGENCY'], default: 'ELECTIVE' },
    status: {
      type: String,
      enum: ['SCHEDULED', 'PRE_OP_COMPLETE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
      default: 'SCHEDULED',
    },
    preOpChecklist: [surgeryChecklistSchema],
    intraOpNotes: String,
    postOpNotes: String,
    findings: String,
    complications: String,
    consumables: [
      {
        itemName: String,
        quantity: Number,
        rate: Number,
        total: Number,
      },
    ],
    medicinesUsed: [
      {
        medicineName: String,
        quantity: Number,
        rate: Number,
      },
    ],
    billId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill' },
    bookedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

surgerySchema.index({ surgeonId: 1, scheduledStart: -1 });
surgerySchema.index({ otId: 1, scheduledStart: 1, status: 1 });

export default mongoose.model('Surgery', surgerySchema);
export const OT = mongoose.model('OT', otSchema);