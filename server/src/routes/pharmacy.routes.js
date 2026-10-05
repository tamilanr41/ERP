import { Router } from 'express';
import {
  listMedicinesController,
  stockController,
  createMedicineController,
  updateMedicineController,
  categoriesController,
  createCategoryController,
  manufacturersController,
  createManufacturerController,
  createSaleController,
  listSalesController,
  createPurchaseController,
  listPurchasesController,
  createSaleReturnController,
  expiringController,
  lowStockController,
} from '../controllers/pharmacy.controller.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idempotency } from '../middleware/idempotency.js';
import { body, param } from 'express-validator';

const router = Router();
router.use(authenticate);
router.use(idempotency);

router.get('/medicines', requirePermission('PHARMACY_VIEW', 'PRESCRIPTION_CREATE'), listMedicinesController);
router.post('/medicines', requirePermission('PHARMACY_PURCHASE'), validate([
  body('name').trim().notEmpty(),
]), createMedicineController);
router.put('/medicines/:id', requirePermission('PHARMACY_PURCHASE', 'PHARMACY_STOCK_ADJUST'), updateMedicineController);
router.get('/categories', categoriesController);
router.post('/categories', requirePermission('PHARMACY_PURCHASE'), validate([body('name').trim().notEmpty()]), createCategoryController);
router.get('/manufacturers', manufacturersController);
router.post('/manufacturers', requirePermission('PHARMACY_PURCHASE'), validate([body('name').trim().notEmpty()]), createManufacturerController);

router.get('/stock', requirePermission('PHARMACY_VIEW', 'INVENTORY_VIEW'), stockController);
router.get('/stock/expiring', requirePermission('PHARMACY_VIEW', 'INVENTORY_VIEW'), expiringController);
router.get('/stock/low', requirePermission('PHARMACY_VIEW', 'INVENTORY_VIEW'), lowStockController);

router.get('/sales', requirePermission('PHARMACY_SALE', 'PHARMACY_VIEW'), listSalesController);
router.post('/sales', requirePermission('PHARMACY_SALE'), validate([
  body('items').isArray({ min: 1 }).withMessage('At least one item required'),
  body('payment.mode').optional().isIn(['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'WALLET', 'CHEQUE', 'INSURANCE']),
]), createSaleController);
router.post('/sales/:id/return', requirePermission('PHARMACY_RETURN'), validate([
  param('id').isMongoId(),
  body('items').isArray({ min: 1 }),
]), createSaleReturnController);

router.get('/purchases', requirePermission('PHARMACY_PURCHASE', 'PHARMACY_VIEW'), listPurchasesController);
router.post('/purchases', requirePermission('PHARMACY_PURCHASE'), validate([
  body('supplierId').isMongoId(),
  body('items').isArray({ min: 1 }),
]), createPurchaseController);

export default router;