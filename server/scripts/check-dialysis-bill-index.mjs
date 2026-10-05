import mongoose from 'mongoose';
import Bill, { BILL_STATUS } from '../src/models/Bill.model.js';
import DialysisSession from '../src/models/DialysisSession.model.js';

const live = [
  BILL_STATUS.DRAFT, BILL_STATUS.PENDING, BILL_STATUS.FINAL,
  BILL_STATUS.PARTIALLY_PAID, BILL_STATUS.PAID, BILL_STATUS.OVERPAID,
];

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/erp');
  console.log('connected');

  const liveBills = await Bill.find({ dialysisSessionId: { $exists: true }, status: { $in: live } }).lean();
  console.log(`bills carrying a dialysisSessionId: ${liveBills.length}`);

  // find any sitting that has more than one live bill
  const byS = new Map();
  for (const b of liveBills) {
    const k = String(b.dialysisSessionId);
    byS.set(k, [...(byS.get(k) || []), b]);
  }
  const dupes = [...byS.entries()].filter(([, v]) => v.length > 1);
  console.log(`sittings with more than one live bill: ${dupes.length}`);
  for (const [sid, list] of dupes) {
    console.log(`  ${sid}: ${list.map((b) => `${b.billNumber}(${b.status},₹${b.netTotal})`).join('  ')}`);
  }

  // sessions pointing at a bill that is gone or cancelled
  const bills = await Bill.find({}).select('_id status billNumber').lean();
  const bmap = new Map(bills.map((b) => [String(b._id), b]));
  const sessions = await DialysisSession.find({ billId: { $exists: true, $ne: null } }).select('_id sessionNumber billId billNumber').lean();
  const stale = sessions.filter((s) => {
    const b = bmap.get(String(s.billId));
    return !b || b.status === BILL_STATUS.CANCELLED;
  });
  console.log(`sessions holding a dead or cancelled bill: ${stale.length}`);
  for (const s of stale.slice(0, 12)) console.log(`  ${s.sessionNumber} -> ${s.billNumber} (${bmap.get(String(s.billId))?.status || 'MISSING'})`);

  if (!dupes.length) {
    await Bill.syncIndexes();
    const idx = (await Bill.collection.indexes()).filter((i) => i.name === 'uniq_dialysis_bill_per_session');
    console.log('index present:', JSON.stringify(idx));
  } else {
    console.log('NOT creating the index — resolve the duplicate bills first');
  }
  await mongoose.disconnect();
};
run().catch((e) => { console.error(e); process.exit(1); });
