import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Activity, AlertTriangle, CalendarClock, CheckCircle2, Clock3, Droplets, Gauge,
  HeartPulse, IndianRupee, Stethoscope, Users, Wrench, ArrowUpRight, BedDouble, Filter,
} from 'lucide-react';
import api, { apiError } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import { LoadingState, ErrorState, EmptyState, Spinner } from '../../components/ui/Feedback';
import { MotionPage, MotionStagger, MotionItem } from '../../components/ui/Motion';
import { formatDate, formatDateTime, cn } from '../../lib/utils';
import { POLL } from '../../lib/polling';
import { useIpdRealtime } from '../../lib/useIpdRealtime';
import { useAuth } from '../../context/AuthContext';

const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const KPI = ({ label, value, sub, icon: Icon, tone, to }) => {
  const body = (
    <div className={cn('card h-full p-3.5 transition-colors', to && 'hover:border-brand-400/60', tone === 'critical' && 'border-rose-400/50', tone === 'warn' && 'border-amber-400/50', tone === 'ok' && 'border-emerald-400/40')}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">{label}</span>
        {Icon && <Icon className={cn('h-4 w-4', tone === 'critical' ? 'text-rose-400' : tone === 'warn' ? 'text-amber-400' : tone === 'ok' ? 'text-emerald-400' : 'text-ink-400')} />}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-ink-900">{value}</div>
      {sub && <div className="text-[10px] text-ink-500">{sub}</div>}
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
};

const MACHINE_STYLE = {
  IN_USE: 'border-rose-400 bg-rose-50 text-rose-700',
  AVAILABLE: 'border-emerald-400 bg-emerald-50 text-emerald-700',
  CLEANING: 'border-cyan-400 bg-cyan-50 text-cyan-700',
  MAINTENANCE: 'border-amber-400 bg-amber-50 text-amber-700',
  BLOCKED: 'border-ink-300 bg-ink-100 text-ink-500',
  RESERVED: 'border-blue-400 bg-blue-50 text-blue-700',
  DECOMMISSIONED: 'border-ink-200 bg-ink-50 text-ink-400',
};

const SESSION_STYLE = {
  SCHEDULED: 'bg-blue-50 text-blue-700 ring-blue-200',
  CHECKED_IN: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  PRE_ASSESSED: 'bg-violet-50 text-violet-700 ring-violet-200',
  READY: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
  CONNECTED: 'bg-amber-50 text-amber-700 ring-amber-200',
  IN_PROGRESS: 'bg-rose-50 text-rose-700 ring-rose-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  BILLED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  CLOSED: 'bg-ink-100 text-ink-600 ring-ink-200',
  CANCELLED: 'bg-ink-100 text-ink-500 ring-ink-200',
  NO_SHOW: 'bg-ink-100 text-ink-500 ring-ink-200',
};

const SHIFTS = ['MORNING', 'AFTERNOON', 'EVENING', 'NIGHT'];

export default function DialysisCommandCenter() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { status: liveStatus } = useIpdRealtime();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [shift, setShift] = useState('ALL');

  const cc = useQuery({
    queryKey: ['dialysis-command-center', date],
    queryFn: async () => (await api.get('/dialysis/command-center', { params: { date } })).data.data,
    refetchInterval: POLL.STANDARD,
  });

  const releaseMachine = useMutation({
    mutationFn: async ({ id, status, reason }) => (await api.patch(`/dialysis/machines/${id}/status`, { status, reason })).data.data,
    onSuccess: (m) => { toast.success(`${m.code} is now ${m.status}`); qc.invalidateQueries({ queryKey: ['dialysis-command-center'] }); },
    onError: (e) => toast.error(apiError(e)),
  });

  if (cc.isLoading) return <LoadingState label="Loading dialysis command centre…" />;
  if (cc.error) return <ErrorState message={apiError(cc.error)} />;

  const d = cc.data;
  const s = d.sessions;
  const m = d.machines;
  const st = d.stations;
  const f = d.financial;
  const cl = d.clinical;

  const roster = (d.roster || []).filter((r) => shift === 'ALL' || r.shift === shift);
  const byMachine = (d.roster || []).reduce((acc, r) => {
    if (r.machine) acc[r.machine] = r;
    return acc;
  }, {});

  return (
    <MotionPage className="p-5 space-y-5">
      <PageHeader
        title="Dialysis Command Center"
        subtitle={`Live unit status · ${d.date} · updated ${formatDateTime(d.updatedAt)}`}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" className="input w-36 py-1 text-xs" value={date} onChange={(e) => setDate(e.target.value)} />
            <span className={cn('badge', liveStatus === 'live' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>
              {liveStatus === 'live' ? 'Live' : 'Reconnecting'}
            </span>
            <Link to="/dialysis/machines" className="btn-secondary text-xs"><Wrench className="h-3.5 w-3.5" /> Machines</Link>
            <Link to="/dialysis/reports" className="btn-secondary text-xs">Reports</Link>
          </div>
        )}
      />

      {/* ---------- SESSIONS ---------- */}
      <section>
        <SectionTitle icon={CalendarClock} title="Today's sessions" right={`${s.today} scheduled`} />
        <MotionStagger className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-9">
          {[
            ['Today', s.today, null, CalendarClock],
            ['Scheduled', s.scheduled, null, Clock3],
            ['Checked in', s.checkedIn, null, CheckCircle2],
            ['Waiting', s.waiting, 'warn', Clock3],
            ['In progress', s.inProgress, 'critical', Activity],
            ['Completed', s.completed, 'ok', CheckCircle2],
            ['Cancelled', s.cancelled, null, Filter],
            ['No show', s.noShow, null, Users],
            ['Emergency', s.emergency, 'critical', AlertTriangle],
          ].map(([label, value, tone, Icon]) => (
            <MotionItem key={label}><KPI label={label} value={value} icon={Icon} tone={tone} /></MotionItem>
          ))}
        </MotionStagger>
      </section>

      {/* ---------- CLINICAL / MACHINES / STATIONS / MONEY ---------- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <section className="card p-3.5">
          <SectionTitle icon={HeartPulse} title="Clinical watch" compact />
          <div className="mt-2 grid grid-cols-2 gap-2 text-center">
            {[
              ['Requiring attention', cl.requiringAttention, 'critical'],
              ['Abnormal vitals', cl.abnormalVitals, 'critical'],
              ['Pending labs', cl.pendingLabResults, 'warn'],
              ['Critical alerts', cl.criticalAlerts, 'critical'],
              ['Complications today', cl.complicationsToday, 'warn'],
              ['Active patients', d.patients.totalActive, null],
            ].map(([l, v, tone]) => (
              <div key={l} className={cn('rounded-lg p-2', tone === 'critical' ? 'bg-rose-50' : tone === 'warn' ? 'bg-amber-50' : 'bg-ink-50')}>
                <div className="text-[10px] uppercase tracking-wide text-ink-500">{l}</div>
                <div className="text-lg font-bold tabular-nums text-ink-900">{v ?? 0}</div>
              </div>
            ))}
          </div>
          {cl.urgentPatients?.length > 0 && (
            <ul className="mt-2 space-y-1">
              {cl.urgentPatients.slice(0, 4).map((u) => (
                <li key={u.sessionId}>
                  <Link to={`/dialysis/session/${u.sessionId}`} className="flex items-center justify-between rounded-lg bg-rose-50 px-2 py-1.5 text-[11px] hover:bg-rose-100">
                    <span className="font-semibold text-ink-900">{u.patient}</span>
                    <span className="badge bg-rose-100 text-rose-700">{u.priority}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-3.5">
          <SectionTitle icon={Gauge} title="Machines" right={<Link to="/dialysis/machines" className="text-[11px] font-semibold text-brand-600 hover:underline">Manage</Link>} compact />
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            {[
              ['Total', m.total], ['In use', m.inUse], ['Available', m.available],
              ['Cleaning', m.cleaning], ['Maintenance', m.maintenance], ['Blocked', m.blocked],
            ].map(([l, v]) => (
              <div key={l} className="rounded-lg bg-ink-50 p-1.5">
                <div className="text-[10px] uppercase tracking-wide text-ink-500">{l}</div>
                <div className="text-sm font-bold tabular-nums text-ink-900">{v}</div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {m.list.map((x) => (
              <button
                key={x.id}
                title={`${x.code} — ${x.status}${byMachine[x.code] ? ` · ${byMachine[x.code].patient}` : ''}`}
                onClick={() => (x.status === 'CLEANING' ? releaseMachine.mutate({ id: x.id, status: 'AVAILABLE', reason: 'Turnover complete' }) : navigate('/dialysis/machines'))}
                className={cn('rounded-md border px-1.5 py-1 text-[10px] font-bold', MACHINE_STYLE[x.status] || MACHINE_STYLE.AVAILABLE)}
              >
                {x.code}
              </button>
            ))}
          </div>
        </section>

        <section className="card p-3.5">
          <SectionTitle icon={BedDouble} title="Stations / bays" right={`${st.total} total`} compact />
          <div className="mt-2 grid grid-cols-4 gap-2 text-center">
            {[
              ['Occupied', st.occupied], ['Free', st.available], ['Cleaning', st.cleaning], ['Reserved', st.reserved],
            ].map(([l, v]) => (
              <div key={l} className="rounded-lg bg-ink-50 p-1.5">
                <div className="text-[10px] uppercase tracking-wide text-ink-500">{l}</div>
                <div className="text-sm font-bold tabular-nums text-ink-900">{v}</div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {st.list.map((x) => (
              <span key={x.id} className={cn('rounded-md border px-1.5 py-1 text-[10px] font-bold', MACHINE_STYLE[x.status === 'OCCUPIED' ? 'IN_USE' : x.status] || 'border-ink-200 bg-ink-50 text-ink-600')}>
                {x.code}
              </span>
            ))}
          </div>
        </section>

        <section className="card p-3.5">
          <SectionTitle icon={IndianRupee} title="Financial" right={<Link to="/dialysis/billing" className="text-[11px] font-semibold text-brand-600 hover:underline">Billing</Link>} compact />
          <div className="mt-2 space-y-1.5">
            {[
              ["Today's revenue", rupees(f.todayRevenue), 'ok'],
              ['Collected', rupees(f.collected), 'ok'],
              ['Pending billing', `${f.pendingBilling} session(s)`, f.pendingBilling ? 'warn' : null],
              ['Pending payment', rupees(f.pendingPayment), f.pendingPayment > 0 ? 'critical' : 'ok'],
              ['Insurance pending', `${f.insurancePending} session(s)`, f.insurancePending ? 'warn' : 'ok'],
            ].map(([l, v, tone]) => (
              <div key={l} className={cn('flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs', tone === 'critical' ? 'bg-rose-50' : tone === 'warn' ? 'bg-amber-50' : 'bg-ink-50')}>
                <span className="text-ink-600">{l}</span>
                <span className="font-bold tabular-nums text-ink-900">{v}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ---------- ROSTER ---------- */}
      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <SectionTitle icon={Droplets} title="Session roster" right={`${roster.length} listed`} />
          <div className="flex flex-wrap gap-1">
            {['ALL', ...SHIFTS].map((x) => (
              <button key={x} onClick={() => setShift(x)} className={cn('rounded-lg px-2.5 py-1 text-[11px] font-semibold transition', shift === x ? 'bg-brand-600 text-white' : 'bg-white text-ink-600 ring-1 ring-inset ring-ink-200 hover:bg-ink-50')}>
                {x === 'ALL' ? 'All shifts' : x}
              </button>
            ))}
          </div>
        </div>
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr><th>Time</th><th>Session</th><th>Patient</th><th>Machine / bay</th><th>Doctor / nurse</th><th>UF</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {roster.map((r) => (
                <tr key={r.id}>
                  <td className="font-mono text-[11px]">{r.time ? new Date(r.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td className="font-mono text-[11px] font-semibold text-brand-700">{r.sessionNumber}</td>
                  <td>
                    <div className="text-xs font-semibold text-ink-900">{r.patient}</div>
                    <div className="text-[10px] text-ink-500">{r.uhid} · {r.dialysisNumber}</div>
                  </td>
                  <td className="text-[11px]">{r.machine || '—'}{r.station ? ` / ${r.station}` : ''}</td>
                  <td className="text-[11px]">{r.doctor || '—'}<div className="text-[10px] text-ink-500">{r.nurse || 'no nurse'}</div></td>
                  <td className="text-[11px] tabular-nums">{r.ufRemoved ?? 0} / {r.ufGoal ?? 0} ml</td>
                  <td><span className={cn('badge ring-1 ring-inset', SESSION_STYLE[r.status] || 'bg-ink-100 text-ink-600 ring-ink-200')}>{String(r.status).replace(/_/g, ' ')}</span></td>
                  <td>
                    <Link to={`/dialysis/session/${r.id}`} className="btn-secondary px-2 py-1 text-[11px]">
                      Open <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
              {!roster.length && <tr><td colSpan={8}><EmptyState title="No sessions for this shift" /></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <Link to="/dialysis/patients" className="btn-primary text-xs"><Users className="h-3.5 w-3.5" /> Dialysis patients</Link>
        <Link to="/dialysis/register" className="btn-secondary text-xs"><Stethoscope className="h-3.5 w-3.5" /> Register patient</Link>
        <Link to="/dialysis/reports" className="btn-secondary text-xs">Reports & exports</Link>
      </div>
    </MotionPage>
  );
}

function SectionTitle({ icon: Icon, title, right, compact }) {
  return (
    <div className={cn('mb-2 flex items-center justify-between gap-2', !compact && 'mb-2')}>
      <h2 className={cn('flex items-center gap-1.5 font-bold text-ink-900', compact ? 'text-xs' : 'text-sm')}>
        {Icon && <Icon className="h-4 w-4 text-brand-600" />} {title}
      </h2>
      {right && <span className="text-[11px] text-ink-500">{right}</span>}
    </div>
  );
}
