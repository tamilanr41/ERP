import { Router } from 'express';
import { body, param } from 'express-validator';

import { authenticate, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

import {
  listTestsController,
  createTestController,
  updateTestController,
  deleteTestController,
  listTestCategoriesController,
  createTestCategoryController,
  updateTestCategoryController,
  deleteTestCategoryController,
  createOrderController,
  listOrdersController,
  getOrderController,
  collectSampleController,
  startProcessingController,
  enterResultsController,
  verifyResultsController,
  releaseResultsController,
  listResultsController,
} from '../controllers/lab.controller.js';

const router = Router();
router.use(authenticate);

const mongoIdParam = (name) => param(name).isMongoId().withMessage(`Valid ${name} required`);

const testNameRule = () => body('name').trim().notEmpty().withMessage('Test name is required');

// POST /tests took no validation at all, so an empty body reached the model and
// failed as an opaque Mongo error instead of naming the missing field.
router.get('/tests', requirePermission('LAB_VIEW'), listTestsController);
router.post('/tests', requirePermission('LAB_MANAGE'), validate([
  testNameRule(),
  body('price').optional().isFloat({ min: 0 }).withMessage('Price cannot be negative'),
  body('turnaroundHours').optional().isInt({ min: 0 }),
]), createTestController);
router.put('/tests/:id', requirePermission('LAB_MANAGE'), validate([
  mongoIdParam('id'),
  body('name').optional().trim().notEmpty(),
  body('price').optional().isFloat({ min: 0 }),
]), updateTestController);
router.delete('/tests/:id', requirePermission('LAB_MANAGE'), validate([mongoIdParam('id')]), deleteTestController);

router.get('/test-categories', requirePermission('LAB_VIEW'), listTestCategoriesController);
router.post('/test-categories', requirePermission('LAB_MANAGE'), validate([
  body('name').trim().notEmpty().withMessage('Category name is required'),
]), createTestCategoryController);
router.put('/test-categories/:id', requirePermission('LAB_MANAGE'), validate([
  mongoIdParam('id'),
  body('name').optional().trim().notEmpty(),
]), updateTestCategoryController);
router.delete('/test-categories/:id', requirePermission('LAB_MANAGE'), validate([mongoIdParam('id')]), deleteTestCategoryController);

router.post('/orders', requirePermission('LAB_ORDER_CREATE'), createOrderController);
router.get('/orders', requirePermission('LAB_VIEW'), listOrdersController);
router.get('/orders/:id', requirePermission('LAB_VIEW'), validate([mongoIdParam('id')]), getOrderController);
router.post('/orders/:id/items/:itemIndex/collect', requirePermission('LAB_SAMPLE'), validate([mongoIdParam('id')]), collectSampleController);
router.post('/orders/:id/items/:itemIndex/process', requirePermission('LAB_RESULT_ENTER'), validate([mongoIdParam('id')]), startProcessingController);
router.post('/orders/:id/items/:itemIndex/results', requirePermission('LAB_RESULT_ENTER'), validate([mongoIdParam('id')]), enterResultsController);

router.get('/results', requirePermission('LAB_VIEW'), listResultsController);
router.put('/results/:id/verify', requirePermission('LAB_RESULT_VERIFY'), validate([mongoIdParam('id')]), verifyResultsController);
router.put('/results/:id/release', requirePermission('LAB_RESULT_VERIFY'), validate([mongoIdParam('id')]), releaseResultsController);

export default router;
