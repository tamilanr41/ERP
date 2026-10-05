#!/usr/bin/env node
/**
 * Backfill OPD visits created before the queue/consultation split.
 *
 * The old OPD lifecycle had a single active state, IN_PROGRESS, meaning
 * "registered and still in the department". There was no waiting room and no
 * queue number. The new lifecycle separates WAITING / CALLED / IN_CONSULTATION
 * from the closed states, and only IN_CONSULTATION can still be completed,
 * referred or admitted.
 *
 * So IN_PROGRESS maps to IN_CONSULTATION: it keeps the visit editable and
 * finishable, which is the whole point of migrating it. Mapping to WAITING
 * would drop it into a queue it was never issued a token for and leave the
 * doctor unable to close it without calling a patient who already left.
 *
 * These records also predate queue tokens, so they are left without tokenSeq /
 * queueToken / tokenDate. That is deliberate:
 *   - The queue board filters on tokenDate, so historical rows stay out of
 *     today's board instead of appearing as tokenless strays.
 *   - The unique queue index is partial on `tokenSeq: { $type: 'number' }`, so
 *     rows without one cannot collide with each other or with real tokens.
 *   - Back-dating a token would claim a queue position that was never handed
 *     out and would corrupt today's numbering.
 *
 * A statusHistory entry records that the row was migrated, so the timeline is
 * not silently rewritten.
 *
 * Usage:
 *   node scripts/backfill-opd-queue.mjs --dry-run
 *   node scripts/backfill-opd-queue.mjs
 *
 * Environment:
 *   MONGO_URI  defaults to the local replica set in ../.env
 */
import mongoose from 'mongoose';

const DRY_RUN = process.argv.includes('--dry-run');

const LEGACY_STATUS = 'IN_PROGRESS';
const TARGET_STATUS = 'IN_CONSULTATION';

const log = (...a) => console.log(...a);

process.env.NODE_ENV ||= 'development';
const { default: dotenv } = await import('dotenv');
dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/hospital_erp';

const connect = async () => {
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
    log(`  connected to ${uri.split('?')[0]}`);
  } catch (err) {
    log(`  ERROR connecting to ${uri.split('?')[0]}: ${err.message}`);
    log('  Set MONGO_URI to a reachable database and retry.');
    process.exit(1);
  }
};

const migrate = async () => {
  const col = mongoose.connection.db.collection('opdvisits');
  const legacy = await col.find({ status: LEGACY_STATUS }).toArray();

  log('');
  if (!legacy.length) {
    log(`  No ${LEGACY_STATUS} visits found. Nothing to do.`);
    return 0;
  }

  log(`  Found ${legacy.length} visit(s) with status ${LEGACY_STATUS}.`);
  log(`  Target status: ${TARGET_STATUS} (keeps the visit finishable).`);
  log('');

  for (const visit of legacy) {
    log(
      `    ${visit.opdNumber}  ${visit.visitDate || 'no-visit-date'}  ` +
        `${visit.checkedInAt ? `checked-in ${new Date(visit.checkedInAt).toISOString().slice(0, 16)}` : 'no-checked-in'}`,
    );
  }

  const migrateOne = async () => {
    let migrated = 0;
    for (const visit of legacy) {
      // consultStartedAt is what the UI shows as "in chair since". Old rows
      // have none, so fall back to check-in time and keep an open-ended
      // duration honest rather than inventing "0 minutes".
      const startedAt = visit.consultStartedAt || visit.checkedInAt || visit.visitDate || visit.createdAt;
      await col.updateOne(
        { _id: visit._id },
        {
          $set: {
            status: TARGET_STATUS,
            consultStartedAt: startedAt,
          },
          $push: {
            statusHistory: {
              from: null,
              to: TARGET_STATUS,
              at: new Date(),
              note: `Migrated from ${LEGACY_STATUS}; no queue token was ever issued for this visit`,
            },
          },
        },
      );
      migrated += 1;
    }
    return migrated;
  };

  if (DRY_RUN) {
    log('  --dry-run: no writes were made. Re-run without --dry-run to apply.');
    return legacy.length;
  }

  const migrated = await migrateOne();
  log('');
  log(`  Migrated ${migrated} visit(s) to ${TARGET_STATUS}.`);

  const after = await col.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }, { $sort: { _id: 1 } }]).toArray();
  log('  Status distribution now:');
  for (const row of after) log(`    ${row._id}: ${row.n}`);

  return migrated;
};

await connect();
try {
  await migrate();
} catch (err) {
  log(`  ERROR: ${err.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}