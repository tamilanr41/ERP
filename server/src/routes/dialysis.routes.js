import { Router } from 'express';
import { param, body } from 'express-validator';
import { validate } from '../middleware/validate.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import * as C from '../controllers/dialysis.controller.js';
import * as V from '../validators/dialysis.validators.js';

const router = Router();
router.use(authenticate);

const VIEW = ['DIALYSIS_VIEW', 'IPD_VIEW', 'PATIENT_VIEW'];
const RUN = ['DIALYSIS_SESSION_RUN', 'NURSING_RECORD'];
const REGISTER = ['DIALYSIS_REGISTER', 'PATIENT_CREATE'];
const PRESCRIBE = ['DIALYSIS_PRESCRIBE', 'IPD_CLINICAL_RECORD'];
const BILL = ['DIALYSIS_BILLING', 'BILLING_CREATE', 'PAYMENT_CREATE'];
const MANAGE = ['DIALYSIS_MACHINE_MANAGE', 'BED_MANAGE'];

// ============================================================
// COMMAND CENTRE (declared before /:id routes)
// ============================================================
router.get('/command-center', requirePermission(...VIEW), V.listRules, C.commandCenterController);

// ---- hospital configuration (spec 7/8/9/10: no hard-coded clinical rules)
router.get('/config', requirePermission(...VIEW), C.configGetController);
router.patch('/config', requirePermission('DIALYSIS_MACHINE_MANAGE', 'DIALYSIS_PRESCRIBE', 'DIALYSIS_CLINICAL_CONFIG'), C.configUpdateController);
router.get('/config/prescription-defaults', requirePermission(...PRESCRIBE, ...VIEW), C.prescriptionDefaultsController);

// ---- slot board (spec 10) — must stay ahead of /sessions/:id
router.get('/slots', requirePermission(...VIEW), V.listRules, C.slotBoardController);

// ---- recurring schedules (spec 9)
router.get('/schedules', requirePermission(...VIEW), V.listRules, C.scheduleListController);
router.post('/schedules', requirePermission('DIALYSIS_SCHEDULE', 'IPD_ADMIT'), validate([
  body('startDate').isISO8601().withMessage('A valid start date is required'),
  body('daysOfWeek').isArray({ min: 1 }).withMessage('Select at least one day of the week'),
]), C.scheduleCreateController);
router.get('/schedules/:id', requirePermission(...VIEW), V.idRules, C.scheduleGetController);
router.patch('/schedules/:id', requirePermission('DIALYSIS_SCHEDULE', 'IPD_ADMIT'), V.idRules, C.scheduleUpdateController);
router.post('/schedules/:id/generate', requirePermission('DIALYSIS_SCHEDULE', 'IPD_ADMIT'), V.idRules, C.scheduleGenerateController);

// ---- nephrology assessment (spec 6) — context route first
router.get('/assessments', requirePermission(...VIEW), V.listRules, C.assessmentListController);
router.get('/assessments/context/:id', requirePermission(...VIEW), V.idRules, C.assessmentContextController);
router.post('/assessments', requirePermission('DIALYSIS_PRESCRIBE', 'IPD_CLINICAL_RECORD'), V.assessmentRules, C.assessmentCreateController);
router.get('/assessments/:id', requirePermission(...VIEW), V.idRules, C.assessmentGetController);
router.get('/assessments/:id/versions', requirePermission(...VIEW), V.idRules, C.assessmentVersionsController);
router.post('/assessments/:id/amend', requirePermission('DIALYSIS_PRESCRIBE', 'IPD_CLINICAL_RECORD'), V.idRules, C.assessmentAmendController);

// ---- patient 360
router.get('/patients/:id/360', requirePermission(...VIEW), V.idRules, C.patient360Controller);

// ---- charge configuration
router.get('/charges', requirePermission(...VIEW), C.chargeGetController);
router.patch('/charges', requirePermission('DIALYSIS_BILLING', 'BILLING_CREATE'), C.chargeUpdateController);

// ---- reports
router.get('/reports/catalogue', requirePermission('DIALYSIS_REPORT_VIEW', ...VIEW), C.reportCatalogueController);
router.get('/reports/:key', requirePermission('DIALYSIS_REPORT_VIEW', ...VIEW), V.listRules, C.reportRunController);
router.get('/reports/:key/export.:format', requirePermission('DIALYSIS_REPORT_EXPORT', ...VIEW), V.listRules, C.reportExportController);

