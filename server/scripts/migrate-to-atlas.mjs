#!/usr/bin/env node
/**
 * Copy a local MongoDB database to MongoDB Atlas (or any other target).
 *
 * Indexes are recreated on the target because several collections carry unique
 * constraints (e.g. one linked dialysis bill per session) that protect data
 * integrity after the move.
 *
 * Usage:
 *   node scripts/migrate-to-atlas.mjs --dry-run
 *   node scripts/migrate-to-atlas.mjs --drop-target
 *   node scripts/migrate-to-atlas.mjs --only=patients,dialysissessions
 *
 * Environment:
 *   SOURCE_URI  defaults to the local replica set in ../.env
 *   TARGET_URI  required - the Atlas mongodb+srv connection string
 */
import mongoose from 'mongoose';

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueOf = (prefix) => {
  const hit = args.find((a) => a.startsWith(`${prefix}=`));
  return hit ? hit.slice(prefix.length + 1) : null;
};

const DRY_RUN = has('--dry-run');
const DROP_TARGET = has('--drop-target');
const SKIP_EMPTY = !has('--include-empty');
const only = valueOf('--only');

const SOURCE_URI =
  process.env.SOURCE_URI ||
  'mongodb://127.0.0.1:27017/hospital_erp?directConnection=true&replicaSet=rs0';
const TARGET_URI = process.env.TARGET_URI || '';

const log = (...a) => console.log(...a);

const connect = async (uri, label) => {
  try {
    const conn = await mongoose.createConnection(uri, {
      serverSelectionTimeoutMS: 15000,
    }).asPromise();
    log(`  ${label} connected`);
    return conn;
  } catch (err) {
    log(`  ${label} FAILED: ${err.message}`);
    process.exit(1);
  }
};

const main = async () => {
  if (!TARGET_URI) {
    log('TARGET_URI is required.');
    log('Example:');
    log('  $env:TARGET_URI="mongodb+srv://user:pass@cluster0.xxxx.mongodb.net/hospital_erp"');
    log('  node scripts/migrate-to-atlas.mjs --dry-run');
    process.exit(1);
  }

  log('');
  log(`Migration mode : ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);
  log(`Drop target    : ${DROP_TARGET}`);
  log('');

  log('Connecting...');
  const src = await connect(SOURCE_URI, 'source');
  const dst = await connect(TARGET_URI, 'target');

  const targetName = dst.name;
  const srcName = src.name;
  if (srcName === targetName) {
    log('\nERROR: source and target are the same database. Aborting.');
    process.exit(1);
  }

  const listed = await src.db.listCollections().toArray();
  const collections = listed
    .filter((c) => c.type !== 'view')
    .map((c) => c.name)
    .filter((n) => !only || only.split(',').map((s) => s.trim()).includes(n))
    .sort();

  log('');
  log(`source db "${srcName}" -> target db "${targetName}"`);
  log(`collections: ${collections.length}`);
  log('');

  let copied = 0;
  let skipped = 0;
  const failures = [];

  for (const name of collections) {
    try {
      const count = await src.db.collection(name).countDocuments();

      if (SKIP_EMPTY && count === 0) {
        skipped += 1;
        log(`  - ${name.padEnd(32)} 0      skipped (empty)`);
        continue;
      }

      if (DRY_RUN) {
        const targetCount = await dst.db.collection(name).countDocuments();
        copied += count;
        log(`  * ${name.padEnd(32)} ${String(count).padEnd(7)} would copy (target has ${targetCount})`);
        continue;
      }

      if (DROP_TARGET) {
        await dst.db.collection(name).deleteMany({});
      }

      const docs = await src.db.collection(name).find({}).toArray();
      if (docs.length) {
        // Preserve existing documents by _id so upserts stay idempotent.
        const ops = docs.map((d) => ({
          replaceOne: {
            filter: { _id: d._id },
            replacement: d,
            upsert: true,
          },
        }));
        await dst.db.collection(name).bulkWrite(ops, { ordered: false });
      }

      // Recreate indexes (excluding the implicit _id index).
      const indexInfo = await src.db.collection(name).indexes();
      const wanted = indexInfo.filter((i) => i.name !== '_id_');
      if (wanted.length) {
        try {
          await dst.db.collection(name).createIndexes(wanted);
        } catch (idxErr) {
          log(`      index warning: ${idxErr.message}`);
        }
      }

      const after = await dst.db.collection(name).countDocuments();
      copied += after;
      log(`  + ${name.padEnd(32)} ${String(count).padEnd(7)} -> ${after}${after === count ? '' : '  (MISMATCH)'}`);
      if (after !== count) failures.push(`${name}: expected ${count}, got ${after}`);
    } catch (err) {
      failures.push(`${name}: ${err.message}`);
      log(`  x ${name.padEnd(32)} FAILED: ${err.message}`);
    }
  }

  log('');
  log(`summary: ${copied} documents across ${collections.length - skipped} collections, ${skipped} empty skipped`);

  if (failures.length) {
    log('');
    log('problems:');
    for (const f of failures) log(`  - ${f}`);
  }

  await src.close();
  await dst.close();

  if (DRY_RUN) {
    log('');
    log('Dry run complete. Re-run without --dry-run to apply.');
  } else if (!failures.length) {
    log('');
    log('Migration complete. Verify the app before closing this database.');
  }

  process.exit(failures.length ? 1 : 0);
};

main();