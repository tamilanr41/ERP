import { Router } from 'express';
import { getReportController, exportReportController, reportListController } from '../controllers/report.controller.js';
import { authenticate, requirePermission } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('REPORT_VIEW'), reportListController);
router.get('/:report', requirePermission('REPORT_VIEW', 'REPORT_EXPORT'), getReportController);
router.get('/:report/export/:format', requirePermission('REPORT_EXPORT'), exportReportController);

export default router;