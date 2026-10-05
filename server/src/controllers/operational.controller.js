import { success, created } from '../utils/apiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { writeAudit } from '../middleware/audit.js';

// ===== EMERGENCY =====
export const createEmergencyController = asyncHandler(async (req, res) => {
  const Emergency = (await import('../models/Emergency.model.js')).default;
  const { generateNumber, NUMBER_PREFIXES } = await import('../utils/numberGenerator.js');
  const patient = req.body.patientId ? await (await import('../models/Patient.model.js')).default.findById(req.body.patientId) : null;

  const emergency = await Emergency.create({
    ...req.body,
    emergencyNumber: await generateNumber('EMG', new Date().getFullYear()),
    patientId: req.body.patientId,
    registeredAt: new Date(),
    hospitalId: req.user.hospitalId,
    branchId: req.user.branchId,
  });
  await writeAudit({ user: req.user, action: 'EMERGENCY_CREATE', module: 'emergency', entityId: emergency._id, entityType: 'Emergency', req });
  created(res, emergency, 'Emergency registered');
});

export const listEmergencyController = asyncHandler(async (req, res) => {
  const Emergency = (await import('../models/Emergency.model.js')).default;
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.triageLevel) filter.triageLevel = req.query.triageLevel;
  const [total, data] = await Promise.all([
    Emergency.countDocuments(filter),
    Emergency.find(filter).populate('patientId', 'uhid firstName lastName mobile gender photo age').sort({ registeredAt: -1 }).skip((page - 1) * limit).limit(limit),
  ]);
  success(res, data, 'Emergency cases', { page, limit, total, totalPages: Math.ceil(total / limit) });
});

export const triageController = asyncHandler(async (req, res) => {
  const Emergency = (await import('../models/Emergency.model.js')).default;
  const emergency = await Emergency.findByIdAndUpdate(req.params.id, {
    triageLevel: req.body.triageLevel,
    triagedBy: req.user.id,
    triagedAt: new Date(),
    vitals: req.body.vitals || undefined,
    ...(req.body.triageLevel === 'CRITICAL' ? { status: 'TRIAGED', assignedDoctorId: req.body.assignedDoctorId } : { status: 'TRIAGED' }),
  }, { new: true });
  success(res, emergency, 'Triage updated');
});

export const updateEmergencyStatusController = asyncHandler(async (req, res) => {
  const Emergency = (await import('../models/Emergency.model.js')).default;
  const emergency = await Emergency.findByIdAndUpdate(req.params.id, req.body, { new: true });
  success(res, emergency, 'Emergency updated');
});

// ===== INSURANCE =====
export const createClaimController = asyncHandler(async (req, res) => {
  const Insurance = (await import('../models/Insurance.model.js')).default;
  const { generateNumber, NUMBER_PREFIXES } = await import('../utils/numberGenerator.js');
  const claim = await Insurance.InsuranceClaim.create({
    ...req.body,
    claimNumber: await generateNumber(NUMBER_PREFIXES.CLAIM, new Date().getFullYear()),
    createdBy: req.user.id,
    hospitalId: req.user.hospitalId,
  });
  await writeAudit({ user: req.user, action: 'CLAIM_CREATE', module: 'insurance', entityId: claim._id, entityType: 'InsuranceClaim', req });
  created(res, claim, 'Claim created');
});

export const listClaimsController = asyncHandler(async (req, res) => {
  const { InsuranceClaim } = (await import('../models/Insurance.model.js'));
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.patientId) filter.patientId = req.query.patientId;
  const [total, data] = await Promise.all([
    InsuranceClaim.countDocuments(filter),
    InsuranceClaim.find(filter).populate('patientId', 'uhid firstName lastName mobile').populate('companyId', 'name').sort({ claimDate: -1 }).skip((page - 1) * limit).limit(limit),
  ]);
  success(res, data, 'Claims', { page, limit, total, totalPages: Math.ceil(total / limit) });
});

