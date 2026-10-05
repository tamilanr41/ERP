import Appointment, { APPOINTMENT_STATUS } from '../models/Appointment.model.js';
import OpdVisit from '../models/OpdVisit.model.js';

const ACTIVE = new Set([
  APPOINTMENT_STATUS.REQUESTED,
  APPOINTMENT_STATUS.CONFIRMED,
  APPOINTMENT_STATUS.ARRIVED,
  APPOINTMENT_STATUS.CHECKED_IN,
  APPOINTMENT_STATUS.WAITING,
  APPOINTMENT_STATUS.IN_CONSULTATION,
  APPOINTMENT_STATUS.SKIPPED,
  APPOINTMENT_STATUS.SCHEDULED,
  APPOINTMENT_STATUS.IN_PROGRESS,
]);

const WAITING_STATUSES = [APPOINTMENT_STATUS.CHECKED_IN, APPOINTMENT_STATUS.WAITING];
const CONSULTING_STATUSES = [APPOINTMENT_STATUS.IN_CONSULTATION, APPOINTMENT_STATUS.IN_PROGRESS];

const minutesBetween = (a, b) => Math.max(0, Math.round((b - a) / 60000));

const computeAge = (dob, now = new Date()) => {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth)) return null;
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age < 0 ? 0 : age;
};

export const getQueueBoard = async ({ date, doctorId, departmentId } = {}) => {
  const start = date ? new Date(date) : new Date();
  if (isNaN(start)) start.setTime(Date.now());
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  const filter = {
    date: { $gte: start, $lt: end },
    status: { $nin: [APPOINTMENT_STATUS.CANCELLED, APPOINTMENT_STATUS.NO_SHOW] },
  };
  if (doctorId) filter.doctorId = doctorId;
  if (departmentId) filter.departmentId = departmentId;

  const today = new Date();
  const appointments = await Appointment.find(filter)
    .populate('patientId', 'uhid firstName lastName gender mobile photo dateOfBirth')
    .populate('doctorId', 'name specialization doctorCode consultationFee')
    .sort({ tokenNumber: 1 });

  const visitMap = new Map();
  const appointmentIds = appointments.map((a) => a._id);
  if (appointmentIds.length) {
    const visits = await OpdVisit.find({ appointmentId: { $in: appointmentIds } }).select('appointmentId opdNumber visitType');
    for (const v of visits) visitMap.set(String(v.appointmentId), v);
  }

  const byDoctor = new Map();

  for (const apt of appointments) {
    const doctor = apt.doctorId;
    const key = doctor?._id ? String(doctor._id) : 'unassigned';
    if (!byDoctor.has(key)) {
      byDoctor.set(key, {
        doctorId: doctor?._id || null,
        name: doctor?.name || 'Unassigned',
        specialization: doctor?.specialization || '—',
        code: doctor?.doctorCode || '',
        consultationFee: doctor?.consultationFee || 0,
        counts: { scheduled: 0, confirmed: 0, checkedIn: 0, inProgress: 0, completed: 0, skipped: 0 },
        items: [],
      });
    }
    const bucket = byDoctor.get(key);

    const visit = visitMap.get(String(apt._id));
    const waitMinutes =
      apt.checkedInAt && [...WAITING_STATUSES, ...CONSULTING_STATUSES].includes(apt.status)
        ? minutesBetween(apt.checkedInAt, today)
        : null;

    bucket.items.push({
      _id: apt._id,
      appointmentNumber: apt.appointmentNumber,
      tokenNumber: apt.tokenNumber,
      time: apt.time,
      status: apt.status,
      type: apt.type,
      visitType: visit?.visitType || apt.visitType,
      opdNumber: visit?.opdNumber || null,
      checkedInAt: apt.checkedInAt,
      arrivalAt: apt.checkedInAt || apt.createdAt,
      waitMinutes,
      age: computeAge(apt.patientId?.dateOfBirth),
      patient: apt.patientId && {
        _id: apt.patientId._id,
        uhid: apt.patientId.uhid,
        firstName: apt.patientId.firstName,
        lastName: apt.patientId.lastName,
        gender: apt.patientId.gender,
        mobile: apt.patientId.mobile,
      },
    });

    bucket.counts[apt.status.toLowerCase()] = (bucket.counts[apt.status.toLowerCase()] || 0) + 1;
  }

  const doctors = Array.from(byDoctor.values())
    .map((d) => {
      const activeItems = d.items.filter((i) => [...WAITING_STATUSES, ...CONSULTING_STATUSES].includes(i.status));
      const consulting = d.items.find((i) => CONSULTING_STATUSES.includes(i.status));
      const next = d.items.find((i) => i.status === APPOINTMENT_STATUS.WAITING);
      const waitingCount = d.items.filter((i) => WAITING_STATUSES.includes(i.status)).length;
      const avgWaitMinutes = activeItems.length
        ? Math.round(activeItems.reduce((sum, i) => sum + (i.waitMinutes || 0), 0) / activeItems.length)
        : 0;
      return {
        ...d,
        total: d.items.length,
        currentToken: consulting?.tokenNumber ?? next?.tokenNumber ?? null,
        currentItem: consulting || next || null,
        nextToken: next?.tokenNumber ?? null,
        waitingCount,
        avgWaitMinutes,
        avgWaitLabel: avgWaitMinutes ? `${avgWaitMinutes} min` : '—',
      };
    })
    .filter((d) => d.items.length > 0);

  const summary = {
    requested: appointments.filter((a) => a.status === APPOINTMENT_STATUS.REQUESTED).length,
    confirmed: appointments.filter((a) => a.status === APPOINTMENT_STATUS.CONFIRMED).length,
    arrived: appointments.filter((a) => a.status === APPOINTMENT_STATUS.ARRIVED).length,
    scheduled: appointments.filter((a) => a.status === APPOINTMENT_STATUS.SCHEDULED).length,
    checkedIn: appointments.filter((a) => a.status === APPOINTMENT_STATUS.CHECKED_IN).length,
    waiting: appointments.filter((a) => a.status === APPOINTMENT_STATUS.WAITING).length,
    skipped: appointments.filter((a) => a.status === APPOINTMENT_STATUS.SKIPPED).length,
    inConsultation: appointments.filter((a) => CONSULTING_STATUSES.includes(a.status)).length,
    completed: appointments.filter((a) => a.status === APPOINTMENT_STATUS.COMPLETED).length,
  };
  const waitingForCheckIn =
    summary.requested +
    summary.confirmed +
    summary.arrived +
    summary.scheduled;
  const active = appointments.filter((a) => [...WAITING_STATUSES, ...CONSULTING_STATUSES].includes(a.status) && a.checkedInAt);
  const avgWaitMinutes = active.length ? Math.round(active.reduce((sum, a) => sum + minutesBetween(a.checkedInAt, today), 0) / active.length) : 0;

  const consultingG = appointments.find((a) => CONSULTING_STATUSES.includes(a.status));
  const nextWaitingG = appointments.find((a) => a.status === APPOINTMENT_STATUS.WAITING);

  return {
    date: [
      start.getFullYear(),
      String(start.getMonth() + 1).padStart(2, '0'),
      String(start.getDate()).padStart(2, '0'),
    ].join('-'),
    updatedAt: new Date().toISOString(),
    summary: {
      ...summary,
      waitingForCheckIn,
      activeWaiters: active.length,
      avgWaitMinutes,
      currentToken: consultingG?.tokenNumber ?? nextWaitingG?.tokenNumber ?? null,
      nextToken: nextWaitingG?.tokenNumber ?? null,
    },
    totalDoctors: doctors.length,
    doctors,
  };
};