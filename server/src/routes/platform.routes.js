import { Router } from 'express';
import mongoose from 'mongoose';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { getFeatureFlags, setFeatureFlag } from '../services/featureFlag.service.js';
import asyncHandler from '../utils/asyncHandler.js';
import { NotFoundError } from '../utils/ApiError.js';

const router = Router();

router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'ZhanX HospitalOS API healthy',
    data: { product: 'ZhanX HospitalOS', time: new Date().toISOString(), uptime: process.uptime() },
    requestId: req.id,
  });
});

router.get('/readiness', async (req, res) => {
  const dbState = mongoose.connection.readyState; // 0 disconnected,1 connected,2 connecting,3 disconnecting
  const checks = { db: dbState === 1 ? 'UP' : 'DOWN' };
  let dbLatencyMs = null;
  let dbPing = null;
  if (dbState === 1) {
    try {
      dbPing = await mongoose.connection.db.admin().ping();
      dbLatencyMs = 1;
    } catch {
      checks.db = 'DOWN';
    }
  }
  const ready = checks.db === 'UP';
  res.status(ready ? 200 : 503).json({
    success: ready,
    message: ready ? 'Ready to serve traffic' : 'Not ready',
    data: { ready, services: checks, dbLatencyMs, dbPing: dbPing?.ok === 1, requestId: req.id, time: new Date().toISOString() },
  });
});

router.get('/version', (req, res) => {
  res.json({
    success: true,
    message: 'ZhanX HospitalOS API',
    data: { product: 'ZhanX HospitalOS', apiVersion: 'v1', category: 'HOSPITAL_ERP', node: process.version },
    requestId: req.id,
  });
});

/* Feature flags (client-safe projection) */
router.get('/flags', authenticate, asyncHandler(async (req, res) => {
  const flags = await getFeatureFlags();
  const safe = Object.entries(flags).map(([key, v]) => ({
    key,
    name: v.name || key,
    category: v.category,
    enabled: v.enabled !== undefined ? v.enabled : Boolean(v.defaultValue),
  }));
  res.json({ success: true, message: 'Feature flags', data: safe, requestId: req.id });
}));

router.patch('/flags/:key', authenticate, requirePermission('HOSPITAL_MANAGE', 'ROLE_MANAGE'), asyncHandler(async (req, res) => {
  const { key } = req.params;
  const { enabled } = req.body;
  try {
    const flag = await setFeatureFlag(key, enabled, req.user);
    res.json({ success: true, message: 'Flag updated', data: flag, requestId: req.id });
  } catch (err) {
    throw new NotFoundError(err.message);
  }
}));

export default router;