// ---- patients
router.get('/patients', requirePermission(...VIEW), V.listRules, C.listController);
router.post('/patients', requirePermission(...REGISTER), V.registerRules, C.registerController);
router.get('/patients/:id', requirePermission(...VIEW), V.idRules, C.getController);
router.patch('/patients/:id', requirePermission(...VIEW), V.updatePatientRules, C.updateController);

// ---- prescription
router.get('/prescriptions/:patientId', requirePermission(...VIEW), V.listRules, C.prescriptionsController);
router.post('/prescriptions', requirePermission(...PRESCRIBE), V.prescriptionRules, C.prescribeController);
router.patch('/prescriptions/:id/status', requirePermission(...PRESCRIBE), validate([
  param('id').isMongoId().withMessage('Valid id is required'),
  body('status').isIn(['DRAFT', 'ACTIVE', 'SUSPENDED', 'MODIFIED', 'COMPLETED', 'CANCELLED']).withMessage('Invalid prescription status'),
]), C.prescriptionStatusController);

// ---- sessions
router.get('/sessions', requirePermission(...VIEW), V.listRules, C.sessionListController);
router.post('/sessions', requirePermission('DIALYSIS_SCHEDULE', 'IPD_ADMIT'), V.scheduleRules, C.scheduleController);
router.get('/sessions/:id', requirePermission(...VIEW), V.idRules, C.sessionGetController);
router.get('/patients/:patientId/history', requirePermission(...VIEW), V.listRules, C.historyController);

router.get('/sessions/:id/check-in-context', requirePermission(...VIEW), V.idRules, C.checkInContextController);
router.post('/sessions/:id/check-in', requirePermission(...RUN), V.transitionRules, C.checkInController);
router.post('/sessions/:id/pre-assessment', requirePermission(...RUN), V.preAssessRules, C.preAssessController);
router.post('/sessions/:id/ready', requirePermission(...RUN), V.transitionRules, C.readyController);
router.post('/sessions/:id/connect', requirePermission(...RUN), V.transitionRules, C.connectController);
// spec 17: the eight preconditions are shown before the button and enforced on it
router.get('/sessions/:id/start-context', requirePermission(...VIEW), V.idRules, C.startContextController);
router.post('/sessions/:id/start', requirePermission(...RUN), V.transitionRules, C.startController);
router.get('/sessions/:id/post-context', requirePermission(...VIEW), V.idRules, C.postContextController);
router.post('/sessions/:id/monitoring', requirePermission(...RUN), V.monitoringRules, C.monitorController);
router.post('/sessions/:id/medication', requirePermission(...RUN), V.transitionRules, C.medicationController);
router.post('/sessions/:id/complications', requirePermission(...RUN), V.complicationRules, C.complicationController);
router.patch('/sessions/:id/complications/:complicationId/resolve', requirePermission(...RUN), V.idRules, C.resolveComplicationController);
router.post('/sessions/:id/post-assessment', requirePermission(...RUN), V.transitionRules, C.postAssessController);
router.post('/sessions/:id/disconnect', requirePermission(...RUN), V.transitionRules, C.disconnectController);
router.post('/sessions/:id/cancel', requirePermission(...RUN), V.transitionRules, C.cancelController);
router.post('/sessions/:id/no-show', requirePermission(...RUN), V.transitionRules, C.noShowController);

// ---- scheduling desk actions (spec 8)
const DESK = ['DIALYSIS_SCHEDULE', 'DIALYSIS_SESSION_RUN', 'IPD_ADMIT'];
router.post('/sessions/:id/confirm', requirePermission(...DESK), V.transitionRules, C.sessionConfirmController);
router.patch('/sessions/:id/assignment', requirePermission(...DESK), V.idRules, C.sessionAssignController);
router.post('/sessions/:id/reschedule', requirePermission(...DESK), V.rescheduleRules, C.sessionRescheduleController);
router.post('/sessions/:id/cancel-desk', requirePermission(...DESK), validate([
  param('id').isMongoId().withMessage('Valid id is required'),
  body('reason').notEmpty().withMessage('A cancellation reason is required'),
]), C.sessionCancelDeskController);
router.post('/sessions/:id/waiting', requirePermission(...RUN), V.transitionRules, C.sessionWaitingController);
router.post('/sessions/:id/abandon', requirePermission('DIALYSIS_MACHINE_MANAGE', 'DIALYSIS_SESSION_RUN'), validate([
  param('id').isMongoId().withMessage('Valid id is required'),
  body('reason').notEmpty().withMessage('A reason is required to abandon a running session'),
]), C.sessionAbandonController);

