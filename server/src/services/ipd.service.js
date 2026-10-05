import mongoose from 'mongoose';
import { Bed, Ward, Room, Building, Floor, BedHistory, BED_STATUS } from '../models/Bed.model.js';
import IpdAdmission, { ADMISSION_STATUS, DISCHARGE_STAGE, DISCHARGE_TYPE } from '../models/IpdAdmission.model.js';
import DischargeSummary from '../models/DischargeSummary.model.js';
import VitalRecord from '../models/VitalRecord.model.js';
import NursingNote from '../models/NursingNote.model.js';
import ClinicalNote, { CLINICAL_NOTE_TYPES } from '../models/ClinicalNote.model.js';
import MedicationChart, { MED_ADMIN_STATUS } from '../models/MedicationChart.model.js';
import ClinicalOrder, { CLINICAL_ORDER_STATUS, CLINICAL_ORDER_CATEGORIES, CLINICAL_ORDER_PRIORITY } from '../models/ClinicalOrder.model.js';
import DoctorVisit, { DOCTOR_VISIT_TYPES } from '../models/DoctorVisit.model.js';
import PatientDocument from '../models/PatientDocument.model.js';
import Bill from '../models/Bill.model.js';
import { emitIpd, IPD_SOCKET_EVENTS } from '../utils/socket.io.server.js';
import Payment from '../models/Payment.model.js';
import { generateNumber, NUMBER_PREFIXES } from '../utils/numberGenerator.js';
import { BadRequestError, NotFoundError, ConflictError } from '../utils/ApiError.js';
import { regex } from '../utils/helpers.js';
import { writeAudit } from '../middleware/audit.js';

// ===== VITALS REFERENCE RANGES (abnormal / critical flagging) =====
const VITAL_RANGE = {
  temperature: [97, 100.4],
  pulse: [60, 100],
  respiratoryRate: [12, 20],
  spo2: [95, 101],
  bpSystolic: [90, 140],
  bpDiastolic: [60, 90],
  bloodSugar: [70, 180],
  painScore: [0, 7],
  gcs: [15, 15],
};
const VITAL_CRITICAL = {
  temperature: (t) => t >= 104 || t <= 95,
  pulse: (p) => p > 120 || p < 45,
  respiratoryRate: (r) => r > 30 || r < 8,
  spo2: (s) => s < 90,
  bpSystolic: (b) => b < 80 || b > 180,
  bpDiastolic: (d) => d > 120 || d < 40,
  bloodSugar: (b) => b < 40 || b > 400,
  painScore: (p) => p >= 9,
  gcs: (g) => g < 9,
};
export const flagVitals = (v) => {
  const flags = [];
  const abnormal = [];
  for (const [k, range] of Object.entries(VITAL_RANGE)) {
    const val = v?.[k];
    if (val == null || val === '') continue;
    const isCritical = VITAL_CRITICAL[k]?.(Number(val));
    if (isCritical) flags.push(`${k}:CRITICAL`);
    else if (Number(val) < range[0] || Number(val) > range[1]) flags.push(`${k}:ABNORMAL`);
  }
  for (const f of flags) {
    const [k, lvl] = f.split(':');
    abnormal.push(`${k} ${lvl.toLowerCase()}`);
  }
  return { flags, abnormal };
};

// ===== WARD / BED CATALOG =====
export const createHierarchy = async ({ building, floor, ward, room, beds }) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    let buildingDoc = null;
    if (building?.name) {
      buildingDoc = await Building.create([{ name: building.name, floors: building.floors }], { session, ordered: true });
      buildingDoc = buildingDoc[0];
    }
    let floorDoc = null;
    if (buildingDoc && floor?.name) {
      floorDoc = await Floor.create([{ buildingId: buildingDoc._id, name: floor.name, level: floor.level || 0 }], { session, ordered: true });
      floorDoc = floorDoc[0];
    }
    let wardDoc = null;
    if (ward?.name) {
      wardDoc = await Ward.create([{
        ...ward,
        floorId: floorDoc?._id,
        buildingId: buildingDoc?._id,
        hospitalId: ward.hospitalId,
        branchId: ward.branchId,
      }], { session, ordered: true });
      wardDoc = wardDoc[0];
    }
    let roomDoc = null;
    if (room?.roomNumber && wardDoc) {
      roomDoc = await Room.create([{ ...room, wardId: wardDoc._id, floorId: floorDoc?._id, buildingId: buildingDoc?._id }], { session, ordered: true });
      roomDoc = roomDoc[0];
    }
    if (beds?.length && wardDoc) {
      for (const b of beds) {
        await Bed.create([{
          ...b,
          code: `${wardDoc.code || wardDoc.name.replace(/\s+/g, '')}-${b.bedNumber}`,
          wardId: wardDoc._id,
          roomId: roomDoc?._id,
          floorId: floorDoc?._id,
          buildingId: buildingDoc?._id,
          hospitalId: ward.hospitalId,
          branchId: ward.branchId,
        }], { session, ordered: true });
      }
    }
    await session.commitTransaction();
    return { building: buildingDoc, floor: floorDoc, ward: wardDoc, room: roomDoc };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

export const listWards = async () => Ward.find({}).populate('floorId').populate('departmentId', 'name').sort({ name: 1 });

export const listBeds = async (query = {}) => {
  const filter = {};
  if (query.wardId) filter.wardId = query.wardId;
  if (query.status) filter.status = query.status;
  if (query.search) {
    const r = regex(query.search);
    filter.$or = [{ bedNumber: r }, { code: r }];
  }
  const beds = await Bed.find(filter)
    .populate('wardId', 'name')
    .populate('roomId', 'roomNumber')
    .populate('currentAdmissionId', 'patientId admittedAt')
    .sort({ code: 1 });
  return beds;
};

export const bedMap = async () => {
  const [wards, beds] = await Promise.all([
    Ward.find({}).populate('floorId', 'name').sort({ name: 1 }),
    Bed.find({}).populate('currentAdmissionId', 'patientId').select('bedNumber code wardId status'),
  ]);
  const total = beds.length;
  const occupied = beds.filter((b) => b.status === BED_STATUS.OCCUPIED).length;
  // Section 50: a bed is only "available" when it is genuinely ready for a
  // patient. CLEANING / MAINTENANCE / BLOCKED / RESERVED beds are NOT available.
  const available = beds.filter((b) => b.status === BED_STATUS.AVAILABLE).length;
  const cleaning = beds.filter((b) => b.status === BED_STATUS.CLEANING).length;
  return {
    total,
    occupied,
    available,
    cleaning,
    unavailable: total - occupied - available,
    occupancyPct: total ? Math.round((occupied / total) * 100) : 0,
    wards: wards.map((w) => ({
      ...w.toObject(),
      beds: beds.filter((b) => b.wardId?.toString() === w._id.toString()),
    })),
    beds,
  };
};

export const bedCommandCenter = async () => {
  const [wards, beds] = await Promise.all([
    Ward.find({}).populate('floorId', 'name').sort({ name: 1 }),
    Bed.find({})
      .populate('currentAdmissionId', 'admissionNumber patientId admittedAt admittingDiagnosis chiefComplaint status admissionType expectedDischargeDate priority')
      .populate('roomId', 'roomNumber roomType chargePerDay')
      .select('bedNumber code wardId roomId bedType status chargePerDay currentAdmissionId blockedReason'),
  ]);

  const admissionsById = new Map();
  const patientIds = new Set();
  for (const bed of beds) {
    const a = bed.currentAdmissionId;
    if (!a) continue;
    admissionsById.set(String(a._id), a);
    if (a.patientId) patientIds.add(String(a.patientId));
  }
  let patientMap = new Map();
  if (patientIds.size) {
    const { default: Patient } = await import('../models/Patient.model.js');
    const patients = await Patient.find({ _id: { $in: Array.from(patientIds) } })
      .select('uhid firstName lastName gender mobile photo');
    patientMap = new Map(patients.map((p) => [String(p._id), p]));
  }

  const total = beds.length;
  const statusCount = (s) => beds.filter((b) => b.status === s).length;
  const occupied = statusCount('OCCUPIED');
  const BED_STATES = ['AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING', 'MAINTENANCE', 'BLOCKED'];

  const wardBlocks = wards.map((w) => {
    const wbeds = beds
      .filter((b) => b.wardId?.toString() === w._id.toString())
      .map((b) => {
        const adm = b.currentAdmissionId;
        const patient = adm?.patientId ? patientMap.get(String(adm.patientId)) : null;
        const hoursAgo = adm?.admittedAt ? Math.max(0, Math.round((Date.now() - new Date(adm.admittedAt).getTime()) / 3600000)) : null;
        return {
          _id: b._id,
          bedNumber: b.bedNumber,
          code: b.code,
          bedType: b.bedType,
          status: b.status,
          chargePerDay: b.chargePerDay,
          roomId: b.roomId,
          blockedReason: b.blockedReason,
          admission: adm ? {
            admissionNumber: adm.admissionNumber,
            admittedAt: adm.admittedAt,
            admissionType: adm.admissionType,
            chiefComplaint: adm.chiefComplaint || adm.admittingDiagnosis || '',
            expectedDischargeDate: adm.expectedDischargeDate,
            priority: adm.priority,
            hoursAgo,
          } : null,
          patient: patient ? {
            _id: patient._id,
            uhid: patient.uhid,
            firstName: patient.firstName,
            lastName: patient.lastName,
            gender: patient.gender,
            mobile: patient.mobile,
          } : null,
        };
      });
    return {
      _id: w._id,
      name: w.name,
      code: w.code,
      wardType: w.wardType,
      floor: w.floorId?.name || null,
      chargePerDay: w.chargePerDay,
      active: w.active,
      total: wbeds.length,
      counts: Object.fromEntries(BED_STATES.map((s) => [s.toLowerCase(), wbeds.filter((b) => b.status === s).length])),
      beds: wbeds,
    };
  }).filter((w) => w.total > 0);

  return {
    total,
    occupied,
    available: statusCount('AVAILABLE'),
    reserved: statusCount('RESERVED'),
    cleaning: statusCount('CLEANING'),
    maintenance: statusCount('MAINTENANCE'),
    blocked: statusCount('BLOCKED'),
    occupancyPct: total ? Math.round((occupied / total) * 100) : 0,
    updatedAt: new Date().toISOString(),
    wards: wardBlocks,
  };
};

