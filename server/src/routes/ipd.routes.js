import { Router } from 'express';
import {
  createHierarchyController,
  listWardsController,
  listBedsController,
  bedMapController,
  bedCommandCenterController,
  updateBedStatusController,
  admitController,
  transferController,
  dischargeController,
  listAdmissionsController,
  getAdmissionController,
  commandCenterController,
  admissionWorkspaceController,
  updateAdmissionController,
  assignBedController,
  planDischargeController,
  cancelAdmissionController,
  waitingListController,
  recordVitalController,
  listVitalsController,
  createNursingNoteController,
  listNursingNotesController,
  createClinicalNoteController,
  listClinicalNotesController,
  addMedicationController,
  listMedicationsController,
  administerMedicationController,
  createOrderController,
  listOrdersController,
  updateOrderStatusController,
  reserveBedController,
  releaseBedController,
  listBedHistoryController,
  admissionAllocationsController,
  completeBedTurnoverController,
  listTurnoverQueueController,
  createDoctorVisitController,
  listDoctorVisitsController,
  createInitialAssessmentController,
  listInitialAssessmentsController,
} from '../controllers/ipd.controller.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idempotency } from '../middleware/idempotency.js';
import { body, param } from 'express-validator';

const router = Router();
router.use(authenticate);
router.use(idempotency);

const WRITE_PERMS = ['IPD_ADMIT', 'IPD_TRANSFER', 'IPD_DISCHARGE', 'OPD_EDIT'];
// Clinical documentation is written by doctors and nurses only. IPD_ADMIT and
// IPD_TRANSFER are intentionally excluded so reception (who may admit, edit
// attender details and request bed moves) can never write clinical records.
const CLINICAL_PERMS = ['IPD_CLINICAL_RECORD', 'OPD_EDIT'];
const NURSING_PERMS = ['NURSING_RECORD', 'VITALS_CREATE', 'OPD_EDIT'];
const MEDICATION_ISSUE_PERMS = ['IPD_MEDICATION_ISSUE', 'PHARMACY_DISPENSE', 'NURSING_RECORD', ...WRITE_PERMS];

router.get('/command-center', requirePermission('IPD_VIEW'), commandCenterController);
router.get('/admissions', requirePermission('IPD_VIEW'), listAdmissionsController);
router.get('/admissions/waiting', requirePermission('IPD_VIEW'), waitingListController);
router.get('/admissions/:id', requirePermission('IPD_VIEW'), getAdmissionController);
router.get('/admissions/:id/workspace', requirePermission('IPD_VIEW'), admissionWorkspaceController);
router.patch('/admissions/:id', requirePermission(...WRITE_PERMS), validate([
  param('id').isMongoId(),
]), updateAdmissionController);
router.post('/admissions', requirePermission('IPD_ADMIT'), validate([
  body('patientId').isMongoId().withMessage('Valid patient required'),
  body('bedId').optional().isMongoId(),
  body('consultantDoctorId').optional().isMongoId(),
  body('admissionType').optional().isIn(['EMERGENCY', 'ELECTIVE', 'OPD', 'TRANSFER', 'DAY_CARE']),
  body('priority').optional().isIn(['ROUTINE', 'URGENT', 'STAT']),
  body('paymentCategory').optional().isIn(['CASH', 'INSURANCE', 'SPONSOR', 'CREDIT', 'GOVT_SCHEME']),
]), admitController);
router.post('/admissions/:id/assign-bed', requirePermission('IPD_ADMIT', 'IPD_TRANSFER'), validate([
  param('id').isMongoId(),
  body('bedId').isMongoId().withMessage('Valid bed required'),
]), assignBedController);
router.post('/admissions/:id/transfer', requirePermission('IPD_TRANSFER'), validate([
  param('id').isMongoId(),
  body('newBedId').isMongoId().withMessage('Valid target bed required'),
  body('reason').optional().isString(),
]), transferController);
router.post('/admissions/:id/plan-discharge', requirePermission('IPD_DISCHARGE'), validate([
  param('id').isMongoId(),
  body('expectedDischargeDate').optional().isISO8601(),
]), planDischargeController);
router.post('/admissions/:id/cancel', requirePermission('IPD_ADMIT', 'IPD_DISCHARGE'), validate([
  param('id').isMongoId(),
  body('reason').optional().isString(),
]), cancelAdmissionController);
router.post('/admissions/:id/discharge', requirePermission('IPD_DISCHARGE'), validate([
  param('id').isMongoId(),
  body('summary.finalDiagnosis').optional().isString(),
]), dischargeController);

