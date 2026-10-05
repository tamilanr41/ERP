import Patient from '../models/Patient.model.js';
import { generateUHID } from '../utils/numberGenerator.js';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/ApiError.js';
import { regex } from '../utils/helpers.js';

const clean = (v) => (typeof v === 'string' ? v.trim() : v);

export const registerPatient = async (payload, actor, session = null) => {
  const { mobile, idProof } = payload;

  if (mobile) {
    const dup = await Patient.findOne({ mobile: clean(mobile) }).session(session);
    if (dup && actor?.allowDuplicateMobile !== true) {
      throw new ConflictError(`Patient already exists with mobile ${mobile}. UHID: ${dup.uhid}`);
    }
  }
  if (idProof?.number) {
    const dup = await Patient.findOne({ 'idProof.number': clean(idProof.number) }).session(session);
    if (dup) throw new ConflictError(`Patient already exists with ID proof ${idProof.number}. UHID: ${dup.uhid}`);
  }

  const uhid = await generateUHID(session);
  const year = new Date().getFullYear();
  const registrationNumber = `REG-${year}-${Math.floor(100000 + Math.random() * 900000)}`;

  const patient = new Patient({
    ...payload,
    mobile: clean(mobile),
    uhid,
    registrationNumber,
    registrationDate: new Date(),
    registeredBy: actor?.id,
    hospitalId: actor?.hospitalId || payload.hospitalId,
    branchId: actor?.branchId || payload.branchId,
    fullName: undefined, // computed
  });
  await patient.save({ session });
  return patient;
};

export const getPatient = async (id) => {
  const patient = await Patient.findById(id);
  if (!patient) throw new NotFoundError('Patient not found');
  return patient;
};

export const findPatient = async (uhid) => {
  const patient = await Patient.findOne({ uhid: clean(uhid) });
  return patient;
};