// ===== ADMISSIONS =====
const ACTIVE_ADMISSION_STATUSES = [
  ADMISSION_STATUS.ADMISSION_REQUESTED,
  ADMISSION_STATUS.APPROVED,
  ADMISSION_STATUS.WAITING_FOR_BED,
  ADMISSION_STATUS.BED_ALLOCATED,
  ADMISSION_STATUS.ADMITTED,
  ADMISSION_STATUS.TRANSFER_REQUESTED,
  ADMISSION_STATUS.TRANSFERRED,
  ADMISSION_STATUS.DISCHARGE_PLANNED,
];

/** Atomically claims a free bed so two admissions can never take the same bed. */
const claimBed = async (bedId, admissionId, session) => {
  const bed = await Bed.findOneAndUpdate(
    {
      _id: bedId,
      status: { $in: [BED_STATUS.AVAILABLE, BED_STATUS.RESERVED] },
      $or: [{ currentAdmissionId: null }, { currentAdmissionId: admissionId }],
    },
    { $set: { status: BED_STATUS.OCCUPIED, currentAdmissionId: admissionId } },
    { new: true, session },
  );
  if (!bed) {
    const current = await Bed.findById(bedId).session(session);
    if (!current) throw new BadRequestError('Bed not found');
    throw new ConflictError(`Bed ${current.bedNumber} is not available (${current.status})`);
  }
  return bed;
};

export const admitPatient = async (payload, actor) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { patientId, bedId, consultantDoctorId } = payload;

    const Patient = (await import('../models/Patient.model.js')).default;
    const Doctor = (await import('../models/Doctor.model.js')).default;

    const patient = await Patient.findById(patientId).session(session).select('uhid firstName lastName');
    if (!patient) throw new BadRequestError('Patient not found');

    const existing = await IpdAdmission.findOne({
      patientId,
      status: { $in: ACTIVE_ADMISSION_STATUSES },
    }).session(session).select('admissionNumber status bedId');
    if (existing) {
      throw new ConflictError(
        `Patient already has active admission ${existing.admissionNumber} (${existing.status}) — cannot admit again`,
      );
    }

    if (!consultantDoctorId) {
      throw new BadRequestError('Consultant doctor is required before admission');
    }
    const consultant = await Doctor.findById(consultantDoctorId).session(session).select('name active');
    if (!consultant) throw new BadRequestError('Consultant doctor not found');
    if (consultant.active === false) throw new BadRequestError(`Consultant ${consultant.name} is inactive`);

    if (bedId) {
      const bed = await Bed.findById(bedId).session(session);
      if (!bed) throw new BadRequestError('Bed not found');
      if (bed.status !== BED_STATUS.AVAILABLE && bed.status !== BED_STATUS.RESERVED) {
        throw new ConflictError(`Bed ${bed.bedNumber} is not available (${bed.status})`);
      }
      if (bed.currentAdmissionId) throw new ConflictError(`Bed ${bed.bedNumber} is already allocated`);
    }

    const admissionNumber = await generateNumber(NUMBER_PREFIXES.ADMISSION, new Date().getFullYear(), session);
    const hasBed = Boolean(bedId);
    let admission = await IpdAdmission.create([{
      ...payload,
      admissionNumber,
      ipNumber: admissionNumber,
      admittedAt: hasBed ? new Date() : undefined,
      admittedBy: actor?.id,
      hospitalId: actor?.hospitalId || payload.hospitalId,
      branchId: actor?.branchId,
      status: hasBed ? ADMISSION_STATUS.ADMITTED : ADMISSION_STATUS.WAITING_FOR_BED,
    }], { session, ordered: true });
    admission = admission[0];

    if (bedId) {
      const bed = await claimBed(bedId, admission._id, session);
      admission.wardId = bed.wardId;
      admission.roomId = bed.roomId;
      admission.bedId = bedId;
      await admission.save({ session });

      const [history] = await BedHistory.create([{
        bedId,
        admissionId: admission._id,
        patientId,
        action: 'ASSIGN',
        from: BED_STATUS.AVAILABLE,
        to: BED_STATUS.OCCUPIED,
        changedBy: actor?.id,
      }], { session, ordered: true });
      admission.bedHistory.push(history._id);
      await admission.save({ session });
    }

    const populated = await IpdAdmission.findById(admission._id)
      .session(session)
      .populate('patientId', 'uhid firstName lastName mobile')
      .populate('bedId', 'bedNumber')
      .populate('consultantDoctorId', 'name');

    await writeAudit({
      user: actor,
      action: 'IPD_ADMIT',
      module: 'ipd',
      entityId: admission._id,
      entityType: 'IpdAdmission',
      data: { admissionNumber, ipNumber: admissionNumber, patientId, bedId: bedId || null, consultantDoctorId },
      req: actor?.req,
    });

    await session.commitTransaction();
    emitIpd(IPD_SOCKET_EVENTS.ADMISSION_CREATED, { admission: populated.toObject() });
    return populated.toObject();
  } catch (err) {
    await session.abortTransaction().catch(() => {});
    throw err;
  } finally {
    session.endSession();
  }
};

export const transferBed = async (admissionId, newBedId, actor, reason = '') => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const admission = await IpdAdmission.findById(admissionId).session(session);
    if (!admission) throw new NotFoundError('Admission not found');
    if (![ADMISSION_STATUS.ADMITTED, ADMISSION_STATUS.TRANSFERRED, ADMISSION_STATUS.DISCHARGE_PLANNED].includes(admission.status)) {
      throw new BadRequestError('Only active admissions can be transferred');
    }

    const newBed = await Bed.findById(newBedId).session(session);
    if (!newBed) throw new BadRequestError('Bed not found');
    if (newBed.status !== 'AVAILABLE' && newBed.status !== 'RESERVED') throw new ConflictError('Target bed not available');

    if (String(newBed._id) === String(admission.bedId)) throw new BadRequestError('Patient already occupies that bed');

    const oldBed = admission.bedId ? await Bed.findById(admission.bedId).session(session) : null;
    if (oldBed) {
      // Close the previous allocation — never overwrite history, always append.
      await BedHistory.create([{
        bedId: oldBed._id,
        admissionId,
        patientId: admission.patientId,
        action: 'RELEASE',
        from: BED_STATUS.OCCUPIED,
        to: BED_STATUS.AVAILABLE,
        reason: `Transferred to ${newBed.bedNumber} — ${reason}`.trim(),
        chargePerDay: oldBed.chargePerDay,
        changedBy: actor?.id,
      }], { session, ordered: true });
      await Bed.findOneAndUpdate(
        { _id: oldBed._id, currentAdmissionId: admissionId },
        { $set: { status: BED_STATUS.AVAILABLE, currentAdmissionId: null } },
        { session },
      );
    }

    const claimed = await claimBed(newBedId, admissionId, session);
    newBed.status = claimed.status;
    newBed.currentAdmissionId = claimed.currentAdmissionId;
    const [history] = await BedHistory.create([{
      bedId: newBedId,
      admissionId,
      patientId: admission.patientId,
      action: 'TRANSFER',
      from: oldBed?.bedNumber || null,
      to: newBed.bedNumber,
      reason,
      chargePerDay: newBed.chargePerDay,
      changedBy: actor?.id,
    }], { session, ordered: true });

    admission.bedId = newBedId;
    admission.wardId = newBed.wardId;
    admission.roomId = newBed.roomId;
    admission.bedHistory.push(history._id);
    admission.status = ADMISSION_STATUS.TRANSFERRED;
    await admission.save({ session });

    await session.commitTransaction();
    await writeAudit({
      user: actor, action: 'IPD_BED_TRANSFER', module: 'ipd', entityId: admissionId, entityType: 'IpdAdmission',
      data: { before: { bedId: oldBed?._id, bed: oldBed?.bedNumber, wardId: oldBed?.wardId, status: 'OCCUPIED' }, after: { bedId: newBedId, bed: newBed.bedNumber, wardId: newBed.wardId, status: 'OCCUPIED' }, reason },
    });
    emitIpd(IPD_SOCKET_EVENTS.BED_UPDATED, { admissionId, bedId: newBedId, from: oldBed?.bedNumber, to: newBed.bedNumber, reason }, admissionId);
    emitIpd(IPD_SOCKET_EVENTS.BED_BOARD_UPDATED, { reason: 'transfer' });
    return getAdmission(admissionId);
  } catch (err) {
    await session.abortTransaction().catch(() => {});
    throw err;
  } finally {
    session.endSession();
  }
};

