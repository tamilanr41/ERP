import { success, created } from '../utils/apiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { writeAudit } from '../middleware/audit.js';
import { BadRequestError } from '../utils/ApiError.js';
import {
  getHospital, updateHospital, createHospital,
  listDepartments, createDepartment, updateDepartment, deleteDepartment,
  listDoctors, createDoctor, updateDoctor, getDoctor, deleteDoctor,
} from '../services/master.service.js';

export const getHospitalController = asyncHandler(async (req, res) => {
  const hospital = await getHospital(req.user?.hospitalId);
  success(res, hospital, 'Hospital fetched');
});

/**
 * Shared by the update and logo routes: a super admin whose own account has no
 * hospitalId would otherwise get a bare 400 with no way to attach one, which
 * is exactly the account that most needs to be able to configure the hospital.
 * Falls back to the only hospital when there is provably just one.
 */
const resolveHospitalId = async (req) => {
  if (req.user?.hospitalId) return req.user.hospitalId;
  const { default: Hospital } = await import('../models/Hospital.model.js');
  const hospitals = await Hospital.find({}).select('_id').limit(2).lean();
  if (hospitals.length === 1) return hospitals[0]._id;
  throw new BadRequestError('No hospital associated with account');
};

export const uploadHospitalLogoController = asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  const hospitalId = await resolveHospitalId(req);
  const hospital = await updateHospital(hospitalId, { logo: req.file.publicPath || req.file.filename });
  await writeAudit({ user: req.user, action: 'HOSPITAL_LOGO_UPLOAD', module: 'hospital', entityId: hospital._id, entityType: 'Hospital', req });
  success(res, hospital, 'Hospital logo updated');
});

export const deleteHospitalLogoController = asyncHandler(async (req, res) => {
  const hospitalId = await resolveHospitalId(req);
  const hospital = await updateHospital(hospitalId, { logo: '' });
  await writeAudit({ user: req.user, action: 'HOSPITAL_LOGO_REMOVE', module: 'hospital', entityId: hospital._id, entityType: 'Hospital', req });
  success(res, hospital, 'Hospital logo removed');
});

export const updateHospitalController = asyncHandler(async (req, res) => {
  const hospitalId = await resolveHospitalId(req);
  const hospital = await updateHospital(hospitalId, req.body);
  await writeAudit({ user: req.user, action: 'HOSPITAL_UPDATE', module: 'hospital', entityId: hospital._id, entityType: 'Hospital', req });
  success(res, hospital, 'Hospital updated');
});

export const createHospitalController = asyncHandler(async (req, res) => {
  const hospital = await createHospital(req.body);
  await writeAudit({ user: req.user, action: 'HOSPITAL_CREATE', module: 'hospital', entityId: hospital._id, entityType: 'Hospital', req });
  created(res, hospital, 'Hospital created');
});

export const listDepartmentsController = asyncHandler(async (req, res) => {
  success(res, await listDepartments(req.query), 'Departments fetched');
});

export const createDepartmentController = asyncHandler(async (req, res) => {
  const dept = await createDepartment(req.body);
  await writeAudit({ user: req.user, action: 'DEPARTMENT_CREATE', module: 'departments', entityId: dept._id, entityType: 'Department', req });
  created(res, dept, 'Department created');
});

export const updateDepartmentController = asyncHandler(async (req, res) => {
  const dept = await updateDepartment(req.params.id, req.body);
  await writeAudit({ user: req.user, action: 'DEPARTMENT_UPDATE', module: 'departments', entityId: req.params.id, entityType: 'Department', req });
  success(res, dept, 'Department updated');
});

export const deleteDepartmentController = asyncHandler(async (req, res) => {
  await deleteDepartment(req.params.id);
  await writeAudit({ user: req.user, action: 'DEPARTMENT_DELETE', module: 'departments', entityId: req.params.id, entityType: 'Department', req });
  success(res, null, 'Department deactivated');
});

export const listDoctorsController = asyncHandler(async (req, res) => {
  const result = await listDoctors(req.query);
  success(res, result.data, 'Doctors fetched', result.pagination);
});

export const createDoctorController = asyncHandler(async (req, res) => {
  const doctor = await createDoctor(req.body);
  await writeAudit({ user: req.user, action: 'DOCTOR_CREATE', module: 'doctors', entityId: doctor._id, entityType: 'Doctor', req });
  created(res, doctor, 'Doctor created');
});

export const updateDoctorController = asyncHandler(async (req, res) => {
  const doctor = await updateDoctor(req.params.id, req.body);
  await writeAudit({ user: req.user, action: 'DOCTOR_UPDATE', module: 'doctors', entityId: req.params.id, entityType: 'Doctor', req });
  success(res, doctor, 'Doctor updated');
});

export const getDoctorController = asyncHandler(async (req, res) => {
  success(res, await getDoctor(req.params.id), 'Doctor fetched');
});

export const deleteDoctorController = asyncHandler(async (req, res) => {
  await deleteDoctor(req.params.id);
  await writeAudit({ user: req.user, action: 'DOCTOR_DELETE', module: 'doctors', entityId: req.params.id, entityType: 'Doctor', req });
  success(res, null, 'Doctor deactivated');
});