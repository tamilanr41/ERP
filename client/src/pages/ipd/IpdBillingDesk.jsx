import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowUpRight,
  BadgeIndianRupee,
  BellRing,
  CalendarClock,
  CheckCircle2,
  FileSpreadsheet,
  Receipt,
  RefreshCw,
  Wallet,
} from 'lucide-react';
import api, { apiError } from '../../lib/api';
import { admissionPath } from '../../lib/admissionPath';
import { POLL } from '../../lib/polling';
import PageHeader from '../../components/ui/PageHeader';
import { LoadingState, ErrorState, EmptyState, Spinner } from '../../components/ui/Feedback';
import { formatDate, formatCurrency as rupees, cn } from '../../lib/utils';

const TABS = [
  { key: 'charges', label: 'Charge Configuration', icon: FileSpreadsheet },
  { key: 'advances', label: 'Advances', icon: Wallet },
  { key: 'alerts', label: 'Advance Alerts', icon: BellRing },
  { key: 'discharge', label: 'Discharge Planning', icon: CalendarClock },
  { key: 'final', label: 'Final Bill & Settlement', icon: Receipt },
];

const ACTIVE_STATUSES = ['ADMITTED', 'TRANSFERRED', 'DISCHARGE_PLANNED'];
const MODES = ['CASH', 'CARD', 'UPI', 'NETBANKING', 'CHEQUE', 'WALLET', 'INSURANCE'];
const ADVANCE_TYPES = ['ADMISSION', 'ADDITIONAL', 'EMERGENCY', 'REFUNDABLE'];
const READINESS_STYLE = {
  READY: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  PLANNED: 'bg-amber-50 text-amber-700 ring-amber-200',
  NOT_READY: 'bg-rose-50 text-rose-700 ring-rose-200',
  COMPLETED: 'bg-ink-100 text-ink-600 ring-ink-200',
};

const Panel = ({ title, hint, right, children }) => (
  <div className="card p-4">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 className="text-sm font-bold text-ink-900">{title}</h3>
        {hint && <p className="text-[11px] text-ink-500">{hint}</p>}
      </div>
      {right}
    </div>
    {children}
  </div>
);

