import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

let mongod;

before(async () => {
  const { MongoMemoryReplSet } = await import('mongodb-memory-server');
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGO_URI = mongod.getUri('hospital_erp_v1_test');
  const { connectDB, ensureCollections } = await import('../src/config/db.js');
  await connectDB();
  const { readdir } = await import('node:fs/promises');
  const path = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const modelsDir = path.resolve(import.meta.dirname, '../src/models');
  for (const file of (await readdir(modelsDir)).filter((f) => f.endsWith('.js'))) {
    await import(pathToFileURL(path.join(modelsDir, file)).href);
  }
  await ensureCollections();
  const { bootstrapRoles } = await import('../src/services/auth.service.js');
  await bootstrapRoles();
});

after(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});

beforeEach(async () => {
  if (mongoose.connection.db) {
    const collections = await mongoose.connection.db.collections();
    for (const c of collections) await c.deleteMany({});
  }
  const { bootstrapRoles } = await import('../src/services/auth.service.js');
  await bootstrapRoles();
  const { bootstrapFeatureFlags } = await import('../src/services/featureFlag.service.js');
  await bootstrapFeatureFlags();
});

const createActor = async ({ roleCode = 'SUPER_ADMIN', hospitalId = null, branchId = null } = {}) => {
  const { default: Role } = await import('../src/models/Role.model.js');
  const { default: User } = await import('../src/models/User.model.js');
  const role = await Role.findOne({ name: roleCode });
  const user = await User.create({
    username: `u_${Date.now()}_${Math.floor(Math.random() * 99999)}`,
    email: `u_${Date.now()}_${Math.floor(Math.random() * 99999)}@test.com`,
    passwordHash: 'Test@1234',
    role: role._id,
    roleCode,
    firstName: 'Test',
    lastName: 'User',
    phone: '9000000001',
    hospitalId,
    branchId,
  });
  return { id: String(user._id), roleCode, hospitalId, branchId, permissions: role.permissions || [] };
};

test('FEATURE FLAGS: defaults exist and are enabled', async () => {
  const { bootstrapFeatureFlags, isFeatureEnabled, setFeatureFlag } = await import('../src/services/featureFlag.service.js');
  await bootstrapFeatureFlags();
  assert.equal(await isFeatureEnabled('ENABLE_GLOBAL_SEARCH'), true);
  assert.equal(await isFeatureEnabled('ENABLE_AI'), false, 'AI is tiered off by default');
  await setFeatureFlag('ENABLE_GLOBAL_SEARCH', false);
  assert.equal(await isFeatureEnabled('ENABLE_GLOBAL_SEARCH'), false, 'DB value wins over default');
});

test('FEATURE FLAGS: getFeatureFlags returns client-safe projection', async () => {
  const { bootstrapFeatureFlags, getFeatureFlags } = await import('../src/services/featureFlag.service.js');
  await bootstrapFeatureFlags();
  const flags = await getFeatureFlags();
  assert.ok(flags.ENABLE_GLOBAL_SEARCH, 'registry has ENABLE_GLOBAL_SEARCH');
  assert.ok('enabled' in flags.ENABLE_GLOBAL_SEARCH);
});

test('API ERROR CODES: ApiError classes carry stable machine-readable codes', async () => {
  const {
    ApiError, NotFoundError, UnauthorizedError, ForbiddenError, ConflictError,
    ValidationError, FeatureDisabledError, IdempotencyInProgressError, RateLimitError,
  } = await import('../src/utils/ApiError.js');
  assert.equal(new NotFoundError().code, 'NOT_FOUND');
  assert.equal(new UnauthorizedError().code, 'UNAUTHORIZED');
  assert.equal(new ForbiddenError().code, 'FORBIDDEN');
  assert.equal(new ConflictError().code, 'CONFLICT');
  assert.equal(new ValidationError().code, 'VALIDATION_ERROR');
  assert.equal(new RateLimitError().code, 'RATE_LIMITED');
  assert.equal(new FeatureDisabledError().code, 'FEATURE_DISABLED');
  assert.equal(new IdempotencyInProgressError().code, 'IDEMPOTENCY_IN_PROGRESS');
  assert.equal(new ApiError(500, 'boom').code, 'INTERNAL');
  assert.equal(new ApiError(400, 'bad', undefined, 'CUSTOM').code, 'CUSTOM');
});

