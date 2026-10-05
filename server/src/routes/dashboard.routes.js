import { Router } from 'express';
import { dashboardController, revenueTrendController, opdVsIpdController, departmentRevenueController, bedOccupancyController, opdDashboardController } from '../controllers/dashboard.controller.js';
import { authenticate, requirePermission } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('DASHBOARD_VIEW'), dashboardController);
router.get('/revenue-trend', requirePermission('DASHBOARD_VIEW', 'REPORT_VIEW'), revenueTrendController);
router.get('/opd-vs-ipd', requirePermission('DASHBOARD_VIEW', 'REPORT_VIEW'), opdVsIpdController);
router.get('/department-revenue', requirePermission('DASHBOARD_VIEW', 'FINANCE_VIEW'), departmentRevenueController);
router.get('/bed-occupancy', requirePermission('DASHBOARD_VIEW', 'BED_VIEW'), bedOccupancyController);
router.get('/opd', requirePermission('DASHBOARD_VIEW', 'OPD_VIEW'), opdDashboardController);

export default router;