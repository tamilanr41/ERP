import { FeatureDisabledError } from '../utils/ApiError.js';
import { isFeatureEnabled } from '../services/featureFlag.service.js';
import asyncHandler from '../utils/asyncHandler.js';

/**
 * requireFeature: blocks a route unless the flag is enabled (SUPER_ADMIN bypass).
 * Usage: router.post('/x', requireFeature('ENABLE_PROCUREMENT'), handler)
 */
export const requireFeature = (flagKey) =>
  asyncHandler(async (req, _res, next) => {
    if (req.user?.roleCode === 'SUPER_ADMIN') return next();
    const enabled = await isFeatureEnabled(flagKey);
    if (!enabled) throw new FeatureDisabledError();
    next();
  });

export default requireFeature;