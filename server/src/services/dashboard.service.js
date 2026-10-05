import mongoose from 'mongoose';
import Patient from '../models/Patient.model.js';
import Appointment from '../models/Appointment.model.js';
import IpdAdmission, { ADMISSION_STATUS } from '../models/IpdAdmission.model.js';
import { Bed, BED_STATUS } from '../models/Bed.model.js';
import OpdVisit, { OPD_OPEN_STATES, OPD_CLOSED_STATES } from '../models/OpdVisit.model.js';
import Emergency from '../models/Emergency.model.js';
import PharmacySale from '../models/PharmacySale.model.js';
import LabResult from '../models/LabOrder.model.js';
import InsuranceClaim from '../models/Insurance.model.js';
import { collectionSummary } from './billing.service.js';
import { getExpiringMedicines, getLowStock } from './pharmacy.service.js';
import User from '../models/User.model.js';
import Bill from '../models/Bill.model.js';
import LabOrder from '../models/LabOrder.model.js';

const dateRange = ({ from, to }) => {
  const start = from ? new Date(from) : new Date(new Date().setHours(0, 0, 0, 0));
  const end = to ? new Date(new Date(to).setHours(23, 59, 59, 999)) : new Date(new Date().setHours(23, 59, 59, 999));
  return { start, end };
};

const dayBuckets = (start, end) => {
  const buckets = [];
  const cur = new Date(start);
  while (cur <= end) {
    const next = new Date(cur);
    next.setDate(next.getDate() + 1);
    buckets.push({ key: cur.toISOString().slice(0, 10), start: new Date(cur), end: next });
    cur.setDate(cur.getDate() + 1);
  }
  return buckets;
};

export const adminDashboard = async (query = {}) => {
  const { start, end } = dateRange(query);

  const [
    totalPatients,
    totalAppointments,
    completedOPD,
    currentIPD,
    admissions,
    discharges,
    emergencyCount,
    availableBeds,
    occupiedBeds,
    bedTotals,
    collection,
    pharmacySales,
    labVerified,
    radiologyPending,
    insurancePending,
    staffCount,
    lowStock,
    expiring,
  ] = await Promise.all([
    Patient.countDocuments({ deletedAt: null, status: { $ne: 'MERGED' } }),
    Appointment.countDocuments({ date: { $gte: start, $lt: end } }),
    OpdVisit.countDocuments({ visitDate: { $gte: start, $lt: end }, status: { $in: ['COMPLETED', 'IN_CONSULTATION', 'ADMITTED', 'REFERRED'] } }),
    IpdAdmission.countDocuments({ status: ADMISSION_STATUS.ADMITTED }),
    IpdAdmission.countDocuments({ admittedAt: { $gte: start, $lt: end } }),
    IpdAdmission.countDocuments({ dischargedAt: { $gte: start, $lt: end } }),
    Emergency.countDocuments({ registeredAt: { $gte: start, $lt: end } }),
    Bed.countDocuments({ status: { $in: [BED_STATUS.AVAILABLE, BED_STATUS.CLEANING] } }),
    Bed.countDocuments({ status: BED_STATUS.OCCUPIED }),
    Bed.countDocuments({}),
    collectionSummary({ from: start, to: end }),
    PharmacySale.aggregate([{ $match: { saleDate: { $gte: start, $lt: end }, status: 'COMPLETED' } }, { $group: { _id: null, total: { $sum: '$netTotal' }, count: { $sum: 1 } } }]),
    LabResult.aggregate([{ $match: { verifiedAt: { $gte: start, $lt: end } } }, { $count: 'n' }]),
    (async () => {
      const radiologyModule = await import('../models/RadiologyOrder.model.js');
      return radiologyModule.default.countDocuments({ status: { $in: ['ORDERED', 'SCHEDULED', 'SCANNED', 'REPORT_ENTERED'] } });
    })(),
    InsuranceClaim.countDocuments({ status: { $in: ['SUBMITTED', 'APPROVED', 'PARTIALLY_APPROVED', 'DRAFT'] } }),
    User.countDocuments({ status: 'ACTIVE' }),
    getLowStock(),
    getExpiringMedicines(90),
  ]);

  return {
    metrics: {
      totalPatients,
      totalAppointments,
      completedOPD,
      currentIPD,
      admissions,
      discharges,
      emergencyCount,
      beds: {
        total: bedTotals,
        available: availableBeds,
        occupied: occupiedBeds,
        occupancyPct: bedTotals ? Math.round((occupiedBeds / bedTotals) * 100) : 0,
      },
      collection: collection.total,
      collectionTransactions: collection.transactions,
      pharmacySales: pharmacySales[0]?.total || 0,
      pharmacySalesCount: pharmacySales[0]?.count || 0,
      labVerified: labVerified[0]?.n || 0,
      radiologyPending,
      insurancePending,
      staffCount,
      lowStockCount: lowStock.length,
      expiringCount: expiring.length,
      pendingPayments: 0,
    },
    lowStock,
    expiring: expiring.slice(0, 10),
    collectionBreakdown: collection.byMode,
    paymentMode: collection.byMode,
  };
};

