import mongoose from 'mongoose';
import RadiologyOrder, { RadiologyTest, RadiologyReport, RADIOLOGY_STATUS } from '../models/RadiologyOrder.model.js';
import { generateNumber, NUMBER_PREFIXES } from '../utils/numberGenerator.js';
import { BadRequestError, NotFoundError, BadRequestError as BadRequest } from '../utils/ApiError.js';
import { writeAudit } from '../middleware/audit.js';
import { createBillingService } from './billing.service.js';

export const listRadiologyTests = async (query = {}) => {
  const filter = query.isActive !== 'false' ? { active: true } : {};
  if (query.search) {
    const r = new RegExp(query.search, 'i');
    filter.$or = [{ name: r }, { code: r }];
  }
  return RadiologyTest.find(filter).sort({ name: 1 });
};

export const createRadiologyTest = async (payload) => {
  const test = await RadiologyTest.create(payload);
  return test;
};

export const updateRadiologyTest = async (id, payload) => {
  const test = await RadiologyTest.findByIdAndUpdate(id, payload, { new: true });
  if (!test) throw new NotFoundError('Radiology test not found');
  return test;
};

export const createRadiologyOrder = async (payload, actor) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { patientId, doctorId, priority = 'ROUTINE', clinicalHistory, items, skipBilling } = payload;
    if (!items?.length) throw new BadRequest('At least one study required');

    const radiologyOrderNumber = await generateNumber(NUMBER_PREFIXES.RADIOLOGY_ORDER, new Date().getFullYear(), session);

    const orderItems = [];
    const billItems = [];
    for (const item of items) {
      const test = await RadiologyTest.findById(item.radiologyTestId).session(session);
      if (!test) throw new BadRequest('Radiology study not found');
      orderItems.push({ radiologyTestId: test._id, testName: test.name, modality: test.modality, price: test.price, status: RADIOLOGY_STATUS.ORDERED });
      billItems.push({
        itemType: 'TEST',
        name: test.name,
        quantity: 1,
        rate: test.price,
        gstPct: 0,
        total: test.price,
        referenceType: 'RADIOLOGY',
      });
    }
    if (!billItems.length) throw new BadRequest('No valid studies in order');

    const order = await RadiologyOrder.create(
      [{
        radiologyOrderNumber,
        patientId,
        doctorId,
        opdVisitId: payload.opdVisitId,
        admissionId: payload.admissionId,
        orderedAt: new Date(),
        orderedBy: actor?.id,
        tests: orderItems,
        clinicalHistory,
        priority,
        status: RADIOLOGY_STATUS.ORDERED,
        hospitalId: actor?.hospitalId,
        branchId: actor?.branchId,
      }],
      { session },
    );

    if (!skipBilling && billItems.length) {
      const bill = await createBillingService({
        patientId: order.patientId,
        opdVisitId: order.opdVisitId || payload.opdVisitId,
        admissionId: order.admissionId,
        doctorId: order.doctorId,
        billType: 'RADIOLOGY',
        items: billItems.map((b) => ({ ...b, referenceId: order._id })),
      }, actor, session);
      order.billId = bill._id;
      order.status = RADIOLOGY_STATUS.ORDERED;
      await order.save({ session });
    }

    await writeAudit({ user: actor?.id ? { id: actor.id } : null, action: 'RADIOLOGY_ORDER_CREATE', module: 'radiology', entityId: order[0]?._id, entityType: 'RadiologyOrder' });
    await session.commitTransaction();
    return (await RadiologyOrder.findById(order[0]._id).populate('patientId', 'uhid firstName lastName').populate('doctorId', 'name')).toObject();
  } catch (err) {
    await session.abortTransaction().catch(() => {});
    throw err;
  } finally {
    await session.endSession().catch(() => {});
  }
};

