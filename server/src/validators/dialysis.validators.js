import { param, body, query } from 'express-validator';
import { validate } from '../middleware/validate.js';

const mongoId = (field) => param(field).isMongoId().withMessage('Valid id is required');
const isoDate = (field) => body(field).optional().isISO8601().withMessage('Valid date is required');

export const listRules = validate([
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isString(),
  query('q').optional().isString(),
]);

export const idRules = validate([mongoId('id')]);

export const registerRules = validate([
  body('patientId').isMongoId().withMessage('An existing hospital patient is required'),
  body('dialysisType').optional().isIn(['HEMODIALYSIS', 'PERITONEAL', 'CRRT', 'SLED', 'HDF']),
  body('accessType').optional().isIn(['AV_FISTULA', 'AV_GRAFT', 'CVC', 'PD_CATHETER', 'BUTTON_HOLE', 'NONE']),
  body('accessSide').optional().isIn(['LEFT', 'RIGHT', 'NOT_APPLICABLE']),
  body('nephrologistId').optional().isMongoId(),
  body('referringDoctorId').optional().isMongoId(),
  body('departmentId').optional().isMongoId(),
  body('insurancePolicyId').optional().isMongoId(),
  body('ckdStage').optional().isIn(['STAGE_1', 'STAGE_2', 'STAGE_3', 'STAGE_4', 'STAGE_5', 'ESRD', 'AKI', 'UNKNOWN']),
  body('paymentCategory').optional().isIn(['CASH', 'INSURANCE', 'SPONSOR', 'CREDIT', 'GOVT_SCHEME']),
  body('sessionsPerWeek').optional().isInt({ min: 1, max: 7 }),
  body('scheduleDays').optional().isArray(),
  body('dryWeightKg').optional().isFloat({ min: 10, max: 300 }),
]);

export const updatePatientRules = validate([
  mongoId('id'),
  body('nephrologistId').optional().isMongoId(),
  body('dialysisType').optional().isIn(['HEMODIALYSIS', 'PERITONEAL', 'CRRT', 'SLED', 'HDF']),
  body('accessType').optional().isIn(['AV_FISTULA', 'AV_GRAFT', 'CVC', 'PD_CATHETER', 'BUTTON_HOLE', 'NONE']),
  body('status').optional().isIn(['ACTIVE', 'SUSPENDED', 'INACTIVE', 'TRANSFERRED', 'DECEASED']),
  body('sessionsPerWeek').optional().isInt({ min: 1, max: 7 }),
]);

export const prescriptionRules = validate([
  body('patientId').optional().isMongoId(),
  body('dialysisPatientId').optional().isMongoId(),
  body('prescribedBy').optional().isMongoId(),
  body('status').optional().isIn(['DRAFT', 'ACTIVE', 'SUSPENDED', 'MODIFIED', 'COMPLETED', 'CANCELLED']),
  body('modality').optional().isString(),
  body('durationMinutes').optional().isInt({ min: 60, max: 720 }),
  body('bloodFlowRate').optional().isInt({ min: 0, max: 600 }),
  body('dialysateFlowRate').optional().isInt({ min: 0, max: 1000 }),
  body('ultrafiltrationGoalMl').optional().isInt({ min: 0, max: 8000 }),
  body('targetDryWeightKg').optional().isFloat({ min: 10, max: 300 }),
  body('frequencyPerWeek').optional().isFloat({ min: 0, max: 7 }),
  body('accessSide').optional().isIn(['LEFT', 'RIGHT', 'NOT_APPLICABLE']),
  body('medicationOrders').optional().isArray(),
]);

export const assessmentRules = validate([
  body('patientId').optional().isMongoId(),
  body('dialysisPatientId').optional().isMongoId(),
  body('doctorId').optional().isMongoId(),
  body('encounterType').optional().isIn(['DIALYSIS_UNIT', 'OPD', 'IPD', 'EMERGENCY', 'TELEHEALTH', 'DAY_CARE']),
  body('assessmentDate').optional().isISO8601(),
  body('assessmentTime').optional().matches(/^([01]\d|2[0-3]):[0-5]\d$/).withMessage('Assessment time must be HH:mm'),
  body('clinicalAssessment').optional().isObject(),
  body('plan').optional().isObject(),
  body('plan.prescription').optional().isObject(),
  body('plan.prescription.modality').optional().isString(),
  body('status').optional().isIn(['DRAFT', 'FINAL', 'SUPERSEDED', 'AMENDED']),
]);

