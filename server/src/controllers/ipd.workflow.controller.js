import { success, created } from '../utils/apiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { writeAudit } from '../middleware/audit.js';
import {
  scheduleMedication,
  listMar,
  recordMarAdministration,
  listMedicationCharts,
  createPharmacyRequest,
  listPharmacyRequests,
  verifyPharmacyRequest,
  dispensePharmacyRequest,
  returnPharmacyRequest,
  listPharmacyBatches,
  createLabOrderForAdmission,
  listAdmissionLabOrders,
  flagCriticalLabResult,
  createRadiologyOrderForAdmission,
  listAdmissionRadiologyOrders,
  updateRadiologyOrder,
  saveRadiologyReport,
  verifyRadiologyReport,
  recordIoEntry,
  listIoEntries,
  createProcedure,
  listProcedures,
  updateProcedure,
  createOtRequest,
  listOtRequests,
  updateOtRequest,
  createDietOrder,
  listDietOrders,
  updateDietMeal,
  createBloodRequest,
  listBloodRequests,
  updateBloodRequest,
  createPhysioRequest,
  listPhysioRequests,
  recordPhysioSession,
} from '../services/ipd.workflow.service.js';

// ===== 16. MAR =====
export const scheduleMedicationController = asyncHandler(async (req, res) => {
  const chart = await scheduleMedication(req.params.chartId, req.body, req.user);
  await writeAudit({ user: req.user, action: 'IPD_MAR_SCHEDULE', module: 'ipd', entityId: req.params.chartId, entityType: 'MedicationChart', req });
  success(res, chart, 'MAR schedule created');
});

export const listMarController = asyncHandler(async (req, res) => {
  success(res, await listMar(req.params.id), 'MAR fetched');
});

export const recordMarAdministrationController = asyncHandler(async (req, res) => {
  const chart = await recordMarAdministration(req.params.chartId, req.params.administrationId, req.body, req.user);
  await writeAudit({ user: req.user, action: 'IPD_MAR_ADMINISTER', module: 'ipd', entityId: req.params.chartId, entityType: 'MedicationChart', data: { status: req.body.status, remark: req.body.remark }, req });
  success(res, chart, 'Administration recorded');
});

export const listMedicationChartsController = asyncHandler(async (req, res) => {
  success(res, await listMedicationCharts(req.params.id), 'Medication charts fetched');
});

// ===== 17. Pharmacy =====
export const createPharmacyRequestController = asyncHandler(async (req, res) => {
  const request = await createPharmacyRequest(req.params.id, req.body, req.user);
  await writeAudit({ user: req.user, action: 'IPD_PHARMACY_REQUEST', module: 'ipd', entityId: request._id, entityType: 'PharmacyRequest', req });
  created(res, request, `Pharmacy request ${request.requestNumber} raised`);
});

export const listPharmacyRequestsController = asyncHandler(async (req, res) => {
  success(res, await listPharmacyRequests(req.params.id), 'Pharmacy requests fetched');
});

export const listPharmacyBatchesController = asyncHandler(async (req, res) => {
  success(res, await listPharmacyBatches(req.params.medicineId), 'Batches fetched');
});

export const verifyPharmacyRequestController = asyncHandler(async (req, res) => {
  const request = await verifyPharmacyRequest(req.params.requestId, req.body, req.user);
  await writeAudit({ user: req.user, action: 'IPD_PHARMACY_VERIFY', module: 'ipd', entityId: req.params.requestId, entityType: 'PharmacyRequest', req });
  success(res, request, 'Pharmacy request verified');
});

export const dispensePharmacyRequestController = asyncHandler(async (req, res) => {
  const request = await dispensePharmacyRequest(req.params.requestId, req.body, req.user);
  await writeAudit({ user: req.user, action: 'IPD_PHARMACY_DISPENSE', module: 'ipd', entityId: req.params.requestId, entityType: 'PharmacyRequest', data: { quantity: req.body?.quantity }, req });
  success(res, request, 'Medicine dispensed to ward');
});