export const listRadiologyOrders = async (query = {}) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const filter = {};
  if (query.patientId) filter.patientId = query.patientId;
  if (query.opdVisitId) filter.opdVisitId = query.opdVisitId;
  if (query.status) filter.status = query.status;
  if (query.priority) filter.priority = query.priority;
  if (query.from || query.to) {
    filter.orderedAt = {};
    if (query.from) filter.orderedAt.$gte = new Date(query.from);
    if (query.to) filter.orderedAt.$lte = new Date(query.to);
  }
  const [total, orders] = await Promise.all([
    RadiologyOrder.countDocuments(filter),
    RadiologyOrder.find(filter)
      .populate('patientId', 'uhid firstName lastName gender dateOfBirth bloodGroup mobile')
      .populate('doctorId', 'name')
      .populate('orderedBy', 'firstName lastName')
      .sort({ orderedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
  ]);
  return { data: orders, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

export const getRadiologyOrder = async (id) => {
  const order = await RadiologyOrder.findById(id)
    .populate('patientId', 'uhid firstName lastName gender dateOfBirth bloodGroup mobile')
    .populate('doctorId', 'name')
    .populate('orderedBy', 'firstName lastName')
    .populate('tests.reportId');
  if (!order) throw new NotFoundError('Radiology order not found');
  return order;
};

export const scheduleStudy = async (orderId, testIndex, payload, actor) => {
  const order = await RadiologyOrder.findById(orderId);
  if (!order) throw new NotFoundError('Radiology order not found');
  const test = order.tests[testIndex];
  if (!test) throw new BadRequest('Invalid study index');
  if (test.status !== RADIOLOGY_STATUS.ORDERED && test.status !== RADIOLOGY_STATUS.SCHEDULED) {
    throw new BadRequest('Only ordered studies can be scheduled');
  }
  test.status = RADIOLOGY_STATUS.SCHEDULED;
  test.scheduledAt = payload.scheduledAt || new Date();
  if (order.status === RADIOLOGY_STATUS.ORDERED) order.status = RADIOLOGY_STATUS.SCHEDULED;
  await order.save();
  if (order.opdVisitId) {
    const VisitEvent = (await import('../models/VisitEvent.model.js')).default;
    await VisitEvent.create({ visitId: order.opdVisitId, patientId: order.patientId, type: 'RADIOLOGY_SCHEDULED', title: `Study scheduled — ${test.testName}`, meta: { scheduledAt: test.scheduledAt }, happenedAt: new Date(), actorId: actor?.id });
  }
  return order;
};

export const markScanned = async (orderId, testIndex, payload, actor) => {
  const order = await RadiologyOrder.findById(orderId);
  if (!order) throw new NotFoundError('Radiology order not found');
  const test = order.tests[testIndex];
  if (!test) throw new BadRequest('Invalid study index');
  if (test.status === RADIOLOGY_STATUS.VERIFIED || test.status === RADIOLOGY_STATUS.COMPLETED || test.status === RADIOLOGY_STATUS.REPORTING) {
    throw new BadRequest('Study already proceeded past scanning');
  }
  test.status = RADIOLOGY_STATUS.IN_PROGRESS;
  test.scannedAt = new Date();
  order.status = RADIOLOGY_STATUS.IN_PROGRESS;
  await order.save();
  return order;
};

export const enterReport = async (orderId, testIndex, payload, actor) => {
  const order = await RadiologyOrder.findById(orderId);
  if (!order) throw new NotFoundError('Radiology order not found');
  const test = order.tests[testIndex];
  if (!test) throw new BadRequest('Invalid study index');

  let report = test.reportId ? await RadiologyReport.findById(test.reportId) : null;
  if (!report) {
    report = await RadiologyReport.create({
      radiologyOrderId: order._id,
      patientId: order.patientId,
      radiologyTestId: test.radiologyTestId,
      testName: test.testName,
      clinicalHistory: payload.clinicalHistory,
      findings: payload.findings,
      impression: payload.impression,
      images: payload.images || [],
      docReferences: payload.docReferences || [],
      radiologistId: payload.radiologistId,
      typedBy: actor?.id,
      enteredAt: new Date(),
      status: 'ENTERED',
      hospitalId: actor?.hospitalId,
      branchId: actor?.branchId,
    });
    test.reportId = report._id;
  } else {
    Object.assign(report, {
      clinicalHistory: payload.clinicalHistory,
      findings: payload.findings,
      impression: payload.impression,
      images: payload.images || report.images,
      docReferences: payload.docReferences || report.docReferences,
      radiologistId: payload.radiologistId,
      typedBy: report.typedBy || actor?.id,
      enteredAt: report.enteredAt || new Date(),
      status: 'ENTERED',
    });
    await report.save();
  }

  test.status = RADIOLOGY_STATUS.REPORTING;
  order.status = RADIOLOGY_STATUS.REPORTING;
  await order.save();
  return report;
};

export const verifyReport = async (orderId, testIndex, actor) => {
  const order = await RadiologyOrder.findById(orderId);
  if (!order) throw new NotFoundError('Radiology order not found');
  const test = order.tests[testIndex];
  if (!test) throw new BadRequest('Invalid study index');
  const report = await RadiologyReport.findById(test.reportId);
  if (!report) throw new NotFoundError('Radiology report not found');
  if (report.status === 'VERIFIED') throw new BadRequest('Report already verified');

  report.verifiedBy = actor?.id;
  report.verifiedAt = new Date();
  report.status = 'VERIFIED';
  await report.save();

  test.status = RADIOLOGY_STATUS.VERIFIED;
  const allVerified = order.tests.every((t) => t.status === RADIOLOGY_STATUS.VERIFIED || t.status === RADIOLOGY_STATUS.COMPLETED);
  if (allVerified) order.status = RADIOLOGY_STATUS.VERIFIED;
  await order.save();
  return report;
};

export const releaseReport = async (orderId, testIndex, actor) => {
  const order = await RadiologyOrder.findById(orderId);
  if (!order) throw new NotFoundError('Radiology order not found');
  const test = order.tests[testIndex];
  if (!test) throw new BadRequest('Invalid study index');
  const report = await RadiologyReport.findById(test.reportId);
  if (!report) throw new NotFoundError('Radiology report not found');
  if (report.status !== 'VERIFIED') throw new BadRequest('Only verified reports can be released');

  report.releasedBy = actor?.id;
  report.releasedAt = new Date();
  await report.save();

  test.status = RADIOLOGY_STATUS.COMPLETED;
  const allReleased = order.tests.every((t) => t.status === RADIOLOGY_STATUS.COMPLETED);
  if (allReleased) order.status = RADIOLOGY_STATUS.COMPLETED;
  await order.save();

  if (order.opdVisitId) {
    const VisitEvent = (await import('../models/VisitEvent.model.js')).default;
    await VisitEvent.create({ visitId: order.opdVisitId, patientId: order.patientId, type: 'RADIOLOGY_REPORTS_RELEASED', title: `Radiology report released — ${test.testName}`, happenedAt: new Date(), actorId: actor?.id });
  }
  return report;
};

export const listVisitRadiologyOrdersService = async (visitId) => {
  const orders = await RadiologyOrder.find({ opdVisitId: visitId })
    .populate('patientId', 'uhid firstName lastName gender age dateOfBirth bloodGroup mobile')
    .populate('doctorId', 'name')
    .populate('tests.reportId')
    .sort({ orderedAt: -1 })
    .limit(20);
  return orders;
};

export const listReports = async (query = {}) => {
  const filter = {};
  if (query.patientId) filter.patientId = query.patientId;
  if (query.status) filter.status = query.status;
  return RadiologyReport.find(filter)
    .populate('patientId', 'uhid firstName lastName')
    .sort({ enteredAt: -1 })
    .limit(200);
};