export const listPatients = async (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const filter = { status: { $ne: 'MERGED' }, deletedAt: null };

  const search = clean(query.search);
  if (search) {
    filter.$or = [
      { uhid: regex(search) },
      { registrationNumber: regex(search) },
      { firstName: regex(search) },
      { lastName: regex(search) },
      { mobile: regex(search) },
      { email: regex(search) },
      { 'idProof.number': regex(search) },
    ];
  }
  if (query.gender) filter.gender = query.gender;
  if (query.bloodGroup) filter.bloodGroup = query.bloodGroup;
  if (query.status) filter.status = query.status;
  if (query.city) filter['address.city'] = regex(query.city);
  if (query.idProofNumber) filter['idProof.number'] = regex(query.idProofNumber);
  if (query.dob) {
    const dob = new Date(query.dob);
    if (!Number.isNaN(dob.getTime())) {
      const dayStart = new Date(dob);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dob);
      dayEnd.setHours(23, 59, 59, 999);
      filter.dateOfBirth = { $gte: dayStart, $lte: dayEnd };
    }
  }

  const [total, patients] = await Promise.all([
    Patient.countDocuments(filter),
    Patient.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('registeredBy', 'firstName lastName'),
  ]);

  return { data: patients, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

export const updatePatient = async (id, payload, actor) => {
  const patient = await Patient.findById(id);
  if (!patient) throw new NotFoundError('Patient not found');

  if (payload.mobile && payload.mobile !== patient.mobile) {
    const dup = await Patient.findOne({ mobile: clean(payload.mobile), _id: { $ne: id } });
    if (dup) throw new ConflictError(`Another patient exists with mobile ${payload.mobile}`);
  }
  if (payload.idProof?.number && payload.idProof.number !== patient.idProof?.number) {
    const dup = await Patient.findOne({ 'idProof.number': clean(payload.idProof.number), _id: { $ne: id } });
    if (dup) throw new ConflictError(`Another patient exists with ID proof ${payload.idProof.number}`);
  }

  Object.assign(patient, payload, {
    ...(payload.idProof?.number ? { 'idProof.type': payload.idProof.type, 'idProof.number': clean(payload.idProof.number) } : {}),
  });
  await patient.save();
  return patient;
};

export const mergePatients = async (primaryId, duplicateId, actor) => {
  if (primaryId.toString() === duplicateId.toString()) throw new BadRequestError('Cannot merge patient into itself');
  const primary = await Patient.findById(primaryId);
  const duplicate = await Patient.findById(duplicateId);
  if (!primary || !duplicate) throw new NotFoundError('Patient not found');

  const merged = await Patient.findByIdAndUpdate(
    duplicateId,
    { status: 'MERGED', mergedInto: primaryId, deletedAt: new Date(), deletedBy: actor?.id },
    { new: true },
  );

  // Point child records to primary
  const relatedCollections = ['Appointment', 'OpdVisit', 'IpdAdmission', 'Prescription', 'Bill', 'LabOrder', 'RadiologyOrder', 'PharmacySale', 'Emergency', 'NursingNote', 'MedicationChart', 'PatientDocument'];
  for (const coll of relatedCollections) {
    const Model = (await import(`../models/${coll}.model.js`)).default;
    await Model.updateMany({ patientId: duplicateId }, { patientId: primaryId });
  }

  return { primary, merged };
};

export const softDeletePatient = async (id, actor) => {
  const patient = await Patient.findById(id);
  if (!patient) throw new NotFoundError('Patient not found');
  patient.status = 'INACTIVE';
  patient.deletedAt = new Date();
  patient.deletedBy = actor?.id;
  await patient.save();
  return patient;
};

export const getPatientReferences = async (id) => {
  const collections = [
    ['Appointment', 'appointments'],
    ['OpdVisit', 'opdVisits'],
    ['IpdAdmission', 'admissions'],
    ['Prescription', 'prescriptions'],
    ['Bill', 'bills'],
    ['LabOrder', 'labOrders'],
    ['RadiologyOrder', 'radiologyOrders'],
    ['PharmacySale', 'pharmacySales'],
    ['Emergency', 'emergencies'],
    ['Payment', 'payments'],
    ['PatientDocument', 'documents'],
  ];
  const results = {};
  for (const [coll, key] of collections) {
    const Model = (await import(`../models/${coll}.model.js`)).default;
    results[key] = await Model.countDocuments({ patientId: id });
  }
  return results;
};

export const getPatientTimeline = async (id) => {
  const events = [];
  const collections = [
    ['Appointment', 'appointment', 'APPOINTMENT'],
    ['OpdVisit', 'opdVisit', 'OPD_VISIT'],
    ['IpdAdmission', 'admission', 'ADMISSION'],
    ['Prescription', 'prescription', 'PRESCRIPTION'],
    ['LabOrder', 'labOrder', 'LAB_ORDER'],
    ['RadiologyOrder', 'radiologyOrder', 'RADIOLOGY_ORDER'],
    ['Surgery', 'surgery', 'SURGERY'],
    ['Bill', 'bill', 'BILL'],
    ['PharmacySale', 'pharmacySale', 'PHARMACY'],
    ['Emergency', 'emergency', 'EMERGENCY'],
    ['DischargeSummary', 'discharge', 'DISCHARGE'],
    ['MedicationChart', 'medication', 'MEDICATION'],
    ['NursingNote', 'nursingNote', 'NURSING'],
  ];

  for (const [coll, type, module] of collections) {
    try {
      const Model = (await import(`../models/${coll}.model.js`)).default;
      const docs = await Model.find({ patientId: id })
        .sort({ createdAt: -1 })
        .limit(20)
        .select('_id createdAt updatedAt status opdNumber admissionNumber rxNumber billNumber labOrderNumber appointmentNumber surgeryNumber emergencyNumber');
      for (const d of docs) {
        events.push({
          type: module,
          module,
          entityType: type,
          entityId: d._id,
          number: d.opdNumber || d.admissionNumber || d.rxNumber || d.billNumber || d.labOrderNumber || d.radiologyOrderNumber || d.appointmentNumber || d.surgeryNumber || d.emergencyNumber || d._id,
          status: d.status,
          at: d.createdAt,
        });
      }
    } catch {
      // skip collection that doesn't exist yet
    }
  }

  const patient = await Patient.findById(id).select('uhid firstName lastName registrationDate');
  if (patient) {
    events.push({
      type: 'REGISTRATION',
      module: 'patient',
      entityType: 'patient',
      entityId: patient._id,
      number: patient.uhid,
      at: patient.registrationDate || patient.createdAt,
    });
  }

  events.sort((a, b) => new Date(b.at) - new Date(a.at));
  return events;
};