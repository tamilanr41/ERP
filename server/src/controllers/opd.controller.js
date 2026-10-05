import VitalRecord from '../models/VitalRecord.model.js';
import { success, created } from '../utils/apiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { writeAudit } from '../middleware/audit.js';
import {
  createOpdVisit,
completeOpdVisit,
    listOpdVisits,
    getOpdVisit,
    getQueueBoardService,
    callNextPatientService,
    callVisitService,
    startConsultationService,
    markNoShowService,
    cancelVisitService,
  createPrescription,
  listPrescriptions,
  getPrescription,
  finalizePrescriptionService,
  amendPrescriptionService,
  listPrescriptionAmendmentsService,
  listVitalsService,
  recordVitalsService,
  listVisitDiagnosesService,
  addVisitDiagnosisService,
  updateVisitDiagnosisService,
  removeVisitDiagnosisService,
  listClinicalOrdersService,
  createClinicalOrderService,
  updateClinicalOrderStatusService,
  listClinicalNotesService,
  createClinicalNoteService,
  updateClinicalNoteService,
  removeClinicalNoteService,
  listFollowUpsService,
  listAllFollowUpsService,
  scheduleFollowUpService,
  completeFollowUpService,
  getVisitWorkspaceService,
  getVisitTimelineService,
  getVisitBillingService,
  getPatientClinicalHistoryService,
  listExaminationTemplatesService,
  createExaminationTemplateService,
  updateExaminationTemplateService,
  deleteExaminationTemplateService,
  searchDiagnosesService,
  closeVisitService,
  referVisitService,
  admitVisitService,
} from '../services/opd.service.js';

export const createVisitController = asyncHandler(async (req, res) => {
  const visit = await createOpdVisit(req.body, req.user);
  await writeAudit({ user: req.user, action: 'OPD_CREATE', module: 'opd', entityId: visit._id, entityType: 'OpdVisit', req });
  created(res, visit, 'OPD visit created');
});

export const completeVisitController = asyncHandler(async (req, res) => {
  const visit = await completeOpdVisit(req.params.id, req.body, req.user);
  await writeAudit({ user: req.user, action: 'OPD_COMPLETE', module: 'opd', entityId: req.params.id, entityType: 'OpdVisit', req });
  success(res, visit, 'OPD visit updated');
});

export const listVisitsController = asyncHandler(async (req, res) => {
  const result = await listOpdVisits(req.query);
  success(res, result.data, 'OPD visits fetched', result.pagination);
});

export const getVisitController = asyncHandler(async (req, res) => {
    success(res, await getOpdVisit(req.params.id), 'OPD visit fetched');
});

/* ---------------------------------------------------------------------------
 * Queue board / front desk
 * ------------------------------------------------------------------------- */
export const getQueueBoardController = asyncHandler(async (req, res) => {
    success(res, await getQueueBoardService({
        doctorId: req.query.doctorId,
        departmentId: req.query.departmentId,
        date: req.query.date,
    }), 'OPD queue board fetched');
});

export const callNextPatientController = asyncHandler(async (req, res) => {
    const visit = await callNextPatientService(req.params.doctorId, req.user);
    if (!visit) return success(res, null, 'Nobody is waiting for this doctor right now');
    await writeAudit({ user: req.user, action: 'OPD_QUEUE_CALL_NEXT', module: 'opd', entityId: visit._id, entityType: 'OpdVisit', req });
    success(res, visit, `Called token ${visit.queueToken}`);
});

export const callVisitController = asyncHandler(async (req, res) => {
    const v = await callVisitService(req.params.id, req.user);
    await writeAudit({ user: req.user, action: 'OPD_QUEUE_CALL', module: 'opd', entityId: v._id, entityType: 'OpdVisit', req });
    success(res, v, `Called token ${v.queueToken}`);
});

export const startConsultationController = asyncHandler(async (req, res) => {
    const v = await startConsultationService(req.params.id, req.user);
    await writeAudit({ user: req.user, action: 'OPD_QUEUE_START', module: 'opd', entityId: v._id, entityType: 'OpdVisit', req });
    success(res, v, 'Consultation started');
});

export const markNoShowController = asyncHandler(async (req, res) => {
    const v = await markNoShowService(req.params.id, req.user);
    await writeAudit({ user: req.user, action: 'OPD_QUEUE_NO_SHOW', module: 'opd', entityId: v._id, entityType: 'OpdVisit', req });
    success(res, v, 'Marked as no-show');
});

export const cancelVisitController = asyncHandler(async (req, res) => {
    const v = await cancelVisitService(req.params.id, req.user, req.body?.reason);
    await writeAudit({ user: req.user, action: 'OPD_QUEUE_CANCEL', module: 'opd', entityId: v._id, entityType: 'OpdVisit', req });
    success(res, v, 'Visit cancelled');
});

