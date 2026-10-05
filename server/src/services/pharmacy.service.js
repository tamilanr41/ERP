import mongoose from 'mongoose';
import Medicine, { MedicineCategory, Manufacturer } from '../models/Medicine.model.js';
import MedicineBatch from '../models/MedicineBatch.model.js';
import PharmacySale from '../models/PharmacySale.model.js';
import { PharmacySaleReturn } from '../models/PharmacySale.model.js';
import Purchase from '../models/Purchase.model.js';
import { PurchaseReturn } from '../models/Purchase.model.js';
import Prescription from '../models/Prescription.model.js';
import { generateNumber, NUMBER_PREFIXES } from '../utils/numberGenerator.js';
import { BadRequestError, NotFoundError, ConflictError } from '../utils/ApiError.js';
import { regex } from '../utils/helpers.js';
import { writeAudit } from '../middleware/audit.js';
import { createBillingService } from './billing.service.js';

// ===== MEDICINE MASTER =====
export const listMedicines = async (query = {}) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const filter = query.isActive !== 'false' ? { isActive: true } : {};
  if (query.search) {
    const r = regex(query.search);
    filter.$or = [{ name: r }, { genericName: r }, { brand: r }, { hsnCode: r }];
  }
  if (query.category) filter.category = query.category;

  const batchPipeline = [
    { $match: {} },
    { $sort: { expiryDate: 1 } },
    { $group: { _id: '$medicineId', totalQty: { $sum: '$quantity' }, batches: { $push: '$$ROOT' } } },
  ];

  const [total, medicines] = await Promise.all([
    Medicine.countDocuments(filter),
    Medicine.find(filter).populate('category', 'name').populate('manufacturer', 'name').sort({ name: 1 }).skip((page - 1) * limit).limit(limit).lean(),
  ]);

  const quantities = await MedicineBatch.aggregate([
    { $match: { quantity: { $gt: 0 } } },
    { $group: { _id: '$medicineId', totalStock: { $sum: '$quantity' } } },
  ]);
  const stockMap = Object.fromEntries(quantities.map((q) => [q._id.toString(), q.totalStock]));

  const data = medicines.map((m) => ({
    ...m,
    totalStock: stockMap[m._id.toString()] || 0,
    lowStock: (stockMap[m._id.toString()] || 0) <= (m.reorderLevel || 0),
  }));

  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

export const getStock = async (query = {}) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const filter = {};
  if (query.medicineId) filter.medicineId = query.medicineId;
  if (query.lowStock === 'true') filter.quantity = { $lte: 0 };
  if (query.expiringSoon === 'true') {
    const soon = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    filter.expiryDate = { $lte: soon };
    filter.quantity = { $gt: 0 };
  }
  if (query.search) {
    const medicines = await Medicine.find({ $or: [{ name: regex(query.search) }, { genericName: regex(query.search) }] }).select('_id').lean();
    filter.medicineId = { $in: medicines.map((m) => m._id) };
  }

  const [total, batches] = await Promise.all([
    MedicineBatch.countDocuments(filter),
    MedicineBatch.find(filter).populate('medicineId', 'name genericName unit reorderLevel').sort({ expiryDate: 1 }).skip((page - 1) * limit).limit(limit),
  ]);
  return { data: batches, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

/**
 * FEFO batch selection - returns batches with earliest expiry first
 */
export const selectBatchesFefo = async (medicineId, quantity, options = {}) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const batches = await MedicineBatch.find({
    medicineId,
    quantity: { $gt: 0 },
    expiryDate: { $gt: today }, // never sell expired
    ...(options.excludeBatchId ? { _id: { $ne: options.excludeBatchId } } : {}),
  }).sort({ expiryDate: 1, createdAt: 1 });

  let remaining = quantity;
  const selected = [];
  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantity, remaining);
    selected.push({ batch, take });
    remaining -= take;
  }
  if (remaining > 0) {
    throw new ConflictError(`Insufficient stock for medicine. Need ${remaining} more unit(s). ${batches.length === 0 ? 'No valid (non-expired) batch found.' : ''}`);
  }
  return selected;
};

