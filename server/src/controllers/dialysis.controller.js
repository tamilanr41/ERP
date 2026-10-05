import {
  registerDialysisPatient, listDialysisPatients, getDialysisPatient, updateDialysisPatient,
  createPrescription, listPrescriptions, getActivePrescription, setPrescriptionStatus,
  scheduleSession, getSession, listSessions, patientHistory,
  checkInContext, checkInSession, preAssessSession, markSessionReady, connectSession, startSession, startContext,
  recordMonitoring, giveMedication, addComplication, resolveComplication,
  postAssessSession, postContext, disconnectSession, cancelSession, markNoShow,
  listConsumables, upsertConsumable, issueConsumables, returnConsumables,
  buildSessionBill, recordSessionPayment, listSessionPayments,
  commandCenter, listMachines, upsertMachine, changeMachineStatus, deactivateMachine,
  listStations, upsertStation, changeStationStatus, deactivateStation, recordMachineService, listMachineService, machineServiceDue,
  orderSessionLabs, listSessionLabs,
  getAccess, createAccess, updateAccess, listAccessRegistry, assessAccess, accessHistory,
} from '../services/dialysis.service.js';
import {
  confirmSession, assignSession, rescheduleSession, cancelSessionByDesk, markWaiting, abandonSession,
  createRecurringSchedule, listRecurringSchedules, getRecurringSchedule, updateRecurringSchedule,
  generateScheduleSessions, slotBoard,
} from '../services/dialysis.schedule.service.js';
import {
  assessmentContext, createAssessment, getAssessment, listAssessments, amendAssessment, assessmentVersions,
} from '../services/dialysis.assessment.service.js';
import { getDialysisConfig, updateDialysisConfig, prescriptionDefaults, schedulingConfig } from '../services/dialysis.config.service.js';
import asyncHandler from '../utils/asyncHandler.js';
import { success, created } from '../utils/apiResponse.js';
import { writeAudit } from '../middleware/audit.js';

const meta = (req) => ({ req });

// ---- patients
export const registerController = asyncHandler(async (req, res) => {
  const record = await registerDialysisPatient(req.body, req.user);
  success(res, record, `Registered for dialysis as ${record.dialysisNumber}`);
});

export const listController = asyncHandler(async (req, res) => {
  const result = await listDialysisPatients(req.query);
  success(res, result.rows, 'Dialysis patients fetched', { pagination: { page: result.page, limit: result.limit, total: result.total, pages: result.pages } });
});

export const getController = asyncHandler(async (req, res) => {
  const [record, sessions, prescriptions, access] = await Promise.all([
    getDialysisPatient(req.params.id),
    patientHistory(req.params.id, 50),
    listPrescriptions((await getDialysisPatient(req.params.id)).patientId?._id || (await getDialysisPatient(req.params.id)).patientId, 20),
    getAccess((await getDialysisPatient(req.params.id)).patientId?._id || (await getDialysisPatient(req.params.id)).patientId),
  ]);
  const activePrescription = await getActivePrescription(record.patientId?._id || record.patientId);
  success(res, { ...record.toObject(), sessions, prescriptions, activePrescription, access }, 'Dialysis patient fetched');
});

export const updateController = asyncHandler(async (req, res) => {
  success(res, await updateDialysisPatient(req.params.id, req.body, req.user), 'Dialysis patient updated');
});

// ---- prescription
export const prescribeController = asyncHandler(async (req, res) => {
  const p = await createPrescription(req.body, req.user);
  created(res, p, `Prescription ${p.prescriptionNumber} written`);
});

export const prescriptionsController = asyncHandler(async (req, res) => {
  success(res, await listPrescriptions(req.params.patientId, req.query.limit), 'Prescriptions fetched');
});

// ---- sessions
export const scheduleController = asyncHandler(async (req, res) => {
  const session = await scheduleSession(req.body, req.user);
  created(res, session, `Session ${session.sessionNumber} scheduled`);
});