export const returnPharmacyRequestController = asyncHandler(async (req, res) => {
  const request = await returnPharmacyRequest(req.params.requestId, req.body, req.user);
  await writeAudit({ user: req.user, action: 'IPD_PHARMACY_RETURN', module: 'ipd', entityId: req.params.requestId, entityType: 'PharmacyRequest', data: { quantity: req.body?.quantity, wastage: req.body?.wastageQuantity }, req });
  success(res, request, 'Medicine returned to pharmacy');
});

// ===== 18. Lab =====
export const createLabOrderController = asyncHandler(async (req, res) => {
  const order = await createLabOrderForAdmission(req.params.id, req.body, req.user);
  await writeAudit({ user: req.user, action: 'IPD_LAB_ORDER', module: 'ipd', entityId: order._id, entityType: 'LabOrder', req });
  created(res, order, 'Lab order created');
});

export const listLabOrdersController = asyncHandler(async (req, res) => {
  success(res, await listAdmissionLabOrders(req.params.id), 'Lab orders fetched');
});

export const flagCriticalResultController = asyncHandler(async (req, res) => {
  const result = await flagCriticalLabResult(req.params.resultId, req.body, req.user);
  await writeAudit({ user: req.user, action: 'IPD_LAB_CRITICAL_ALERT', module: 'ipd', entityId: req.params.resultId, entityType: 'LabResult', req });
  success(res, result, 'Critical result flagged and alerts sent');
});

// ===== 19. Radiology =====
export const createRadiologyOrderController = asyncHandler(async (req, res) => {
  const order = await createRadiologyOrderForAdmission(req.params.id, req.body, req.user);
  await writeAudit({ user: req.user, action: 'IPD_RADIOLOGY_ORDER', module: 'ipd', entityId: order._id, entityType: 'RadiologyOrder', req });
  created(res, order, 'Imaging order created');
});

export const listRadiologyOrdersController = asyncHandler(async (req, res) => {
  success(res, await listAdmissionRadiologyOrders(req.params.id), 'Imaging orders fetched');
});

export const updateRadiologyOrderController = asyncHandler(async (req, res) => {
  const order = await updateRadiologyOrder(req.params.orderId, req.body, req.user);
  await writeAudit({ user: req.user, action: 'IPD_RADIOLOGY_STATUS', module: 'ipd', entityId: req.params.orderId, entityType: 'RadiologyOrder', req });
  success(res, order, 'Imaging order updated');
});

export const saveRadiologyReportController = asyncHandler(async (req, res) => {
  const report = await saveRadiologyReport(req.body, req.user);
  await writeAudit({ user: req.user, action: 'IPD_RADIOLOGY_REPORT', module: 'ipd', entityId: report._id, entityType: 'RadiologyReport', req });
  created(res, report, 'Imaging report entered');
});

export const verifyRadiologyReportController = asyncHandler(async (req, res) => {
  const report = await verifyRadiologyReport(req.params.reportId, req.user);
  await writeAudit({ user: req.user, action: 'IPD_RADIOLOGY_VERIFY', module: 'ipd', entityId: req.params.reportId, entityType: 'RadiologyReport', req });
  success(res, report, 'Imaging report verified');
});

// ===== 20. I/O chart =====
export const recordIoController = asyncHandler(async (req, res) => {
  const entry = await recordIoEntry(req.params.id, req.body, req.user);
  await writeAudit({ user: req.user, action: 'IPD_IO_RECORD', module: 'ipd', entityId: entry._id, entityType: 'IoChartEntry', req });
  created(res, entry, 'I/O entry recorded');
});

export const listIoController = asyncHandler(async (req, res) => {
  success(res, await listIoEntries(req.params.id), 'I/O chart fetched');
});

// ===== 21. Procedures =====
export const createProcedureController = asyncHandler(async (req, res) => {
  const procedure = await createProcedure(req.params.id, req.body, req.user);
  await writeAudit({ user: req.user, action: 'IPD_PROCEDURE_CREATE', module: 'ipd', entityId: procedure._id, entityType: 'ProcedureRecord', req });
  created(res, procedure, 'Procedure recorded');
});

export const listProceduresController = asyncHandler(async (req, res) => {
  success(res, await listProcedures(req.params.id), 'Procedures fetched');
});

