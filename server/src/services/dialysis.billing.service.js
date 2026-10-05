import mongoose from 'mongoose';
import { DialysisSession, SESSION_STATUS } from '../models/DialysisSession.model.js';
import { DialysisPatient } from '../models/DialysisPatient.model.js';
import { DialysisConsumable } from '../models/DialysisConsumable.model.js';
import { DialysisAccess } from '../models/DialysisAccess.model.js';
import IpdServiceCharge, { IPD_SERVICE_CODES } from '../models/IpdServiceCharge.model.js';
import Bill from '../models/Bill.model.js';
import Payment from '../models/Payment.model.js';
import { InsurancePolicy } from '../models/Insurance.model.js';
import { writeAudit } from '../middleware/audit.js';
import { startOfLocalDay, endOfLocalDay } from './dialysis.config.service.js';
import { BadRequestError, NotFoundError } from '../utils/ApiError.js';

/** Ensures the dialysis session charge exists in the IPD charge catalogue. */
export const ensureDialysisCharge = async (logger = console) => {
  try {
    const existing = await IpdServiceCharge.findOne({ serviceCode: IPD_SERVICE_CODES.DIALYSIS });
    if (existing) return existing;
    const [charge] = await IpdServiceCharge.create([{
      serviceCode: IPD_SERVICE_CODES.DIALYSIS,
      name: 'Dialysis session',
      label: 'Dialysis session',
      rate: 1800,
      frequency: 'PER_SESSION',
      autoCapture: false,
      billedAtSource: true,
      departmentName: 'Dialysis',
      active: true,
    }]);
    logger.log?.('   ↳ Dialysis charge configured');
    return charge;
  } catch (err) {
    logger.warn?.('   ↳ Dialysis charge config skipped:', err.message);
    return null;
  }
};

export const getChargeConfig = async () => {
  const charge = await IpdServiceCharge.findOne({ serviceCode: IPD_SERVICE_CODES.DIALYSIS }).lean();
  return charge || { serviceCode: IPD_SERVICE_CODES.DIALYSIS, name: 'Dialysis session', rate: 0, active: false };
};

export const updateChargeConfig = async (payload, actor) => {
  const charge = await IpdServiceCharge.findOne({ serviceCode: IPD_SERVICE_CODES.DIALYSIS });
  if (!charge) throw new NotFoundError('Dialysis charge is not configured');
  const before = charge.toObject();
  ['rate', 'active', 'name', 'taxPct', 'notes'].forEach((k) => { if (payload[k] !== undefined) charge[k] = payload[k]; });
  await charge.save();
  await writeAudit({
    user: actor, action: 'DIALYSIS_CHARGE_UPDATE', module: 'dialysis', entityId: charge._id, entityType: 'IpdServiceCharge',
    data: { before: { rate: before.rate, active: before.active }, after: { rate: charge.rate, active: charge.active } },
  });
  return charge;
};

