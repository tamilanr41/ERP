import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

let mongod;

before(async () => {
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGO_URI = mongod.getUri('hospital_erp_test');

  const { readdir } = await import('node:fs/promises');
  const path = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const modelsDir = path.resolve(import.meta.dirname, '../src/models');
  for (const file of (await readdir(modelsDir)).filter((f) => f.endsWith('.js'))) {
    await import(pathToFileURL(path.join(modelsDir, file)).href);
  }

  const { connectDB, ensureCollections } = await import('../src/config/db.js');
  await connectDB();
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
    for (const c of await mongoose.connection.db.collections()) await c.deleteMany({});
  }
});

const actor = (overrides = {}) => ({
  id: new mongoose.Types.ObjectId(),
  hospitalId: new mongoose.Types.ObjectId(),
  branchId: new mongoose.Types.ObjectId(),
  role: 'DOCTOR',
  permissions: ['*'],
  ...overrides,
});

let seq = 0;
const makePatient = () => {
  seq += 1;
  return {
    uhid: `OPD${Date.now()}${seq}`,
    firstName: 'Anita',
    lastName: 'Sharma',
    gender: 'FEMALE',
    mobile: `98${String(700000000 + seq).slice(-8)}`,
  };
};

let docSeq = 0;
const makeDoctor = (overrides = {}) => {
  docSeq += 1;
  return {
    // doctorCode is uniquely indexed, so leaving it null makes the second
    // Doctor.create in a test collide.
    doctorCode: `DR-T${docSeq}`,
    name: `Dr. Test ${docSeq}`,
    specialization: 'GENERAL_MEDICINE',
    status: 'ACTIVE',
    ...overrides,
  };
};

/** Register a patient into the OPD queue for a doctor and return the visit. */
const register = async (svc, { patient, doctorId, ...rest } = {}) => {
  const Patient = (await import('../src/models/Patient.model.js')).default;
  const p = patient || (await Patient.create(makePatient()));
  return svc.createOpdVisit({ patientId: p._id, doctorId, ...rest }, actor());
};

/* ---------------------------------------------------------------------------
 * Queue tokens
 * ------------------------------------------------------------------------- */
test('opd: registration issues a queue token and the visit starts as WAITING', async () => {
  const svc = await import('../src/services/opd.service.js');
  const Doctor = (await import('../src/models/Doctor.model.js')).default;
  const doctor = await Doctor.create(makeDoctor());

  const visit = await register(svc, { doctorId: doctor._id });

  assert.equal(visit.status, 'WAITING');
  assert.equal(visit.tokenSeq, 1, 'first patient of the day gets token 1');
  assert.equal(visit.queueToken, 'T-001');
  assert.ok(visit.checkedInAt, 'check-in time is recorded for wait-time maths');
  assert.equal(visit.statusHistory[0].to, 'WAITING', 'the opening state is audited');
});

test('opd: each doctor has an independent queue', async () => {
  const svc = await import('../src/services/opd.service.js');
  const Doctor = (await import('../src/models/Doctor.model.js')).default;
  const drA = await Doctor.create(makeDoctor({ name: 'Dr. A' }));
  const drB = await Doctor.create(makeDoctor({ name: 'Dr. B' }));

  const first = await register(svc, { doctorId: drA._id });
  await register(svc, { doctorId: drA._id });
  const otherDoctorsFirst = await register(svc, { doctorId: drB._id });

  assert.equal(first.tokenSeq, 1);
  assert.equal(otherDoctorsFirst.tokenSeq, 1, 'Dr. B starts at 1, not 3');
});

test('opd: concurrent registrations never hand out the same token', async () => {
  const svc = await import('../src/services/opd.service.js');
  const Doctor = (await import('../src/models/Doctor.model.js')).default;
  const Patient = (await import('../src/models/Patient.model.js')).default;
  const doctor = await Doctor.create(makeDoctor());

  const patients = await Promise.all([1, 2, 3, 4, 5].map(() => Patient.create(makePatient())));
  const visits = await Promise.all(
    patients.map((p) => svc.createOpdVisit({ patientId: p._id, doctorId: doctor._id }, actor())),
  );

  const tokens = visits.map((v) => v.tokenSeq).sort((a, b) => a - b);
  // Read-max-then-insert would produce collisions here; a counter with $inc cannot.
  assert.deepEqual(tokens, [1, 2, 3, 4, 5]);
  assert.equal(new Set(visits.map((v) => v.queueToken)).size, 5, 'no two patients share a number');
});

