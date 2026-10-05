import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  BarChart3, Download, FileSpreadsheet, FileText, IndianRupee, Printer, RefreshCw, Search, Tag,
} from 'lucide-react';
import api, { apiError } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import { LoadingState, ErrorState, EmptyState, Spinner } from '../../components/ui/Feedback';
import { MotionPage, MotionTab } from '../../components/ui/Motion';
import { formatDateTime, cn } from '../../lib/utils';

const GROUPS = ['OPERATIONS', 'CLINICAL', 'FINANCIAL'];

const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const today = () => new Date().toISOString().slice(0, 10);
const monthAgo = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
};

/** Downloads a real server-generated file (PDF / CSV / XLSX / print HTML) with the auth header. */
async function download(path, filename) {
  const res = await api.get(path, { responseType: 'blob' });
  const type = res.headers['content-type'] || 'application/octet-stream';
  const blob = new Blob([res.data], { type });
  const url = URL.createObjectURL(blob);
  if (type.includes('text/html')) {
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return;
  }
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function DialysisReports() {
  const qc = useQueryClient();
  const [key, setKey] = useState('dialysis_roster');
  const [group, setGroup] = useState('ALL');
  const [search, setSearch] = useState('');
  const [params, setParams] = useState({ from: monthAgo(), to: today(), date: today() });
  const [rate, setRate] = useState('');
  const [tab, setTab] = useState('reports');

  const catalogue = useQuery({
    queryKey: ['dialysis-report-catalogue'],
    queryFn: async () => (await api.get('/dialysis/reports/catalogue')).data.data,
  });

  const charge = useQuery({
    queryKey: ['dialysis-charge'],
    queryFn: async () => (await api.get('/dialysis/charges')).data.data,
  });

  const report = useQuery({
    queryKey: ['dialysis-report', key, params],
    queryFn: async () => (await api.get(`/dialysis/reports/${key}`, { params })).data.data,
    enabled: Boolean(key),
  });

  const saveCharge = useMutation({
    mutationFn: async () => (await api.patch('/dialysis/charges', { rate: Number(rate) })).data.data,
    onSuccess: () => { toast.success('Dialysis charge rate updated'); qc.invalidateQueries({ queryKey: ['dialysis-charge'] }); },
    onError: (e) => toast.error(apiError(e)),
  });

  const filtered = useMemo(() => {
    const rows = catalogue.data || [];
    return rows.filter((r) => (group === 'ALL' || r.group === group)
      && (!search || r.name.toLowerCase().includes(search.toLowerCase()) || r.key.includes(search.toLowerCase())));
  }, [catalogue.data, group, search]);

  const def = (catalogue.data || []).find((r) => r.key === key);
  const dayReport = def?.key === 'dialysis_roster';

  return (
    <MotionPage className="p-5 space-y-4">
      <PageHeader
        title="Dialysis Reporting Centre"
        subtitle="Every report is generated from live records and can be exported as PDF, CSV or Excel"
        actions={(
          <div className="flex flex-wrap gap-1">
            {[
              ['reports', 'Reports', BarChart3],
              ['charges', 'Charge config', Tag],
            ].map(([k, label, Icon]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition', tab === k ? 'bg-brand-600 text-white' : 'bg-white text-ink-600 ring-1 ring-inset ring-ink-200 hover:bg-ink-50')}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>
        )}
      />

      <MotionTab tabKey={tab}>
        {tab === 'reports' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
            {/* ---------- CATALOGUE ---------- */}
            <aside className="card p-3">
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
                <input className="input pl-8 text-xs" placeholder="Search reports" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="mb-2 flex flex-wrap gap-1">
                {['ALL', ...GROUPS].map((g) => (
                  <button
                    key={g}
                    onClick={() => setGroup(g)}
                    className={cn('rounded-lg px-2 py-0.5 text-[10px] font-bold', group === g ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200')}
                  >
                    {g === 'ALL' ? 'All' : g}
                  </button>
                ))}
              </div>
              {catalogue.isLoading ? <LoadingState label="Loading catalogue…" /> : catalogue.error ? <ErrorState message={apiError(catalogue.error)} /> : (
                <ul className="scrollbar-none max-h-[26rem] space-y-1 overflow-y-auto">
                  {filtered.map((r) => (
                    <li key={r.key}>
                      <button
                        onClick={() => setKey(r.key)}
                        className={cn('w-full rounded-lg px-2.5 py-2 text-left transition', key === r.key ? 'bg-brand-50 ring-1 ring-inset ring-brand-300' : 'hover:bg-ink-50')}
                      >
                        <div className="text-xs font-semibold text-ink-900">{r.name}</div>
                        <div className="text-[10px] text-ink-500">{r.description}</div>
                      </button>
                    </li>
                  ))}
                  {!filtered.length && <li className="py-4 text-center text-[11px] text-ink-400">No report matches</li>}
                </ul>
              )}
            </aside>

            {/* ---------- OUTPUT ---------- */}
            <div className="space-y-3">
              <div className="card p-3">
                <div className="flex flex-wrap items-end gap-2">
                  {dayReport ? (
                    <label className="label">Date<input type="date" className="input mt-1" value={params.date} onChange={(e) => setParams({ ...params, date: e.target.value })} /></label>
                  ) : (
                    <>
                      <label className="label">From<input type="date" className="input mt-1" value={params.from} onChange={(e) => setParams({ ...params, from: e.target.value })} /></label>
                      <label className="label">To<input type="date" className="input mt-1" value={params.to} onChange={(e) => setParams({ ...params, to: e.target.value })} /></label>
                    </>
                  )}
                  <button className="btn-secondary" onClick={() => report.refetch()} disabled={report.isFetching}>
                    {report.isFetching ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />} Refresh
                  </button>
                  <div className="ml-auto flex flex-wrap gap-1.5">
                    <button className="btn-secondary text-xs" disabled={report.isFetching} onClick={() => download(`/dialysis/reports/${key}/export.pdf?download=true`, `dialysis-${key}.pdf`)}>
                      <FileText className="h-3.5 w-3.5" /> PDF
                    </button>
                    <button className="btn-secondary text-xs" disabled={report.isFetching} onClick={() => download(`/dialysis/reports/${key}/export.csv`, `dialysis-${key}.csv`)}>
                      <Download className="h-3.5 w-3.5" /> CSV
                    </button>
                    <button className="btn-secondary text-xs" disabled={report.isFetching} onClick={() => download(`/dialysis/reports/${key}/export.xlsx`, `dialysis-${key}.xlsx`)}>
                      <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
                    </button>
                    <button className="btn-secondary text-xs" disabled={report.isFetching} onClick={() => download(`/dialysis/reports/${key}/export.print`, `dialysis-${key}.html`)}>
                      <Printer className="h-3.5 w-3.5" /> Print
                    </button>
                  </div>
                </div>
              </div>

              {report.isLoading ? <LoadingState label="Generating report…" /> : report.error ? <ErrorState message={apiError(report.error)} /> : (
                <div className="card p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-sm font-bold text-ink-900">{report.data.name}</h2>
                      <p className="text-[11px] text-ink-500">{report.data.description} · {report.data.rows.length} row(s) · generated {formatDateTime(report.data.generatedAt)}</p>
                    </div>
                    {report.data.totals && (
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(report.data.totals).map(([k, v]) => (
                          <span key={k} className="rounded-lg bg-ink-50 px-2 py-1 text-[10px] text-ink-600">
                            <strong className="text-ink-900">{k.replace(/([A-Z])/g, ' $1')}:</strong>{' '}
                            {typeof v === 'number' && Number.isInteger(v) ? v.toLocaleString('en-IN') : v}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="max-h-[28rem] overflow-auto">
                    <table className="table">
                      <thead>
                        <tr>{report.data.columns.map((c) => <th key={c}>{c}</th>)}</tr>
                      </thead>
                      <tbody>
                        {report.data.rows.map((row, i) => (
                          <tr key={i}>
                            {row.map((cell, j) => (
                              <td key={j} className={cn('text-[11px]', j === 0 && 'font-mono font-semibold text-brand-700')}>
                                {cell === null || cell === undefined || cell === '' ? '—' : String(cell)}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {!report.data.rows.length && (
                          <tr><td colSpan={report.data.columns.length}><EmptyState title="No data for this period" hint="Widen the date range and refresh" /></td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'charges' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="card p-4">
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink-900">
                <IndianRupee className="h-4 w-4 text-brand-600" /> Dialysis session charge
              </h2>
              <p className="mt-0.5 text-[11px] text-ink-500">This rate is used by every dialysis bill unless the billing desk overrides it for a specific session.</p>
              {charge.isLoading ? <LoadingState label="Loading charge…" /> : charge.error ? <ErrorState message={apiError(charge.error)} /> : (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ['Service code', charge.data.serviceCode],
                      ['Configured rate', rupees(charge.data.rate)],
                      ['Frequency', charge.data.frequency || 'PER_SESSION'],
                      ['Status', charge.data.active === false ? 'Inactive' : 'Active'],
                    ].map(([l, v]) => (
                      <div key={l} className="rounded-lg bg-ink-50 p-2">
                        <div className="text-[10px] uppercase tracking-wide text-ink-500">{l}</div>
                        <div className="text-sm font-bold text-ink-900">{v}</div>
                      </div>
                    ))}
                  </div>
                  <label className="label">New rate (₹)
                    <input className="input mt-1" type="number" value={rate} onChange={(e) => setRate(e.target.value)} placeholder={charge.data.rate} />
                  </label>
                  <button className="btn-primary" disabled={saveCharge.isPending || !rate} onClick={() => saveCharge.mutate()}>
                    {saveCharge.isPending ? <Spinner className="h-4 w-4 text-white" /> : <Tag className="h-4 w-4" />} Update rate
                  </button>
                </div>
              )}
            </div>

            <div className="card p-4">
              <h2 className="text-sm font-bold text-ink-900">How the session bill is built</h2>
              <ul className="mt-2 space-y-1.5 text-[11px] text-ink-600">
                {[
                  'Every billable consumable issued to the session becomes a bill line with quantity, rate and amount.',
                  'The session itself is added once with the configured dialysis charge (or a billing-desk override).',
                  'The bill is raised through the hospital billing service, so the cashier, insurance and finance modules all see it.',
                  'Payment is recorded against that bill; the session closes automatically once it is fully settled.',
                  'Insurance and sponsor sessions stay INSURANCE_PENDING until the claim is settled.',
                ].map((x) => (
                  <li key={x} className="flex gap-1.5 rounded-lg bg-ink-50 px-2.5 py-1.5">
                    <span className="text-brand-600">•</span>{x}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </MotionTab>
    </MotionPage>
  );
}