export const opdDashboard = async (query = {}) => {
  const { start, end } = dateRange(query);
  const PENDING_LAB = ['ORDERED', 'BILLED', 'SAMPLE_COLLECTED', 'PROCESSING', 'RESULT_ENTERED'];
  const OPEN_QUEUE_STATES = OPD_OPEN_STATES;
  const CLOSED_QUEUE_STATES = OPD_CLOSED_STATES;

  const [
    totalOPD,
    appointmentVisits,
    walkedInVisits,
    openVisits,
    waitingVisits,
    calledVisits,
    inConsultationVisits,
    readyForConsult,
    completedVisits,
    admittedVisits,
    referredVisits,
    visitNoShows,
    appointmentsBooked,
    pendingBilling,
    pendingInvestigations,
    followUps,
    registeredToday,
    collection,
    visits,
  ] = await Promise.all([
    OpdVisit.countDocuments({ visitDate: { $gte: start, $lt: end } }),
    OpdVisit.countDocuments({ visitDate: { $gte: start, $lt: end }, appointmentId: { $ne: null } }),
    OpdVisit.countDocuments({ visitDate: { $gte: start, $lt: end }, visitType: 'WALK_IN' }),
    // Still open in the department: waiting, called or mid-consultation.
    OpdVisit.countDocuments({ visitDate: { $gte: start, $lt: end }, status: { $in: OPEN_QUEUE_STATES } }),
    OpdVisit.countDocuments({ visitDate: { $gte: start, $lt: end }, status: 'WAITING' }),
    OpdVisit.countDocuments({ visitDate: { $gte: start, $lt: end }, status: 'CALLED' }),
    OpdVisit.countDocuments({ visitDate: { $gte: start, $lt: end }, status: 'IN_CONSULTATION' }),
    // Vitals done and not yet seen. This is the number that tells a clerk the
    // doctor is actually blocked, which "open minus in consultation" does not.
    OpdVisit.countDocuments({
      visitDate: { $gte: start, $lt: end },
      status: { $in: ['WAITING', 'CALLED'] },
      vitalsStatus: 'COMPLETED',
    }),
    OpdVisit.countDocuments({ visitDate: { $gte: start, $lt: end }, status: { $in: CLOSED_QUEUE_STATES } }),
    OpdVisit.countDocuments({ visitDate: { $gte: start, $lt: end }, status: 'ADMITTED' }),
    OpdVisit.countDocuments({ visitDate: { $gte: start, $lt: end }, status: 'REFERRED' }),
    OpdVisit.countDocuments({ visitDate: { $gte: start, $lt: end }, status: 'NO_SHOW' }),
    Appointment.countDocuments({ date: { $gte: start, $lt: end }, status: { $nin: ['CANCELLED', 'NO_SHOW'] } }),
    Bill.countDocuments({ status: { $in: ['FINAL', 'PARTIALLY_PAID'] }, dueAmount: { $gt: 0 } }),
    LabOrder.countDocuments({ status: { $in: PENDING_LAB } }),
    OpdVisit.countDocuments({ followUpDate: { $gte: start } }),
    Patient.countDocuments({ createdAt: { $gte: start, $lt: end } }),
    collectionSummary({ from: start, to: end }),
    OpdVisit.find({ visitDate: { $gte: start, $lt: end } })
      .populate('patientId', 'uhid firstName lastName mobile gender photo age')
      .populate('doctorId', 'name specialization')
      .populate('departmentId', 'name')
      .sort({ visitDate: -1 })
      .limit(8),
  ]);

  const pad = (n) => String(n).padStart(2, '0');
  const localDate = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;

  return {
    date: localDate,
    metrics: {
      totalOPD,
      appointments: appointmentVisits,
      walkins: walkedInVisits,
      open: openVisits,
      waiting: waitingVisits,
      called: calledVisits,
      inConsultation: inConsultationVisits,
      readyForConsult,
      completed: completedVisits,
      admitted: admittedVisits,
      referred: referredVisits,
      // OPD absences plus missed appointments, so the tile matches what a
      // supervisor means by "no-shows" rather than one half of it.
      noShow: visitNoShows + (await Appointment.countDocuments({ date: { $gte: start, $lt: end }, status: 'NO_SHOW' })),
      appointmentsBooked,
      pendingBilling,
      pendingInvestigations,
      followUps,
      registeredToday,
      collection: collection.total,
    },
    recentVisits: visits,
  };
};

