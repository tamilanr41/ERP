import Notification from '../models/Notification.model.js';

export const notifyUser = async ({ user = null, roleCode = null, type, title, message, severity = 'INFO', link = null, referenceType = null, referenceId = null }) => {
  if (!user && !roleCode) return null;
  return Notification.create({ user, roleCode, type, title, message, severity, link, referenceType, referenceId });
};

export const listNotifications = async (query, actor) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 50);
  const filter = { $or: [{ user: actor?.id }, { roleCode: actor?.roleCode }] };
  if (query.read === 'false') filter.read = false;
  const [total, notifications] = await Promise.all([
    Notification.countDocuments(filter),
    Notification.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
  ]);
  return { data: notifications, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

export const markRead = async (id, actor) => {
  const notification = await Notification.findById(id);
  if (!notification) return null;
  if (!notification.user?.equals?.(actor?.id)) {
    notification.read = true;
    notification.readAt = new Date();
    await notification.save();
  } else {
    notification.read = true;
    notification.readAt = new Date();
    await notification.save();
  }
  return notification;
};

export const markAllRead = async (actor) => {
  await Notification.updateMany(
    { $or: [{ user: actor?.id }, { roleCode: actor?.roleCode }], read: false },
    { $set: { read: true, readAt: new Date() } },
  );
  return true;
};