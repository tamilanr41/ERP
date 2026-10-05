import ModuleRecord, { WORKFLOW_STATUS } from '../models/ModuleRecord.model.js';
import { generateNumber } from '../utils/numberGenerator.js';
import { NotFoundError, BadRequestError } from '../utils/ApiError.js';

const PREFIXES = Object.freeze({
  telehealth: 'TLH',
  'patient-portal': 'PPR',
  dialysis: 'DLY',
  multiward: 'MWD',
  mrd: 'MRD',
  theatre: 'OTH',
  cssd: 'CSS',
  catering: 'CAT',
  equipment: 'EQP',
  housekeeping: 'HSK',
  purchase: 'PSC',
  hrm: 'HRM',
  finance: 'FIN',
  ticketing: 'TCK',
  ambulance: 'AMB',
  ophthalmology: 'OPH',
  physiotherapy: 'PTH',
  admin: 'ADM',
  bloodbank: 'BLD',
  assets: 'AST',
  radiology: 'RDL',
  multispeciality: 'MSP',
  others: 'OTHR',
  opd: 'OPD',
  ipd: 'IPD',
  pharmacy: 'PHM',
  lab: 'LAB',
  billing: 'BIL',
  insurance: 'INS',
});

export const prefixFor = (moduleKey) =>
  PREFIXES[moduleKey] || moduleKey.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'WRK';

const safe = (v) => (v == null ? undefined : v);

export const buildFilter = ({ module, workflow, status, priority, q } = {}) => {
  const filter = { active: true };
  if (module) filter.module = module;
  if (workflow) filter.workflow = workflow;
  if (status) filter.status = status;
  if (priority) filter.priority = priority;
  if (q && String(q).trim()) {
    const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ title: rx }, { reference: rx }, { assignee: rx }, { notes: rx }, { recordNumber: rx }];
  }
  return filter;
};

export const listModuleRecords = async ({ module, workflow, status, priority, q, page = 1, limit = 20, hospitalId } = {}) => {
  const pg = Math.max(1, Number(page) || 1);
  const lm = Math.min(500, Math.max(1, Number(limit) || 20));
  const filter = buildFilter({ module, workflow, status, priority, q });
  if (hospitalId) filter.hospitalId = hospitalId;

  const [total, rows] = await Promise.all([
    ModuleRecord.countDocuments(filter),
    ModuleRecord.find(filter).sort({ updatedAt: -1 }).skip((pg - 1) * lm).limit(lm).lean(),
  ]);

  return { data: rows, pagination: { page: pg, limit: lm, total, pages: Math.max(1, Math.ceil(total / lm)) } };
};

export const getModuleRecord = async (id) => {
  const record = await ModuleRecord.findById(id).lean();
  if (!record) throw new NotFoundError('Record not found');
  return record;
};

export const createModuleRecord = async ({ module, workflow, ...body }, ctx = {}) => {
  if (!module || !workflow) throw new BadRequestError('module and workflow are required');
  if (!body.title) throw new BadRequestError('Title is required');
  const now = new Date().getFullYear();
  const recordNumber = await generateNumber(`${prefixFor(module)}-WORK`, now);
  return ModuleRecord.create({
    module,
    workflow,
    recordNumber,
    title: body.title,
    reference: safe(body.reference),
    assignee: safe(body.assignee),
    priority: safe(body.priority) || 'MEDIUM',
    status: safe(body.status) || WORKFLOW_STATUS.PENDING,
    amount: Number(body.amount) || 0,
    quantity: Number(body.quantity) || 0,
    scheduledDate: body.scheduledDate ? new Date(body.scheduledDate) : undefined,
    dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
    notes: safe(body.notes),
    data: body.data || {},
    createdBy: ctx.userId,
    hospitalId: ctx.hospitalId,
    branchId: ctx.branchId,
  });
};

export const updateModuleRecord = async (id, body, ctx = {}) => {
  const record = await ModuleRecord.findById(id);
  if (!record) throw new NotFoundError('Record not found');
  const patch = {};
  if (body.title !== undefined) patch.title = body.title;
  if (body.reference !== undefined) patch.reference = body.reference;
  if (body.assignee !== undefined) patch.assignee = body.assignee;
  if (body.priority !== undefined) patch.priority = body.priority;
  if (body.status !== undefined) patch.status = body.status;
  if (body.amount !== undefined) patch.amount = Number(body.amount) || 0;
  if (body.quantity !== undefined) patch.quantity = Number(body.quantity) || 0;
  if (body.scheduledDate !== undefined) patch.scheduledDate = body.scheduledDate ? new Date(body.scheduledDate) : null;
  if (body.dueDate !== undefined) patch.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  if (body.notes !== undefined) patch.notes = body.notes;
  if (body.data !== undefined) patch.data = body.data;
  Object.assign(record, patch);
  return record.save();
};

export const setRecordStatus = async (id, status) => {
  if (!Object.values(WORKFLOW_STATUS).includes(status)) throw new BadRequestError('Invalid status');
  const record = await ModuleRecord.findById(id);
  if (!record) throw new NotFoundError('Record not found');
  record.status = status;
  return record.save();
};

export const removeModuleRecord = async (id) => {
  const record = await ModuleRecord.findById(id);
  if (!record) throw new NotFoundError('Record not found');
  record.active = false;
  return record.save();
};

export const getModuleSummary = async ({ module, workflow, hospitalId } = {}) => {
  const filter = { active: true };
  if (module) filter.module = module;
  if (workflow) filter.workflow = workflow;
  if (hospitalId) filter.hospitalId = hospitalId;

  const [total, byStatus, today] = await Promise.all([
    ModuleRecord.countDocuments(filter),
    ModuleRecord.aggregate([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    ModuleRecord.countDocuments({ ...filter, updatedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } }),
  ]);

  const statusBreakdown = Object.fromEntries(Object.values(WORKFLOW_STATUS).map((s) => [s, 0]));
  byStatus.forEach((r) => { if (statusBreakdown[r._id] !== undefined) statusBreakdown[r._id] = r.count; });

  return { total, today, statusBreakdown };
};

export default {
  listModuleRecords,
  getModuleRecord,
  createModuleRecord,
  updateModuleRecord,
  setRecordStatus,
  removeModuleRecord,
  getModuleSummary,
  prefixFor,
};