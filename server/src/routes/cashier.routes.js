import { Router } from 'express';
import {
  currentShiftController,
  openShiftController,
  closeShiftController,
  getShiftController,
  listShiftsController,
} from '../controllers/cashier.controller.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { requireFeature } from '../middleware/featureFlag.js';
import { validate } from '../middleware/validate.js';
import { body, param, query } from 'express-validator';

const router = Router();
router.use(authenticate);

router.get('/current', requirePermission('PAYMENT_CREATE'), requireFeature('ENABLE_CASHIER_CLOSING'), currentShiftController);
router.post('/open', requirePermission('PAYMENT_CREATE'), requireFeature('ENABLE_CASHIER_CLOSING'), validate([
  body('openingCash').optional().isFloat({ min: 0 }),
  body('openingNote').optional().isString().trim(),
]), openShiftController);
router.patch('/:id/close', requirePermission('PAYMENT_CREATE'), requireFeature('ENABLE_CASHIER_CLOSING'), validate([
  param('id').isMongoId(),
  body('countedCash').isFloat({ min: 0 }).withMessage('Counted cash required'),
  body('closingNote').optional().isString().trim(),
]), closeShiftController);
router.get('/:id', requirePermission('PAYMENT_CREATE'), requireFeature('ENABLE_CASHIER_CLOSING'), validate([
  param('id').isMongoId(),
]), getShiftController);
router.get('/', requirePermission('FINANCE_VIEW', 'BILLING_VIEW'), requireFeature('ENABLE_CASHIER_CLOSING'), validate([
  query('status').optional().isIn(['OPEN', 'CLOSED']),
]), listShiftsController);

export default router;