// ============================================================
// PATIENT 360 — complete dialysis profile
// ============================================================
export const patient360 = async (dialysisPatientId) => {
  const record = await DialysisPatient.findById(dialysisPatientId)
    .populate('patientId', 'uhid firstName lastName gender age bloodGroup mobile address emergencyContact email')
    .populate('nephrologistId', 'name specialization departmentId')
    .populate('referringDoctorId', 'name')
    .populate('departmentId', 'name')
    .populate('insurancePolicyId', 'companyName policyNumber coverageAmount tpaName validTill');
  if (!record) throw new NotFoundError('Dialysis patient not found');

  const patientId = record.patientId?._id;
  const [sessions, prescriptions, bills, payments, consumables, access] = await Promise.all([
    DialysisSession.find({ patientId })
      .populate('machineId', 'code name')
      .populate('stationId', 'code name')
      .populate('doctorId', 'name')
      .populate('nurseId', 'name')
      .sort({ sessionDate: -1 })
      .limit(200)
      .lean(),
    mongoose.model('DialysisPrescription').find({ patientId })
      .populate('prescribedBy', 'name specialization')
      .sort({ prescribedAt: -1 })
      .limit(50)
      .lean(),
    Bill.find({ patientId, billType: 'DIALYSIS' }).sort({ billDate: -1 }).limit(100).lean(),
    Payment.find({ patientId }).sort({ paidAt: -1 }).limit(100).populate('billId', 'billNumber billType').lean(),
    DialysisConsumable.find({ active: true }).sort({ category: 1, name: 1 }).lean(),
    DialysisAccess.find({ patientId }).populate('operatedBy', 'name').sort({ isPrimary: -1, createdAt: -1 }).lean(),
  ]);

  const withComplications = sessions.filter((s) => (s.complications || []).length > 0);
  const weights = sessions.filter((s) => s.preWeightKg).sort((a, b) => new Date(a.sessionDate) - new Date(b.sessionDate));

  // IPD / OPD links so the rest of the hospital sees the same patient
  const [{ default: IpdAdmission }, { default: OpdVisit }] = await Promise.all([
    import('../models/IpdAdmission.model.js'),
    import('../models/OpdVisit.model.js'),
  ]);
  const [admissions, visits, labs, clinicalNotes] = await Promise.all([
    IpdAdmission.find({ patientId }).sort({ admittedAt: -1 }).limit(10).populate('bedId', 'bedNumber').lean(),
    OpdVisit.find({ patientId }).sort({ visitDate: -1 }).limit(10).lean(),
    mongoose.model('LabResult').find({ patientId }).sort({ enteredAt: -1 }).limit(25).populate('labTestId', 'name').lean(),
    mongoose.model('ClinicalNote').find({ patientId }).sort({ createdAt: -1 }).limit(25).lean(),
  ]);

  const totals = sessions.reduce((acc, s) => {
    if ([SESSION_STATUS.COMPLETED, SESSION_STATUS.BILLED, SESSION_STATUS.CLOSED].includes(s.status)) {
      acc.completed += 1;
      acc.ufRemovedMl += Number(s.ufRemovedMl || 0);
      acc.durationMinutes += Number(s.durationMinutes || 0);
      acc.billed += Number(s.totalAmount || 0);
    }
    if (s.cancelled) acc.cancelled += 1;
    if (s.status === SESSION_STATUS.NO_SHOW) acc.noShow += 1;
    return acc;
  }, { completed: 0, cancelled: 0, noShow: 0, ufRemovedMl: 0, durationMinutes: 0, billed: 0 });

  return {
    patient: record,
    summary: {
      totalSessions: sessions.length,
      completedSessions: totals.completed,
      cancelledSessions: totals.cancelled,
      noShowSessions: totals.noShow,
      complicationSessions: withComplications.length,
      totalUfRemovedMl: totals.ufRemovedMl,
      totalDialysisMinutes: totals.durationMinutes,
      totalBilled: Math.round(totals.billed * 100) / 100,
      paidAmount: payments.reduce((s, p) => s + (p.amount || 0), 0),
      outstanding: bills.reduce((s, b) => s + (b.dueAmount || 0), 0),
      firstSession: sessions.length ? sessions[sessions.length - 1].sessionDate : null,
      lastSession: sessions.length ? sessions[0].sessionDate : null,
      weightTrend: weights.slice(-12).map((s) => ({ date: s.sessionDate, pre: s.preWeightKg, post: s.postWeightKg, dry: s.prescriptionSnapshot?.targetDryWeightKg })),
      lastVitals: sessions.find((s) => s.postAssessment?.assessedAt)?.postAssessment || null,
      insurance: record.insurancePolicyId || null,
    },
    sessions,
    prescriptions,
    bills,
    payments,
    consumables,
    access,
    admissions,
    visits,
    labs,
    clinicalNotes,
  };
};

