import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BedDouble,
  CalendarClock,
  Clock3,
  DoorOpen,
  HeartPulse,
  Users,
} from 'lucide-react';
import api, { apiError } from '../../lib/api';
import { POLL } from '../../lib/polling';
import { admissionPath } from '../../lib/admissionPath';
import PageHeader from '../../components/ui/PageHeader';
import { LoadingState, ErrorState } from '../../components/ui/Feedback';
import { formatDateTime, cn } from '../../lib/utils';
import { useIpdRealtime } from '../../lib/useIpdRealtime';

const WARD_COLORS = {
  ICU: '#dc2626',
  GENERAL: '#2563eb',
  PRIVATE: '#7c3aed',
  'SEMI-PRIVATE': '#0891b2',
  EMERGENCY: '#ea580c',
  PEDIATRIC: '#db2777',
  MATERNITY: '#c026d3',
  ISOLATION: '#ca8a04',
  SPECIALTY: '#059669',
};

const TONE = {
  amber: 'border-amber-200 bg-amber-50/60',
  blue: 'border-blue-200 bg-blue-50/60',
  violet: 'border-violet-200 bg-violet-50/60',
  rose: 'border-rose-200 bg-rose-50/60',
};

function AttentionCard({ title, empty, tone = 'blue', rows = [], onOpen, render }) {
  return (
    <div className={cn('rounded-2xl border p-3', TONE[tone] || TONE.blue)}>
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className="text-xs font-bold uppercase tracking-wider text-ink-600">{title}</h3>
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-ink-600 ring-1 ring-ink-200">{rows.length}</span>
      </div>
      {rows.length ? (
        <div className="space-y-1">
          {rows.slice(0, 6).map((a) => (
            <button
              key={a._id}
              onClick={() => onOpen(a)}
              className="flex w-full items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-left ring-1 ring-ink-100 transition hover:bg-ink-50"
            >
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-ink-900">
                  {a.patientId?.firstName} {a.patientId?.lastName}
                </span>
                <span className="block font-mono text-[10px] text-ink-500">{a.admissionNumber}</span>
              </span>
              <span className="shrink-0 text-[10px] font-medium text-ink-500">
                {render ? render(a) : a.wardId?.name || '—'}
              </span>
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-ink-400" />
            </button>
          ))}
        </div>
      ) : (
        <p className="px-1 py-3 text-xs text-ink-500">{empty}</p>
      )}
    </div>
  );
}

