import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Sheet, FileText, Printer, Search, RotateCcw, FileBarChart2, ChevronLeft, Eye } from 'lucide-react';
import api, { apiError } from '../lib/api';
import PageHeader from '../components/ui/PageHeader';
import { LoadingState, ErrorState, EmptyState } from '../components/ui/Feedback';
import { cn } from '../lib/utils';

const CATEGORY_LABELS = {
  PATIENT: 'Patient Reports',
  DOCTOR: 'Doctor Reports',
  DEPARTMENT: 'Department Reports',
  QUEUE: 'Queue Reports',
  FINANCIAL: 'Financial Reports',
  CLINICAL: 'Clinical Reports',
  MANAGEMENT: 'Management Reports',
};

const CATEGORY_ICONS = {
  PATIENT: '👤', DOCTOR: '🧑‍⚕️', DEPARTMENT: '🏢', QUEUE: '🔢', FINANCIAL: '💰', CLINICAL: '🩺', MANAGEMENT: '📈',
};

const DEFAULT_RANGE = () => {
  const now = new Date();
  const fmt = (d) => d.toISOString().slice(0, 10);
  const from = new Date(now.getTime() - 29 * 86400000);
  return { from: fmt(from), to: fmt(now) };
};

const fetchOptions = async (path) => (await api.get(path)).data.data || [];

const buildQuery = (report, filters) => {
  const p = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v) p.set(k, v); });
  return `${report}?${p.toString()}`;
};

async function downloadBlob(url, filename) {
  const res = await api.get(url, { responseType: 'blob' });
  const blobUrl = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}

async function openPrint(url, title) {
  const res = await api.get(url, { responseType: 'text' });
  const w = window.open('', '_blank');
  w.document.write(res.data);
  w.document.title = title;
  w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch { } }, 350);
}

async function openView(url, title) {
  const res = await api.get(url, { responseType: 'text' });
  const w = window.open('', '_blank');
  w.document.write(res.data);
  w.document.title = title;
  w.document.close();
}

