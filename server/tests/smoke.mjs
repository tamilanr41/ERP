import { MongoMemoryReplSet } from 'mongodb-memory-server';

const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
process.env.MONGO_URI = replSet.getUri('hospital_erp');
process.env.NODE_ENV = 'test';
process.env.PORT = '5101';

const { default: app } = await import('../src/app.js');
const { connectDB } = await import('../src/config/db.js');
const { bootstrapRoles } = await import('../src/services/auth.service.js');

await connectDB();
await bootstrapRoles();

const { default: Role } = await import('../src/models/Role.model.js');
const { default: User } = await import('../src/models/User.model.js');
const { default: Hospital } = await import('../src/models/Hospital.model.js');
const { default: Doctor } = await import('../src/models/Doctor.model.js');
const { default: Supplier } = await import('../src/models/Supplier.model.js');
const { default: Medicine } = await import('../src/models/Medicine.model.js');
const { default: LabTest } = await import('../src/models/LabTest.model.js');
const { Ward, Bed } = await import('../src/models/Bed.model.js');

const superRole = await Role.findOne({ name: 'SUPER_ADMIN' });
await User.create({
  username: 'superadmin',
  email: 'superadmin@hospital.com',
  firstName: 'Super',
  lastName: 'Admin',
  passwordHash: 'Super@123',
  role: superRole._id,
  roleCode: 'SUPER_ADMIN',
  status: 'ACTIVE',
});
const labRole = await Role.findOne({ name: 'LAB_TECHNICIAN' });
await User.create({
  username: 'labtech',
  email: 'lab@hospital.com',
  firstName: 'Lab',
  lastName: 'Tech',
  passwordHash: 'Lab@123',
  role: labRole._id,
  roleCode: 'LAB_TECHNICIAN',
  status: 'ACTIVE',
});
await Hospital.create({ name: 'Smoke Test Hospital', code: 'SMK', email: 'h@h.com', phone: '9876543210' });
const dr = await Doctor.create({ name: 'Dr. Test', specialization: 'Cardiology', consultationFee: 500 });
const sup = await Supplier.create({ name: 'Medi Supply', contact: { phone: '9999999999' } });
const med = await Medicine.create({ name: 'Paracetamol 500', genericName: 'Paracetamol', unit: 'TAB', reorderLevel: 10, gstPct: 12 });
const test1 = await LabTest.create({ name: 'CBC', code: 'CBC', price: 300, sampleType: 'BLOOD' });
const test2 = await LabTest.create({ name: 'Blood Sugar', code: 'GLU', price: 150, sampleType: 'BLOOD' });
const ward = await Ward.create({ name: 'General Ward', code: 'GEN' });
const bed = await Bed.create({ bedNumber: 'B-101', code: 'GEN-B101', wardId: ward._id, status: 'AVAILABLE' });
const bed2 = await Bed.create({ bedNumber: 'B-102', code: 'GEN-B102', wardId: ward._id, status: 'AVAILABLE' });

const server = await new Promise((resolve) => {
  const s = app.listen(5101, () => resolve(s));
});

const base = 'http://127.0.0.1:5101/api';
const results = [];
const run = async (label, fn) => {
  try {
    const { status, body } = await fn();
    const ok = status >= 200 && status < 300;
    results.push({ label, ok, status, summary: JSON.stringify(body).slice(0, 150) });
  } catch (e) {
    results.push({ label, ok: false, status: 'ERR', summary: e.message });
  }
};

const get = (path, token) =>
  fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } }).then(async (r) => ({ status: r.status, body: await r.json() }));
const post = (path, token, payload) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

const loginRes = await fetch(`${base}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ usernameOrEmail: 'superadmin@hospital.com', password: 'Super@123' }),
});
const loginBody = await loginRes.json();
results.push({ label: 'POST /auth/login', ok: loginRes.ok, status: loginRes.status, summary: JSON.stringify(loginBody).slice(0, 150) });
const token = loginBody.data?.accessToken;
if (!token) {
  console.table(results);
  await server.close();
  await replSet.stop();
  process.exit(1);
}

let patientRes = null;
await run('GET /masters/hospital', () => get('/masters/hospital', token));
await run('PUT /masters/hospital', () =>
  post('/masters/hospital', token, { name: 'Smoke Test Hospital', phone: '9876543210', email: 'h@h.com' }));
await run('GET /masters/doctors', () => get('/masters/doctors?limit=100', token));
await run('GET /dashboard/', () => get('/dashboard/', token));
await run('GET /dashboard/revenue-trend', () => get('/dashboard/revenue-trend', token));
await run('GET /dashboard/opd-vs-ipd', () => get('/dashboard/opd-vs-ipd', token));
await run('GET /dashboard/department-revenue', () => get('/dashboard/department-revenue', token));
await run('GET /dashboard/bed-occupancy', () => get('/dashboard/bed-occupancy', token));

const labLogin = await fetch(`${base}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ usernameOrEmail: 'labtech', password: 'Lab@123' }),
});
const labToken = (await labLogin.json()).data?.accessToken;
await run('GET /dashboard/ (LAB_TECHNICIAN)', () => get('/dashboard/', labToken));