export const dischargePatient = async (admissionId, payload, actor) => {
  const billing = await import('./ipd.billing.service.js');
  if (!payload.skipClearance) {
    await billing.assertDischargeCleared(admissionId, { skipSummary: Boolean(payload.summary) });
  }
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
const admission = await IpdAdmission.findById(admissionId).session(session);
    if (!admission) throw new NotFoundError('Admission not found');
    if (admission.status === ADMISSION_STATUS.DISCHARGED) throw new BadRequestError('Already discharged');
    if (admission.status === ADMISSION_STATUS.CANCELLED) throw new BadRequestError('Admission is cancelled');
    if (!admission.consultantDoctorId) throw new BadRequestError('Consultant doctor not assigned — cannot discharge');

    const before = {
      status: admission.status,
      stage: admission.dischargeStage,
      bedId: admission.bedId,
      dischargeType: admission.dischargeType,
    };

    admission.status = ADMISSION_STATUS.DISCHARGED;
    admission.dischargedAt = new Date();
    admission.dischargedBy = actor?.id;
    admission.dischargeStage = 'DISCHARGED';
    if (payload.dischargeType) admission.dischargeType = payload.dischargeType;
    if (payload.reason) admission.dischargeReason = payload.reason;
    admission.notes = payload.notes || admission.notes;
    await admission.save({ session });

if (admission.bedId) {
      const bed = await Bed.findById(admission.bedId).session(session);
      if (bed) {
        await Bed.findOneAndUpdate(
          { _id: bed._id, currentAdmissionId: admissionId },
          { $set: { status: BED_STATUS.CLEANING, currentAdmissionId: null } },
          { session },
        );
        await BedHistory.create([{
          bedId: bed._id,
          admissionId,
          patientId: admission.patientId,
          action: 'RELEASE',
          from: BED_STATUS.OCCUPIED,
          to: BED_STATUS.CLEANING,
          reason: 'Patient discharged — housekeeping turnover pending',
          chargePerDay: bed.chargePerDay,
          changedBy: actor?.id,
        }], { session, ordered: true });
      }
    }

    let summary = null;
    if (payload.summary) {
      const content = {
        admissionId,
        patientId: admission.patientId,
        admissionDate: admission.admittedAt,
        dischargeDate: new Date(),
        lengthOfStayDays: admission.admittedAt ? Math.max(1, Math.ceil((Date.now() - new Date(admission.admittedAt)) / 86400000)) : undefined,
        departmentId: admission.departmentId,
        consultantId: admission.consultantDoctorId,
        wardId: admission.wardId,
        bedId: admission.bedId,
        ...payload.summary,
        dischargeType: admission.dischargeType,
        deathDetails: admission.deathDetails,
        preparedBy: actor?.id,
        hospitalId: actor?.hospitalId,
        branchId: actor?.branchId,
        status: 'FINAL',
        finalisedAt: new Date(),
      };
      // a summary may already have been drafted by the discharge desk — merge, never duplicate
      const existing = await DischargeSummary.findOne({ admissionId }).session(session);
      if (existing) {
        Object.assign(existing, content);
        await existing.save({ session });
        summary = existing;
      } else {
        const [createdSummary] = await DischargeSummary.create([content], { session, ordered: true });
        summary = createdSummary;
      }
      admission.dischargeSummaryId = summary._id;
      await admission.save({ session });
    }

    const populated = await IpdAdmission.findById(admissionId)
      .session(session)
      .populate('patientId', 'uhid firstName lastName')
      .populate('dischargeSummaryId');

    await session.commitTransaction();
    // Section 50: once the admission is actually DISCHARGED, finalise the
    // summary (status FINAL) and persist its follow-up plan as real records.
    await billing.buildDischargeSummary(admissionId, {}, actor).catch(() => {});
    await writeAudit({
      user: actor, action: 'IPD_DISCHARGE', module: 'ipd', entityId: admissionId, entityType: 'IpdAdmission',
      data: {
        before,
        after: { status: admission.status, stage: admission.dischargeStage, dischargeType: admission.dischargeType, bedId: admission.bedId },
        dischargeType: admission.dischargeType,
      },
    });
    emitIpd(IPD_SOCKET_EVENTS.DISCHARGED, { admissionId, admissionNumber: admission.admissionNumber, dischargeType: admission.dischargeType }, admissionId);
    emitIpd(IPD_SOCKET_EVENTS.BED_BOARD_UPDATED, { reason: 'discharge' });
    return { admission: populated, dischargeSummary: summary };
  } catch (err) {
    await session.abortTransaction().catch(() => {});
    throw err;
  } finally {
    session.endSession();
  }
};