test('opd: the same patient cannot hold two unfinished visits in one day', async () => {
  const svc = await import('../src/services/opd.service.js');
  const Doctor = (await import('../src/models/Doctor.model.js')).default;
  const Patient = (await import('../src/models/Patient.model.js')).default;
  const doctor = await Doctor.create(makeDoctor());
  const patient = await Patient.create(makePatient());

  await register(svc, { patient, doctorId: doctor._id });
  await assert.rejects(
    register(svc, { patient, doctorId: doctor._id }),
    /already has an unfinished OPD visit/i,
  );
});

test('opd: a cancelled visit frees the patient to re-register the same day', async () => {
  const svc = await import('../src/services/opd.service.js');
  const Doctor = (await import('../src/models/Doctor.model.js')).default;
  const Patient = (await import('../src/models/Patient.model.js')).default;
  const doctor = await Doctor.create(makeDoctor());
  const patient = await Patient.create(makePatient());

  const first = await register(svc, { patient, doctorId: doctor._id });
  await svc.cancelVisitService(first._id, actor(), 'Patient left before being called');

  const again = await register(svc, { patient, doctorId: doctor._id });
  assert.notEqual(String(again._id), String(first._id), 'a new visit, not the cancelled one resurrected');
  assert.notEqual(again.opdNumber, first.opdNumber, 'a fresh visit number is issued');
  assert.equal(again.tokenSeq, 2, 'the new registration takes the next token');
});

/* ---------------------------------------------------------------------------
 * State machine
 * ------------------------------------------------------------------------- */
test('opd: the queue moves forward and every step is audited', async () => {
  const svc = await import('../src/services/opd.service.js');
  const Doctor = (await import('../src/models/Doctor.model.js')).default;
  const doctor = await Doctor.create(makeDoctor());
  const visit = await register(svc, { doctorId: doctor._id });
  const who = actor();

  const called = await svc.callVisitService(visit._id, who);
  assert.equal(called.status, 'CALLED');
  assert.ok(called.calledAt, 'the call time is stamped');

  const inRoom = await svc.startConsultationService(visit._id, who);
  assert.equal(inRoom.status, 'IN_CONSULTATION');
  assert.ok(inRoom.consultStartedAt);

  const closed = await svc.closeVisitService(visit._id, { closeNotes: 'Viral fever' }, who);
  assert.equal(closed.status, 'COMPLETED');
  assert.ok(closed.consultEndedAt);
  assert.equal(closed.closeNotes, 'Viral fever');

  const steps = closed.statusHistory.map((h) => h.to);
  assert.deepEqual(steps, ['WAITING', 'CALLED', 'IN_CONSULTATION', 'COMPLETED']);
  assert.ok(closed.statusHistory.every((h) => h.actorId), 'each step records who did it');
});

test('opd: a closed visit cannot be reopened or completed twice', async () => {
  const svc = await import('../src/services/opd.service.js');
  const Doctor = (await import('../src/models/Doctor.model.js')).default;
  const doctor = await Doctor.create(makeDoctor());
  const visit = await register(svc, { doctorId: doctor._id });
  await svc.callVisitService(visit._id, actor());
  await svc.startConsultationService(visit._id, actor());
  await svc.closeVisitService(visit._id, {}, actor());

  await assert.rejects(svc.startConsultationService(visit._id, actor()), /already closed|Cannot move/i);
  await assert.rejects(svc.closeVisitService(visit._id, {}, actor()), /already COMPLETED|Cannot move/i);
});

test('opd: a visit cannot be admitted straight from the waiting room', async () => {
  const svc = await import('../src/services/opd.service.js');
  const Doctor = (await import('../src/models/Doctor.model.js')).default;
  const doctor = await Doctor.create(makeDoctor());
  const visit = await register(svc, { doctorId: doctor._id });

  await assert.rejects(
    svc.admitVisitService(visit._id, { ward: 'A' }, actor()),
    /Cannot move a visit from WAITING to ADMITTED/,
  );
});

