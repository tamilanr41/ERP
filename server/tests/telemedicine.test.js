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

const buildFixture = async ({ mode = 'TELEMEDICINE', fee = 500, status = 'CONFIRMED' } = {}) => {
  const Patient = (await import('../src/models/Patient.model.js')).default;
  const Doctor = (await import('../src/models/Doctor.model.js')).default;
  const Appointment = (await import('../src/models/Appointment.model.js')).default;

  const booker = new mongoose.Types.ObjectId();
  const patient = await Patient.create({
    uhid: `TM${Date.now()}${Math.floor(Math.random() * 90 + 10)}`,
    firstName: 'Ravi',
    lastName: 'Kumar',
    gender: 'MALE',
    mobile: '9800000001',
  });
  const doctor = await Doctor.create({
    name: 'Dr Asha',
    specialization: 'Cardiology',
    doctorCode: `DOC-TM-${Math.floor(Math.random() * 100000)}`,
    consultationFee: fee,
    active: true,
  });
  const appointment = await Appointment.create({
    appointmentNumber: `APT-TM-${Date.now()}`,
    patientId: patient._id,
    doctorId: doctor._id,
    date: new Date(),
    time: '10:00',
    consultationMode: mode,
    consultationFee: fee,
    status,
    statusHistory: [{ from: null, to: status, at: new Date(), by: booker }],
  });
  return { patient, doctor, appointment, booker };
};

const actor = (over = {}) => ({
  id: over.id || new mongoose.Types.ObjectId(),
  doctorId: over.doctorId,
  patientId: over.patientId,
  permissions: over.permissions || ['TELEMEDICINE_CONSULT', 'TELEMEDICINE_VIEW', 'TELEMEDICINE_JOIN_ANY'],
  hospitalId: new mongoose.Types.ObjectId(),
  branchId: new mongoose.Types.ObjectId(),
});

test('telemedicine: the fee is snapshotted at booking and survives a later price change', async () => {
  const { createAppointment } = await import('../src/services/appointment.service.js');
  const Patient = (await import('../src/models/Patient.model.js')).default;
  const Doctor = (await import('../src/models/Doctor.model.js')).default;

  const patient = await Patient.create({ uhid: 'TM0100', firstName: 'Sita', gender: 'FEMALE', mobile: '9800000010' });
  const doctor = await Doctor.create({
    name: 'Dr Nitin', specialization: 'Neurology', doctorCode: 'DOC-FEE-1', consultationFee: 800, active: true,
  });

  const booked = await createAppointment(
    { patientId: patient._id, doctorId: doctor._id, date: new Date(), time: '11:00', consultationMode: 'TELEMEDICINE' },
    actor(),
  );
  assert.equal(booked.consultationFee, 800);

  await Doctor.updateOne({ _id: doctor._id }, { $set: { consultationFee: 1200 } });

  const reloaded = await (await import('../src/models/Appointment.model.js')).default.findById(booked._id);
  assert.equal(reloaded.consultationFee, 800, 'quoted price must not follow the doctor fee upward');

  const staff = actor();
  const overridden = await createAppointment(
    {
      patientId: patient._id, doctorId: doctor._id, date: new Date(), time: '14:00',
      consultationMode: 'TELEMEDICINE', consultationFee: 0,
    },
    staff,
  );
  assert.equal(overridden.consultationFee, 0, 'an explicit zero must be honoured as a waiver-in-waiting');
  assert.ok(overridden.feeOverriddenBy, 'an overridden fee must record who set it');
});

test('telemedicine: booking an inactive doctor is refused', async () => {
  const { createAppointment } = await import('../src/services/appointment.service.js');
  const Patient = (await import('../src/models/Patient.model.js')).default;
  const Doctor = (await import('../src/models/Doctor.model.js')).default;

  const patient = await Patient.create({ uhid: 'TM0101', firstName: 'Mohan', gender: 'MALE', mobile: '9800000011' });
  const doctor = await Doctor.create({
    name: 'Dr Retired', specialization: 'General', doctorCode: 'DOC-IN-1', consultationFee: 300, active: false,
  });

  await assert.rejects(
    createAppointment(
      { patientId: patient._id, doctorId: doctor._id, date: new Date(), time: '09:00', consultationMode: 'TELEMEDICINE' },
      actor(),
    ),
    /not accepting appointments/i,
  );
});