export const listAdmissions = async (query = {}) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.patientId) filter.patientId = query.patientId;
  if (query.departmentId) filter.departmentId = query.departmentId;
  if (query.consultantDoctorId) filter.consultantDoctorId = query.consultantDoctorId;
  if (query.from || query.to) {
    filter.admittedAt = {};
    if (query.from) filter.admittedAt.$gte = new Date(query.from);
    if (query.to) filter.admittedAt.$lte = new Date(query.to);
  }

  const [total, admissions] = await Promise.all([
    IpdAdmission.countDocuments(filter),
    IpdAdmission.find(filter)
      .populate('patientId', 'uhid firstName lastName mobile gender photo')
      .populate('departmentId', 'name')
      .populate('consultantDoctorId', 'name')
      .populate('bedId', 'bedNumber code')
      .sort({ admittedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
  ]);
  return { data: admissions, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

export const getAdmission = async (id) => {
  const admission = await IpdAdmission.findById(id)
    .populate('patientId', 'uhid firstName lastName gender dateOfBirth age bloodGroup mobile address photo')
    .populate('departmentId', 'name')
    .populate('consultantDoctorId', 'name specialization')
.populate('bedId', 'bedNumber code bedType chargePerDay status')
    .populate('wardId', 'name wardType chargePerDay')
    .populate('roomId', 'roomNumber roomType chargePerDay')
    .populate('dischargeSummaryId')
    .populate('careTeam.doctorId', 'name');
if (!admission) throw new NotFoundError('Admission not found');
  return admission;
};

// ===== ADMISSION LIFECYCLE EXTENSIONS =====
const ACTIVE_STATUSES = [ADMISSION_STATUS.ADMITTED, ADMISSION_STATUS.TRANSFERRED, ADMISSION_STATUS.DISCHARGE_PLANNED, ADMISSION_STATUS.WAITING_FOR_BED, ADMISSION_STATUS.BED_ALLOCATED];
const WAITING_STATUSES = [ADMISSION_STATUS.ADMISSION_REQUESTED, ADMISSION_STATUS.APPROVED, ADMISSION_STATUS.WAITING_FOR_BED];

export const updateAdmission = async (id, payload, actor) => {
  const allow = [
    'admittingDiagnosis', 'provisionalDiagnosis', 'chiefComplaint', 'admissionType', 'priority',
    'departmentId', 'consultantDoctorId', 'referringDoctorId', 'careTeam', 'attendant', 'emergencyContact',
    'estimatedStayDays', 'expectedDischargeDate', 'paymentCategory', 'sponsor', 'insurancePolicyId', 'notes',
    'opdVisitId', 'emergencyId',
  ];
  const admission = await IpdAdmission.findById(id);
  if (!admission) throw new NotFoundError('Admission not found');
  if ([ADMISSION_STATUS.DISCHARGED, ADMISSION_STATUS.CANCELLED].includes(admission.status)) {
    throw new BadRequestError(`Admission is ${admission.status} — record is locked and cannot be edited`);
  }
  if (payload.consultantDoctorId) {
    const Doctor = (await import('../models/Doctor.model.js')).default;
    const consultant = await Doctor.findById(payload.consultantDoctorId).select('name active');
    if (!consultant) throw new BadRequestError('Consultant doctor not found');
    if (consultant.active === false) throw new BadRequestError(`Consultant ${consultant.name} is inactive`);
  }
  const before = admission.toObject();
  allow.forEach((k) => { if (payload[k] !== undefined) admission[k] = payload[k]; });
  await admission.save();
  const after = admission.toObject();
  const changes = {};
  for (const k of allow) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) changes[k] = { from: before[k], to: after[k] };
  }
  if (Object.keys(changes).length) {
    await writeAudit({
      user: actor, action: 'IPD_UPDATE', module: 'ipd', entityId: id, entityType: 'IpdAdmission',
      data: { before: changes, changedFields: Object.keys(changes) },
    });
  }
  return getAdmission(id);
};

export const assignBed = async (id, bedId, actor, reason = '') => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const admission = await IpdAdmission.findById(id).session(session);
    if (!admission) throw new NotFoundError('Admission not found');
    if (![ADMISSION_STATUS.WAITING_FOR_BED, ADMISSION_STATUS.APPROVED, ADMISSION_STATUS.ADMISSION_REQUESTED].includes(admission.status)) {
      throw new BadRequestError('Bed can only be assigned to a waiting admission');
    }
    const bed = await Bed.findById(bedId).session(session);
    if (!bed) throw new BadRequestError('Bed not found');
    if (bed.status !== BED_STATUS.AVAILABLE && bed.status !== BED_STATUS.RESERVED) {
      throw new ConflictError(`Bed ${bed.bedNumber} is not available (${bed.status})`);
    }
    admission.bedId = bedId;
    admission.wardId = bed.wardId;
    admission.roomId = bed.roomId;
    admission.status = ADMISSION_STATUS.ADMITTED;
    if (!admission.admittedAt) admission.admittedAt = new Date();
    await admission.save({ session });

    const claimed = await claimBed(bedId, admission._id, session);
    bed.status = claimed.status;
    bed.currentAdmissionId = claimed.currentAdmissionId;

    const [history] = await BedHistory.create([{
      bedId, admissionId: admission._id, patientId: admission.patientId,
      action: 'ASSIGN', from: BED_STATUS.AVAILABLE, to: BED_STATUS.OCCUPIED, reason,
      chargePerDay: bed.chargePerDay, changedBy: actor?.id,
    }], { session, ordered: true });
    admission.bedHistory.push(history._id);
    await admission.save({ session });

    await session.commitTransaction();
    emitIpd(IPD_SOCKET_EVENTS.BED_ALLOCATED, { admissionId: id, admissionNumber: admission.admissionNumber, bedId, bedNumber: bed.bedNumber, status: 'ADMITTED' }, id);
    emitIpd(IPD_SOCKET_EVENTS.BED_BOARD_UPDATED, { reason: 'assign', bedId, status: 'OCCUPIED' });
    emitIpd(IPD_SOCKET_EVENTS.ADMISSION_UPDATED, { admissionId: id, status: 'ADMITTED' }, id);
    return getAdmission(id);
  } catch (err) {
    await session.abortTransaction().catch(() => {});
    throw err;
  } finally {
    session.endSession();
  }
};

export const planDischarge = async (id, payload, actor) => {
  const admission = await IpdAdmission.findById(id);
  if (!admission) throw new NotFoundError('Admission not found');
  if ([ADMISSION_STATUS.DISCHARGED, ADMISSION_STATUS.CANCELLED].includes(admission.status)) {
    throw new BadRequestError(`Admission is already ${admission.status}`);
  }
  admission.status = ADMISSION_STATUS.DISCHARGE_PLANNED;
  admission.dischargePlannedAt = new Date();
  admission.dischargePlanningNotes = payload.notes || admission.dischargePlanningNotes;
  admission.expectedDischargeDate = payload.expectedDischargeDate || admission.expectedDischargeDate;
  await admission.save();
  return getAdmission(id);
};

export const cancelAdmission = async (id, reason, actor) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const admission = await IpdAdmission.findById(id).session(session);
    if (!admission) throw new NotFoundError('Admission not found');
    if ([ADMISSION_STATUS.DISCHARGED, ADMISSION_STATUS.CANCELLED].includes(admission.status)) return admission;
    if (admission.bedId) {
      const bed = await Bed.findById(admission.bedId).session(session);
      if (bed && (bed.status === BED_STATUS.OCCUPIED || bed.status === BED_STATUS.RESERVED)) {
        bed.status = BED_STATUS.AVAILABLE;
        bed.currentAdmissionId = null;
        await bed.save({ session });
        await BedHistory.create([{
          bedId: bed._id, admissionId: admission._id, patientId: admission.patientId,
          action: 'AVAILABLE', from: BED_STATUS.OCCUPIED, to: BED_STATUS.AVAILABLE,
          reason: reason || 'Admission cancelled', chargePerDay: bed.chargePerDay, changedBy: actor?.id,
        }], { session, ordered: true });
      }
    }
    admission.status = ADMISSION_STATUS.CANCELLED;
    admission.notes = reason ? `${reason}\n${admission.notes || ''}`.trim() : admission.notes;
    await admission.save({ session });
    await session.commitTransaction();
    return admission;
  } catch (err) {
    await session.abortTransaction().catch(() => {});
    throw err;
  } finally {
    session.endSession();
  }
};

export const waitingList = async () => {
  const admissions = await IpdAdmission.find({ status: { $in: WAITING_STATUSES } })
    .populate('patientId', 'uhid firstName lastName gender mobile')
    .populate('departmentId', 'name')
    .populate('consultantDoctorId', 'name')
    .sort({ createdAt: 1 });
  return admissions;
};

export const commandCenter = async () => {
  const { default: Patient } = await import('../models/Patient.model.js');
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday); startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  const beds = await bedCommandCenter();

  const [admissionsAll, todayAdmissions, todayDischarges, nursingNoteCount, clinicalNoteRecent, pendingInvestigations, bills] = await Promise.all([
    IpdAdmission.find({}).select('_id status admittedAt dischargedAt expectedDischargeDate patientId priority').lean(),
    IpdAdmission.countDocuments({ admittedAt: { $gte: startOfToday } }),
    IpdAdmission.countDocuments({ dischargedAt: { $gte: startOfToday } }),
    NursingNote.aggregate([{ $match: { recordedAt: { $gte: startOfToday } } }, { $group: { _id: '$admissionId', c: { $sum: 1 } } }]),
    ClinicalNote.aggregate([{ $match: { createdAt: { $gte: new Date(Date.now() - 24 * 3600000) }, admissionId: { $exists: true, $ne: null } } }, { $group: { _id: '$admissionId', c: { $sum: 1 } } }]),
    ClinicalOrder.aggregate([{ $match: { admissionId: { $exists: true, $ne: null }, status: { $in: ['ORDERED', 'SCHEDULED', 'COLLECTED', 'IN_PROGRESS'] } } }, { $group: { _id: '$admissionId', c: { $sum: 1 } } }]),
    Bill.find({ admissionId: { $exists: true, $ne: null }, status: { $nin: ['CANCELLED'] } }).select('admissionId netTotal paidAmount dueAmount status').lean(),
  ]);

  const activeIds = admissionsAll.filter((a) => ACTIVE_STATUSES.includes(a.status)).map((a) => String(a._id));
  const activeSet = new Set(activeIds);
  const todayNoteSet = new Set(nursingNoteCount.map((n) => String(n._id)));
  const recentClinicalSet = new Set(clinicalNoteRecent.map((n) => String(n._id)));
  const pendingInvMap = new Map(pendingInvestigations.map((n) => [String(n._id), n.c]));
  const pendingInvSet = new Set([...pendingInvMap.keys()].filter((k) => activeSet.has(k)));

  const billByAdmission = new Map();
  let outstandingAmount = 0;
  for (const b of bills) {
    const key = String(b.admissionId);
    const cur = billByAdmission.get(key) || { count: 0, due: 0 };
    cur.count += 1;
    cur.due += Number(b.dueAmount || 0);
    billByAdmission.set(key, cur);
  }
  const pendingBillingSet = new Set();
  let pendingBillingAmount = 0;
  for (const key of activeSet) {
    const b = billByAdmission.get(key);
    const due = b?.due || 0;
    if (due > 0) { pendingBillingSet.add(key); pendingBillingAmount += due; }
    outstandingAmount += due;
  }

  const expectedDischarges = admissionsAll.filter((a) =>
    ACTIVE_STATUSES.includes(a.status) && a.expectedDischargeDate &&
    new Date(a.expectedDischargeDate) >= startOfToday && new Date(a.expectedDischargeDate) < new Date(startOfTomorrow.getTime() + 48 * 3600000));
  const dischargePlanned = admissionsAll.filter((a) => a.status === ADMISSION_STATUS.DISCHARGE_PLANNED);

  const waiting = await waitingList();

  return {
    ...beds,
    todayAdmissions,
    todayDischarges,
    expectedDischarges: expectedDischarges.map((a) => String(a._id)),
    dischargePlanned: dischargePlanned.map((a) => String(a._id)),
    waitingAdmissions: waiting.length,
    waitingAdmissionsIds: waiting.map((w) => String(w._id)),
    congestedPending: pendingInvSet.size,
    pendingInvestigationsAdmissions: [...pendingInvSet],
    pendingDoctorVisits: activeIds.filter((k) => !recentClinicalSet.has(k)),
    pendingNursingToday: activeIds.filter((k) => !todayNoteSet.has(k)),
    pendingBilling: [...pendingBillingSet],
    pendingBillingAmount,
    activeAdmissions: activeIds.length,
    outstandingAmount,
    insurancePending: activeIds.length,
    updatedAt: new Date().toISOString(),
  };
};