export const createPrescriptionController = asyncHandler(async (req, res) => {
  const prescription = await createPrescription({ ...req.body, opdVisitId: req.params.id }, req.user);
  await writeAudit({ user: req.user, action: 'PRESCRIPTION_CREATE', module: 'opd', entityId: prescription._id, entityType: 'Prescription', req });
  created(res, prescription, 'Prescription created');
});

export const listPrescriptionsController = asyncHandler(async (req, res) => {
  const result = await listPrescriptions(req.query);
  success(res, result.data, 'Prescriptions fetched', result.pagination);
});

export const getPrescriptionController = asyncHandler(async (req, res) => {
  success(res, await getPrescription(req.params.id), 'Prescription fetched');
});

export const listVisitWorkspaceController = asyncHandler(async (req, res) => success(res, await getVisitWorkspaceService(req.params.id), 'OPD workspace fetched'));
export const getPatientClinicalHistoryController = asyncHandler(async (req, res) => success(res, await getPatientClinicalHistoryService(req.params.patientId), 'Patient clinical history fetched'));
export const recordVitalsController = asyncHandler(async (req, res) => { await recordVitalsService(req.params.id, req.body, req.user); await writeAudit({ user: req.user, action: 'OPD_VITALS_RECORD', module: 'opd', entityId: req.params.id, entityType: 'OpdVisit', req }); created(res, {}, 'Vitals recorded'); });
export const listVitalsController = asyncHandler(async (req, res) => success(res, await listVitalsService(req.params.id), 'Vitals fetched'));
export const addDiagnosisController = asyncHandler(async (req, res) => { const d = await addVisitDiagnosisService(req.params.id, req.body, req.user); await writeAudit({ user: req.user, action: 'OPD_DIAGNOSIS_ADD', module: 'opd', entityId: req.params.id, entityType: 'OpdVisit', req }); created(res, d[0], 'Diagnosis added'); });
export const updateDiagnosisController = asyncHandler(async (req, res) => { const d = await updateVisitDiagnosisService(req.params.diagnosisId, req.body, req.user); await writeAudit({ user: req.user, action: 'OPD_DIAGNOSIS_UPDATE', module: 'opd', entityId: req.params.diagnosisId, entityType: 'VisitDiagnosis', req }); success(res, d, 'Diagnosis updated'); });
export const removeDiagnosisController = asyncHandler(async (req, res) => { await removeVisitDiagnosisService(req.params.diagnosisId); await writeAudit({ user: req.user, action: 'OPD_DIAGNOSIS_REMOVE', module: 'opd', entityId: req.params.diagnosisId, entityType: 'VisitDiagnosis', req }); success(res, {}, 'Diagnosis removed'); });
export const listDiagnosesController = asyncHandler(async (req, res) => success(res, await listVisitDiagnosesService(req.params.id), 'Diagnoses fetched'));
export const createOrderController = asyncHandler(async (req, res) => { const o = await createClinicalOrderService(req.params.id, req.body, req.user); await writeAudit({ user: req.user, action: 'OPD_ORDER_CREATE', module: 'opd', entityId: req.params.id, entityType: 'OpdVisit', req }); created(res, o[0], 'Order created'); });
export const listOrdersController = asyncHandler(async (req, res) => success(res, await listClinicalOrdersService(req.params.id), 'Orders fetched'));
export const updateOrderStatusController = asyncHandler(async (req, res) => { const o = await updateClinicalOrderStatusService(req.params.orderId, req.body, req.user); await writeAudit({ user: req.user, action: 'OPD_ORDER_STATUS', module: 'opd', entityId: req.params.orderId, entityType: 'ClinicalOrder', req }); success(res, o, 'Order updated'); });
export const createNoteController = asyncHandler(async (req, res) => { const n = await createClinicalNoteService(req.params.id, req.body, req.user); await writeAudit({ user: req.user, action: 'OPD_NOTE_ADD', module: 'opd', entityId: req.params.id, entityType: 'OpdVisit', req }); created(res, n[0], 'Note added'); });
export const listNotesController = asyncHandler(async (req, res) => success(res, await listClinicalNotesService(req.params.id), 'Notes fetched'));
export const updateNoteController = asyncHandler(async (req, res) => { const n = await updateClinicalNoteService(req.params.noteId, req.body, req.user); await writeAudit({ user: req.user, action: 'OPD_NOTE_UPDATE', module: 'opd', entityId: req.params.noteId, entityType: 'ClinicalNote', req }); success(res, n, 'Note updated'); });
export const removeNoteController = asyncHandler(async (req, res) => { await removeClinicalNoteService(req.params.noteId); await writeAudit({ user: req.user, action: 'OPD_NOTE_REMOVE', module: 'opd', entityId: req.params.noteId, entityType: 'ClinicalNote', req }); success(res, {}, 'Note removed'); });
export const scheduleFollowUpController = asyncHandler(async (req, res) => { const f = await scheduleFollowUpService(req.params.id, req.body, req.user); await writeAudit({ user: req.user, action: 'OPD_FOLLOWUP_SCHEDULE', module: 'opd', entityId: req.params.id, entityType: 'OpdVisit', req }); created(res, f[0], 'Follow-up scheduled'); });
export const listFollowUpsController = asyncHandler(async (req, res) => success(res, await listFollowUpsService(req.params.id), 'Follow-ups fetched'));
export const listAllFollowUpsController = asyncHandler(async (req, res) => { const result = await listAllFollowUpsService(req.query); success(res, result.data, 'Follow-ups fetched', result.pagination); });
export const completeFollowUpController = asyncHandler(async (req, res) => { const f = await completeFollowUpService(req.params.followUpId, req.body, req.user); await writeAudit({ user: req.user, action: 'OPD_FOLLOWUP_COMPLETE', module: 'opd', entityId: req.params.followUpId, entityType: 'FollowUp', req }); success(res, f, 'Follow-up completed'); });
export const getVisitBillingController = asyncHandler(async (req, res) => success(res, await getVisitBillingService(req.params.id), 'Visit billing fetched'));
export const getVisitTimelineController = asyncHandler(async (req, res) => success(res, await getVisitTimelineService(req.params.id), 'Visit timeline fetched'));
export const closeVisitController = asyncHandler(async (req, res) => { const v = await closeVisitService(req.params.id, req.body, req.user); await writeAudit({ user: req.user, action: 'OPD_CLOSE', module: 'opd', entityId: req.params.id, entityType: 'OpdVisit', req }); success(res, v, 'Visit closed'); });
export const referVisitController = asyncHandler(async (req, res) => { const v = await referVisitService(req.params.id, req.body, req.user); await writeAudit({ user: req.user, action: 'OPD_REFER', module: 'opd', entityId: req.params.id, entityType: 'OpdVisit', req }); success(res, v, 'Visit referred'); });
export const admitVisitController = asyncHandler(async (req, res) => { const v = await admitVisitService(req.params.id, req.body, req.user); await writeAudit({ user: req.user, action: 'OPD_ADMIT', module: 'opd', entityId: req.params.id, entityType: 'OpdVisit', req }); success(res, v, 'Visit admitted'); });