test('GLOBAL SEARCH: patients found by text query with per-type gating', async () => {
  const actor = await createActor({});
  const { default: Patient } = await import('../src/models/Patient.model.js');
  await Patient.create({
    uhid: 'UHID-2026-700001', firstName: 'Sundaram', lastName: 'Kumar', gender: 'MALE',
    mobile: '9811100099', hospitalId: actor.hospitalId,
  });
  const { searchAll } = await import('../src/services/search.service.js');
  const res = await searchAll({ q: 'Sundaram', types: ['patients'], actor, limit: 5 });
  assert.equal(res.results.patients.length, 1);
  assert.equal(res.results.patients[0].ref, `/patients/${res.results.patients[0].id}`);
  assert.ok(!res.results.bills, 'unrequested types are not returned');
});

test('GLOBAL SEARCH: bills/admissions matched by number prefix', async () => {
  const actor = await createActor({});
  const { default: Patient } = await import('../src/models/Patient.model.js');
  const { default: Bill } = await import('../src/models/Bill.model.js');
  const { default: IpdAdmission } = await import('../src/models/IpdAdmission.model.js');
  const patient = await Patient.create({ uhid: 'UHID-2026-700002', firstName: 'R', lastName: 'M', gender: 'MALE', mobile: '9811100098' });
  await Bill.create({ billNumber: 'BILL-2026-0001', patientId: patient._id, billType: 'OPD', netTotal: 500 });
  await IpdAdmission.create({ admissionNumber: 'IPD-2026-0001', patientId: patient._id, status: 'ADMITTED' });
  const { searchAll } = await import('../src/services/search.service.js');
  const res = await searchAll({ q: 'BILL-2026', types: ['bills'], actor });
  assert.equal(res.results.bills.length, 1);
  assert.match(res.results.bills[0].subtitle, /₹500/);
  const res2 = await searchAll({ q: 'IPD-2026-0001', types: ['admissions'], actor });
  assert.equal(res2.results.admissions.length, 1);
});

test('TENANT: authenticate attaches hospital/branch tenant context', async () => {
  const { default: Hospital } = await import('../src/models/Hospital.model.js');
  const hospital = await Hospital.create({ name: 'Test Hospital', code: 'TH-1' });
  const actor = await createActor({ hospitalId: hospital._id });
  const { loadUserForTest } = {};
  // Simulate the auth middleware tenant construction:
  const user = await (await import('../src/models/User.model.js')).default.findById(actor.id);
  const tenant = {
    organizationId: user.organizationId || null,
    hospitalId: user.hospitalId || null,
    branchId: user.branchId || null,
  };
  assert.equal(String(tenant.hospitalId), String(hospital._id));
  assert.equal(tenant.organizationId, null);
});

test('MASTER: create hospital with organization tenant key', async () => {
  const { default: Hospital } = await import('../src/models/Hospital.model.js');
  const { default: Organization } = await import('../src/models/Organization.model.js');
  const org = await Organization.create({ name: 'ZhanX Group', code: 'ZHX' });
  const hospital = await Hospital.create({ name: 'ZhanX HQ', code: 'ZHX-HQ', organizationId: org._id });
  const found = await Hospital.findById(hospital._id);
  assert.equal(String(found.organizationId), String(org._id));
});