test('opd: a referral must name a destination', async () => {
  const svc = await import('../src/services/opd.service.js');
  const Doctor = (await import('../src/models/Doctor.model.js')).default;
  const doctor = await Doctor.create(makeDoctor());
  const visit = await register(svc, { doctorId: doctor._id });
  await svc.callVisitService(visit._id, actor());
  await svc.startConsultationService(visit._id, actor());

  await assert.rejects(svc.referVisitService(visit._id, { reason: 'wants a scan' }, actor()), /destination/i);
});

test('opd: an admission must say where the patient is going', async () => {
  const svc = await import('../src/services/opd.service.js');
  const Doctor = (await import('../src/models/Doctor.model.js')).default;
  const doctor = await Doctor.create(makeDoctor());
  const visit = await register(svc, { doctorId: doctor._id });
  await svc.callVisitService(visit._id, actor());
  await svc.startConsultationService(visit._id, actor());

  // An admission with nowhere to put the patient is a lost handoff, so a bare
  // request has to be refused rather than quietly recorded.
  await assert.rejects(svc.admitVisitService(visit._id, { reason: 'fracture' }, actor()), /ward or bed/i);

  const admitted = await svc.admitVisitService(visit._id, { ward: 'A-1' }, actor());
  assert.equal(admitted.status, 'ADMITTED');
  assert.equal(admitted.admission.ward, 'A-1');
});

test('opd: a rejected transition does not leave the referral or admission behind', async () => {
  const svc = await import('../src/services/opd.service.js');
  const Doctor = (await import('../src/models/Doctor.model.js')).default;
  const OpdVisit = (await import('../src/models/OpdVisit.model.js')).default;
  const doctor = await Doctor.create(makeDoctor());
  const visit = await register(svc, { doctorId: doctor._id });

  // WAITING cannot become REFERRED or ADMITTED. The destination check passes,
  // so only the state machine can stop it - and nothing may be persisted.
  await assert.rejects(
    svc.referVisitService(visit._id, { toDepartment: 'Cardiology' }, actor()),
    /Cannot move a visit from WAITING to REFERRED/,
  );
  await assert.rejects(
    svc.admitVisitService(visit._id, { ward: 'A-1' }, actor()),
    /Cannot move a visit from WAITING to ADMITTED/,
  );

  const reread = await OpdVisit.findById(visit._id).lean();
  assert.equal(reread.status, 'WAITING', 'status must be unchanged');
  assert.ok(!reread.referral, 'no referral may be recorded on a visit that was not referred');
  assert.ok(!reread.admission, 'no admission may be recorded on a visit that was not admitted');
});

test('opd: a queue token is never handed out twice', async () => {
  const svc = await import('../src/services/opd.service.js');
  const OpdVisit = (await import('../src/models/OpdVisit.model.js')).default;
  const Counter = (await import('../src/models/Counter.model.js')).default;
  const Doctor = (await import('../src/models/Doctor.model.js')).default;
  const doctor = await Doctor.create(makeDoctor());

  const seen = [];
  for (let i = 0; i < 4; i += 1) {
    const v = await register(svc, { doctorId: doctor._id });
    seen.push(v.tokenSeq);
  }

  assert.deepEqual(seen, [...new Set(seen)], 'every token must be distinct');
  assert.deepEqual(seen, [...seen].sort((a, b) => a - b), 'tokens must climb');

  // The sequence is driven by a counter row, so re-reading the stored rows has
  // to give the same answer as the labels the patients were given.
  const stored = await OpdVisit.find({ doctorId: doctor._id }).distinct('tokenSeq');
  assert.equal(stored.length, new Set(seen).size, 'no two visits may share a token');

  const key = `OPD_QUEUE_${doctor._id}_${svc.dayKey()}`;
  const counter = await Counter.findOne({ key });
  assert.ok(counter.seq >= Math.max(...seen), 'the counter must never lag behind issued tokens');
});

/* ---------------------------------------------------------------------------
 * Calling
 * ------------------------------------------------------------------------- */
