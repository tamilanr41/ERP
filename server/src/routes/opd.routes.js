import { Router } from 'express';
import { body, param } from 'express-validator';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { writeAudit } from '../middleware/audit.js';
import {
  createVisitController,
  completeVisitController,
  listVisitsController,
  getVisitController,
  createPrescriptionController,
  listPrescriptionsController,
  getPrescriptionController,
  finalizePrescriptionController,
  amendPrescriptionController,
  listPrescriptionAmendmentsController,
  recordVitalsController,
  listVitalsController,
  addDiagnosisController,
  updateDiagnosisController,
  removeDiagnosisController,
  listDiagnosesController,
  createOrderController,
  listOrdersController,
  updateOrderStatusController,
  createNoteController,
  listNotesController,
  updateNoteController,
  removeNoteController,
  scheduleFollowUpController,
  listFollowUpsController,
  listAllFollowUpsController,
  completeFollowUpController,
  listVisitWorkspaceController,
  getPatientClinicalHistoryController,
  getVisitTimelineController,
  getVisitBillingController,
  listExaminationTemplatesController,
  createExaminationTemplateController,
  updateExaminationTemplateController,
  deleteExaminationTemplateController,
  searchDiagnosesController,
} from '../controllers/opd.controller.js';

const router = Router();
router.use(authenticate);

const visitIdParam = () => param('id').isMongoId().withMessage('Valid visit id required');
const mongoIdParam = (name) => param(name).isMongoId().withMessage(`Valid ${name} required`);

// ---------------------------------------------------------------------------
// Visit lifecycle
// ---------------------------------------------------------------------------
router.get('/visits', requirePermission('OPD_VIEW'), listVisitsController);
router.post('/visits', requirePermission('OPD_CREATE'), validate([
  body('patientId').notEmpty().withMessage('Patient required'),
  body('appointmentId').optional(),
]), createVisitController);
router.get('/visits/:id', validate([visitIdParam()]), getVisitController);
router.put('/visits/:id', requirePermission('OPD_EDIT'), validate([visitIdParam()]), completeVisitController);

// ---------------------------------------------------------------------------
// Workspace aggregate (single fetch powering the entire workspace tab: header
// card + patient banner + 3-col overview + every section in one round trip).
// ---------------------------------------------------------------------------
router.get('/visits/:id/workspace', requirePermission('OPD_VIEW'), validate([visitIdParam()]), listVisitWorkspaceController);

// Patient-level clinical history (docs/previous visits, diagnoses, investigations, prescriptions)
router.get('/patients/:patientId/history', requirePermission('OPD_VIEW'), validate([mongoIdParam('patientId')]), getPatientClinicalHistoryController);

// ---------------------------------------------------------------------------
// Vitals
// ---------------------------------------------------------------------------
router.get('/visits/:id/vitals', requirePermission('OPD_VIEW'), validate([visitIdParam()]), listVitalsController);
router.post('/visits/:id/vitals', requirePermission('OPD_EDIT'), validate([visitIdParam()]), recordVitalsController);

// ---------------------------------------------------------------------------
// Diagnosis
// ---------------------------------------------------------------------------
router.get('/visits/:id/diagnoses', requirePermission('OPD_VIEW'), validate([visitIdParam()]), listDiagnosesController);
router.post('/visits/:id/diagnoses', requirePermission('OPD_EDIT'), validate([visitIdParam()]), addDiagnosisController);
router.put('/diagnoses/:diagnosisId', requirePermission('OPD_EDIT'), validate([mongoIdParam('diagnosisId')]), updateDiagnosisController);
router.delete('/diagnoses/:diagnosisId', requirePermission('OPD_EDIT'), validate([mongoIdParam('diagnosisId')]), removeDiagnosisController);

