/**
 * attachTenant: runs AFTER authenticate. Injects req.tenant derived from the
 * authenticated user so services can scope by organization/hospital/branch.
 *
 * Pattern: data is tenant-scoped either directly (own tenant keys) or by
 * association (a bill belongs to a hospital because its patient does).
 */
export const attachTenant = (req, _res, next) => {
  const user = req.user || {};
  req.tenant = {
    organizationId: user.organizationId || null,
    hospitalId: user.hospitalId || null,
    branchId: user.branchId || null,
  };
  next();
};

/**
 * tenantFilter: convenience builder for queries. Pass an explicit hospital id
 * to override (e.g. SUPER_ADMIN scoping to a hospital).
 */
export const tenantFilter = (req, overrides = {}) => {
  const f = {};
  if (req.tenant?.hospitalId) f.hospitalId = req.tenant.hospitalId;
  if (req.tenant?.branchId) f.branchId = req.tenant.branchId;
  if (req.tenant?.organizationId) f.organizationId = req.tenant.organizationId;
  return { ...f, ...overrides };
};

export default attachTenant;