export const updateProcedureController = asyncHandler(async (req, res) => {
  const procedure = await updateProcedure(req.params.procedureId, req.body, req.user);
  await writeAudit({ user: req.user, action: 'IPD_PROCEDURE_UPDATE', module: 'ipd', entityId: req.params.procedureId, entityType: 'ProcedureRecord', data: { status: req.body.status }, req });
  success(res, procedure, 'Procedure updated');
});

// ===== 22. OT =====
export const createOtRequestController = asyncHandler(async (req, res) => {
  const surgery = await createOtRequest(req.params.id, req.body, req.user);
  await writeAudit({ user: req.user, action: 'IPD_OT_REQUEST', module: 'ipd', entityId: surgery._id, entityType: 'Surgery', req });
  created(res, surgery, `OT request booked: ${surgery.surgeryNumber || ''}`);
});

export const listOtRequestsController = asyncHandler(async (req, res) => {
  success(res, await listOtRequests(req.params.id), 'OT requests fetched');
});

export const updateOtRequestController = asyncHandler(async (req, res) => {
  const surgery = await updateOtRequest(req.params.surgeryId, req.body, req.user);
  await writeAudit({ user: req.user, action: 'IPD_OT_UPDATE', module: 'ipd', entityId: req.params.surgeryId, entityType: 'Surgery', data: { status: req.body.status }, req });
  success(res, surgery, 'OT request updated');
});

// ===== 23. Diet =====
export const createDietOrderController = asyncHandler(async (req, res) => {
  const order = await createDietOrder(req.params.id, req.body, req.user);
  await writeAudit({ user: req.user, action: 'IPD_DIET_ORDER', module: 'ipd', entityId: order._id, entityType: 'DietOrder', req });
  created(res, order, 'Diet order placed');
});

export const listDietOrdersController = asyncHandler(async (req, res) => {
  success(res, await listDietOrders(req.params.id), 'Diet orders fetched');
});

export const updateDietMealController = asyncHandler(async (req, res) => {
  const order = await updateDietMeal(req.params.orderId, req.params.meal, req.body, req.user);
  await writeAudit({ user: req.user, action: 'IPD_DIET_MEAL_STATUS', module: 'ipd', entityId: req.params.orderId, entityType: 'DietOrder', data: { meal: req.params.meal, status: req.body.status }, req });
  success(res, order, 'Meal updated');
});

// ===== 24. Blood bank =====
export const createBloodRequestController = asyncHandler(async (req, res) => {
  const request = await createBloodRequest(req.params.id, req.body, req.user);
  await writeAudit({ user: req.user, action: 'IPD_BLOOD_REQUEST', module: 'ipd', entityId: request._id, entityType: 'BloodRequest', req });
  created(res, request, `Blood request ${request.requestNumber} raised`);
});

export const listBloodRequestsController = asyncHandler(async (req, res) => {
  success(res, await listBloodRequests(req.params.id), 'Blood requests fetched');
});

export const updateBloodRequestController = asyncHandler(async (req, res) => {
  const request = await updateBloodRequest(req.params.requestId, req.body, req.user);
  await writeAudit({ user: req.user, action: 'IPD_BLOOD_STATUS', module: 'ipd', entityId: req.params.requestId, entityType: 'BloodRequest', data: { status: req.body.status }, req });
  success(res, request, 'Blood request updated');
});

// ===== 25. Physiotherapy =====
export const createPhysioRequestController = asyncHandler(async (req, res) => {
  const request = await createPhysioRequest(req.params.id, req.body, req.user);
  await writeAudit({ user: req.user, action: 'IPD_PHYSIO_REQUEST', module: 'ipd', entityId: request._id, entityType: 'PhysiotherapyRequest', req });
  created(res, request, 'Physiotherapy request created');
});

export const listPhysioRequestsController = asyncHandler(async (req, res) => {
  success(res, await listPhysioRequests(req.params.id), 'Physiotherapy requests fetched');
});

export const recordPhysioSessionController = asyncHandler(async (req, res) => {
  const request = await recordPhysioSession(req.params.requestId, req.params.sessionId, req.body, req.user);
  await writeAudit({ user: req.user, action: 'IPD_PHYSIO_SESSION', module: 'ipd', entityId: req.params.requestId, entityType: 'PhysiotherapyRequest', data: { status: req.body.status }, req });
  success(res, request, 'Session recorded');
});
