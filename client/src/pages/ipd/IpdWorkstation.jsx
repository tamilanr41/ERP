import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Stethoscope,
  HeartPulse,
  Receipt,
  LayoutGrid,
  Bed,
  Users,
  AlertTriangle,
  Activity,
  Pill,
  FlaskConical,
  Wallet,
  ArrowRight,
  Clock,
  ShieldAlert,
  TrendingUp,
  Banknote,
} from 'lucide-react';
import api, { apiError } from '../../lib/api';
import { admissionPath } from '../../lib/admissionPath';
import { POLL } from '../../lib/polling';
import PageHeader from '../../components/ui/PageHeader';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/Feedback';
import { MotionPage, MotionItem, MotionStagger } from '../../components/ui/Motion';
import { useIpdRealtime } from '../../lib/useIpdRealtime';
import { cn, formatDateTime, formatDate } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';

const pick = (v) => v || 0;
const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const Tile = ({ label, value, sub, tone = 'default', icon: Icon, to }) => {
  const body = (
    <div
      className={cn(
        'card h-full p-4 transition-colors',
        to && 'hover:border-brand-400/60 hover:bg-ink-50',
        tone === 'critical' && 'border-red-500/40',
        tone === 'warning' && 'border-amber-500/40',
        tone === 'ok' && 'border-emerald-500/30',
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">{label}</span>
        {Icon && <Icon className="h-4 w-4 text-ink-400" />}
      </div>
      <div className="mt-1.5 text-2xl font-bold tabular-nums text-ink-900">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-ink-500">{sub}</div>}
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
};

const AdmissionRow = ({ a, active, onOpen, right }) => (
  <button
    onClick={onOpen}
    className={cn(
      'flex w-full items-center justify-between gap-3 border-b border-ink-100 px-3 py-2.5 text-left transition-colors hover:bg-ink-50',
      active && 'bg-brand-50 ring-1 ring-inset ring-brand-200',
    )}
  >
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] font-semibold text-brand-700">{a.ipNumber || a.admissionNumber}</span>
        <span className="truncate text-sm font-semibold text-ink-900">
          {a.patientId?.firstName} {a.patientId?.lastName}
        </span>
      </div>
      <div className="truncate text-[11px] text-ink-500">
        {a.consultantDoctorId?.name || 'No consultant'} · {a.wardId?.name || 'No ward'}
        {a.bedId?.bedNumber ? ` / ${a.bedId.bedNumber}` : ''}
      </div>
    </div>
    {right}
  </button>
);

const useActiveAdmissions = () =>
  useQuery({
    queryKey: ['ipd-admissions', { active: true }],
    queryFn: async () => (await api.get('/ipd/admissions', { params: { status: 'ADMITTED', limit: 60 } })).data,
    refetchInterval: POLL.SLOW,
  });

/** Section 47 — DOCTOR WORKSTATION */
function DoctorWorkstation() {
  const navigate = useNavigate();
  const { status } = useIpdRealtime();
  const [id, setId] = useState(null);
  const list = useActiveAdmissions();
  const admissions = list.data || [];

  const ws = useQuery({
    queryKey: ['ipd-workspace', id],
    queryFn: async () => (await api.get(`/ipd/admissions/${id}/workspace`)).data,
    enabled: Boolean(id),
    refetchInterval: POLL.STANDARD,
  });

  const active = id || admissions[0]?._id || null;
  const d = ws.data;
  const labs = d?.workflow?.labOrders?.results || [];
  const rads = d?.workflow?.radiologyOrders?.orders || [];
  const pendingLabs = labs.filter((r) => !r.releasedToDoctor);
  const latestVitals = d?.vitals?.[0];

  return (
    <MotionPage className="p-5 space-y-4">
      <PageHeader
        title="Doctor Workstation"
        subtitle="My patients, results to review, orders to write"
        actions={<ConnectionPill status={status} />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="My inpatients" value={admissions.length} icon={Users} />
        <Tile label="Critical vitals" value={d?.vitals?.filter((v) => v.flags?.flags?.some((f) => f.endsWith(':CRITICAL'))).length || 0} tone="critical" icon={HeartPulse} />
        <Tile label="Results to review" value={labs.filter((r) => ['VERIFIED', 'REPORTED'].includes(r.status)).length} icon={FlaskConical} />
        <Tile label="Open orders" value={(d?.orders || []).filter((o) => !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(o.status)).length} icon={Pill} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-ink-100 px-3 py-2">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-500">Inpatients</span>
            <Link to="/ipd/admissions" className="text-[11px] font-semibold text-brand-600 hover:underline">All admissions</Link>
          </div>
          {list.isLoading ? <LoadingState label="Loading…" /> : !admissions.length ? <EmptyState title="No active inpatients" /> : (
            <div className="max-h-[560px] overflow-y-auto">
              {admissions.map((a) => (
                <AdmissionRow
                  key={a._id}
                  a={a}
                  active={a._id === active}
                  onOpen={() => setId(a._id)}
                  right={<ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-400" />}
                />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          {!active ? <EmptyState title="Select a patient" hint="Pick an inpatient to start the clinical round" /> : !d ? <LoadingState label="Loading patient 360…" /> : (
            <>
              <PatientStrip d={d} onOpenWorkspace={() => navigate(admissionPath(active, 'clinical') || '/ipd/admissions')} />

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="card p-4">
                  <SectionHead title="Vitals" icon={Activity} action={{ label: 'Record vitals (Alt+V)', to: admissionPath(active, 'vitals') || '/ipd/admissions' }} />
                  {latestVitals ? (
                    <div className="grid grid-cols-3 gap-2 text-center">
                      {[
                        ['Temp', `${latestVitals.temperature ?? '-'}°F`],
                        ['Pulse', latestVitals.pulse ?? '-'],
                        ['SpO2', `${latestVitals.spo2 ?? '-'}%`],
                        ['BP', latestVitals.bpSystolic ? `${latestVitals.bpSystolic}/${latestVitals.bpDiastolic}` : '-'],
                        ['Pain', latestVitals.painScore ?? '-'],
                        ['GCS', latestVitals.gcs ?? '-'],
                      ].map(([k, v]) => (
                        <div key={k} className="rounded-lg bg-ink-50 p-2">
                          <div className="text-[10px] uppercase tracking-wide text-ink-500">{k}</div>
                          <div className="text-sm font-bold tabular-nums text-ink-900">{v}</div>
                        </div>
                      ))}
                    </div>
                  ) : <EmptyState title="No vitals recorded" />}
                </div>

                <div className="card p-4">
                  <SectionHead title="Diagnosis & plan" icon={Stethoscope} action={{ label: 'Open clinical', to: admissionPath(active, 'clinical') || '/ipd/admissions' }} />
                  <dl className="space-y-2 text-xs">
                    <Row label="Chief complaint" value={d.admission.chiefComplaint || '—'} />
                    <Row label="Diagnosis" value={d.admission.provisionalDiagnosis || d.admission.admittingDiagnosis || '—'} />
                    <Row label="Consultant" value={d.admission.consultantDoctorId?.name || '—'} />
                    <Row label="Last visit" value={d.visits?.[0]?.visitDate ? formatDateTime(d.visits[0].visitDate) : 'No visit recorded'} />
                  </dl>
                </div>

                <div className="card p-4">
                  <SectionHead title="Results" icon={FlaskConical} action={{ label: 'Lab & imaging', to: admissionPath(active, 'lab') || '/ipd/admissions' }} />
                  {pendingLabs.length ? (
                    <p className="mb-2 rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">
                      {pendingLabs.length} result(s) awaiting lab verification
                    </p>
                  ) : null}
                  <ul className="space-y-1.5 text-xs">
                    {labs.slice(0, 6).map((r) => (
                      <li key={r._id} className="flex items-center justify-between gap-2 rounded-lg bg-ink-50 px-2 py-1.5">
                        <span className="truncate text-ink-800">{r.testName}</span>
                        <span className={cn('font-semibold', r.releasedToDoctor ? 'text-mint-600' : 'text-ink-400')}>
                          {r.releasedToDoctor ? (r.resultValue || 'Verified') : 'Pending'}
                        </span>
                      </li>
                    ))}
                    {!labs.length && <li className="text-ink-500">No lab results yet</li>}
                  </ul>
                  {rads.length > 0 && (
                    <p className="mt-2 text-[11px] text-ink-500">Imaging: {rads.map((r) => `${r.radiologyOrderNumber} (${r.status})`).join(', ')}</p>
                  )}
                </div>

                <div className="card p-4">
                  <SectionHead title="Today's orders" icon={Pill} action={{ label: 'Medications (Alt+M)', to: admissionPath(active, 'medications') || '/ipd/admissions' }} />
                  <ul className="space-y-1.5 text-xs">
                    {(d.orders || []).slice(0, 6).map((o) => (
                      <li key={o._id} className="flex items-center justify-between gap-2 rounded-lg bg-ink-50 px-2 py-1.5">
                        <span className="truncate text-ink-800">{o.name}</span>
                        <span className="shrink-0 text-[10px] font-semibold uppercase text-ink-500">{o.status}</span>
                      </li>
                    ))}
                    {!(d.orders || []).length && <li className="text-ink-500">No orders yet</li>}
                  </ul>
                </div>
              </div>

              <div className="card p-4">
                <SectionHead title="Clinical timeline" icon={Clock} action={{ label: 'Full timeline', to: admissionPath(active, 'timeline') || '/ipd/admissions' }} />
                <ol className="space-y-1.5 text-xs">
                  {(d.timeline || []).slice(-8).reverse().map((e, i) => (
                    <li key={i} className="flex items-center gap-3 border-l-2 border-ink-200 py-1 pl-3">
                      <span className="w-28 shrink-0 font-mono text-[10px] text-ink-500">{formatDateTime(e.at)}</span>
                      <span className="w-24 shrink-0 text-[10px] font-bold uppercase tracking-wide text-brand-600">{e.type}</span>
                      <span className="min-w-0 flex-1 truncate text-ink-800">{e.title}</span>
                      <span className="shrink-0 text-[10px] text-ink-500">{e.by}</span>
                    </li>
                  ))}
                  {!(d.timeline || []).length && <li className="text-ink-500">No events yet</li>}
                </ol>
              </div>
            </>
          )}
        </div>
      </div>
    </MotionPage>
  );
}

/** Section 47 — NURSE WORKSTATION */
function NurseWorkstation() {
  const qc = useQueryClient();
  const { status } = useIpdRealtime();
  const [id, setId] = useState(null);
  const [io, setIo] = useState({ oral: '', ivFluid: '', urine: '' });
  const list = useActiveAdmissions();
  const admissions = list.data || [];
  const active = id || admissions[0]?._id || null;

  const ws = useQuery({
    queryKey: ['ipd-workspace', active],
    queryFn: async () => (await api.get(`/ipd/admissions/${active}/workspace`)).data,
    enabled: Boolean(active),
    refetchInterval: POLL.STANDARD,
  });
  const d = ws.data;

  const saveVitals = async (payload) => {
    try {
      const r = await api.post(`/ipd/admissions/${active}/vitals`, payload);
      toast.success(`Vitals recorded${r.data?.flags?.critical ? ' — CRITICAL values flagged' : ''}`);
      qc.invalidateQueries({ queryKey: ['ipd-workspace', active] });
    } catch (e) { toast.error(apiError(e)); }
  };

  const saveIo = async () => {
    const input = { oral: Number(io.oral) || 0, ivFluid: Number(io.ivFluid) || 0 };
    const output = { urine: Number(io.urine) || 0 };
    if (!input.oral && !input.ivFluid && !output.urine) { toast.error('Enter at least one value'); return; }
    try {
      await api.post(`/ipd/admissions/${active}/io-chart`, { input, output });
      toast.success('I/O chart updated');
      setIo({ oral: '', ivFluid: '', urine: '' });
      qc.invalidateQueries({ queryKey: ['ipd-workspace', active] });
    } catch (e) { toast.error(apiError(e)); }
  };

  const giveMar = async (chartId, rowId) => {
    try {
      await api.patch(`/ipd/medication-charts/${chartId}/administrations/${rowId}`, { status: 'GIVEN' });
      toast.success('Medication administration recorded');
      qc.invalidateQueries({ queryKey: ['ipd-workspace', active] });
    } catch (e) { toast.error(apiError(e)); }
  };

  const dueMar = (d?.workflow?.mar || []).flatMap((c) =>
    (c.administrations || [])
      .filter((a) => a.status === 'SCHEDULED' && (!a.scheduledTime || new Date(a.scheduledTime) <= new Date()))
      .map((a) => ({ chart: c, row: a })),
  );

  return (
    <MotionPage className="p-5 space-y-4">
      <PageHeader title="Nurse Workstation" subtitle="Ward, patients, vitals, tasks, MAR, I/O and nursing notes" actions={<ConnectionPill status={status} />} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Patients in ward" value={admissions.length} icon={Users} />
        <Tile label="Medications due" value={dueMar.length} tone={dueMar.length ? 'warning' : 'ok'} icon={Pill} to={active ? admissionPath(active, 'mar') || '/ipd/admissions' : undefined} />
        <Tile label="Critical vitals (24h)" value={(d?.vitals || []).filter((v) => v.flags?.flags?.some((f) => f.endsWith(':CRITICAL'))).length} tone="critical" icon={HeartPulse} />
        <Tile label="Nursing notes" value={(d?.nursingNotes || []).length} icon={Stethoscope} to={active ? admissionPath(active, 'nursing') || '/ipd/admissions' : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-ink-100 px-3 py-2">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-500">Ward list</span>
            <Link to="/ipd/wards" className="text-[11px] font-semibold text-brand-600 hover:underline">Bed board</Link>
          </div>
          {!admissions.length ? <EmptyState title="No active patients" /> : (
            <div className="max-h-[520px] overflow-y-auto">
              {admissions.map((a) => (
                <AdmissionRow
                  key={a._id}
                  a={a}
                  active={a._id === active}
                  onOpen={() => setId(a._id)}
                  right={<Bed className="h-3.5 w-3.5 shrink-0 text-ink-400" />}
                />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          {!active ? <EmptyState title="Select a patient" /> : !d ? <LoadingState label="Loading patient…" /> : (
            <>
              <PatientStrip d={d} onOpenWorkspace={() => navigate(admissionPath(active, 'nursing') || '/ipd/admissions')} />

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="card p-4">
                  <SectionHead title="Record vitals" icon={Activity} action={{ label: 'Full chart (Alt+V)', to: admissionPath(active, 'vitals') || '/ipd/admissions' }} />
                  <VitalsForm onSubmit={saveVitals} />
                </div>

                <div className="card p-4">
                  <SectionHead title="Intake & output" icon={TrendingUp} action={{ label: 'I/O chart', to: admissionPath(active, 'io') || '/ipd/admissions' }} />
                  <div className="grid grid-cols-3 gap-2">
                    {[['oral', 'Oral (ml)'], ['ivFluid', 'IV (ml)'], ['urine', 'Urine (ml)']].map(([k, l]) => (
                      <label key={k} className="label">
                        {l}
                        <input className="input mt-1 py-1.5 text-sm" type="number" value={io[k]} onChange={(e) => setIo({ ...io, [k]: e.target.value })} />
                      </label>
                    ))}
                  </div>
                  <button className="btn-primary mt-3 w-full" onClick={saveIo}>Record I/O</button>
                  <div className="mt-3 space-y-1 text-[11px] text-ink-500">
                    {(d.workflow?.ioChart?.entries || []).slice(0, 3).map((e) => (
                      <div key={e._id} className="flex justify-between rounded bg-ink-50 px-2 py-1">
                        <span>{formatDateTime(e.recordedAt)}</span>
                        <span className="font-semibold text-ink-800">in {e.inputTotal}ml / out {e.outputTotal}ml</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card p-4 lg:col-span-2">
                  <SectionHead title="Medication administration (MAR)" icon={Pill} action={{ label: 'Open MAR', to: admissionPath(active, 'mar') || '/ipd/admissions' }} />
                  {dueMar.length ? (
                    <ul className="space-y-1.5">
                      {dueMar.map(({ chart, row }) => (
                        <li key={row._id} className="flex items-center justify-between gap-3 rounded-lg bg-ink-50 px-3 py-2 text-xs">
                          <div className="min-w-0">
                            <span className="font-semibold text-ink-900">{chart.medicineName}</span>
                            <span className="ml-2 text-ink-500">{chart.dosage} · {row.scheduledTime ? formatDateTime(row.scheduledTime) : 'unscheduled'}</span>
                          </div>
                          <button className="btn-primary px-2.5 py-1 text-[11px]" onClick={() => giveMar(chart._id, row._id)}>Record given</button>
                        </li>
                      ))}
                    </ul>
                  ) : <EmptyState title="Nothing due right now" hint="Scheduled administrations appear here" />}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </MotionPage>
  );
}

function VitalsForm({ onSubmit }) {
  const [v, setV] = useState({ temperature: '', pulse: '', spo2: '', bpSystolic: '', bpDiastolic: '', respiratoryRate: '', painScore: '' });
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); const payload = Object.fromEntries(Object.entries(v).filter(([, val]) => val !== '')); if (Object.keys(payload).length) onSubmit(payload); }}
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
    >
      {[
        ['temperature', 'Temp °F'], ['pulse', 'Pulse'], ['spo2', 'SpO2 %'],
        ['bpSystolic', 'Systolic'], ['bpDiastolic', 'Diastolic'], ['respiratoryRate', 'Resp rate'], ['painScore', 'Pain 0-10'],
      ].map(([k, l]) => (
        <label key={k} className="label">
          {l}
          <input className="input mt-1 py-1.5 text-sm" type="number" value={v[k]} onChange={set(k)} />
        </label>
      ))}
      <button className="btn-primary col-span-2 mt-1 sm:col-span-4" type="submit">Save vitals</button>
    </form>
  );
}

/** Section 47 — BILLING WORKSTATION */
function BillingWorkstation() {
  const qc = useQueryClient();
  const [ip, setIp] = useState('');
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('CASH');
  const [id, setId] = useState(null);

  const list = useQuery({
    queryKey: ['ipd-admissions', { limit: 60 }],
    queryFn: async () => (await api.get('/ipd/admissions', { params: { limit: 60 } })).data,
    refetchInterval: POLL.IDLE,
  });
  const active = id || (list.data || [])[0]?._id || null;

  const settle = useQuery({
    queryKey: ['ipd-settlement', active],
    queryFn: async () => (await api.get(`/ipd/billing/final/${active}`)).data,
    enabled: Boolean(active),
    retry: false,
    refetchInterval: POLL.SLOW,
  });
  const bills = useQuery({
    queryKey: ['ipd-admission-bills', active],
    queryFn: async () => (await api.get('/billing', { params: { admissionId: active, limit: 50 } })).data,
    enabled: Boolean(active),
  });
  const advances = useQuery({
    queryKey: ['ipd-advances', active],
    queryFn: async () => (await api.get(`/ipd/billing/advances/${active}`)).data,
    enabled: Boolean(active),
  });

  const collectAdvance = async () => {
    try {
      const r = await api.post(`/ipd/billing/advances/${active}`, { amount: Number(amount), mode });
      toast.success(`Advance receipt ${r.data.receiptNumber} created`);
      setAmount('');
      qc.invalidateQueries({ queryKey: ['ipd-advances', active] });
      qc.invalidateQueries({ queryKey: ['ipd-settlement', active] });
    } catch (e) { toast.error(apiError(e)); }
  };

  const search = (list.data || []).filter((a) =>
    !ip || `${a.admissionNumber} ${a.ipNumber || ''} ${a.patientId?.firstName || ''} ${a.patientId?.lastName || ''} ${a.patientId?.uhid || ''}`.toLowerCase().includes(ip.toLowerCase()));

  const finalBill = (bills.data || []).find((b) => b.isFinalBill);
  const s = settle.data;
  const outstanding = finalBill ? finalBill.dueAmount : (bills.data || []).reduce((t, b) => t + (b.status === 'SUPERSEDED' ? 0 : b.dueAmount || 0), 0);
  const advSummary = advances.data?.summary || {};

  return (
    <MotionPage className="p-5 space-y-4">
      <PageHeader title="Billing Workstation" subtitle="IP number, current bill, advances, outstanding, insurance and final settlement" />

      <div className="card p-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="label min-w-[240px] flex-1">
            Find patient / IP number
            <input className="input mt-1" value={ip} onChange={(e) => setIp(e.target.value)} placeholder="IP no, UHID or name" />
          </label>
          <div className="max-h-56 w-full overflow-y-auto rounded-lg border border-ink-200 md:w-80">
            {search.slice(0, 12).map((a) => (
              <AdmissionRow key={a._id} a={a} active={a._id === active} onOpen={() => setId(a._id)} />
            ))}
            {!search.length && <EmptyState title="No matching admission" />}
          </div>
        </div>
      </div>

      {!active ? <EmptyState title="Select an admission" /> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Tile label="Current bill" value={money(finalBill?.netTotal || (bills.data || []).reduce((t, b) => t + b.netTotal, 0))} icon={Receipt} />
            <Tile label="Advance available" value={money(advSummary.availableAdvance)} icon={Banknote} />
            <Tile label="Paid" value={money(finalBill?.paidAmount || 0)} icon={Wallet} tone="ok" />
            <Tile label="Outstanding" value={money(outstanding)} icon={AlertTriangle} tone={outstanding > 0 ? 'critical' : 'ok'} />
            <Tile label="Settlement" value={s ? `${s.status}` : 'Not built'} sub={s ? `net ${money(s.netTotal)}` : 'final bill not generated'} icon={ShieldAlert} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="card p-4">
              <SectionHead title="Collect advance" icon={Banknote} />
              <label className="label">Amount
                <input className="input mt-1" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount ₹" />
              </label>
              <label className="label mt-2">Mode
                <select className="select mt-1" value={mode} onChange={(e) => setMode(e.target.value)}>
                  {['CASH', 'CARD', 'UPI', 'NETBANKING', 'CHEQUE', 'INSURANCE'].map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
              <button className="btn-primary mt-3 w-full" onClick={collectAdvance} disabled={!Number(amount)}>Collect & issue receipt</button>
              <div className="mt-3 space-y-1 text-[11px]">
                {(advances.data?.advances || []).slice(0, 4).map((a) => (
                  <div key={a._id} className="flex justify-between rounded bg-ink-50 px-2 py-1">
                    <span className="font-mono">{a.receiptNumber}</span>
                    <span className="font-semibold">{money(a.amount)} · avail {money(a.availableAmount)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card overflow-hidden lg:col-span-2">
              <div className="flex items-center justify-between border-b border-ink-100 px-4 py-2">
                <span className="text-xs font-bold uppercase tracking-wider text-ink-500">Bills & insurance</span>
                <Link to={admissionPath(active, 'billing') || '/ipd/admissions'} className="text-[11px] font-semibold text-brand-600 hover:underline">Open billing tab</Link>
              </div>
              <div className="max-h-80 overflow-y-auto">
                <table className="table">
                  <thead><tr><th>Bill</th><th>Type</th><th>Status</th><th className="text-right">Net</th><th className="text-right">Paid</th><th className="text-right">Due</th></tr></thead>
                  <tbody>
                    {(bills.data || []).map((b) => (
                      <tr key={b._id}>
                        <td className="font-mono text-[11px]">{b.billNumber}{b.isFinalBill ? ' ★' : ''}</td>
                        <td className="text-[11px] uppercase">{b.isFinalBill ? 'FINAL' : b.billType}</td>
                        <td><span className={cn('badge', b.status === 'PAID' ? 'bg-mint-50 text-mint-700' : b.status === 'SUPERSEDED' ? 'bg-ink-100 text-ink-500' : 'bg-amber-50 text-amber-700')}>{b.status}</span></td>
                        <td className="text-right tabular-nums">{money(b.netTotal)}</td>
                        <td className="text-right tabular-nums">{money(b.paidAmount)}</td>
                        <td className="text-right font-semibold tabular-nums">{money(b.dueAmount)}</td>
                      </tr>
                    ))}
                    {!(bills.data || []).length && <tr><td colSpan={6} className="text-center text-ink-500">No bills yet</td></tr>}
                  </tbody>
                </table>
              </div>
              {s?.insurance && (
                <p className="border-t border-ink-100 px-4 py-2 text-[11px] text-ink-500">
                  Insurance approved {money(s.insurance.approvedAmount)} · sponsor payable {money(s.sponsor?.sponsorPayable)} · patient payable {money(s.sponsor?.patientPayable)}
                </p>
              )}
            </div>
          </div>

          {settle.isError && (
            <div className="card border-amber-200 p-3 text-xs text-amber-700">
              Final bill has not been generated for this admission yet —{' '}
              <Link to="/ipd/billing" className="font-semibold underline">open the billing desk</Link> to build it.
            </div>
          )}
        </>
      )}
    </MotionPage>
  );
}

/** Section 47 — ADMIN WORKSTATION */
function AdminWorkstation() {
  const { status } = useIpdRealtime();
  const cc = useQuery({
    queryKey: ['ipd-command-center'],
    queryFn: async () => (await api.get('/ipd/command-center')).data,
    refetchInterval: POLL.STANDARD,
  });
  const turnover = useQuery({
    queryKey: ['ipd-turnover-queue'],
    queryFn: async () => (await api.get('/ipd/beds/turnover-queue')).data,
    refetchInterval: POLL.SLOW,
  });
  const dash = useQuery({
    queryKey: ['ipd-discharge-dashboard'],
    queryFn: async () => (await api.get('/ipd/billing/discharge-dashboard')).data,
    refetchInterval: POLL.IDLE,
  });
  const qc = useQueryClient();

  const completeTurnover = async (bedId) => {
    try {
      const r = await api.post(`/ipd/beds/${bedId}/turnover`, { reason: 'Housekeeping completed' });
      toast.success(`Bed ${r.data.bedNumber} is available`);
      qc.invalidateQueries({ queryKey: ['ipd-turnover-queue'] });
      qc.invalidateQueries({ queryKey: ['ipd-command-center'] });
    } catch (e) { toast.error(apiError(e)); }
  };

  const c = cc.data || {};
  const revenue = (dash.data || []).reduce((t, r) => t + pick(r.netTotal), 0);
  const outstanding = (dash.data || []).reduce((t, r) => t + pick(r.due), 0);

  return (
    <MotionPage className="p-5 space-y-4">
      <PageHeader title="Admin Workstation" subtitle="Beds, admissions, discharges, occupancy, revenue and alerts" actions={<ConnectionPill status={status} />} />

      {cc.isLoading ? <LoadingState label="Loading command centre…" /> : cc.error ? <ErrorState message={apiError(cc.error)} /> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Tile label="Occupancy" value={`${c.occupancyPct || 0}%`} sub={`${c.occupied || 0} of ${c.total || 0} beds`} icon={Bed} to="/ipd/wards" />
            <Tile label="Available beds" value={c.available ?? '—'} sub={`${c.cleaning || 0} awaiting cleaning`} icon={LayoutGrid} to="/ipd/wards" />
            <Tile label="Active admissions" value={c.activeAdmissions ?? '—'} icon={Users} to="/ipd/admissions" />
            <Tile label="Billed (period)" value={money(revenue)} icon={TrendingUp} to="/ipd/reports" />
            <Tile label="Outstanding" value={money(outstanding)} tone={outstanding > 0 ? 'warning' : 'ok'} icon={AlertTriangle} to="/ipd/billing" />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-ink-100 px-4 py-2">
                <span className="text-xs font-bold uppercase tracking-wider text-ink-500">Ward occupancy</span>
                <Link to="/ipd/wards" className="text-[11px] font-semibold text-brand-600 hover:underline">Bed board</Link>
              </div>
              <div className="max-h-72 overflow-y-auto p-3">
                <MotionStagger className="space-y-2">
                  {(c.wards || []).map((w) => (
                    <MotionItem key={w._id || w.name}>
                      <div className="rounded-lg bg-ink-50 p-2.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-ink-900">{w.name}</span>
                          <span className="tabular-nums text-ink-500">{w.occupied}/{w.total}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-200">
                          <div className="h-full rounded-full bg-brand-500" style={{ width: `${w.total ? (w.occupied / w.total) * 100 : 0}%` }} />
                        </div>
                      </div>
                    </MotionItem>
                  ))}
                </MotionStagger>
              </div>
            </div>

            <div className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-ink-100 px-4 py-2">
                <span className="text-xs font-bold uppercase tracking-wider text-ink-500">Housekeeping turnover</span>
                <span className="text-[11px] text-ink-500">{(turnover.data || []).length} bed(s)</span>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {(turnover.data || []).map((b) => (
                  <div key={b._id} className="flex items-center justify-between gap-3 border-b border-ink-100 px-4 py-2 text-xs">
                    <div>
                      <span className="font-semibold text-ink-900">{b.code || b.bedNumber}</span>
                      <span className="ml-2 text-ink-500">{b.wardId?.name} {b.roomId?.roomNumber ? `/ ${b.roomId.roomNumber}` : ''}</span>
                    </div>
                    <button className="btn-secondary px-2.5 py-1 text-[11px]" onClick={() => completeTurnover(b._id)}>Mark cleaned</button>
                  </div>
                ))}
                {!(turnover.data || []).length && <EmptyState title="No beds awaiting cleaning" />}
              </div>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-ink-100 px-4 py-2">
              <span className="text-xs font-bold uppercase tracking-wider text-ink-500">Discharge & billing watchlist</span>
              <Link to="/ipd/billing" className="text-[11px] font-semibold text-brand-600 hover:underline">Billing desk</Link>
            </div>
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>IP</th><th>Patient</th><th>Stage</th><th>Readiness</th><th>Pending</th><th className="text-right">Due</th></tr></thead>
                <tbody>
                  {(dash.data || []).map((r) => (
                    <tr key={r.admissionId}>
                      <td><Link className="font-mono text-[11px] text-brand-600 hover:underline" to={admissionPath(r.admissionId) || '/ipd/admissions'}>{r.admissionNumber}</Link></td>
                      <td className="text-xs">
                        {r.patient || '—'}
                        <div className="text-[10px] text-ink-500">{r.uhid} · {r.ward || 'no ward'}{r.bed ? ` / ${r.bed}` : ''}</div>
                      </td>
                      <td className="text-[11px] uppercase">{String(r.stage || '').replace(/_/g, ' ')}</td>
                      <td><span className={cn('badge', r.readiness === 'READY' ? 'bg-mint-50 text-mint-700' : r.readiness === 'PLANNED' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700')}>{r.readiness}</span></td>
                      <td className="text-[11px] text-ink-500">{(r.pendingItems || []).slice(0, 2).join(', ') || '—'}</td>
                      <td className="text-right font-semibold tabular-nums">{money(r.due)}</td>
                    </tr>
                  ))}
                  {!(dash.data || []).length && <tr><td colSpan={6} className="text-center text-ink-500">Nothing pending discharge</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </MotionPage>
  );
}

const WORKSTATION_TABS_REF = {
  doctor: ['overview', 'clinical', 'vitals', 'visits', 'orders', 'medications', 'lab', 'radiology'],
  nurse: ['overview', 'vitals', 'nursing', 'mar', 'io'],
  billing: ['billing', 'payments', 'insurance', 'discharge'],
  admin: ['overview', 'transfers', 'timeline'],
};

const WORKSTATIONS = [
  { key: 'doctor', label: 'Doctor', icon: Stethoscope, desc: 'Header, timeline, vitals, notes, orders, medications, lab, radiology, diagnosis, plan', tabs: WORKSTATION_TABS_REF.doctor },
  { key: 'nurse', label: 'Nurse', icon: HeartPulse, desc: 'Ward, patient, bed, vitals, tasks, MAR, I/O chart, nursing notes', tabs: WORKSTATION_TABS_REF.nurse },
  { key: 'billing', label: 'Billing', icon: Receipt, desc: 'Patient, IP number, current bill, advance, payments, outstanding, insurance, final settlement', tabs: WORKSTATION_TABS_REF.billing },
  { key: 'admin', label: 'Admin', icon: LayoutGrid, desc: 'Beds, admissions, discharges, occupancy, revenue, alerts', tabs: WORKSTATION_TABS_REF.admin },
];

function WorkstationIndex() {
  const { user, hasPermission } = useAuth();
  const cc = useQuery({ queryKey: ['ipd-command-center'], queryFn: async () => (await api.get('/ipd/command-center')).data, refetchInterval: POLL.STANDARD });
  const can = (p) => hasPermission(p);
  const allowed = WORKSTATIONS.filter((w) => {
    if (w.key === 'doctor') return can('IPD_CLINICAL_RECORD') || can('OPD_EDIT');
    if (w.key === 'nurse') return can('NURSING_RECORD') || can('IPD_CLINICAL_RECORD');
    if (w.key === 'billing') return can('IPD_BILLING') || can('BILLING_VIEW') || can('PAYMENT_CREATE');
    return can('IPD_VIEW') || can('BED_VIEW');
  });
  const c = cc.data || {};

  return (
    <MotionPage className="p-6">
      <PageHeader title="IPD Workstations" subtitle={`Signed in as ${user?.firstName} ${user?.lastName} — pick the console for your role`} />
      <MotionStagger className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {allowed.map((w) => {
          const Icon = w.icon;
          return (
            <MotionItem key={w.key}>
              <Link to={`/ipd/workstation/${w.key}`} className="card block h-full p-5 transition-colors hover:border-brand-400/60 hover:bg-ink-50">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-3 text-sm font-bold text-ink-900">{w.label} workstation</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-500">{w.desc}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {w.tabs.slice(0, 5).map((t) => <span key={t} className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-500">{t}</span>)}
                </div>
                {w.key === 'admin' && (
                  <p className="mt-3 text-[11px] font-semibold text-brand-600">
                    {c.occupancyPct || 0}% occupied · {c.available ?? '—'} free · {c.cleaning || 0} cleaning
                  </p>
                )}
              </Link>
            </MotionItem>
          );
        })}
        {!allowed.length && <EmptyState title="No workstation available" hint="Your role has no IPD permissions" />}
      </MotionStagger>
    </MotionPage>
  );
}

export default function IpdWorkstation() {
  const { mode } = useParams();
  if (mode === 'doctor') return <DoctorWorkstation />;
  if (mode === 'nurse') return <NurseWorkstation />;
  if (mode === 'billing') return <BillingWorkstation />;
  if (mode === 'admin') return <AdminWorkstation />;
  return <WorkstationIndex />;
}

const Row = ({ label, value }) => (
  <div className="flex justify-between gap-3">
    <dt className="shrink-0 text-ink-500">{label}</dt>
    <dd className="truncate text-right font-medium text-ink-800">{value}</dd>
  </div>
);

const SectionHead = ({ title, icon: Icon, action }) => (
  <div className="mb-3 flex items-center justify-between gap-2">
    <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-500">
      {Icon && <Icon className="h-3.5 w-3.5" />} {title}
    </h3>
    {action?.to && (
      <Link to={action.to} className="text-[11px] font-semibold text-brand-600 hover:underline">{action.label}</Link>
    )}
  </div>
);

const PatientStrip = ({ d, onOpenWorkspace }) => (
  <div className="card sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-l-4 border-l-brand-500 p-4">
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-bold text-brand-600">{d.admission.ipNumber || d.admission.admissionNumber}</span>
        <span className="badge bg-mint-50 text-mint-700">{d.admission.status}</span>
        <span className="text-sm font-bold text-ink-900">
          {d.admission.patientId?.firstName} {d.admission.patientId?.lastName}
        </span>
        <span className="text-[11px] text-ink-500">{d.admission.patientId?.uhid} · {d.admission.patientId?.age?.years ?? d.admission.patientId?.age ?? '—'} yrs · {d.admission.patientId?.bloodGroup || 'blood group n/a'}</span>
      </div>
      <div className="mt-0.5 text-[11px] text-ink-500">
        {d.admission.wardId?.name || 'No ward'} {d.admission.bedId?.bedNumber ? `/ ${d.admission.bedId.bedNumber}` : ''} · {d.admission.consultantDoctorId?.name || 'No consultant'} · admitted {formatDate(d.admission.admittedAt)}
      </div>
    </div>
    <button className="btn-secondary" onClick={onOpenWorkspace}>Open full workspace</button>
  </div>
);

const ConnectionPill = ({ status }) => (
  <span className={cn(
    'badge',
    status === 'live' ? 'bg-mint-50 text-mint-700' : status === 'reconnecting' ? 'bg-amber-50 text-amber-700' : 'bg-ink-100 text-ink-500',
  )}>
    {status === 'live' ? 'Live' : status === 'reconnecting' ? 'Reconnecting' : 'Offline'}
  </span>
);