export const sessionListController = asyncHandler(async (req, res) => {
  const result = await listSessions(req.query);
  success(res, result.rows, 'Sessions fetched', { pagination: { page: result.page, limit: result.limit, total: result.total, pages: result.pages } });
});

export const sessionGetController = asyncHandler(async (req, res) => {
  success(res, await getSession(req.params.id), 'Session fetched');
});

export const historyController = asyncHandler(async (req, res) => {
  success(res, await patientHistory(req.params.patientId, req.query.limit), 'Patient session history fetched');
});

export const checkInController = asyncHandler(async (req, res) => {
  success(res, await checkInSession(req.params.id, req.body, req.user), 'Patient checked in');
});

export const preAssessController = asyncHandler(async (req, res) => {
  success(res, await preAssessSession(req.params.id, req.body, req.user), 'Pre-dialysis assessment recorded');
});

export const readyController = asyncHandler(async (req, res) => {
  success(res, await markSessionReady(req.params.id, req.body, req.user), 'Session ready — consumables can be issued');
});

export const connectController = asyncHandler(async (req, res) => {
  success(res, await connectSession(req.params.id, req.body, req.user), 'Patient connected');
});

export const startContextController = asyncHandler(async (req, res) => {
  success(res, await startContext(req.params.id, req.user), 'Session start checks loaded');
});

export const startController = asyncHandler(async (req, res) => {
  success(res, await startSession(req.params.id, req.body, req.user), 'Dialysis started');
});

export const monitorController = asyncHandler(async (req, res) => {
  success(res, await recordMonitoring(req.params.id, req.body, req.user), 'Monitoring recorded');
});

export const medicationController = asyncHandler(async (req, res) => {
  success(res, await giveMedication(req.params.id, req.body, req.user), 'Medication recorded');
});

export const complicationController = asyncHandler(async (req, res) => {
  success(res, await addComplication(req.params.id, req.body, req.user), 'Complication recorded');
});

export const resolveComplicationController = asyncHandler(async (req, res) => {
  success(res, await resolveComplication(req.params.id, req.params.complicationId, req.body, req.user), 'Complication resolved');
});

export const postContextController = asyncHandler(async (req, res) => {
  success(res, await postContext(req.params.id, req.user), 'Session completion checks loaded');
});

export const postAssessController = asyncHandler(async (req, res) => {
  success(res, await postAssessSession(req.params.id, req.body, req.user), 'Post-dialysis assessment recorded');
});

export const disconnectController = asyncHandler(async (req, res) => {
  success(res, await disconnectSession(req.params.id, req.body || {}, req.user), 'Patient disconnected — machine to cleaning');
});

export const cancelController = asyncHandler(async (req, res) => {
  success(res, await cancelSession(req.params.id, req.body, req.user), 'Session cancelled');
});

export const noShowController = asyncHandler(async (req, res) => {
  success(res, await markNoShow(req.params.id, req.body || {}, req.user), 'Marked as no-show');
});

// ---- lab bridge
export const orderLabsController = asyncHandler(async (req, res) => {
  const result = await orderSessionLabs(req.params.id, req.body, req.user);
  created(res, result.order, `Lab order ` + result.order.labOrderNumber + ' raised');
});

export const listLabsController = asyncHandler(async (req, res) => {
  success(res, await listSessionLabs(req.params.id), 'Session investigations fetched');
});

// ---- consumables
export const consumableListController = asyncHandler(async (req, res) => {
  success(res, await listConsumables(req.query), 'Consumables fetched');
});

export const consumableUpsertController = asyncHandler(async (req, res) => {
  success(res, await upsertConsumable(req.body, req.user), 'Consumable saved');
});

export const issueConsumablesController = asyncHandler(async (req, res) => {
  const result = await issueConsumables(req.params.id, req.body.items, req.user);
  const skipped = result.skipped?.length ? `, ${result.skipped.length} already issued` : '';
  success(res, result, `${result.issued.length} consumable(s) issued and stock reduced${skipped}`);
});

export const returnConsumablesController = asyncHandler(async (req, res) => {
  const result = await returnConsumables(req.params.id, req.body.items, req.user);
  success(res, result, `${result.returned.length} consumable(s) returned to stock`);
});

