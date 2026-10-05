import mongoose from 'mongoose';
import LabTest, { LabCategory } from '../models/LabTest.model.js';
import LabOrder, { LabSample, LabResult, LAB_ORDER_STATUS } from '../models/LabOrder.model.js';
import { generateNumber, NUMBER_PREFIXES } from '../utils/numberGenerator.js';
import { BadRequestError, NotFoundError, ConflictError } from '../utils/ApiError.js';
import { regex, pick } from '../utils/helpers.js';
import { createBillingService } from './billing.service.js';

const computeFlags = (labTest, patient, values) => {
  const today = new Date();
  const ageYears = patient?.dateOfBirth ? Math.floor((today - new Date(patient.dateOfBirth)) / (365.25 * 24 * 3600 * 1000)) : patient?.age?.years || null;
  let hasCritical = false;

  const processed = (values || []).map((v) => {
    const param = (labTest?.parameters || []).find((p) => p.name === v.parameter);
    const num = parseFloat(v.value);
    if (!param || !Number.isFinite(num)) return { ...v, flag: 'NORMAL' };

    const { lowerBoundCritical, upperBoundCritical, normalRangeLow, normalRangeHigh } = param;
    let flag = 'NORMAL';
    if (Number.isFinite(lowerBoundCritical) && num <= lowerBoundCritical) { flag = 'CRITICAL_LOW'; hasCritical = true; }
    else if (Number.isFinite(upperBoundCritical) && num >= upperBoundCritical) { flag = 'CRITICAL_HIGH'; hasCritical = true; }
    else if (Number.isFinite(normalRangeLow) && num < normalRangeLow) flag = 'LOW';
    else if (Number.isFinite(normalRangeHigh) && num > normalRangeHigh) flag = 'HIGH';

    return { ...v, unit: v.unit || param.unit, normalRange: v.normalRange || param.normalRange, flag };
  });

  return { values: processed, isCritical: hasCritical };
};

export const listLabTests = async (query = {}) => {
  const filter = query.isActive !== 'false' ? { active: true } : {};
  if (query.search) {
    const r = regex(query.search);
    filter.$or = [{ name: r }, { code: r }];
  }
  const tests = await LabTest.find(filter).populate('category', 'name').sort({ name: 1 });
  return tests;
};

export const createLabTest = async (payload) => {
  const test = await LabTest.create(payload);
  return test;
};

export const updateLabTest = async (id, payload) => {
  const update = pick(payload, [
    'name', 'code', 'category', 'departmentId', 'sampleType', 'container',
    'price', 'turnaroundHours', 'parameters', 'hasSubTests', 'subTests', 'active',
  ]);
  const test = await LabTest.findByIdAndUpdate(id, update, { new: true, runValidators: true }).populate('category', 'name');
  if (!test) throw new NotFoundError('Lab test not found');
  return test;
};

/**
 * Retire a lab test rather than deleting the row.
 *
 * Released reports quote the test name, normal range and price that were
 * current at the time. Deleting the master row would silently rewrite history
 * on any report that resolves its reference back to this document, so the test
 * is deactivated and simply stops appearing in the ordering catalogue.
 */
export const deleteLabTest = async (id) => {
  const test = await LabTest.findById(id);
  if (!test) throw new NotFoundError('Lab test not found');
  test.active = false;
  await test.save();
  return test;
};

export const listLabCategories = async () => LabCategory.find({}).sort({ name: 1 });
export const createLabCategory = async (payload) => LabCategory.create(pick(payload, ['name', 'description']));

export const updateLabCategory = async (id, payload) => {
  const inUse = await LabTest.countDocuments({ category: id, active: true });
  const rename = payload.name && payload.name !== (await LabCategory.findById(id).lean())?.name;
  if (rename && inUse > 0) {
    throw new BadRequestError(`${inUse} active test${inUse === 1 ? '' : 's'} still use this category. Retire them first.`);
  }
  const category = await LabCategory.findByIdAndUpdate(id, pick(payload, ['name', 'description']), { new: true, runValidators: true });
  if (!category) throw new NotFoundError('Lab category not found');
  return category;
};

