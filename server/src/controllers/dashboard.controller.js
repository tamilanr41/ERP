import { success } from '../utils/apiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { adminDashboard, revenueTrend, opdVsIpd, departmentRevenue, bedOccupancyTrend, doctorDashboard, pharmacyDashboard, labDashboard, opdDashboard } from '../services/dashboard.service.js';

export const dashboardController = asyncHandler(async (req, res) => {
  const role = (req.user?.roleCode || '').toUpperCase();
  let data;
  switch (role) {
    case 'DOCTOR':
      data = await doctorDashboard(req.query, req.user);
      break;
    case 'PHARMACIST':
      data = await pharmacyDashboard(req.query);
      break;
    case 'LAB_TECHNICIAN':
      data = await labDashboard(req.query);
      break;
    default:
      data = await adminDashboard(req.query);
  }
  success(res, data, 'Dashboard data');
});

export const revenueTrendController = asyncHandler(async (req, res) => {
  success(res, await revenueTrend(req.query), 'Revenue trend');
});

export const opdVsIpdController = asyncHandler(async (req, res) => {
  success(res, await opdVsIpd(req.query), 'OPD vs IPD');
});

export const departmentRevenueController = asyncHandler(async (req, res) => {
  success(res, await departmentRevenue(req.query), 'Department revenue');
});

export const bedOccupancyController = asyncHandler(async (req, res) => {
  success(res, await bedOccupancyTrend(req.query), 'Bed occupancy');
});

export const opdDashboardController = asyncHandler(async (req, res) => {
  success(res, await opdDashboard(req.query), 'OPD Command Center');
});