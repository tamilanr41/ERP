import AuditLog from '../models/AuditLog.model.js';

const userIdOf = (user) =>
  user?.id || user?._id || (user && typeof user === 'object' ? user._id || null : null) || null;

const enrichFromReq = (req, user) => {
  if (!req) return {};
  const meta = {
    ip: req.ip || req.socket?.remoteAddress,
    method: req.method,
    path: req.originalUrl || req.url,
    userAgent: typeof req.get === 'function' ? req.get('user-agent') : undefined,
  };
  if (user?.id || user?._id) {
    meta.username = user.username || undefined;
    meta.hospitalId = user.hospitalId || undefined;
    meta.branchId = user.branchId || undefined;
  }
  return meta;
};

/**
 * Append-only audit writer. Never throws: a failed audit write must not roll back the
 * business transaction that already succeeded.
 */
export const writeAudit = async ({ user = null, action, module, entityId = null, entityType = null, data = null, req = null, statusCode = null } = {}) => {
  try {
    const uid = userIdOf(user);
    const reqMeta = enrichFromReq(req, user);
    await AuditLog.create({
      user: uid,
      username: user?.username || reqMeta.username,
      roleCode: user?.roleCode || undefined,
      action,
      module,
      entityId: entityId || undefined,
      entityType: entityType || undefined,
      data: data || undefined,
      ip: req?.ip || reqMeta.ip,
      method: reqMeta.method,
      path: reqMeta.path,
      userAgent: reqMeta.userAgent,
      statusCode,
      hospitalId: user?.hospitalId || reqMeta.hospitalId,
      branchId: user?.branchId || reqMeta.branchId,
      timestamp: new Date(),
    });
  } catch (err) {
    // Audit must never break the caller — log to console only.
    // eslint-disable-next-line no-console
    console.error('[audit] writeAudit failed:', err?.message || err);
  }
};

export const auditAction = async ({ user = null, action, module, entityId = null, entityType = null, data = null, req = null, statusCode = null } = {}) =>
  writeAudit({ user, action, module, entityId, entityType, data, req, statusCode });

export default {
  writeAudit,
  auditAction,
};
