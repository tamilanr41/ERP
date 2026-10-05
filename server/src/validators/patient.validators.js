import { body, param } from 'express-validator';
import { validate } from '../middleware/validate.js';

const idProof = [
  body('idProof.type').optional().isIn(['AADHAAR', 'PAN', 'PASSPORT', 'DRIVING_LICENSE', 'VOTER_ID', 'OTHER']),
  body('idProof.number').optional().isString().trim().isLength({ min: 4, max: 30 }),
];

export const createPatientRules = validate([
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('gender').isIn(['MALE', 'FEMALE', 'OTHER']).withMessage('Valid gender is required'),
  body('mobile').matches(/^[0-9]{10,15}$/).withMessage('Valid mobile number is required'),
  body('middleName').optional().isString().trim().isLength({ max: 60 }),
  body('lastName').optional().isString().trim().isLength({ max: 60 }),
  body('alternatePhone').optional().matches(/^[0-9]{10,15}$/),
  body('abhaId').optional().isString().trim().isLength({ max: 30 }),
  body('age').optional().isObject(),
  body('dateOfBirth').optional().isISO8601().withMessage('Invalid date of birth'),
  body('email').optional().isEmail().withMessage('Invalid email'),
  body('bloodGroup').optional().isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'UNKNOWN']),
  body('maritalStatus').optional().isIn(['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'OTHER']),
  body('occupation').optional().isString().trim().isLength({ max: 100 }),
  body('address.line1').optional().isString().trim().isLength({ max: 200 }),
  body('address.line2').optional().isString().trim().isLength({ max: 200 }),
  body('address.area').optional().isString().trim().isLength({ max: 100 }),
  body('address.city').optional().isString().trim().isLength({ max: 100 }),
  body('address.district').optional().isString().trim().isLength({ max: 100 }),
  body('address.state').optional().isString().trim().isLength({ max: 100 }),
  body('address.country').optional().isString().trim().isLength({ max: 100 }),
  body('address.pincode').optional().matches(/^[0-9]{4,10}$/),
  body('emergencyContact.name').optional().isString().trim().isLength({ max: 100 }),
  body('emergencyContact.relation').optional().isString().trim().isLength({ max: 60 }),
  body('emergencyContact.phone').optional().matches(/^[0-9]{10,15}$/),
  body('allergies').optional().isArray().custom((a) => a.every((v) => typeof v === 'string' && v.trim().length > 0)),
  body('medicalHistory').optional().isArray().custom((a) => a.every((v) => typeof v === 'string' && v.trim().length > 0)),
  body('surgicalHistory').optional().isArray().custom((a) => a.every((v) => typeof v === 'string' && v.trim().length > 0)),
  body('familyHistory').optional().isArray().custom((a) => a.every((v) => typeof v === 'string' && v.trim().length > 0)),
  body('currentMedications').optional().isArray().custom((a) => a.every((v) => typeof v === 'string' && v.trim().length > 0)),
  body('specialAlerts').optional().isArray().custom((a) => a.every((v) => typeof v === 'string' && v.trim().length > 0)),
  ...idProof,
]);

export const updatePatientRules = validate([
  body('firstName').optional().trim().notEmpty(),
  body('middleName').optional().isString().trim().isLength({ max: 60 }),
  body('lastName').optional().isString().trim().isLength({ max: 60 }),
  body('mobile').optional().matches(/^[0-9]{10,15}$/).withMessage('Valid mobile number is required'),
  body('alternatePhone').optional().matches(/^[0-9]{10,15}$/),
  body('abhaId').optional().isString().trim().isLength({ max: 30 }),
  body('email').optional().isEmail(),
  body('address.pincode').optional().matches(/^[0-9]{4,10}$/),
  body('allergies').optional().isArray(),
  body('medicalHistory').optional().isArray(),
  body('currentMedications').optional().isArray(),
  body('specialAlerts').optional().isArray(),
  ...idProof,
]);

export const patientIdParamRules = validate([param('id').isMongoId().withMessage('Invalid patient id')]);
export const uhidParamRules = validate([param('uhid').trim().notEmpty().withMessage('UHID is required')]);
export const mergeParamsRules = validate([
  param('primaryId').isMongoId(),
  param('duplicateId').isMongoId(),
]);

export const documentUploadRules = validate([
  body('title').optional().trim().isLength({ max: 200 }),
  body('category').optional().isIn(['PATIENT_PHOTO', 'LAB_REPORT', 'SCAN_REPORT', 'PRESCRIPTION', 'INSURANCE_DOCUMENT', 'DISCHARGE_SUMMARY', 'MEDICAL_CERTIFICATE', 'GENERAL']),
]);