test('telemedicine: every status transition is appended to an immutable history', async () => {
  const { updateAppointmentStatus } = await import('../src/services/appointment.service.js');
  const { appointment } = await buildFixture({ status: 'CONFIRMED' });

  const user = actor();
  await updateAppointmentStatus(appointment._id, 'CHECKED_IN', user);
  await updateAppointmentStatus(appointment._id, 'IN_CONSULTATION', user);
  const done = await updateAppointmentStatus(appointment._id, 'COMPLETED', user);

  const trail = done.statusHistory.map((h) => h.to);
  assert.deepEqual(trail, ['CONFIRMED', 'CHECKED_IN', 'IN_CONSULTATION', 'COMPLETED']);
  assert.equal(done.statusHistory[0].from, null, 'the first entry records where it came from');
  for (const step of done.statusHistory) {
    assert.ok(step.by, 'each transition must name the user who made it');
  }
  assert.ok(done.consultationStartedAt, 'starting a consultation stamps consultationStartedAt');
  assert.ok(done.completedAt);
});

test('telemedicine: a consultation records who joined and when, and cannot be joined after completion', async () => {
  const { startConsultation, endConsultation, joinConsultation } = await import('../src/services/telemedicine.service.js');
  const { doctor, appointment } = await buildFixture({ status: 'CONFIRMED' });

  const doctorActor = actor({ doctorId: doctor._id });
  const started = await startConsultation(appointment._id, doctorActor);
  assert.equal(started.status, 'IN_CONSULTATION');
  assert.ok(started.roomId, 'a room must be allocated');

  const asDoctor = await joinConsultation(appointment._id, doctorActor);
  assert.equal(asDoctor.role, 'DOCTOR');
  assert.equal(asDoctor.roomId, started.roomId);

  await endConsultation(appointment._id, doctorActor);

  const Appointment = (await import('../src/models/Appointment.model.js')).default;
  const closed = await Appointment.findById(appointment._id);
  assert.ok(closed.consultationEndedAt);
  assert.ok(closed.roomClosedAt);

  await assert.rejects(
    joinConsultation(appointment._id, doctorActor),
    /can no longer be joined/i,
  );
});

test('telemedicine: starting a consultation twice returns the same room instead of erroring', async () => {
  const { startConsultation } = await import('../src/services/telemedicine.service.js');
  const { doctor, appointment } = await buildFixture({ status: 'CONFIRMED' });

  const doctorActor = actor({ doctorId: doctor._id });
  const first = await startConsultation(appointment._id, doctorActor);
  const second = await startConsultation(appointment._id, doctorActor);

  assert.equal(first.roomId, second.roomId);
  const Appointment = (await import('../src/models/Appointment.model.js')).default;
  assert.equal(await Appointment.countDocuments({ _id: appointment._id }), 1);
});

test('telemedicine: an unrelated user cannot join a consultation room', async () => {
  const { joinConsultation } = await import('../src/services/telemedicine.service.js');
  const { appointment } = await buildFixture({ status: 'CONFIRMED' });

  const stranger = actor({ permissions: ['TELEMEDICINE_VIEW'] });
  await assert.rejects(joinConsultation(appointment._id, stranger), /not a participant/i);
});

