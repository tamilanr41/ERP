/**
 * Dialysis infrastructure seed — machines, stations and the consumable
 * catalogue every unit needs. Idempotent: safe to run on every boot.
 */
import { DialysisMachine } from '../models/DialysisMachine.model.js';
import { DialysisStation } from '../models/DialysisStation.model.js';
import { DialysisConsumable, CONSUMABLE_CATEGORIES } from '../models/DialysisConsumable.model.js';

const MACHINES = [
  { code: 'HD-01', name: 'Fresenius 4008S', machineType: 'HEMODIALYSIS', manufacturer: 'Fresenius', model: '4008S', maxBloodFlow: 400, location: 'Dialysis Unit — Bay A', dialyserType: 'FX800' },
  { code: 'HD-02', name: 'Fresenius 4008S', machineType: 'HEMODIALYSIS', manufacturer: 'Fresenius', model: '4008S', maxBloodFlow: 400, location: 'Dialysis Unit — Bay A', dialyserType: 'FX800' },
  { code: 'HD-03', name: 'Baxter Gambro AK 96', machineType: 'HEMODIALYSIS', manufacturer: 'Gambro', model: 'AK 96', maxBloodFlow: 500, location: 'Dialysis Unit — Bay A', dialyserType: 'F160' },
  { code: 'HD-04', name: 'Nipro Surdial X', machineType: 'HEMODIALYSIS', manufacturer: 'Nipro', model: 'Surdial X', maxBloodFlow: 400, location: 'Dialysis Unit — Bay B', dialyserType: 'F160' },
  { code: 'HD-05', name: 'Baxter Gambro AK 96', machineType: 'HEMODIALYSIS', manufacturer: 'Gambro', model: 'AK 96', maxBloodFlow: 500, location: 'Dialysis Unit — Bay B', dialyserType: 'F160' },
  { code: 'HD-06', name: 'Fresenius 5008S', machineType: 'HDF', manufacturer: 'Fresenius', model: '5008S', maxBloodFlow: 450, location: 'Dialysis Unit — Bay C', dialyserType: 'FX80' },
  { code: 'CRRT-01', name: 'Prismaflex CRRT', machineType: 'CRRT', manufacturer: 'Baxter', model: 'Prismaflex', maxBloodFlow: 400, location: 'Dialysis Unit — Critical Bay', dialyserType: 'M150' },
  { code: 'MOBILE-01', name: 'Mobile Dialysis Cart', machineType: 'MOBILE', manufacturer: 'ZhanX', model: 'Mobile-1', maxBloodFlow: 300, location: 'Mobile — Ward Ready', dialyserType: 'FX80' },
];

const STATIONS = [
  { code: 'BAY-A1', name: 'Bay A1', area: 'Dialysis Unit — Bay A' },
  { code: 'BAY-A2', name: 'Bay A2', area: 'Dialysis Unit — Bay A' },
  { code: 'BAY-A3', name: 'Bay A3', area: 'Dialysis Unit — Bay A' },
  { code: 'BAY-B1', name: 'Bay B1', area: 'Dialysis Unit — Bay B' },
  { code: 'BAY-B2', name: 'Bay B2', area: 'Dialysis Unit — Bay B' },
  { code: 'BAY-C1', name: 'Bay C1', area: 'Dialysis Unit — Bay C' },
  { code: 'BAY-CRIT', name: 'Critical Bay', area: 'Dialysis Unit — Critical Bay' },
  { code: 'MOBILE-1', name: 'Mobile Bay 1', area: 'Mobile — Ward Ready' },
];

