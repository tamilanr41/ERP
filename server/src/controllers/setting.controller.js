import { success } from '../utils/apiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import Setting from '../models/Setting.model.js';
import Hospital from '../models/Hospital.model.js';
import { writeAudit } from '../middleware/audit.js';

export const getSettingsController = asyncHandler(async (req, res) => {
  const group = req.query.group;
  const filter = { hospitalId: req.user?.hospitalId || null };
  if (group) filter.group = group;
  const settings = await Setting.find(filter);
  success(res, settings, 'Settings fetched');
});

export const saveSettingsController = asyncHandler(async (req, res) => {
  const { group, entries } = req.body;
  const hospitalId = req.user?.hospitalId || null;
  for (const [key, value] of Object.entries(entries || {})) {
    await Setting.updateOne({ group, key, hospitalId }, { $set: { value, description: undefined } }, { upsert: true });
  }

  // persist hospital-level billing/tax into Hospital doc for cross-module use
  if (group === 'billing' || group === 'tax' || group === 'hospital') {
    const hospital = await Hospital.findById(hospitalId);
    if (hospital) {
      const patch = {};
      if (group === 'billing') patch.billing = { ...hospital.billing, ...entries };
      if (group === 'tax') patch.tax = { ...hospital.tax, ...entries };
      if (group === 'hospital') {
        Object.keys(entries).forEach((k) => { if (k !== 'billing' && k !== 'tax') patch[k] = entries[k]; });
      }
      await Hospital.findByIdAndUpdate(hospitalId, patch, { new: true });
    }
  }

  await writeAudit({ user: req.user, action: 'SETTINGS_UPDATE', module: 'settings', data: { group, entries: Object.keys(entries || {}) }, req });
  success(res, null, 'Settings saved');
});