// ---- lab / investigations
router.get('/sessions/:id/lab-orders', requirePermission(...VIEW), V.idRules, C.listLabsController);
router.post('/sessions/:id/lab-orders', requirePermission(...PRESCRIBE, 'LAB_ORDER_CREATE'), validate([param('id').isMongoId(), body('items').isArray({ min: 1 }).withMessage('At least one test is required')]), C.orderLabsController);

// ---- consumables
router.get('/consumables', requirePermission(...VIEW), V.listRules, C.consumableListController);
router.post('/consumables', requirePermission('DIALYSIS_SESSION_RUN', 'PHARMACY_PURCHASE', 'INVENTORY_MANAGE'), validate([
  body('code').isString().trim().notEmpty().withMessage('A consumable code is required'),
  body('name').isString().trim().notEmpty().withMessage('A consumable name is required'),
  body('unitCost').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('Unit cost must be zero or more'),
  body('chargeRate').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('Charge rate must be zero or more'),
  body('reorderLevel').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('Reorder level must be zero or more'),
  // stockQty and openingStock are accepted as the same field
  body('stockQty').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('Stock quantity must be zero or more'),
  body('openingStock').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('Opening stock must be zero or more'),
]), C.consumableUpsertController);
router.post('/sessions/:id/consumables', requirePermission(...RUN), V.consumableRules, C.issueConsumablesController);
router.post('/sessions/:id/consumables/return', requirePermission(...RUN), validate([
  param('id').isMongoId().withMessage('Valid id is required'),
  body('items').isArray({ min: 1 }).withMessage('At least one consumable is required'),
  body('items.*.quantity').isFloat({ gt: 0 }).withMessage('Return quantity must be greater than zero'),
]), C.returnConsumablesController);

// ---- billing
router.post('/sessions/:id/bill', requirePermission(...BILL), V.billingRules, C.buildBillController);
router.post('/sessions/:id/payment', requirePermission(...BILL), V.paymentRules, C.payController);
router.get('/sessions/:id/payments', requirePermission(...VIEW), V.idRules, C.listSessionPaymentsController);

// ---- machines & stations
router.get('/machines', requirePermission(...VIEW), V.listRules, C.machineListController);
router.get('/machines/service-due', requirePermission(...VIEW), C.machineServiceDueController);
router.get('/machines/:id/service', requirePermission(...VIEW), V.idRules, C.machineServiceController);
router.post('/machines', requirePermission(...MANAGE), V.machineRules, C.machineUpsertController);
router.patch('/machines/:id/status', requirePermission(...MANAGE), V.machineStatusRules, C.machineStatusController);
router.delete('/machines/:id', requirePermission(...MANAGE), V.retireRules, C.machineRetireController);
router.post('/machines/:id/service', requirePermission(...MANAGE), V.machineServiceRules, C.machineServiceRecordController);
router.get('/stations', requirePermission(...VIEW), V.listRules, C.stationListController);
router.post('/stations', requirePermission(...MANAGE), V.stationRules, C.stationUpsertController);
router.patch('/stations/:id/status', requirePermission(...MANAGE), V.stationStatusRules, C.stationStatusController);
router.delete('/stations/:id', requirePermission(...MANAGE), V.retireRules, C.stationRetireController);

// ---- vascular access registry
router.get('/access', requirePermission(...VIEW), V.listRules, C.accessListController);
router.get('/access/:patientId', requirePermission(...VIEW), validate([param('patientId').isMongoId().withMessage('Valid patient id is required')]), C.accessGetController);
router.post('/access', requirePermission(...PRESCRIBE), V.accessRules, C.accessCreateController);
router.patch('/access/:id', requirePermission(...PRESCRIBE), V.accessUpdateRules, C.accessUpdateController);
router.post('/access/:id/assessments', requirePermission(...RUN), V.accessAssessmentRules, C.accessAssessController);
router.get('/access/:id/history', requirePermission(...VIEW), V.idRules, C.accessHistoryController);

export default router;