// ---------------------------------------------------------------------------
// Orders (lab / radiology / procedures)
// ---------------------------------------------------------------------------
router.get('/visits/:id/orders', requirePermission('OPD_VIEW'), validate([visitIdParam()]), listOrdersController);
router.post('/visits/:id/orders', requirePermission('OPD_EDIT'), validate([visitIdParam()]), createOrderController);
router.put('/orders/:orderId/status', requirePermission('OPD_EDIT'), validate([mongoIdParam('orderId')]), updateOrderStatusController);

// ---------------------------------------------------------------------------
// Clinical notes (consult sheet writing)
// ---------------------------------------------------------------------------
router.get('/visits/:id/notes', requirePermission('OPD_VIEW'), validate([visitIdParam()]), listNotesController);
router.post('/visits/:id/notes', requirePermission('OPD_EDIT'), validate([visitIdParam()]), createNoteController);
router.put('/notes/:noteId', requirePermission('OPD_EDIT'), validate([mongoIdParam('noteId')]), updateNoteController);
router.delete('/notes/:noteId', requirePermission('OPD_EDIT'), validate([mongoIdParam('noteId')]), removeNoteController);

// ---------------------------------------------------------------------------
// Follow-ups
// ---------------------------------------------------------------------------
router.get('/visits/:id/followups', requirePermission('OPD_VIEW'), validate([visitIdParam()]), listFollowUpsController);
router.post('/visits/:id/followups', requirePermission('OPD_EDIT'), validate([visitIdParam()]), scheduleFollowUpController);
router.get('/followups', requirePermission('OPD_VIEW'), listAllFollowUpsController);
router.put('/followups/:followUpId/complete', requirePermission('OPD_EDIT'), validate([mongoIdParam('followUpId')]), completeFollowUpController);

// ---------------------------------------------------------------------------
// Prescriptions
// ---------------------------------------------------------------------------
router.get('/prescriptions', requirePermission('OPD_VIEW'), listPrescriptionsController);
router.post('/visits/:id/prescriptions', requirePermission('OPD_EDIT'), validate([visitIdParam()]), createPrescriptionController);
router.get('/prescriptions/:id', requirePermission('OPD_VIEW'), validate([mongoIdParam('id')]), getPrescriptionController);
router.put('/prescriptions/:id/finalize', requirePermission('OPD_EDIT'), validate([mongoIdParam('id')]), finalizePrescriptionController);
router.post('/prescriptions/:id/amend', requirePermission('OPD_EDIT'), validate([mongoIdParam('id')]), amendPrescriptionController);
router.get('/prescriptions/:id/amendments', requirePermission('OPD_VIEW'), validate([mongoIdParam('id')]), listPrescriptionAmendmentsController);

// ---------------------------------------------------------------------------
// Clinical examination templates (configurable per specialty)
// ---------------------------------------------------------------------------
router.get('/examinations/templates', requirePermission('OPD_VIEW'), listExaminationTemplatesController);
router.post('/examinations/templates', requirePermission('OPD_EDIT'), validate([
  body('name').notEmpty().withMessage('Template name required'),
  body('specialty').notEmpty().withMessage('Specialty required'),
]), createExaminationTemplateController);
router.put('/examinations/templates/:id', requirePermission('OPD_EDIT'), validate([mongoIdParam('id')]), updateExaminationTemplateController);
router.delete('/examinations/templates/:id', requirePermission('OPD_EDIT'), validate([mongoIdParam('id')]), deleteExaminationTemplateController);

// ---------------------------------------------------------------------------
// Diagnosis search (master dictionary + patient's previous diagnoses)
// ---------------------------------------------------------------------------
router.get('/diagnoses/search', requirePermission('OPD_VIEW'), searchDiagnosesController);

// ---------------------------------------------------------------------------
// Timeline + billing summary
// ---------------------------------------------------------------------------
router.get('/visits/:id/timeline', requirePermission('OPD_VIEW'), validate([visitIdParam()]), getVisitTimelineController);
router.get('/visits/:id/billing', requirePermission('OPD_VIEW'), validate([visitIdParam()]), getVisitBillingController);

export default router;
