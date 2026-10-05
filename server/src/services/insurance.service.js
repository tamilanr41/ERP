import InsuranceCompany, {
  InsurancePolicy,
  InsuranceClaim,
  PreAuthorization,
  CLAIM_STATUS,
  PREAUTH_STATUS,
} from '../models/Insurance.model.js';
import { generateNumber, NUMBER_PREFIXES } from '../utils/numberGenerator.js';
import { BadRequestError, NotFoundError, ConflictError } from '../utils/ApiError.js';
import { writeAudit } from '../middleware/audit.js';
import { round2 } from './billing.service.js';

const round2p = (n) => round2(n);

export const ctxOf = (req) => ({ user: req.user, query: req.query, body: req.body });

const ctxUser = (ctx) => ctx?.user || {};
const ctxQuery = (ctx) => ctx?.query || {};

const applyBranch = (ctx, filter) => {
  if (ctxUser(ctx).branchId) filter.branchId = ctxUser(ctx).branchId;
  else if (ctxUser(ctx).hospitalId) filter.hospitalId = ctxUser(ctx).hospitalId;
};

// ============ COMPANIES ============

export const listCompanies = async (ctx = {}) => {
  const filter = {};
  if (ctxQuery(ctx).active !== undefined) filter.active = ctxQuery(ctx).active === 'true';
  applyBranch(ctx, filter);
  return InsuranceCompany.find(filter).sort({ name: 1 });
};

export const createCompany = async (data, ctx = {}) => {
  const company = await InsuranceCompany.create({
    ...data,
    hospitalId: ctxUser(ctx).hospitalId,
    branchId: ctxUser(ctx).branchId,
  });
  await writeAudit({ user: ctxUser(ctx), action: 'INSURANCE_COMPANY_CREATE', module: 'insurance', entityId: company._id, entityType: 'InsuranceCompany' });
  return company;
};

export const updateCompany = async (id, data, ctx = {}) => {
  const company = await InsuranceCompany.findById(id);
  if (!company) throw new NotFoundError('Insurance company not found');
  Object.assign(company, data);
  await company.save();
  await writeAudit({ user: ctxUser(ctx), action: 'INSURANCE_COMPANY_UPDATE', module: 'insurance', entityId: company._id, entityType: 'InsuranceCompany' });
  return company;
};

// ============ POLICIES ============

export const createPolicy = async (data, ctx = {}) => {
  const company = await InsuranceCompany.findById(data.companyId);
  if (!company) throw new NotFoundError('Insurance company not found');
  if (!company.active) throw new BadRequestError('Inactive company cannot issue policies');

  const policy = await InsurancePolicy.create({
    ...data,
    hospitalId: ctxUser(ctx).hospitalId,
    branchId: ctxUser(ctx).branchId,
  });
  await writeAudit({ user: ctxUser(ctx), action: 'INSURANCE_POLICY_CREATE', module: 'insurance', entityId: policy._id, entityType: 'InsurancePolicy' });
  return InsurancePolicy.findById(policy._id).populate('companyId', 'name code').populate('patientId', 'uhid firstName lastName mobile');
};

