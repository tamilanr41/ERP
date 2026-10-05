import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { regex } from '../utils/helpers.js';
import { BadRequestError, NotFoundError } from '../utils/ApiError.js';
import { collectionSummary, listBills, listPayments, outstandingReport } from './billing.service.js';
import { listPatients } from './patient.service.js';
import { listOpdVisits } from './opd.service.js';
import { listAdmissions } from './ipd.service.js';
import { getExpiringMedicines, getLowStock, listSales, listPurchases } from './pharmacy.service.js';
import { listLabOrders } from './lab.service.js';

export const REPORT_BUILDERS = {
  patients: async (q) => (await listPatients({ ...q, limit: 100 })).data,
  opd: async (q) => (await listOpdVisits(q)).data,
  ipd: async (q) => (await listAdmissions(q)).data,
  bills: async (q) => (await listBills(q)).data,
  payments: async (q) => (await listPayments(q)).data,
  pharmacy_sales: async (q) => (await listSales(q)).data,
  pharmacy_purchases: async (q) => (await listPurchases(q)).data,
  lab_orders: async (q) => (await listLabOrders(q)).data,
  collection: async (q) => (await collectionSummary(q)).byMode,
  outstanding: async () => (await outstandingReport()).bills,
  expiring: async (q) => getExpiringMedicines(q.days || 90),
  low_stock: async () => getLowStock(),
};

export const flatten = (rows) => {
  if (!rows?.length) return [];
  rows = rows.map((r) => (r && typeof r.toJSON === 'function' ? r.toJSON() : r));
  const headers = new Set();
  const extract = (obj, prefix = '') => {
    const out = {};
    for (const [k, v] of Object.entries(obj || {})) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && typeof v.toHexString === 'function') {
        out[key] = v.toHexString();
      } else if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
        Object.assign(out, extract(v, key));
      } else {
        out[key] = v instanceof Date ? v.toISOString().slice(0, 10) : v;
      }
    }
    return out;
  };
  const flat = rows.map(extract);
  flat.forEach((r) => Object.keys(r).forEach((k) => headers.add(k)));
  const skip = ['passwordHash', 'refreshTokens', 'deletedAt', '__v'];
  const headerList = [...headers].filter((h) => !skip.includes(h));
  return { flat, headerList };
};

export const runReport = async (reportName, query) => {
  const builder = REPORT_BUILDERS[reportName];
  if (!builder) throw new BadRequestError(`Unknown report: ${reportName}`);
  const rows = await builder(query || {});
  return rows;
};

export const toCSV = (rows) => {
  const { flat, headerList } = flatten(rows);
  const escape = (v) => {
    const s = v?.toString?.() ?? '';
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headerList.join(',')];
  for (const row of flat) {
    lines.push(headerList.map((h) => escape(row[h])).join(','));
  }
  return lines.join('\n');
};

export const toExcel = async (rows) => {
  const { flat, headerList } = flatten(rows);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Report');
  ws.columns = headerList.map((h) => ({ header: h, key: h, width: Math.max(h.length + 2, 14) }));
  ws.addRows(flat.map((r) => headerList.reduce((acc, h) => { acc[h] = r[h]; return acc; }, {})));
  ws.getRow(1).font = { bold: true };
  const buffer = await wb.xlsx.writeBuffer();
  return buffer;
};

export const toPDF = (reportName, rows) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text(`${reportName.toUpperCase()} REPORT`, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor('#555').text(`Generated ${new Date().toLocaleString()}`, { align: 'center' });
    doc.moveDown();
    doc.fillColor('#000').fontSize(10);

    const { flat, headerList } = flatten(rows);
    const cols = headerList.slice(0, 8);
    const colW = 515 / cols.length;
    const pad = 4;

    const drawRow = (row, isHeader) => {
      const x0 = doc.x;
      const y = doc.y;
      const heights = cols.map((c) => {
        const text = String(row[c] ?? '');
        return Math.max(14, doc.heightOfString(text, { width: colW - pad * 2, fontSize: isHeader ? 8 : 7 }));
      });
      const rowH = Math.max(...heights) + pad;
      if (y + rowH > doc.page.height - doc.page.margins.bottom) doc.addPage();
      cols.forEach((c, i) => {
        const x = x0 + i * colW;
        doc.rect(x, doc.y, colW, rowH).stroke('#ccc').fillColor(isHeader ? '#f0f4f8' : '#ffffff');
        doc.fillColor('#111').fontSize(isHeader ? 8 : 7).text(String(row[c] ?? ''), x + pad, doc.y + pad, { width: colW - pad * 2 });
      });
      doc.y += rowH;
      doc.x = x0;
    };

    drawRow(Object.fromEntries(cols.map((c) => [c, c.toUpperCase()])), true);
    flat.slice(0, 500).forEach((row) => drawRow(row, false));

    doc.end();
  });

export const patientsReport = (rows) => ({
  patientId: rows.map((r) => ({ UHID: r.uhid, Name: r.fullName?.() || `${r.firstName} ${r.lastName || ''}`, Mobile: r.mobile, Gender: r.gender, BloodGroup: r.bloodGroup, City: r.address?.city, Registered: r.registrationDate?.toISOString().slice(0, 10) })),
});