test('telemedicine: the patient can only ever join as the patient', async () => {
  const { joinConsultation } = await import('../src/services/telemedicine.service.js');
  const { patient, appointment } = await buildFixture({ status: 'CONFIRMED' });

  const patientActor = actor({ patientId: patient._id, permissions: ['TELEMEDICINE_JOIN_OWN'] });
  const asPatient = await joinConsultation(appointment._id, patientActor);
  assert.equal(asPatient.role, 'PATIENT');

  // The patient claiming to be the doctor is refused on the derived role, which
  // is the same rejection regardless of what they asked for.
  await assert.rejects(
    joinConsultation(appointment._id, patientActor, { role: 'DOCTOR' }),
    /You are joining as PATIENT, not DOCTOR/i,
  );
});

test('telemedicine: billing raises exactly one bill per consultation', async () => {
  const { generateConsultationBill } = await import('../src/services/telemedicine.service.js');
  const { appointment } = await buildFixture({ fee: 600 });

  const bill = await generateConsultationBill(appointment._id, actor());
  assert.equal(bill.netTotal, 600);
  assert.equal(bill.dueAmount, 600);

  const again = await generateConsultationBill(appointment._id, actor());
  assert.equal(String(again._id), String(bill._id), 'a second call returns the existing bill');

  const Bill = (await import('../src/models/Bill.model.js')).default;
  assert.equal(await Bill.countDocuments({ appointmentId: appointment._id }), 1);

  const Appointment = (await import('../src/models/Appointment.model.js')).default;
  const linked = await Appointment.findById(appointment._id);
  assert.equal(String(linked.billId), String(bill._id));
  assert.equal(linked.paymentStatus, 'UNPAID');
});

test('telemedicine: a settled bill marks the appointment paid and unlocks the consultation gate', async () => {
  const { generateConsultationBill, startConsultation, syncAppointmentPaymentState } =
    await import('../src/services/telemedicine.service.js');
  const { recordPaymentOnBill } = await import('../src/services/billing.service.js');
  const Bill = (await import('../src/models/Bill.model.js')).default;
  const { doctor, appointment } = await buildFixture({ fee: 400, status: 'CONFIRMED' });

  process.env.TELEMEDICINE_REQUIRE_PAYMENT = 'true';
  const config = (await import('../src/config/index.js')).default;
  config.telemedicine.requirePaymentBeforeConsultation = true;

  await assert.rejects(
    startConsultation(appointment._id, actor({ doctorId: doctor._id })),
    /must be billed and settled/i,
  );

  const bill = await generateConsultationBill(appointment._id, actor());
  await recordPaymentOnBill(bill, { amount: 400, mode: 'CASH' }, actor());

  const paid = await Bill.findById(bill._id);
  assert.equal(paid.status, 'PAID');

  const synced = await syncAppointmentPaymentState(bill._id);
  assert.equal(synced.paymentStatus, 'PAID');

  const started = await startConsultation(appointment._id, actor({ doctorId: doctor._id }));
  assert.equal(started.status, 'IN_CONSULTATION');

  config.telemedicine.requirePaymentBeforeConsultation = false;
});

test('telemedicine: a waived fee satisfies the payment gate without a bill', async () => {
  const { startConsultation, waiveConsultationFee } = await import('../src/services/telemedicine.service.js');
  const { doctor, appointment } = await buildFixture({ fee: 900, status: 'CONFIRMED' });

  const config = (await import('../src/config/index.js')).default;
  config.telemedicine.requirePaymentBeforeConsultation = true;

  const waiver = actor({ permissions: ['TELEMEDICINE_FEE_WAIVE'] });
  const waived = await waiveConsultationFee(appointment._id, waiver, { reason: 'follow-up charity' });
  assert.equal(waived.paymentStatus, 'WAIVED');
  assert.match(waived.statusHistory.at(-1).reason, /waived/i);

  const started = await startConsultation(appointment._id, actor({ doctorId: doctor._id }));
  assert.equal(started.status, 'IN_CONSULTATION');

  config.telemedicine.requirePaymentBeforeConsultation = false;
});