/**
 * Pharmacy sale transaction:
 * create sale -> deduct batch stock (FEFO) -> create bill -> payment -> ledger -> mark prescription dispensed
 */
export const createSale = async (payload, actor) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { patientId, items, prescriptionId, discount = 0, payment = null, saleType = 'OTC', admissionId, notes } = payload;
    if (!items?.length) throw new BadRequestError('Sale items required');

    const saleNumber = await generateNumber(NUMBER_PREFIXES.PH_SALE, new Date().getFullYear(), session);

    // 1. resolve batches FEFO (read, then lock)
    const resolvedItems = [];
    let grossTotal = 0;
    let tax = 0;

    for (const item of items) {
      const medicine = await Medicine.findById(item.medicineId).session(session);
      if (!medicine) throw new BadRequestError('Medicine not found');
      const rate = item.rate || 0;

      const selected = await selectBatchesFefo(item.medicineId, item.quantity, { excludeBatchId: item.batchId });
      const discountPct = item.discountPct || 0;

      for (const { batch, take } of selected) {
        const itemTotal = take * rate;
        const itemDiscount = (itemTotal * discountPct) / 100;
        const gstAmt = ((itemTotal - itemDiscount) * (medicine.gstPct || 0)) / 100;
        const total = itemTotal - itemDiscount + gstAmt;
        grossTotal += itemTotal;
        tax += gstAmt;
        resolvedItems.push({
          medicineId: medicine._id,
          name: medicine.name,
          batchId: batch._id,
          batchNumber: batch.batchNumber,
          quantity: take,
          rate,
          mrp: batch.mrp || rate,
          gstPct: medicine.gstPct || 0,
          discountPct,
          discountAmount: itemDiscount,
          total,
        });
        // 2. deduct stock
        await MedicineBatch.findByIdAndUpdate(batch._id, { $inc: { quantity: -take } }, { session, new: true });
      }
    }

    const finalDiscount = Math.min(discount, grossTotal);
    const netTotal = Math.max(grossTotal - finalDiscount + tax, 0);

    // 3. create sale
    const sale = new PharmacySale({
      saleNumber,
      patientId,
      admissionId,
      prescriptionId,
      items: resolvedItems,
      saleDate: new Date(),
      saleType,
      grossTotal,
      discount: finalDiscount,
      tax,
      netTotal,
      status: 'COMPLETED',
      cashier: actor?.id,
      notes,
      hospitalId: actor?.hospitalId,
      branchId: actor?.branchId,
    });
    await sale.save({ session });

    // 4. billing + payment + ledger
    const bill = await createBillingService({
      patientId,
      admissionId,
      billType: 'PHARMACY',
      items: resolvedItems.map((i) => ({
        itemType: 'MEDICINE',
        name: i.name,
        quantity: i.quantity,
        rate: i.rate,
        discountPct: i.discountPct,
        discountAmount: i.discountAmount,
        gstPct: i.gstPct,
        total: i.total,
        referenceId: i.batchId,
        referenceType: 'PharmacySaleItem',
      })),
      payment,
    }, actor, session);

    sale.billId = bill._id;
    await sale.save({ session });

    // 5. mark prescription dispensed
    if (prescriptionId) {
      await Prescription.findByIdAndUpdate(prescriptionId, {
        isDispensed: true,
        dispensedAt: new Date(),
        dispensedBy: actor?.id,
        status: 'DISPENSED',
      }, { session });
    }

await session.commitTransaction();
    return (await PharmacySale.findById(sale._id).populate('patientId', 'uhid firstName lastName mobile')).toObject();
  } catch (err) {
    await session.abortTransaction().catch(() => {});
    throw err;
  } finally {
    session.endSession();
  }
};

