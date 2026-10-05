import { success, created } from '../utils/apiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { writeAudit } from '../middleware/audit.js';
import {
  createHierarchy,
  listWards,
  listBeds,
  bedMap,
  bedCommandCenter,
  admitPatient,
  transferBed,
  dischargePatient,
  listAdmissions,
  getAdmission,
  updateBedStatus,
  updateAdmission,
  assignBed,
  planDischarge,
  cancelAdmission,
  waitingList,
  commandCenter,
  admissionWorkspace,
  recordAdmissionVital,
  listAdmissionVitals,
  createAdmissionNursingNote,
  listAdmissionNursingNotes,
  createAdmissionClinicalNote,
  listAdmissionClinicalNotes,
  addMedicationChart,
  listAdmissionMedications,
  administerMedication,
  createAdmissionOrder,
  listAdmissionOrders,
  updateAdmissionOrderStatus,
  reserveBed,
  releaseBed,
  listBedHistory,
  completeBedTurnover,
  listTurnoverQueue,
  admissionAllocations,
  createDoctorVisit,
  listDoctorVisits,
  createInitialAssessment,
  listInitialAssessments,
} from '../services/ipd.service.js';

export const createHierarchyController = asyncHandler(async (req, res) => {
  const result = await createHierarchy(req.body);
  await writeAudit({ user: req.user, action: 'WARD_CREATE', module: 'ipd', entityType: 'Ward', req });
  created(res, result, 'Ward hierarchy created');
});

export const listWardsController = asyncHandler(async (req, res) => {
  success(res, await listWards(), 'Wards fetched');
});

export const listBedsController = asyncHandler(async (req, res) => {
  success(res, await listBeds(req.query), 'Beds fetched');
});

export const bedMapController = asyncHandler(async (req, res) => {
  success(res, await bedMap(), 'Bed map fetched');
});

export const bedCommandCenterController = asyncHandler(async (req, res) => {
  success(res, await bedCommandCenter(), 'Bed command center fetched');
});

export const updateBedStatusController = asyncHandler(async (req, res) => {
  const bed = await updateBedStatus(req.params.id, req.body.status, req.user, req.body.reason || req.body.blockedReason);
  await writeAudit({ user: req.user, action: 'BED_STATUS_CHANGE', module: 'ipd', entityId: req.params.id, entityType: 'Bed', req });
  success(res, bed, 'Bed status updated');
});

export const admitController = asyncHandler(async (req, res) => {
  const admission = await admitPatient(req.body, req.user);
  await writeAudit({ user: req.user, action: 'IPD_ADMIT', module: 'ipd', entityId: admission._id, entityType: 'IpdAdmission', req });
  created(res, admission, `Admission created: ${admission.admissionNumber}`);
});

export const transferController = asyncHandler(async (req, res) => {
  const admission = await transferBed(req.params.id, req.body.newBedId, req.user, req.body.reason);
  await writeAudit({ user: req.user, action: 'IPD_TRANSFER', module: 'ipd', entityId: req.params.id, entityType: 'IpdAdmission', req });
  success(res, admission, 'Bed transferred');
});

export const dischargeController = asyncHandler(async (req, res) => {
  // The discharge clearance gate is never client-overridable — `skipClearance`
  // is an internal-only escape hatch for trusted server code.
  const { skipClearance, ...payload } = req.body || {};
  const result = await dischargePatient(req.params.id, payload, req.user);
  await writeAudit({ user: req.user, action: 'IPD_DISCHARGE', module: 'ipd', entityId: req.params.id, entityType: 'IpdAdmission', req });
  success(res, result, 'Patient discharged');
});

export const listAdmissionsController = asyncHandler(async (req, res) => {
  const result = await listAdmissions(req.query);
  success(res, result.data, 'Admissions fetched', result.pagination);
});

export const getAdmissionController = asyncHandler(async (req, res) => {
  success(res, await getAdmission(req.params.id), 'Admission fetched');
});

