import Counter from '../models/Counter.model.js';

export const NUMBER_PREFIXES = Object.freeze({
  PATIENT_UHID: 'UHID',
  OPD: 'OPD',
  ADMISSION: 'ADM',
  APPOINTMENT: 'APT',
  PRESCRIPTION: 'RX',
  LAB_ORDER: 'LB',
  LAB_SAMPLE: 'SB',
  RADIOLOGY_ORDER: 'RD',
  RADIOLOGY_ACCESSION: 'ACN',
  BILL: 'INV',
  PAYMENT: 'PAY',
  RECEIPT: 'RCPT',
  REFUND: 'RF',
  FOLLOWUP: 'FU',
  CLAIM: 'CLM',
  PREAUTH: 'PRA',
  CASHIER_SHIFT: 'SHFT',
  PH_SALE: 'PHS',
  PH_SALE_RETURN: 'PHSR',
  PURCHASE: 'PCH',
});

const pad = (n, w = 6) => String(n).padStart(w, '0');
const buildKey = (prefix, year) => `${prefix}:${year}`;

export async function generateNumber(prefix, year = null, session = null) {
  const yr = year || new Date().getFullYear();
  const key = buildKey(prefix, yr);
  const counter = await Counter.findOneAndUpdate(
    { key, prefix, year: yr },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).session(session || null);
  return `${prefix}-${yr}-${pad(counter.seq)}`;
}

export async function generateNumberWithReset(prefix, year = null, session = null) {
  return generateNumber(prefix, year, session);
}

export async function generateUHID(session = null) {
  const counter = await Counter.findOneAndUpdate(
    { key: 'ZMC:UHID' },
    { $inc: { seq: 1 }, $setOnInsert: { prefix: 'ZMC', year: 0 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).session(session || null);
  return `ZMC-${String(counter.seq).padStart(7, '0')}`;
}

export async function generateOpdNumber(session = null) {
  const now = new Date();
  const pad2 = (n) => String(n).padStart(2, '0');
  const d = `${String(now.getFullYear()).slice(2)}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
  const key = buildKey('OPD', d);
  const counter = await Counter.findOneAndUpdate(
    { key, prefix: 'OP', year: d },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).session(session || null);
  return `OP-${d}-${String(counter.seq).padStart(3, '0')}`;
}

export default { generateNumber, generateNumberWithReset, generateUHID, NUMBER_PREFIXES };