export default function IpdDashboard() {
  const navigate = useNavigate();
  const { status: liveStatus } = useIpdRealtime();

  const cc = useQuery({
    queryKey: ['ipd-command-center'],
    queryFn: async () => (await api.get('/ipd/command-center')).data.data,
    refetchInterval: POLL.STANDARD,
  });

  const admissions = useQuery({
    queryKey: ['ipd-admissions-all'],
    queryFn: async () => (await api.get('/ipd/admissions', { params: { limit: 100 } })).data.data,
    refetchInterval: POLL.STANDARD,
  });

  const byId = useMemo(() => new Map((admissions.data || []).map((a) => [String(a._id), a])), [admissions.data]);
  const rowsFor = (ids) => (ids || []).map((id) => byId.get(String(id))).filter(Boolean);

  if (cc.isLoading || admissions.isLoading) return <LoadingState label="Loading IPD command center…" />;
  if (cc.error) return <ErrorState message={apiError(cc.error)} />;

  const d = cc.data || {};
  const wards = d.wards || [];

  const heroStat = (l, v, i, small) => (
    <div className="rounded-xl bg-white/10 p-3 ring-1 ring-white/20">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-blue-200">
        {i} {l}
      </div>
      <div className={cn('mt-1 font-extrabold tabular-nums', small ? 'text-lg' : 'text-2xl')}>{v}</div>
    </div>
  );

  return (
    <div className="p-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#060d1a] via-[#0a1a30] to-[#062b3a] p-6 text-white shadow-lg shadow-black/50">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />
        <div className="absolute inset-0 opacity-[0.3]" style={{ backgroundImage: 'radial-gradient(rgba(125,211,252,0.35) 1px, transparent 1px)', backgroundSize: '18px 18px' }} />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-blue-200">
              <HeartPulse className="h-4 w-4" /> Clinical Command Center
            </div>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight">IPD Command Center</h1>
            <p className="mt-1 max-w-2xl text-[13px] text-blue-100">
              Every bed, every admission, every pending clinical action — live.
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-xl bg-white/10 px-3 py-2 ring-1 ring-white/20 backdrop-blur">
            {liveStatus === 'live' ? (
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
              </span>
            ) : (
              <span className={cn('h-2.5 w-2.5 rounded-full', liveStatus === 'reconnecting' ? 'bg-amber-400' : 'bg-ink-400')} />
            )}
            <span className="text-xs font-semibold text-white">
              {liveStatus === 'live' ? 'LIVE' : liveStatus === 'reconnecting' ? 'RECONNECTING' : 'OFFLINE'}
            </span>
            <span className="hidden font-mono text-[11px] text-blue-200 sm:inline">{formatDateTime(d.updatedAt)}</span>
          </div>
        </div>

        <div className="relative mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <div className="col-span-2 rounded-xl bg-white/10 p-3 ring-1 ring-white/20 sm:col-span-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-200">Overall occupancy</div>
            <div className="mt-1 flex items-end gap-1">
              <div className="text-3xl font-extrabold tabular-nums">{d.occupancyPct}%</div>
              <div className="mb-1 text-[11px] text-blue-200">{d.occupied}/{d.total} beds</div>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-white transition-all" style={{ width: `${d.occupancyPct || 0}%` }} />
            </div>
          </div>
          {heroStat('Active admissions', d.activeAdmissions || 0, <Users className="h-4 w-4" />)}
          {heroStat('Admitted today', d.todayAdmissions || 0, <DoorOpen className="h-4 w-4" />)}
          {heroStat('Discharged today', d.todayDischarges || 0, <Activity className="h-4 w-4" />)}
          {heroStat('Waiting for bed', d.waitingAdmissions || 0, <Clock3 className="h-4 w-4" />, true)}
          {heroStat(`Outstanding ₹${((d.outstandingAmount || 0) / 1000).toFixed(0)}k`, (d.dischargePlanned?.length || 0) + ' planned', <CalendarClock className="h-4 w-4" />, true)}
        </div>
      </div>

      <div className="mb-3 mt-6 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink-900"><BedDouble className="h-4 w-4 text-brand-600" /> Ward-wise bed occupancy</h2>
        <button className="btn-secondary text-xs" onClick={() => navigate('/ipd/wards')}>Open bed board</button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {wards.map((w) => {
          const occ = w.counts?.occupied || 0;
          const pct = w.total ? Math.round((occ / w.total) * 100) : 0;
          const color = WARD_COLORS[w.wardType] || '#2563eb';
          return (
            <div key={w._id} className="card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                  <span className="text-sm font-semibold text-ink-900">{w.name}</span>
                  <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold text-ink-500">{w.wardType}</span>
                </div>
                <span className="text-xs font-semibold text-ink-500">{occ}/{w.total}</span>
              </div>
              <div className="mt-2.5 flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                </div>
                <span className="w-9 text-right font-mono text-xs font-bold tabular-nums" style={{ color }}>{pct}%</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-medium">
                <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700 ring-1 ring-inset ring-emerald-200">{w.counts?.available || 0} free</span>
                <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-600 ring-1 ring-inset ring-red-200">{occ} occupied</span>
                {w.counts?.cleaning > 0 && <span className="rounded bg-ink-100 px-1.5 py-0.5 text-ink-600 ring-1 ring-inset ring-ink-200">{w.counts.cleaning} cleaning</span>}
                {w.counts?.reserved > 0 && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700 ring-1 ring-inset ring-amber-200">{w.counts.reserved} reserved</span>}
                {w.counts?.maintenance > 0 && <span className="rounded bg-ink-100 px-1.5 py-0.5 text-ink-600 ring-1 ring-inset ring-ink-200">{w.counts.maintenance} maint.</span>}
                {w.counts?.blocked > 0 && <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-600 ring-1 ring-inset ring-red-200">{w.counts.blocked} blocked</span>}
              </div>
            </div>
          );
        })}
        {!wards.length && <p className="text-sm text-ink-500">No active inpatients</p>}
      </div>

      <h2 className="mb-3 mt-6 flex items-center gap-2 text-sm font-bold text-ink-900"><AlertTriangle className="h-4 w-4 text-amber-500" /> Needs attention</h2>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <AttentionCard
          title="Waiting for bed"
          empty="No one waiting"
          tone="amber"
          rows={rowsFor(d.waitingAdmissionsIds)}
          onOpen={(a) => navigate(admissionPath(a) || '/ipd/admissions')}
          render={(a) => a.priority || 'ROUTINE'}
        />
        <AttentionCard
          title="Expected discharges"
          empty="No expected discharges"
          tone="blue"
          rows={rowsFor(d.expectedDischarges)}
          onOpen={(a) => navigate(admissionPath(a, 'discharge') || '/ipd/admissions')}
          render={(a) => (a.expectedDischargeDate ? formatDateTime(a.expectedDischargeDate) : '—')}
        />
        <AttentionCard
          title="Pending investigations"
          empty="No pending investigations"
          tone="violet"
          rows={rowsFor(d.pendingInvestigationsAdmissions)}
          onOpen={(a) => navigate(admissionPath(a, 'orders') || '/ipd/admissions')}
        />
        <AttentionCard
          title="Pending billing"
          empty="All settled"
          tone="rose"
          rows={rowsFor(d.pendingBilling)}
          onOpen={(a) => navigate(admissionPath(a, 'billing') || '/ipd/admissions')}
          render={(a) => `due ₹${Math.round((a.estimatedBill || 0) / 1000)}k`}
        />
      </div>
    </div>
  );
}
