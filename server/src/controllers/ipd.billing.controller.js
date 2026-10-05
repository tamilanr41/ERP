import { success, created } from '../utils/apiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { writeAudit } from '../middleware/audit.js';
import {
  listChargeConfig,
  upsertChargeConfig,
  previewDailyBilling,
  runDailyBilling,
  runDailyBillingAll,
  collectAdvance,
  listAdvances,
  advanceSummary,
  adjustAdvanceToBill,
  refundAdvance,
  getAdvanceAlertConfig,
  setAdvanceAlertConfig,
  checkAdvanceAlert,
  acknowledgeAdvanceAlert,
  admissionInsurance,
  linkInsuranceToAdmission,
  dischargeReadiness,
  updateReadinessItem,
  dischargePlanningDashboard,
  buildFinalBill,
  finaliseSettlement,
  getSettlement,
  initiateDischarge,
  advanceDischargeStage,
  buildDischargeSummary,
  signDischargeSummary,
  dischargeSummaryPdf,
  dischargeSummaryPrintHtml,
} from '../services/ipd.billing.service.js';

const audit = (action, entityType, id) => (req) => writeAudit({ user: req.user, action, module: 'ipd', entityId: id(req), entityType, req });

// ===== 26. charge catalogue + daily billing =====
export const listChargesController = asyncHandler(async (req, res) => {
  success(res, await listChargeConfig(), 'IPD charge configuration fetched');
});

export const updateChargeController = asyncHandler(async (req, res) => {
  const charge = await upsertChargeConfig(req.params.serviceCode, req.body, req.user);
  await audit('IPD_CHARGE_CONFIG_UPDATE', 'IpdServiceCharge', () => charge._id)(req);
  success(res, charge, 'Charge configuration updated');
});

export const previewBillingController = asyncHandler(async (req, res) => {
  success(res, await previewDailyBilling(req.params.id, req.query), 'Daily charge preview');
});

export const runDailyBillingController = asyncHandler(async (req, res) => {
  const result = await runDailyBilling(req.params.id, { date: req.body?.date }, req.user);
  await audit('IPD_DAILY_BILLING_RUN', 'IpdAdmission', () => req.params.id)(req);
  success(res, result, result.message);
});

export const runDailyBillingAllController = asyncHandler(async (req, res) => {
  const results = await runDailyBillingAll({ date: req.body?.date }, req.user);
  await writeAudit({ user: req.user, action: 'IPD_DAILY_BILLING_BULK', module: 'ipd', entityType: 'IpdAdmission', data: { date: req.body?.date }, req });
  success(res, results, `Daily billing run completed for ${results.length} admission(s)`);
});

// ===== 27. advances =====
export const collectAdvanceController = asyncHandler(async (req, res) => {
  const advance = await collectAdvance(req.params.id, req.body, req.user);
  await audit('IPD_ADVANCE_COLLECT', 'IpdAdvance', () => advance._id)(req);
  created(res, advance, `Advance receipt ${advance.receiptNumber} issued`);
});

export const listAdvancesController = asyncHandler(async (req, res) => {
  const [advances, summary] = await Promise.all([listAdvances(req.params.id), advanceSummary(req.params.id)]);
  success(res, { advances, summary }, 'Advances fetched');
});

export const adjustAdvanceController = asyncHandler(async (req, res) => {
  const result = await adjustAdvanceToBill(req.params.id, req.body, req.user);
  await audit('IPD_ADVANCE_ADJUST', 'IpdAdvance', () => req.params.id)(req);
  success(res, result, `Advance adjusted — ₹${result.applied} applied`);
});

export const refundAdvanceController = asyncHandler(async (req, res) => {
  const advance = await refundAdvance(req.params.advanceId, req.body, req.user);
  await audit('IPD_ADVANCE_REFUND', 'IpdAdvance', () => advance._id)(req);
  success(res, advance, 'Advance refunded');
});

// ===== 28. advance alerts =====
export const getAlertConfigController = asyncHandler(async (req, res) => {
  success(res, await getAdvanceAlertConfig(), 'Advance alert configuration fetched');
});

export const setAlertConfigController = asyncHandler(async (req, res) => {
  const config = await setAdvanceAlertConfig(req.body, req.user);
  await writeAudit({ user: req.user, action: 'IPD_ALERT_CONFIG_UPDATE', module: 'ipd', entityType: 'Setting', req });
  success(res, config, 'Advance alert configuration saved');
});