// ---- billing
export const buildBillController = asyncHandler(async (req, res) => {
  const result = await buildSessionBill(req.params.id, req.body || {}, req.user);
  await writeAudit({ user: req.user, action: 'DIALYSIS_BILL', module: 'dialysis', entityId: req.params.id, entityType: 'DialysisSession', req });
  success(res, result, `Bill ${result.bill.billNumber} generated`);
});

export const payController = asyncHandler(async (req, res) => {
  success(res, await recordSessionPayment(req.params.id, req.body, req.user), 'Payment recorded');
});

export const listSessionPaymentsController = asyncHandler(async (req, res) => {
  success(res, await listSessionPayments(req.params.id), 'Session payments listed');
});

// ---- command centre
export const commandCenterController = asyncHandler(async (req, res) => {
  success(res, await commandCenter(req.query.date), 'Dialysis command centre data');
});

// ---- machines / stations
export const machineListController = asyncHandler(async (req, res) => {
  success(res, await listMachines(req.query), 'Machines fetched');
});

export const machineUpsertController = asyncHandler(async (req, res) => {
  success(res, await upsertMachine(req.body, req.user), 'Machine saved');
});

export const machineStatusController = asyncHandler(async (req, res) => {
  success(res, await changeMachineStatus(req.params.id, req.body.status, req.body, req.user), 'Machine status updated');
});

export const machineRetireController = asyncHandler(async (req, res) => {
  success(res, await deactivateMachine(req.params.id, req.body, req.user), 'Machine retired from the roster');
});

export const stationListController = asyncHandler(async (req, res) => {
  success(res, await listStations(req.query), 'Stations fetched');
});

export const stationUpsertController = asyncHandler(async (req, res) => {
  success(res, await upsertStation(req.body, req.user), 'Station saved');
});

export const stationStatusController = asyncHandler(async (req, res) => {
  success(res, await changeStationStatus(req.params.id, req.body.status, req.body, req.user), 'Station status updated');
});

export const stationRetireController = asyncHandler(async (req, res) => {
  success(res, await deactivateStation(req.params.id, req.body, req.user), 'Bay retired from the roster');
});

export const machineServiceController = asyncHandler(async (req, res) => {
  success(res, await listMachineService(req.params.id), 'Machine service history fetched');
});

export const machineServiceDueController = asyncHandler(async (req, res) => {
  success(res, await machineServiceDue(), 'Service due list fetched');
});

export const machineServiceRecordController = asyncHandler(async (req, res) => {
  success(res, await recordMachineService(req.params.id, req.body, req.user), 'Service recorded');
});

export const accessAssessController = asyncHandler(async (req, res) => {
  success(res, await assessAccess(req.params.id, req.body, req.user), 'Access assessment recorded');
});

export const accessHistoryController = asyncHandler(async (req, res) => {
  success(res, await accessHistory(req.params.id), 'Access history fetched');
});

export const checkInContextController = asyncHandler(async (req, res) => {
  success(res, await checkInContext(req.params.id), 'Check-in verification loaded');
});

// ---- access
export const accessListController = asyncHandler(async (req, res) => {
  success(res, await listAccessRegistry(req.query), 'Access registry fetched');
});

export const accessGetController = asyncHandler(async (req, res) => {
  success(res, await getAccess(req.params.patientId), 'Access records fetched');
});

export const accessCreateController = asyncHandler(async (req, res) => {
  created(res, await createAccess(req.body, req.user), 'Access recorded');
});

export const accessUpdateController = asyncHandler(async (req, res) => {
  success(res, await updateAccess(req.params.id, req.body, req.user), 'Access updated');
});

// ---- patient 360
export const patient360Controller = asyncHandler(async (req, res) => {
  const { patient360 } = await import('../services/dialysis.billing.service.js');
  success(res, await patient360(req.params.id), 'Dialysis patient 360 fetched');
});

// ---- charge configuration
export const chargeGetController = asyncHandler(async (req, res) => {
  const { getChargeConfig } = await import('../services/dialysis.billing.service.js');
  success(res, await getChargeConfig(), 'Dialysis charge fetched');
});