export const listPolicies = async (ctx = {}) => {
  const page = Math.max(parseInt(ctxQuery(ctx).page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(ctxQuery(ctx).limit, 10) || 20, 1), 100);
  const filter = {};
  if (ctxQuery(ctx).patientId) filter.patientId = ctxQuery(ctx).patientId;
  if (ctxQuery(ctx).companyId) filter.companyId = ctxQuery(ctx).companyId;
  if (ctxQuery(ctx).active !== undefined) filter.active = ctxQuery(ctx).active === 'true';
  applyBranch(ctx, filter);
  const [total, data] = await Promise.all([
    InsurancePolicy.countDocuments(filter),
    InsurancePolicy.find(filter).populate('companyId', 'name code').populate('patientId', 'uhid firstName lastName mobile').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
  ]);
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

export const getPolicy = async (id) => {
  const policy = await InsurancePolicy.findById(id).populate('companyId', 'name code').populate('patientId', 'uhid firstName lastName mobile');
  if (!policy) throw new NotFoundError('Policy not found');
  return policy;
};

// ============ PRE-AUTHORIZATIONS ============

export const createPreAuth = async (data, ctx = {}) => {
  const policy = await InsurancePolicy.findById(data.policyId);
  if (!policy) throw new NotFoundError('Policy not found');
  if (!policy.active) throw new BadRequestError('Inactive policy cannot be used for pre-authorization');

  const preAuthNumber = await generateNumber(NUMBER_PREFIXES.PREAUTH, new Date().getFullYear());
  const preAuth = await PreAuthorization.create({
    ...data,
    preAuthNumber,
    companyId: policy.companyId,
    createdBy: ctxUser(ctx).id,
    hospitalId: ctxUser(ctx).hospitalId,
    branchId: ctxUser(ctx).branchId,
  });
  await writeAudit({ user: ctxUser(ctx), action: 'INSURANCE_PREAUTH_CREATE', module: 'insurance', entityId: preAuth._id, entityType: 'PreAuthorization' });
  return PreAuthorization.findById(preAuth._id).populate('companyId', 'name code').populate('patientId', 'uhid firstName lastName mobile');
};

export const decidePreAuth = async (id, data, ctx = {}) => {
  const preAuth = await PreAuthorization.findById(id);
  if (!preAuth) throw new NotFoundError('Pre-authorization not found');
  if (preAuth.status !== PREAUTH_STATUS.PENDING) throw new ConflictError('Pre-authorization is already decided');

  const decision = data.decision;
  if (!['APPROVED', 'PARTIALLY_APPROVED', 'REJECTED'].includes(decision)) throw new BadRequestError('Decision must be APPROVED, PARTIALLY_APPROVED or REJECTED');

  preAuth.status = decision;
  if (decision !== 'REJECTED') {
    if (data.approvedAmount == null || data.approvedAmount < 0) throw new BadRequestError('Approved amount required for approval decisions');
    preAuth.approvedAmount = round2p(data.approvedAmount);
  } else {
    preAuth.approvedAmount = 0;
  }
  preAuth.decidedBy = ctxUser(ctx).id;
  preAuth.decidedAt = new Date();
  preAuth.remarks = data.remarks || preAuth.remarks;
  await preAuth.save();
  await writeAudit({ user: ctxUser(ctx), action: `INSURANCE_PREAUTH_${decision}`, module: 'insurance', entityId: preAuth._id, entityType: 'PreAuthorization', data: { requestedAmount: preAuth.requestedAmount, approvedAmount: preAuth.approvedAmount } });
  return PreAuthorization.findById(preAuth._id).populate('companyId', 'name code').populate('patientId', 'uhid firstName lastName mobile');
};

export const listPreAuths = async (ctx = {}) => {
  const page = Math.max(parseInt(ctxQuery(ctx).page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(ctxQuery(ctx).limit, 10) || 20, 1), 100);
  const filter = {};
  if (ctxQuery(ctx).status) filter.status = ctxQuery(ctx).status;
  if (ctxQuery(ctx).patientId) filter.patientId = ctxQuery(ctx).patientId;
  if (ctxQuery(ctx).policyId) filter.policyId = ctxQuery(ctx).policyId;
  applyBranch(ctx, filter);
  const [total, data] = await Promise.all([
    PreAuthorization.countDocuments(filter),
    PreAuthorization.find(filter).populate('companyId', 'name code').populate('patientId', 'uhid firstName lastName mobile').sort({ requestedDate: -1 }).skip((page - 1) * limit).limit(limit),
  ]);
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

export const getPreAuth = async (id) => {
  const preAuth = await PreAuthorization.findById(id).populate('companyId', 'name code').populate('patientId', 'uhid firstName lastName mobile');
  if (!preAuth) throw new NotFoundError('Pre-authorization not found');
  return preAuth;
};

// ============ CLAIMS ============

export const createClaim = async (data, ctx = {}) => {
  const policy = await InsurancePolicy.findById(data.policyId);
  if (!policy) throw new NotFoundError('Policy not found');
  const claimNumber = await generateNumber(NUMBER_PREFIXES.CLAIM, new Date().getFullYear());
  const claim = await InsuranceClaim.create({
    ...data,
    claimNumber,
    companyId: policy.companyId,
    createdBy: ctxUser(ctx).id,
    hospitalId: ctxUser(ctx).hospitalId,
    branchId: ctxUser(ctx).branchId,
  });
  await writeAudit({ user: ctxUser(ctx), action: 'CLAIM_CREATE', module: 'insurance', entityId: claim._id, entityType: 'InsuranceClaim' });
  return getClaim(claim._id);
};

export const submitClaim = async (id, ctx = {}) => {
  const claim = await InsuranceClaim.findById(id);
  if (!claim) throw new NotFoundError('Claim not found');
  if (claim.status !== CLAIM_STATUS.DRAFT) throw new ConflictError('Only DRAFT claims may be submitted');
  if (!claim.claimedAmount || claim.claimedAmount <= 0) throw new BadRequestError('Claimed amount required before submission');
  claim.status = CLAIM_STATUS.SUBMITTED;
  claim.submittedAt = new Date();
  await claim.save();
  await writeAudit({ user: ctxUser(ctx), action: 'CLAIM_SUBMIT', module: 'insurance', entityId: claim._id, entityType: 'InsuranceClaim' });
  return getClaim(claim._id);
};

export const decideClaim = async (id, data, ctx = {}) => {
  const claim = await InsuranceClaim.findById(id);
  if (!claim) throw new NotFoundError('Claim not found');
  if (![CLAIM_STATUS.SUBMITTED, CLAIM_STATUS.APPROVED, CLAIM_STATUS.PARTIALLY_APPROVED].includes(claim.status)) {
    throw new ConflictError('Claim is not in a decisionable state');
  }
  const decision = data.decision;
  if (!['APPROVED', 'PARTIALLY_APPROVED', 'REJECTED'].includes(decision)) throw new BadRequestError('Decision must be APPROVED, PARTIALLY_APPROVED or REJECTED');

  if (decision === 'REJECTED') {
    claim.status = CLAIM_STATUS.REJECTED;
    claim.approvedAmount = 0;
    claim.rejectedAmount = round2p(claim.claimedAmount);
    claim.insuranceResponsibility = 0;
    claim.patientResponsibility = round2p(claim.claimedAmount);
  } else {
    if (data.approvedAmount == null || data.approvedAmount < 0) throw new BadRequestError('Approved amount required for approval decisions');
    const approved = round2p(Math.min(data.approvedAmount, claim.claimedAmount));
    claim.approvedAmount = approved;
    claim.rejectedAmount = round2p(claim.claimedAmount - approved);
    claim.insuranceResponsibility = approved;
    claim.patientResponsibility = data.patientResponsibility != null ? round2p(data.patientResponsibility) : round2p(Math.max(claim.claimedAmount - approved, 0));
    claim.status = decision;
  }
  claim.approvedAt = new Date();
  claim.remarks = data.remarks || claim.remarks;
  await claim.save();
  await writeAudit({ user: ctxUser(ctx), action: `CLAIM_${decision}`, module: 'insurance', entityId: claim._id, entityType: 'InsuranceClaim', data: { approvedAmount: claim.approvedAmount, rejectedAmount: claim.rejectedAmount, patientResponsibility: claim.patientResponsibility } });
  return getClaim(claim._id);
};

export const settleClaim = async (id, ctx = {}) => {
  const claim = await InsuranceClaim.findById(id);
  if (!claim) throw new NotFoundError('Claim not found');
  if (![CLAIM_STATUS.APPROVED, CLAIM_STATUS.PARTIALLY_APPROVED].includes(claim.status)) {
    throw new ConflictError('Only approved claims may be settled');
  }
  claim.status = CLAIM_STATUS.SETTLED;
  claim.settledAt = new Date();
  claim.settlementAmount = round2p(claim.insuranceResponsibility || claim.approvedAmount || 0);
  await claim.save();
  await writeAudit({ user: ctxUser(ctx), action: 'CLAIM_SETTLE', module: 'insurance', entityId: claim._id, entityType: 'InsuranceClaim', data: { settlementAmount: claim.settlementAmount } });
  return getClaim(claim._id);
};

export const listClaims = async (ctx = {}) => {
  const page = Math.max(parseInt(ctxQuery(ctx).page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(ctxQuery(ctx).limit, 10) || 20, 1), 100);
  const filter = {};
  if (ctxQuery(ctx).status) filter.status = ctxQuery(ctx).status;
  if (ctxQuery(ctx).patientId) filter.patientId = ctxQuery(ctx).patientId;
  if (ctxQuery(ctx).companyId) filter.companyId = ctxQuery(ctx).companyId;
  if (ctxQuery(ctx).preAuthorizationNumber) filter.preAuthorizationNumber = ctxQuery(ctx).preAuthorizationNumber;
  applyBranch(ctx, filter);
  const [total, data] = await Promise.all([
    InsuranceClaim.countDocuments(filter),
    InsuranceClaim.find(filter).populate('companyId', 'name code').populate('patientId', 'uhid firstName lastName mobile').sort({ claimDate: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit),
  ]);
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

export const getClaim = async (id) => {
  const claim = await InsuranceClaim.findById(id).populate('companyId', 'name code').populate('patientId', 'uhid firstName lastName mobile').populate('policyId', 'policyNumber sumInsured');
  if (!claim) throw new NotFoundError('Claim not found');
  return claim;
};