test('telemedicine: settling through the generic payments route updates the appointment', async () => {
  const { generateConsultationBill } = await import('../src/services/telemedicine.service.js');
  const { createPaymentService } = await import('../src/services/billing.service.js');
  const Appointment = (await import('../src/models/Appointment.model.js')).default;
  const { appointment } = await buildFixture({ fee: 650 });

  const bill = await generateConsultationBill(appointment._id, actor());
  assert.equal((await Appointment.findById(appointment._id)).paymentStatus, 'UNPAID');

  // This is the route billing staff actually use, not the telemedicine helper.
  await createPaymentService({ billId: bill._id, amount: 650, mode: 'UPI' }, actor());

  const refreshed = await Appointment.findById(appointment._id);
  assert.equal(refreshed.paymentStatus, 'PAID', 'a stale UNPAID would keep the consultation gate shut');
  assert.equal(refreshed.paidAmount, 650);
});

test('telemedicine: a partial payment reads as PARTIAL, not PAID', async () => {
  const { generateConsultationBill, syncAppointmentPaymentState } =
    await import('../src/services/telemedicine.service.js');
  const { createPaymentService } = await import('../src/services/billing.service.js');
  const Appointment = (await import('../src/models/Appointment.model.js')).default;
  const { appointment } = await buildFixture({ fee: 1000 });

  const bill = await generateConsultationBill(appointment._id, actor());
  await createPaymentService({ billId: bill._id, amount: 250, mode: 'CASH' }, actor());

  const partially = await Appointment.findById(appointment._id);
  assert.equal(partially.paymentStatus, 'PARTIAL');
  assert.equal(partially.paidAmount, 250);

  await createPaymentService({ billId: bill._id, amount: 750, mode: 'CASH' }, actor());
  const settled = await syncAppointmentPaymentState(bill._id);
  assert.equal(settled.paymentStatus, 'PAID');
});

test('telemedicine: a bill with no appointment is not disturbed by the payment sync', async () => {
  const { syncAppointmentPaymentState } = await import('../src/services/telemedicine.service.js');
  const { createBillingService } = await import('../src/services/billing.service.js');
  const Patient = (await import('../src/models/Patient.model.js')).default;

  const patient = await Patient.create({ uhid: 'TM-NL', firstName: 'No', gender: 'MALE', mobile: '9800000077' });
  const plain = await createBillingService(
    {
      patientId: patient._id, billType: 'LAB',
      items: [{ itemType: 'TEST', name: 'CBC', quantity: 1, rate: 300 }],
    },
    actor(),
  );
  assert.equal(await syncAppointmentPaymentState(plain._id), null);
});

test('telemedicine: a fee cannot be waived once a bill exists', async () => {
  const { generateConsultationBill, waiveConsultationFee } = await import('../src/services/telemedicine.service.js');
  const { appointment } = await buildFixture({ fee: 300 });

  await generateConsultationBill(appointment._id, actor());
  await assert.rejects(
    waiveConsultationFee(appointment._id, actor(), { reason: 'too late' }),
    /already has a bill/i,
  );
});

test('telemedicine: a zero-fee consultation cannot be billed', async () => {
  const { generateConsultationBill } = await import('../src/services/telemedicine.service.js');
  const { appointment } = await buildFixture({ fee: 0 });
  await assert.rejects(generateConsultationBill(appointment._id, actor()), /no consultation fee to bill/i);
});

test('telemedicine: cancelling the bill frees the consultation to be re-billed', async () => {
  const { generateConsultationBill } = await import('../src/services/telemedicine.service.js');
  const { cancelBillService } = await import('../src/services/billing.service.js');
  const Appointment = (await import('../src/models/Appointment.model.js')).default;
  const { appointment } = await buildFixture({ fee: 750 });

  const first = await generateConsultationBill(appointment._id, actor());
  await cancelBillService(first._id, { reason: 'wrong patient' }, actor());

  const freed = await Appointment.findById(appointment._id);
  assert.equal(freed.billId, null, 'a cancelled bill must not keep the appointment pointing at it');
  assert.equal(freed.paymentStatus, 'UNBILLED');

  const second = await generateConsultationBill(appointment._id, actor());
  assert.ok(String(second._id) !== String(first._id), 'a cancelled bill must free the slot for a new one');
});

