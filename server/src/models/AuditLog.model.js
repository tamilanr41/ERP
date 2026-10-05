import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    username: String,
    roleCode: String,
    action: { type: String, required: true },
    module: { type: String, required: true, index: true },
    entityId: String,
    entityType: String,
    data: mongoose.Schema.Types.Mixed, // { before, after }
    ip: String,
    userAgent: String,
    method: String,
    path: String,
    statusCode: Number,
    timestamp: { type: Date, default: Date.now, index: true },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

auditLogSchema.index({ user: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, module: 1, timestamp: -1 });
auditLogSchema.index({ entityId: 1, entityType: 1 });
auditLogSchema.index({ timestamp: -1 });

// Audit logs are append-only. disable remove/delete on normal context
auditLogSchema.pre('deleteOne', { document: false, query: true }, function forbidDelete() {
  const error = new Error('Audit logs cannot be deleted');
  error.auditProtected = true;
  throw error;
});

export default mongoose.model('AuditLog', auditLogSchema);