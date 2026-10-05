import { success } from '../utils/apiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { writeAudit } from '../middleware/audit.js';
import * as structured from '../services/reporting.service.js';
import * as legacy from '../services/report.service.js';

export const reportListController = asyncHandler(async (req, res) => {
  const reports = structured.listReports();
  success(res, reports, 'Reports list');
});

export const getReportController = asyncHandler(async (req, res) => {
  const { report } = req.params;
  const isStructured = Boolean(structured.getCatalog(report));
  if (isStructured) {
    const data = await structured.runReport(report, req.query);
    const meta = await structured.reportMeta({ rep: data, q: req.query, user: req.user });
    await writeAudit({ user: req.user, action: 'REPORT_VIEW', module: 'reports', entityType: 'Report', data: { report }, req });
    return success(res, { ...data, meta }, `Report: ${report}`);
  }
  const rows = await legacy.runReport(report, req.query);
  success(res, rows, `Report: ${report}`);
});

export const exportReportController = asyncHandler(async (req, res) => {
  const { report } = req.params;
  const format = (req.params.format || 'csv').toLowerCase();
  const isStructured = Boolean(structured.getCatalog(report));

  await writeAudit({ user: req.user, action: 'REPORT_EXPORT', module: 'reports', entityType: 'Report', data: { report, format }, req });

  if (isStructured) {
    const data = await structured.runReport(report, req.query);
    const meta = await structured.reportMeta({ rep: data, q: req.query, user: req.user });
    const stamp = Date.now();
    switch (format) {
      case 'csv': {
        const csv = structured.reportToCsv(data);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${report}-${stamp}.csv"`);
        return res.send(csv);
      }
      case 'xlsx':
      case 'excel': {
        const buffer = await structured.reportToExcel(data, meta);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${report}-${stamp}.xlsx"`);
        return res.send(buffer);
      }
      case 'pdf': {
        const buffer = await structured.reportToPdf(data, meta);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${report}-${stamp}.pdf"`);
        return res.send(buffer);
      }
      case 'print': {
        const html = structured.reportToPrintHtml(data, meta);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(html);
      }
      default:
        return res.status(400).json({ success: false, message: 'Unsupported format' });
    }
  }

  const rows = await legacy.runReport(report, req.query);
  switch (format) {
    case 'csv': {
      const csv = legacy.toCSV(rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${report}-${Date.now()}.csv"`);
      return res.send(csv);
    }
    case 'xlsx':
    case 'excel': {
      const buffer = await legacy.toExcel(rows);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${report}-${Date.now()}.xlsx"`);
      return res.send(buffer);
    }
    case 'pdf': {
      const buffer = await legacy.toPDF(report, rows);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${report}-${Date.now()}.pdf"`);
      return res.send(buffer);
    }
    case 'print': {
      const csv = legacy.toCSV(rows);
      res.setHeader('Content-Type', 'text/html');
      const html = `<html><body><pre>${csv.replace(/</g, '&lt;')}</pre></body></html>`;
      return res.send(html);
    }
    default:
      return res.status(400).json({ success: false, message: 'Unsupported format' });
  }
});