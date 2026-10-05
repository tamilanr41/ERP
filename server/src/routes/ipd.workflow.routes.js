import { Router } from 'express';
import { body, param } from 'express-validator';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idempotency } from '../middleware/idempotency.js';
import {
  scheduleMedicationController,
  listMarController,
  recordMarAdministrationController,
  listMedicationChartsController,
  createPharmacyRequestController,
  listPharmacyRequestsController,
  listPharmacyBatchesController,
  verifyPharmacyRequestController,
  dispensePharmacyRequestController,
  returnPharmacyRequestController,
  createLabOrderController,
  listLabOrdersController,
  flagCriticalResultController,
  createRadiologyOrderController,
  listRadiologyOrdersController,
  updateRadiologyOrderController,
  saveRadiologyReportController,
  verifyRadiologyReportController,
  recordIoController,
  listIoController,
  createProcedureController,
  listProceduresController,
  updateProcedureController,
  createOtRequestController,
  listOtRequestsController,
  updateOtRequestController,
  createDietOrderController,
  listDietOrdersController,
  updateDietMealController,
  createBloodRequestController,
  listBloodRequestsController,
  updateBloodRequestController,
  createPhysioRequestController,
  listPhysioRequestsController,
  recordPhysioSessionController,
} from '../controllers/ipd.workflow.controller.js';

const router = Router();
router.use(authenticate);
router.use(idempotency);

const VIEW = ['IPD_VIEW', 'OPD_VIEW'];
// clinical writes are for doctors (IPD_CLINICAL_RECORD); reception/bed staff are excluded
const WRITE = ['IPD_CLINICAL_RECORD', 'OPD_EDIT'];
const MAR = ['NURSING_RECORD', ...WRITE];
const PHARMACY = ['IPD_MEDICATION_ISSUE', 'PHARMACY_DISPENSE', 'PHARMACY_RETURN', 'PHARMACY_VIEW', ...WRITE];
const LAB = [...WRITE, 'LAB_ORDER_CREATE', 'LAB_RESULT_ENTER', 'LAB_RESULT_VERIFY', 'LAB_SAMPLE'];
const RADIOLOGY = [...WRITE, 'RADIOLOGY_ORDER_CREATE', 'RADIOLOGY_REPORT', 'RADIOLOGY_VERIFY'];
const OT_PERMS = [...WRITE, 'OT_BOOK', 'OT_MANAGE'];
const BLOOD = [...WRITE, 'BLOOD_MANAGE'];

// ===== 16. MAR =====
router.get('/admissions/:id/mar', requirePermission(...VIEW), validate([param('id').isMongoId()]), listMarController);
router.get('/admissions/:id/medication-charts', requirePermission(...VIEW), validate([param('id').isMongoId()]), listMedicationChartsController);
router.post('/medication-charts/:chartId/schedule', requirePermission(...MAR), validate([
  param('chartId').isMongoId(),
  body('times').optional().isArray(),
]), scheduleMedicationController);
router.patch('/medication-charts/:chartId/administrations/:administrationId', requirePermission(...MAR), validate([
  param('chartId').isMongoId(),
  param('administrationId').isMongoId(),
  body('status').isIn(['GIVEN', 'MISSED', 'HELD', 'REFUSED', 'CANCELLED']).withMessage('A nurse must record the actual administration status'),
]), recordMarAdministrationController);

// ===== 17. Pharmacy =====
router.get('/admissions/:id/pharmacy-requests', requirePermission(...VIEW), validate([param('id').isMongoId()]), listPharmacyRequestsController);
router.post('/admissions/:id/pharmacy-requests', requirePermission(...PHARMACY), validate([
  param('id').isMongoId(),
  body('medicineId').isMongoId().withMessage('Medicine required'),
  body('quantityRequested').isFloat({ min: 1 }).withMessage('Quantity must be at least 1'),
]), createPharmacyRequestController);
router.get('/pharmacy/medicine/:medicineId/batches', requirePermission(...VIEW), validate([param('medicineId').isMongoId()]), listPharmacyBatchesController);
router.patch('/pharmacy-requests/:requestId/verify', requirePermission(...PHARMACY), validate([param('requestId').isMongoId()]), verifyPharmacyRequestController);
router.patch('/pharmacy-requests/:requestId/dispense', requirePermission(...PHARMACY), validate([
  param('requestId').isMongoId(),
  body('quantity').optional().isFloat({ min: 0 }),
  body('batches').optional().isArray(),
]), dispensePharmacyRequestController);
router.patch('/pharmacy-requests/:requestId/return', requirePermission(...PHARMACY), validate([
  param('requestId').isMongoId(),
  body('quantity').isFloat({ min: 0 }),
  body('wastageQuantity').optional().isFloat({ min: 0 }),
]), returnPharmacyRequestController);

// ===== 18. Lab =====
router.get('/admissions/:id/lab-orders', requirePermission(...VIEW), validate([param('id').isMongoId()]), listLabOrdersController);
router.post('/admissions/:id/lab-orders', requirePermission(...LAB), validate([
  param('id').isMongoId(),
  body('items').isArray({ min: 1 }).withMessage('Select at least one test'),
]), createLabOrderController);
router.patch('/lab-results/:resultId/critical', requirePermission(...LAB), validate([
  param('resultId').isMongoId(),
]), flagCriticalResultController);