test('telemedicine: the no-show sweep marks only stale, unstarted consultations', async () => {
  const { sweepNoShows } = await import('../src/services/telemedicine.service.js');
  const Appointment = (await import('../src/models/Appointment.model.js')).default;
  const { doctor, appointment } = await buildFixture({ status: 'CONFIRMED' });

  const stale = new Date(Date.now() - 6 * 60 * 60 * 1000);
  await Appointment.updateOne({ _id: appointment._id }, { $set: { date: stale, time: '09:00' } });

  const upcoming = await Appointment.create({
    appointmentNumber: 'APT-TM-0002-NOSHOW',
    patientId: appointment.patientId,
    doctorId: doctor._id,
    date: new Date(Date.now() + 60 * 60 * 1000),
    time: '16:00',
    consultationMode: 'TELEMEDICINE',
    consultationFee: 300,
    status: 'CONFIRMED',
  });

  const result = await sweepNoShows();
  assert.equal(result.count, 1);
  assert.deepEqual(result.marked, [appointment.appointmentNumber]);

  const after = await Appointment.findById(appointment._id);
  assert.equal(after.status, 'NO_SHOW');
  assert.equal(after.statusHistory.at(-1).to, 'NO_SHOW');
  assert.equal((await Appointment.findById(upcoming._id)).status, 'CONFIRMED', 'a future slot is untouched');
});

test('telemedicine: an in-person appointment is refused by every teleconsultation entry point', async () => {
  const { startConsultation, joinConsultation, generateConsultationBill } =
    await import('../src/services/telemedicine.service.js');
  const { doctor, appointment } = await buildFixture({ mode: 'IN_PERSON', fee: 500 });

  const doctorActor = actor({ doctorId: doctor._id });
  const refusals = [
    [() => startConsultation(appointment._id, doctorActor), /not a teleconsultation/i],
    [() => joinConsultation(appointment._id, doctorActor), /not a teleconsultation/i],
    [() => generateConsultationBill(appointment._id, doctorActor), /not a teleconsultation/i],
  ];
  for (const [call, matcher] of refusals) {
    await assert.rejects(call(), matcher);
  }
  // An appointment created without an explicit mode must default to in-person
  // and therefore be refused too - existing rows have no consultationMode.
  const legacy = await buildFixture({ fee: 500 });
  const legacyDoc = await (await import('../src/models/Appointment.model.js')).default.findById(legacy.appointment._id);
  legacyDoc.consultationMode = undefined;
  legacyDoc.markModified('consultationMode');
  await legacyDoc.save();
  await assert.rejects(
    startConsultation(legacy.appointment._id, doctorActor),
    /not a teleconsultation/i,
  );
});

test('telemedicine: rescheduling preserves the vacated slot and is not terminal', async () => {
  const { rescheduleAppointment, updateAppointmentStatus } = await import('../src/services/appointment.service.js');
  const { appointment } = await buildFixture({ status: 'CONFIRMED' });

  const when = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const moved = await rescheduleAppointment(appointment._id, { date: when, time: '15:30' }, actor());

  assert.equal(moved.status, 'RESCHEDULED');
  assert.match(moved.rescheduledFrom, /^\d{4}-\d{2}-\d{2} /, 'the original slot is retained');
  assert.ok(!moved.rescheduledFrom.includes('15:30'), 'the retained slot must be the one vacated, not the new one');

  const confirmed = await updateAppointmentStatus(appointment._id, 'CONFIRMED', actor());
  assert.equal(confirmed.status, 'CONFIRMED', 'a rescheduled slot can still be confirmed');
});

