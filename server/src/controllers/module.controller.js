import { success, created } from '../utils/apiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { writeAudit } from '../middleware/audit.js';
import * as svc from '../services/module.service.js';

const ctxOf = (req) => ({
  userId: req.user?.id,
  hospitalId: req.user?.hospitalId,
  branchId: req.user?.branchId,
  orgId: req.user?.organizationId,
});

export const listModuleRecordsController = asyncHandler(async (req, res) => {
  const result = await svc.listModuleRecords({ ...req.query, hospitalId: req.user?.hospitalId });
  success(res, result.data, 'Records fetched', result.pagination);
});

export const getModuleRecordController = asyncHandler(async (req, res) => {
  success(res, await svc.getModuleRecord(req.params.id), 'Record fetched');
});

export const createModuleRecordController = asyncHandler(async (req, res) => {
  const record = await svc.createModuleRecord(req.body, ctxOf(req));
  await writeAudit({ user: req.user, action: 'MODULE_RECORD_CREATE', module: req.body.module || 'modules', entityId: record._id, entityType: 'ModuleRecord', req });
  created(res, record, 'Record created');
});

export const updateModuleRecordController = asyncHandler(async (req, res) => {
  const record = await svc.updateModuleRecord(req.params.id, req.body, ctxOf(req));
  await writeAudit({ user: req.user, action: 'MODULE_RECORD_UPDATE', module: record.module, entityId: record._id, entityType: 'ModuleRecord', req });
  success(res, record, 'Record updated');
});

export const setRecordStatusController = asyncHandler(async (req, res) => {
  const record = await svc.setRecordStatus(req.params.id, req.body.status);
  await writeAudit({ user: req.user, action: 'MODULE_RECORD_STATUS', module: record.module, entityId: record._id, entityType: 'ModuleRecord', req });
  success(res, record, 'Status updated');
});

export const deleteModuleRecordController = asyncHandler(async (req, res) => {
  const record = await svc.removeModuleRecord(req.params.id);
  await writeAudit({ user: req.user, action: 'MODULE_RECORD_DELETE', module: record.module, entityId: record._id, entityType: 'ModuleRecord', req });
  success(res, null, 'Record removed');
});

export const getModuleSummaryController = asyncHandler(async (req, res) => {
  success(res, await svc.getModuleSummary({ module: req.query.module, workflow: req.query.workflow, hospitalId: req.user?.hospitalId }), 'Summary fetched');
});