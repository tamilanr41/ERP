import mongoose from 'mongoose';
import { DialysisSchedule, RECURRING_STATUS } from '../models/DialysisSchedule.model.js';
import { DialysisSession, SESSION_STATUS, SESSION_PRIORITY, SHIFTS } from '../models/DialysisSession.model.js';
import { DialysisPrescription, PRESCRIPTION_STATUS } from '../models/DialysisPrescription.model.js';
import { DialysisPatient } from '../models/DialysisPatient.model.js';
import { DialysisMachine, MACHINE_STATUS } from '../models/DialysisMachine.model.js';
import { DialysisStation, STATION_STATUS } from '../models/DialysisStation.model.js';
import IpdAdmission, { ADMISSION_STATUS } from '../models/IpdAdmission.model.js';
import Doctor from '../models/Doctor.model.js';
import Patient from '../models/Patient.model.js';
import { generateNumber } from '../utils/numberGenerator.js';
import { getDialysisConfig, safetyThresholds, shiftForTime, timeToMinutes, minutesToTime, startOfLocalDay, endOfLocalDay } from './dialysis.config.service.js';
import { writeAudit } from '../middleware/audit.js';
import { emitDialysis } from './dialysis.emit.js';
import { BadRequestError, NotFoundError, ConflictError } from '../utils/ApiError.js';

export const DAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/**
 * Keeps only the day codes we recognise, and if the caller sent values that are
 * all unrecognised, says so instead of claiming they selected no days. Silently
 * dropping a mistyped day means a patient quietly stops being scheduled for it.
 */
const readDaysOfWeek = (input) => {
  const raw = input == null ? [] : [].concat(input);
  const days = raw.filter((d) => DAY_CODES.includes(d));
  if (days.length) return days;
  if (!raw.length) throw new BadRequestError('Select at least one day of the week');
  const quoted = [...new Set(raw.map((d) => JSON.stringify(d)))].join(', ');
  throw new BadRequestError(
    `Day of the week must be one of ${DAY_CODES.join(', ')} — received ${quoted}`,
  );
};

const dayCode = (d) => DAY_CODES[new Date(d).getDay()];
const atTime = (date, time) => {
  const [h, m] = String(time || '08:00').split(':').map(Number);
  const dt = new Date(date);
  dt.setHours(h || 0, m || 0, 0, 0);
  return dt;
};

/** Statuses that still occupy a machine, a bay and the patient's diary. */
const BLOCKING_STATUSES = [
  SESSION_STATUS.REQUESTED, SESSION_STATUS.SCHEDULED, SESSION_STATUS.CONFIRMED,
  SESSION_STATUS.CHECKED_IN, SESSION_STATUS.WAITING, SESSION_STATUS.PRE_ASSESSED,
  SESSION_STATUS.READY, SESSION_STATUS.CONNECTED, SESSION_STATUS.IN_PROGRESS,
];

// ============================================================
// CLASH DETECTION — one patient, one machine, one bay per slot
// ============================================================
const overlaps = (start, end, s) => s.scheduledStart < end && s.scheduledEnd > start;

const findClashes = async ({ sessionId, patientId, machineId, stationId, start, end, session }) => {
  const base = {
    status: { $in: BLOCKING_STATUSES },
    scheduledStart: { $lt: end },
    scheduledEnd: { $gt: start },
  };
  if (sessionId) base._id = { $ne: sessionId };
  // only sessions competing for the same patient, machine or bay are clashes —
  // two different patients may of course be treated at the same time
  const resources = [
    patientId ? { patientId } : null,
    machineId ? { machineId } : null,
    stationId ? { stationId } : null,
  ].filter(Boolean);
  if (resources.length) base.$or = resources;
  return DialysisSession.find(base).session(session || null).select('sessionNumber patientId machineId stationId scheduledStart scheduledEnd status').lean();
};

const assertNoClash = async (args) => {
  const clashes = await findClashes(args);
  if (!clashes.length) return;

  const { patientId, machineId, stationId, sessionId } = args;
  const messages = [];
  if (patientId && clashes.some((c) => String(c.patientId) === String(patientId))) {
    messages.push('the patient already has a session in this time slot');
  }
  if (machineId) {
    const m = clashes.find((c) => String(c.machineId) === String(machineId));
    if (m) messages.push(`machine is taken by session ${m.sessionNumber}`);
  }
  if (stationId) {
    const st = clashes.find((c) => String(c.stationId) === String(stationId));
    if (st) messages.push(`bay is taken by session ${st.sessionNumber}`);
  }
  if (messages.length) {
    throw new ConflictError(`Double booking prevented — ${messages.join('; ')}`);
  }
  // Even without a direct collision, anything in the window must be surfaced.
  throw new ConflictError(`Double booking prevented — ${clashes.length} session(s) already overlap this slot`);
};

const assertMachineUsable = async (machineId, session = null) => {
  if (!machineId) return null;
  const machine = await DialysisMachine.findById(machineId).session(session || null);
  if (!machine) throw new NotFoundError('Dialysis machine not found');
  if (!machine.active) throw new BadRequestError(`Machine ${machine.code} is decommissioned`);
  if (![MACHINE_STATUS.AVAILABLE, MACHINE_STATUS.RESERVED].includes(machine.status)) {
    throw new ConflictError(`Machine ${machine.code} is ${machine.status}`);
  }
  return machine;
};

const assertStationUsable = async (stationId, machineId, session = null) => {
  if (!stationId) return null;
  const station = await DialysisStation.findById(stationId).session(session || null);
  if (!station) throw new NotFoundError('Dialysis station not found');
  if (![STATION_STATUS.AVAILABLE, STATION_STATUS.RESERVED].includes(station.status)) {
    throw new ConflictError(`Bay ${station.code} is ${station.status}`);
  }
  if (station.machineId && machineId && String(station.machineId) !== String(machineId)) {
    throw new ConflictError(`Bay ${station.code} has a different machine installed`);
  }
  return station;
};

const stationFree = async (stationId, at, end) => {
  if (!stationId) return true;
  const busy = await DialysisSession.exists({
    stationId,
    status: { $in: BLOCKING_STATUSES },
    scheduledStart: { $lt: end },
    scheduledEnd: { $gt: at },
  });
  return !busy;
};

/**
 * Picks the first machine that is free for the whole slot AND whose bay is
 * free too — a machine in an occupied bay can never be started.
 */
