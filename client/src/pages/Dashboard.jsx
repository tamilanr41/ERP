import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  CalendarDays,
  BedDouble,
  IndianRupee,
  Stethoscope,
  Pill,
  AlertTriangle,
  Plus,
  ArrowUpRight,
  Wallet,
  FlaskConical,
  FileWarning,
  ShieldCheck,
  Activity,
} from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import api, { apiError } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useThemeMode, CHART_COLORS } from '../lib/useThemeMode';
import PageHeader from '../components/ui/PageHeader';
import { LoadingState, ErrorState } from '../components/ui/Feedback';
import { formatCurrency, formatDate, cn } from '../lib/utils';
import { MODULES } from '../data/modules';

const fetchDashboard = async () => {
  const res = await api.get('/dashboard/', { params: { from: undefined, to: undefined } });
  return res.data.data;
};

const fetchTrend = async () => {
  const res = await api.get('/dashboard/revenue-trend', { params: { from: undefined, to: new Date().toISOString() } });
  return res.data.data;
};

const ALT = {
  brand: 'from-brand-500/15 to-brand-500/[0.02] text-brand-600',
  mint: 'from-mint-500/15 to-mint-500/[0.02] text-mint-600',
  amber: 'from-amber-500/15 to-amber-500/[0.02] text-amber-600',
  violet: 'from-violet-500/15 to-violet-500/[0.02] text-violet-600',
  cyan: 'from-cyan-500/15 to-cyan-500/[0.02] text-cyan-600',
  rose: 'from-rose-500/15 to-rose-500/[0.02] text-rose-600',
};

function StatCard({ icon: Icon, label, value, sub, accent = ALT.brand, onClick }) {
  return (
    <button
      onClick={onClick}
      className={cn('stat-card text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-cardHover', onClick && 'cursor-pointer')}
      style={{ ['--accent' ]: accent.includes('mint') ? '#1f7859' : accent.includes('amber') ? '#d97706' : accent.includes('violet') ? '#7c3aed' : accent.includes('cyan') ? '#0891b2' : accent.includes('rose') ? '#e11d48' : '#1d6ff5' }}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-ink-500">{label}</div>
          <div className="mt-1.5 text-2xl font-bold tracking-tight text-ink-900">{value}</div>
          {sub && <div className="mt-1 text-xs text-ink-500">{sub}</div>}
        </div>
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br', accent)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </button>
  );
}