await run('POST /patients', () =>
  post('/patients', token, { firstName: 'Smoke', lastName: 'Patient', gender: 'MALE', dateOfBirth: '1990-01-01', mobile: '9876543210', email: 'smoke@test.com' }).then((r) => {
    if (r.body?.data?._id) patientRes = r.body.data;
    return r;
  }));
await run('GET /patients', () => get('/patients?page=1', token));

const pid = patientRes?._id;

await run('POST /appointments', () => post('/appointments', token, { patientId: pid, doctorId: dr._id.toString(), date: '2026-09-18', time: '09:30', type: 'OPD' }));
await run('GET /appointments', () => get('/appointments?page=1', token));

await run('POST /opd/visits', () => post('/opd/visits', token, { patientId: pid, chiefComplaints: 'Fever', vitals: { temperature: 98.6, bp: '120/80', pulse: 72, heightCm: 170, weightKg: 65, spo2: 98 } }));
await run('GET /opd/visits', () => get('/opd/visits?page=1', token));

await run('POST /pharmacy/purchases', () =>
  post('/pharmacy/purchases', token, {
    supplierId: sup._id.toString(),
    items: [{ medicineId: med._id.toString(), batchNumber: 'SMK-1', quantity: 100, purchaseRate: 8, sellingRate: 10, mrp: 12, expiryDate: '2028-12-31' }],
    paymentMode: 'CASH',
    paidAmount: 896,
  }));
await run('GET /pharmacy/medicines', () => get('/pharmacy/medicines?page=1', token));
await run('GET /pharmacy/purchases', () => get('/pharmacy/purchases?page=1', token));

await run('POST /pharmacy/sales', () =>
  post('/pharmacy/sales', token, {
    patientId: pid,
    items: [{ medicineId: med._id.toString(), quantity: 5, rate: 10 }],
    payment: { mode: 'CASH', amount: 56 },
  }));
await run('GET /pharmacy/sales', () => get('/pharmacy/sales?page=1', token));

let orderRes = null;
await run('POST /lab/orders', () =>
  post('/lab/orders', token, {
    patientId: pid,
    doctorId: dr._id.toString(),
    priority: 'ROUTINE',
    items: [{ labTestId: test1._id.toString() }, { labTestId: test2._id.toString() }],
  }).then((r) => {
    if (r.body?.data?._id) orderRes = r.body.data;
    return r;
  }));
await run('GET /lab/orders', () => get('/lab/orders?page=1', token));
await run('GET /lab/tests', () => get('/lab/tests?limit=100', token));

let billRes = null;
await run('POST /billing', () =>
  post('/billing', token, {
    patientId: pid,
    billType: 'OPD',
    items: [{ itemType: 'SERVICE', name: 'Consultation', quantity: 1, rate: 500, total: 500 }],
    payment: { mode: 'CASH', amount: 500 },
  }).then((r) => {
    if (r.body?.data?._id) billRes = r.body.data;
    return r;
  }));
await run('GET /billing', () => get('/billing?page=1', token));
await run('GET /billing/outstanding', () => get('/billing/outstanding', token));
await run('GET /billing/payments/list', () => get('/billing/payments/list', token));
await run('GET /billing/collection/summary', () => get('/billing/collection/summary', token));

let admissionRes = null;
await run('POST /ipd/admissions', () =>
  post('/ipd/admissions', token, { patientId: pid, bedId: bed._id.toString(), admissionType: 'OPD' }).then((r) => {
    if (r.body?.data?._id) admissionRes = r.body.data;
    return r;
  }));
await run('POST /ipd/admissions/:id/transfer', () =>
  post(`/ipd/admissions/${admissionRes?._id}/transfer`, token, { newBedId: bed2._id.toString() }));
await run('POST /ipd/admissions/:id/transfer-invalid', () =>
  post('/ipd/admissions/X/transfer', token, { newBedId: bed2._id.toString() }));
await run('GET /ipd/admissions', () => get('/ipd/admissions?page=1', token));
await run('POST /ipd/admissions/:id/discharge', () =>
  post(`/ipd/admissions/${admissionRes?._id}/discharge`, token, { dischargeType: 'RECOVERED', comments: 'All good' }));
await run('GET /ipd/beds', () => get('/ipd/beds?limit=100', token));
await run('GET /ipd/bed-map', () => get('/ipd/bed-map', token));

await run('GET /reports', () => get('/reports', token));
await run('GET /reports/patients', () => get('/reports/patients', token));
await run('GET /reports/bills', () => get('/reports/bills', token));
await run('GET /reports/outstanding', () => get('/reports/outstanding', token));
await run('GET /reports/expiring', () => get('/reports/expiring', token));
await run('GET /reports/low_stock', () => get('/reports/low_stock', token));

await run('GET /users/roles', () => get('/users/roles', token));
await run('GET /users', () => get('/users', token));
await run('GET /notifications', () => get('/notifications', token));
await run('GET /audit', () => get('/audit?page=1', token));
await run('GET /settings', () => get('/settings', token));

console.table(results);
const failed = results.filter((r) => !r.ok);
console.log(`\nPASS: ${results.length - failed.length}/${results.length}`);
await server.close();
await replSet.stop();
process.exit(failed.length ? 1 : 0);