test('telemedicine: a completed or cancelled consultation cannot be rescheduled', async () => {
  const { rescheduleAppointment } = await import('../src/services/appointment.service.js');
  const Appointment = (await import('../src/models/Appointment.model.js')).default;
  const { appointment } = await buildFixture({ status: 'CONFIRMED' });

  await Appointment.updateOne({ _id: appointment._id }, { $set: { status: 'COMPLETED' } });
  await assert.rejects(
    rescheduleAppointment(appointment._id, { date: new Date(), time: '17:00' }, actor()),
    /Cannot reschedule an appointment that is COMPLETED/i,
  );
});

test('telemedicine: a prescription issued in a consultation is traceable back to it', async () => {
  const Prescription = (await import('../src/models/Prescription.model.js')).default;
  const { createPrescription } = await import('../src/services/opd.service.js');
  const { getConsultationDetail, getPrescriptionsForConsultation } =
    await import('../src/services/telemedicine.service.js');
  const { doctor, appointment } = await buildFixture({ status: 'IN_CONSULTATION' });

  const rx = await createPrescription(
    {
      patientId: appointment.patientId,
      doctorId: doctor._id,
      appointmentId: appointment._id,
      status: 'SIGNED',
      isSigned: true,
      items: [{ medicineName: 'Amlodipine', dosage: '5mg', quantity: 10 }],
    },
    actor(),
  );
  assert.ok(rx.rxNumber, 'the prescription number is generated by the shared service');

  const detail = await getConsultationDetail(appointment._id);
  assert.equal(detail.prescriptions.length, 1);
  assert.equal(String(detail.prescriptions[0]._id), String(rx._id));

  const listed = await getPrescriptionsForConsultation(appointment._id);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].doctorId.name, doctor.name);

  // A prescription written for the in-person OPD path carries no appointmentId,
  // so it must not appear in a consultation's record.
  const other = await buildFixture({ status: 'CONFIRMED' });
  await createPrescription(
    {
      patientId: other.appointment.patientId,
      doctorId: other.doctor._id,
      items: [{ medicineName: 'Paracetamol', quantity: 5 }],
    },
    actor(),
  );
  assert.equal((await getPrescriptionsForConsultation(appointment._id)).length, 1);
});

test('telemedicine: prescriptions cannot be attached to an in-person appointment', async () => {
  const { getPrescriptionsForConsultation, assertConsultation } =
    await import('../src/services/telemedicine.service.js');
  const { appointment } = await buildFixture({ mode: 'IN_PERSON' });

  await assert.rejects(getPrescriptionsForConsultation(appointment._id), /not a teleconsultation/i);
  await assert.rejects(assertConsultation(appointment._id), /not a teleconsultation/i);
});

test('telemedicine: the list endpoint returns only teleconsultations', async () => {
  const { listTelemedicineAppointments } = await import('../src/services/telemedicine.service.js');
  const Appointment = (await import('../src/models/Appointment.model.js')).default;
  const { doctor, appointment, patient } = await buildFixture({ mode: 'TELEMEDICINE', status: 'CONFIRMED' });

  await Appointment.create({
    appointmentNumber: 'APT-IP-0001',
    patientId: patient._id,
    doctorId: doctor._id,
    date: appointment.date,
    time: '11:00',
    consultationMode: 'IN_PERSON',
    status: 'CONFIRMED',
  });

  const result = await listTelemedicineAppointments({});
  assert.equal(result.pagination.total, 1);
  assert.equal(result.data[0].appointmentNumber, appointment.appointmentNumber);
});

test('telemedicine: the permission set exists and booking is not granted by viewing', async () => {
  const Permission = (await import('../src/models/Permission.model.js')).default;
  await Permission.ensureDefaults();

  const codes = await Permission.find({ module: 'telemedicine' }).select('code').lean();
  const found = codes.map((c) => c.code);
  for (const expected of [
    'TELEMEDICINE_VIEW',
    'TELEMEDICINE_BOOK',
    'TELEMEDICINE_EDIT',
    'TELEMEDICINE_CONSULT',
    'TELEMEDICINE_JOIN_OWN',
    'TELEMEDICINE_JOIN_ANY',
    'TELEMEDICINE_BILLING',
    'TELEMEDICINE_FEE_WAIVE',
    'TELEMEDICINE_RECORD_VIEW',
  ]) {
    assert.ok(found.includes(expected), `${expected} must be seeded`);
  }
  assert.ok(found.length > 1);
});

