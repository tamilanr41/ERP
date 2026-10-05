import { success, created } from '../utils/apiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import * as svc from '../services/insurance.service.js';

// Companies
export const listCompaniesController = asyncHandler(async (req, res) => success(res, await svc.listCompanies(svc.ctxOf(req)), 'Insurance companies'));
export const createCompanyController = asyncHandler(async (req, res) => created(res, await svc.createCompany(req.body, svc.ctxOf(req)), 'Insurance company created'));
export const updateCompanyController = asyncHandler(async (req, res) => success(res, await svc.updateCompany(req.params.id, req.body, svc.ctxOf(req)), 'Insurance company updated'));

// Policies
export const createPolicyController = asyncHandler(async (req, res) => created(res, await svc.createPolicy(req.body, svc.ctxOf(req)), 'Insurance policy created'));
export const listPoliciesController = asyncHandler(async (req, res) => { const r = await svc.listPolicies(svc.ctxOf(req)); return success(res, r.data, 'Insurance policies', r.pagination); });
export const getPolicyController = asyncHandler(async (req, res) => success(res, await svc.getPolicy(req.params.id), 'Insurance policy'));

// Pre-authorizations
export const createPreAuthController = asyncHandler(async (req, res) => created(res, await svc.createPreAuth(req.body, svc.ctxOf(req)), 'Pre-authorization requested'));
export const decidePreAuthController = asyncHandler(async (req, res) => success(res, await svc.decidePreAuth(req.params.id, req.body, svc.ctxOf(req)), 'Pre-authorization decided'));
export const listPreAuthsController = asyncHandler(async (req, res) => { const r = await svc.listPreAuths(svc.ctxOf(req)); return success(res, r.data, 'Pre-authorizations', r.pagination); });
export const getPreAuthController = asyncHandler(async (req, res) => success(res, await svc.getPreAuth(req.params.id), 'Pre-authorization'));

// Claims
export const createClaimController = asyncHandler(async (req, res) => created(res, await svc.createClaim(req.body, svc.ctxOf(req)), 'Claim created'));
export const submitClaimController = asyncHandler(async (req, res) => success(res, await svc.submitClaim(req.params.id, svc.ctxOf(req)), 'Claim submitted'));
export const decideClaimController = asyncHandler(async (req, res) => success(res, await svc.decideClaim(req.params.id, req.body, svc.ctxOf(req)), 'Claim decision recorded'));
export const settleClaimController = asyncHandler(async (req, res) => success(res, await svc.settleClaim(req.params.id, svc.ctxOf(req)), 'Claim settled'));
export const listClaimsController = asyncHandler(async (req, res) => { const r = await svc.listClaims(svc.ctxOf(req)); return success(res, r.data, 'Claims', r.pagination); });
export const getClaimController = asyncHandler(async (req, res) => success(res, await svc.getClaim(req.params.id), 'Claim'));