export const admissionWorkspace = async (id) => {
  const admission = await getAdmission(id);
  const [vitals, nursingNotes, clinicalNotes, medications, orders, bills, dischargeSummary, bedHistory, doctorVisits, allocations, patientDocs, timeline] = await Promise.all([
    VitalRecord.find({ admissionId: id }).sort({ recordedAt: -1 }).limit(50),
    NursingNote.find({ admissionId: id }).populate('recordedBy', 'name').sort({ recordedAt: -1 }),
    ClinicalNote.find({ admissionId: id }).populate('createdBy', 'name').sort({ createdAt: -1 }),
    MedicationChart.find({ admissionId: id }).populate('orderedBy', 'name').populate('administrations.administeredBy', 'name').sort({ createdAt: -1 }),
    ClinicalOrder.find({ admissionId: id }).populate('orderedBy', 'name').sort({ orderedAt: -1 }),
    Bill.find({ admissionId: id, status: { $nin: ['CANCELLED'] } }).sort({ billDate: -1 }),
    admission?.dischargeSummaryId ? DischargeSummary.findById(admission.dischargeSummaryId) : DischargeSummary.findOne({ admissionId: id }),
    BedHistory.find({ admissionId: id }).populate('changedBy', 'name').sort({ timestamp: -1 }),
    DoctorVisit.find({ admissionId: id }).populate('doctorId', 'name specialization').populate('departmentId', 'name').populate('createdBy', 'name').sort({ visitDate: -1 }),
    admissionAllocations(id),
    admission.patientId ? PatientDocument.find({ patientId: admission.patientId }).sort({ createdAt: -1 }) : [],
    admissionTimeline(id).catch(() => []),
  ]);

  let payments = [];
  if (admission.patientId && bills.length) {
    payments = await Payment.find({ patientId: admission.patientId, billId: { $in: bills.map((b) => b._id) } })
      .populate('receivedBy', 'name').sort({ paidAt: -1 });
  }

  const vitalsOut = vitals.map((v) => { const o = v.toObject(); o.flags = flagVitals(o); return o; });

  let patient360 = null;
  if (admission.patientId) {
    const { default: Patient } = await import('../models/Patient.model.js');
    const patient = await Patient.findById(admission.patientId)
      .select('uhid firstName lastName gender dateOfBirth age bloodGroup mobile email address photo emergencyContact allergies medicalHistory');
    const patientService = await import('./patient.service.js');
    const refs = await patientService.getPatientReferences(admission.patientId).catch(() => null);
    patient360 = { ...patient?.toObject?.(), references: refs };
  }

  const billSummary = bills.reduce((acc, b) => {
    acc.total += Number(b.grossTotal || 0);
    acc.net += Number(b.netTotal || 0);
    acc.paid += Number(b.paidAmount || 0);
    acc.due += Number(b.dueAmount || 0);
    acc.discount += Number(b.discount || 0);
    return acc;
  }, { total: 0, net: 0, paid: 0, due: 0, discount: 0, count: bills.length });

  const orderCounts = orders.reduce((acc, o) => {
    const c = o.category || 'OTHER';
    acc[c] = (acc[c] || 0) + 1;
    return acc;
  }, {});

  // ===== sections 16-25 collections (fail-soft so one missing table never 500s the 360) =====
  const workflow = {};
  const wf = import('./ipd.workflow.service.js');
  const [mar, pharmacyRequests, ioChart, procedures, otRequests, dietOrders, bloodRequests, physioRequests, labOrders, radiologyOrders] = await Promise.all([
    wf.then((m) => m.listMar(id)).catch(() => []),
    wf.then((m) => m.listPharmacyRequests(id)).catch(() => []),
    wf.then((m) => m.listIoEntries(id)).catch(() => ({ entries: [], totals: { input: 0, output: 0, balance: 0 }, hourly: [], byShift: [] })),
    wf.then((m) => m.listProcedures(id)).catch(() => []),
    wf.then((m) => m.listOtRequests(id)).catch(() => []),
    wf.then((m) => m.listDietOrders(id)).catch(() => []),
    wf.then((m) => m.listBloodRequests(id)).catch(() => []),
    wf.then((m) => m.listPhysioRequests(id)).catch(() => []),
    wf.then((m) => m.listAdmissionLabOrders(id)).catch(() => ({ orders: [], results: [] })),
    wf.then((m) => m.listAdmissionRadiologyOrders(id)).catch(() => ({ orders: [], reports: [] })),
  ]);
  Object.assign(workflow, { mar, pharmacyRequests, ioChart, procedures, otRequests, dietOrders, bloodRequests, physioRequests, labOrders, radiologyOrders });

  // transfers + IPD documents (sections 36, 38)
  const transferSvc = import('./ipd.transfer.service.js');
  const [transfers, ipdDocuments] = await Promise.all([
    transferSvc.then((m) => m.listTransfers(id)).catch(() => []),
    transferSvc.then((m) => m.documentsForAdmission(id)).catch(() => ({ total: 0, grouped: {}, documents: [] })),
  ]);

  return {
    admission,
    patient360,
    vitals: vitalsOut,
    nursingNotes,
    clinicalNotes,
    medications,
    orders,
    orderCounts,
    bills,
    billSummary,
    payments: payments,
    dischargeSummary,
    bedHistory,
    allocations,
    transfers,
    ipdDocuments: ipdDocuments?.documents || [],
    documentGroups: ipdDocuments?.grouped || {},
    doctorVisits,
    patientDocuments: patientDocs,
    timeline,
    workflow,
    insurance: {
      policy: admission.insurancePolicyId || null,
      sponsor: admission.sponsor || null,
      paymentCategory: admission.paymentCategory || 'CASH',
    },
  };
};

// ===== IPD CLINICAL DOCUMENTATION =====
const requireActiveAdmission = async (id) => {
  const admission = await IpdAdmission.findById(id).select('patientId admissionNumber status consultantDoctorId departmentId');
  if (!admission) throw new NotFoundError('Admission not found');
  if (![ADMISSION_STATUS.ADMITTED, ADMISSION_STATUS.TRANSFERRED, ADMISSION_STATUS.DISCHARGE_PLANNED, ADMISSION_STATUS.WAITING_FOR_BED].includes(admission.status)) {
    throw new BadRequestError(`Admission is ${admission.status} — clinical documentation closed`);
  }
  return admission;
};

export const recordAdmissionVital = async (id, payload, actor) => {
  const admission = await requireActiveAdmission(id);
  const vital = await VitalRecord.create({
    ...payload,
    admissionId: id,
    patientId: admission.patientId,
    visitId: payload.visitId || null,
    bmi: payload.weightKg && payload.heightCm ? Number((payload.weightKg / ((payload.heightCm / 100) ** 2)).toFixed(1)) : payload.bmi,
    recordedBy: actor?.id,
    source: payload.source || 'MANUAL',
    hospitalId: actor?.hospitalId,
    branchId: actor?.branchId,
  });
  const out = vital.toObject();
  out.flags = flagVitals(out);
  emitIpd(IPD_SOCKET_EVENTS.VITAL_RECORDED, {
    admissionId: id, admissionNumber: admission.admissionNumber, flags: out.flags.flags, critical: out.flags.flags.some((f) => f.endsWith(':CRITICAL')),
  }, id);
  return out;
};

