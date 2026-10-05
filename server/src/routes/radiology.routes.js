import { Router } from 'express';
import { body, param } from 'express-validator';

import { authenticate, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

import {
  listRadiologyTestsController,
  createRadiologyTestController,
  updateRadiologyTestController,
  createRadiologyOrderController,
  listRadiologyOrdersController,
  getRadiologyOrderController,
  scheduleStudyController,
  markScannedController,
  enterReportController,
  verifyReportController,
  releaseReportController,
  listReportsController,
} from '../controllers/radiology.controller.js';

const router = Router();
router.use(authenticate);

const mongoIdParam = (name) => param(name).isMongoId().withMessage(`Valid ${name} required`);

router.get('/tests', requirePermission('RADIOLOGY_VIEW'), listRadiologyTestsController);
router.post('/tests', requirePermission('RADIOLOGY_VIEW'), createRadiologyTestController);
router.put('/tests/:id', requirePermission('RADIOLOGY_VIEW'), validate([mongoIdParam('id')]), updateRadiologyTestController);

router.post('/orders', requirePermission('RADIOLOGY_ORDER_CREATE'), createRadiologyOrderController);
router.get('/orders', requirePermission('RADIOLOGY_VIEW'), listRadiologyOrdersController);
router.get('/orders/:id', requirePermission('RADIOLOGY_VIEW'), validate([mongoIdParam('id')]), getRadiologyOrderController);
router.post('/orders/:id/tests/:testIndex/schedule', requirePermission('RADIOLOGY_ORDER_CREATE'), validate([mongoIdParam('id')]), scheduleStudyController);
router.post('/orders/:id/tests/:testIndex/scanned', requirePermission('RADIOLOGY_ORDER_CREATE'), validate([mongoIdParam('id')]), markScannedController);

router.post('/orders/:id/tests/:testIndex/report', requirePermission('RADIOLOGY_REPORT'), validate([mongoIdParam('id')]), enterReportController);
router.put('/orders/:id/tests/:testIndex/report/verify', requirePermission('RADIOLOGY_REPORT'), validate([mongoIdParam('id')]), verifyReportController);
router.post('/orders/:id/tests/:testIndex/report/release', requirePermission('RADIOLOGY_REPORT'), validate([mongoIdParam('id')]), releaseReportController);

router.get('/reports', requirePermission('RADIOLOGY_REPORT'), listReportsController);

export default router;
