import mongoose from 'mongoose';

export const INVENTORY_TYPES = ['PHARMACY', 'GENERAL_STORE', 'SURGICAL', 'LAB_STORE', 'OT_STORE'];

export const STOCK_TXN_TYPES = [
  'PURCHASE_IN',
  'GRN',
  'ISSUE',
  'RETURN',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'ADJUSTMENT',
  'SALE_OUT',
  'SALE_RETURN_IN',
  'PURCHASE_RETURN_OUT',
  'EXPIRY_WRITE_OFF',
];

const inventoryItemSchema = new mongoose.Schema({
  itemName: { type: String, required: true },
  itemCode: { type: String },
  category: String,
  unit: String,
  inventoryType: { type: String, enum: INVENTORY_TYPES, default: 'GENERAL_STORE' },
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  reorderLevel: { type: Number, default: 0 },
  currentStock: { type: Number, default: 0 },
  rate: { type: Number, default: 0 },
  gstPct: { type: Number, default: 0 },
  hsnCode: String,
  expiryDate: Date,
  batchNumber: String,
  isConsumable: { type: Boolean, default: true },
  location: String,
  hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  active: { type: Boolean, default: true },
});

inventoryItemSchema.index({ itemName: 'text', itemCode: 1, category: 1 });

const stockTransactionSchema = new mongoose.Schema({
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true, index: true },
  referenceType: { type: String, enum: STOCK_TXN_TYPES, required: true },
  referenceId: mongoose.Schema.Types.ObjectId,
  quantity: { type: Number, required: true }, // signed (+in / -out)
  previousStock: Number,
  newStock: Number,
  batchNumber: String,
  rate: Number,
  notes: String,
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  transactionDate: { type: Date, default: Date.now, index: true },
  hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
});

stockTransactionSchema.index({ itemId: 1, transactionDate: -1 });

export default mongoose.model('InventoryItem', inventoryItemSchema);
export const StockTransaction = mongoose.model('StockTransaction', stockTransactionSchema);