import { success, created } from '../utils/apiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { writeAudit } from '../middleware/audit.js';
import {
  getHospital, updateHospital, createHospital,
  listDepartments, createDepartment, updateDepartment, deleteDepartment,
  listDoctors, createDoctor, updateDoctor, getDoctor, deleteDoctor,
} from '../services/master.service.js';

export const getHospitalController = asyncHandler(async (req, res) => {
  const hospital = await getHospital(req.user?.hospitalId);
  success(res, hospital, 'Hospital fetched');
});

export const updateHospitalController = asyncHandler(async (req, res) => {
  if (!req.user?.hospitalId) return res.status(400).json({ success: false, message: 'No hospital associated with account' });
  const hospital = await updateHospital(req.user.hospitalId, req.body);
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