export const chargeUpdateController = asyncHandler(async (req, res) => {
  const { updateChargeConfig } = await import('../services/dialysis.billing.service.js');
  success(res, await updateChargeConfig(req.body, req.user), 'Dialysis charge updated');
});

// ============================================================
// HOSPITAL CONFIGURATION (spec 7/8/9/10 — nothing clinical is hard-coded)
// ============================================================
export const configGetController = asyncHandler(async (req, res) => {
  success(res, await getDialysisConfig(req.user?.hospitalId, req.user?.branchId), 'Dialysis configuration fetched');
});

export const configUpdateController = asyncHandler(async (req, res) => {
  success(res, await updateDialysisConfig(req.body, req.user), 'Dialysis configuration updated');
});

export const prescriptionDefaultsController = asyncHandler(async (req, res) => {
  const [rx, scheduling] = await Promise.all([prescriptionDefaults(), schedulingConfig()]);
  success(res, { ...rx, scheduling }, 'Dialysis prescription defaults and scheduling rules');
});

// ============================================================
// NEPHROLOGY ASSESSMENT (spec 6)
// ============================================================
export const assessmentContextController = asyncHandler(async (req, res) => {
  success(res, await assessmentContext(req.params.id), 'Assessment context fetched');
});

export const assessmentCreateController = asyncHandler(async (req, res) => {
  const a = await createAssessment(req.body, req.user);
  created(res, a, `Assessment ${a.assessmentNumber} (v${a.version}) recorded`);
});

export const assessmentListController = asyncHandler(async (req, res) => {
  const result = await listAssessments(req.query);
  success(res, result.rows, 'Assessments fetched', { pagination: { page: result.page, limit: result.limit, total: result.total, pages: result.pages } });
});

export const assessmentGetController = asyncHandler(async (req, res) => {
  success(res, await getAssessment(req.params.id), 'Assessment fetched');
});

export const assessmentVersionsController = asyncHandler(async (req, res) => {
  success(res, await assessmentVersions(req.params.id), 'Assessment versions fetched');
});

export const assessmentAmendController = asyncHandler(async (req, res) => {
  const a = await amendAssessment(req.params.id, req.body, req.user);
  created(res, a, `Assessment amended — new version ${a.version}`);
});

// ============================================================
// PRESCRIPTION LIFECYCLE (spec 7)
// ============================================================
export const prescriptionStatusController = asyncHandler(async (req, res) => {
  success(res, await setPrescriptionStatus(req.params.id, req.body.status, req.body, req.user), 'Prescription status updated');
});

// ============================================================
// SCHEDULING (spec 8)
// ============================================================
export const sessionConfirmController = asyncHandler(async (req, res) => {
  success(res, await confirmSession(req.params.id, req.body, req.user), 'Session confirmed');
});

export const sessionAssignController = asyncHandler(async (req, res) => {
  success(res, await assignSession(req.params.id, req.body, req.user), 'Session assigned');
});

export const sessionRescheduleController = asyncHandler(async (req, res) => {
  const result = await rescheduleSession(req.params.id, req.body, req.user);
  success(res, result, `Rescheduled to ${result.replacement.sessionNumber}`);
});

export const sessionCancelDeskController = asyncHandler(async (req, res) => {
  success(res, await cancelSessionByDesk(req.params.id, req.body, req.user), 'Session cancelled by the scheduling desk');
});

export const sessionWaitingController = asyncHandler(async (req, res) => {
  success(res, await markWaiting(req.params.id, req.body, req.user), 'Session moved to the waiting list');
});

export const sessionAbandonController = asyncHandler(async (req, res) => {
  success(res, await abandonSession(req.params.id, req.body, req.user), 'Session abandoned — machine and bay released for cleaning');
});

// ============================================================
// RECURRING SCHEDULE (spec 9)
// ============================================================
export const scheduleListController = asyncHandler(async (req, res) => {
  success(res, await listRecurringSchedules(req.query), 'Recurring schedules fetched');
});

