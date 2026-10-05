import { success, created } from '../utils/apiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { writeAudit } from '../middleware/audit.js';
import { openShift, closeShift, getCurrentShift, getShift, listShifts } from '../services/cashier.service.js';

export const currentShiftController = asyncHandler(async (req, res) => {
  const shift = await getCurrentShift(req.user);
  success(res, shift, shift ? 'Active shift found' : 'No active shift');
});

export const openShiftController = asyncHandler(async (req, res) => {
  const shift = await openShift(req.body, req.user);
  await writeAudit({ user: req.user, action: 'CASHIER_SHIFT_OPEN', module: 'billing', entityId: shift._id, entityType: 'CashierShift', req });
  created(res, shift, `Shift ${shift.shiftNumber} opened`);
});

export const closeShiftController = asyncHandler(async (req, res) => {
  const shift = await closeShift(req.params.id, req.body, req.user);
  await writeAudit({ user: req.user, action: 'CASHIER_SHIFT_CLOSE', module: 'billing', entityId: shift._id, entityType: 'CashierShift', req });
  success(res, shift, `Shift ${shift.shiftNumber} closed`);
});

export const getShiftController = asyncHandler(async (req, res) => {
  success(res, await getShift(req.params.id), 'Shift fetched');
});

export const listShiftsController = asyncHandler(async (req, res) => {
  const result = await listShifts(req.query);
  success(res, result.data, 'Shifts fetched', result.pagination);
});