export const rescheduleRules = validate([
  param('id').isMongoId().withMessage('Valid id is required'),
  body('scheduledAt').optional().isISO8601().withMessage('Valid date is required'),
  body('date').optional().isISO8601(),
  body('timeOfDay').optional().matches(/^([01]\d|2[0-3]):[0-5]\d$/),
  body('machineId').optional().isMongoId(),
  body('stationId').optional().isMongoId(),
  body('durationMinutes').optional().isInt({ min: 60, max: 720 }),
  body('shift').optional().isIn(['MORNING', 'AFTERNOON', 'EVENING', 'NIGHT']),
]);

export const scheduleRules = validate([
  body('patientId').optional().isMongoId(),
  body('dialysisPatientId').optional().isMongoId(),
  body('prescriptionId').optional().isMongoId(),
  body('machineId').optional().isMongoId(),
  body('stationId').optional().isMongoId(),
  body('nurseId').optional().isMongoId(),
  body('doctorId').optional().isMongoId(),
  body('technicianId').optional().isMongoId(),
  body('admissionId').optional().isMongoId(),
  body('opdVisitId').optional().isMongoId(),
  isoDate('scheduledAt'),
  body('date').optional().isISO8601(),
  body('timeOfDay').optional().matches(/^([01]\d|2[0-3]):[0-5]\d$/).withMessage('Time must be HH:mm'),
  body('shift').optional().isIn(['MORNING', 'AFTERNOON', 'EVENING', 'NIGHT']),
  body('priority').optional().isIn(['ROUTINE', 'URGENT', 'EMERGENCY']),
  body('status').optional().isIn(['REQUESTED', 'SCHEDULED', 'CONFIRMED']),
  body('isEmergency').optional().isBoolean(),
  body('durationMinutes').optional().isInt({ min: 60, max: 720 }),
]);

export const transitionRules = validate([
  mongoId('id'),
  body('nurseId').optional().isMongoId(),
  body('technicianId').optional().isMongoId(),
  body('doctorId').optional().isMongoId(),
  body('priority').optional().isIn(['ROUTINE', 'URGENT', 'EMERGENCY']),
  body('notes').optional().isString(),
  body('queueForDialysis').optional().isBoolean(),
  // Only used to bypass a failed check-in verification, and only with a reason
  // so the override is never silent.
  body('overrideReason').optional().isString().trim().isLength({ min: 5, max: 300 }),
]);

export const preAssessRules = validate([
  mongoId('id'),
  body('preAssessment.weightKg').optional().isFloat({ min: 10, max: 400 }),
  body('preAssessment.dryWeightKg').optional().isFloat({ min: 10, max: 400 }),
  body('preAssessment.previousSessionWeightKg').optional().isFloat({ min: 10, max: 400 }),
  body('preAssessment.bpSystolic').optional().isInt({ min: 40, max: 300 }),
  body('preAssessment.bpDiastolic').optional().isInt({ min: 20, max: 200 }),
  body('preAssessment.pulse').optional().isInt({ min: 20, max: 250 }),
  body('preAssessment.temperature').optional().isFloat({ min: 85, max: 110 }),
  body('preAssessment.respiratoryRate').optional().isInt({ min: 4, max: 80 }),
  body('preAssessment.spo2').optional().isInt({ min: 50, max: 100 }),
  body('preAssessment.bloodSugar').optional().isFloat({ min: 10, max: 600 }),
  body('preAssessment.painScore').optional().isInt({ min: 0, max: 10 }),
  body('preAssessment.generalCondition').optional().isIn(['GOOD', 'FAIR', 'POOR', 'UNSTABLE']),
  body('preAssessment.recentSymptoms').optional().isString(),
  body('preAssessment.medicationReview.discrepancies').optional().isArray(),
  body('preAssessment.medicationReview.lastDoseTime').optional().isString(),
  body('preAssessment.allergyCheck.allergies').optional().isArray(),
  body('preAssessment.allergyCheck.reactionReported').optional().isString(),
  body('preAssessment.alertsAcknowledged').optional().isBoolean(),
  body('acknowledgeCritical').optional().isBoolean(),
  body('requireAcknowledgement').optional().isBoolean(),
  body('acknowledgementNote').optional().isString(),
  // same vocabulary as the hospital's configurable access conditions
  body('accessSite.status').optional().isIn(['NORMAL', 'REDNESS', 'SWELLING', 'BLEEDING', 'THRILL_ABSENT', 'INFECTED', 'COLLAPSED', 'SCARRING', 'DISLODGED']),
]);