export const deleteLabCategory = async (id) => {
  const inUse = await LabTest.countDocuments({ category: id, active: true });
  if (inUse > 0) {
    throw new BadRequestError(`${inUse} active test${inUse === 1 ? '' : 's'} still use this category. Retire them first.`);
  }
  const category = await LabCategory.findByIdAndDelete(id);
  if (!category) throw new NotFoundError('Lab category not found');
  return category;
};

/**
 * Create lab order + generate billing in one transaction
 */
export const createLabOrder = async (payload, actor) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { patientId, doctorId, items, priority = 'ROUTINE', clinicalNotes } = payload;
    if (!items?.length) throw new BadRequestError('At least one test required');

    const labOrderNumber = await generateNumber(NUMBER_PREFIXES.LAB_ORDER, new Date().getFullYear(), session);

    const orderItems = [];
    const billItems = [];
    for (const item of items) {
      const test = await LabTest.findById(item.labTestId).session(session);
      if (!test) throw new BadRequestError('Lab test not found');
      orderItems.push({ labTestId: test._id, testName: test.name, price: test.price, status: LAB_ORDER_STATUS.ORDERED });
      billItems.push({
        itemType: 'TEST',
        name: test.name,
        quantity: 1,
        rate: test.price,
        gstPct: 0,
        total: test.price,
        referenceType: 'LabOrder',
      });
    }

const [order] = await LabOrder.create([{
      labOrderNumber,
      patientId,
      doctorId,
      opdVisitId: payload.opdVisitId,
      admissionId: payload.admissionId,
      priority,
      clinicalNotes,
      orderedBy: actor?.id,
      items: orderItems,
      status: LAB_ORDER_STATUS.ORDERED,
      hospitalId: actor?.hospitalId,
      branchId: actor?.branchId,
    }], { session, ordered: true });

    // Auto-bill for lab orders unless explicitly skipped
    if (payload.skipBilling !== true) {
      const bill = await createBillingService({
        patientId: order.patientId,
        opdVisitId: order.opdVisitId || payload.opdVisitId,
        admissionId: order.admissionId,
        doctorId: order.doctorId,
        billType: 'LAB',
        items: billItems.map((b) => ({ ...b, referenceId: order._id })),
        payment: payload.payment,
      }, actor, session);
      order.billId = bill._id;
      order.status = LAB_ORDER_STATUS.BILLED;
      await order.save({ session });
    }

    const populated = await LabOrder.findById(order._id)
      .session(session)
      .populate('patientId', 'uhid firstName lastName')
      .populate('doctorId', 'name');

    await session.commitTransaction();
    return populated.toObject();
  } catch (err) {
    await session.abortTransaction().catch(() => {});
    throw err;
  } finally {
    session.endSession();
  }
};

