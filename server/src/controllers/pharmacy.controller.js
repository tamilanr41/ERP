import { success, created } from '../utils/apiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { writeAudit } from '../middleware/audit.js';
import {
  listMedicines,
  getStock,
  createSale,
  createPurchase,
  listSales,
  listPurchases,
  createSaleReturn,
  getExpiringMedicines,
  getLowStock,
  createMedicine,
  updateMedicine,
  createCategory,
  listCategories,
  createManufacturer,
  listManufacturers,
} from '../services/pharmacy.service.js';

export const listMedicinesController = asyncHandler(async (req, res) => {
  const result = await listMedicines(req.query);
  success(res, result.data, 'Medicines fetched', result.pagination);
});

export const stockController = asyncHandler(async (req, res) => {
  const result = await getStock(req.query);
  success(res, result.data, 'Stock fetched', result.pagination);
});

export const createMedicineController = asyncHandler(async (req, res) => {
  const medicine = await createMedicine(req.body);
  await writeAudit({ user: req.user, action: 'MEDICINE_CREATE', module: 'pharmacy', entityId: medicine._id, entityType: 'Medicine', req });
  created(res, medicine, 'Medicine added');
});

export const updateMedicineController = asyncHandler(async (req, res) => {
  const medicine = await updateMedicine(req.params.id, req.body);
  await writeAudit({ user: req.user, action: 'MEDICINE_UPDATE', module: 'pharmacy', entityId: req.params.id, entityType: 'Medicine', req });
  success(res, medicine, 'Medicine updated');
});

export const categoriesController = asyncHandler(async (req, res) => {
  success(res, await listCategories(), 'Categories fetched');
});

export const createCategoryController = asyncHandler(async (req, res) => {
  created(res, await createCategory(req.body), 'Category created');
});

export const manufacturersController = asyncHandler(async (req, res) => {
  success(res, await listManufacturers(), 'Manufacturers fetched');
});

export const createManufacturerController = asyncHandler(async (req, res) => {
  created(res, await createManufacturer(req.body), 'Manufacturer created');
});

export const createSaleController = asyncHandler(async (req, res) => {
  const sale = await createSale(req.body, req.user);
  await writeAudit({ user: req.user, action: 'PHARMACY_SALE', module: 'pharmacy', entityId: sale._id, entityType: 'PharmacySale', req });
  created(res, sale, `Sale completed: ${sale.saleNumber}`);
});

export const listSalesController = asyncHandler(async (req, res) => {
  const result = await listSales(req.query);
  success(res, result.data, 'Sales fetched', result.pagination);
});

export const createPurchaseController = asyncHandler(async (req, res) => {
  const purchase = await createPurchase(req.body, req.user);
  await writeAudit({ user: req.user, action: 'PHARMACY_PURCHASE', module: 'pharmacy', entityId: purchase._id, entityType: 'Purchase', req });
  created(res, purchase, `Purchase recorded: ${purchase.purchaseNumber}`);
});

export const listPurchasesController = asyncHandler(async (req, res) => {
  const result = await listPurchases(req.query);
  success(res, result.data, 'Purchases fetched', result.pagination);
});

export const createSaleReturnController = asyncHandler(async (req, res) => {
  const saleReturn = await createSaleReturn(req.params.id, req.body, req.user);
  await writeAudit({ user: req.user, action: 'PHARMACY_RETURN', module: 'pharmacy', entityId: saleReturn._id, entityType: 'PharmacySaleReturn', req });
  created(res, saleReturn, 'Sale return processed');
});

export const expiringController = asyncHandler(async (req, res) => {
  success(res, await getExpiringMedicines(req.query.days || 90), 'Expiring medicines');
});

export const lowStockController = asyncHandler(async (req, res) => {
  success(res, await getLowStock(), 'Low stock medicines');
});