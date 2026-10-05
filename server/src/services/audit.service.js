import AuditLog from '../models/AuditLog.model.js';
import { regex } from '../utils/helpers.js';

export const listAuditLogs = async (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const filter = {};
  if (query.module) filter.module = query.module;
  if (query.action) filter.action = query.action;
  if (query.user) filter.user = query.user;
  if (query.from || query.to) {
    filter.timestamp = {};
    if (query.from) filter.timestamp.$gte = new Date(query.from);
    if (query.to) filter.timestamp.$lte = new Date(query.to);
  }
  if (query.search) {
    const r = regex(query.search);
    filter.$or = [{ username: r }, { action: r }, { module: r }, { ip: r }];
  }
  const [total, logs] = await Promise.all([
    AuditLog.countDocuments(filter),
    AuditLog.find(filter).populate('user', 'firstName lastName').sort({ timestamp: -1 }).skip((page - 1) * limit).limit(limit),
  ]);
  return { data: logs, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

export const auditStats = async (query = {}) => {
  const days = parseInt(query.days, 10) || 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [byModule, byAction, total] = await Promise.all([
    AuditLog.aggregate([{ $match: { timestamp: { $gte: since } } }, { $group: { _id: '$module', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    AuditLog.aggregate([{ $match: { timestamp: { $gte: since } } }, { $group: { _id: '$action', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 15 }]),
    AuditLog.countDocuments({ timestamp: { $gte: since } }),
  ]);
  return { total, byModule, byAction };
};