function ModeBar({ mode, amount, total, color }) {
  const pct = total > 0 ? Math.round((amount / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[13px]">
        <span className="font-medium text-ink-700">{mode}</span>
        <span className="font-semibold tabular-nums text-ink-900">{formatCurrency(amount)}<span className="ml-1.5 text-xs font-normal text-ink-500">{pct}%</span></span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
        <div className={cn('h-full rounded-full transition-all duration-500', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isClinical } = useThemeMode();
  const chart = CHART_COLORS[isClinical ? 'clinical' : 'light'];

  const { data, isLoading, error } = useQuery({ queryKey: ['dashboard'], queryFn: fetchDashboard });
  const { data: trend } = useQuery({ queryKey: ['revenue-trend'], queryFn: fetchTrend });

  if (isLoading) return <LoadingState label="Loading command center…" />;
  if (error) return <ErrorState message={apiError(error)} />;

  const m = data.metrics || {};
  const breakdown = Array.isArray(data.collectionBreakdown) ? data.collectionBreakdown : [];
  const breakdownTotal = breakdown.reduce((s, r) => s + (Number(r.total) || 0), 0) || 1;
  const modeColors = {
    CASH: 'bg-mint-500', CARD: 'bg-brand-500', UPI: 'bg-violet-500', BANK_TRANSFER: 'bg-cyan-500',
    WALLET: 'bg-amber-500', CHEQUE: 'bg-rose-500', INSURANCE: 'bg-emerald-500', CREDIT: 'bg-ink-400',
  };
  const occupancyPct = m.beds?.occupancyPct ?? 0;

  return (
    <div className="p-6">
      <PageHeader
        title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${user?.firstName || ''}`}
        subtitle={`${user?.hospitalName || ''} · Live command center · ${formatDate(new Date())}`}
        actions={
          <button className="btn-primary" onClick={() => navigate('/patients/new')}>
            <Plus className="h-4 w-4" /> Register Patient
          </button>
        }
      />

      <section className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-ink-900">Command Center — Hospital Modules</h2>
            <p className="text-xs text-ink-500">Tap a module to open its workflows</p>
          </div>
          <span className="rounded-full bg-ink-50 px-2.5 py-1 text-[11px] font-semibold text-ink-500 ring-1 ring-ink-100">{MODULES.length} modules</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {MODULES.map((mod) => {
            const Icon = mod.icon;
            const liveCount = (mod.tiles || []).filter((t) => t.to).length;
            return (
              <button
                key={mod.key}
                  onClick={() => navigate(mod.to || `/modules/${mod.key}`)}
                className={cn(
                  'group relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-ink-100 bg-white p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-ink-200 hover:shadow-cardHover',
                )}
              >
                <div className={cn('absolute inset-0 bg-gradient-to-br opacity-0 transition-opacity group-hover:opacity-100', mod.accent)} />
                <div className="relative flex items-start justify-between">
                  <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ring-1', mod.accent)}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-ink-300 opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <div className="relative">
                  <div className="text-[13px] font-bold text-ink-900">{mod.label}</div>
                  {mod.tagline && <div className="mt-0.5 text-[11px] text-ink-500">{mod.tagline}</div>}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} label="Registered Patients" value={m.totalPatients ?? 0} onClick={() => navigate('/patients')} />
        <StatCard
          icon={CalendarDays}
          label="Today's Appointments"
          value={m.totalAppointments ?? 0}
          onClick={() => navigate('/appointments')}
        />
        <StatCard
          icon={BedDouble}
          label="Bed Occupancy"
          value={`${m.beds?.occupied ?? 0} / ${m.beds?.total ?? 0}`}
          sub={<span className="inline-flex items-center gap-1"><span className={cn('h-1.5 w-1.5 rounded-full', occupancyPct > 80 ? 'bg-rose-500' : occupancyPct > 50 ? 'bg-amber-500' : 'bg-mint-500')} />{occupancyPct}% occupied</span>}
          accent={occupancyPct > 80 ? ALT.rose : occupancyPct > 50 ? ALT.amber : ALT.mint}
          onClick={() => navigate('/beds')}
        />
        <StatCard
          icon={IndianRupee}
          label="Today's Collection"
          value={formatCurrency(m.collection)}
          sub={`${m.collectionTransactions ?? 0} transactions`}
          accent={ALT.mint}
          onClick={() => navigate('/billing')}
        />
        <StatCard icon={Stethoscope} label="OPD Visits Today" value={m.completedOPD ?? 0} onClick={() => navigate('/opd')} />
        <StatCard icon={BedDouble} label="Current IPD" value={m.currentIPD ?? 0} accent={ALT.cyan} onClick={() => navigate('/ipd')} />
        <StatCard icon={Pill} label="Pharmacy Sales Today" value={formatCurrency(m.pharmacySales)} sub={`${m.pharmacySalesCount ?? 0} transactions`} accent={ALT.violet} onClick={() => navigate('/pharmacy')} />
        <StatCard icon={AlertTriangle} label="Low Stock Items" value={m.lowStockCount ?? 0} accent={ALT.rose} onClick={() => navigate('/pharmacy')} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-ink-900">Revenue Trend</h2>
              <p className="text-xs text-ink-500">Daily billed revenue · latest 30 days</p>
            </div>
            <button onClick={() => navigate('/reports')} className="btn-secondary text-xs">
              Full reports <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend || []} margin={{ top: 6, right: 4, bottom: 0, left: -12 }}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chart.line} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={chart.line} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: chart.axis }} tickFormatter={(d) => d.slice(5)} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: chart.axis }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v) => [formatCurrency(v), 'Revenue']} contentStyle={{ borderRadius: 12, background: chart.tooltipBg, color: chart.tooltipText, border: `1px solid ${chart.tooltipBorder}`, boxShadow: '0 8px 24px -4px rgb(0 0 0 / 0.4)', fontSize: 12 }} />
                <Area type="monotone" dataKey="revenue" stroke={chart.line} fill="url(#rev)" strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-5">
          <div className="mb-4">
            <h2 className="text-sm font-bold text-ink-900">Collection by Mode</h2>
            <p className="text-xs text-ink-500">Today · across payment modes</p>
          </div>
          {breakdown.length > 0 ? (
            <div className="space-y-3">
              {breakdown.map((row) => (
                <ModeBar key={row._id} mode={row._id} amount={Number(row.total) || 0} total={breakdownTotal} color={modeColors[row._id] || 'bg-brand-500'} />
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-ink-400">No collections recorded today.</p>
          )}

          <div className="divider my-4" />

          <div className="mb-2 flex items-center gap-1.5">
            <FileWarning className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-semibold text-ink-900">Low Stock Alerts</h3>
          </div>
          {data.lowStock?.length ? (
            <ul className="divide-y divide-ink-200">
              {data.lowStock.slice(0, 5).map((s) => (
                <li key={s._id} className="flex items-center justify-between py-2 text-[13px]">
                  <span className="truncate pr-2 font-medium text-ink-700">{s.name}</span>
                  <span className="flex items-center gap-1 font-semibold text-rose-600">
                    <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[11px] font-bold text-rose-700">QTY {s.quantity}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-ink-500">All items stocked above threshold.</p>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="card flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Wallet className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-ink-500">Pending Insurance Claims</div>
            <div className="text-lg font-bold text-ink-900">{m.insurancePending ?? 0}</div>
          </div>
          <button onClick={() => navigate('/insurance')} className="btn-ghost text-xs">Open</button>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><FlaskConical className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-ink-500">Outstanding Payments</div>
            <div className="text-lg font-bold text-ink-900">{m.pendingPayments ?? 0}</div>
          </div>
          <button onClick={() => navigate('/billing')} className="btn-ghost text-xs">Open</button>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><ShieldCheck className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-ink-500">Live Operational Status</div>
            <div className="text-base font-bold text-mint-600">Systems nominal</div>
          </div>
          <Activity className="h-4 w-4 animate-pulse-soft text-mint-500" />
        </div>
      </div>
    </div>
  );
}