export const checkAdvanceAlertController = asyncHandler(async (req, res) => {
  const alert = await checkAdvanceAlert(req.params.id, req.user);
  await audit('IPD_ADVANCE_ALERT_CHECK', 'IpdAdmission', () => req.params.id)(req);
  success(res, alert, alert.message || 'Advance balance is healthy');
});

export const acknowledgeAlertController = asyncHandler(async (req, res) => {
  const alert = await acknowledgeAdvanceAlert(req.params.id, req.user);
  await audit('IPD_ADVANCE_ALERT_ACK', 'IpdAdmission', () => req.params.id)(req);
  success(res, alert, 'Alert acknowledged');
});

// ===== 29/30. insurance + sponsor =====
export const admissionInsuranceController = asyncHandler(async (req, res) => {
  success(res, await admissionInsurance(req.params.id), 'Insurance details fetched');
});

export const linkInsuranceController = asyncHandler(async (req, res) => {
  const admission = await linkInsuranceToAdmission(req.params.id, req.body, req.user);
  await audit('IPD_INSURANCE_LINK', 'IpdAdmission', () => req.params.id)(req);
  success(res, admission, 'Insurance / sponsor linked to admission');
});

// ===== 31. discharge planning =====
export const dischargeDashboardController = asyncHandler(async (req, res) => {
  success(res, await dischargePlanningDashboard(req.query), 'Discharge planning dashboard fetched');
});

export const dischargeReadinessController = asyncHandler(async (req, res) => {
  success(res, await dischargeReadiness(req.params.id), 'Discharge readiness fetched');
});

export const updateReadinessController = asyncHandler(async (req, res) => {
  const readiness = await updateReadinessItem(req.params.id, req.params.key, req.body, req.user);
  await audit('IPD_DISCHARGE_READINESS', 'IpdAdmission', () => req.params.id)(req);
  success(res, readiness, 'Readiness updated');
});

// ===== 33/34. final bill + settlement workflow =====
export const buildFinalBillController = asyncHandler(async (req, res) => {
  const result = await buildFinalBill(req.params.id, {}, req.user);
  await audit('IPD_FINAL_BILL_BUILD', 'Bill', () => result.finalBill?._id)(req);
  success(res, result, 'Final IPD bill generated from bill items');
});

export const finaliseSettlementController = asyncHandler(async (req, res) => {
  const settlement = await finaliseSettlement(req.params.id, req.user);
  await audit('IPD_FINAL_BILL_FINALISE', 'IpdSettlement', () => settlement._id)(req);
  success(res, settlement, 'Final bill finalised');
});

export const getSettlementController = asyncHandler(async (req, res) => {
  success(res, await getSettlement(req.params.id), 'Settlement fetched');
});

export const initiateDischargeController = asyncHandler(async (req, res) => {
  const result = await initiateDischarge(req.params.id, req.body, req.user);
  await audit('IPD_DISCHARGE_INITIATE', 'IpdAdmission', () => req.params.id)(req);
  success(res, result, `Discharge initiated (${result.admission.dischargeType})`);
});

export const advanceStageController = asyncHandler(async (req, res) => {
  const result = await advanceDischargeStage(req.params.id, req.body.stage, req.user);
  await audit('IPD_DISCHARGE_STAGE', 'IpdAdmission', () => req.params.id)(req);
  success(res, result, `Discharge stage → ${result.stage}`);
});

// ===== 32. discharge summary =====
export const buildSummaryController = asyncHandler(async (req, res) => {
  const summary = await buildDischargeSummary(req.params.id, req.body, req.user);
  await audit('IPD_DISCHARGE_SUMMARY', 'DischargeSummary', () => summary._id)(req);
  success(res, summary, 'Discharge summary generated');
});

export const signSummaryController = asyncHandler(async (req, res) => {
  const summary = await signDischargeSummary(req.params.id, req.body, req.user);
  await audit('IPD_DISCHARGE_SUMMARY_SIGN', 'DischargeSummary', () => summary._id)(req);
  success(res, summary, 'Discharge summary signed and finalised');
});

export const summaryPdfController = asyncHandler(async (req, res) => {
  const buffer = await dischargeSummaryPdf(req.params.id);
  await writeAudit({ user: req.user, action: 'IPD_DISCHARGE_SUMMARY_PDF', module: 'ipd', entityId: req.params.id, entityType: 'DischargeSummary', req });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="discharge-summary-${req.params.id}.pdf"`);
  return res.send(buffer);
});

export const summaryPrintController = asyncHandler(async (req, res) => {
  const html = await dischargeSummaryPrintHtml(req.params.id);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(html);
});
