import { success, created } from '../utils/apiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { writeAudit, auditAction } from '../middleware/audit.js';
import {
  registerPatient,
  getPatient,
  findPatient,
  listPatients,
  updatePatient,
  mergePatients,
  softDeletePatient,
  getPatientReferences,
  getPatientTimeline,
} from '../services/patient.service.js';

export const createPatient = asyncHandler(async (req, res) => {
  const patient = await registerPatient(req.body, req.user);
  await writeAudit({ user: req.user, action: 'PATIENT_CREATE', module: 'patients', entityId: patient._id, entityType: 'Patient', data: { uhid: patient.uhid }, req });
  created(res, patient, `Patient registered. UHID: ${patient.uhid}`);
});

export const listPatientsController = asyncHandler(async (req, res) => {
  const result = await listPatients(req.query);
  success(res, result.data, 'Patients fetched', result.pagination);
});

export const getPatientController = asyncHandler(async (req, res) => {
  const patient = await getPatient(req.params.id);
  success(res, patient, 'Patient fetched');
});

export const findByUHID = asyncHandler(async (req, res) => {
  const patient = await findPatient(req.params.uhid);
  if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });
  success(res, patient, 'Patient found');
});

export const updatePatientController = asyncHandler(async (req, res) => {
  const patient = await updatePatient(req.params.id, req.body, req.user);
  await writeAudit({ user: req.user, action: 'PATIENT_UPDATE', module: 'patients', entityId: patient._id, entityType: 'Patient', req });
  success(res, patient, 'Patient updated');
});

export const mergePatientsController = asyncHandler(async (req, res) => {
  const result = await mergePatients(req.params.primaryId, req.params.duplicateId, req.user);
  await writeAudit({ user: req.user, action: 'PATIENT_MERGE', module: 'patients', entityId: result.primary._id, entityType: 'Patient', data: { duplicateId: req.params.duplicateId }, req });
  success(res, result, 'Patients merged');
});

export const deletePatientController = asyncHandler(async (req, res) => {
  await softDeletePatient(req.params.id, req.user);
  await writeAudit({ user: req.user, action: 'PATIENT_DELETE', module: 'patients', entityId: req.params.id, entityType: 'Patient', req });
  success(res, null, 'Patient soft-deleted');
});

export const patientReferences = asyncHandler(async (req, res) => {
  success(res, await getPatientReferences(req.params.id), 'References fetched');
});

export const patientTimeline = asyncHandler(async (req, res) => {
  const events = await getPatientTimeline(req.params.id);
  success(res, events, 'Timeline fetched');
});

export const uploadPatientDocument = asyncHandler(async (req, res) => {
  const PatientDocument = (await import('../models/PatientDocument.model.js')).default;
  const file = req.file;
  if (!file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  const doc = await PatientDocument.create({
    patientId: req.params.id,
    title: req.body.title || file.originalname,
    category: req.body.category || 'GENERAL',
    fileType: file.mimetype,
    fileName: file.originalname,
    fileSize: file.size,
    filePath: file.path,
    fileUrl: req.file.publicPath || file.filename,
    notes: req.body.notes,
    uploadedBy: req.user.id,
    hospitalId: req.user.hospitalId,
    branchId: req.user.branchId,
  });
  await writeAudit({ user: req.user, action: 'PATIENT_DOCUMENT_UPLOAD', module: 'patients', entityId: req.params.id, entityType: 'PatientDocument', req });
  created(res, doc, 'Document uploaded');
});

export const listPatientDocuments = asyncHandler(async (req, res) => {
  const PatientDocument = (await import('../models/PatientDocument.model.js')).default;
  const docs = await PatientDocument.find({ patientId: req.params.id }).sort({ createdAt: -1 });
  success(res, docs, 'Documents fetched');
});