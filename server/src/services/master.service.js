import Hospital from '../models/Hospital.model.js';
import Department from '../models/Department.model.js';
import Doctor from '../models/Doctor.model.js';
import { NotFoundError, BadRequestError, ConflictError } from '../utils/ApiError.js';
import { regex } from '../utils/helpers.js';
import { generateNumber, NUMBER_PREFIXES } from '../utils/numberGenerator.js';

// ===== HOSPITAL =====
export const getHospital = async (id) => {
  return Hospital.findById(id || null);
};

export const updateHospital = async (id, payload) => {
  const hospital = await Hospital.findByIdAndUpdate(id, payload, { new: true, runValidators: true });
  if (!hospital) throw new NotFoundError('Hospital not found');
  return hospital;
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