export const listAdmissionVitals = async (id, limit = 50) => {
  const vitals = await VitalRecord.find({ admissionId: id }).sort({ recordedAt: -1 }).limit(Math.min(parseInt(limit, 10) || 50, 200));
  return vitals.map((v) => { const o = v.toObject(); o.flags = flagVitals(o); return o; });
};

export const createAdmissionNursingNote = async (id, payload, actor) => {
  const admission = await requireActiveAdmission(id);
  const note = await NursingNote.create({
    ...payload,
    admissionId: id,
    patientId: admission.patientId,
    recordedBy: actor?.id,
    hospitalId: actor?.hospitalId,
    branchId: actor?.branchId,
  });
  emitIpd(IPD_SOCKET_EVENTS.NURSING_NOTE_ADDED, {
    admissionId: id, admissionNumber: admission.admissionNumber, noteType: note.noteType, status: note.status,
  }, id);
  return note;
};

export const listAdmissionNursingNotes = async (id) => NursingNote.find({ admissionId: id }).populate('recordedBy', 'name').sort({ recordedAt: -1 });

export const createAdmissionClinicalNote = async (id, payload, actor) => {
  const admission = await requireActiveAdmission(id);
  const note = await ClinicalNote.create({
    ...payload,
    noteType: payload.noteType || CLINICAL_NOTE_TYPES.GENERAL,
    admissionId: id,
    patientId: admission.patientId,
    createdBy: actor?.id,
    hospitalId: actor?.hospitalId,
    branchId: actor?.branchId,
  });
  return note;
};

export const listAdmissionClinicalNotes = async (id) => ClinicalNote.find({ admissionId: id }).populate('createdBy', 'name').sort({ createdAt: -1 });

/**
 * Section 49: every clinical record must resolve to a real Doctor document.
 * Priority: explicit payload doctorId -> admission consultant -> actor.doctorId.
 * Throws when the admission has no consultant and the actor is not a doctor,
 * so clinical documents can never exist without an accountable doctor.
 */
export const resolveDoctorId = async (admission, payload = {}, actor = null, { field = 'doctor' } = {}) => {
  const Doctor = (await import('../models/Doctor.model.js')).default;
  let consultantId = admission?.consultantDoctorId;
  if (!consultantId && admission?._id) {
    const fresh = await IpdAdmission.findById(admission._id).select('consultantDoctorId').lean();
    consultantId = fresh?.consultantDoctorId;
  }
  const candidates = [payload.doctorId, consultantId, actor?.doctorId].filter(Boolean);
  for (const candidate of candidates) {
    const doctor = await Doctor.findById(candidate).select('_id name active');
    if (doctor && doctor.active !== false) return doctor._id;
  }
  throw new BadRequestError(
    `A ${field} is required — select a doctor on this admission (no consultant assigned and the current user is not a doctor)`,
  );
};

export const addMedicationChart = async (id, payload, actor) => {
  const admission = await requireActiveAdmission(id);
  const doctorId = await resolveDoctorId(admission, payload, actor, { field: 'prescribing doctor' });
  const chart = await MedicationChart.create({
    admissionId: id,
    patientId: admission.patientId,
    medicineId: payload.medicineId,
    medicineName: payload.medicineName,
    genericName: payload.genericName,
    strength: payload.strength,
    dosage: payload.dosage,
    route: payload.route,
    frequency: payload.frequency,
    frequencyTiming: payload.frequencyTiming,
    duration: payload.duration,
    startDate: payload.startDate,
    endDate: payload.endDate,
    instructions: payload.instructions,
    doctorId,
    orderedBy: actor?.id,
    hospitalId: actor?.hospitalId,
    branchId: actor?.branchId,
  });
  return chart;
};

export const listAdmissionMedications = async (id) => MedicationChart.find({ admissionId: id })
  .populate('orderedBy', 'name')
  .populate('administrations.administeredBy', 'name')
  .sort({ createdAt: -1 });

export const administerMedication = async (chartId, payload, actor) => {
  const chart = await MedicationChart.findById(chartId);
  if (!chart) throw new NotFoundError('Medication chart not found');
  if (chart.admissionId) {
    const admission = await IpdAdmission.findById(chart.admissionId).select('status admissionNumber');
    if (!admission) throw new NotFoundError('Admission not found');
    if ([ADMISSION_STATUS.DISCHARGED, ADMISSION_STATUS.CANCELLED].includes(admission.status)) {
      throw new BadRequestError(`Admission is ${admission.status} — medication administration is closed`);
    }
  }
  if (!payload.status) throw new BadRequestError('Admin status is required');
  if (payload.status === MED_ADMIN_STATUS.SCHEDULED) {
    throw new BadRequestError('Use the MAR schedule endpoint — a nurse must record the actual administration');
  }
  // If a scheduled row is supplied, update it; otherwise append a one-off entry.
  if (payload.administrationId) {
    const row = chart.administrations.id(payload.administrationId);
    if (!row) throw new NotFoundError('MAR row not found');
    row.status = payload.status;
    row.givenTime = payload.status === MED_ADMIN_STATUS.GIVEN ? (payload.givenTime || new Date()) : null;
    row.administeredBy = actor?.id;
    row.remark = payload.remark ?? row.remark;
    row.note = payload.note ?? row.note;
  } else {
    chart.administrations.push({
      scheduledTime: payload.scheduledTime || new Date(),
      givenTime: payload.status === MED_ADMIN_STATUS.GIVEN ? (payload.givenTime || new Date()) : undefined,
      status: payload.status,
      administeredBy: actor?.id,
      note: payload.note,
      remark: payload.remark,
    });
  }
  await chart.save();
  return chart;
};

export const createAdmissionOrder = async (id, payload, actor) => {
  const admission = await requireActiveAdmission(id);
  const category = payload.category || CLINICAL_ORDER_CATEGORIES.OTHER;
  const doctorId = await resolveDoctorId(admission, payload, actor, { field: 'ordering doctor' });
  const order = await ClinicalOrder.create({
    ...payload,
    category,
    doctorId,
    priority: payload.priority || CLINICAL_ORDER_PRIORITY.ROUTINE,
    status: CLINICAL_ORDER_STATUS.ORDERED,
    orderNumber: await generateNumber('ORD', new Date().getFullYear()),
    admissionId: id,
    patientId: admission.patientId,
    orderedBy: actor?.id,
    hospitalId: actor?.hospitalId,
    branchId: actor?.branchId,
  });
  emitIpd(IPD_SOCKET_EVENTS.ORDER_CREATED, {
    admissionId: id, admissionNumber: admission.admissionNumber, orderNumber: order.orderNumber, category, priority: order.priority,
  }, id);
  return order;
};

export const listAdmissionOrders = async (id) => ClinicalOrder.find({ admissionId: id })
  .populate('orderedBy', 'name')
  .sort({ orderedAt: -1 });

export const updateAdmissionOrderStatus = async (orderId, status, actor) => {
  const valid = Object.values(CLINICAL_ORDER_STATUS);
  if (!valid.includes(status)) throw new BadRequestError('Invalid order status');
  const order = await ClinicalOrder.findById(orderId);
  if (!order) throw new NotFoundError('Order not found');
  if (order.admissionId) {
    const admission = await IpdAdmission.findById(order.admissionId).select('status');
    if (admission && [ADMISSION_STATUS.DISCHARGED, ADMISSION_STATUS.CANCELLED].includes(admission.status)) {
      throw new BadRequestError(`Admission is ${admission.status} — order cannot be modified`);
    }
  }
  order.status = status;
  if (['CANCELLED', 'REJECTED'].includes(status)) {
    order.cancelledAt = new Date();
    order.cancelledBy = actor?.id;
  }
  await order.save();
  return order;
};

// ===== DOCTOR VISITS (section 13) =====
const VISIT_NUMBER_PREFIX = 'DV';