export const createPurchase = async (payload, actor) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { supplierId, items, paymentMode = 'CREDIT', paidAmount = 0, invoiceNumber, notes } = payload;
    if (!items?.length) throw new BadRequestError('Purchase items required');

    const purchaseNumber = await generateNumber(NUMBER_PREFIXES.PURCHASE, new Date().getFullYear(), session);
    const purchaseItems = [];
    let grossTotal = 0;
    let tax = 0;

    for (const item of items) {
      const medicine = await Medicine.findById(item.medicineId).session(session);
      if (!medicine) throw new BadRequestError(`Medicine not found for item ${item.medicineId || ''}`);
      const qty = item.quantity;
      const rate = item.purchaseRate;
      const gstPct = item.gstPct ?? medicine.gstPct ?? 0;
      const lineTotal = qty * rate;
      const discountAmt = (lineTotal * (item.discountPct || 0)) / 100;
      const gstAmt = ((lineTotal - discountAmt) * gstPct) / 100;
      const total = lineTotal - discountAmt + gstAmt;
      grossTotal += lineTotal;
      tax += gstAmt;

      // Create/update batch atomically
      let batch = await MedicineBatch.findOne({ medicineId: medicine._id, batchNumber: item.batchNumber }).session(session);
      if (batch) {
        batch.quantity += qty;
        batch.purchaseRate = rate;
        batch.sellingRate = item.sellingRate ?? batch.sellingRate;
        batch.mrp = item.mrp ?? batch.mrp;
        if (item.expiryDate) batch.expiryDate = item.expiryDate;
        await batch.save({ session });
      } else {
        batch = await MedicineBatch.create([{
          medicineId: medicine._id,
          batchNumber: item.batchNumber,
          manufacturingDate: item.manufacturingDate,
          expiryDate: item.expiryDate,
          purchaseRate: rate,
          sellingRate: item.sellingRate,
          mrp: item.mrp,
          quantity: qty,
          initialQuantity: qty,
          supplierId,
          hospitalId: actor?.hospitalId,
          branchId: actor?.branchId,
        }], { session, ordered: true });
        batch = batch[0];
      }

      purchaseItems.push({
        medicineId: medicine._id,
        name: medicine.name,
        batchNumber: item.batchNumber,
        manufacturingDate: item.manufacturingDate,
        expiryDate: item.expiryDate,
        quantity: qty,
        purchaseRate: rate,
        sellingRate: item.sellingRate,
        mrp: item.mrp,
        gstPct,
        discountPct: item.discountPct || 0,
        total,
      });
    }

    const netTotal = grossTotal + tax;
const [purchase] = await Purchase.create([{
      purchaseNumber,
      supplierId,
      items: purchaseItems,
      purchaseDate: new Date(),
      receivedAt: new Date(),
      grossTotal,
      tax,
      netTotal,
      paymentMode,
      paidAmount,
      dueAmount: Math.max(netTotal - paidAmount, 0),
      invoiceNumber,
      notes,
      status: 'RECEIVED',
      createdBy: actor?.id,
      hospitalId: actor?.hospitalId,
      branchId: actor?.branchId,
    }], { session, ordered: true });

    // ledger entry for purchase payable
    const { LedgerEntry } = await import('../models/Finance.model.js');
    await LedgerEntry.create([{
      referenceType: 'PURCHASE',
      referenceId: purchase._id,
      entryType: 'CREDIT',
      account: 'ACCOUNTS_PAYABLE',
      amount: netTotal,
      description: `Purchase ${purchaseNumber}`,
      enteredBy: actor?.id,
      hospitalId: actor?.hospitalId,
      branchId: actor?.branchId,
    }], { session, ordered: true });

    const populated = await Purchase.findById(purchase._id).session(session).populate('supplierId', 'name');

    await session.commitTransaction();
    return populated.toObject();
  } catch (err) {
    await session.abortTransaction().catch(() => {});
    throw err;
  } finally {
    session.endSession();
  }
};

