import mongoose from 'mongoose';

/**
 * ExaminationTemplate — configurable clinical-examination templates per specialty.
 * Each template carries ordered sections (e.g. general, system, physical, vitals
 * summary, findings) and, per section, an ordered set of fields. Fields may be
 * plain text, textarea, select (with options), or a special `vitals` type that
 * renders the latest recorded vitals read-only.
 */
const examTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    specialty: { type: String, required: true, index: true },
    description: String,

    sections: [
      {
        key: { type: String, required: true },
        title: { type: String, required: true },
        order: Number,
        fields: [
          {
            key: { type: String, required: true },
            label: { type: String, required: true },
            type: { type: String, enum: ['text', 'textarea', 'select', 'vitals'], default: 'textarea' },
            options: [String],
            placeholder: String,
          },
        ],
      },
    ],

    isActive: { type: Boolean, default: true },

    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

examTemplateSchema.index({ specialty: 1, isActive: 1 });

export default mongoose.model('ExaminationTemplate', examTemplateSchema);