// ============================================================
// REPORTS
// ============================================================
const REPORT_DEFS = [
  {
    key: 'dialysis_roster',
    group: 'OPERATIONS',
    name: 'Dialysis roster (day)',
    description: 'Every session of the day with machine, station, staff and status',
    build: async ({ date }) => {
      const sessions = await daySessions(date);
      return {
        columns: ['Session No', 'Time', 'Shift', 'Patient', 'UHID', 'Dialysis ID', 'Machine', 'Station', 'Doctor', 'Nurse', 'Status', 'Priority'],
        rows: sessions.map((s) => [
          s.sessionNumber,
          s.scheduledStart ? new Date(s.scheduledStart).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '',
          s.shift,
          `${s.patientId?.firstName || ''} ${s.patientId?.lastName || ''}`.trim(),
          s.patientId?.uhid || '',
          s.dialysisPatientId?.dialysisNumber || '',
          s.machineId?.code || '',
          s.stationId?.code || '',
          s.doctorId?.name || '',
          s.nurseId?.name || '',
          s.status,
          s.priority,
        ]),
      };
    },
  },
  {
    key: 'dialysis_completion',
    group: 'CLINICAL',
    name: 'Session completion & adequacy',
    description: 'Completed sessions with weight change, UF delivered and duration',
    build: async ({ from, to }) => {
      const sessions = await rangeSessions({ from, to, statuses: [SESSION_STATUS.COMPLETED, SESSION_STATUS.BILLED, SESSION_STATUS.CLOSED] });
      return {
        columns: ['Session No', 'Date', 'Patient', 'Machine', 'Pre wt', 'Post wt', 'Change', 'UF goal', 'UF removed', 'Delivered %', 'Duration (min)', 'Status'],
        rows: sessions.map((s) => [
          s.sessionNumber,
          fmtDate(s.sessionDate),
          `${s.patientId?.firstName || ''} ${s.patientId?.lastName || ''}`.trim(),
          s.machineId?.code || '',
          s.preWeightKg ?? '',
          s.postWeightKg ?? '',
          s.weightChangeKg ?? '',
          s.ufGoalMl ?? '',
          s.ufRemovedMl ?? '',
          s.ufDeliveredPct ?? '',
          s.durationMinutes ?? '',
          s.status,
        ]),
        totals: {
          sessions: sessions.length,
          ufRemovedMl: sum(sessions, (s) => s.ufRemovedMl),
          totalMinutes: sum(sessions, (s) => s.durationMinutes),
          avgDeliveredPct: sessions.length ? Math.round(sum(sessions, (s) => s.ufDeliveredPct || 0) / sessions.length) : 0,
        },
      };
    },
  },
  {
    key: 'dialysis_complications',
    group: 'CLINICAL',
    name: 'Complications log',
    description: 'Every complication with severity, management and resolution',
    build: async ({ from, to }) => {
      const sessions = await rangeSessions({ from, to });
      const rows = [];
      for (const s of sessions) {
        for (const c of s.complications || []) {
          rows.push([
            s.sessionNumber,
            fmtDate(s.occurredAt || s.sessionDate),
            `${s.patientId?.firstName || ''} ${s.patientId?.lastName || ''}`.trim(),
            s.patientId?.uhid || '',
            c.type,
            c.severity,
            fmtDate(c.occurredAt),
            c.management || '',
            c.resolved ? 'Resolved' : 'Open',
          ]);
        }
      }
      return {
        columns: ['Session No', 'Date', 'Patient', 'UHID', 'Complication', 'Severity', 'Occurred at', 'Management', 'State'],
        rows,
        totals: { complications: rows.length, sessionsAffected: new Set(rows.map((r) => r[0])).size },
      };
    },
  },
  {
    key: 'dialysis_hypotension',
    group: 'CLINICAL',
    name: 'Intra-dialytic hypotension',
    description: 'Sessions with symptomatic hypotension and corrective action',
    build: async ({ from, to }) => {
      const sessions = await rangeSessions({ from, to });
      const rows = sessions
        .filter((s) => (s.complications || []).some((c) => String(c.type).toUpperCase().includes('HYPOTENSION')))
        .map((s) => {
          const c = s.complications.find((x) => String(x.type).toUpperCase().includes('HYPOTENSION'));
          return [
            s.sessionNumber,
            fmtDate(s.sessionDate),
            `${s.patientId?.firstName || ''} ${s.patientId?.lastName || ''}`.trim(),
            s.patientId?.uhid || '',
            c?.vitalsAtOnset?.bpSystolic ?? '',
            c?.vitalsAtOnset?.bpDiastolic ?? '',
            (c?.medicationGiven || []).join(', ') || c?.management || '',
            s.ufRemovedMl ?? '',
          ];
        });
      return { columns: ['Session No', 'Date', 'Patient', 'UHID', 'Systolic', 'Diastolic', 'Treatment', 'UF removed'], rows, totals: { episodes: rows.length } };
    },
  },
  {
    key: 'dialysis_machines',
    group: 'OPERATIONS',
    name: 'Machine utilisation',
    description: 'Sessions and hours per machine in the period',
    build: async ({ from, to }) => {
      const sessions = await rangeSessions({ from, to, statuses: [SESSION_STATUS.COMPLETED, SESSION_STATUS.BILLED, SESSION_STATUS.CLOSED] });
      const byMachine = new Map();
      for (const s of sessions) {
        const code = s.machineId?.code || 'Unassigned';
        const cur = byMachine.get(code) || { sessions: 0, minutes: 0, uf: 0 };
        cur.sessions += 1;
        cur.minutes += Number(s.durationMinutes || 0);
        cur.uf += Number(s.ufRemovedMl || 0);
        byMachine.set(code, cur);
      }
      const rows = [...byMachine.entries()].map(([code, v]) => [code, v.sessions, v.minutes, Math.round((v.minutes / 60) * 10) / 10, v.uf, v.sessions ? Math.round((v.minutes / v.sessions)) : 0]);
      return {
        columns: ['Machine', 'Sessions', 'Minutes', 'Hours', 'UF removed (ml)', 'Avg minutes/session'],
        rows,
        totals: { sessions: sum(rows, (r) => r[1]), hours: Math.round(sum(rows, (r) => r[3]) * 10) / 10 },
      };
    },
  },
  {
    key: 'dialysis_revenue',
    group: 'FINANCIAL',
    name: 'Dialysis revenue',
    description: 'Bills, collections and outstanding for dialysis sessions',
    build: async ({ from, to }) => {
      const start = from ? new Date(from) : new Date(Date.now() - 30 * 864e5);
      const end = to ? new Date(to) : new Date();
      const bills = await Bill.find({ billType: 'DIALYSIS', billDate: { $gte: start, $lte: end } }).sort({ billDate: -1 }).lean();
      const rows = bills.map((b) => [
        b.billNumber,
        fmtDate(b.billDate),
        b.patientName || '',
        b.patientUHID || '',
        b.netTotal,
        b.paidAmount,
        b.dueAmount,
        b.status,
      ]);
      return {
        columns: ['Bill No', 'Date', 'Patient', 'UHID', 'Net', 'Paid', 'Due', 'Status'],
        rows,
        totals: {
          bills: bills.length,
          revenue: sum(bills, (b) => b.netTotal),
          collected: sum(bills, (b) => b.paidAmount),
          outstanding: sum(bills, (b) => b.dueAmount),
        },
      };
    },
  },
  {
    key: 'dialysis_consumables',
    group: 'OPERATIONS',
    name: 'Consumable usage',
    description: 'Every consumable issued against a dialysis session',
    build: async ({ from, to }) => {
      const sessions = await rangeSessions({ from, to });
      const rows = [];
      for (const s of sessions) {
        for (const c of s.consumables || []) {
          rows.push([
            s.sessionNumber,
            fmtDate(s.sessionDate),
            `${s.patientId?.firstName || ''} ${s.patientId?.lastName || ''}`.trim(),
            c.code,
            c.name,
            c.quantity,
            c.unit,
            c.total,
          ]);
        }
      }
      return {
        columns: ['Session No', 'Date', 'Patient', 'Code', 'Consumable', 'Qty', 'Unit', 'Amount'],
        rows,
        totals: { issues: rows.length, quantity: sum(rows, (r) => r[5]), value: sum(rows, (r) => r[7]) },
      };
    },
  },
  {
    key: 'dialysis_patient_list',
    group: 'OPERATIONS',
    name: 'Dialysis register',
    description: 'All registered dialysis patients with programme status',
    build: async ({ from, to }) => {
      const patients = await DialysisPatient.find({})
        .populate('patientId', 'uhid firstName lastName age gender bloodGroup mobile')
        .populate('nephrologistId', 'name')
        .sort({ registeredAt: -1 })
        .lean();
      const rows = patients.map((p) => [
        p.dialysisNumber,
        p.patientId?.uhid,
        `${p.patientId?.firstName || ''} ${p.patientId?.lastName || ''}`.trim(),
        p.patientId?.age?.years ?? p.patientId?.age ?? '',
        p.patientId?.gender,
        p.patientId?.bloodGroup,
        p.ckdStage,
        p.dialysisType,
        p.accessType,
        p.nephrologistId?.name || '',
        p.sessionsPerWeek,
        p.completedSessions,
        p.status,
        fmtDate(p.registeredAt),
      ]);
      return {
        columns: ['Dialysis ID', 'UHID', 'Patient', 'Age', 'Gender', 'Blood group', 'CKD stage', 'Type', 'Access', 'Nephrologist', 'Per week', 'Completed', 'Status', 'Registered'],
        rows,
        totals: { patients: patients.length, active: patients.filter((p) => p.status === 'ACTIVE').length },
      };
    },
  },
  {
    key: 'dialysis_no_show',
    group: 'OPERATIONS',
    name: 'No-show & cancellation',
    description: 'Missed sessions with reasons for programme follow-up',
    build: async ({ from, to }) => {
      const sessions = await rangeSessions({ from, to, statuses: [SESSION_STATUS.NO_SHOW, SESSION_STATUS.CANCELLED] });
      return {
        columns: ['Session No', 'Date', 'Patient', 'UHID', 'Dialysis ID', 'Status', 'Reason'],
        rows: sessions.map((s) => [
          s.sessionNumber,
          fmtDate(s.sessionDate),
          `${s.patientId?.firstName || ''} ${s.patientId?.lastName || ''}`.trim(),
          s.patientId?.uhid || '',
          s.dialysisPatientId?.dialysisNumber || '',
          s.status,
          s.cancelReason || s.cancellationReason || '',
        ]),
        totals: { noShow: sessions.filter((s) => s.status === SESSION_STATUS.NO_SHOW).length, cancelled: sessions.filter((s) => s.status === SESSION_STATUS.CANCELLED).length },
      };
    },
  },
  {
    key: 'dialysis_stock',
    group: 'OPERATIONS',
    name: 'Dialysis consumable stock',
    description: 'Live stock position for every dialysis consumable',
    build: async () => {
      const items = await DialysisConsumable.find({ active: true }).sort({ category: 1, name: 1 }).lean();
      return {
        columns: ['Code', 'Consumable', 'Category', 'Unit', 'Stock', 'Reorder', 'Unit cost', 'Status'],
        rows: items.map((c) => [c.code, c.name, c.category, c.unit, c.stockQty, c.reorderLevel, c.unitCost, c.stockQty <= c.reorderLevel ? 'REORDER' : 'OK']),
        totals: { items: items.length, value: sum(items, (c) => c.stockQty * c.unitCost), lowStock: items.filter((c) => c.stockQty <= c.reorderLevel).length },
      };
    },
  },
  {
    key: 'dialysis_insurance',
    group: 'FINANCIAL',
    name: 'Insurance / sponsor pending',
    description: 'Dialysis sessions awaiting insurance or sponsor settlement',
    build: async ({ from, to }) => {
      const sessions = await DialysisSession.find({
        sessionDate: from || to ? { $gte: new Date(from || '1970-01-01'), $lte: new Date(to || '2999-01-01') } : {},
        paymentStatus: 'INSURANCE_PENDING',
      }).populate('patientId', 'uhid firstName lastName').populate('billId', 'billNumber netTotal paidAmount dueAmount').lean();
      return {
        columns: ['Session No', 'Date', 'Patient', 'UHID', 'Bill', 'Net', 'Paid', 'Due'],
        rows: sessions.map((s) => [s.sessionNumber, fmtDate(s.sessionDate), `${s.patientId?.firstName || ''} ${s.patientId?.lastName || ''}`.trim(), s.patientId?.uhid, s.billId?.billNumber || '', s.billId?.netTotal ?? s.totalAmount, s.billId?.paidAmount ?? 0, s.billId?.dueAmount ?? s.totalAmount]),
        totals: { sessions: sessions.length, pending: sum(sessions, (s) => s.billId?.dueAmount ?? s.totalAmount) },
      };
    },
  },
];

