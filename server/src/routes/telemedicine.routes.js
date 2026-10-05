import { Router } from 'express';
import { body, param } from 'express-validator';
import {
  listController,
  detailController,
  consentController,
  startController,
  endController,
  joinController,
  billController,
  waiveController,
  doctorsController,
  createPrescriptionController,
  listPrescriptionsController,
} from '../controllers/telemedicine.controller.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();
router.use(authenticate);

const idRule = validate([param('id').isMongoId().withMessage('Valid appointment id required')]);

router.get('/appointments', requirePermission('TELEMEDICINE_VIEW'), listController);
router.get('/doctors', requirePermission('TELEMEDICINE_VIEW'), doctorsController);
router.get('/appointments/:id', requirePermission('TELEMEDICINE_VIEW'), idRule, detailController);

router.post(
  '/appointments/:id/consent',
  requirePermission('TELEMEDICINE_CONSULT'),
  validate([
    param('id').isMongoId(),
    body('videoConsent').isBoolean().withMessage('videoConsent must be true or false'),
    body('ip').optional({ values: 'falsy' }).isIP().withMessage('Invalid IP address'),
  ]),
  consentController,
);

router.post(
  '/appointments/:id/start',
  requirePermission('TELEMEDICINE_CONSULT'),
  validate([param('id').isMongoId()]),
  startController,
);

router.post(
  '/appointments/:id/end',
  requirePermission('TELEMEDICINE_CONSULT'),
  validate([param('id').isMongoId(), body('reason').optional().isString().trim().isLength({ max: 500 })]),
  endController,
);

// Joining is separated from requirePermission('TELEMEDICINE_VIEW') because the
// patient has no staff permission at all. The service performs the real
// participant check against the patient/doctor on the appointment.
router.post(
  '/appointments/:id/join',
  requirePermission('TELEMEDICINE_JOIN_OWN', 'TELEMEDICINE_JOIN_ANY', 'TELEMEDICINE_VIEW'),
  validate([
    param('id').isMongoId(),
    body('role').optional().isIn(['DOCTOR', 'PATIENT', 'OBSERVER']),
    body('patientId').optional().isMongoId(),
  ]),
  joinController,
);

router.post(
  '/appointments/:id/bill',
  requirePermission('TELEMEDICINE_BILLING'),
  validate([
    param('id').isMongoId(),
    body('payment').optional().isObject(),
    body('extraDiscount').optional({ values: 'falsy' }).isFloat({ min: 0 }),
    body('gstPct').optional({ values: 'falsy' }).isFloat({ min: 0, max: 100 }),
  ]),
  billController,
);

router.post(
  '/appointments/:id/waive',
  requirePermission('TELEMEDICINE_FEE_WAIVE'),
  validate([param('id').isMongoId(), body('reason').optional().isString().trim().isLength({ max: 500 })]),
  waiveController,
);

router.get('/appointments/:id/prescriptions', requirePermission('TELEMEDICINE_CONSULT', 'PRESCRIPTION_VIEW'), idRule, listPrescriptionsController);

// PRESCRIPTION_CREATE is the same authority the OPD route uses, so a prescriber
// can write during a consultation without gaining a second permission.
router.post(
  '/appointments/:id/prescriptions',
  requirePermission('PRESCRIPTION_CREATE'),
  validate([
    param('id').isMongoId(),
    body('patientId').isMongoId().withMessage('Valid patient required'),
    body('doctorId').isMongoId().withMessage('Valid doctor required'),
    body('items').isArray({ min: 1 }).withMessage('At least one medicine is required'),
    body('items.*.medicineName').isString().trim().notEmpty().withMessage('Medicine name is required'),
    body('diagnosis').optional().isString().trim(),
    body('followUpDate').optional().isISO8601(),
    body('status').optional().isIn(['DRAFT', 'SIGNED']),
  ]),
  createPrescriptionController,
);

export default router;