// ===== IPD clinical documentation =====
router.get('/admissions/:id/vitals', requirePermission('IPD_VIEW', 'OPD_VIEW'), listVitalsController);
router.post('/admissions/:id/vitals', requirePermission(...NURSING_PERMS), validate([param('id').isMongoId()]), recordVitalController);
router.get('/admissions/:id/nursing-notes', requirePermission('IPD_VIEW', 'OPD_VIEW'), listNursingNotesController);
router.post('/admissions/:id/nursing-notes', requirePermission(...NURSING_PERMS), validate([param('id').isMongoId()]), createNursingNoteController);
router.get('/admissions/:id/clinical-notes', requirePermission('IPD_VIEW', 'OPD_VIEW'), listClinicalNotesController);
router.post('/admissions/:id/clinical-notes', requirePermission(...CLINICAL_PERMS), validate([param('id').isMongoId()]), createClinicalNoteController);
router.get('/admissions/:id/medications', requirePermission('IPD_VIEW', 'OPD_VIEW'), listMedicationsController);
router.post('/admissions/:id/medications', requirePermission(...CLINICAL_PERMS), validate([
  param('id').isMongoId(),
  body('medicineName').notEmpty().withMessage('Medicine name required'),
]), addMedicationController);
router.post('/medications/:chartId/administer', requirePermission(...NURSING_PERMS), validate([
  param('chartId').isMongoId(),
  body('status').isIn(['GIVEN', 'MISSED', 'REFUSED', 'HELD']),
]), administerMedicationController);
router.get('/admissions/:id/orders', requirePermission('IPD_VIEW', 'OPD_VIEW'), listOrdersController);
router.post('/admissions/:id/orders', requirePermission(...CLINICAL_PERMS), validate([
  param('id').isMongoId(),
  body('name').notEmpty().withMessage('Order name required'),
  body('category').optional().isIn(['LAB', 'RADIOLOGY', 'PROCEDURE', 'MEDICATION', 'DIET', 'NURSING_INSTRUCTION', 'PHYSIOTHERAPY', 'BLOOD_REQUEST', 'SPECIALIST_REFERRAL', 'REFERRAL', 'OTHER']),
]), createOrderController);
router.patch('/orders/:orderId/status', requirePermission(...CLINICAL_PERMS), validate([
  param('orderId').isMongoId(),
  body('status').isIn(['ORDERED', 'ACKNOWLEDGED', 'SCHEDULED', 'COLLECTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REJECTED']),
]), updateOrderStatusController);

// ===== Doctor visits (section 13) =====
router.get('/admissions/:id/doctor-visits', requirePermission('IPD_VIEW', 'OPD_VIEW'), listDoctorVisitsController);
router.post('/admissions/:id/doctor-visits', requirePermission(...CLINICAL_PERMS), validate([
  param('id').isMongoId(),
  body('visitType').optional().isIn(['ROUND', 'PROGRESS_NOTE', 'EMERGENCY', 'SPECIALIST', 'CONSULTATION']),
  body('doctorId').optional().isMongoId(),
]), createDoctorVisitController);

// ===== Initial assessment (section 10) =====
router.get('/admissions/:id/initial-assessments', requirePermission('IPD_VIEW', 'OPD_VIEW'), listInitialAssessmentsController);
router.post('/admissions/:id/initial-assessment', requirePermission(...CLINICAL_PERMS), validate([
  param('id').isMongoId(),
]), createInitialAssessmentController);

// ===== Bed allocation / history (section 7) =====
router.get('/beds/:id/history', requirePermission('BED_VIEW', 'IPD_VIEW'), validate([param('id').isMongoId()]), listBedHistoryController);
router.get('/admissions/:id/allocations', requirePermission('BED_VIEW', 'IPD_VIEW', 'IPD_ADMIT'), validate([param('id').isMongoId()]), admissionAllocationsController);
router.post('/beds/:id/reserve', requirePermission('BED_MANAGE'), validate([
  param('id').isMongoId(),
  body('reason').optional().isString(),
]), reserveBedController);
router.post('/beds/:id/release', requirePermission('BED_MANAGE'), validate([
  param('id').isMongoId(),
  body('reason').optional().isString(),
]), releaseBedController);

// Section 50: discharge leaves the bed in CLEANING — housekeeping signs the turnover off.
router.get('/beds/turnover-queue', requirePermission('BED_VIEW', 'IPD_VIEW'), listTurnoverQueueController);
router.post('/beds/:id/turnover', requirePermission('BED_MANAGE'), validate([
  param('id').isMongoId(),
  body('reason').optional().isString(),
]), completeBedTurnoverController);

router.get('/beds', requirePermission('BED_VIEW'), listBedsController);
router.get('/bed-map', requirePermission('BED_VIEW'), bedMapController);
router.get('/beds/command-center', requirePermission('BED_VIEW'), bedCommandCenterController);
router.patch('/beds/:id/status', requirePermission('BED_MANAGE'), validate([
  param('id').isMongoId(),
  body('status').isIn(['AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING', 'MAINTENANCE', 'BLOCKED']),
]), updateBedStatusController);

router.get('/wards', requirePermission('BED_VIEW', 'IPD_VIEW'), listWardsController);
router.post('/hierarchy', requirePermission('BED_MANAGE', 'HOSPITAL_MANAGE'), validate([
  body('ward.name').trim().notEmpty().withMessage('Ward name is required'),
]), createHierarchyController);

export default router;