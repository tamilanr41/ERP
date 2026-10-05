import Hospital from '../models/Hospital.model.js';
import Department from '../models/Department.model.js';
import Doctor from '../models/Doctor.model.js';
import { NotFoundError, BadRequestError, ConflictError } from '../utils/ApiError.js';
import { regex, pick } from '../utils/helpers.js';
import { generateNumber, NUMBER_PREFIXES } from '../utils/numberGenerator.js';

// ===== HOSPITAL =====
export const getHospital = async (id) => {
  return Hospital.findById(id || null);
};

export const updateHospital = async (id, payload) => {
  const fields = pickHospitalFields(payload);
  const groups = Object.keys(fields).filter((k) => HOSPITAL_GROUP_FIELDS[k]);

  // Nested groups have to be merged against what is already stored. Merging
  // against the incoming body alone would replace the whole sub-document, so a
  // form that sends only tax.defaultGstPct would silently blank out currency
  // and currencySymbol.
  if (groups.length) {
    const current = await Hospital.findById(id).select(groups.join(' ')).lean();
    if (!current) throw new NotFoundError('Hospital not found');
    for (const group of groups) {
      fields[group] = { ...(current[group] || {}), ...fields[group] };
    }
  }

  const hospital = await Hospital.findByIdAndUpdate(id, fields, { new: true, runValidators: true });
  if (!hospital) throw new NotFoundError('Hospital not found');
  return hospital;
};

/**
 * Fields an administrator is allowed to change from the hospital settings form.
 *
 * This used to pass req.body straight into findByIdAndUpdate, which let a
 * settings save rewrite organizationId, code, billing prefixes and the active
 * flag along with the address. The identity and tenancy keys are deliberately
 * absent: organizationId decides which tenant the hospital belongs to and
 * `code` is the unique key other documents are filed under, so neither should
 * move as a side effect of editing a phone number.
 */
const pickHospitalFields = (payload) => {
  const scalar = [
    'name', 'logo', 'phone', 'email', 'website', 'gstNumber', 'panNumber',
    'registrationNumber', 'nabhAccreditation', 'emergencyContact',
  ];
  const update = pick(payload, scalar);
  for (const group of Object.keys(HOSPITAL_GROUP_FIELDS)) {
    if (payload[group] && typeof payload[group] === 'object' && !Array.isArray(payload[group])) {
      update[group] = pick(payload[group], HOSPITAL_GROUP_FIELDS[group]);
    }
  }
  return update;
};

const HOSPITAL_GROUP_FIELDS = {
  address: ['line1', 'line2', 'city', 'state', 'pincode', 'country'],
  billing: ['invoicePrefix', 'receiptPrefix', 'patientIdPrefix', 'admissionPrefix', 'opdPrefix', 'defaultDiscountPct', 'taxInclusive'],
  tax: ['defaultGstPct', 'currency', 'currencySymbol'],
  prescriptionSettings: ['autoRxNumber', 'rxPrefix', 'showHospitalHeader'],
  reportSettings: ['footer', 'showLogo'],
};

export const createHospital = async (payload) => {
  if (!payload.code) payload.code = (payload.name || 'HOSP').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 5) || 'HOSP';
  const hospital = await Hospital.create(payload);
  return hospital;
};

// ===== DEPARTMENTS =====
export const listDepartments = async (query = {}) => {
  const filter = {};
  if (query.search) {
    const r = regex(query.search);
    filter.$or = [{ name: r }, { code: r }];
  }
  const departments = await Department.find(filter).populate('headOfDepartment', 'firstName lastName').sort({ name: 1 });
  return departments;
};

export const createDepartment = async (payload) => {
  const dept = await Department.create({ ...payload, code: payload.code || (payload.name || '').replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 4) });
  return dept;
};

export const updateDepartment = async (id, payload) => {
  const dept = await Department.findByIdAndUpdate(id, payload, { new: true });
  if (!dept) throw new NotFoundError('Department not found');
  return dept;
};

export const deleteDepartment = async (id) => {
  const dept = await Department.findById(id);
  if (!dept) throw new NotFoundError('Department not found');
  dept.active = false;
  await dept.save();
  return dept;
};

// ===== DOCTORS =====
export const listDoctors = async (query = {}) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 100);
  const filter = {};
  if (query.search) {
    const r = regex(query.search);
    filter.$or = [{ name: r }, { specialization: r }, { doctorCode: r }, { registrationNumber: r }];
  }
  if (query.departmentId) filter.departmentId = query.departmentId;
  if (query.availability !== undefined && query.availability !== '') filter.availability = query.availability === 'true';

  const [total, doctors] = await Promise.all([
    Doctor.countDocuments(filter),
    Doctor.find(filter).populate('departmentId', 'name').populate('userId', 'firstName lastName')
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
  ]);
  return { data: doctors, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

export const createDoctor = async (payload) => {
  const doctorCode = await generateNumber('DOC', new Date().getFullYear());
  const doctor = await Doctor.create({ ...payload, doctorCode });
  return doctor;
};

export const updateDoctor = async (id, payload) => {
  const doctor = await Doctor.findByIdAndUpdate(id, payload, { new: true });
  if (!doctor) throw new NotFoundError('Doctor not found');
  return doctor;
};

export const getDoctor = async (id) => {
  const doctor = await Doctor.findById(id).populate('departmentId', 'name');
  if (!doctor) throw new NotFoundError('Doctor not found');
  return doctor;
};

export const deleteDoctor = async (id) => {
  const doctor = await Doctor.findById(id);
  if (!doctor) throw new NotFoundError('Doctor not found');
  doctor.active = false;
  await doctor.save();
  return doctor;
};