export const listLabOrders = async (query = {}) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
const filter = {};
  if (query.patientId) filter.patientId = query.patientId;
  if (query.opdVisitId) filter.opdVisitId = query.opdVisitId;
  if (query.status) filter.status = query.status;
  if (query.priority) filter.priority = query.priority;
  if (query.isCritical) filter.isCritical = query.isCritical === 'true';
  if (query.from || query.to) {
    filter.orderedAt = {};
    if (query.from) filter.orderedAt.$gte = new Date(query.from);
    if (query.to) filter.orderedAt.$lte = new Date(query.to);
  }
  const [total, orders] = await Promise.all([
    LabOrder.countDocuments(filter),
    LabOrder.find(filter).populate('patientId', 'uhid firstName lastName gender age dateOfBirth bloodGroup mobile')
      .populate('doctorId', 'name').populate('orderedBy', 'firstName lastName')
      .sort({ orderedAt: -1 }).skip((page - 1) * limit).limit(limit),
  ]);
  return { data: orders, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

export const getLabOrder = async (id) => {
  const order = await LabOrder.findById(id)
    .populate('patientId', 'uhid firstName lastName gender dateOfBirth age bloodGroup mobile')
    .populate('doctorId', 'name')
    .populate('items.labTestId');
  if (!order) throw new NotFoundError('Lab order not found');
  return order;
};

export const collectSample = async (orderId, itemIndex, payload, actor) => {
  const order = await LabOrder.findById(orderId);
  if (!order) throw new NotFoundError('Lab order not found');
  const item = order.items[itemIndex];
  if (!item) throw new BadRequestError('Invalid test item index');
  if (item.status !== LAB_ORDER_STATUS.ORDERED && item.status !== LAB_ORDER_STATUS.BILLED) {
    throw new ConflictError('Sample already collected for this test');
  }
  const test = await LabTest.findById(item.labTestId);

  const sampleNumber = await generateNumber(NUMBER_PREFIXES.LAB_SAMPLE, new Date().getFullYear());
  const sample = await LabSample.create({
    sampleNumber,
    labOrderId: order._id,
    patientId: order.patientId,
    labTestId: item.labTestId,
    testName: item.testName,
    sampleType: payload.sampleType || test?.sampleType,
    container: payload.container || test?.container,
    collectedAt: new Date(),
    collectedBy: actor?.id,
    status: 'COLLECTED',
    hospitalId: actor?.hospitalId,
  });

  item.sampleId = sample._id;
  item.status = LAB_ORDER_STATUS.SAMPLE_COLLECTED;
  if (order.status === LAB_ORDER_STATUS.ORDERED || order.status === LAB_ORDER_STATUS.BILLED) {
    order.status = LAB_ORDER_STATUS.SAMPLE_COLLECTED;
  }
  await order.save();
  return sample.toObject();
};

export const startProcessing = async (orderId, itemIndex, actor) => {
  const order = await LabOrder.findById(orderId);
  if (!order) throw new NotFoundError('Lab order not found');
  const item = order.items[itemIndex];
  if (!item) throw new BadRequestError('Invalid test item index');
  if (item.status !== LAB_ORDER_STATUS.SAMPLE_COLLECTED) {
    throw new ConflictError('Only collected samples can start processing');
  }
  item.status = LAB_ORDER_STATUS.PROCESSING;
  if (order.status !== LAB_ORDER_STATUS.PROCESSING) order.status = LAB_ORDER_STATUS.PROCESSING;
  await order.save();
  return order;
};

export const enterResults = async (orderId, itemIndex, payload, actor) => {
  const order = await LabOrder.findById(orderId).populate('patientId');
  if (!order) throw new NotFoundError('Lab order not found');
  const item = order.items[itemIndex];
  if (!item) throw new BadRequestError('Invalid test item');
  if (item.status !== LAB_ORDER_STATUS.PROCESSING && item.status !== LAB_ORDER_STATUS.SAMPLE_COLLECTED && item.status !== LAB_ORDER_STATUS.RESULT_ENTERED) {
    throw new ConflictError('Results can only be entered for a processing or collected sample');
  }

  const test = await LabTest.findById(item.labTestId);
  const { values, isCritical } = computeFlags(test, order.patientId, payload.values);

  let result = item.resultId ? await LabResult.findById(item.resultId) : null;
  if (!result) {
    result = await LabResult.create({
      labOrderId: order._id,
      patientId: order.patientId._id,
      // Section 50: the result must carry the admission it belongs to, so the
      // treating doctor sees it in the IPD workspace and timeline.
      admissionId: order.admissionId,
      labTestId: item.labTestId,
      testName: item.testName,
      sampleId: item.sampleId,
      enteredBy: actor?.id,
      enteredAt: new Date(),
      status: 'ENTERED',
      hospitalId: actor?.hospitalId,
    });
    item.resultId = result._id;
  }
  if (order.admissionId) result.admissionId = order.admissionId;
  result.values = values;
  result.comments = payload.comments;
  result.isCritical = isCritical;
  await result.save();

  item.status = LAB_ORDER_STATUS.RESULT_ENTERED;
  order.isCritical = order.isCritical || isCritical;
  order.status = LAB_ORDER_STATUS.RESULT_ENTERED;
  await order.save();

  if (isCritical) {
    const Notification = (await import('../models/Notification.model.js')).default;
    await Notification.create({
      roleCode: 'DOCTOR',
      type: 'CRITICAL_LAB_RESULT',
      title: `Critical value ${item.testName}`,
      message: `Critical lab result for patient ${order.patientId?.uhid}: ${values.filter((v) => v.flag.startsWith('CRITICAL')).map((v) => `${v.parameter} ${v.value}`).join(', ')}`,
      severity: 'CRITICAL',
      referenceType: 'LabOrder',
      referenceId: order._id,
    });
  }

  return result;
};

export const verifyResults = async (resultId, actor) => {
  const result = await LabResult.findById(resultId);
  if (!result) throw new NotFoundError('Lab result not found');
  if (result.status === 'VERIFIED') throw new BadRequestError('Already verified');
  if (result.status !== 'ENTERED') throw new ConflictError('Only entered results can be verified');
  const order = await LabOrder.findById(result.labOrderId);
  if (!order) throw new NotFoundError('Lab order not found');
  const item = order.items.find((it) => String(it.resultId) === String(result._id));
  if (item) item.status = LAB_ORDER_STATUS.VERIFIED;
  result.verifiedBy = actor?.id;
  result.verifiedAt = new Date();
  result.status = 'VERIFIED';
  await result.save();

  // The order is only VERIFIED when every test on it has a verified result —
  // a multi-item order must never be closed by the first result.
  const allVerified = order.items.every((it) => it.resultId);
  if (allVerified) {
    const statuses = await LabResult.find({ labOrderId: order._id }).distinct('status');
    if (statuses.every((s) => ['VERIFIED', 'REPORTED'].includes(s))) {
      order.status = statuses.includes('REPORTED') && statuses.every((s) => s === 'REPORTED')
        ? LAB_ORDER_STATUS.REPORTED
        : LAB_ORDER_STATUS.VERIFIED;
    }
  }
  await order.save();

  if (order.isCritical) {
    const Notification = (await import('../models/Notification.model.js')).default;
    await Notification.create({
      roleCode: 'DOCTOR',
      type: 'CRITICAL_LAB_RESULT',
      title: `Critical result verified — ${result.testName}`,
      message: `A verified critical lab result for patient is now available for review.`,
      severity: 'CRITICAL',
      referenceType: 'LabResult',
      referenceId: result._id,
    });
  }
  return result;
};

export const releaseResults = async (resultId, actor) => {
  const result = await LabResult.findById(resultId);
  if (!result) throw new NotFoundError('Lab result not found');
  if (result.status !== 'VERIFIED') throw new ConflictError('Only verified results can be released');
  result.status = 'REPORTED';
  result.releasedBy = actor?.id;
  result.releasedAt = new Date();
  await result.save();

  const order = await LabOrder.findById(result.labOrderId);
  if (order) {
    const item = order.items.find((it) => String(it.resultId) === String(result._id));
    if (item) item.status = LAB_ORDER_STATUS.REPORTED;
    const allReleased = order.items.every((it) => it.status === LAB_ORDER_STATUS.REPORTED);
    if (allReleased) order.status = LAB_ORDER_STATUS.REPORTED;
    await order.save();
    if (order.opdVisitId) {
      const VisitEvent = (await import('../models/VisitEvent.model.js')).default;
      await VisitEvent.create({ visitId: order.opdVisitId, patientId: order.patientId, type: 'LAB_RESULT_RELEASED', title: `Lab result released — ${result.testName}`, happenedAt: new Date(), actorId: actor?.id });
    }
  }
  return result;
};

export const listVisitLabOrdersService = async (visitId) => {
  const orders = await LabOrder.find({ opdVisitId: visitId })
    .populate('patientId', 'uhid firstName lastName gender age dateOfBirth bloodGroup mobile')
    .populate('doctorId', 'name')
    .populate({
      path: 'items.resultId',
      model: 'LabResult',
    })
    .sort({ orderedAt: -1 })
    .limit(20);
  return orders;
};

export const listResults = async (query = {}) => {
  const filter = {};
  if (query.patientId) filter.patientId = query.patientId;
  if (query.admissionId) filter.admissionId = query.admissionId;
  if (query.orderId) filter.labOrderId = query.orderId;
  if (query.status) filter.status = query.status;
  if (query.isCritical !== undefined) {
    if (query.isCritical === 'true') filter.$or = [{ isCritical: true }, { 'values.flag': { $in: ['CRITICAL_HIGH', 'CRITICAL_LOW'] } }];
  }
  const results = await LabResult.find(filter).populate('patientId', 'uhid firstName lastName').populate('labTestId', 'name').sort({ createdAt: -1 }).limit(100);
  return results;
};