export const monitoringRules = validate([
  mongoId('id'),
  body('bpSystolic').optional().isInt({ min: 40, max: 300 }),
  body('bpDiastolic').optional().isInt({ min: 20, max: 200 }),
  body('pulse').optional().isInt({ min: 20, max: 250 }),
  body('temperature').optional().isFloat({ min: 85, max: 110 }),
  body('spo2').optional().isInt({ min: 50, max: 100 }),
  body('bloodFlowRate').optional().isInt({ min: 0, max: 600 }),
  body('dialysateFlowRate').optional().isInt({ min: 0, max: 1000 }),
  body('ufRemovedMl').optional().isInt({ min: 0, max: 10000 }),
  isoDate('at'),
]);

export const complicationRules = validate([
  mongoId('id'),
  body('type').notEmpty().withMessage('Complication type is required'),
  body('severity').optional().isIn(['MILD', 'MODERATE', 'SEVERE']),
  body('management').optional().isString(),
  isoDate('occurredAt'),
]);

export const consumableRules = validate([
  mongoId('id'),
  body('items').isArray({ min: 1 }).withMessage('At least one consumable is required'),
  body('items.*.consumableId').optional().isMongoId(),
  body('items.*.quantity').optional().isFloat({ gt: 0 }),
  // spec 24: an idempotency token so a retried issue is not deducted twice
  body('items.*.requestId').optional().isString().trim().isLength({ min: 1, max: 120 }),
]);

export const billingRules = validate([
  mongoId('id'),
  body('sessionCharge').optional().isFloat({ min: 0 }),
  // a rate that differs from the configured one has to say why
  body('chargeOverrideReason').optional().isString().trim().isLength({ min: 5, max: 300 }),
]);