const pickFreeMachine = async ({ at, durationMinutes, machineType, excludeMachineId, requireStation = true }) => {
  const machines = await DialysisMachine.find({
    active: true,
    status: { $in: [MACHINE_STATUS.AVAILABLE, MACHINE_STATUS.RESERVED] },
    ...(excludeMachineId ? { _id: { $ne: excludeMachineId } } : {}),
    ...(machineType ? { machineType: { $in: [machineType, 'HEMODIALYSIS'] } } : {}),
  }).sort({ status: 1, code: 1 });

  const end = new Date(new Date(at).getTime() + (durationMinutes || 240) * 60000);
  for (const machine of machines) {
    // eslint-disable-next-line no-await-in-loop
    const busy = await DialysisSession.exists({
      machineId: machine._id,
      status: { $in: BLOCKING_STATUSES },
      scheduledStart: { $lt: end },
      scheduledEnd: { $gt: at },
    });
    if (busy) continue;
    if (requireStation && machine.stationId) {
      // eslint-disable-next-line no-await-in-loop
      const bayFree = await stationFree(machine.stationId, at, end);
      if (!bayFree) continue;
    }
    return machine;
  }
  return null;
};

const loadPatient = async (payload, session) => {
  const patient = await DialysisPatient.findOne({
    $or: [{ _id: payload.dialysisPatientId }, { patientId: payload.patientId }],
  }).session(session || null);
  if (!patient) throw new NotFoundError('Dialysis patient not found');
  if (patient.status !== 'ACTIVE') throw new BadRequestError(`Dialysis registration is ${patient.status} — scheduling is blocked`);
  return patient;
};

const resolveDoctor = async (doctorId, session) => {
  if (!doctorId) return null;
  const doctor = await Doctor.findById(doctorId).session(session || null).select('_id name active');
  if (!doctor) throw new BadRequestError('Doctor not found');
  return doctor;
};

const pushStatus = (doc, to, actor, note) => {
  if (doc.status) doc.statusHistory.push({ from: doc.status, to, at: new Date(), by: actor?.id, note });
  doc.status = to;
};

// The snapshot is the session's own copy of the prescription for the day. It
// must carry the prescription's identity, otherwise a session that started last
// month cannot be traced back to the order that justified it.
const buildSnapshot = (prescription) => ({
  prescriptionId: prescription._id,
  prescriptionNumber: prescription.prescriptionNumber,
  version: prescription.version,
  modality: prescription.modality,
  durationMinutes: prescription.durationMinutes,
  frequencyPerWeek: prescription.frequencyPerWeek,
  bloodFlowRate: prescription.bloodFlowRate,
  dialysateFlowRate: prescription.dialysateFlowRate,
  dialysateCalcium: prescription.dialysateCalcium,
  dialysatePotassium: prescription.dialysatePotassium,
  dialyserType: prescription.dialyserType,
  targetDryWeightKg: prescription.targetDryWeightKg,
  ultrafiltrationGoalMl: prescription.ultrafiltrationGoalMl,
  maxUltrafiltrationMl: prescription.maxUltrafiltrationMl,
  heparinPrimeUnits: prescription.heparinPrimeUnits,
  accessType: prescription.accessType,
  prescribedBy: prescription.prescribedBy,
  prescribedByName: prescription.prescribedByName,
  prescribedAt: prescription.prescribedAt,
});