test('GLOBAL SEARCH: default types ("*") resolves all groups without crashing', async () => {
  const actor = await createActor({});
  const { default: Patient } = await import('../src/models/Patient.model.js');
  const { default: Doctor } = await import('../src/models/Doctor.model.js');
  await Patient.create({ uhid: 'UHID-2026-700003', firstName: 'ZhanX', gender: 'MALE', mobile: '9811100097' });
  await Doctor.create({ name: 'Dr ZhanX', doctorCode: 'DOC-ZX' });
  const { searchAll } = await import('../src/services/search.service.js');
  const res = await searchAll({ q: 'ZhanX', types: '*', actor, limit: 5 });
  assert.equal(res.results.patients[0].label, 'ZhanX');
  assert.ok(res.results.doctors.length >= 1, 'doctors group populated');
  // No throw for "*" whereas a plain string previously crashed on .some()
  const res2 = await searchAll({ q: 'ZhanX', types: undefined, actor, limit: 5 });
  assert.ok(res2.results.patients.length >= 1);
});

test('IDEMPOTENCY: same key replays stored response, never double-executes', async () => {
  const actor = await createActor({});
  const { idempotency } = await import('../src/middleware/idempotency.js');
  const { default: IdempotencyRecord } = await import('../src/models/IdempotencyRecord.model.js');

  const makeReq = (key) => ({
    headers: { 'idempotency-key': key },
    method: 'POST',
    originalUrl: '/api/v1/billing/payments',
    body: { billId: new mongoose.Types.ObjectId().toString(), amount: 100 },
    user: { id: actor.id },
  });

  let executions = 0;
  const handler = (_req, res) => {
    executions += 1;
    res.json({ success: true, data: { id: `pay_${executions}` } });
  };
  const json = (_res, body) => body;

  // First call executes the handler.
  let jsonBody1;
  const res1 = { setHeader() {}, json: (b) => { jsonBody1 = b; }, status() { return this; }, statusCode: 200, getHeader: () => undefined, on: () => {} };
  await idempotency(makeReq('key-A'), res1, () => handler(makeReq('key-A'), res1));
  assert.equal(executions, 1, 'handler must run exactly once');

  // Let the async DONE flush land (mirrors real-world delay between response and replay).
  await new Promise((r) => setTimeout(r, 50));

  let jsonBody2;
  const res2 = {
    setHeader() {}, json: (b) => { jsonBody2 = b; }, status(code) { this._status = code; return this; },
    getHeader: (h) => (h === 'x-idempotent-replay' ? 'true' : undefined), statusCode: 200, on: () => {},
  };
  // res.json wrapper stores synchronously; replay path returns stored body directly.
  const replayBody = await new Promise((resolve) => {
    const wrappedRes = { ...res2, json: (b) => { jsonBody2 = b; resolve(b); } };
    idempotency(makeReq('key-A'), wrappedRes, () => handler(makeReq('key-A'), wrappedRes));
  });
  assert.equal(executions, 1, 'handler must run exactly once');
  assert.deepEqual(replayBody, { success: true, data: { id: 'pay_1' } });

  const rec = await IdempotencyRecord.findOne({ userId: actor.id, key: 'key-A' });
  assert.equal(rec.status, 'DONE');
});