export const scheduleCreateController = asyncHandler(async (req, res) => {
  const result = await createRecurringSchedule(req.body, req.user);
  const schedule = result.schedule.toObject ? result.schedule.toObject() : result.schedule;
  created(res, { ...schedule, generated: result.generated }, `Recurring schedule ${schedule.scheduleNumber} created with ${result.generated.length} session(s)`);
});

export const scheduleGetController = asyncHandler(async (req, res) => {
  success(res, await getRecurringSchedule(req.params.id), 'Recurring schedule fetched');
});

export const scheduleUpdateController = asyncHandler(async (req, res) => {
  success(res, await updateRecurringSchedule(req.params.id, req.body, req.user), 'Recurring schedule updated');
});

export const scheduleGenerateController = asyncHandler(async (req, res) => {
  const result = await generateScheduleSessions(req.params.id, req.body, req.user);
  success(res, { generated: result.generated, skipped: result.skipped, schedule: result.schedule }, `${result.generated.length} session(s) generated, ${result.skipped.length} already existed`);
});

// ============================================================
// SLOT BOARD (spec 10)
// ============================================================
export const slotBoardController = asyncHandler(async (req, res) => {
  success(res, await slotBoard(req.query.date), 'Dialysis slot board');
});

// ---- reports
export const reportCatalogueController = asyncHandler(async (req, res) => {
  const { reportCatalogue } = await import('../services/dialysis.billing.service.js');
  success(res, reportCatalogue(), 'Report catalogue');
});

export const reportRunController = asyncHandler(async (req, res) => {
  const { runReport } = await import('../services/dialysis.billing.service.js');
  success(res, await runReport(req.params.key, req.query), 'Report generated');
});

export const reportExportController = asyncHandler(async (req, res) => {
  const { reportCsv, reportPdf, reportXlsx, runReport, getHospital } = await import('../services/dialysis.billing.service.js');
  const { key } = req.params;
  const format = String(req.params.format || 'pdf').toLowerCase();
  const params = { from: req.query.from, to: req.query.to, date: req.query.date };

  if (format === 'csv') {
    const csv = await reportCsv(key, params);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="dialysis-${key}.csv"`);
    return res.send(csv);
  }
  if (format === 'xlsx') {
    const buffer = await reportXlsx(key, params);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="dialysis-${key}.xlsx"`);
    return res.send(Buffer.from(buffer));
  }
  if (format === 'print') {
    const report = await runReport(key, params);
    const hospital = await getHospital();
    const rows = report.rows.map((r) => `<tr>${r.map((c) => `<td>${String(c ?? '')}</td>`).join('')}</tr>`).join('');
    return res.send(`<!doctype html><html><head><meta charset="utf-8"><title>${report.name}</title>
      <style>body{font-family:Inter,Arial,sans-serif;padding:24px;color:#111}h1{font-size:18px;margin:0}h2{font-size:14px}table{border-collapse:collapse;width:100%;margin-top:12px;font-size:11px}th,td{border:1px solid #ddd;padding:4px 6px;text-align:left}th{background:#f3f4f6}.totals{margin-top:14px;font-size:12px}footer{margin-top:20px;font-size:10px;color:#666;text-align:center}</style></head>
      <body><h1>${hospital?.name || 'ZhanX HospitalOS'}</h1><h2>Dialysis — ${report.name}</h2>
      <p>${report.description} | generated ${new Date().toLocaleString('en-IN')}</p>
      <table><thead><tr>${report.columns.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
      ${report.totals ? `<div class="totals">${Object.entries(report.totals).map(([k, v]) => `<b>${k}: ${v}</b>`).join(' &nbsp; ')}</div>` : ''}
      <footer>This is a computer generated report.</footer></body></html>`);
  }

  const pdf = await reportPdf(key, params, await getHospital());
  res.setHeader('Content-Type', 'application/pdf');
  if (String(req.query.download) === 'true') {
    res.setHeader('Content-Disposition', `attachment; filename="dialysis-${key}.pdf"`);
  }
  return res.send(pdf);
});
