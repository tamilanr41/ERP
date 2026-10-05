import { success, created } from '../utils/apiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { writeAudit } from '../middleware/audit.js';
import {
  listLabTests,
  createLabTest,
  updateLabTest,
  deleteLabTest,
  listLabCategories,
  createLabCategory,
  updateLabCategory,
  deleteLabCategory,
  createLabOrder,
  listLabOrders,
  getLabOrder,
  collectSample,
  startProcessing,
  enterResults,
  verifyResults,
  releaseResults,
  listResults,
} from '../services/lab.service.js';

export const listTestsController = asyncHandler(async (req, res) => {
  success(res, await listLabTests(req.query), 'Lab tests fetched');
});

export const createTestController = asyncHandler(async (req, res) => {
  const test = await createLabTest(req.body);
  await writeAudit({ user: req.user, action: 'LAB_TEST_CREATE', module: 'lab', entityId: test._id, entityType: 'LabTest', req });
  created(res, test, 'Lab test added');
});

export const updateTestController = asyncHandler(async (req, res) => {
  const test = await updateLabTest(req.params.id, req.body);
  await writeAudit({ user: req.user, action: 'LAB_TEST_UPDATE', module: 'lab', entityId: req.params.id, entityType: 'LabTest', req });
  success(res, test, 'Lab test updated');
});

export const deleteTestController = asyncHandler(async (req, res) => {
  const test = await deleteLabTest(req.params.id);
  await writeAudit({ user: req.user, action: 'LAB_TEST_DELETE', module: 'lab', entityId: req.params.id, entityType: 'LabTest', req });
  success(res, test, 'Lab test deactivated');
});

export const listTestCategoriesController = asyncHandler(async (req, res) => {
  success(res, await listLabCategories(), 'Lab test categories fetched');
});

export const createTestCategoryController = asyncHandler(async (req, res) => {
  const category = await createLabCategory(req.body);
  await writeAudit({ user: req.user, action: 'LAB_CATEGORY_CREATE', module: 'lab', entityId: category._id, entityType: 'LabCategory', req });
  created(res, category, 'Lab category created');
});

export const updateTestCategoryController = asyncHandler(async (req, res) => {
  const category = await updateLabCategory(req.params.id, req.body);
  await writeAudit({ user: req.user, action: 'LAB_CATEGORY_UPDATE', module: 'lab', entityId: req.params.id, entityType: 'LabCategory', req });
  success(res, category, 'Lab category updated');
});

export const deleteTestCategoryController = asyncHandler(async (req, res) => {
  await deleteLabCategory(req.params.id);
  await writeAudit({ user: req.user, action: 'LAB_CATEGORY_DELETE', module: 'lab', entityId: req.params.id, entityType: 'LabCategory', req });
  success(res, null, 'Lab category deleted');
});

export const createOrderController = asyncHandler(async (req, res) => {
  const order = await createLabOrder(req.body, req.user);
  await writeAudit({ user: req.user, action: 'LAB_ORDER_CREATE', module: 'lab', entityId: order._id, entityType: 'LabOrder', req });
  created(res, order, 'Lab order created');
});

export const listOrdersController = asyncHandler(async (req, res) => {
  const result = await listLabOrders(req.query);
  success(res, result.data, 'Lab orders fetched', result.pagination);
});

export const getOrderController = asyncHandler(async (req, res) => {
  success(res, await getLabOrder(req.params.id), 'Lab order fetched');
});

export const collectSampleController = asyncHandler(async (req, res) => {
  const sample = await collectSample(req.params.id, parseInt(req.params.itemIndex, 10) || 0, req.body, req.user);
  await writeAudit({ user: req.user, action: 'LAB_SAMPLE_COLLECTED', module: 'lab', entityId: sample._id, entityType: 'LabSample', req });
  success(res, sample, 'Sample collected');
});

export const enterResultsController = asyncHandler(async (req, res) => {
  const result = await enterResults(req.params.id, parseInt(req.params.itemIndex, 10) || 0, req.body, req.user);
  await writeAudit({ user: req.user, action: 'LAB_RESULT_ENTER', module: 'lab', entityId: result._id, entityType: 'LabResult', req });
  success(res, result, 'Results entered');
});

export const startProcessingController = asyncHandler(async (req, res) => {
  const order = await startProcessing(req.params.id, parseInt(req.params.itemIndex, 10) || 0, req.user);
  await writeAudit({ user: req.user, action: 'LAB_RESULT_PROCESS', module: 'lab', entityId: req.params.id, entityType: 'LabOrder', req });
  success(res, order, 'Sample processing started');
});

export const verifyResultsController = asyncHandler(async (req, res) => {
  const result = await verifyResults(req.params.id, req.user);
  await writeAudit({ user: req.user, action: 'LAB_RESULT_VERIFY', module: 'lab', entityId: req.params.id, entityType: 'LabResult', req });
  success(res, result, 'Results verified');
});

export const releaseResultsController = asyncHandler(async (req, res) => {
  const result = await releaseResults(req.params.id, req.user);
  await writeAudit({ user: req.user, action: 'LAB_RESULT_RELEASE', module: 'lab', entityId: req.params.id, entityType: 'LabResult', req });
  success(res, result, 'Results released');
});

export const listResultsController = asyncHandler(async (req, res) => {
  success(res, await listResults(req.query), 'Results fetched');
});