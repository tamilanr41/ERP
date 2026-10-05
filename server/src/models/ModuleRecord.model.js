import mongoose from 'mongoose';

export const WORKFLOW_STATUS = Object.freeze({
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
});

export const WORKFLOW_PRIORITY = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
});

const moduleRecordSchema = new mongoose.Schema(
  {
    module: { type: String, required: true, index: true },
    workflow: { type: String, required: true, index: true },
    recordNumber: { type: String, unique: true, sparse: true },
    title: { type: String, required: true, trim: true },
    reference: String,
    assignee: String,
    priority: { type: String, enum: Object.values(WORKFLOW_PRIORITY), default: WORKFLOW_PRIORITY.MEDIUM, index: true },
    status: { type: String, enum: Object.values(WORKFLOW_STATUS), default: WORKFLOW_STATUS.PENDING, index: true },
    amount: { type: Number, default: 0 },
    quantity: { type: Number, default: 0 },
    scheduledDate: Date,
    dueDate: Date,
    notes: String,
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

moduleRecordSchema.index({ module: 1, workflow: 1, status: 1 });
moduleRecordSchema.index({ module: 1, updatedAt: -1 });

moduleRecordSchema.pre('save', function preSave(next) {
  if (!this.recordNumber) this.recordNumber = `WRK-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 9000 + 1000)}`;
  next();
});

export default mongoose.model('ModuleRecord', moduleRecordSchema);