import { success } from '../utils/apiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { listNotifications, markRead, markAllRead } from '../services/notification.service.js';
import { writeAudit } from '../middleware/audit.js';

export const listController = asyncHandler(async (req, res) => {
  const result = await listNotifications(req.query, req.user);
  success(res, result.data, 'Notifications fetched', result.pagination);
});

export const readController = asyncHandler(async (req, res) => {
  const notification = await markRead(req.params.id, req.user);
  success(res, notification, 'Notification marked read');
});

export const readAllController = asyncHandler(async (req, res) => {
  await markAllRead(req.user);
  success(res, null, 'All notifications marked read');
});