const moneyOrPlain = (t) => (t.money ? `₹${Number(t.value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : Number(t.value || 0).toLocaleString('en-IN'));

export default function Reports() {
  const reportsQ = useQuery({ queryKey: ['reports-catalog'], queryFn: fetchOptions.bind(null, '/reports') });
  const doctorsQ = useQuery({ queryKey: ['masters-doctors'], queryFn: fetchOptions.bind(null, '/masters/doctors'), staleTime: 60_000 });
  const deptsQ = useQuery({ queryKey: ['masters-departments'], queryFn: fetchOptions.bind(null, '/masters/departments'), staleTime: 60_000 });

  const grouped = useMemo(() => {
    const g = {};
    (reportsQ.data || []).forEach((r) => { (g[r.category] = g[r.category] || []).push(r); });
    return g;
  }, [reportsQ.data]);

  const orderedCats = Object.keys(CATEGORY_LABELS).filter((c) => grouped[c]?.length);

  const [report, setReport] = useState('');
  const [filters, setFilters] = useState({ from: DEFAULT_RANGE().from, to: DEFAULT_RANGE().to });
  const [expanded, setExpanded] = useState(() => new Set(orderedCats.slice(0, 2)));
  const [catOpen, setCatOpen] = useState(true);

  const active = (reportsQ.data || []).find((r) => r.key === report);

  const selectReport = (key) => {
    setReport(key);
    setFilters({ from: DEFAULT_RANGE().from, to: DEFAULT_RANGE().to });
    setCatOpen(false);
  };

  const qk = ['report-run', report, JSON.stringify(filters)];
  const query = useQuery({
    queryKey: qk,
    queryFn: async () => (await api.get('/reports/' + buildQuery(report, filters))).data.data,
    enabled: Boolean(report),
  });

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const toggleCat = (c) => setExpanded((prev) => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n; });

  const data = query.data;
  const rows = data?.rows || [];
  const totals = data?.totals || [];
  const meta = data?.meta;

  const exportUrl = (format) => '/reports/' + buildQuery(report, filters).replace('?', '/export/' + format + '?');

  return (
    <div className="p-6">
      <PageHeader title="OPD Reporting Center" subtitle="Configured, filtered and letterhead-formatted hospital reports" />

      <div className={cn('grid grid-cols-1 gap-4 transition-all', catOpen ? 'lg:grid-cols-[240px_1fr]' : 'lg:grid-cols-[56px_1fr]')}>
        {/* Mobile catalog (below lg) */}
        <div className="card p-3 lg:hidden">
          <label className="label">Report catalog</label>
          <select className="input" value={report} onChange={(e) => selectReport(e.target.value)}>
            <option value="">— Select a report —</option>
            {orderedCats.map((c) => (
              <optgroup key={c} label={`${CATEGORY_LABELS[c]} (${grouped[c].length})`}>
                {grouped[c].map((r) => <option key={r.key} value={r.key}>{r.title}</option>)}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Category sidebar (desktop only) */}
        <div className={cn('card hidden h-fit transition-all lg:block', catOpen ? 'p-3' : 'p-2')}>
          {catOpen ? (
            <>
              <div className="mb-2 flex items-center justify-between gap-2 px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
                <span className="flex items-center gap-2"><FileBarChart2 className="h-4 w-4" /> Report catalog</span>
                <button title="Minimize catalog" className="flex h-5 w-5 items-center justify-center rounded text-ink-400 transition hover:bg-ink-100 hover:text-ink-700" onClick={() => setCatOpen(false)}>
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-1">
            {orderedCats.map((c) => (
              <div key={c} className="overflow-hidden rounded-lg">
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold text-ink-700 hover:bg-ink-100"
                  onClick={() => toggleCat(c)}
                >
                  <span>{CATEGORY_ICONS[c]}</span>
                  <span className="flex-1 text-left">{CATEGORY_LABELS[c]}</span>
                  <span className="text-[10px] text-ink-400">{grouped[c].length}</span>
                  <span className="text-ink-300">{expanded.has(c) ? '▾' : '▸'}</span>
                </button>
                {expanded.has(c) && (
                  <div className="space-y-0.5 px-1 pb-1">
                    {grouped[c].map((r) => (
                      <button
                        key={r.key}
                        className={cn('w-full rounded-md px-3 py-1.5 text-left text-[13px] transition', report === r.key ? 'bg-brand-600 text-white' : 'text-ink-600 hover:bg-brand-50 hover:text-brand-700')}
                        onClick={() => selectReport(r.key)}
                      >
                        {r.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
            </>
          ) : (
            <button
              title="Open report catalog"
              className="flex w-full flex-col items-center gap-3 text-ink-500 transition hover:text-brand-600"
              onClick={() => setCatOpen(true)}
            >
              <FileBarChart2 className="h-5 w-5" />
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ writingMode: 'vertical-rl' }}>Catalog</span>
            </button>
          )}
        </div>

        {/* Report panel */}
        <div className="space-y-3">
          {!report ? (
            <div className="card flex flex-col items-center gap-2 py-20 text-center">
              <FileBarChart2 className="h-10 w-10 text-ink-300" />
              <p className="text-sm font-semibold text-ink-700">Select a report from the catalog</p>
              <p className="max-w-sm text-xs text-ink-400">Each report supports PDF, Excel, CSV and Print with a hospital letterhead, filters and totals.</p>
            </div>
          ) : (
            <>
              {/* Filters */}
              <div className="card p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Filters</div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-8">
                  <div><label className="label">Date from</label><input className="input" type="date" value={filters.from || ''} onChange={set('from')} /></div>
                  <div><label className="label">Date to</label><input className="input" type="date" value={filters.to || ''} onChange={set('to')} /></div>
                  <div><label className="label">Department</label>
                    <select className="input" value={filters.departmentId || ''} onChange={set('departmentId')}>
                      <option value="">All</option>
                      {(deptsQ.data || []).map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div><label className="label">Doctor</label>
                    <select className="input" value={filters.doctorId || ''} onChange={set('doctorId')}>
                      <option value="">All</option>
                      {(doctorsQ.data || []).filter((d) => d.active !== false).map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div><label className="label">Visit type</label>
                    <select className="input" value={filters.visitType || ''} onChange={set('visitType')}>
                      <option value="">All</option>
                      {['NEW', 'FOLLOW_UP', 'WALK_IN', 'EMERGENCY'].map((v) => <option key={v} value={v}>{v.replace('_', ' ')}</option>)}
                    </select>
                  </div>
                  <div><label className="label">Status</label>
                    <select className="input" value={filters.status || ''} onChange={set('status')}>
                      <option value="">All</option>
                      {['IN_PROGRESS', 'COMPLETED', 'REFERRED', 'ADMITTED', 'NO_SHOW'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                    </select>
                  </div>
                  <div><label className="label">Payment mode</label>
                    <select className="input" value={filters.paymentMode || ''} onChange={set('paymentMode')}>
                      <option value="">All</option>
                      {['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'WALLET', 'CHEQUE', 'INSURANCE', 'CREDIT', 'SPONSOR'].map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div><label className="label">Group by</label>
                    <select className="input" value={filters.reportBy || ''} onChange={set('reportBy')}>
                      <option value="">Day</option>
                      <option value="week">Week</option>
                      <option value="month">Month</option>
                    </select>
                  </div>
                  <div><label className="label">Patient / UHID</label><input className="input" placeholder="Search patient name or UHID" value={filters.uhid || ''} onChange={set('uhid')} /></div>
                  <div className="flex items-end gap-2 pb-0.5 sm:col-span-2 xl:col-span-1">
                    <button className="btn-primary flex-1" onClick={() => query.refetch()}><Search className="h-4 w-4" /> Search</button>
                    <button className="btn-secondary" onClick={() => { setFilters({ from: DEFAULT_RANGE().from, to: DEFAULT_RANGE().to }); }}><RotateCcw className="h-4 w-4" /> Reset</button>
                  </div>
                </div>
              </div>

              {/* Report header + export */}
              <div className="card overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-4 py-3">
                  <div>
                    <div className="text-sm font-bold text-ink-900">{active?.title || report}</div>
                    <div className="text-[11px] text-ink-400">{meta ? `Period: ${meta.period} · ${meta.department} · Generated by ${meta.generatedBy}` : ''}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => openView(exportUrl('print'), active?.title || report)}><Eye className="h-3.5 w-3.5" /> View</button>
                    <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => downloadBlob(exportUrl('pdf'), `${report}.pdf`)}><FileText className="h-3.5 w-3.5" /> PDF</button>
                    <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => downloadBlob(exportUrl('xlsx'), `${report}.xlsx`)}><Sheet className="h-3.5 w-3.5" /> Excel</button>
                    <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => downloadBlob(exportUrl('csv'), `${report}.csv`)}><Download className="h-3.5 w-3.5" /> CSV</button>
                    <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => openPrint(exportUrl('print'), active?.title || report)}><Printer className="h-3.5 w-3.5" /> Print</button>
                  </div>
                </div>

                {/* Totals strip */}
                {totals.length > 0 && (
                  <div className="flex flex-wrap gap-2 border-b border-ink-100 bg-ink-50/60 px-4 py-2.5">
                    {totals.map((t, i) => (
                      <div key={i} className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 ring-1 ring-ink-200">
                        <span className="text-[11px] font-medium text-ink-500">{t.label}</span>
                        <span className="text-[13px] font-bold text-brand-800 tabular-nums">{moneyOrPlain(t)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="overflow-x-auto">
                  {query.isLoading ? <LoadingState label="Running report…" /> : query.error ? <ErrorState message={apiError(query.error)} /> : !rows.length ? (
                    <EmptyState title="No data for this report" subtitle="Change the date range or clear the filters." />
                  ) : (
                    <table className="table">
                      <thead>
                        <tr>
                          <th>#</th>
                          {data.columns.map((c) => <th key={c}>{c}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={i}>
                            <td className="text-ink-400">{i + 1}</td>
                            {r.map((v, j) => <td key={j}>{v === null || v === undefined || v === '' ? '—' : typeof v === 'number' && data.columns[j] && /amount|fee|total|revenue|collected|paid|due|discount|refund|price|rate/i.test(data.columns[j]) ? `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : String(v)}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}