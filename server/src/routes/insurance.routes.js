import { Router } from 'express';
import {
  listCompaniesController,
  createCompanyController,
  updateCompanyController,
  createPolicyController,
  listPoliciesController,
  getPolicyController,
  createPreAuthController,
  decidePreAuthController,
  listPreAuthsController,
  getPreAuthController,
  createClaimController,
  submitClaimController,
  decideClaimController,
  settleClaimController,
  listClaimsController,
  getClaimController,
} from '../controllers/insurance.controller.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { requireFeature } from '../middleware/featureFlag.js';
import { validate } from '../middleware/validate.js';
import { body, param, query } from 'express-validator';

const router = Router();
router.use(authenticate);
const FEATURE = 'ENABLE_INSURANCE_TPA';

// Companies
router.get('/companies', requirePermission('INSURANCE_VIEW'), requireFeature(FEATURE), validate([query('active').optional().isIn(['true', 'false'])]), listCompaniesController);
router.post('/companies', requirePermission('INSURANCE_CLAIM_CREATE'), requireFeature(FEATURE), validate([
  body('name').trim().notEmpty().withMessage('Company name required'),
  body('code').optional().trim(),
  body('tpaName').optional().trim(),
  body('contactPhone').optional().trim(),
  body('contactEmail').optional().isEmail().withMessage('Invalid email'),
]), createCompanyController);
router.patch('/companies/:id', requirePermission('INSURANCE_CLAIM_MANAGE'), requireFeature(FEATURE), validate([
  param('id').isMongoId(),
  body('name').optional().trim().notEmpty(),
]), updateCompanyController);

// Policies
router.post('/policies', requirePermission('INSURANCE_CLAIM_CREATE'), requireFeature(FEATURE), validate([
  body('policyNumber').trim().notEmpty().withMessage('Policy number required'),
  body('companyId').isMongoId().withMessage('Valid company required'),
  body('patientId').isMongoId().withMessage('Valid patient required'),
  body('sumInsured').optional().isFloat({ min: 0 }),
  body('startDate').optional().isISO8601(),
  body('endDate').optional().isISO8601(),
]), createPolicyController);
router.get('/policies', requirePermission('INSURANCE_VIEW'), requireFeature(FEATURE), validate([
  query('patientId').optional().isMongoId(),
  query('companyId').optional().isMongoId(),
  query('active').optional().isIn(['true', 'false']),
]), listPoliciesController);
router.get('/policies/:id', requirePermission('INSURANCE_VIEW'), requireFeature(FEATURE), validate([param('id').isMongoId()]), getPolicyController);

// Pre-authorizations
router.post('/pre-authorizations', requirePermission('INSURANCE_PREAUTH'), requireFeature(FEATURE), validate([
  body('policyId').isMongoId().withMessage('Valid policy required'),
  body('requestedAmount').isFloat({ min: 0 }).withMessage('Requested amount required'),
  body('diagnosis').optional().trim(),
  body('treatmentPlan').optional().trim(),
]), createPreAuthController);
router.patch('/pre-authorizations/:id/decide', requirePermission('INSURANCE_PREAUTH'), requireFeature(FEATURE), validate([
  param('id').isMongoId(),
  body('decision').isIn(['APPROVED', 'PARTIALLY_APPROVED', 'REJECTED']).withMessage('Invalid decision'),
  body('approvedAmount').optional().isFloat({ min: 0 }),
  body('remarks').optional().trim(),
]), decidePreAuthController);
router.get('/pre-authorizations', requirePermission('INSURANCE_VIEW'), requireFeature(FEATURE), validate([
  query('status').optional().isIn(['PENDING', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED']),
  query('patientId').optional().isMongoId(),
]), listPreAuthsController);
router.get('/pre-authorizations/:id', requirePermission('INSURANCE_VIEW'), requireFeature(FEATURE), validate([param('id').isMongoId()]), getPreAuthController);

// Claims
router.post('/claims', requirePermission('INSURANCE_CLAIM_CREATE'), requireFeature(FEATURE), validate([
  body('policyId').isMongoId().withMessage('Valid policy required'),
  body('patientId').isMongoId().withMessage('Valid patient required'),
  body('claimedAmount').isFloat({ min: 0 }).withMessage('Claimed amount required'),
  body('admissionId').optional().isMongoId(),
  body('preAuthorizationNumber').optional().trim(),
  body('diagnosis').optional().trim(),
  body('treatmentSummary').optional().trim(),
]), createClaimController);
router.patch('/claims/:id/submit', requirePermission('INSURANCE_CLAIM_CREATE'), requireFeature(FEATURE), validate([param('id').isMongoId()]), submitClaimController);
router.patch('/claims/:id/decide', requirePermission('INSURANCE_CLAIM_MANAGE'), requireFeature(FEATURE), validate([
  param('id').isMongoId(),
  body('decision').isIn(['APPROVED', 'PARTIALLY_APPROVED', 'REJECTED']).withMessage('Invalid decision'),
  body('approvedAmount').optional().isFloat({ min: 0 }),
  body('patientResponsibility').optional().isFloat({ min: 0 }),
  body('remarks').optional().trim(),
]), decideClaimController);
router.patch('/claims/:id/settle', requirePermission('INSURANCE_SETTLE'), requireFeature(FEATURE), validate([param('id').isMongoId()]), settleClaimController);
router.get('/claims', requirePermission('INSURANCE_VIEW'), requireFeature(FEATURE), validate([
  query('status').optional().isIn(['DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'SETTLED']),
  query('patientId').optional().isMongoId(),
  query('companyId').optional().isMongoId(),
]), listClaimsController);
router.get('/claims/:id', requirePermission('INSURANCE_VIEW'), requireFeature(FEATURE), validate([param('id').isMongoId()]), getClaimController);

export default router;