const sum = (arr, fn) => arr.reduce((s, x) => s + (Number(typeof fn === 'function' ? fn(x) : x[fn]) || 0), 0);
const fmtDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

const dayRange = (date) => ({ $gte: startOfLocalDay(date), $lt: endOfLocalDay(date) });

const daySessions = async (date) => DialysisSession.find({ sessionDate: dayRange(date) })
  .populate('patientId', 'uhid firstName lastName')
  .populate('dialysisPatientId', 'dialysisNumber')
  .populate('machineId', 'code')
  .populate('stationId', 'code')
  .populate('doctorId', 'name')
  .populate('nurseId', 'name')
  .sort({ scheduledStart: 1 })
  .lean();

const rangeSessions = async ({ from, to, statuses }) => {
  const filter = {};
  if (from || to) filter.sessionDate = { ...(from ? { $gte: new Date(from) } : {}), ...(to ? { $lte: new Date(to) } : {}) };
  if (statuses) filter.status = { $in: statuses };
  return DialysisSession.find(filter)
    .populate('patientId', 'uhid firstName lastName')
    .populate('dialysisPatientId', 'dialysisNumber')
    .populate('machineId', 'code')
    .populate('stationId', 'code')
    .sort({ sessionDate: -1 })
    .limit(2000)
    .lean();
};