test('opd: call-next serves patients in token order, not registration recency', async () => {
  const svc = await import('../src/services/opd.service.js');
  const Doctor = (await import('../src/models/Doctor.model.js')).default;
  const doctor = await Doctor.create(makeDoctor());

  const v1 = await register(svc, { doctorId: doctor._id, chiefComplaint: 'first' });
  const v2 = await register(svc, { doctorId: doctor._id, chiefComplaint: 'second' });
  const v3 = await register(svc, { doctorId: doctor._id, chiefComplaint: 'third' });

  assert.equal(String((await svc.callNextPatientService(doctor._id, actor()))._id), String(v1._id));
  assert.equal(String((await svc.callNextPatientService(doctor._id, actor()))._id), String(v2._id));
  assert.equal(String((await svc.callNextPatientService(doctor._id, actor()))._id), String(v3._id));
});

test('opd: call-next on an empty queue is a no-op, not an error', async () => {
  const svc = await import('../src/services/opd.service.js');
  const Doctor = (await import('../src/models/Doctor.model.js')).default;
  const doctor = await Doctor.create(makeDoctor());

  assert.equal(await svc.callNextPatientService(doctor._id, actor()), null);
});

test('opd: call-next does not re-serve a patient who is already in the room', async () => {
  const svc = await import('../src/services/opd.service.js');
  const Doctor = (await import('../src/models/Doctor.model.js')).default;
  const doctor = await Doctor.create(makeDoctor());

  const v1 = await register(svc, { doctorId: doctor._id });
  await register(svc, { doctorId: doctor._id });
  await svc.callNextPatientService(doctor._id, actor());
  await svc.startConsultationService(v1._id, actor());

  const second = await svc.callNextPatientService(doctor._id, actor());
  assert.notEqual(String(second._id), String(v1._id), 'the in-consultation patient is skipped');
});

test('opd: call-next needs a doctor', async () => {
  const svc = await import('../src/services/opd.service.js');
  await assert.rejects(svc.callNextPatientService(null, actor()), /doctor must be selected/i);
});

/* ---------------------------------------------------------------------------
 * Queue board
 * ------------------------------------------------------------------------- */
test('opd: the queue board separates waiting, called and in-consultation', async () => {
  const svc = await import('../src/services/opd.service.js');
  const Doctor = (await import('../src/models/Doctor.model.js')).default;
  const doctor = await Doctor.create(makeDoctor());

  const a = await register(svc, { doctorId: doctor._id });
  const b = await register(svc, { doctorId: doctor._id });
  const c = await register(svc, { doctorId: doctor._id });
  await svc.callVisitService(a._id, actor());
  await svc.startConsultationService(a._id, actor());
  await svc.callVisitService(b._id, actor());

  const board = await svc.getQueueBoardService({ doctorId: doctor._id });
  assert.equal(board.counts.waiting, 1);
  assert.equal(board.counts.called, 1);
  assert.equal(board.counts.inConsultation, 1);
  assert.deepEqual(board.queue.map((r) => String(r._id)).sort(), [String(a._id), String(b._id), String(c._id)].sort());
  assert.ok(board.queue.every((r) => r.patient?.uhid), 'the board carries enough to call the patient');
  assert.equal(String(board.queue.find((r) => String(r._id) === String(c._id))._id), String(c._id));
});

test('opd: the queue board leaves out closed and no-show patients', async () => {
  const svc = await import('../src/services/opd.service.js');
  const Doctor = (await import('../src/models/Doctor.model.js')).default;
  const doctor = await Doctor.create(makeDoctor());

  const gone = await register(svc, { doctorId: doctor._id });
  const still = await register(svc, { doctorId: doctor._id });
  await svc.cancelVisitService(gone._id, actor(), 'Left the hospital');

  const board = await svc.getQueueBoardService({ doctorId: doctor._id });
  assert.equal(board.queue.length, 1);
  assert.equal(String(board.queue[0]._id), String(still._id));
});

/* ---------------------------------------------------------------------------
 * Data integrity
 * ------------------------------------------------------------------------- */
