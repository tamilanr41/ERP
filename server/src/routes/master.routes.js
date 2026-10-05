import { Router } from 'express';
import {
  getHospitalController,
  updateHospitalController,
  createHospitalController,
  listDepartmentsController,
  createDepartmentController,
  updateDepartmentController,
  deleteDepartmentController,
  listDoctorsController,
  createDoctorController,
  updateDoctorController,
  getDoctorController,
  deleteDoctorController,
} from '../controllers/master.controller.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { body, param } from 'express-validator';

const router = Router();
router.use(authenticate);

// Hospital
router.get('/hospital', getHospitalController);
router.put('/hospital', requirePermission('HOSPITAL_MANAGE'), validate([
  body('name').optional().trim().notEmpty(),
  body('phone').optional().matches(/^[0-9+ -]{8,15}$/),
  body('email').optional().isEmail(),
  body('gstNumber').optional().trim(),
]), updateHospitalController);
router.post('/hospital', requirePermission('HOSPITAL_MANAGE'), createHospitalController);

// Departments
router.get('/departments', listDepartmentsController);
router.post('/departments', requirePermission('SETTINGS_MANAGE', 'HOSPITAL_MANAGE'), validate([
  body('name').trim().notEmpty().withMessage('Department name is required'),
]), createDepartmentController);
router.put('/departments/:id', requirePermission('SETTINGS_MANAGE', 'HOSPITAL_MANAGE'), validate([param('id').isMongoId()]), updateDepartmentController);
router.delete('/departments/:id', requirePermission('SETTINGS_MANAGE', 'HOSPITAL_MANAGE'), validate([param('id').isMongoId()]), deleteDepartmentController);

// Doctors
router.get('/doctors', listDoctorsController);
router.post('/doctors', requirePermission('USER_CREATE', 'HOSPITAL_MANAGE'), validate([
  body('name').trim().notEmpty().withMessage('Doctor name is required'),
  body('departmentId').optional().isMongoId(),
]), createDoctorController);
router.get('/doctors/:id', getDoctorController);
router.put('/doctors/:id', requirePermission('USER_EDIT', 'HOSPITAL_MANAGE'), validate([param('id').isMongoId()]), updateDoctorController);
router.delete('/doctors/:id', requirePermission('USER_DELETE', 'HOSPITAL_MANAGE'), validate([param('id').isMongoId()]), deleteDoctorController);

export default router;