export const reportCatalogue = () => REPORT_DEFS.map((r) => ({ key: r.key, name: r.name, group: r.group, description: r.description }));

export const runReport = async (key, params = {}) => {
  const def = REPORT_DEFS.find((r) => r.key === key);
  if (!def) throw new NotFoundError(`Unknown report: ${key}`);
  const { columns, rows, totals } = await def.build(params);
  return { key: def.key, name: def.name, group: def.group, description: def.description, columns, rows, totals, generatedAt: new Date().toISOString(), params };
};

export const reportCsv = async (key, params) => {
  const report = await runReport(key, params);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [report.columns.map(esc).join(',')];
  report.rows.forEach((r) => lines.push(r.map(esc).join(',')));
  return lines.join('\n');
};

export const reportPdf = async (key, params, hospital) => {
  const PDFDocument = (await import('pdfkit')).default;
  const report = await runReport(key, params);
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', layout: report.columns.length > 8 ? 'landscape' : 'portrait', margin: 36 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.fontSize(15).text(hospital?.name || 'ZhanX HospitalOS', { align: 'center' });
    doc.fontSize(10).text('Dialysis Management — Clinical Command Center', { align: 'center' });
    doc.moveDown(0.4);
    doc.fontSize(11).text(report.name);
    doc.fontSize(8).fillColor('#555').text(`${report.description}${params.from || params.date ? ` | ${params.from || params.date} to ${params.to || params.date}` : ''} | generated ${new Date().toLocaleString('en-IN')}`);
    doc.moveDown(0.6).fillColor('#000');

    const colWidth = (doc.page.width - 72) / report.columns.length;
    const drawRow = (cells, bold) => {
      if (doc.y > doc.page.height - 60) doc.addPage();
      const y = doc.y;
      cells.forEach((cell, i) => {
        doc.fontSize(bold ? 7.5 : 7).font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .text(String(cell ?? ''), 36 + i * colWidth, y, { width: colWidth - 4, align: 'left', lineBreak: false, ellipsis: true });
      });
      doc.moveTo(36, doc.y + 2).lineTo(doc.page.width - 36, doc.y + 2).strokeColor('#dddddd').stroke();
      doc.y = Math.max(doc.y, y + 12) + 3;
    };
    drawRow(report.columns, true);
    report.rows.slice(0, 400).forEach((r) => drawRow(r, false));
    if (report.totals) {
      doc.moveDown(0.4);
      Object.entries(report.totals).forEach(([k, v]) => doc.fontSize(8).font('Helvetica-Bold').text(`${k.replace(/([A-Z])/g, ' $1')}: ${typeof v === 'number' ? v.toLocaleString('en-IN') : v}`, 36));
    }
    doc.fontSize(7).fillColor('#777').text('This is a computer generated report.', 36, doc.page.height - 48, { align: 'center' });
    doc.end();
  });
};

export const reportXlsx = async (key, params) => {
  const ExcelJS = (await import('exceljs')).default || (await import('exceljs'));
  const report = await runReport(key, params);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(report.name.slice(0, 30));
  ws.addRow(report.columns);
  report.rows.forEach((r) => ws.addRow(r));
  ws.getRow(1).font = { bold: true };
  if (report.totals) {
    ws.addRow([]);
    Object.entries(report.totals).forEach(([k, v]) => ws.addRow([k, v]));
  }
  return wb.xlsx.writeBuffer();
};

export const getHospital = async () => {
  const { default: Hospital } = await import('../models/Hospital.model.js');
  return Hospital.findOne().lean();
};