// ===== 19. Radiology =====
router.get('/admissions/:id/radiology-orders', requirePermission(...VIEW), validate([param('id').isMongoId()]), listRadiologyOrdersController);
router.post('/admissions/:id/radiology-orders', requirePermission(...RADIOLOGY), validate([
  param('id').isMongoId(),
  body('items').optional().isArray({ min: 1 }),
  body('tests').optional().isArray({ min: 1 }),
  body().custom((v) => (Array.isArray(v?.items) && v.items.length) || (Array.isArray(v?.tests) && v.tests.length))
    .withMessage('Select at least one imaging study'),
]), createRadiologyOrderController);
router.patch('/radiology-orders/:orderId', requirePermission(...RADIOLOGY), validate([
  param('orderId').isMongoId(),
  body('status').optional().isIn(['ORDERED', 'SCHEDULED', 'IN_PROGRESS', 'REPORTING', 'VERIFIED', 'COMPLETED', 'CANCELLED']),
]), updateRadiologyOrderController);
router.post('/radiology-reports', requirePermission(...RADIOLOGY), validate([
  body('radiologyOrderId').isMongoId().withMessage('Imaging order required'),
]), saveRadiologyReportController);
router.patch('/radiology-reports/:reportId/verify', requirePermission(...RADIOLOGY), validate([param('reportId').isMongoId()]), verifyRadiologyReportController);

// ===== 20. I/O chart =====
router.get('/admissions/:id/io-chart', requirePermission(...VIEW), validate([param('id').isMongoId()]), listIoController);
router.post('/admissions/:id/io-chart', requirePermission(...MAR), validate([param('id').isMongoId()]), recordIoController);

// ===== 21. Procedures =====
router.get('/admissions/:id/procedures', requirePermission(...VIEW), validate([param('id').isMongoId()]), listProceduresController);
router.post('/admissions/:id/procedures', requirePermission(...WRITE), validate([
  param('id').isMongoId(),
  body('name').notEmpty().withMessage('Procedure name required'),
]), createProcedureController);
router.patch('/procedures/:procedureId', requirePermission(...WRITE), validate([
  param('procedureId').isMongoId(),
  body('status').optional().isIn(['PLANNED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
]), updateProcedureController);

// ===== 22. OT =====
router.get('/admissions/:id/ot-requests', requirePermission(...VIEW), validate([param('id').isMongoId()]), listOtRequestsController);
router.post('/admissions/:id/ot-requests', requirePermission(...OT_PERMS), validate([
  param('id').isMongoId(),
  body('procedure').notEmpty().withMessage('Procedure required'),
  body('surgeonId').isMongoId().withMessage('Surgeon required'),
  body('scheduledStart').isISO8601().withMessage('Scheduled start required'),
]), createOtRequestController);
router.patch('/ot-requests/:surgeryId', requirePermission(...OT_PERMS), validate([
  param('surgeryId').isMongoId(),
]), updateOtRequestController);

// ===== 23. Diet =====
router.get('/admissions/:id/diet-orders', requirePermission(...VIEW), validate([param('id').isMongoId()]), listDietOrdersController);
router.post('/admissions/:id/diet-orders', requirePermission('IPD_CLINICAL_RECORD', ...WRITE), validate([
  param('id').isMongoId(),
  body('dietType').isIn(['REGULAR', 'LIQUID', 'SOFT', 'DIABETIC', 'LOW_SALT', 'HIGH_PROTEIN', 'NPO', 'CUSTOM']),
]), createDietOrderController);
router.patch('/diet-orders/:orderId/meals/:meal', requirePermission(...WRITE), validate([
  param('orderId').isMongoId(),
  body('status').isIn(['ORDERED', 'KITCHEN_REQUESTED', 'PREPARING', 'DISPATCHED', 'DELIVERED', 'ACKNOWLEDGED', 'CANCELLED']),
]), updateDietMealController);

// ===== 24. Blood bank =====
router.get('/admissions/:id/blood-requests', requirePermission(...VIEW), validate([param('id').isMongoId()]), listBloodRequestsController);
router.post('/admissions/:id/blood-requests', requirePermission(...BLOOD), validate([
  param('id').isMongoId(),
  body('component').isIn(['WHOLE_BLOOD', 'PACKED_RBC', 'PLATELETS', 'FRESH_FROZEN_PLASMA', 'CRYOPRECIPITATE']),
  body('unitsRequested').isInt({ min: 1 }).withMessage('At least one unit required'),
]), createBloodRequestController);
router.patch('/blood-requests/:requestId', requirePermission(...BLOOD), validate([
  param('requestId').isMongoId(),
  body('status').isIn(['REQUESTED', 'SCREENING', 'AVAILABLE', 'PARTIAL', 'ISSUED', 'TRANSFUSED', 'REJECTED', 'CANCELLED']),
]), updateBloodRequestController);

// ===== 25. Physiotherapy =====
router.get('/admissions/:id/physiotherapy', requirePermission(...VIEW), validate([param('id').isMongoId()]), listPhysioRequestsController);
router.post('/admissions/:id/physiotherapy', requirePermission('IPD_CLINICAL_RECORD', ...WRITE), validate([
  param('id').isMongoId(),
  body('procedure').notEmpty().withMessage('Procedure required'),
]), createPhysioRequestController);
router.patch('/physiotherapy/:requestId/sessions/:sessionId', requirePermission(...WRITE), validate([
  param('requestId').isMongoId(),
  param('sessionId').isMongoId(),
  body('status').optional().isIn(['SCHEDULED', 'COMPLETED', 'SKIPPED', 'CANCELLED']),
]), recordPhysioSessionController);

export default router;