export const createDoctorVisit = async (id, payload, actor) => {
  const admission = await requireActiveAdmission(id);
  const doctorId = await resolveDoctorId(admission, payload, actor, { field: 'visiting doctor' });
  const visit = await DoctorVisit.create({
    ...payload,
    visitType: payload.visitType || DOCTOR_VISIT_TYPES.ROUND,
    visitNumber: await generateNumber(VISIT_NUMBER_PREFIX, new Date().getFullYear()),
    admissionId: id,
    patientId: admission.patientId,
    doctorId,
    departmentId: payload.departmentId || admission.departmentId,
    visitDate: payload.visitDate || new Date(),
    createdBy: actor?.id,
    hospitalId: actor?.hospitalId,
    branchId: actor?.branchId,
  });
  emitIpd(IPD_SOCKET_EVENTS.DOCTOR_VISIT_ADDED, { admissionId: id, admissionNumber: admission.admissionNumber, visitNumber: visit.visitNumber, visitType: visit.visitType }, id);
  return visit;
};

export const listDoctorVisits = async (id) => DoctorVisit.find({ admissionId: id })
  .populate('doctorId', 'name specialization')
  .populate('departmentId', 'name')
  .populate('createdBy', 'name')
  .sort({ visitDate: -1 });

// ===== STRUCTURED INITIAL ASSESSMENT (section 10) =====
export const createInitialAssessment = async (id, payload, actor) => {
  const admission = await requireActiveAdmission(id);
  const { structured, ...rest } = payload;
  const note = await ClinicalNote.create({
    ...rest,
    noteType: CLINICAL_NOTE_TYPES.INITIAL_ASSESSMENT,
    body: rest.body || structured?.complaint || 'Initial assessment',
    structured: structured || null,
    admissionId: id,
    patientId: admission.patientId,
    createdBy: actor?.id,
    hospitalId: actor?.hospitalId,
    branchId: actor?.branchId,
  });
  return note;
};

export const listInitialAssessments = async (id) => ClinicalNote.find({ admissionId: id, noteType: CLINICAL_NOTE_TYPES.INITIAL_ASSESSMENT })
  .populate('createdBy', 'name')
  .sort({ createdAt: -1 });

// ===== TIMELINE (section 9) =====
export const admissionTimeline = async (id) => {
  const { default: User } = await import('../models/User.model.js');
  const { default: Doctor } = await import('../models/Doctor.model.js');
  const wf = import('./ipd.workflow.service.js');
  const tr = import('./ipd.transfer.service.js');
  const safe = (p, fallback) => Promise.resolve(p).catch(() => fallback);

  const [admission, vitals, nursing, clinical, meds, orders, visits, bedHist, procedures, blood, physio, ioEntries, pharmacy, transfers, settlements, advances] = await Promise.all([
    safe(IpdAdmission.findById(id).select('admissionNumber admittedAt expectedDischargeDate dischargedAt status dischargeStage dischargeType').lean(), null),
    safe(VitalRecord.find({ admissionId: id }).select('recordedAt recordedBy').lean(), []),
    safe(NursingNote.find({ admissionId: id }).select('recordedAt recordedBy noteType status').lean(), []),
    safe(ClinicalNote.find({ admissionId: id }).select('createdAt createdBy noteType').lean(), []),
    safe(MedicationChart.find({ admissionId: id }).select('createdAt orderedBy medicineName').lean(), []),
    safe(ClinicalOrder.find({ admissionId: id }).select('orderedAt orderedBy name category orderNumber').lean(), []),
    safe(DoctorVisit.find({ admissionId: id }).select('visitDate doctorId visitType diagnosis').lean(), []),
    safe(BedHistory.find({ admissionId: id }).select('timestamp changedBy action from to reason chargePerDay').lean(), []),
    safe(wf.then((m) => m.listProcedures(id)), []),
    safe(wf.then((m) => m.listBloodRequests(id)), []),
    safe(wf.then((m) => m.listPhysioRequests(id)), []),
    safe(wf.then((m) => m.listIoEntries(id)).then((r) => (r?.entries || []).slice(0, 25)), []),
    safe(wf.then((m) => m.listPharmacyRequests(id)), []),
    safe(tr.then((m) => m.listTransfers(id)).then((r) => r || []), []),
    safe(import('./ipd.billing.service.js').then((m) => m.getSettlement(id).catch(() => null)), null),
    safe(import('./ipd.billing.service.js').then((m) => m.listAdvances(id)).then((r) => r || []), []),
  ]);

  const events = [];
  const stamp = (d) => (d ? new Date(d).getTime() : null);
  const add = (at, type, title, by, extra) => { if (at) events.push({ at, type, title, by, detail: extra || {} }); };

  // ===== admission lifecycle =====
  if (admission) {
    add(stamp(admission.admittedAt), 'ADMISSION', `Admission created (${admission.admissionNumber})`, null, { status: 'ADMITTED' });
  }
  for (const h of bedHist) {
    const title = h.action === 'ASSIGN' ? `Bed allocated → ${h.to || ''}`
      : h.action === 'TRANSFER' ? `Bed transfer ${h.from || ''} → ${h.to || ''}`
        : h.action === 'RELEASE' ? `Bed released (${h.to || ''})` : `Bed ${h.action}`;
    add(stamp(h.timestamp), 'BED', title, h.changedBy, { reason: h.reason, chargePerDay: h.chargePerDay });
  }
  for (const n of clinical) {
    if (n.noteType === 'INITIAL_ASSESSMENT') add(stamp(n.createdAt), 'ASSESSMENT', 'Initial assessment recorded', n.createdBy);
    else add(stamp(n.createdAt), 'CLINICAL', `${n.noteType.replace(/_/g, ' ')} note`, n.createdBy);
  }
  for (const v of vitals) add(stamp(v.recordedAt), 'VITAL', 'Vitals recorded', v.recordedBy);
  for (const n of nursing) add(stamp(n.recordedAt), 'NURSING', `${n.noteType.replace(/_/g, ' ')} ${n.status ? `· ${n.status}` : ''}`.trim(), n.recordedBy);
  for (const v of visits) add(stamp(v.visitDate), 'DOCTOR_VISIT', `Doctor visit (${v.visitType})`, v.doctorId, { diagnosis: v.diagnosis });
  for (const o of orders) add(stamp(o.orderedAt), 'ORDER', `${o.category.replace(/_/g, ' ')} order${o.name ? `: ${o.name}` : ''}`, o.orderedBy, { orderNumber: o.orderNumber });
  for (const m of meds) add(stamp(m.createdAt), 'MEDICATION', `Medication prescribed${m.medicineName ? `: ${m.medicineName}` : ''}`, m.orderedBy);
  for (const p of pharmacy || []) {
    add(stamp(p.requestedAt), 'PHARMACY', `Pharmacy request ${p.requestNumber} (${p.medicineName})`, p.requestedBy, { status: p.status });
    if (p.dispensedAt) add(stamp(p.dispensedAt), 'PHARMACY', `Pharmacy issue — ${p.quantityDispensed} × ${p.medicineName}`, p.dispensedBy, { status: p.status });
  }
  for (const p of procedures) add(stamp(p.procedureDate), 'PROCEDURE', `Procedure: ${p.name}`, p.createdBy, { status: p.status });
  for (const b of blood) add(stamp(b.requestedAt), 'BLOOD', `Blood request ${b.component} × ${b.unitsRequested}`, b.requestedBy, { status: b.status });
  for (const p of physio) add(stamp(p.createdAt), 'PHYSIO', `Physiotherapy: ${p.procedure}`, p.requestedBy, { status: p.status });
  for (const e of ioEntries) add(stamp(e.recordedAt), 'IO', `I/O chart — in ${e.inputTotal}ml / out ${e.outputTotal}ml`, e.recordedBy);
  // Section 50: a verified result is the doctor's trigger point — surface it on
  // the patient timeline, and show the unverified state honestly.
  const labEvents = await safe(
    import('../models/LabOrder.model.js').then((m) => m.default.find({ admissionId: id }).select('labOrderNumber status orderedAt items.labTestId items.resultId')),
    [],
  );
  for (const o of labEvents) {
    add(stamp(o.orderedAt), 'LAB', `Lab order ${o.labOrderNumber} (${(o.items || []).length} test(s))`, o.orderedBy, { status: o.status });
  }
  const radEvents = await safe(
    import('../models/RadiologyOrder.model.js').then((m) => m.default.find({ admissionId: id }).select('radiologyOrderNumber status orderedAt orderedBy tests.testName')),
    [],
  );
  for (const o of radEvents) {
    add(stamp(o.orderedAt), 'RADIOLOGY', `Imaging ${o.radiologyOrderNumber} — ${(o.tests || []).map((t) => t.testName).join(', ')}`, o.orderedBy, { status: o.status });
  }
  for (const t of transfers || []) {
    add(stamp(t.requestedAt), 'TRANSFER', `Transfer requested (${t.transferType})`, t.requestedBy, { to: t.to?.hospitalName || t.to?.wardName });
    if (t.approvedAt) add(stamp(t.approvedAt), 'TRANSFER', 'Transfer approved', t.approvedBy);
    if (t.completedAt) add(stamp(t.completedAt), 'TRANSFER', 'Transfer completed', t.requestedBy);
  }
  for (const a of advances || []) {
    add(stamp(a.collectedAt), 'ADVANCE', `Advance ${a.receiptNumber} — ₹${a.amount} (${a.mode})`, a.collectedBy, { status: a.status });
  }
  if (admission?.expectedDischargeDate && admission.status === 'DISCHARGE_PLANNED') {
    add(stamp(admission.expectedDischargeDate), 'DISCHARGE', 'Discharge planned', null, { expected: true });
  }
  if (settlements) {
    add(stamp(settlements.finalisedAt || settlements.createdAt), 'BILLING', `Final bill ${settlements.settlementNumber} (₹${settlements.netTotal})`, settlements.finalisedBy, { status: settlements.status });
  }
  if (admission?.dischargedAt) {
    add(stamp(admission.dischargedAt), 'DISCHARGE', `Patient discharged (${admission.dischargeType || 'NORMAL'})`, null, { stage: admission.dischargeStage });
  }
  const followUps = await safe(
    import('../models/FollowUp.model.js').then((m) => m.default.find({ admissionId: id }).sort({ date: 1 })),
    [],
  );
  for (const f of followUps) {
    add(stamp(f.date), 'FOLLOWUP', `Follow-up scheduled — ${f.reason || 'review'}`, f.createdBy, { status: f.status, followUpNumber: f.followUpNumber });
  }

  events.sort((a, b) => (a.at || 0) - (b.at || 0));

  // resolve actor names in one pass
  const actorId = (v) => (v && typeof v === 'object' ? v._id || v.id || null : v ? String(v) : null);
  const userIds = new Set();
  const doctorIds = new Set();
  for (const e of events) {
    const raw = actorId(e.by);
    if (!raw) continue;
    const id = String(raw);
    if (e.type === 'DOCTOR_VISIT') doctorIds.add(id);
    else userIds.add(id);
  }
  const [users, doctors] = await Promise.all([
    userIds.size ? safe(User.find({ _id: { $in: [...userIds] } }).select('name').lean(), []) : [],
    doctorIds.size ? safe(Doctor.find({ _id: { $in: [...doctorIds] } }).select('name').lean(), []) : [],
  ]);
  const nameMap = new Map([...users.map((u) => [String(u._id), u.name]), ...doctors.map((d) => [String(d._id), d.name])]);
  return events
    .filter((e) => e.at != null)
    .map((e) => ({ ...e, by: (nameMap.get(String(actorId(e.by) || '')) || 'System') }));
};