// the mode list mirrors the Payment model exactly. It previously offered
// NETBANKING, which the model does not accept, and omitted BANK_TRANSFER,
// CREDIT and SPONSOR, all of which spec 28 requires.
export const paymentRules = validate([
  mongoId('id'),
  body('amount').isFloat({ gt: 0 }).withMessage('A positive payment amount is required'),
  body('mode').optional().isIn(['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'WALLET', 'CHEQUE', 'INSURANCE', 'CREDIT', 'SPONSOR']),
  // the gateway's own reference; replaying one is a double capture
  body('referenceNumber').optional().isString().trim().isLength({ min: 4, max: 80 }),
  body('notes').optional().isString().trim().isLength({ max: 300 }),
]);

export const machineRules = validate([
  body('code').optional().notEmpty(),
  body('machineType').optional().isIn(['HEMODIALYSIS', 'CRRT', 'HDF', 'PERITONEAL', 'MOBILE']),
  body('status').optional().isIn(['AVAILABLE', 'IN_USE', 'CLEANING', 'MAINTENANCE', 'BLOCKED', 'OUT_OF_SERVICE', 'RESERVED', 'DECOMMISSIONED']),
  body('serialNumber').optional().isString().trim(),
  body('installedOn').optional().isISO8601(),
  body('lastServicedAt').optional().isISO8601(),
  body('nextServiceDue').optional().isISO8601(),
  body('serviceIntervalDays').optional().isInt({ min: 1, max: 1095 }),
  body('stationId').optional({ nullable: true, checkFalsy: true }).isMongoId(),
]);

export const machineServiceRules = validate([
  mongoId('id'),
  body('type').notEmpty().withMessage('Service type is required')
    .isIn(['INSTALLATION', 'PREVENTIVE', 'REPAIR', 'CALIBRATION', 'SOFTWARE_UPGRADE', 'DEEP_CLEAN', 'DECOMMISSION']),
  body('details').optional().isString(),
  body('vendorName').optional().isString(),
  body('engineerName').optional().isString(),
  body('ticketNumber').optional().isString(),
  body('partsReplaced').optional().isArray(),
  body('downtimeMinutes').optional().isInt({ min: 0 }),
  body('serviceIntervalDays').optional().isInt({ min: 1, max: 1095 }),
  body('machineStatusAfter').optional().isIn(['AVAILABLE', 'IN_USE', 'CLEANING', 'MAINTENANCE', 'BLOCKED', 'OUT_OF_SERVICE', 'RESERVED', 'DECOMMISSIONED']),
  body('nextServiceDue').optional().isISO8601(),
  isoDate('at'),
]);

export const stationRules = validate([
  body('code').optional().notEmpty(),
  body('bedOrChair').optional().isIn(['BED', 'CHAIR', 'STATION']),
  body('status').optional().isIn(['AVAILABLE', 'OCCUPIED', 'CLEANING', 'RESERVED', 'BLOCKED', 'MAINTENANCE']),
  body('machineId').optional({ nullable: true, checkFalsy: true }).isMongoId(),
  body('wardId').optional({ nullable: true, checkFalsy: true }).isMongoId(),
]);

// Taking a machine out of service is a clinical-safety decision, so the reason
// and the audit trail are part of the request rather than a free-text afterthought.
export const machineStatusRules = validate([
  mongoId('id'),
  body('status').notEmpty().withMessage('A machine status is required')
    .isIn(['AVAILABLE', 'IN_USE', 'CLEANING', 'RESERVED', 'MAINTENANCE', 'BLOCKED', 'OUT_OF_SERVICE', 'DECOMMISSIONED']),
  body('reason').optional().isString().trim().isLength({ max: 300 }),
  body('availableForBooking').optional().isBoolean(),
  body('blockReason').optional({ nullable: true, checkFalsy: true }).isString(),
]);

// A bay is turned over by cleaning staff, so a reason is required for every
// status that takes it out of service.
export const stationStatusRules = validate([
  mongoId('id'),
  body('status').notEmpty().withMessage('A station status is required')
    .isIn(['AVAILABLE', 'OCCUPIED', 'CLEANING', 'RESERVED', 'BLOCKED', 'MAINTENANCE']),
  body('reason').optional().isString().trim().isLength({ max: 300 }),
  body('cleaningCompleted').optional().isBoolean(),
  body('cleaningNotes').optional().isString().trim().isLength({ max: 500 }),
  body('machineToAvailable').optional().isBoolean(),
  body('blockReason').optional({ nullable: true, checkFalsy: true }).isString(),
]);

// Retiring a machine or a bay is permanent from the roster's point of view, so
// it is a soft delete and it always carries a reason.
export const retireRules = validate([
  mongoId('id'),
  body('reason').notEmpty().withMessage('A reason is required').isString().trim().isLength({ min: 3, max: 300 }),
]);

export const accessAssessmentRules = validate([
  mongoId('id'),
  body('siteCondition').optional().isIn(['NORMAL', 'REDNESS', 'SWELLING', 'BLEEDING', 'INFECTED', 'SCARRING', 'COLLAPSED', 'DISLODGED']),
  body('attentionSigns').optional().isArray(),
  body('patency').optional().isIn(['NORMAL_THRILL', 'WEAK_THRILL', 'NO_THRILL', 'COLLAPSED', 'NOT_APPLICABLE', 'NOT_ASSESSED']),
  body('thrillPalpable').optional().isBoolean(),
  body('bruitAudible').optional().isBoolean(),
  body('catheterBloodFlow').optional().isString(),
  body('catheterExitSiteCondition').optional().isString(),
  body('otherSign').optional().isString().trim().isLength({ max: 300 }),
  body('nursingNotes').optional().isString(),
  body('nursingPlan').optional().isString(),
  body('reportedToDoctor').optional().isBoolean(),
  body('reportedTo').optional({ nullable: true, checkFalsy: true }).isMongoId(),
  body('assessedAsUsable').optional().isBoolean(),
  body('requiresIntervention').optional().isBoolean(),
  body('interventionPlan').optional().isString(),
  body('accessStatusAfter').optional().isIn(['NEW', 'PATENT', 'DYSFUNCTIONAL', 'STENOSIS', 'THROMBOSIS', 'INFECTION', 'ANEURYSM', 'NEEDS_REVISION', 'DECOMMISSIONED']),
  body('sessionId').optional({ nullable: true, checkFalsy: true }).isMongoId(),
]);

export const accessRules = validate([
  body('patientId').isMongoId().withMessage('Patient is required'),
  body('accessType').notEmpty().withMessage('Access type is required'),
  body('side').isIn(['LEFT', 'RIGHT']).withMessage('Side is required'),
  body('site').optional().isString(),
]);

// Only the descriptive fields are correctable. patientId / accessType / side
// are excluded on purpose: an access is a physical fact, so a wrong one is
// decommissioned and re-entered rather than edited into a different site.
export const accessUpdateRules = validate([
  mongoId('id'),
  body('site').optional().isString().trim().isLength({ max: 200 }),
  body('anastomosis').optional().isString().trim().isLength({ max: 200 }),
  body('graftMaterial').optional().isString().trim().isLength({ max: 200 }),
  body('catheterType').optional().isString().trim().isLength({ max: 100 }),
  body('catheterInsertedAt').optional().isISO8601(),
  body('operatedBy').optional({ nullable: true, checkFalsy: true }).isMongoId(),
  body('notes').optional().isString().trim().isLength({ max: 1000 }),
  body('isPrimary').optional().isBoolean(),
  body('intervention').optional().isString().trim().isLength({ max: 200 }),
  body('status').optional().isIn(['NEW', 'PATENT', 'DYSFUNCTIONAL', 'STENOSIS', 'THROMBOSIS', 'INFECTION', 'ANEURYSM', 'NEEDS_REVISION', 'DECOMMISSIONED']),
]);