export const listSales = async (query = {}) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const filter = {};
  if (query.patientId) filter.patientId = query.patientId;
  if (query.status) filter.status = query.status;
  if (query.from || query.to) {
    filter.saleDate = {};
    if (query.from) filter.saleDate.$gte = new Date(query.from);
    if (query.to) filter.saleDate.$lte = new Date(query.to);
  }
  const [total, sales] = await Promise.all([
    PharmacySale.countDocuments(filter),
    PharmacySale.find(filter).populate('patientId', 'uhid firstName lastName').populate('cashier', 'firstName lastName')
      .sort({ saleDate: -1 }).skip((page - 1) * limit).limit(limit),
  ]);
  return { data: sales, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

export const listPurchases = async (query = {}) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const filter = {};
  if (query.supplierId) filter.supplierId = query.supplierId;
  if (query.status) filter.status = query.status;
  const [total, purchases] = await Promise.all([
    Purchase.countDocuments(filter),
    Purchase.find(filter).populate('supplierId', 'name').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
  ]);
  return { data: purchases, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

/**
 * Sale return (restock + refund)
 */
export const createSaleReturn = async (saleId, payload, actor) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const sale = await PharmacySale.findById(saleId).session(session);
    if (!sale) throw new NotFoundError('Sale not found');

    const returnItems = [];
    let refundAmount = 0;
    for (const item of payload.items) {
      const saleItem = sale.items.id(item.saleItemId);
      if (!saleItem) throw new BadRequestError('Sale item not found');
      const maxReturnable = saleItem.quantity - saleItem.returnedQuantity;
      if (item.quantity > maxReturnable) throw new BadRequestError(`Cannot return more than ${maxReturnable} for ${saleItem.name}`);
      saleItem.returnedQuantity += item.quantity;
      await MedicineBatch.findByIdAndUpdate(saleItem.batchId, { $inc: { quantity: item.quantity } }, { session });
      const refund = item.quantity * saleItem.rate;
      refundAmount += refund;
      returnItems.push({
        saleItemId: saleItem._id,
        medicineId: saleItem.medicineId,
        name: saleItem.name,
        batchId: saleItem.batchId,
        batchNumber: saleItem.batchNumber,
        quantity: item.quantity,
        rate: saleItem.rate,
        refundAmount: refund,
      });
    }
    await sale.save({ session });
    sale.status = 'RETURNED';
    await sale.save({ session });

const returnNumber = await generateNumber(NUMBER_PREFIXES.PH_SALE_RETURN, new Date().getFullYear(), session);
    const [saleReturn] = await PharmacySaleReturn.create([{
      returnNumber,
      saleId,
      items: returnItems,
      reason: payload.reason,
      refundAmount,
      status: 'PROCESSED',
      refunded: true,
      createdBy: actor?.id,
      hospitalId: actor?.hospitalId,
    }], { session, ordered: true });

    // refund ledger via billing service
    if (sale.billId) {
      const { createRefundService } = await import('./billing.service.js');
      await createRefundService({ billId: sale.billId, amount: refundAmount, reason: payload.reason, refundNumber: returnNumber }, actor, session);
    }

    await session.commitTransaction();
    return saleReturn;
  } catch (err) {
    await session.abortTransaction().catch(() => {});
    throw err;
  } finally {
    session.endSession();
  }
};

export const getExpiringMedicines = async (days = 90) => {
  const soon = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const batches = await MedicineBatch.find({ expiryDate: { $lte: soon }, quantity: { $gt: 0 } })
    .populate('medicineId', 'name genericName unit')
    .sort({ expiryDate: 1 })
    .limit(100);
  return batches;
};

export const getLowStock = async () => {
  const medicines = await Medicine.find({ isActive: true }).populate('category', 'name');
  const quantities = await MedicineBatch.aggregate([
    { $match: { quantity: { $gt: 0 } } },
    { $group: { _id: '$medicineId', totalStock: { $sum: '$quantity' } } },
  ]);
  const stockMap = Object.fromEntries(quantities.map((q) => [q._id.toString(), q.totalStock]));
  const low = medicines.filter((m) => (stockMap[m._id.toString()] || 0) <= (m.reorderLevel || 0));
  return low.map((m) => ({ ...m.toObject(), totalStock: stockMap[m._id.toString()] || 0 }));
};

export const createMedicine = async (payload) => {
  const medicine = await Medicine.create(payload);
  return medicine;
};

export const updateMedicine = async (id, payload) => {
  const medicine = await Medicine.findByIdAndUpdate(id, payload, { new: true });
  if (!medicine) throw new NotFoundError('Medicine not found');
  return medicine;
};

export const createCategory = async (payload) => MedicineCategory.create(payload);
export const listCategories = async () => MedicineCategory.find({}).sort({ name: 1 });
export const createManufacturer = async (payload) => Manufacturer.create(payload);
export const listManufacturers = async () => Manufacturer.find({}).sort({ name: 1 });