export const revenueTrend = async (query = {}) => {
  const { start, end } = dateRange(query);
  const Bill = (await import('../models/Bill.model.js')).default;
  const buckets = dayBuckets(start, end);

  const rows = await Bill.aggregate([
    { $match: { billDate: { $gte: start, $lt: end }, status: { $nin: ['DRAFT', 'CANCELLED'] } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$billDate' } }, revenue: { $sum: '$netTotal' }, count: { $sum: 1 } } },
  ]);
  const map = Object.fromEntries(rows.map((r) => [r._id, r]));

  return buckets.map((b) => ({
    date: b.key,
    revenue: map[b.key]?.revenue || 0,
    count: map[b.key]?.count || 0,
  }));
};

export const opdVsIpd = async (query = {}) => {
  const { start, end } = dateRange(query);
  const buckets = dayBuckets(start, end);
  const [opd, ipd] = await Promise.all([
    OpdVisit.aggregate([{ $match: { visitDate: { $gte: start, $lt: end } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$visitDate' } }, count: { $sum: 1 } } }]),
    IpdAdmission.aggregate([{ $match: { admittedAt: { $gte: start, $lt: end } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$admittedAt' } }, count: { $sum: 1 } } }]),
  ]);
  const opdMap = Object.fromEntries(opd.map((r) => [r._id, r.count]));
  const ipdMap = Object.fromEntries(ipd.map((r) => [r._id, r.count]));
  return buckets.map((b) => ({ date: b.key, opd: opdMap[b.key] || 0, ipd: ipdMap[b.key] || 0 }));
};

export const departmentRevenue = async (query = {}) => {
  const { start, end } = dateRange(query);
  const Bill = (await import('../models/Bill.model.js')).default;
  const rows = await Bill.aggregate([
    { $match: { billDate: { $gte: start, $lt: end }, status: { $nin: ['DRAFT', 'CANCELLED'] } } },
    { $group: { _id: '$billType', revenue: { $sum: '$netTotal' }, count: { $sum: 1 } } },
    { $sort: { revenue: -1 } },
  ]);
  return rows;
};

export const bedOccupancyTrend = async (query = {}) => {
  const { Bed } = await import('../models/Bed.model.js');
  const rows = await Bed.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
  return rows;
};

export const doctorDashboard = async (query, actor) => {
  const { start, end } = dateRange(query);
  const doctorId = actor?.doctorId;
  if (!doctorId) return { note: 'No linked doctor account', metrics: {} };

  const [todayAppointments, waiting, ipdPatients, emergencyCount, followUps] = await Promise.all([
    Appointment.countDocuments({ doctorId, date: { $gte: new Date(new Date().setHours(0, 0, 0, 0)), $lt: new Date(new Date().setHours(23, 59, 59, 999)) }, status: { $nin: ['CANCELLED', 'NO_SHOW'] } }),
    Appointment.countDocuments({ doctorId, date: { $gte: new Date(new Date().setHours(0, 0, 0, 0)), $lt: new Date(new Date().setHours(23, 59, 59, 999)) }, status: { $in: ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN'] } }),
    IpdAdmission.countDocuments({ consultantDoctorId: doctorId, status: ADMISSION_STATUS.ADMITTED }),
    Emergency.countDocuments({ assignedDoctorId: doctorId, status: { $in: ['REGISTERED', 'TRIAGED', 'IN_TREATMENT'] } }),
    OpdVisit.countDocuments({ doctorId, followUpDate: { $gte: start, $lte: end } }),
  ]);

  return { metrics: { todayAppointments, waiting, ipdPatients, emergencyCount, followUps } };
};

export const pharmacyDashboard = async (query = {}) => {
  const { start, end } = dateRange(query);
  const sales = await PharmacySale.aggregate([
    { $match: { saleDate: { $gte: start, $lt: end }, status: 'COMPLETED' } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$saleDate' } }, revenue: { $sum: '$netTotal' }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  const lowStock = await getLowStock();
  const expiring = await getExpiringMedicines(60);
  return { sales, lowStock, expiring, metrics: { lowStock: lowStock.length, expiring: expiring.length } };
};

export const labDashboard = async (query = {}) => {
  const { start, end } = dateRange(query);
  const LabOrder = (await import('../models/LabOrder.model.js')).default;
  const [orders, pending, verified] = await Promise.all([
    LabOrder.countDocuments({ orderedAt: { $gte: start, $lt: end }, status: { $nin: ['CANCELLED'] } }),
    LabOrder.countDocuments({ status: { $in: ['ORDERED', 'BILLED', 'SAMPLE_COLLECTED', 'PROCESSING', 'RESULT_ENTERED'] } }),
    LabOrder.countDocuments({ status: 'VERIFIED', orderedAt: { $gte: start, $lt: end } }),
  ]);
  return { metrics: { orders, pending, verified } };
};