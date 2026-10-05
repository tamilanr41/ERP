import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

let mongod;

before(async () => {
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGO_URI = mongod.getUri('hospital_erp_test');
  const { connectDB, ensureCollections } = await import('../src/config/db.js');
  await connectDB();

  // Register every model, then pre-create all collections so transactions never
  // implicitly create namespaces (implicit creation inside a txn => WriteConflict 112).
  const { readdir } = await import('node:fs/promises');
  const path = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const modelsDir = path.resolve(import.meta.dirname, '../src/models');
  const files = await readdir(modelsDir);
  for (const file of files.filter((f) => f.endsWith('.js'))) {
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
});

const ACTORS = {
  superAdmin: { id: null, roleCode: 'SUPER_ADMIN', hospitalId: null, branchId: null },
};

const createActor = async ({ roleCode = 'SUPER_ADMIN', username = 'tester', password = 'Test@1234', email = 'test@test.com' }) => {
  const { default: Role } = await import('../src/models/Role.model.js');
  const { default: User } = await import('../src/models/User.model.js');
  const role = await Role.findOne({ name: roleCode });
  const user = await User.create({
    username, email, passwordHash: password, role: role._id, roleCode, firstName: 'Test', lastName: 'User',
    phone: '9000000000',
  });
  return { id: String(user._id), roleCode, hospitalId: null, branchId: null, permissions: role.permissions || [] };
};

test('AUTH: login returns tokens + safe user, rejects wrong password', async () => {
  const actor = await createActor({});
  const { loginUser } = await import('../src/services/auth.service.js');
  const result = await loginUser({ usernameOrEmail: 'tester', password: 'Test@1234' }, { headers: {} });
  assert.ok(result.accessToken);
  assert.ok(result.refreshToken);
  assert.equal(result.user.username, 'tester');
  assert.equal(result.user.passwordHash, undefined, 'hash must not be exposed');

  await assert.rejects(() => loginUser({ usernameOrEmail: 'tester', password: 'wrongpass1' }, {}), /Invalid credentials/);
});

test('AUTH: locks account after repeated failures', async () => {
  const actor = await createActor({});
  const { loginUser } = await import('../src/services/auth.service.js');
  for (let i = 0; i < 5; i++) {
    await assert.rejects(() => loginUser({ usernameOrEmail: 'tester', password: 'badpass!!' }, {}));
  }
  await assert.rejects(() => loginUser({ usernameOrEmail: 'tester', password: 'Test@1234' }, {}), /locked/i);
});

test('PATIENT: registration generates unique UHID and rejects duplicate mobile', async () => {
  const actor = await createActor({});
  const { registerPatient } = await import('../src/services/patient.service.js');
  const p1 = await registerPatient({ firstName: 'Arun', lastName: 'K', gender: 'MALE', mobile: '9811100000', dateOfBirth: new Date(1990, 0, 1) }, actor);
  const p2 = await registerPatient({ firstName: 'Manu', gender: 'FEMALE', mobile: '9811100001' }, actor);
  assert.ok(p1.uhid.startsWith('ZMC-'), `UHID format: ${p1.uhid}`);
  assert.notEqual(p1.uhid, p2.uhid, 'UHIDs must be unique');
  await assert.rejects(() => registerPatient({ firstName: 'Dup', gender: 'MALE', mobile: '9811100000' }, actor), /already exists/i);
});

test('APPOINTMENT: prevents double-booking same doctor+date+time, cancel frees the slot', async () => {
  const actor = await createActor({});
  const { default: Patient } = await import('../src/models/Patient.model.js');
  const { registerPatient } = await import('../src/services/patient.service.js');
  const p1 = await registerPatient({ firstName: 'A', gender: 'MALE', mobile: '9811100002' }, actor);
  const p2 = await registerPatient({ firstName: 'B', gender: 'FEMALE', mobile: '9811100003' }, actor);

  const { default: Department } = await import('../src/models/Department.model.js');
  const { default: Doctor } = await import('../src/models/Doctor.model.js');
  const dept = await Department.create({ name: 'General Medicine' });
  const doc = await Doctor.create({ name: 'Dr Test', departmentId: dept._id, consultationFee: 300 });

  const { createAppointment, updateAppointmentStatus } = await import('../src/services/appointment.service.js');
  const date = new Date('2026-09-20T00:00:00Z');
  const appointment = await createAppointment({ patientId: p1._id, doctorId: doc._id, date, time: '10:00' }, actor);
  assert.equal(appointment.tokenNumber, 1);

  await assert.rejects(
    () => createAppointment({ patientId: p2._id, doctorId: doc._id, date, time: '10:00' }, actor),
    /already booked/i,
  );

  await updateAppointmentStatus(appointment._id, 'CANCELLED', actor);
  const afterCancel = await createAppointment({ patientId: p2._id, doctorId: doc._id, date, time: '10:00' }, actor);
  assert.equal(afterCancel.tokenNumber, 2);
});

const setupPharmacy = async () => {
  const actor = await createActor({});
  const { default: Medicine } = await import('../src/models/Medicine.model.js');
  const { default: MedicineBatch } = await import('../src/models/MedicineBatch.model.js');
  const { registerPatient } = await import('../src/services/patient.service.js');
  const patient = await registerPatient({ firstName: 'Ph', lastName: 'Patient', gender: 'MALE', mobile: '9811100004' }, actor);

  const med = await Medicine.create({ name: 'Test Tablet', genericName: 'Test', unit: 'TAB', gstPct: 12, reorderLevel: 5 });

  const today = new Date();
  const expiredDate = new Date(today.getTime() - 10 * 86400000);
  const futureDate = new Date(today.getTime() + 100 * 86400000);

  const oldBatch = await MedicineBatch.create({ medicineId: med._id, batchNumber: 'EXPR-1', expiryDate: expiredDate, sellingRate: 10, quantity: 50 });
  const newBatch = await MedicineBatch.create({ medicineId: med._id, batchNumber: 'NEW-2', expiryDate: futureDate, sellingRate: 12, quantity: 20 });

  return { actor, patient, med, oldBatch, newBatch };
};

test('PHARMACY: FEFO selects earliest valid (non-expired) batch first', async () => {
  const { actor, med } = await setupPharmacy();
  const { selectBatchesFefo } = await import('../src/services/pharmacy.service.js');
  const { default: MedicineBatch } = await import('../src/models/MedicineBatch.model.js');
  const soonDate = new Date(Date.now() + 20 * 86400000);
  await MedicineBatch.create({ medicineId: med._id, batchNumber: 'SOON-3', expiryDate: soonDate, sellingRate: 11, quantity: 5 });
  const selected = await selectBatchesFefo(med._id, 5);
  assert.equal(selected.length, 1, 'single batch is enough');
  assert.equal(selected[0].batch.batchNumber, 'SOON-3', 'earliest expiry wins over later expiry');
});

test('PHARMACY: refuses to sell expired medicine', async () => {
  const { actor, med } = await setupPharmacy();
  const { createSale } = await import('../src/services/pharmacy.service.js');
  const { default: MedicineBatch } = await import('../src/models/MedicineBatch.model.js');
  const { default: Patient } = await import('../src/models/Patient.model.js');
  const patient = await Patient.findOne({});
  await MedicineBatch.updateMany({ medicineId: med._id, batchNumber: { $ne: 'EXPR-1' } }, { $set: { quantity: 0 } });
  await assert.rejects(
    () => createSale({ patientId: patient._id, items: [{ medicineId: med._id, quantity: 5, rate: 10 }] }, actor),
    /expired|Insufficient stock|non-expired/i,
  );
});

test('PHARMACY: sale reduces stock transactionally and creates bill+ledger', async () => {
  const { actor, patient, med } = await setupPharmacy();
  const { createSale } = await import('../src/services/pharmacy.service.js');
  const sale = await createSale({
    patientId: patient._id,
    items: [{ medicineId: med._id, quantity: 10, rate: 12 }],
    payment: { amount: 134.4, mode: 'CASH' },
  }, actor);

  assert.equal(sale.items.length, 1);
  assert.equal(sale.items[0].quantity, 10);
  assert.ok(sale.billId, 'bill must be created');
  const { default: MedicineBatch } = await import('../src/models/MedicineBatch.model.js');
  const remaining = await MedicineBatch.findOne({ medicineId: med._id, batchNumber: 'NEW-2' });
  assert.equal(remaining.quantity, 10, 'stock deducted');

  const { default: Bill } = await import('../src/models/Bill.model.js');
  const bill = await Bill.findById(sale.billId);
  assert.equal(bill.status, 'PAID');
  assert.equal(bill.paidAmount, 134.4);

  const { LedgerEntry } = await import('../src/models/Finance.model.js');
  const ledger = await LedgerEntry.find({ referenceType: 'PAYMENT' });
  assert.equal(ledger.length, 2, 'double-entry ledger written');
});

test('PHARMACY: purchase creates/updates batch and tracks payable', async () => {
  const actor = await createActor({});
  const { default: Medicine } = await import('../src/models/Medicine.model.js');
  const { default: MedicineBatch } = await import('../src/models/MedicineBatch.model.js');
  const { default: Supplier } = await import('../src/models/Supplier.model.js');
  const supplier = await Supplier.create({ name: 'Sup', contact: { phone: '9000000001' } });
  const med = await Medicine.create({ name: 'Buy Med', unit: 'TAB', gstPct: 12 });
  const { createPurchase } = await import('../src/services/pharmacy.service.js');

  const purchase = await createPurchase({
    supplierId: supplier._id,
    items: [{ medicineId: med._id, batchNumber: 'BUY-1', quantity: 100, purchaseRate: 5, sellingRate: 8, expiryDate: new Date(Date.now() + 200 * 86400000) }],
  }, actor);
  assert.ok(purchase.purchaseNumber.startsWith('PCH-'), `purchase number format: ${purchase.purchaseNumber}`);
  const batch = await MedicineBatch.findOne({ batchNumber: 'BUY-1' });
  assert.equal(batch.quantity, 100);
  assert.equal(purchase.dueAmount, 560, 'credit payable tracked');
});

test('BILLING: refund respects paid amount and writes ledger', async () => {
  const actor = await createActor({});
  const { default: Patient } = await import('../src/models/Patient.model.js');
  const patient = await Patient.create({ uhid: 'UHID-2026-999999', firstName: 'Ref', lastName: 'Und', gender: 'MALE', mobile: '9811100005' });
  const { createBillingService, createRefundService } = await import('../src/services/billing.service.js');

  const bill = await createBillingService({
    patientId: patient._id, billType: 'OPD',
    items: [{ itemType: 'SERVICE', name: 'Consult', quantity: 1, rate: 500, total: 500 }],
    payment: { amount: 500, mode: 'CASH' },
  }, actor);

  const { default: Payment } = await import('../src/models/Payment.model.js');
  const payment = await Payment.findOne({ billId: bill._id });
  assert.ok(payment, 'bill payment created');

  await assert.rejects(() => createRefundService({ billId: bill._id, amount: 800, reason: 'over refund' }, actor), /paid amount/i);
  await assert.rejects(() => createRefundService({ billId: bill._id, amount: 100, reason: 'no payment link' }, actor), /paymentId is required/i);

  const refund = await createRefundService({ billId: bill._id, paymentId: payment._id, amount: 200, reason: 'cancel service' }, actor);
  assert.ok(refund.refundNumber.startsWith('RF-'), `refund number format: ${refund.refundNumber}`);
  assert.equal(String(refund.paymentId), String(payment._id), 'refund stays linked to the original payment');
  const { default: Bill } = await import('../src/models/Bill.model.js');
  const after = await Bill.findById(bill._id);
  assert.equal(after.paidAmount, 300);
  assert.equal(after.dueAmount, 200);
  assert.equal(after.status, 'PARTIALLY_PAID');
});

test('IPD: admit assigns bed transactionally, discharge releases it', async () => {
  const actor = await createActor({});
  const { default: Patient } = await import('../src/models/Patient.model.js');
  const patient = await Patient.create({ uhid: 'UHID-2026-888888', firstName: 'In', lastName: 'Patient', gender: 'MALE', mobile: '9811100006' });
  const { Ward, Bed, BED_STATUS } = await import('../src/models/Bed.model.js');
  const ward = await Ward.create({ name: 'W1', code: 'W1', bedCount: 2, chargePerDay: 1000 });
  const bed = await Bed.create({ bedNumber: 'W1-1', code: 'W1-1', wardId: ward._id, status: 'AVAILABLE' });

  const { default: Department } = await import('../src/models/Department.model.js');
  const { default: Doctor } = await import('../src/models/Doctor.model.js');
  const dept = await Department.create({ name: 'General Medicine IPD' });
  const consultant = await Doctor.create({ name: 'Dr IPD Test', departmentId: dept._id, consultationFee: 300 });

  const { admitPatient, dischargePatient, transferBed } = await import('../src/services/ipd.service.js');
  await assert.rejects(() => admitPatient({ patientId: patient._id, bedId: bed._id }, actor), /Consultant doctor is required/i);
  const admission = await admitPatient({ patientId: patient._id, bedId: bed._id, consultantDoctorId: consultant._id }, actor);
  assert.ok(admission.admissionNumber.startsWith('ADM-'), `admission number format: ${admission.admissionNumber}`);
  assert.equal(admission.ipNumber, admission.admissionNumber, 'IP number mirrors the admission number');

  const occupied = await Bed.findById(bed._id);
  assert.equal(occupied.status, BED_STATUS.OCCUPIED);

  const bed2 = await Bed.create({ bedNumber: 'W1-2', code: 'W1-2', wardId: ward._id, status: 'AVAILABLE' });
  await transferBed(admission._id, bed2._id, actor);

  // one patient cannot hold two active admissions, even on a free bed
  await assert.rejects(
    () => admitPatient({ patientId: patient._id, bedId: bed2._id, consultantDoctorId: consultant._id }, actor),
    /already has active admission/i,
  );

  // and a bed that is already occupied is never handed to a second patient
  const patient2 = await Patient.create({ uhid: 'UHID-2026-888889', firstName: 'Second', lastName: 'Patient', gender: 'FEMALE', mobile: '9811100007' });
  await assert.rejects(
    () => admitPatient({ patientId: patient2._id, bedId: bed2._id, consultantDoctorId: consultant._id }, actor),
    /not available/i,
    'double assignment blocked',
  );

  await dischargePatient(admission._id, { skipClearance: true, notes: 'discharged', summary: { finalDiagnosis: 'Recovered', treatmentGiven: 'Rest' } }, actor);
  const released = await Bed.findById(bed2._id);
  assert.equal(released.status, BED_STATUS.CLEANING, 'bed moves to cleaning after discharge');
});

test('RBAC: permission load respected by role definitions', async () => {
  const { default: Role } = await import('../src/models/Role.model.js');
  const pharmacist = await Role.findOne({ name: 'PHARMACIST' });
  assert.ok(pharmacist.permissions.includes('PHARMACY_SALE'));
  assert.ok(!pharmacist.permissions.includes('USER_CREATE'));
  const doctor = await Role.findOne({ name: 'DOCTOR' });
  assert.ok(doctor.permissions.includes('PRESCRIPTION_CREATE'));
  assert.ok(!doctor.permissions.includes('BILLING_REFUND'));
});