export const commandCenterController = asyncHandler(async (req, res) => {
  success(res, await commandCenter(), 'IPD command center fetched');
});

export const admissionWorkspaceController = asyncHandler(async (req, res) => {
  success(res, await admissionWorkspace(req.params.id), 'Admission workspace fetched');
});

export const updateAdmissionController = asyncHandler(async (req, res) => {
  const admission = await updateAdmission(req.params.id, req.body, req.user);
  await writeAudit({ user: req.user, action: 'IPD_UPDATE', module: 'ipd', entityId: req.params.id, entityType: 'IpdAdmission', req });
  success(res, admission, 'Admission updated');
});

export const assignBedController = asyncHandler(async (req, res) => {
  const admission = await assignBed(req.params.id, req.body.bedId, req.user, req.body.reason);
  await writeAudit({ user: req.user, action: 'IPD_ADMIT', module: 'ipd', entityId: req.params.id, entityType: 'IpdAdmission', req });
  success(res, admission, 'Bed assigned');
});

export const planDischargeController = asyncHandler(async (req, res) => {
  const admission = await planDischarge(req.params.id, req.body, req.user);
  await writeAudit({ user: req.user, action: 'IPD_DISCHARGE_PLAN', module: 'ipd', entityId: req.params.id, entityType: 'IpdAdmission', req });
  success(res, admission, 'Discharge planned');
});

export const cancelAdmissionController = asyncHandler(async (req, res) => {
  const admission = await cancelAdmission(req.params.id, req.body.reason, req.user);
  await writeAudit({ user: req.user, action: 'IPD_CANCEL', module: 'ipd', entityId: req.params.id, entityType: 'IpdAdmission', req });
  success(res, admission, 'Admission cancelled');
});

export const waitingListController = asyncHandler(async (req, res) => {
  success(res, await waitingList(), 'Waiting admissions fetched');
});

// ===== IPD CLINICAL DOCUMENTATION =====
export const recordVitalController = asyncHandler(async (req, res) => {
  const vital = await recordAdmissionVital(req.params.id, req.body, req.user);
  await writeAudit({ user: req.user, action: 'IPD_VITAL', module: 'ipd', entityId: req.params.id, entityType: 'IpdAdmission', req });
  created(res, vital, 'Vitals recorded');
});

export const listVitalsController = asyncHandler(async (req, res) => {
  success(res, await listAdmissionVitals(req.params.id, req.query.limit), 'Vitals fetched');
});

export const createNursingNoteController = asyncHandler(async (req, res) => {
  const note = await createAdmissionNursingNote(req.params.id, req.body, req.user);
  await writeAudit({ user: req.user, action: 'IPD_NURSING_NOTE', module: 'ipd', entityId: req.params.id, entityType: 'IpdAdmission', req });
  created(res, note, 'Nursing note saved');
});

export const listNursingNotesController = asyncHandler(async (req, res) => {
  success(res, await listAdmissionNursingNotes(req.params.id), 'Nursing notes fetched');
});

export const createClinicalNoteController = asyncHandler(async (req, res) => {
  const note = await createAdmissionClinicalNote(req.params.id, req.body, req.user);
  await writeAudit({ user: req.user, action: 'IPD_CLINICAL_NOTE', module: 'ipd', entityId: req.params.id, entityType: 'IpdAdmission', req });
  created(res, note, 'Clinical note saved');
});

export const listClinicalNotesController = asyncHandler(async (req, res) => {
  success(res, await listAdmissionClinicalNotes(req.params.id), 'Clinical notes fetched');
});

export const addMedicationController = asyncHandler(async (req, res) => {
  const chart = await addMedicationChart(req.params.id, req.body, req.user);
  await writeAudit({ user: req.user, action: 'IPD_DRUG_ORDER', module: 'ipd', entityId: req.params.id, entityType: 'IpdAdmission', req });
  created(res, chart, 'Medication charted');
});

