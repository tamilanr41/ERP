import { Router } from 'express';
import { listController, createController, statusController, rescheduleController, queueController } from '../controllers/appointment.controller.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { body, param } from 'express-validator';

const router = Router();
router.use(authenticate);

const createRules = validate([
  body('patientId').isMongoId().withMessage('Valid patient required'),
  body('doctorId').isMongoId().withMessage('Valid doctor required'),
  body('date').isISO8601().withMessage('Valid date required'),
  body('time').matches(/^([01]\d|2[0-3]):[0-5]\d$/).withMessage('Valid time (HH:mm) required'),
  body('type').optional().isIn(['OPD', 'FOLLOW_UP', 'EMERGENCY', 'VIRTUAL', 'PROCEDURE']),
  body('status').optional().isIn(['SCHEDULED', 'CONFIRMED']),
]);

const statusRules = validate([
  param('id').isMongoId(),
  body('status').isIn(['REQUESTED', 'SCHEDULED', 'CONFIRMED', 'ARRIVED', 'CHECKED_IN', 'WAITING', 'IN_CONSULTATION', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'CANCELLED', 'NO_SHOW']).withMessage('Invalid status'),
]);

router.get('/', requirePermission('APPOINTMENT_VIEW', 'OPD_VIEW'), listController);
router.get('/queue', requirePermission('APPOINTMENT_VIEW', 'OPD_VIEW'), queueController);
router.post('/', requirePermission('APPOINTMENT_CREATE', 'OPD_CREATE'), createRules, createController);
router.patch('/:id/status', requirePermission('APPOINTMENT_EDIT', 'OPD_CREATE'), statusRules, statusController);
router.patch('/:id/reschedule', requirePermission('APPOINTMENT_EDIT'), validate([
  param('id').isMongoId(),
  body('date').isISO8601(),
  body('time').matches(/^([01]\d|2[0-3]):[0-5]\d$/),
]), rescheduleController);

export default router;