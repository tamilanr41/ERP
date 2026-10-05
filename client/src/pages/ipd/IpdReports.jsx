import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FileBarChart,
  Download,
  Printer,
  Table2,
  Search,
} from 'lucide-react';
import api, { apiError } from '../../lib/api';
import { POLL } from '../../lib/polling';
import PageHeader from '../../components/ui/PageHeader';
import { LoadingState, ErrorState, EmptyState, Spinner } from '../../components/ui/Feedback';
import { useIpdRealtime } from '../../lib/useIpdRealtime';
import { cn } from '../../lib/utils';

const GROUPS = ['ADMISSION', 'BED', 'DISCHARGE', 'CLINICAL', 'FINANCIAL', 'OPERATIONS'];
const GROUP_LABEL = {
  ADMISSION: 'Admission', BED: 'Bed', DISCHARGE: 'Discharge', CLINICAL: 'Clinical',
  FINANCIAL: 'Financial', OPERATIONS: 'Operations',
};

const money = (n) => (typeof n === 'number' ? n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : n);

export default function IpdReports() {
  const qc = useQueryClient();
  useIpdRealtime();
  const [group, setGroup] = useState('ADMISSION');
  const [active, setActive] = useState('admission_register');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const catalogue = useQuery({ queryKey: ['ipd-report-catalogue'], queryFn: async () => (await api.get('/ipd/reports/catalogue')).data.data });
  const report = useQuery({
    queryKey: ['ipd-report', active, from, to],
    queryFn: async () => (await api.get(`/ipd/reports/${active}`, { params: { from, to } })).data.data,
    refetchInterval: POLL.IDLE,
  });

  const reports = useMemo(() => (catalogue.data || []).filter((r) => r.group === group), [catalogue.data, group]);
  useEffect(() => {
    if (reports.length && !reports.some((r) => r.key === active)) setActive(reports[0].key);
  }, [reports, active]);

  const rows = useMemo(() => {
    const list = report.data?.rows || [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((r) => Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(q)));
  }, [report.data, search]);

  const exportUrl = (format) => `/api/ipd/reports/${active}/export.${format}?from=${from}&to=${to}`;

  if (catalogue.isLoading) return <LoadingState label="Loading IPD reports…" />;
  if (catalogue.error) return <ErrorState message={apiError(catalogue.error)} />;

  return (
    <div className="p-6">
      <PageHeader
        title="IPD Reporting Centre"
        subtitle="Admission, bed, discharge, clinical, financial and operations reports"
        actions={
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary text-xs" disabled={!report.data} onClick={() => window.open(exportUrl('print'), '_blank')}>
              <Printer className="h-3.5 w-3.5" /> Print
            </button>
            <a className="btn-secondary text-xs" href={exportUrl('pdf')} target="_blank" rel="noreferrer"><Download className="h-3.5 w-3.5" /> PDF</a>
            <a className="btn-secondary text-xs" href={exportUrl('xlsx')}><Download className="h-3.5 w-3.5" /> Excel</a>
            <a className="btn-secondary text-xs" href={exportUrl('csv')}><Download className="h-3.5 w-3.5" /> CSV</a>
          </div>
        }
      />

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">From</label>
          <input type="date" className="input w-40 py-1 text-xs" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" className="input w-40 py-1 text-xs" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Search className="h-4 w-4 text-ink-400" />
          <input className="input w-56 py-1 text-xs" placeholder="Filter rows…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {GROUPS.map((g) => (
          <button
            key={g}
            onClick={() => setGroup(g)}
            className={cn('rounded-lg px-3 py-1.5 text-xs font-semibold transition', group === g ? 'bg-brand-600 text-white' : 'bg-white text-ink-600 ring-1 ring-inset ring-ink-200 hover:bg-ink-50')}
          >
            {GROUP_LABEL[g]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        <div className="space-y-1">
          {reports.map((r) => (
            <button
              key={r.key}
              onClick={() => setActive(r.key)}
              className={cn('flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold transition', active === r.key ? 'bg-brand-50 text-brand-800 ring-1 ring-inset ring-brand-200' : 'text-ink-600 hover:bg-ink-50')}
            >
              <FileBarChart className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{r.name}</span>
            </button>
          ))}
        </div>

        <div className="card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-ink-900">{report.data?.name || 'Report'}</h3>
              <p className="text-[11px] text-ink-400">{rows.length} row(s){search ? ' (filtered)' : ''} · {from} to {to}</p>
            </div>
            {report.isFetching && <Spinner className="h-4 w-4 text-brand-500" />}
          </div>

          {report.isLoading ? <LoadingState label="Generating report…" /> : report.error ? <ErrorState message={apiError(report.error)} /> : !rows.length ? (
            <EmptyState title="No records" hint="No data for the selected period" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead className="border-b border-ink-200 text-[10px] uppercase tracking-wide text-ink-400">
                  <tr>
                    {report.data.columns.map((c) => <th key={c} className="py-2 pr-3">{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 500).map((r, i) => (
                    <tr key={i} className="border-b border-ink-50 hover:bg-ink-50/50">
                      {report.data.columns.map((c) => (
                        <td key={c} className="py-1.5 pr-3">{money(r[c])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 500 && <p className="mt-2 text-[10px] text-ink-400">Showing first 500 rows — export for the complete data set.</p>}
            </div>
          )}

          {report.data?.totals && (
            <div className="mt-3 flex flex-wrap gap-2 rounded-xl bg-brand-50/60 p-3 ring-1 ring-inset ring-brand-100">
              <Table2 className="h-4 w-4 text-brand-600" />
              {Object.entries(report.data.totals).map(([k, v]) => (
                <span key={k} className="text-xs text-ink-700">
                  <b className="uppercase tracking-wide text-ink-500">{k.replace(/([A-Z])/g, ' $1')}:</b>{' '}
                  <b className="text-ink-900">{money(v)}</b>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