export const approveClaimController = asyncHandler(async (req, res) => {
  const { InsuranceClaim } = (await import('../models/Insurance.model.js'));
  const claim = await InsuranceClaim.findById(req.params.id);
  claim.approvedAmount = req.body.approvedAmount;
  claim.rejectedAmount = req.body.rejectedAmount;
  claim.patientResponsibility = req.body.patientResponsibility;
  claim.insuranceResponsibility = req.body.insuranceResponsibility;
  claim.status = req.body.approvedAmount >= req.body.rejectedAmount ? 'APPROVED' : 'PARTIALLY_APPROVED';
  claim.approvedAt = new Date();
  claim.remarks = req.body.remarks;
  await claim.save();
  const Notification = (await import('../models/Notification.model.js')).default;
  await Notification.create({ roleCode: 'BILLING_STAFF', type: 'INSURANCE_APPROVAL', title: `Claim ${claim.claimNumber} approved`, message: `Approved amount: ${claim.approvedAmount}`, referenceType: 'InsuranceClaim', referenceId: claim._id });
  success(res, claim, 'Claim approved');
});

// ===== INVENTORY =====
export const createItemController = asyncHandler(async (req, res) => {
  const Inventory = (await import('../models/Inventory.model.js')).default;
  const item = await Inventory.default.create({ ...req.body, hospitalId: req.user.hospitalId, branchId: req.user.branchId });
  await writeAudit({ user: req.user, action: 'INVENTORY_CREATE', module: 'inventory', entityId: item._id, entityType: 'InventoryItem', req });
  created(res, item, 'Item created');
});

export const listItemsController = asyncHandler(async (req, res) => {
  const { default: InventoryItem, StockTransaction } = (await import('../models/Inventory.model.js'));
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const filter = {};
  if (req.query.inventoryType) filter.inventoryType = req.query.inventoryType;
  if (req.query.search) {
    const r = new RegExp(req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ itemName: r }, { itemCode: r }, { category: r }];
  }
  const [total, data] = await Promise.all([
    InventoryItem.countDocuments(filter),
    InventoryItem.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
  ]);
  success(res, data, 'Inventory', { page, limit, total, totalPages: Math.ceil(total / limit) });
});

export const stockAdjustController = asyncHandler(async (req, res) => {
  const { default: InventoryItem, StockTransaction } = (await import('../models/Inventory.model.js'));
  const item = await InventoryItem.findById(req.params.id);
  if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
  const delta = req.body.delta; // signed
  const previous = item.currentStock;
  item.currentStock = Math.max(previous + delta, 0);
  await item.save();
  await StockTransaction.create({
    itemId: item._id,
    referenceType: 'ADJUSTMENT',
    quantity: delta,
    previousStock: previous,
    newStock: item.currentStock,
    notes: req.body.notes,
    user: req.user.id,
    hospitalId: req.user.hospitalId,
  });
  await writeAudit({ user: req.user, action: 'STOCK_ADJUST', module: 'inventory', entityId: item._id, entityType: 'InventoryItem', data: { delta, notes: req.body.notes }, req });
  success(res, item, 'Stock adjusted');
});

export const listSuppliersController = asyncHandler(async (req, res) => {
  const Supplier = (await import('../models/Supplier.model.js')).default;
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const filter = {};
  if (req.query.search) {
    const r = new RegExp(req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: r }, { gstNumber: r }, { 'contact.phone': r }];
  }
  const [total, data] = await Promise.all([Supplier.countDocuments(filter), Supplier.find(filter).sort({ name: 1 }).skip((page - 1) * limit).limit(limit)]);
  success(res, data, 'Suppliers', { page, limit, total, totalPages: Math.ceil(total / limit) });
});

export const createSupplierController = asyncHandler(async (req, res) => {
  const Supplier = (await import('../models/Supplier.model.js')).default;
  const supplier = await Supplier.create({ ...req.body, hospitalId: req.user.hospitalId });
  await writeAudit({ user: req.user, action: 'SUPPLIER_CREATE', module: 'suppliers', entityId: supplier._id, entityType: 'Supplier', req });
  created(res, supplier, 'Supplier created');
});