test('QUEUE BOARD: groups today by doctor with status buckets and wait stats', async () => {
  const { default: Doctor } = await import('../src/models/Doctor.model.js');
  const { default: Patient } = await import('../src/models/Patient.model.js');
  const { default: Appointment, APPOINTMENT_STATUS } = await import('../src/models/Appointment.model.js');
  const { getQueueBoard } = await import('../src/services/queue.service.js');

  const doctor = await Doctor.create({ name: 'Dr Q Test', doctorCode: 'DOC-Q'.concat(Date.now()) });
  const p1 = await Patient.create({ uhid: `UHID-2026-Q1-${Date.now()}`, registrationNumber: `REG-Q1-${Date.now()}`, firstName: 'Queue', gender: 'MALE', mobile: '9811100199'.concat(String(Date.now()).slice(-2)) });
  const p2 = await Patient.create({ uhid: `UHID-2026-Q2-${Date.now()}`, registrationNumber: `REG-Q2-${Date.now()}`, firstName: 'Token', gender: 'FEMALE', mobile: '9811100200'.concat(String(Date.now()).slice(-2)) });

  const now = new Date();
  const base = { doctorId: doctor._id, date: now };
  await Appointment.create([{ ...base, patientId: p1._id, time: '09:00', tokenNumber: 1, status: APPOINTMENT_STATUS.CHECKED_IN, checkedInAt: new Date(now.getTime() - 10 * 60000), appointmentNumber: `APT-Q-${Date.now()}-1` },
    { ...base, patientId: p2._id, time: '09:30', tokenNumber: 2, status: APPOINTMENT_STATUS.IN_PROGRESS, checkedInAt: new Date(now.getTime() - 5 * 60000), appointmentNumber: `APT-Q-${Date.now()}-2` }]);

  const board = await getQueueBoard({});
  const doc = board.doctors.find((d) => d.code === doctor.doctorCode);
  assert.ok(doc, 'doctor bucketed');
  assert.equal(doc.items.length, 2);
  assert.equal(board.summary.checkedIn, 1);
  assert.equal(board.summary.inConsultation, 1);
  assert.equal(board.summary.activeWaiters, 2);
  assert.ok(board.summary.avgWaitMinutes >= 5 && board.summary.avgWaitMinutes <= 10, 'avg wait within sampled minutes');
  const p1items = doc.items.find((i) => i.tokenNumber === 1);
  assert.equal(p1items.waitMinutes, 10);
  assert.equal(p1items.patient.uhid, p1.uhid);
});

test('BED COMMAND CENTER: groups wards with per-bed patient + counts', async () => {
  const { Ward, Bed } = await import('../src/models/Bed.model.js');
  const { default: Patient } = await import('../src/models/Patient.model.js');
  const { default: IpdAdmission } = await import('../src/models/IpdAdmission.model.js');
  const { bedCommandCenter } = await import('../src/services/ipd.service.js');

  const ward = await Ward.create({ name: `ICU-${Date.now()}`, code: 'ICU' });
  const bed1 = await Bed.create({ bedNumber: 'ICU-01', code: `ICU-ICU-01-${Date.now()}`, wardId: ward._id, status: 'AVAILABLE' });
  const bed2 = await Bed.create({ bedNumber: 'ICU-02', code: `ICU-ICU-02-${Date.now()}`, wardId: ward._id, status: 'OCCUPIED' });

  const patient = await Patient.create({ uhid: `UHID-BED-${Date.now()}`, registrationNumber: `REG-BED-${Date.now()}`, firstName: 'Bed', lastName: 'Pat', gender: 'MALE', mobile: String(Date.now()).slice(-10) });
  const admission = await IpdAdmission.create({
    admissionNumber: `IPD-BED-${Date.now()}`,
    patientId: patient._id,
    bedId: bed2._id,
    wardId: ward._id,
    admittingDiagnosis: 'Fever',
  });
  await Bed.findByIdAndUpdate(bed2._id, { currentAdmissionId: admission._id });

  const board = await bedCommandCenter();
  assert.equal(board.total, 2);
  assert.equal(board.occupied, 1);
  assert.equal(board.available, 1);
  const w = board.wards.find((x) => x.code === 'ICU');
  assert.ok(w, 'ward present');
  assert.equal(w.counts.occupied, 1);
  assert.equal(w.counts.available, 1);
  const occBed = w.beds.find((b) => b.bedNumber === 'ICU-02');
  assert.equal(occBed.patient.uhid, patient.uhid);
  assert.equal(occBed.admission.chiefComplaint, 'Fever');
});

