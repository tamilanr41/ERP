import { Router } from 'express';
import {
  createPatient,
  listPatientsController,
  getPatientController,
  findByUHID,
  updatePatientController,
  mergePatientsController,
  deletePatientController,
  patientReferences,
  patientTimeline,
  uploadPatientDocument,
  listPatientDocuments,
} from '../controllers/patient.controller.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { idempotency } from '../middleware/idempotency.js';
import {
  createPatientRules,
  updatePatientRules,
  patientIdParamRules,
  uhidParamRules,
  mergeParamsRules,
  documentUploadRules,
} from '../validators/patient.validators.js';
import { uploader, sanitizeUpload } from '../middleware/upload.js';

const router = Router();
router.use(authenticate);
router.use(idempotency);

router.get('/search/uhid/:uhid', uhidParamRules, findByUHID);
router.get('/', requirePermission('PATIENT_VIEW'), listPatientsController);
router.post('/', requirePermission('PATIENT_CREATE'), createPatientRules, createPatient);
router.get('/:id', patientIdParamRules, requirePermission('PATIENT_VIEW'), getPatientController);
router.get('/:id/references', patientIdParamRules, requirePermission('PATIENT_VIEW'), patientReferences);
router.get('/:id/timeline', patientIdParamRules, requirePermission('PATIENT_TIMELINE_VIEW', 'PATIENT_VIEW'), patientTimeline);

router.post('/:id/documents', patientIdParamRules, documentUploadRules, requirePermission('PATIENT_DOCUMENT_UPLOAD'), uploader('file'), sanitizeUpload, uploadPatientDocument);
router.get('/:id/documents', patientIdParamRules, requirePermission('PATIENT_VIEW'), listPatientDocuments);

router.put('/:id', patientIdParamRules, requirePermission('PATIENT_EDIT'), updatePatientRules, updatePatientController);
router.post('/merge/:primaryId/:duplicateId', mergeParamsRules, requirePermission('PATIENT_MERGE'), mergePatientsController);
router.delete('/:id', patientIdParamRules, requirePermission('PATIENT_DELETE'), deletePatientController);

export default router;