const CONSUMABLES = [
  { code: 'CON-LINE-HD', name: 'Dialysis blood line set (HD)', category: CONSUMABLE_CATEGORIES.LINE_SET, unit: 'set', unitCost: 850, chargeRate: 850, openingStock: 200, reorderLevel: 40 },
  { code: 'CON-DIALYSER-FX800', name: 'Dialyser FX800', category: CONSUMABLE_CATEGORIES.DIALYSER, unit: 'unit', unitCost: 1450, chargeRate: 1450, openingStock: 120, reorderLevel: 30 },
  { code: 'CON-DIALYSER-F160', name: 'Dialyser F160', category: CONSUMABLE_CATEGORIES.DIALYSER, unit: 'unit', unitCost: 1350, chargeRate: 1350, openingStock: 100, reorderLevel: 30 },
  { code: 'CON-HEPARIN-5000', name: 'Heparin 5000 IU/ml vial', category: CONSUMABLE_CATEGORIES.HEPARIN, unit: 'vial', unitCost: 320, chargeRate: 320, openingStock: 150, reorderLevel: 30 },
  { code: 'CON-CANNULA-16', name: 'Arteriovenous cannula 16G', category: CONSUMABLE_CATEGORIES.CANNULA, unit: 'unit', unitCost: 180, chargeRate: 180, openingStock: 300, reorderLevel: 60 },
  { code: 'CON-DRESS-AVF', name: 'AV fistula dressing pack', category: CONSUMABLE_CATEGORIES.DRESSING, unit: 'pack', unitCost: 95, chargeRate: 95, openingStock: 250, reorderLevel: 50 },
  { code: 'CON-SALINE-1L', name: 'Sodium chloride 0.9% 1L', category: CONSUMABLE_CATEGORIES.SALINE, unit: 'bottle', unitCost: 75, chargeRate: 75, openingStock: 200, reorderLevel: 40 },
  { code: 'CON-HEPARIN-LOCK', name: 'Heparin lock solution 10ml', category: CONSUMABLE_CATEGORIES.ANTICOAGULANT, unit: 'vial', unitCost: 140, chargeRate: 140, openingStock: 180, reorderLevel: 40 },
  { code: 'CON-ANTISPASM-M50', name: 'Nifedipine 5mg (spasm)', category: CONSUMABLE_CATEGORIES.DRUG, unit: 'tablet', unitCost: 12, chargeRate: 0, openingStock: 500, reorderLevel: 100, billable: false },
  { code: 'CON-ONSET-SALINE', name: 'Onset saline flush 10ml', category: CONSUMABLE_CATEGORIES.SALINE, unit: 'syringe', unitCost: 65, chargeRate: 65, openingStock: 240, reorderLevel: 50 },
];

const MACHINE_STATION = {
  'HD-01': 'BAY-A1',
  'HD-02': 'BAY-A2',
  'HD-03': 'BAY-A3',
  'HD-04': 'BAY-B1',
  'HD-05': 'BAY-B2',
  'HD-06': 'BAY-C1',
  'CRRT-01': 'BAY-CRIT',
  'MOBILE-01': 'MOBILE-1',
};

export const seedDialysisInfrastructure = async (logger = console) => {
  try {
    const hospitalId = (await import('../models/Hospital.model.js')).default.findOne().select('_id').lean()
      .then((h) => h?._id)
      .catch(() => null);

    const hospital = await hospitalId;

    let machinesCreated = 0;
    for (const m of MACHINES) {
      // eslint-disable-next-line no-await-in-loop
      const exists = await DialysisMachine.findOne({ code: m.code });
      if (!exists) {
        // eslint-disable-next-line no-await-in-loop
        await DialysisMachine.create({ ...m, hospitalId: hospital });
        machinesCreated += 1;
      }
    }

    let stationsCreated = 0;
    for (const s of STATIONS) {
      // eslint-disable-next-line no-await-in-loop
      const exists = await DialysisStation.findOne({ code: s.code });
      if (!exists) {
        // eslint-disable-next-line no-await-in-loop
        await DialysisStation.create({ ...s, hospitalId: hospital });
        stationsCreated += 1;
      }
    }

    // attach each machine to its own bay so a session always has a station
    const stations = await DialysisStation.find({});
    for (const [code, stationCode] of Object.entries(MACHINE_STATION)) {
      const machine = await DialysisMachine.findOne({ code });
      const station = stations.find((s) => s.code === stationCode);
      if (!machine || !station) continue;
      // eslint-disable-next-line no-await-in-loop
      await DialysisMachine.findByIdAndUpdate(machine._id, { $set: { stationId: station._id } });
      // eslint-disable-next-line no-await-in-loop
      await DialysisStation.findByIdAndUpdate(station._id, { $set: { machineId: machine._id } });
    }

    let consumablesCreated = 0;
    for (const c of CONSUMABLES) {
      // eslint-disable-next-line no-await-in-loop
      const exists = await DialysisConsumable.findOne({ code: c.code });
      if (!exists) {
        const { openingStock, ...rest } = c;
        // eslint-disable-next-line no-await-in-loop
        await DialysisConsumable.create({
          ...rest,
          hospitalId: hospital,
          stockQty: openingStock,
          movements: openingStock ? [{ type: 'PURCHASE', quantity: openingStock, balanceAfter: openingStock, reason: 'Opening stock' }] : [],
        });
        consumablesCreated += 1;
      }
    }

    if (machinesCreated || stationsCreated || consumablesCreated) {
      logger.log?.(`   ↳ Dialysis infrastructure seeded: ${machinesCreated} machines, ${stationsCreated} stations, ${consumablesCreated} consumables`);
    }
    return { machinesCreated, stationsCreated, consumablesCreated };
  } catch (err) {
    logger.warn?.('   ↳ Dialysis infrastructure seed skipped:', err.message);
    return null;
  }
};

export default seedDialysisInfrastructure;