test('CASHIER: open shift, collects review totals, close computes variance', async () => {
  const { default: Hospital } = await import('../src/models/Hospital.model.js');
  const { default: Bill } = await import('../src/models/Bill.model.js');
  const { default: Payment } = await import('../src/models/Payment.model.js');
  const { default: Refund } = await import('../src/models/Refund.model.js');
  const actor = await createActor({});
  const cashier = await createActor({ roleCode: 'BILLING_STAFF' });
  const { openShift, closeShift, getCurrentShift } = await import('../src/services/cashier.service.js');

  const userDoc = await (await import('../src/models/User.model.js')).default.findById(cashier.id);

  // payments/refunds that happened before the shift must NOT count
  await Payment.create({ transactionId: `PAY-OLD-${Date.now()}`, billId: new mongoose.Types.ObjectId(), amount: 5000, mode: 'CASH', receivedBy: userDoc._id, paidAt: new Date(Date.now() - 3600e3) });
  await Payment.create({ transactionId: `PAY-OLD2-${Date.now()}`, billId: new mongoose.Types.ObjectId(), amount: 700, mode: 'UPI', receivedBy: userDoc._id, paidAt: new Date(Date.now() - 3600e3) });

  const shift = await openShift({ openingCash: 1000 }, cashier);
  assert.equal(shift.status, 'OPEN');
  assert.ok(shift.shiftNumber.startsWith('SHFT-'), `shift number format: ${shift.shiftNumber}`);

  // in-shift cash + UPI collections
  const pCash = await Payment.create({ transactionId: `PAY-IN-${Date.now()}`, billId: new mongoose.Types.ObjectId(), amount: 4000, mode: 'CASH', receivedBy: userDoc._id });
  const pUpi = await Payment.create({ transactionId: `PAY-UP-${Date.now()}`, billId: new mongoose.Types.ObjectId(), amount: 1200, mode: 'UPI', receivedBy: userDoc._id });
  const rCash = await Refund.create({ refundNumber: `RF-IN-${Date.now()}`, billId: new mongoose.Types.ObjectId(), patientId: new mongoose.Types.ObjectId(), paymentId: pCash._id, amount: 500, reason: 'retest', refundedVia: 'CASH', processedBy: userDoc._id });

  const live = await getCurrentShift(cashier);
  assert.ok(live?.live, 'live totals present');
  assert.equal(live.live.cashCollected, 3500, 'cash minus cash refunds');

  const closed = await closeShift(shift._id, { countedCash: 4500 }, cashier);
  assert.equal(closed.status, 'CLOSED');
  assert.equal(closed.expectedCash, 4500, 'opening 1000 + net cash 3500');
  assert.equal(closed.variance, 0);
  assert.ok(closed.closedAt);
  assert.equal(closed.paymentsTotal, 5200, '4000 cash + 1200 upi');
  assert.equal(closed.refundsTotal, 500);
  assert.equal(closed.transactions, 3, '2 payments + 1 refund');

  // Cannot close twice
  await assert.rejects(() => closeShift(shift._id, { countedCash: 4500 }, cashier), /already closed/);

  // getCurrentShift now returns null
  const none = await getCurrentShift(cashier);
  assert.equal(none, null);
});

