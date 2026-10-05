import { Router } from 'express';
import {
  listModuleRecordsController,
  getModuleRecordController,
  createModuleRecordController,
  updateModuleRecordController,
  setRecordStatusController,
  deleteModuleRecordController,
  getModuleSummaryController,
} from '../controllers/module.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { body, param, query } from 'express-validator';
import { WORKFLOW_STATUS, WORKFLOW_PRIORITY } from '../models/ModuleRecord.model.js';

const router = Router();
router.use(authenticate);

const recordValidators = [
  body('module').trim().notEmpty().withMessage('Module is required'),
  body('workflow').trim().notEmpty().withMessage('Workflow is required'),
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('priority').optional().isIn(Object.values(WORKFLOW_PRIORITY)).withMessage('Invalid priority'),
  body('status').optional().isIn(Object.values(WORKFLOW_STATUS)).withMessage('Invalid status'),
  body('amount').optional().isFloat({ min: 0 }).withMessage('Amount must be positive'),
  body('quantity').optional().isFloat({ min: 0 }).withMessage('Quantity must be positive'),
  body('scheduledDate').optional().isISO8601(),
  body('dueDate').optional().isISO8601(),
];

const patchValidators = [
  body('module').optional().trim().notEmpty(),
  body('workflow').optional().trim().notEmpty(),
  body('title').optional().trim().notEmpty(),
  body('priority').optional().isIn(Object.values(WORKFLOW_PRIORITY)).withMessage('Invalid priority'),
  body('status').optional().isIn(Object.values(WORKFLOW_STATUS)).withMessage('Invalid status'),
  body('amount').optional().isFloat({ min: 0 }).withMessage('Amount must be positive'),
  body('quantity').optional().isFloat({ min: 0 }).withMessage('Quantity must be positive'),
  body('scheduledDate').optional().isISO8601(),
  body('dueDate').optional().isISO8601(),
];

router.get('/workspaces', validate([
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 500 }),
]), listModuleRecordsController);
router.get('/workspaces/summary', getModuleSummaryController);
router.get('/workspaces/:id', validate([param('id').isMongoId()]), getModuleRecordController);
router.post('/workspaces', validate(recordValidators), createModuleRecordController);
router.patch('/workspaces/:id', validate([param('id').isMongoId(), ...patchValidators]), updateModuleRecordController);
router.patch('/workspaces/:id/status', validate([
  param('id').isMongoId(),
  body('status').isIn(Object.values(WORKFLOW_STATUS)).withMessage('Invalid status'),
]), setRecordStatusController);
router.delete('/workspaces/:id', validate([param('id').isMongoId()]), deleteModuleRecordController);

export default router;