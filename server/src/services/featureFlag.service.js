import FeatureFlag from '../models/FeatureFlag.model.js';

/**
 * Default flag registry. Flags enable progressive rollout and SaaS tiering.
 * `defaultValue` is used even before a DB record exists; once seeded, the DB
 * value wins (admin can toggle per deployment / organization).
 */
export const DEFAULT_FLAGS = {
  ENABLE_REALTIME: { name: 'Real-time updates', defaultValue: true, category: 'PLATFORM', description: 'Socket.IO presence, live queues, bed map, notifications' },
  ENABLE_GLOBAL_SEARCH: { name: 'Global search', defaultValue: true, category: 'PLATFORM', description: 'Cross-module search API and Ctrl+K command palette' },
  ENABLE_COMMAND_PALETTE: { name: 'Command palette', defaultValue: true, category: 'PLATFORM', description: 'Ctrl+K global command palette in the client' },
  ENABLE_QUEUE: { name: 'Live queue board', defaultValue: true, category: 'CLINICAL', description: 'Reception digital queue and token board' },
  ENABLE_ICU: { name: 'ICU module', defaultValue: true, category: 'CLINICAL', description: 'ICU records and eMAR' },
  ENABLE_EMAR: { name: 'eMAR', defaultValue: true, category: 'CLINICAL', description: 'Electronic medication administration record' },
  ENABLE_OT: { name: 'Operation theatre', defaultValue: true, category: 'CLINICAL', description: 'OT calendar and bookings' },
  ENABLE_BLOOD_BANK: { name: 'Blood bank', defaultValue: false, category: 'CLINICAL', description: 'Donors, units, cross-match (tiered)' },
  ENABLE_PATIENT_PORTAL: { name: 'Patient portal', defaultValue: false, category: 'SAAS', description: 'Self-service patient portal (tiered)' },
  ENABLE_TELEMEDICINE: { name: 'Telemedicine', defaultValue: false, category: 'CLINICAL', description: 'Virtual visit seams (tiered)' },
  ENABLE_HR: { name: 'HR module', defaultValue: true, category: 'PLATFORM', description: 'Employees, attendance, payroll' },
  ENABLE_ASSETS: { name: 'Asset management', defaultValue: true, category: 'PLATFORM', description: 'Equipment, assets, depreciation' },
  ENABLE_MAINTENANCE: { name: 'Maintenance', defaultValue: true, category: 'PLATFORM', description: 'Breakdown and work-order tickets' },
  ENABLE_HOUSEKEEPING: { name: 'Housekeeping', defaultValue: true, category: 'PLATFORM', description: 'Cleaning tasks and ward status' },
  ENABLE_DIETARY: { name: 'Dietary', defaultValue: true, category: 'CLINICAL', description: 'Patient diet orders and kitchen planning' },
  ENABLE_AMBULANCE: { name: 'Ambulance', defaultValue: false, category: 'CLINICAL', description: 'Ambulance fleet and dispatch (tiered)' },
  ENABLE_MORTUARY: { name: 'Mortuary', defaultValue: false, category: 'CLINICAL', description: 'Mortuary records (tiered)' },
  ENABLE_PROCUREMENT: { name: 'Procurement', defaultValue: true, category: 'FINANCE', description: 'Purchase orders and goods receipt' },
  ENABLE_CASHIER_CLOSING: { name: 'Cashier closing', defaultValue: true, category: 'FINANCE', description: 'Shift open/close and variance' },
  ENABLE_INSURANCE_TPA: { name: 'Insurance / TPA', defaultValue: true, category: 'FINANCE', description: 'Insurer policies, pre-auth, claims (tiered)' },
  ENABLE_AI: { name: 'AI assistance', defaultValue: false, category: 'AI', description: 'AI provider abstraction - summaries/classification (never clinical decisions)' },
  ENABLE_IDEMPOTENCY: { name: 'Idempotency keys', defaultValue: true, category: 'PLATFORM', description: 'Idempotency-Key support on money/stock/admission writes' },
};

let cache = null;
let cacheAt = 0;
const CACHE_TTL_MS = 30 * 1000;

const freshDefaults = () =>
  Object.fromEntries(Object.entries(DEFAULT_FLAGS).map(([key, v]) => [key, { ...v }]));

export const getFeatureFlags = async (force = false) => {
  if (!force && cache && Date.now() - cacheAt < CACHE_TTL_MS) return cache;

  const flags = freshDefaults();
  try {
    const rows = await FeatureFlag.find({});
    for (const row of rows) {
      flags[row.key] = {
        key: row.key,
        name: row.name || row.key,
        description: row.description || '',
        category: row.category,
        enabled: row.enabled,
        defaultValue: row.defaultValue,
      };
    }
    cache = flags;
    cacheAt = Date.now();
  } catch {
    // DB unavailable: serve defaults (ERP must keep working)
  }
  return cache || flags;
};

export const isFeatureEnabled = async (key) => {
  const flags = await getFeatureFlags();
  return Boolean(flags[key]?.enabled ?? flags[key]?.defaultValue ?? true);
};

export const bootstrapFeatureFlags = async () => {
  const existing = await FeatureFlag.find({}).select('key').lean();
  const existingKeys = new Set(existing.map((r) => r.key));
  const docs = Object.entries(DEFAULT_FLAGS)
    .filter(([key]) => !existingKeys.has(key))
    .map(([key, v]) => ({ key, ...v, enabled: v.defaultValue }));
  if (docs.length) await FeatureFlag.insertMany(docs);
  await getFeatureFlags(true);
  return docs.length;
};

export const setFeatureFlag = async (key, enabled, actor = null) => {
  const def = DEFAULT_FLAGS[key];
  if (!def) throw new Error(`Unknown feature flag: ${key}`);
  const doc = await FeatureFlag.findOneAndUpdate(
    { key },
    { $set: { enabled, name: def.name, description: def.description || '', category: def.category, updatedBy: actor?.id || null } },
    { upsert: true, new: true },
  );
  await getFeatureFlags(true);
  return { key, enabled: doc.enabled };
};