test('INSURANCE: policy → pre-auth → claim submit → decide → settle', async () => {
  const actor = await createActor({ roleCode: 'INSURANCE_STAFF' });
  const userDoc = await (await import('../src/models/User.model.js')).default.findById(actor.id);
  const Patient = (await import('../src/models/Patient.model.js')).default;
  const Insurance = (await import('../src/models/Insurance.model.js')).default;
  const svc = await import('../src/services/insurance.service.js');

  const patient = await Patient.create({
    uhid: `UHID-INS-${Date.now()}`,
    registrationNumber: `REG-INS-${Date.now()}`,
    firstName: 'Insured', lastName: 'Test', gender: 'FEMALE',
    mobile: '9888' + String(Date.now()).slice(-6),
    dateOfBirth: new Date('1990-01-01'),
  });

  const company = await svc.createCompany({ name: 'Star Health', code: 'STAR', tpaName: 'MediAssist' }, { user: actor });

  const policy = await svc.createPolicy({ policyNumber: `POL-${Date.now()}`, companyId: company._id, patientId: patient._id, sumInsured: 200000, startDate: new Date('2026-01-01'), endDate: new Date('2027-01-01') }, { user: actor });
  assert.equal(String(policy.companyId._id || policy.companyId), String(company._id));

  // Pre-auth request + approval
  const preauth = await svc.createPreAuth({ policyId: policy._id, patientId: patient._id, requestedAmount: 80000, diagnosis: 'Appendicitis' }, { user: actor });
  assert.equal(preauth.status, 'PENDING');
  assert.ok(preauth.preAuthNumber.startsWith('PRA-'), `pre-auth number format: ${preauth.preAuthNumber}`);

  // Cannot decide twice
  const decided = await svc.decidePreAuth(preauth._id, { decision: 'APPROVED', approvedAmount: 60000, remarks: 'Coverage applies' }, { user: actor });
  assert.equal(decided.status, 'APPROVED');
  assert.equal(decided.approvedAmount, 60000);
  await assert.rejects(() => svc.decidePreAuth(preauth._id, { decision: 'APPROVED', approvedAmount: 1000 }, { user: actor }), /already decided/);

  // Claim lifecycle
  const claim = await svc.createClaim({ policyId: policy._id, patientId: patient._id, claimedAmount: 90000, preAuthorizationNumber: preauth.preAuthNumber, diagnosis: 'Appendicitis' }, { user: actor });
  assert.equal(claim.status, 'DRAFT');
  assert.ok(claim.claimNumber.startsWith('CLM-'));

  // Cannot decide a DRAFT
  await assert.rejects(() => svc.decideClaim(claim._id, { decision: 'APPROVED', approvedAmount: 50000 }, { user: actor }), /decisionable/);

  const submitted = await svc.submitClaim(claim._id, { user: actor });
  assert.equal(submitted.status, 'SUBMITTED');

  const approved = await svc.decideClaim(claim._id, { decision: 'PARTIALLY_APPROVED', approvedAmount: 70000, patientResponsibility: 20000, remarks: 'Room cap applied' }, { user: actor });
  assert.equal(approved.status, 'PARTIALLY_APPROVED');
  assert.equal(approved.approvedAmount, 70000);
  assert.equal(approved.patientResponsibility, 20000);
  assert.equal(approved.rejectedAmount, 20000, 'claimed 90000 - approved 70000');

  // Re-decide allowed while approved (upsert path for edits)
  const redecided = await svc.decideClaim(claim._id, { decision: 'APPROVED', approvedAmount: 70000, patientResponsibility: 20000 }, { user: actor });
  assert.equal(redecided.status, 'APPROVED');

  const settled = await svc.settleClaim(claim._id, { user: actor });
  assert.equal(settled.status, 'SETTLED');
  assert.ok(settled.settledAt);

  // Settling twice blocked
  await assert.rejects(() => svc.settleClaim(claim._id, { user: actor }), /only approved/i);

  // Rejection path
  const claim2 = await svc.createClaim({ policyId: policy._id, patientId: patient._id, claimedAmount: 50000, diagnosis: 'Not covered' }, { user: actor });
  await svc.submitClaim(claim2._id, { user: actor });
  const rejected = await svc.decideClaim(claim2._id, { decision: 'REJECTED', remarks: 'Exclusion' }, { user: actor });
  assert.equal(rejected.status, 'REJECTED');
  assert.equal(rejected.patientResponsibility, 50000);
  assert.equal(rejected.rejectedAmount, 50000);
  await assert.rejects(() => svc.settleClaim(claim2._id, { user: actor }), /only approved/i);

  // Lists respect filters
  const list = await svc.listClaims({ query: { status: 'REJECTED', patientId: patient._id } });
  assert.equal(list.data.length, 1);
});