test('opd: the clinical save cannot move a visit to a different patient', async () => {
  const svc = await import('../src/services/opd.service.js');
  const Doctor = (await import('../src/models/Doctor.model.js')).default;
  const Patient = (await import('../src/models/Patient.model.js')).default;
  const doctor = await Doctor.create(makeDoctor());
  const visit = await register(svc, { doctorId: doctor._id });
  const impostor = await Patient.create(makePatient());

  await svc.completeOpdVisit(visit._id, {
    patientId: impostor._id,
    opdNumber: 'OP-HACKED-001',
    tokenSeq: 999,
    chiefComplaint: 'Throat pain since Monday',
  }, actor());

  const saved = await svc.getOpdVisit(visit._id);
  assert.equal(String(saved.patientId._id), String(visit.patientId), 'the patient cannot be swapped');
  assert.equal(saved.opdNumber, visit.opdNumber, 'the visit number cannot be rewritten');
  assert.notEqual(saved.tokenSeq, 999, 'the queue position cannot be forged');
  assert.equal(saved.chiefComplaint, 'Throat pain since Monday', 'the legitimate note still saves');
});

test('opd: the clinical save cannot reopen a completed visit', async () => {
  const svc = await import('../src/services/opd.service.js');
  const Doctor = (await import('../src/models/Doctor.model.js')).default;
  const doctor = await Doctor.create(makeDoctor());
  const visit = await register(svc, { doctorId: doctor._id });
  await svc.callVisitService(visit._id, actor());
  await svc.startConsultationService(visit._id, actor());
  await svc.closeVisitService(visit._id, {}, actor());

  await assert.rejects(
    svc.completeOpdVisit(visit._id, { advice: 'edited after the fact' }, actor()),
    /already completed/i,
  );
});

test('opd: a visit cannot be registered against another patient\'s appointment', async () => {
  const svc = await import('../src/services/opd.service.js');
  const Appointment = (await import('../src/models/Appointment.model.js')).default;
  const Patient = (await import('../src/models/Patient.model.js')).default;
  const Patient2 = (await import('../src/models/Patient.model.js')).default;

  const booked = await Patient.create(makePatient());
  const other = await Patient2.create(makePatient());
  const appointment = await Appointment.create({
    patientId: booked._id,
    doctorId: new mongoose.Types.ObjectId(),
    date: new Date(),
    startTime: '10:00',
    status: 'CONFIRMED',
  });

  await assert.rejects(
    svc.createOpdVisit({ patientId: other._id, appointmentId: appointment._id }, actor()),
    /different patient/i,
  );
});

test('opd: the status enum and its legal moves agree with each other', async () => {
  const { OPD_VISIT_STATUS, OPD_VISIT_TRANSITIONS, canTransitionOpdVisit } =
    await import('../src/models/OpdVisit.model.js');

  for (const [from, targets] of Object.entries(OPD_VISIT_TRANSITIONS)) {
    assert.ok(OPD_VISIT_STATUS[from], `${from} must be a real status`);
    for (const to of targets) {
      assert.ok(OPD_VISIT_STATUS[to], `${from} -> ${to} must point at a real status`);
      assert.equal(canTransitionOpdVisit(from, to), true);
    }
  }
  assert.equal(canTransitionOpdVisit('COMPLETED', 'IN_CONSULTATION'), false, 'a closed visit stays closed');
  assert.equal(canTransitionOpdVisit('WAITING', 'COMPLETED'), false, 'a visit cannot skip the consultation');
  assert.equal(canTransitionOpdVisit('CANCELLED', 'WAITING'), false);
});

test('opd: queue permissions exist and are not implied by OPD_EDIT', async () => {
  const svc = await import('../src/services/auth.service.js');
  await svc.bootstrapRoles();
  const Role = (await import('../src/models/Role.model.js')).default;
  const Permission = (await import('../src/models/Permission.model.js')).default;

  const perm = await Permission.findOne({ code: 'OPD_QUEUE' });
  assert.ok(perm, 'the queue grant is seeded');

  const receptionist = await Role.findOne({ name: 'RECEPTIONIST' });
  const doctor = await Role.findOne({ name: 'DOCTOR' });
  assert.ok(receptionist.permissions.includes('OPD_QUEUE'), 'the front desk runs the waiting room');
  assert.ok(receptionist.permissions.includes('OPD_VIEW'));
  assert.ok(
    !receptionist.permissions.includes('OPD_EDIT'),
    'running the queue must not grant writing clinical notes or prescriptions',
  );
  assert.ok(doctor.permissions.includes('OPD_QUEUE'), 'a doctor can call their own patient in');
});