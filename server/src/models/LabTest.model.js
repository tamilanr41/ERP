import mongoose from 'mongoose';

const labTestSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    code: { type: String },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'LabCategory' },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    sampleType: String,
    container: String,
    price: { type: Number, default: 0 },
    turnaroundHours: Number,
    parameters: [
      {
        name: String,
        unit: String,
        normalRange: String, // example: "4.5 - 11"
        normalRangeLow: Number,
        normalRangeHigh: Number,
        genderSpecific: { type: String, enum: ['MALE', 'FEMALE', 'ALL'], default: 'ALL' },
        ageMinYears: Number,
        ageMaxYears: Number,
        lowerBoundCritical: Number,
        upperBoundCritical: Number,
      },
    ],
    hasSubTests: { type: Boolean, default: false },
    subTests: [String],
    active: { type: Boolean, default: true },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

labTestSchema.index({ name: 'text', code: 'text' });

const labCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    description: String,
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
  },
  { timestamps: true },
);

export const LabCategory = mongoose.model('LabCategory', labCategorySchema);
export default mongoose.model('LabTest', labTestSchema);