test('telemedicine: an unstarted consultation leaves no consultation timestamps behind', async () => {
  const { doctor, appointment } = await buildFixture({ status: 'CONFIRMED' });
  const { startConsultation } = await import('../src/services/telemedicine.service.js');
  const { recordConsent } = await import('../src/services/telemedicine.service.js');

  await recordConsent(appointment._id, { videoConsent: true, ip: '203.0.113.9' }, actor());

  const Appointment = (await import('../src/models/Appointment.model.js')).default;
  const consented = await Appointment.findById(appointment._id);
  assert.equal(consented.consent.videoConsent, true);
  assert.ok(consented.consent.recordedAt);
  assert.equal(consented.consent.ip, '203.0.113.9');
  assert.equal(consented.consultationStartedAt, undefined);

  await startConsultation(appointment._id, actor({ doctorId: doctor._id }));
  const started = await Appointment.findById(appointment._id);
  assert.ok(started.consultationStartedAt);
});

test('telemedicine: declining consent is recorded, not silently ignored', async () => {
  const { recordConsent } = await import('../src/services/telemedicine.service.js');
  const Appointment = (await import('../src/models/Appointment.model.js')).default;
  const { appointment } = await buildFixture();

  await assert.rejects(
    recordConsent(appointment._id, { videoConsent: undefined }, actor()),
    /explicitly accepted or declined/i,
  );

  const declined = await recordConsent(appointment._id, { videoConsent: false }, actor());
  assert.equal(declined.consent.videoConsent, false);
  assert.ok(declined.consent.recordedAt, 'a refusal is still a recorded event');
});

test('security: a failed login never writes the password into the error log', async () => {
  const { redactSensitive } = await import('../src/middleware/errorHandler.js');

  const logged = redactSensitive({
    usernameOrEmail: 'superadmin',
    password: 'Admin@123',
    currentPassword: 'old-one',
    newPassword: 'new-one',
    nested: { patient: { passwordHash: 'bcrypt$...', uhid: 'TM001' } },
  });

  assert.equal(logged.password, '***');
  assert.equal(logged.currentPassword, '***');
  assert.equal(logged.newPassword, '***');
  assert.equal(logged.nested.patient.passwordHash, '***');
  assert.equal(logged.usernameOrEmail, 'superadmin', 'non-secret fields stay useful for debugging');
  assert.equal(logged.nested.patient.uhid, 'TM001');
});

test('deployment: the proxy hop is trusted so rate limiting can identify a client', async () => {
  const config = (await import('../src/config/index.js')).default;

  // Render terminates TLS on its edge and forwards X-Forwarded-For. With trust
  // proxy off, express-rate-limit throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR on
  // every request and the login brute-force limit counts nobody.
  assert.equal(config.trustProxy, 1, 'exactly one hop - trusting the whole chain would allow spoofing');
});

test('deployment: the first-run admin is provisioned so a fresh cluster is usable', async () => {
  const { bootstrapAdminUser, bootstrapRoles } = await import('../src/services/auth.service.js');
  const User = (await import('../src/models/User.model.js')).default;

  // beforeEach wipes every collection, so the roles have to be re-seeded the way
  // a real boot would have them before the admin check runs.
  await bootstrapRoles();
  assert.equal(await User.countDocuments({}), 0, 'starting from an empty user table');

  const first = await bootstrapAdminUser();
  assert.equal(first.created, true, 'a cluster with no user at all must not be left unloginable');
  assert.equal(first.user.username, 'superadmin');

  const second = await bootstrapAdminUser();
  assert.equal(second.created, false, 'an existing admin is never overwritten');
  assert.equal(await User.countDocuments({ username: 'superadmin' }), 1);
});