export const listExaminationTemplatesController = asyncHandler(async (req, res) => { const templates = await listExaminationTemplatesService({ includeInactive: req.query.all === '1' || req.query.all === 'true', specialty: req.query.specialty }); success(res, templates, 'Examination templates fetched'); });
export const createExaminationTemplateController = asyncHandler(async (req, res) => { const t = await createExaminationTemplateService(req.body, req.user); await writeAudit({ user: req.user, action: 'OPD_EXAM_TEMPLATE_CREATE', module: 'opd', entityId: t._id, entityType: 'ExaminationTemplate', req }); created(res, t, 'Examination template created'); });
export const updateExaminationTemplateController = asyncHandler(async (req, res) => { const t = await updateExaminationTemplateService(req.params.id, req.body); await writeAudit({ user: req.user, action: 'OPD_EXAM_TEMPLATE_UPDATE', module: 'opd', entityId: req.params.id, entityType: 'ExaminationTemplate', req }); success(res, t, 'Examination template updated'); });
export const deleteExaminationTemplateController = asyncHandler(async (req, res) => { await deleteExaminationTemplateService(req.params.id); await writeAudit({ user: req.user, action: 'OPD_EXAM_TEMPLATE_DELETE', module: 'opd', entityId: req.params.id, entityType: 'ExaminationTemplate', req }); success(res, {}, 'Examination template deleted'); });
export const searchDiagnosesController = asyncHandler(async (req, res) => success(res, await searchDiagnosesService({ q: req.query.q || '', patientId: req.query.patientId }), 'Diagnoses searched'));
export const finalizePrescriptionController = asyncHandler(async (req, res) => { const p = await finalizePrescriptionService(req.params.id, req.user); await writeAudit({ user: req.user, action: 'OPD_PRESCRIPTION_FINALIZE', module: 'opd', entityId: req.params.id, entityType: 'Prescription', req }); success(res, p, 'Prescription finalized & signed'); });
export const amendPrescriptionController = asyncHandler(async (req, res) => { const p = await amendPrescriptionService(req.params.id, req.body, req.user); await writeAudit({ user: req.user, action: 'OPD_PRESCRIPTION_AMEND', module: 'opd', entityId: req.params.id, entityType: 'Prescription', req }); created(res, p, 'Prescription amended'); });
export const listPrescriptionAmendmentsController = asyncHandler(async (req, res) => success(res, await listPrescriptionAmendmentsService(req.params.id), 'Prescription amendments fetched'));
