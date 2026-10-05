import fs from 'fs';
const LOG = 'C:/Users/acer/AppData/Local/Temp/opencode/flatten-probe.log';
fs.writeFileSync(LOG, 'start\n');
const log = (s) => { fs.appendFileSync(LOG, s + '\n'); };

import { MongoMemoryReplSet } from 'mongodb-memory-server';
const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
process.env.MONGO_URI = replSet.getUri('hospital_erp');
process.env.NODE_ENV = 'test';
const { connectDB } = await import('../src/config/db.js');
const { bootstrapRoles } = await import('../src/services/auth.service.js');
const { default: Role } = await import('../src/models/Role.model.js');
const { default: User } = await import('../src/models/User.model.js');
const { default: Hospital } = await import('../src/models/Hospital.model.js');
const { default: Patient } = await import('../src/models/Patient.model.js');
const { runReport, toCSV, flatten } = await import('../src/services/report.service.js');

log('mongo+imports done');
await connectDB();
await bootstrapRoles();
const admin = await User.create({ username: 'superadmin', passwordHash: 'Admin@123', firstName: 'S', role: (await Role.findOne({ name: 'SUPER_ADMIN' }))._id, roleCode: 'SUPER_ADMIN' });
const h = await Hospital.create({ name: 'TH', code: 'MAIN' });
await Patient.create({ firstName: 'P', lastName: 'L', gender: 'MALE', mobile: '9898989898', uhid: 'U1', registrationNumber: 'R1', registeredBy: admin._id, hospitalId: h._id });
log('seeded');

const rows = await runReport('patients', {});
log('runReport done, isArray=' + Array.isArray(rows) + ' len=' + rows.length);
log('row ctor: ' + rows[0]?.constructor?.name + ' hasToJSON=' + !!(rows[0]?.toJSON));
log('own keys count: ' + Object.keys(rows[0]).length);

const flatRows = rows.map((r) => r);
log('before flatten call');

let flat, headerList;
try {
  const t0 = Date.now();
  const r1 = flatten(rows.slice(0, 1));
  log('flatten(1) done in ' + (Date.now() - t0) + 'ms flatLen=' + r1.flat.length + ' hLen=' + r1.headerList.length);
  log('headers: ' + JSON.stringify(r1.headerList.slice(0, 50)));
  flat = r1.flat;
  headerList = r1.headerList;
} catch (e) {
  log('flatten ERR: ' + (e && e.stack || e).slice(0, 500));
  process.exit(2);
}
const f0 = flat[0] || {};
const objKeys = Object.keys(f0).filter((k) => f0[k] && typeof f0[k] === 'object');
log('object-valued keys: ' + JSON.stringify(objKeys.slice(0, 20)));
let csvLen = -1;
try {
  const t1 = Date.now();
  const csv = toCSV(rows.slice(0, 1));
  csvLen = csv.length;
  log('toCSV(1) done in ' + (Date.now() - t1) + 'ms len=' + csvLen);
} catch (e) {
  log('toCSV ERR: ' + String(e && e.stack || e).slice(0, 300));
}
log('DONE');
process.exit(0);