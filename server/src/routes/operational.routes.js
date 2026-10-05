import { Router } from 'express';
import {
  createEmergencyController,
  listEmergencyController,
  triageController,
  updateEmergencyStatusController,
  createClaimController,
  listClaimsController,
  approveClaimController,
  createItemController,
  listItemsController,
  stockAdjustController,
  listSuppliersController,
  createSupplierController,
} from '../controllers/operational.controller.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { body, param } from 'express-validator';

const router = Router();
router.use(authenticate);

// Emergency
router.get('/emergency', requirePermission('EMERGENCY_VIEW'), listEmergencyController);
router.post('/emergency', requirePermission('EMERGENCY_CREATE'), validate([
  body('chiefComplaint').optional().trim(),
  body('patientId').optional().isMongoId(),
]), createEmergencyController);
router.patch('/emergency/:id/triage', requirePermission('TRIAGE_CREATE'), validate([
  param('id').isMongoId(),
  body('triageLevel').isIn(['CRITICAL', 'URGENT', 'SEMI_URGENT', 'NON_URGENT']),
]), triageController);
router.patch('/emergency/:id', requirePermission('EMERGENCY_VIEW', 'EMERGENCY_CREATE'), updateEmergencyStatusController);

// Insurance
router.get('/claims', requirePermission('INSURANCE_VIEW'), listClaimsController);
router.post('/claims', requirePermission('INSURANCE_CLAIM_CREATE'), validate([
  body('policyId').isMongoId().withMessage('Valid insurance policy required'),
  body('patientId').isMongoId(),
  body('claimedAmount').isFloat({ gt: 0 }),
]), createClaimController);
router.patch('/claims/:id/approve', requirePermission('INSURANCE_CLAIM_MANAGE'), validate([
  param('id').isMongoId(),
  body('approvedAmount').isFloat({ min: 0 }),
  body('rejectedAmount').isFloat({ min: 0 }),
]), approveClaimController);

// Inventory
router.get('/items', requirePermission('INVENTORY_VIEW'), listItemsController);
router.post('/items', requirePermission('INVENTORY_MANAGE'), validate([
  body('itemName').trim().notEmpty(),
]), createItemController);
router.patch('/items/:id/adjust', requirePermission('INVENTORY_MANAGE', 'PHARMACY_STOCK_ADJUST'), validate([
  param('id').isMongoId(),
  body('delta').isFloat(),
]), stockAdjustController);

// Suppliers
router.get('/suppliers', requirePermission('INVENTORY_VIEW', 'SUPPLIER_MANAGE'), listSuppliersController);
router.post('/suppliers', requirePermission('SUPPLIER_MANAGE'), validate([
  body('name').trim().notEmpty(),
]), createSupplierController);

export default router;