export default function IpdBillingDesk() {
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const tab = params.get('tab') || 'charges';
  const go = (k) => setParams({ tab: k });

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [admissionId, setAdmissionId] = useState(params.get('admission') || '');
  const [form, setForm] = useState({ amount: '', mode: 'CASH', advanceType: 'ADMISSION', referenceNumber: '' });
  const [refund, setRefund] = useState({});
  const [thresholds, setThresholds] = useState(null);

  const charges = useQuery({
    queryKey: ['ipd-charges'],
    queryFn: async () => (await api.get('/ipd/billing/charges')).data.data,
  });

  const admissions = useQuery({
    queryKey: ['ipd-admissions', { limit: 50 }],
    queryFn: async () => (await api.get('/ipd/admissions', { params: { limit: 50 } })).data.data,
    refetchInterval: POLL.SLOW,
  });

  const activeAdmissions = (admissions.data || []).filter((a) => ACTIVE_STATUSES.includes(a.status));

  const saveCharge = useMutation({
    mutationFn: async ({ code, patch }) => (await api.patch(`/ipd/billing/charges/${code}`, patch)).data.data,
    onSuccess: () => { toast.success('Charge configuration saved'); qc.invalidateQueries({ queryKey: ['ipd-charges'] }); },
    onError: (e) => toast.error(apiError(e)),
  });

  const runDaily = useMutation({
    mutationFn: async (admission) => (await api.post(`/ipd/billing/daily-run/${admission._id}`, { date })).data,
    onSuccess: (r) => { toast.success(r.message || 'Daily charges captured'); qc.invalidateQueries({ queryKey: ['ipd-admission-bills'] }); },
    onError: (e) => toast.error(apiError(e)),
  });

  const runDailyAll = useMutation({
    mutationFn: async () => (await api.post('/ipd/billing/daily-run', { date })).data,
    onSuccess: (r) => {
      const okCount = (r.results || []).filter((x) => !x.error).length;
      toast.success(`Daily billing run complete for ${okCount} admission(s)`);
      qc.invalidateQueries({ queryKey: ['ipd-admission-bills'] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const advances = useQuery({
    queryKey: ['ipd-advances', admissionId],
    queryFn: async () => (await api.get(`/ipd/billing/advances/${admissionId}`)).data.data,
    enabled: !!admissionId,
  });

  const bills = useQuery({
    queryKey: ['ipd-admission-bills', admissionId],
    queryFn: async () => (await api.get('/billing', { params: { admissionId, limit: 50 } })).data.data,
    enabled: !!admissionId,
    select: (rows) => (rows || []).filter((b) => b.admissionId === admissionId && !b.isFinalBill),
  });

  const collect = useMutation({
    mutationFn: async () => (await api.post(`/ipd/billing/advances/${admissionId}`, { ...form, amount: Number(form.amount) })).data.data,
    onSuccess: (a) => {
      toast.success(`Receipt ${a.receiptNumber} issued`);
      setForm({ ...form, amount: '', referenceNumber: '' });
      qc.invalidateQueries({ queryKey: ['ipd-advances', admissionId] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const adjust = useMutation({
    mutationFn: async ({ billId }) => (await api.post(`/ipd/billing/advances/${admissionId}/adjust`, { billId })).data.data,
    onSuccess: (r) => { toast.success(`${rupees(r.applied)} adjusted`); qc.invalidateQueries({ queryKey: ['ipd-advances', admissionId] }); },
    onError: (e) => toast.error(apiError(e)),
  });

  const refundM = useMutation({
    mutationFn: async ({ advanceId, amount }) => (await api.post(`/ipd/billing/advances/${admissionId}/${advanceId}/refund`, { amount })).data.data,
    onSuccess: () => { toast.success('Advance refunded'); qc.invalidateQueries({ queryKey: ['ipd-advances', admissionId] }); },
    onError: (e) => toast.error(apiError(e)),
  });

  const alertConfig = useQuery({
    queryKey: ['ipd-alert-config'],
    queryFn: async () => (await api.get('/ipd/billing/alert-config')).data.data,
  });

  const alertFor = useQuery({
    queryKey: ['ipd-advance-alert', admissionId],
    queryFn: async () => (await api.get(`/ipd/billing/advance-alert/${admissionId}`)).data.data,
    enabled: !!admissionId,
  });

  const saveThresholds = useMutation({
    mutationFn: async (patch) => (await api.patch('/ipd/billing/alert-config', patch)).data.data,
    onSuccess: () => { toast.success('Alert thresholds saved'); qc.invalidateQueries({ queryKey: ['ipd-alert-config'] }); },
    onError: (e) => toast.error(apiError(e)),
  });

  const acknowledge = useMutation({
    mutationFn: async (id) => (await api.post(`/ipd/billing/advance-alert/${id}/acknowledge`)).data.data,
    onSuccess: () => { toast.success('Alert acknowledged'); qc.invalidateQueries({ queryKey: ['ipd-advance-alert', admissionId] }); },
    onError: (e) => toast.error(apiError(e)),
  });

  const dash = useQuery({
    queryKey: ['ipd-discharge-dashboard'],
    queryFn: async () => (await api.get('/ipd/billing/discharge-dashboard')).data.data,
    refetchInterval: POLL.STANDARD,
  });

  const settlement = useQuery({
    queryKey: ['ipd-settlement', admissionId],
    queryFn: async () => (await api.get(`/ipd/billing/final/${admissionId}`)).data.data,
    enabled: !!admissionId,
    retry: false,
  });

  const buildFinal = useMutation({
    mutationFn: async () => (await api.post(`/ipd/billing/final/${admissionId}/build`, {})).data,
    onSuccess: () => { toast.success('Final bill generated'); qc.invalidateQueries({ queryKey: ['ipd-settlement', admissionId] }); },
    onError: (e) => toast.error(apiError(e)),
  });

  const finalise = useMutation({
    mutationFn: async () => (await api.post(`/ipd/billing/final/${admissionId}/finalise`, {})).data.data,
    onSuccess: () => {
      toast.success('Final bill finalised');
      qc.invalidateQueries({ queryKey: ['ipd-settlement', admissionId] });
      qc.invalidateQueries({ queryKey: ['ipd-discharge-dashboard'] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const AdmissionPicker = ({ label = 'Admission' }) => (
    <label className="label">
      {label}
      <select className="select mt-1" value={admissionId} onChange={(e) => setAdmissionId(e.target.value)}>
        <option value="">Select an admission…</option>
        {activeAdmissions.map((a) => (
          <option key={a._id} value={a._id}>
            {a.admissionNumber} — {a.patientId?.firstName} {a.patientId?.lastName}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="p-6">
      <PageHeader
        title="IPD Billing & Discharge Desk"
        subtitle="Charges, advances, alerts, discharge planning and final settlement"
        actions={
          <div className="flex flex-wrap gap-1.5">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  onClick={() => go(t.key)}
                  className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition', tab === t.key ? 'bg-brand-600 text-white' : 'bg-white text-ink-600 ring-1 ring-inset ring-ink-200 hover:bg-ink-50')}
                >
                  <Icon className="h-3.5 w-3.5" /> {t.label}
                </button>
              );
            })}
          </div>
        }
      />

      {tab === 'charges' && (
        <div className="space-y-4">
          <Panel
            title="Configured IPD services"
            hint="Rates, auto-capture and source billing drive the daily run"
            right={(
              <div className="flex flex-wrap items-center gap-2">
                <input type="date" className="input w-36 py-1 text-xs" value={date} onChange={(e) => setDate(e.target.value)} />
                <button className="btn-secondary text-xs" disabled={runDailyAll.isPending} onClick={() => runDailyAll.mutate()}>
                  {runDailyAll.isPending ? <Spinner className="h-3.5 w-3.5" /> : null} Run daily billing (all)
                </button>
              </div>
            )}
          >
            {charges.isLoading ? <LoadingState label="Loading charges…" /> : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr><th>Service</th><th>Code</th><th className="text-right">Rate</th><th>Frequency</th><th>Auto capture</th><th>Billed at source</th><th /></tr>
                  </thead>
                  <tbody>
                    {(charges.data || []).map((c) => (
                      <tr key={c.serviceCode}>
                        <td className="text-xs font-semibold text-ink-900">{c.name}</td>
                        <td className="font-mono text-[10px] text-ink-500">{c.serviceCode}</td>
                        <td className="text-right">
                          <input
                            className="input w-24 py-1 text-right text-xs"
                            type="number"
                            defaultValue={c.rate || 0}
                            onBlur={(e) => saveCharge.mutate({ code: c.serviceCode, patch: { rate: Number(e.target.value) || 0 } })}
                          />
                        </td>
                        <td className="text-[11px] uppercase text-ink-500">{String(c.frequency || 'DAILY').replace(/_/g, ' ')}</td>
                        <td>
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-ink-300 text-brand-600"
                            checked={Boolean(c.autoCapture)}
                            onChange={(e) => saveCharge.mutate({ code: c.serviceCode, patch: { autoCapture: e.target.checked } })}
                          />
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-ink-300 text-brand-600"
                            checked={Boolean(c.billedAtSource)}
                            onChange={(e) => saveCharge.mutate({ code: c.serviceCode, patch: { billedAtSource: e.target.checked } })}
                          />
                        </td>
                        <td className="text-right">
                          {c.serviceCode === 'ROOM_RENT' && <span className="text-[10px] text-ink-500">Room rent uses the bed</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Bill day" hint="Capture charges for one admission">
            <div className="flex flex-wrap items-end gap-2">
              <AdmissionPicker />
              <button
                className="btn-primary text-xs"
                disabled={!admissionId || runDaily.isPending}
                onClick={() => runDaily.mutate(activeAdmissions.find((a) => a._id === admissionId))}
              >
                Run daily billing
              </button>
            </div>
          </Panel>
        </div>
      )}

      {tab === 'advances' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-4">
            <Panel title="Collect an advance" hint="Issues a numbered receipt">
              <AdmissionPicker />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="label">Amount ₹ *
                  <input className="input mt-1" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Amount ₹ *" />
                </label>
                <label className="label">Mode
                  <select className="select mt-1" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
                    {MODES.map((m) => <option key={m}>{m}</option>)}
                  </select>
                </label>
                <label className="label">Type
                  <select className="select mt-1" value={form.advanceType} onChange={(e) => setForm({ ...form, advanceType: e.target.value })}>
                    {ADVANCE_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </label>
                <label className="label">Reference
                  <input className="input mt-1" value={form.referenceNumber} onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })} placeholder="Reference / transaction number" />
                </label>
              </div>
              <button className="btn-primary mt-3 w-full" disabled={!admissionId || !form.amount || collect.isPending} onClick={() => collect.mutate()}>
                Collect
              </button>
            </Panel>

            <Panel title="Adjust advance against a bill" hint="Consumes the deposit on an outstanding bill">
              {!bills.data?.length ? <EmptyState title="No bills to adjust" /> : (
                <div className="space-y-1.5">
                  {bills.data.filter((b) => b.dueAmount > 0).map((b) => (
                    <div key={b._id} className="flex items-center justify-between gap-2 rounded-lg bg-ink-50 px-3 py-2 text-xs">
                      <span>
                        <span className="block font-mono text-[10px] text-ink-500">{b.billNumber}</span>
                        <span className="font-semibold text-ink-900">Net {rupees(b.netTotal)}</span>
                      </span>
                      <button className="btn-secondary px-2.5 py-1 text-[11px]" onClick={() => adjust.mutate({ billId: b._id })}>Adjust advance</button>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          <div className="space-y-4 lg:col-span-2">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['Total advance', advances.data?.summary?.totalAdvance],
                ['Adjusted', advances.data?.summary?.adjustedAmount],
                ['Refunded', advances.data?.summary?.refundedAmount],
                ['Available', advances.data?.summary?.availableAdvance],
              ].map(([l, v]) => (
                <div key={l} className="card p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">{l}</div>
                  <div className="mt-1 text-lg font-bold tabular-nums text-ink-900">{rupees(v || 0)}</div>
                </div>
              ))}
            </div>

            <Panel
              title="Receipts"
              hint="Every advance, adjustment and refund stays traceable"
              right={<button className="btn-secondary text-xs" onClick={() => navigateSafe(admissionId, 'billing')}>Open admission <ArrowUpRight className="h-3.5 w-3.5" /></button>}
            >
              {!advances.data?.advances?.length ? <EmptyState title="No advances collected" /> : (
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead><tr><th>Receipt</th><th>Type</th><th className="text-right">Amount</th><th>Mode</th><th>Collected</th><th>Action</th></tr></thead>
                    <tbody>
                      {advances.data.advances.map((a) => (
                        <tr key={a._id}>
                          <td className="font-mono text-[11px]">{a.receiptNumber}</td>
                          <td className="text-[11px] uppercase">{a.advanceType}</td>
                          <td className="text-right tabular-nums">{rupees(a.amount)}</td>
                          <td className="text-[11px]">{a.mode}</td>
                          <td className="text-[11px]">{formatDate(a.collectedAt)}</td>
                          <td className="text-right">
                            {a.availableAmount > 0 && (
                              <div className="inline-flex items-center gap-1">
                                <input
                                  className="input w-20 py-1 text-xs"
                                  type="number"
                                  placeholder="Refund amount"
                                  value={refund[a._id] || ''}
                                  onChange={(e) => setRefund({ ...refund, [a._id]: e.target.value })}
                                />
                                <button
                                  className="btn-secondary px-2 py-1 text-[11px]"
                                  disabled={!refund[a._id] || refundM.isPending}
                                  onClick={() => refundM.mutate({ advanceId: a._id, amount: Number(refund[a._id]) })}
                                >
                                  Refund
                                </button>
                              </div>
                            )}
                            {a.status === 'CANCELLED' && <span className="text-[10px] uppercase text-ink-400">Cancelled</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}

      {tab === 'alerts' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Panel title="Alert thresholds" hint="Financial alerts never block clinical care">
            <div className="space-y-2">
              {[
                ['criticalAdvance', 'Critical advance below ₹'],
                ['lowAdvance', 'Warning advance below ₹'],
                ['estimatedBillMultiplier', 'Warn when advance × this is below the bill'],
              ].map(([key, label]) => (
                <label key={key} className="label">
                  {label}
                  <input
                    className="input mt-1"
                    type="number"
                    value={thresholds?.[key] ?? alertConfig.data?.[key] ?? ''}
                    onChange={(e) => setThresholds({ ...(thresholds || alertConfig.data), [key]: Number(e.target.value) })}
                  />
                </label>
              ))}
              <button className="btn-primary w-full text-xs" disabled={saveThresholds.isPending} onClick={() => saveThresholds.mutate(thresholds || alertConfig.data)}>
                Save thresholds
              </button>
            </div>
          </Panel>

          <Panel title="Check an admission" hint="Evaluate the live balance for one admission" className="lg:col-span-2">
            <AdmissionPicker />
            {admissionId && (
              <div className="mt-3">
                {alertFor.data ? (
                  <div className={cn('rounded-xl border px-4 py-3 text-sm', alertFor.data.level === 'CRITICAL' ? 'border-rose-300 bg-rose-50 text-rose-800' : alertFor.data.level === 'WARNING' ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-emerald-300 bg-emerald-50 text-emerald-800')}>
                    <div className="flex items-center gap-2 font-bold">
                      {alertFor.data.level === 'OK' ? <CheckCircle2 className="h-4 w-4" /> : <BellRing className="h-4 w-4" />}
                      {alertFor.data.level === 'CRITICAL' ? 'CRITICAL' : alertFor.data.level === 'WARNING' ? 'WARNING' : 'Advance balance healthy'}
                    </div>
                    <p className="mt-1 text-xs">{alertFor.data.message}</p>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[11px]">
                      <div className="rounded-lg bg-white/60 p-2">Estimated bill <b>{rupees(alertFor.data.estimatedBill)}</b></div>
                      <div className="rounded-lg bg-white/60 p-2">Advance <b>{rupees(alertFor.data.totalAdvance)}</b></div>
                      <div className="rounded-lg bg-white/60 p-2">Available <b>{rupees(alertFor.data.availableAdvance)}</b></div>
                    </div>
                    {alertFor.data.outstanding > 0 && <p className="mt-2 text-xs">Outstanding <b>{rupees(alertFor.data.outstanding)}</b></p>}
                    {alertFor.data.acknowledgedAt && (
                      <p className="mt-1 text-[10px] uppercase tracking-wide opacity-70">Acknowledged {formatDate(alertFor.data.acknowledgedAt)}</p>
                    )}
                    <button className="btn-secondary mt-3 text-xs" disabled={acknowledge.isPending} onClick={() => acknowledge.mutate(admissionId)}>
                      Acknowledge
                    </button>
                  </div>
                ) : <EmptyState title="Select an admission to evaluate" />}
              </div>
            )}
          </Panel>
        </div>
      )}

      {tab === 'discharge' && (
        <Panel
          title="Discharge readiness"
          hint="Expected discharge date, clearance checklist and pending items"
          right={(
            <button className="btn-ghost p-1.5" title="Refresh readiness" onClick={() => { dash.refetch(); toast.success('Readiness refreshed'); }}>
              <RefreshCw className={cn('h-4 w-4 text-ink-400', dash.isFetching && 'animate-spin')} />
            </button>
          )}
        >
          {dash.isLoading ? <LoadingState label="Loading discharge planning…" /> : dash.error ? <ErrorState message={apiError(dash.error)} /> : !dash.data?.length ? <EmptyState title="Nothing to plan" hint="No admissions match this filter" /> : (
            <div className="space-y-2">
              {dash.data.map((r) => (
                <div key={r.admissionId} className="rounded-xl border border-ink-100 px-3 py-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-mono text-brand-700">{r.admissionNumber}</span>
                      <span className="ml-2 font-semibold text-ink-900">{r.patient}</span>
                      <span className="ml-2 text-ink-500">{r.status}</span>
                      <span className={cn('ml-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ring-1 ring-inset', READINESS_STYLE[r.readiness])}>{String(r.readiness).replace(/_/g, ' ')}</span>
                      {r.dischargeType && r.dischargeType !== 'NORMAL' && <span className="ml-1 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-rose-700">{String(r.dischargeType).replace(/_/g, ' ')}</span>}
                      <div className="mt-0.5 text-[11px] text-ink-400">
                        {r.ward || '—'} / {r.bed || 'no bed'} · {r.consultant || '—'} · LOS {r.lengthOfStay}d
                        {r.expectedDischargeDate ? ` · expected DC ${formatDate(r.expectedDischargeDate)}` : ' · no expected date'}
                      </div>
                      {r.pendingItems?.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {r.pendingItems.map((p) => <span key={p} className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">{p}</span>)}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums text-ink-700">Due {rupees(r.due)}</span>
                      <button className="btn-secondary text-[11px]" onClick={() => navigateSafe(r.admissionId, 'discharge')}>Open</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      {tab === 'final' && (
        <div className="space-y-4">
          <Panel title="Final IPD bill" hint="Consolidates every service bill for the admission">
            <div className="flex flex-wrap items-end gap-2">
              <AdmissionPicker />
              <button className="btn-secondary text-xs" disabled={!admissionId || buildFinal.isPending} onClick={() => buildFinal.mutate()}>
                Generate final bill
              </button>
              {settlement.data && (
                <>
                  <button className="btn-secondary text-xs" disabled={finalise.isPending} onClick={() => finalise.mutate()}>Finalise</button>
                  <a
                    className="btn-secondary text-xs"
                    href={`/api/ipd/billing/discharge-summary/${admissionId}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Discharge summary PDF
                  </a>
                </>
              )}
            </div>
          </Panel>

          {settlement.error || !settlement.data ? (
            <Panel title="Final bill">
              <EmptyState title="No final bill yet" hint="Generate it to see the aggregated settlement" />
            </Panel>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {[
                  ['Gross total', settlement.data.grossTotal],
                  ['Discount', settlement.data.discount],
                  ['Tax', settlement.data.tax],
                  ['Net total', settlement.data.netTotal],
                  ['Advance adjusted', settlement.data.advanceAdjusted],
                  ['Paid', settlement.data.paid],
                ].map(([l, v]) => (
                  <div key={l} className="card p-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">{l}</div>
                    <div className="mt-1 text-base font-bold tabular-nums text-ink-900">{rupees(v || 0)}</div>
                  </div>
                ))}
                <div className="card p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">Insurance adj</div>
                  <div className="mt-1 text-base font-bold tabular-nums text-ink-900">{rupees(settlement.data.insuranceAdjustment || 0)}</div>
                </div>
                <div className="card p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">Sponsor adj</div>
                  <div className="mt-1 text-base font-bold tabular-nums text-ink-900">{rupees(settlement.data.sponsorAdjustment || 0)}</div>
                </div>
                <div className="card p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">Net payable</div>
                  <div className="mt-1 text-base font-bold tabular-nums text-ink-900">{rupees(settlement.data.netPayable || 0)}</div>
                </div>
                <div className={cn('card p-3', (settlement.data.balance || 0) > 0 ? 'border-rose-300' : 'border-emerald-300')}>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">Balance</div>
                  <div className="mt-1 text-base font-bold tabular-nums text-ink-900">{rupees(settlement.data.balance || 0)}</div>
                </div>
                <div className="card p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">Status</div>
                  <div className="mt-1 text-base font-bold text-ink-900">{settlement.data.status}</div>
                </div>
                <div className="card p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">Settlement</div>
                  <div className="mt-1 font-mono text-xs font-bold text-ink-900">{settlement.data.settlementNumber}</div>
                </div>
              </div>

              <Panel title="Category breakdown" hint="How the final bill was assembled">
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead><tr><th>Category</th><th className="text-right">Amount</th></tr></thead>
                    <tbody>
                      {(settlement.data.categories || []).map((c) => (
                        <tr key={c.category || c.serviceCategory}>
                          <td className="text-xs font-semibold text-ink-900">{String(c.category || c.serviceCategory).replace(/_/g, ' ')}</td>
                          <td className="text-right tabular-nums">{rupees(c.amount)}</td>
                        </tr>
                      ))}
                      {!(settlement.data.categories || []).length && <tr><td colSpan={2} className="text-center text-ink-500">No categories</td></tr>}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function navigateSafe(id, tab) {
  const path = admissionPath(id, tab) || '/ipd/admissions';
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