// ============================================================
// 1. SINGLE / EMERGENCY BOOKING (spec 8)
// ============================================================
export const bookSession = async (payload, actor) => {
  const patient = await loadPatient(payload);
  const config = await getDialysisConfig();
  const isEmergency = Boolean(payload.isEmergency) || payload.priority === SESSION_PRIORITY.EMERGENCY;

  const start = payload.scheduledAt ? new Date(payload.scheduledAt) : new Date();
  if (Number.isNaN(start.getTime())) throw new BadRequestError('Invalid schedule time');

  const timeOfDay = payload.timeOfDay || `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
  const startAt = payload.date && !payload.scheduledAt ? atTime(payload.date, timeOfDay) : start;

  if (!isEmergency) {
    const lead = config.scheduling.leadTimeDays ?? 30;
    const maxAdvance = config.scheduling.maxAdvanceDays ?? 90;
    const daysOut = (startAt.getTime() - Date.now()) / 86400000;
    if (daysOut > maxAdvance) throw new BadRequestError(`Sessions can only be booked ${maxAdvance} days in advance`);
    if (daysOut < -(lead + 1)) throw new BadRequestError(`Sessions cannot be booked more than ${lead} days in the past`);
  }

  const prescription = payload.prescriptionId
    ? await DialysisPrescription.findById(payload.prescriptionId)
    : await DialysisPrescription.findOne({ patientId: patient.patientId, status: PRESCRIPTION_STATUS.ACTIVE }).sort({ prescribedAt: -1 });
  if (!prescription) throw new BadRequestError('No active dialysis prescription — the nephrologist must prescribe first');

  const duration = payload.durationMinutes || prescription.durationMinutes || config.scheduling.defaultDurationMinutes || 240;
  const end = new Date(startAt.getTime() + duration * 60000);
  const shift = payload.shift || shiftForTime(startAt, config);

  // ---- resource assignment (preferred first, then auto-allocate)
  let machine = null;
  let station = null;
  // A bay is normally named before its machine, because the machine fitted to
  // that bay is the one the patient will actually be dialysed on. Auto-picking
  // some other machine and then refusing the booking because the bay already has
  // one fitted is a refusal the desk cannot act on from the booking screen.
  const namedStation = payload.stationId ? await DialysisStation.findById(payload.stationId) : null;
  if (payload.machineId) {
    machine = await assertMachineUsable(payload.machineId);
  } else if (namedStation?.machineId) {
    machine = await assertMachineUsable(namedStation.machineId);
  } else if (payload.assignMachine !== false) {
    machine = await pickFreeMachine({ at: startAt, durationMinutes: duration, machineType: prescription.modality });
  }
  if (payload.stationId) {
    station = await assertStationUsable(payload.stationId, machine?._id);
  } else if (machine?.stationId) {
    station = await DialysisStation.findById(machine.stationId);
  }
  if (!station && payload.assignStation !== false) {
    // a free bay may be chosen for a machine that lives in an occupied bay,
    // but only when that pairing is physically allowed
    const usable = await DialysisStation.find({
      status: { $in: [STATION_STATUS.AVAILABLE, STATION_STATUS.RESERVED] },
      ...(machine ? { $or: [{ machineId: null }, { machineId: machine._id }] } : {}),
    }).sort({ code: 1 });
    for (const candidate of usable) {
      // eslint-disable-next-line no-await-in-loop
      if (await stationFree(candidate._id, startAt, end)) { station = candidate; break; }
    }
  }

  await assertNoClash({
    patientId: patient.patientId, machineId: machine?._id, stationId: station?._id, start: startAt, end,
  });

  const doctorId = payload.doctorId || patient.nephrologistId;
  if (doctorId) await resolveDoctor(doctorId);

  const initialStatus = payload.status === SESSION_STATUS.REQUESTED ? SESSION_STATUS.REQUESTED : SESSION_STATUS.SCHEDULED;

  const session = await DialysisSession.create({
    sessionNumber: await generateNumber('DSS', new Date().getFullYear()),
    sessionDate: startAt,
    patientId: patient.patientId,
    dialysisPatientId: patient._id,
    admissionId: payload.admissionId,
    opdVisitId: payload.opdVisitId,
    scheduleId: payload.scheduleId,
    isRecurring: Boolean(payload.scheduleId),
    scheduleSequence: payload.scheduleSequence,
    frequencyPerWeek: payload.frequencyPerWeek || prescription.frequencyPerWeek,
    prescriptionId: prescription._id,
    prescriptionSnapshot: buildSnapshot(prescription),
    machineId: machine?._id,
    stationId: station?._id,
    shift,
    priority: payload.priority || (patient.specialNeeds ? SESSION_PRIORITY.URGENT : config.scheduling.defaultPriority || SESSION_PRIORITY.ROUTINE),
    isEmergency,
    scheduledAt: startAt,
    scheduledStart: startAt,
    scheduledEnd: end,
    slotDurationMinutes: duration,
    timeOfDay,
    doctorId,
    nurseId: payload.nurseId,
    technicianId: payload.technicianId,
    ufGoalMl: prescription.ultrafiltrationGoalMl,
    bloodFlowRate: prescription.bloodFlowRate,
    dialysateFlowRate: prescription.dialysateFlowRate,
    requestedAt: initialStatus === SESSION_STATUS.REQUESTED ? new Date() : undefined,
    requestedBy: initialStatus === SESSION_STATUS.REQUESTED ? actor?.id : undefined,
    status: initialStatus,
    statusHistory: [{ from: null, to: initialStatus, at: new Date(), by: actor?.id, note: initialStatus === SESSION_STATUS.REQUESTED ? 'Session requested' : 'Session booked' }],
    hospitalId: actor?.hospitalId,
    branchId: actor?.branchId,
  });

  patient.totalSessions += 1;
  if (!patient.nextSessionAt || patient.nextSessionAt > startAt) patient.nextSessionAt = startAt;
  await patient.save();

  await writeAudit({
    user: actor, action: 'DIALYSIS_SCHEDULE', module: 'dialysis', entityId: session._id, entityType: 'DialysisSession',
    data: {
      sessionNumber: session.sessionNumber, mode: isEmergency ? 'EMERGENCY' : 'SINGLE', status: initialStatus,
      scheduledStart: startAt, shift, machineId: machine?._id, stationId: station?._id, scheduleId: payload.scheduleId,
    },
  });
  emitDialysis('session_scheduled', { sessionId: session._id, machineId: machine?._id, stationId: station?._id });
  return getSessionFull(session._id);
};

// ============================================================
// 2. CONFIRM / CANCEL-NOSHOW / RESCHEDULE (spec 8)
// ============================================================
export const confirmSession = async (id, payload, actor) => {
  const session = await DialysisSession.findById(id);
  if (!session) throw new NotFoundError('Dialysis session not found');
  if (![SESSION_STATUS.REQUESTED, SESSION_STATUS.SCHEDULED].includes(session.status)) {
    throw new ConflictError(`Only a requested or scheduled session can be confirmed (currently ${session.status})`);
  }

  if (payload.machineId || payload.stationId || payload.doctorId || payload.nurseId) {
    await assignSession(id, payload, actor);
  }

  const fresh = await DialysisSession.findById(id);
  const machine = payload.machineId || fresh.machineId ? await assertMachineUsable(payload.machineId || fresh.machineId) : null;
  const station = payload.stationId || fresh.stationId ? await assertStationUsable(payload.stationId || fresh.stationId, machine?._id) : null;
  if (machine && !fresh.machineId) fresh.machineId = machine._id;
  if (station && !fresh.stationId) fresh.stationId = station._id;
  if (payload.doctorId) fresh.doctorId = payload.doctorId;
  if (payload.nurseId) fresh.nurseId = payload.nurseId;

  await assertNoClash({
    sessionId: fresh._id, patientId: fresh.patientId, machineId: fresh.machineId, stationId: fresh.stationId,
    start: fresh.scheduledStart, end: fresh.scheduledEnd,
  });

  fresh.confirmedAt = new Date();
  fresh.confirmedBy = actor?.id;
  pushStatus(fresh, SESSION_STATUS.CONFIRMED, actor, payload.notes || 'Session confirmed by the scheduling desk');
  await fresh.save();

  await writeAudit({ user: actor, action: 'DIALYSIS_CONFIRM', module: 'dialysis', entityId: id, entityType: 'DialysisSession', data: { sessionNumber: fresh.sessionNumber, machineId: fresh.machineId, stationId: fresh.stationId } });
  emitDialysis('session_updated', { sessionId: id, status: fresh.status });
  return getSessionFull(id);
};

/** Assign or reassign machine / bay / staff. Only before the patient is connected. */
export const assignSession = async (id, payload, actor) => {
  const session = await DialysisSession.findById(id);
  if (!session) throw new NotFoundError('Dialysis session not found');
  if (![SESSION_STATUS.REQUESTED, SESSION_STATUS.SCHEDULED, SESSION_STATUS.CONFIRMED].includes(session.status)) {
    throw new ConflictError(`A ${session.status} session can no longer be reassigned`);
  }

  const machineId = payload.machineId !== undefined ? payload.machineId : session.machineId;
  const stationId = payload.stationId !== undefined ? payload.stationId : session.stationId;
  const machine = machineId ? await assertMachineUsable(machineId) : null;
  const station = stationId ? await assertStationUsable(stationId, machineId) : null;

  await assertNoClash({
    sessionId: session._id, patientId: session.patientId, machineId, stationId,
    start: session.scheduledStart, end: session.scheduledEnd,
  });

  session.machineId = machineId || null;
  session.stationId = stationId || null;
  if (payload.doctorId) session.doctorId = payload.doctorId;
  if (payload.nurseId) session.nurseId = payload.nurseId;
  if (payload.technicianId) session.technicianId = payload.technicianId;
  if (payload.shift) session.shift = payload.shift;
  await session.save();

  // The machine and the bay reference each other, and only the session knew
  // about the pairing. The machine list and the day's board read the bay off the
  // machine, so a machine booked into a bay showed a blank bay next to the
  // patient sitting in it. Only the machine's own pointer is written here: a
  // machine is mobile, and stamping machineId onto the bay made
  // assertStationUsable treat the bay as permanently fitted to that machine, so
  // booking a different machine into it afterwards was refused.
  if (machineId) {
    await DialysisMachine.findByIdAndUpdate(machineId, { $set: { stationId: stationId || null } });
  }

  await writeAudit({
    user: actor, action: 'DIALYSIS_ASSIGN', module: 'dialysis', entityId: id, entityType: 'DialysisSession',
    data: { sessionNumber: session.sessionNumber, machineId: session.machineId, stationId: session.stationId, doctorId: session.doctorId, nurseId: session.nurseId },
  });
  emitDialysis('session_updated', { sessionId: id, status: session.status });
  return getSessionFull(id);
};

/** Reschedule: the original sitting is never rewritten — a new one is linked to it. */
export const rescheduleSession = async (id, payload, actor) => {
  const original = await DialysisSession.findById(id);
  if (!original) throw new NotFoundError('Dialysis session not found');
  if (![SESSION_STATUS.REQUESTED, SESSION_STATUS.SCHEDULED, SESSION_STATUS.CONFIRMED].includes(original.status)) {
    throw new ConflictError(`A ${original.status} session cannot be rescheduled — cancel or complete it instead`);
  }

  const patient = await loadPatient({ dialysisPatientId: original.dialysisPatientId });

  const newStart = payload.scheduledAt ? new Date(payload.scheduledAt) : null;
  if (!newStart && !payload.date) throw new BadRequestError('A new date or time is required to reschedule');
  const timeOfDay = payload.timeOfDay || (newStart ? `${String(newStart.getHours()).padStart(2, '0')}:${String(newStart.getMinutes()).padStart(2, '0')}` : original.timeOfDay);
  const startAt = newStart || atTime(payload.date, timeOfDay);
  if (Number.isNaN(startAt.getTime())) throw new BadRequestError('Invalid reschedule time');

  const duration = payload.durationMinutes || original.slotDurationMinutes;
  const end = new Date(startAt.getTime() + duration * 60000);

  let machineId = payload.machineId !== undefined ? payload.machineId : original.machineId;
  let stationId = payload.stationId !== undefined ? payload.stationId : original.stationId;

  // Rescheduling is just as much an assignment as booking is, so the machine
  // and bay have to be usable. Without this a session could be moved onto a
  // machine that is out of service or mid-service, and the clash check below
  // only ever looks at other sessions.
  if (machineId) await assertMachineUsable(machineId);
  if (stationId) await assertStationUsable(stationId, machineId);

  // free the original slot before checking the new one
  await assertNoClash({ patientId: patient.patientId, machineId, stationId, start: startAt, end });

  const config = await getDialysisConfig();
  const shift = payload.shift || shiftForTime(startAt, config);

  const replacement = await DialysisSession.create({
    sessionNumber: await generateNumber('DSS', new Date().getFullYear()),
    sessionDate: startAt,
    patientId: original.patientId,
    dialysisPatientId: original.dialysisPatientId,
    admissionId: original.admissionId,
    opdVisitId: original.opdVisitId,
    scheduleId: original.scheduleId,
    isRecurring: original.isRecurring,
    scheduleSequence: original.scheduleSequence,
    frequencyPerWeek: original.frequencyPerWeek,
    prescriptionId: original.prescriptionId,
    prescriptionSnapshot: original.prescriptionSnapshot,
    machineId,
    stationId,
    shift,
    priority: original.priority,
    isEmergency: original.isEmergency,
    scheduledAt: startAt,
    scheduledStart: startAt,
    scheduledEnd: end,
    slotDurationMinutes: duration,
    timeOfDay,
    doctorId: payload.doctorId || original.doctorId,
    nurseId: payload.nurseId || original.nurseId,
    technicianId: payload.technicianId || original.technicianId,
    ufGoalMl: original.ufGoalMl,
    bloodFlowRate: original.bloodFlowRate,
    dialysateFlowRate: original.dialysateFlowRate,
    rescheduledFromId: original._id,
    rescheduleCount: (original.rescheduleCount || 0) + 1,
    status: SESSION_STATUS.SCHEDULED,
    statusHistory: [{ from: null, to: SESSION_STATUS.SCHEDULED, at: new Date(), by: actor?.id, note: `Rescheduled from ${original.sessionNumber}` }],
    notes: `Rescheduled from ${original.sessionNumber}`,
    hospitalId: original.hospitalId,
    branchId: original.branchId,
  });

  original.rescheduledToId = replacement._id;
  original.cancelledAt = new Date();
  original.cancelReason = payload.reason || 'Rescheduled';
  original.cancellationReason = original.cancelReason;
  pushStatus(original, SESSION_STATUS.CANCELLED, actor, `Rescheduled to ${replacement.sessionNumber} — ${startAt.toISOString()}`);
  await original.save();

  if (original.scheduleId) {
    await DialysisSchedule.findByIdAndUpdate(original.scheduleId, {
      $pull: { generatedSessionIds: original._id },
      $push: { generatedSessionIds: replacement._id },
      $set: { lastGeneratedAt: new Date() },
    });
  }

  await writeAudit({
    user: actor, action: 'DIALYSIS_RESCHEDULE', module: 'dialysis', entityId: original._id, entityType: 'DialysisSession',
    data: { from: original.sessionNumber, to: replacement.sessionNumber, fromStart: original.scheduledStart, toStart: startAt, reason: payload.reason },
  });
  emitDialysis('session_updated', { sessionId: replacement._id, status: replacement.status });
  return { original: await getSessionFull(original._id), replacement: await getSessionFull(replacement._id) };
};

export const cancelSessionByDesk = async (id, payload, actor) => {
  const session = await DialysisSession.findById(id);
  if (!session) throw new NotFoundError('Dialysis session not found');
  if ([SESSION_STATUS.CLOSED, SESSION_STATUS.COMPLETED, SESSION_STATUS.BILLED, SESSION_STATUS.CANCELLED, SESSION_STATUS.NO_SHOW].includes(session.status)) {
    throw new ConflictError(`A ${session.status} session cannot be cancelled`);
  }
  if (!payload?.reason) throw new BadRequestError('A cancellation reason is required');

  session.cancelledAt = new Date();
  session.cancelReason = payload.reason;
  session.cancellationReason = payload.reason;
  pushStatus(session, SESSION_STATUS.CANCELLED, actor, payload.reason);
  await session.save();

  if (session.scheduleId) {
    await DialysisSchedule.findByIdAndUpdate(session.scheduleId, { $pull: { generatedSessionIds: session._id } });
  }

  await writeAudit({
    user: actor, action: 'DIALYSIS_CANCEL', module: 'dialysis', entityId: id, entityType: 'DialysisSession',
    data: { sessionNumber: session.sessionNumber, reason: payload.reason, via: 'SCHEDULING_DESK' },
  });
  emitDialysis('session_updated', { sessionId: id, status: session.status });
  return getSessionFull(id);
};

export const markWaiting = async (id, payload, actor) => {
  const session = await DialysisSession.findById(id);
  if (!session) throw new NotFoundError('Dialysis session not found');
  if (![SESSION_STATUS.CONFIRMED, SESSION_STATUS.CHECKED_IN].includes(session.status)) {
    throw new ConflictError(`Only a confirmed or checked-in session can be put on the waiting list (currently ${session.status})`);
  }
  pushStatus(session, SESSION_STATUS.WAITING, actor, payload?.notes || 'Moved to the waiting list');
  if (payload?.nurseId) session.nurseId = payload.nurseId;
  await session.save();
  emitDialysis('session_updated', { sessionId: id, status: session.status });
  return getSessionFull(id);
};

/**
 * Recovery path for a session that was connected and then abandoned — a crash,
 * a power cut or a machine fault. The unit must never be left with a machine
 * locked to a session nobody is running, so this releases the machine and bay
 * back to cleaning and closes the record with a mandatory reason.
 */
export const abandonSession = async (id, payload, actor) => {
  const session = await DialysisSession.findById(id);
  if (!session) throw new NotFoundError('Dialysis session not found');
  if (![SESSION_STATUS.CHECKED_IN, SESSION_STATUS.WAITING, SESSION_STATUS.PRE_ASSESSED, SESSION_STATUS.READY, SESSION_STATUS.CONNECTED, SESSION_STATUS.IN_PROGRESS].includes(session.status)) {
    throw new ConflictError(`Only a checked-in, connected or running session can be abandoned (currently ${session.status})`);
  }
  if (!payload?.reason || !String(payload.reason).trim()) {
    throw new BadRequestError('A reason is required to abandon a running session');
  }

  const stamp = new Date();
  session.cancelledAt = stamp;
  session.cancelReason = payload.reason;
  session.cancellationReason = payload.reason;
  session.emergencyReason = payload.reason;
  session.disconnectedAt = session.disconnectedAt || stamp;
  if (!session.completedAt && session.startedAt) {
    session.durationMinutes = Math.round((stamp - new Date(session.startedAt).getTime()) / 60000);
  }
  if (payload.ufRemovedMl != null) session.ufRemovedMl = Number(payload.ufRemovedMl);
  if (session.preWeightKg != null && session.postWeightKg == null) session.postWeightKg = session.preWeightKg;

  await releaseMachineForAbandon(session);
  pushStatus(session, SESSION_STATUS.CANCELLED, actor, `Abandoned: ${payload.reason}`);
  await session.save();

  await writeAudit({
    user: actor, action: 'DIALYSIS_ABANDON', module: 'dialysis', entityId: id, entityType: 'DialysisSession',
    data: {
      sessionNumber: session.sessionNumber, reason: payload.reason, machineId: session.machineId,
      stationId: session.stationId, ranMinutes: session.durationMinutes,
    },
  });
  emitDialysis('session_abandoned', { sessionId: id, machineId: session.machineId, stationId: session.stationId });
  return getSessionFull(id);
};

const releaseMachineForAbandon = async (session) => {
  if (session.machineId) {
    await DialysisMachine.findOneAndUpdate(
      { _id: session.machineId },
      { $set: { status: MACHINE_STATUS.CLEANING, currentSessionId: null } },
    );
  }
  if (session.stationId) {
    await DialysisStation.findOneAndUpdate(
      { _id: session.stationId },
      { $set: { status: STATION_STATUS.CLEANING, currentSessionId: null, lastTurnoverAt: new Date() } },
    );
  }
};

export const getSessionFull = async (id) => {
  const session = await DialysisSession.findById(id)
    .populate('patientId', 'uhid firstName lastName gender age bloodGroup mobile')
    .populate('dialysisPatientId', 'dialysisNumber ckdStage primaryDiagnosis nephrologistId paymentCategory sponsor')
    .populate('scheduleId', 'scheduleNumber patternLabel daysOfWeek timeOfDay status')
    .populate('rescheduledFromId', 'sessionNumber scheduledStart')
    .populate('rescheduledToId', 'sessionNumber scheduledStart')
    .populate('prescriptionId')
    .populate('machineId', 'code name machineType status')
    .populate('stationId', 'code name status area')
    .populate('doctorId', 'name specialization')
    .populate('nurseId', 'name')
    .populate('technicianId', 'name')
    .populate('billId', 'billNumber netTotal paidAmount dueAmount status')
    .populate('admissionId', 'admissionNumber status')
    .populate('opdVisitId', 'visitNumber status');
  if (!session) throw new NotFoundError('Dialysis session not found');
  return session;
};

// ============================================================
// 3. RECURRING SCHEDULE (spec 9)
// ============================================================
const computeOccurrences = (schedule, from, to) => {
  const days = new Set(schedule.daysOfWeek || []);
  const start = new Date(schedule.startDate);
  start.setHours(0, 0, 0, 0);
  const end = to ? new Date(to) : schedule.endDate ? new Date(schedule.endDate) : null;
  const limit = end || new Date(start.getTime() + (schedule.generateHorizonDays || 28) * 86400000);
  limit.setHours(23, 59, 59, 999);

  const out = [];
  const cursor = new Date(from ? new Date(from) : start);
  cursor.setHours(0, 0, 0, 0);
  if (cursor < start) cursor.setTime(start.getTime());

  let guard = 0;
  while (cursor <= limit && guard < 400) {
    guard += 1;
    if (days.has(dayCode(cursor))) out.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
};

export const createRecurringSchedule = async (payload, actor) => {
  const patient = await loadPatient(payload);
  const config = await getDialysisConfig();

  if (!payload.startDate) throw new BadRequestError('A start date is required');
  const days = readDaysOfWeek(payload.daysOfWeek);

  if (payload.endDate && new Date(payload.endDate) < new Date(payload.startDate)) {
    throw new BadRequestError('The end date cannot be before the start date');
  }

  const pattern = config.scheduling.recurrencePatterns.find((p) => p.code === payload.patternCode);
  const doctorId = payload.doctorId || patient.nephrologistId;
  if (doctorId) await resolveDoctor(doctorId);
  if (payload.preferredMachineId) await assertMachineUsable(payload.preferredMachineId);
  if (payload.preferredStationId) await assertStationUsable(payload.preferredStationId, payload.preferredMachineId);

  const [schedule] = await DialysisSchedule.create([{
    scheduleNumber: await generateNumber('DRS', new Date().getFullYear()),
    patientId: patient.patientId,
    dialysisPatientId: patient._id,
    dialysisNumber: patient.dialysisNumber,
    startDate: new Date(payload.startDate),
    endDate: payload.endDate ? new Date(payload.endDate) : undefined,
    timeOfDay: payload.timeOfDay || '08:00',
    slotDurationMinutes: payload.slotDurationMinutes || config.scheduling.defaultDurationMinutes || 240,
    preferredShift: payload.preferredShift || patient.preferredShift || config.scheduling.defaultShift,
    frequencyPerWeek: payload.frequencyPerWeek ?? pattern?.frequencyPerWeek ?? days.length,
    daysOfWeek: days,
    patternCode: payload.patternCode || pattern?.code || 'CUSTOM',
    patternLabel: payload.patternLabel || pattern?.label || days.join('/'),
    preferredMachineId: payload.preferredMachineId,
    preferredStationId: payload.preferredStationId,
    doctorId,
    nurseId: payload.nurseId,
    technicianId: payload.technicianId,
    notes: payload.notes,
    status: payload.activate === false ? RECURRING_STATUS.DRAFT : RECURRING_STATUS.ACTIVE,
    autoGenerate: payload.autoGenerate !== false,
    generateHorizonDays: payload.generateHorizonDays || 28,
    totalPlanned: 0,
    createdBy: actor?.id,
    hospitalId: actor?.hospitalId,
    branchId: actor?.branchId,
  }]);

  const occurrences = computeOccurrences(schedule, schedule.startDate, payload.previewUntil ? endOfLocalDay(startOfLocalDay(payload.previewUntil)) : null);
  schedule.totalPlanned = occurrences.length;
  await schedule.save();

  await writeAudit({
    user: actor, action: 'DIALYSIS_RECURRING_CREATE', module: 'dialysis', entityId: schedule._id, entityType: 'DialysisSchedule',
    data: { scheduleNumber: schedule.scheduleNumber, days: days.join('/'), frequencyPerWeek: schedule.frequencyPerWeek, startDate: schedule.startDate, endDate: schedule.endDate },
  });

  let generated = null;
  if (schedule.autoGenerate && payload.autoGenerate !== false) {
    generated = await generateScheduleSessions(schedule._id, { through: payload.previewUntil }, actor);
  }
  const full = await getRecurringSchedule(schedule._id);
  return { schedule: full, generated: (generated?.generated || []).map((s) => (s.toObject ? s.toObject() : s)) };
};

export const getRecurringSchedule = async (id) => {
  const schedule = await DialysisSchedule.findById(id)
    .populate('patientId', 'uhid firstName lastName gender age mobile')
    .populate('dialysisPatientId', 'dialysisNumber ckdStage primaryDiagnosis')
    .populate('doctorId', 'name specialization')
    .populate('nurseId', 'name')
    .populate('preferredMachineId', 'code name status')
    .populate('preferredStationId', 'code name status')
    .populate('generatedSessionIds', 'sessionNumber sessionDate status scheduledStart machineId stationId shift');
  if (!schedule) throw new NotFoundError('Recurring schedule not found');
  return schedule;
};

export const listRecurringSchedules = async (query = {}) => {
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.patientId) filter.patientId = query.patientId;
  if (query.dialysisPatientId) filter.dialysisPatientId = query.dialysisPatientId;
  if (query.active === 'true') filter.status = { $in: [RECURRING_STATUS.ACTIVE, RECURRING_STATUS.PAUSED] };
  if (query.q) {
    const r = new RegExp(String(query.q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    // `patientId` is a ref here, so its sub-fields cannot be filtered on directly.
    filter.$or = [{ scheduleNumber: r }];
    const matchingPatients = await Patient.find({ $or: [{ uhid: r }, { firstName: r }, { lastName: r }] }).select('_id');
    if (matchingPatients.length) filter.$or.push({ patientId: { $in: matchingPatients.map((p) => p._id) } });
  }
  const rows = await DialysisSchedule.find(filter)
    .populate('patientId', 'uhid firstName lastName')
    .populate('doctorId', 'name')
    .populate('preferredMachineId', 'code')
    .populate('preferredStationId', 'code')
    .sort({ startDate: -1 })
    .limit(Math.min(parseInt(query.limit, 10) || 50, 200));
  return rows;
};

/** Generate the sittings for a window. Idempotent — a day is never generated twice. */
export const generateScheduleSessions = async (id, payload = {}, actor) => {
  const schedule = await DialysisSchedule.findById(id);
  if (!schedule) throw new NotFoundError('Recurring schedule not found');
  if (schedule.status === RECURRING_STATUS.CANCELLED) throw new BadRequestError('This recurring schedule is cancelled');
  if (schedule.status === RECURRING_STATUS.DRAFT && payload.force !== true) {
    throw new BadRequestError('Activate the recurring schedule before generating sessions');
  }

  const patient = await DialysisPatient.findById(schedule.dialysisPatientId);
  if (!patient) throw new NotFoundError('Dialysis patient not found');

  const prescription = await DialysisPrescription.findOne({ patientId: patient.patientId, status: PRESCRIPTION_STATUS.ACTIVE }).sort({ prescribedAt: -1 });
  if (!prescription) throw new BadRequestError('No active dialysis prescription — the nephrologist must prescribe before generating sessions');

  const horizonDays = payload.horizonDays || schedule.generateHorizonDays || 28;
  // normalise the window to whole days so repeated generation is idempotent
  const through = endOfLocalDay(payload.through ? startOfLocalDay(payload.through) : new Date(Date.now() + horizonDays * 86400000));

  const occurrences = computeOccurrences(schedule, null, through);
  const first = occurrences[0] ? startOfLocalDay(occurrences[0]) : new Date();
  const last = occurrences.length ? endOfLocalDay(occurrences[occurrences.length - 1]) : through;
  const existing = await DialysisSession.find({
    scheduleId: schedule._id,
    sessionDate: { $gte: first, $lt: last },
  }).select('sessionDate').lean();
  const taken = new Set(existing.map((s) => new Date(s.sessionDate).toDateString()));

  const created = [];
  const skipped = [];
  let sequence = (await DialysisSession.countDocuments({ scheduleId: schedule._id })) + 1;

  for (const day of occurrences) {
    if (taken.has(day.toDateString())) {
      skipped.push(day);
      // eslint-disable-next-line no-continue
      continue;
    }
    const startAt = atTime(day, schedule.timeOfDay);
    const end = new Date(startAt.getTime() + schedule.slotDurationMinutes * 60000);

    // preferred resources first, auto-allocate when they are not free
    let machine = null;
    let station = null;
    if (schedule.preferredMachineId) {
      const m = await DialysisMachine.findById(schedule.preferredMachineId);
      if (m && m.active && [MACHINE_STATUS.AVAILABLE, MACHINE_STATUS.RESERVED].includes(m.status)) machine = m;
    }
    if (!machine) machine = await pickFreeMachine({ at: startAt, durationMinutes: schedule.slotDurationMinutes, machineType: prescription.modality });
    if (schedule.preferredStationId) {
      const st = await DialysisStation.findById(schedule.preferredStationId);
      if (st && [STATION_STATUS.AVAILABLE, STATION_STATUS.RESERVED].includes(st.status)) station = st;
    } else if (machine?.stationId) {
      station = await DialysisStation.findById(machine.stationId);
    }

    // a generated sitting never overwrites an existing booking
    const conflicting = await findClashes({
      patientId: patient.patientId,
      machineId: machine?._id,
      stationId: station?._id,
      start: startAt,
      end,
    });
    const resourceTaken = conflicting.some((c) => String(c.machineId) === String(machine?._id)
      || String(c.stationId) === String(station?._id));
    if (resourceTaken) { machine = null; station = null; }
    const patientBusy = conflicting.some((c) => String(c.patientId) === String(patient.patientId));

    const doc = await DialysisSession.create({
      sessionNumber: await generateNumber('DSS', new Date().getFullYear()),
      sessionDate: startAt,
      patientId: patient.patientId,
      dialysisPatientId: patient._id,
      scheduleId: schedule._id,
      isRecurring: true,
      scheduleSequence: sequence,
      frequencyPerWeek: schedule.frequencyPerWeek,
      prescriptionId: prescription._id,
      prescriptionSnapshot: buildSnapshot(prescription),
      machineId: machine?._id,
      stationId: station?._id,
      shift: schedule.preferredShift,
      priority: patient.specialNeeds ? SESSION_PRIORITY.URGENT : SESSION_PRIORITY.ROUTINE,
      scheduledAt: startAt,
      scheduledStart: startAt,
      scheduledEnd: end,
      slotDurationMinutes: schedule.slotDurationMinutes,
      timeOfDay: schedule.timeOfDay,
      doctorId: schedule.doctorId || patient.nephrologistId,
      nurseId: schedule.nurseId,
      technicianId: schedule.technicianId,
      ufGoalMl: prescription.ultrafiltrationGoalMl,
      bloodFlowRate: prescription.bloodFlowRate,
      dialysateFlowRate: prescription.dialysateFlowRate,
      // a generated sitting with no free resource waits for the slot desk
      status: machine && !patientBusy ? SESSION_STATUS.SCHEDULED : SESSION_STATUS.REQUESTED,
      requestedAt: machine && !patientBusy ? undefined : new Date(),
      statusHistory: [{
        from: null,
        to: machine && !patientBusy ? SESSION_STATUS.SCHEDULED : SESSION_STATUS.REQUESTED,
        at: new Date(),
        by: actor?.id,
        note: `Generated from recurring schedule ${schedule.scheduleNumber}`,
      }],
      notes: `Recurring ${schedule.patternLabel || schedule.daysOfWeek.join('/')}`,
      hospitalId: schedule.hospitalId,
      branchId: schedule.branchId,
    });

    created.push(doc);
    schedule.generatedSessionIds.push(doc._id);
    sequence += 1;
  }

  const next = occurrences.find((d) => d > new Date()) || null;
  schedule.totalGenerated = await DialysisSession.countDocuments({ scheduleId: schedule._id });
  schedule.lastGeneratedAt = new Date();
  schedule.nextSessionDate = next || schedule.nextSessionDate;
  await schedule.save();

  if (created.length) {
    patient.totalSessions += created.length;
    const earliest = created.reduce((min, s) => (s.scheduledStart < min ? s.scheduledStart : min), created[0].scheduledStart);
    if (!patient.nextSessionAt || patient.nextSessionAt > earliest) patient.nextSessionAt = earliest;
    await patient.save();
  }

  await writeAudit({
    user: actor, action: 'DIALYSIS_RECURRING_GENERATE', module: 'dialysis', entityId: schedule._id, entityType: 'DialysisSchedule',
    data: { scheduleNumber: schedule.scheduleNumber, generated: created.length, skipped: skipped.length, through },
  });
  emitDialysis('sessions_generated', { scheduleId: schedule._id, count: created.length });
  return {
    schedule: await getRecurringSchedule(schedule._id),
    generated: created.map((s) => s.toObject()),
    skipped: skipped.map((d) => d.toISOString()),
  };
};

export const updateRecurringSchedule = async (id, payload, actor) => {
  const schedule = await DialysisSchedule.findById(id);
  if (!schedule) throw new NotFoundError('Recurring schedule not found');
  if (schedule.status === RECURRING_STATUS.CANCELLED) throw new BadRequestError('A cancelled recurring schedule cannot be edited');

  const before = schedule.toObject();
  const editable = ['startDate', 'endDate', 'timeOfDay', 'slotDurationMinutes', 'preferredShift', 'frequencyPerWeek',
    'daysOfWeek', 'patternCode', 'patternLabel', 'preferredMachineId', 'preferredStationId', 'doctorId',
    'nurseId', 'technicianId', 'notes', 'autoGenerate', 'generateHorizonDays', 'status'];
  editable.forEach((k) => {
    if (payload[k] === undefined) return;
    if (k === 'startDate' || k === 'endDate') schedule[k] = payload[k] ? new Date(payload[k]) : undefined;
    else schedule[k] = payload[k];
  });
  if (payload.status && !Object.values(RECURRING_STATUS).includes(payload.status)) throw new BadRequestError('Invalid recurring schedule status');
  if (payload.daysOfWeek) schedule.daysOfWeek = readDaysOfWeek(payload.daysOfWeek);
  if (schedule.endDate && schedule.endDate < schedule.startDate) throw new BadRequestError('The end date cannot be before the start date');

  if (payload.status === RECURRING_STATUS.CANCELLED) schedule.statusReason = payload.statusReason;
  await schedule.save();

  const changes = {};
  editable.forEach((k) => {
    if (JSON.stringify(before[k]) !== JSON.stringify(schedule[k])) changes[k] = { from: before[k], to: schedule[k] };
  });
  if (Object.keys(changes).length) {
    await writeAudit({
      user: actor, action: 'DIALYSIS_RECURRING_UPDATE', module: 'dialysis', entityId: id, entityType: 'DialysisSchedule',
      data: { scheduleNumber: schedule.scheduleNumber, before: changes, changedFields: Object.keys(changes) },
    });
  }
  return getRecurringSchedule(id);
};

// ============================================================
// 4. VISUAL SLOT BOARD (spec 10)
// ============================================================
export const slotBoard = async (date) => {
  const config = await getDialysisConfig();
  const day = startOfLocalDay(date);
  const dayEnd = endOfLocalDay(date);

  const [stations, sessions, machines] = await Promise.all([
    DialysisStation.find({ active: true }).sort({ code: 1 }).lean(),
    DialysisSession.find({ sessionDate: { $gte: day, $lt: dayEnd } })
      .populate('patientId', 'uhid firstName lastName')
      .populate('dialysisPatientId', 'dialysisNumber')
      .populate('machineId', 'code')
      .populate('doctorId', 'name')
      .populate('nurseId', 'name')
      .populate('scheduleId', 'scheduleNumber patternLabel')
      .sort({ scheduledStart: 1 })
      .lean(),
    DialysisMachine.find({ active: true }).populate('stationId', 'code name').sort({ code: 1 }).lean(),
  ]);

  // A cancelled or no-show sitting holds no bay and no machine. Leaving it in
  // the grid made the desk read a free bay as booked, and inflated the counts.
  // Completed sessions are still shown, because on a past date they really did
  // occupy that bay.
  const HOLDS_RESOURCE = [SESSION_STATUS.CANCELLED, SESSION_STATUS.NO_SHOW];
  const occupying = sessions.filter((s) => !HOLDS_RESOURCE.includes(s.status));

  // a hospital may pin exactly which bays appear as grid columns
  const pinned = (config.slotGrid.stationIds || []).map(String);
  const visible = pinned.length
    ? stations.filter((s) => pinned.includes(String(s._id)))
    : stations.slice(0, config.slotGrid.visibleStations || 6);

  const startMin = timeToMinutes(config.slotGrid.dayStart);
  const endMin = timeToMinutes(config.slotGrid.dayEnd);
  const step = Math.max(15, config.slotGrid.slotMinutes || 60);

  const rowTimes = [];
  for (let m = startMin; m <= endMin; m += step) rowTimes.push(minutesToTime(m));

  const unplaced = occupying.filter((s) => !s.stationId || !visible.some((v) => String(v._id) === String(s.stationId)));

  return {
    date: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`,
    updatedAt: new Date().toISOString(),
    config: {
      dayStart: config.slotGrid.dayStart,
      dayEnd: config.slotGrid.dayEnd,
      slotMinutes: step,
      shifts: config.scheduling.shifts,
      visibleStations: visible.length,
    },
    stations: visible.map((s) => {
      const installed = machines.find((m) => String(m.stationId?._id) === String(s._id));
      return {
        id: s._id, code: s.code, name: s.name, area: s.area, status: s.status,
        machineId: installed?._id || null, machineCode: installed?.code || null, machineStatus: installed?.status || null,
        sessionCount: occupying.filter((x) => String(x.stationId) === String(s._id)).length,
      };
    }),
    freeMachines: machines.filter((m) => ['AVAILABLE', 'RESERVED'].includes(m.status) && !m.stationId).map((m) => ({ id: m._id, code: m.code, machineType: m.machineType, status: m.status })),
    grid: rowTimes.map((time) => {
      const rowStart = atTime(day, time);
      const rowEnd = new Date(rowStart.getTime() + step * 60000);
      return {
        time,
        shift: (config.scheduling.shifts || []).find((sh) => {
          const s = timeToMinutes(sh.startTime);
          const e = timeToMinutes(sh.endTime);
          const t = timeToMinutes(time);
          return e > s ? t >= s && t < e : t >= s || t < e;
        })?.code || null,
        cells: visible.map((station) => {
          const session = occupying.find((s) => String(s.stationId) === String(station._id)
            && new Date(s.scheduledStart) < rowEnd
            && new Date(s.scheduledEnd || new Date(new Date(s.scheduledStart).getTime() + (s.slotDurationMinutes || 240) * 60000)) > rowStart);
          return { stationId: station._id, session: session ? sessionCard(session) : null };
        }),
      };
    }),
    unplaced: unplaced.map(sessionCard),
    summary: {
      total: sessions.length,
      booked: occupying.length,
      requested: sessions.filter((s) => s.status === SESSION_STATUS.REQUESTED).length,
      scheduled: sessions.filter((s) => s.status === SESSION_STATUS.SCHEDULED).length,
      confirmed: sessions.filter((s) => s.status === SESSION_STATUS.CONFIRMED).length,
      inProgress: sessions.filter((s) => [SESSION_STATUS.CHECKED_IN, SESSION_STATUS.WAITING, SESSION_STATUS.PRE_ASSESSED,
        SESSION_STATUS.READY, SESSION_STATUS.CONNECTED, SESSION_STATUS.IN_PROGRESS].includes(s.status)).length,
      completed: sessions.filter((s) => ['COMPLETED', 'BILLED', 'CLOSED'].includes(s.status)).length,
      cancelled: sessions.filter((s) => [SESSION_STATUS.CANCELLED, SESSION_STATUS.NO_SHOW].includes(s.status)).length,
      unplaced: unplaced.length,
    },
  };
};

const sessionCard = (s) => ({
  id: s._id,
  sessionNumber: s.sessionNumber,
  status: s.status,
  priority: s.priority,
  isEmergency: s.isEmergency,
  isRecurring: s.isRecurring,
  scheduleId: s.scheduleId?._id || s.scheduleId || null,
  scheduleNumber: s.scheduleId?.scheduleNumber || null,
  patient: `${s.patientId?.firstName || ''} ${s.patientId?.lastName || ''}`.trim(),
  uhid: s.patientId?.uhid,
  dialysisNumber: s.dialysisPatientId?.dialysisNumber,
  doctor: s.doctorId?.name || null,
  nurse: s.nurseId?.name || null,
  machineCode: s.machineId?.code || null,
  stationCode: s.stationId?.code || null,
  timeOfDay: s.timeOfDay,
  scheduledStart: s.scheduledStart,
  scheduledEnd: s.scheduledEnd,
  durationMinutes: s.slotDurationMinutes,
  rescheduleCount: s.rescheduleCount || 0,
});

export { BLOCKING_STATUSES, assertNoClash, computeOccurrences, atTime, resolveDoctor, buildSnapshot };
