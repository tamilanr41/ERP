import { success, created } from '../utils/apiResponse.js';
import { writeAudit } from '../middleware/audit.js';
import asyncHandler from '../utils/asyncHandler.js';
import {
  listRadiologyTests,
  createRadiologyTest,
  updateRadiologyTest,
  createRadiologyOrder,
  listRadiologyOrders,
  getRadiologyOrder,
  scheduleStudy,
  markScanned,
  enterReport,
  verifyReport,
  releaseReport,
  listReports,
} from '../services/radiology.service.js';
import { NotFoundError } from '../utils/ApiError.js';

export const listRadiologyTestsController = asyncHandler(async (req, res) => {
  success(res, await listRadiologyTests(req.query), 'Radiology tests fetched');
});

export const createRadiologyTestController = asyncHandler(async (req, res) => {
  const test = await createRadiologyTest(req.body);
  await writeAudit({ user: req.user, action: 'RADIOLOGY_TEST_CREATE', module: 'radiology', entityId: test._id, entityType: 'RadiologyTest', req });
  created(res, test, 'Radiology test added');
});

export const updateRadiologyTestController = asyncHandler(async (req, res) => {
  const test = await updateRadiologyTest(req.params.id, req.body);
  await writeAudit({ user: req.user, action: 'RADIOLOGY_TEST_UPDATE', module: 'radiology', entityId: test._id, entityType: 'RadiologyTest', req });
  success(res, test, 'Radiology test updated');
});

export const createRadiologyOrderController = asyncHandler(async (req, res) => {
  const order = await createRadiologyOrder(req.body, req.user);
  await writeAudit({ user: req.user, action: 'RADIOLOGY_ORDER_CREATE', module: 'radiology', entityId: order._id, entityType: 'RadiologyOrder', req });
  created(res, order, 'Radiology order created');
});

export const listRadiologyOrdersController = asyncHandler(async (req, res) => {
  const result = await listRadiologyOrders(req.query);
  success(res, result.data, 'Radiology orders fetched', result.pagination);
});

export const getRadiologyOrderController = asyncHandler(async (req, res) => {
  success(res, await getRadiologyOrder(req.params.id), 'Radiology order fetched');
});

export const scheduleStudyController = asyncHandler(async (req, res) => {
  const order = await scheduleStudy(req.params.id, parseInt(req.params.testIndex, 10), req.body, req.user);
  await writeAudit({ user: req.user, action: 'RADIOLOGY_SCHEDULE', module: 'radiology', entityId: order._id, entityType: 'RadiologyOrder', req });
  success(res, order, 'Study scheduled');
});

export const markScannedController = asyncHandler(async (req, res) => {
  const order = await markScanned(req.params.id, parseInt(req.params.testIndex, 10), req.body, req.user);
  await writeAudit({ user: req.user, action: 'RADIOLOGY_SCANNED', module: 'radiology', entityId: order._id, entityType: 'RadiologyOrder', req });
  success(res, order, 'Study marked scanned');
});

export const enterReportController = asyncHandler(async (req, res) => {
  const report = await enterReport(req.params.id, parseInt(req.params.testIndex, 10), req.body, req.user);
  await writeAudit({ user: req.user, action: 'RADIOLOGY_REPORT_ENTER', module: 'radiology', entityId: report._id, entityType: 'RadiologyReport', req });
  created(res, report, 'Report entered');
});

export const verifyReportController = asyncHandler(async (req, res) => {
  const report = await verifyReport(req.params.id, parseInt(req.params.testIndex, 10), req.user);
  await writeAudit({ user: req.user, action: 'RADIOLOGY_REPORT_VERIFY', module: 'radiology', entityId: report._id, entityType: 'RadiologyReport', req });
  success(res, report, 'Report verified');
});

export const releaseReportController = asyncHandler(async (req, res) => {
  const report = await releaseReport(req.params.id, parseInt(req.params.testIndex, 10), req.user);
  await writeAudit({ user: req.user, action: 'RADIOLOGY_REPORTS_RELEASED', module: 'radiology', entityId: report._id, entityType: 'RadiologyReport', req });
  const order = await getRadiologyOrder(req.params.id);
  success(res, { report, order }, 'Report released');
});

export const listReportsController = asyncHandler(async (req, res) => {
  success(res, await listReports(req.query), 'Radiology reports fetched');
});
