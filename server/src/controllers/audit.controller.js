import { success } from '../utils/apiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { listAuditLogs, auditStats } from '../services/audit.service.js';

export const listController = asyncHandler(async (req, res) => {
  const result = await listAuditLogs(req.query);
  success(res, result.data, 'Audit logs fetched', result.pagination);
});

export const statsController = asyncHandler(async (req, res) => {
  success(res, await auditStats(req.query), 'Audit stats');
});