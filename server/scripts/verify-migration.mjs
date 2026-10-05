#!/usr/bin/env node
/**
 * Compare a source database against the migrated target to confirm nothing was
 * lost or truncated. Run this after scripts/migrate-to-atlas.mjs.
 *
 * Usage:
 *   $env:TARGET_URI="mongodb+srv://user:pass@cluster0.xxxx.mongodb.net/hospital_erp"
 *   node scripts/verify-migration.mjs
 *
 * Environment:
 *   SOURCE_URI  defaults to the local replica set in ../.env
 *   TARGET_URI  required
 */
import mongoose from 'mongoose';

const SOURCE_URI =
  process.env.SOURCE_URI ||
  'mongodb://127.0.0.1:27017/hospital_erp?directConnection=true&replicaSet=rs0';
const TARGET_URI = process.env.TARGET_URI || '';

if (!TARGET_URI) {
  console.log('TARGET_URI is required.');
  process.exit(1);
}

const connect = async (uri, label) => {
  try {
    const conn = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 15000 }).asPromise();
    console.log(`  ${label} connected (${conn.name})`);
    return conn;
  } catch (err) {
    console.log(`  ${label} FAILED: ${err.message}`);
    process.exit(1);
  }
};

/** listIndexes throws when the collection was never created on the target. */
const safeIndexes = async (conn, name) => {
  try {
    return await conn.db.collection(name).indexes();
  } catch {
    return null;
  }
};

const src = await connect(SOURCE_URI, 'source');
const dst = await connect(TARGET_URI, 'target');

const names = (await src.db.listCollections().toArray())
  .filter((c) => c.type !== 'view')
  .map((c) => c.name)
  .sort();

let ok = 0;
const problems = [];

console.log('');
console.log(`verifying ${names.length} collections: "${src.name}" -> "${dst.name}"`);
console.log('');

for (const name of names) {
  const s = await src.db.collection(name).countDocuments();
  const t = await dst.db.collection(name).countDocuments();

  const si = (await safeIndexes(src, name)) || [];
  const ti = await safeIndexes(dst, name);
  const tu = new Set((ti || []).filter((i) => i.name !== '_id_').map((i) => i.name));
  const missingIdx = si.filter((i) => i.name !== '_id_' && !tu.has(i.name)).map((i) => i.name);

  const countOk = s === t;
  // An empty source collection that was skipped is not a data loss.
  const idxOk = missingIdx.length === 0 || (s === 0 && t === 0 && ti === null);
  if (countOk && idxOk) ok += 1;
  else problems.push(
    `${name}: count ${s} vs ${t}${missingIdx.length ? `, missing indexes: ${missingIdx.join(',')}` : ''}`
  );

  const flag = countOk ? (idxOk ? '+' : '!') : 'x';
  console.log(
    `  ${flag} ${name.padEnd(32)} src=${String(s).padEnd(7)} tgt=${String(t).padEnd(7)}` +
      `${idxOk ? '' : `  MISSING IDX: ${missingIdx.join(',')}`}`
  );
}

console.log('');
console.log(`${ok}/${names.length} collections verified`);

if (problems.length) {
  console.log('');
  console.log('problems:');
  for (const p of problems) console.log(`  - ${p}`);
}

await src.close();
await dst.close();
process.exit(problems.length ? 1 : 0);