export const listMedicationsController = asyncHandler(async (req, res) => {
  success(res, await listAdmissionMedications(req.params.id), 'Medication charts fetched');
});

export const administerMedicationController = asyncHandler(async (req, res) => {
  const chart = await administerMedication(req.params.chartId, req.body, req.user);
  await writeAudit({ user: req.user, action: 'IPD_DRUG_ADMIN', module: 'ipd', entityId: req.params.chartId, entityType: 'MedicationChart', req });
  success(res, chart, 'Medication administration recorded');
});

export const createOrderController = asyncHandler(async (req, res) => {
  const order = await createAdmissionOrder(req.params.id, req.body, req.user);
  await writeAudit({ user: req.user, action: 'IPD_ORDER', module: 'ipd', entityId: req.params.id, entityType: 'IpdAdmission', req });
  created(res, order, 'Order created');
});

export const listOrdersController = asyncHandler(async (req, res) => {
  success(res, await listAdmissionOrders(req.params.id), 'Orders fetched');
});

export const updateOrderStatusController = asyncHandler(async (req, res) => {
  const order = await updateAdmissionOrderStatus(req.params.orderId, req.body.status, req.user);
  await writeAudit({ user: req.user, action: 'IPD_ORDER_STATUS', module: 'ipd', entityId: req.params.orderId, entityType: 'ClinicalOrder', req });
  success(res, order, 'Order status updated');
});

export const reserveBedController = asyncHandler(async (req, res) => {
  const bed = await reserveBed(req.params.id, req.body, req.user);
  await writeAudit({ user: req.user, action: 'BED_RESERVE', module: 'ipd', entityId: req.params.id, entityType: 'Bed', req });
  success(res, bed, 'Bed reserved');
});

export const releaseBedController = asyncHandler(async (req, res) => {
  const bed = await releaseBed(req.params.id, req.body, req.user);
  await writeAudit({ user: req.user, action: 'BED_RELEASE', module: 'ipd', entityId: req.params.id, entityType: 'Bed', req });
  success(res, bed, 'Bed released');
});

export const listBedHistoryController = asyncHandler(async (req, res) => {
  success(res, await listBedHistory(req.params.id), 'Bed history fetched');
});

export const completeBedTurnoverController = asyncHandler(async (req, res) => {
  const bed = await completeBedTurnover(req.params.id, req.body, req.user);
  success(res, bed, `Bed ${bed.bedNumber} cleaned and available`);
});

export const listTurnoverQueueController = asyncHandler(async (req, res) => {
  success(res, await listTurnoverQueue(), 'Turnover queue fetched');
});

export const admissionAllocationsController = asyncHandler(async (req, res) => {
  success(res, await admissionAllocations(req.params.id), 'Allocation history fetched');
});

// ===== DOCTOR VISITS =====
export const createDoctorVisitController = asyncHandler(async (req, res) => {
  const visit = await createDoctorVisit(req.params.id, req.body, req.user);
  await writeAudit({ user: req.user, action: 'IPD_DOCTOR_VISIT', module: 'ipd', entityId: req.params.id, entityType: 'IpdAdmission', req });
  created(res, visit, 'Doctor visit recorded');
});

export const listDoctorVisitsController = asyncHandler(async (req, res) => {
  success(res, await listDoctorVisits(req.params.id), 'Doctor visits fetched');
});

// ===== INITIAL ASSESSMENT =====
export const createInitialAssessmentController = asyncHandler(async (req, res) => {
  const note = await createInitialAssessment(req.params.id, req.body, req.user);
  await writeAudit({ user: req.user, action: 'IPD_INITIAL_ASSESSMENT', module: 'ipd', entityId: req.params.id, entityType: 'IpdAdmission', req });
  created(res, note, 'Initial assessment saved');
});

export const listInitialAssessmentsController = asyncHandler(async (req, res) => {
  success(res, await listInitialAssessments(req.params.id), 'Initial assessments fetched');
});