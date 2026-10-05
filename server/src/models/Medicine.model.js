import mongoose from 'mongoose';

const medicineSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    genericName: String,
    brand: String,
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicineCategory' },
    manufacturer: { type: mongoose.Schema.Types.ObjectId, ref: 'Manufacturer' },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
    unit: { type: String, default: 'TAB' },
    packSize: String,
    hsnCode: String,
    gstPct: { type: Number, default: 0 },
    reorderLevel: { type: Number, default: 0 },
    maxStock: Number,
    storageConditions: String,
    isControlled: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true },
);

medicineSchema.index({ name: 'text', genericName: 'text', brand: 'text' });
medicineSchema.index({ name: 1, genericName: 1 });

export default mongoose.model('Medicine', medicineSchema);

const medicineCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    description: String,
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
  },
  { timestamps: true },
);

const manufacturerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    contact: String,
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
  },
  { timestamps: true },
);

export const MedicineCategory = mongoose.model('MedicineCategory', medicineCategorySchema);
export const Manufacturer = mongoose.model('Manufacturer', manufacturerSchema);