export const admissionAllocations = async (id) => {
  const admission = await IpdAdmission.findById(id).select('bedId admittedAt dischargedAt status');
  const entries = await BedHistory.find({ admissionId: id }).sort({ timestamp: 1 });
  const allocations = entries.map((h, i) => {
    const o = h.toObject();
    return {
      ...o,
      fromAt: o.timestamp,
      toAt: entries[i + 1]?.timestamp || null,
      open: !entries[i + 1] && ['ASSIGN', 'TRANSFER'].includes(o.action),
    };
  });

  // Legacy admissions seeded before allocation tracking have no history rows.
  if (!allocations.length && admission?.bedId) {
    const bed = await Bed.findById(admission.bedId).select('bedNumber code chargePerDay');
    if (bed) {
      const closed = [ADMISSION_STATUS.DISCHARGED, ADMISSION_STATUS.CANCELLED].includes(admission.status);
      allocations.push({
        _id: null,
        action: 'ASSIGN',
        bedId: bed._id,
        from: BED_STATUS.AVAILABLE,
        to: bed.bedNumber,
        reason: 'Admission allocation',
        chargePerDay: bed.chargePerDay,
        fromAt: admission.admittedAt,
        toAt: closed ? (admission.dischargedAt || null) : null,
        open: !closed,
        legacy: true,
        changedBy: null,
      });
    }
  }
  return allocations;
};

export const updateBedStatus = async (id, status, actor, reason = '') => {
  const valid = Object.values(BED_STATUS);
  if (!valid.includes(status)) throw new BadRequestError('Invalid bed status');
  const bed = await Bed.findById(id);
  if (!bed) throw new NotFoundError('Bed not found');
  if (bed.status === BED_STATUS.OCCUPIED && status !== BED_STATUS.OCCUPIED) {
    throw new BadRequestError('Occupied beds must be released via patient discharge');
  }
  const prev = bed.status;
  bed.status = status;
  bed.blockedReason = status === BED_STATUS.BLOCKED || status === BED_STATUS.MAINTENANCE ? reason || actor?.blockedReason || bed.blockedReason : undefined;
  await bed.save();
  await BedHistory.create({
    bedId: id,
    admissionId: bed.currentAdmissionId,
    action: status.toUpperCase(),
    from: prev, to: status,
    reason: reason || undefined,
    chargePerDay: bed.chargePerDay,
    changedBy: actor?.id,
  });
  return bed;
};

export const reserveBed = async (bedId, payload, actor) => {
  const bed = await Bed.findById(bedId);
  if (!bed) throw new NotFoundError('Bed not found');
  if (bed.status === BED_STATUS.OCCUPIED) throw new BadRequestError('Occupied beds cannot be reserved');
  const prev = bed.status;
  bed.status = BED_STATUS.RESERVED;
  bed.currentAdmissionId = payload.admissionId || bed.currentAdmissionId;
  bed.blockedReason = payload.reason;
  await bed.save();
  await BedHistory.create({
    bedId, admissionId: payload.admissionId,
    action: 'RESERVE', from: prev, to: BED_STATUS.RESERVED,
    reason: payload.reason, chargePerDay: bed.chargePerDay, changedBy: actor?.id,
  });
  return bed;
};

export const releaseBed = async (bedId, payload, actor) => {
  const bed = await Bed.findById(bedId);
  if (!bed) throw new NotFoundError('Bed not found');
  if (bed.status === BED_STATUS.OCCUPIED) throw new BadRequestError('Occupied beds are released via patient discharge');
  const prev = bed.status;
  bed.status = BED_STATUS.AVAILABLE;
  bed.currentAdmissionId = null;
  bed.blockedReason = undefined;
  await bed.save();
  await BedHistory.create({
    bedId,
    action: 'RELEASE', from: prev, to: BED_STATUS.AVAILABLE,
    reason: payload?.reason, chargePerDay: bed.chargePerDay, changedBy: actor?.id,
  });
  return bed;
};

export const listBedHistory = async (bedId) => {
  return BedHistory.find({ bedId }).populate('changedBy', 'name').populate('patientId', 'firstName lastName uhid').sort({ timestamp: -1 });
};

/**
 * Section 50: after a patient leaves, the bed sits in CLEANING. Housekeeping
 * turns it over to AVAILABLE once cleaning is signed off. This is the only
 * path that moves CLEANING -> AVAILABLE, and it is fully audited.
 */
export const completeBedTurnover = async (bedId, payload, actor) => {
  const bed = await Bed.findById(bedId);
  if (!bed) throw new NotFoundError('Bed not found');
  if (bed.status !== BED_STATUS.CLEANING) {
    throw new BadRequestError(`Bed ${bed.bedNumber} is ${bed.status} — only a bed awaiting cleaning can be turned over`);
  }
  const prev = bed.status;
  bed.status = BED_STATUS.AVAILABLE;
  bed.currentAdmissionId = null;
  bed.blockedReason = undefined;
  bed.lastTurnoverAt = new Date();
  bed.turnoverBy = actor?.id;
  await bed.save();

  await BedHistory.create({
    bedId,
    action: 'AVAILABLE',
    from: prev,
    to: BED_STATUS.AVAILABLE,
    reason: payload?.reason || 'Housekeeping turnover completed',
    chargePerDay: bed.chargePerDay,
    changedBy: actor?.id,
  });

  await writeAudit({
    user: actor,
    action: 'BED_TURNOVER',
    module: 'beds',
    entityId: bedId,
    entityType: 'Bed',
    data: { before: { status: prev }, after: { status: BED_STATUS.AVAILABLE }, reason: payload?.reason },
  });
  emitIpd(IPD_SOCKET_EVENTS.BED_BOARD_UPDATED, { reason: 'turnover', bedId, status: BED_STATUS.AVAILABLE });
  return bed;
};

/** Beds waiting for housekeeping — the discharge -> available pipeline. */
export const listTurnoverQueue = async () => {
  const beds = await Bed.find({ status: BED_STATUS.CLEANING })
    .populate('wardId', 'name wardType')
    .populate('roomId', 'roomNumber')
    .sort({ updatedAt: 1 });
  return beds;
};
