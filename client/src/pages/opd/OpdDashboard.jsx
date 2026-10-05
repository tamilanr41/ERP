import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Stethoscope,
  CalendarDays,
  Footprints,
  Users,
  UserCheck,
  CheckCircle2,
  UserX,
  Banknote,
  FlaskConical,
  CalendarClock,
  UserPlus,
  IndianRupee,
  Plus,
  ArrowRight,
  HeartPulse,
  Ticket,
  Activity,
  Pill,
  ClipboardCheck,
  Printer,
  FileText,
  Wallet,
  Undo2,
  Settings2,
  Receipt,
  ChevronRight,
  UserSearch,
  Gauge,
  ArrowLeftRight,
} from 'lucide-react';
import api, { apiError } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/Feedback';
import { formatCurrency, formatDateTime, cn } from '../../lib/utils';
import { badge } from '../../components/ui/Badge';

const TILES = {
  teal: 'bg-blue-500/15 text-blue-600 ring-blue-500/20',
  indigo: 'bg-indigo-500/15 text-indigo-600 ring-indigo-500/20',
  amber: 'bg-amber-500/15 text-amber-600 ring-amber-500/20',
  rose: 'bg-rose-500/15 text-rose-600 ring-rose-500/20',
  cyan: 'bg-cyan-500/15 text-cyan-600 ring-cyan-500/20',
  mint: 'bg-blue-500/15 text-blue-600 ring-blue-500/20',
  violet: 'bg-violet-500/15 text-violet-600 ring-violet-500/20',
};

const WORKFLOW = [
  { step: 1, label: 'Registration', hint: 'நோயாளி பதிவு', what: 'Create or find the patient record — every visit starts here.', to: '/opd/registration', icon: UserPlus, tl: TILES.teal },
  { step: 2, label: 'Token / Queue', hint: 'எண் & வரிசை', what: 'Patient gets a number and waits for their turn.', to: '/opd/queue', icon: Ticket, tl: TILES.indigo },
  { step: 3, label: 'Vitals', hint: 'உடல் அளவுகள்', what: 'Nurse records BP, temperature, pulse & weight.', to: '/opd/vitals', icon: HeartPulse, tl: TILES.cyan },
  { step: 4, label: 'Consultation', hint: 'மருத்துவர் பரிசோதனை', what: 'Doctor examines, checks symptoms & makes a diagnosis.', to: '/opd/consultation', icon: Stethoscope, tl: TILES.teal },
  { step: 5, label: 'Investigations', hint: 'பரிசோதனைகள்', what: 'Lab / radiology tests (blood, X-ray, etc.) if needed.', to: '/opd/orders', icon: FlaskConical, tl: TILES.violet },
  { step: 6, label: 'Prescription', hint: 'மருந்துச்சீட்டு', what: 'Doctor prescribes medicines with dosage & duration.', to: '/opd/prescriptions', icon: Pill, tl: TILES.amber },
  { step: 7, label: 'Billing', hint: 'பில் / கட்டணம்', what: 'Bill for the visit, tests & treatment; collect payment.', to: '/opd/billing', icon: Receipt, tl: TILES.rose },
  { step: 8, label: 'Documents', hint: 'ஆவணங்கள்', what: 'Print the slips, summary, certificate & reports.', to: '/opd/documents', icon: Printer, tl: TILES.indigo },
  { step: 9, label: 'Follow-up', hint: 'மறு பரிசோதனை', what: 'Schedule the next visit — most OPs end with this.', to: '/opd/followup', icon: CalendarClock, tl: TILES.mint },
];

const MODULES = [
  { label: 'OPD Dashboard', desc: 'Live overview', to: '/opd/dashboard', icon: Gauge, tl: TILES.teal },
  { label: 'Patient Registration', desc: 'Add a new patient', to: '/opd/registration', icon: UserPlus, tl: TILES.teal },
  { label: 'Patient Search', desc: 'Find by name / UHID', to: '/opd/search', icon: UserSearch, tl: TILES.cyan },
  { label: 'Appointments', desc: 'Book doctor slots', to: '/opd/appointments', icon: CalendarDays, tl: TILES.violet },
  { label: 'Walk-in', desc: 'No appointment patients', to: '/opd/walkin', icon: Footprints, tl: TILES.mint },
  { label: 'OP Queue', desc: 'Waiting & doctor assign', to: '/opd/queue', icon: Users, tl: TILES.amber },
  { label: 'Vitals', desc: 'BP, temp, pulse', to: '/opd/vitals', icon: Activity, tl: TILES.cyan },
  { label: 'Consultation', desc: 'Examine & diagnose', to: '/opd/consultation', icon: Stethoscope, tl: TILES.teal },
  { label: 'Investigation Orders', desc: 'Lab & X-ray tests', to: '/opd/orders', icon: FlaskConical, tl: TILES.violet },
  { label: 'Prescriptions', desc: 'Write medicines (Rx)', to: '/opd/prescriptions', icon: Pill, tl: TILES.mint },
  { label: 'Referrals', desc: 'Refer to another doctor', to: '/opd/referrals', icon: ArrowLeftRight, tl: TILES.amber },
  { label: 'Follow-up', desc: 'Plan next visit', to: '/opd/followup', icon: CalendarClock, tl: TILES.cyan },
  { label: 'Complete Visit', desc: 'Close the OP visit', to: '/opd/completion', icon: ClipboardCheck, tl: TILES.mint },
  { label: 'Documents', desc: 'Slips & certificates', to: '/opd/documents', icon: Printer, tl: TILES.teal },
  { label: 'OP Billing', desc: 'Bill & collect payment', to: '/opd/billing', icon: Receipt, tl: TILES.amber },
  { label: 'Payments', desc: 'Receipts & collections', to: '/opd/payments', icon: Wallet, tl: TILES.mint },
  { label: 'Refunds', desc: 'Refund overpaid bills', to: '/opd/refunds', icon: Undo2, tl: TILES.rose },
  { label: 'Reports', desc: 'Print / export reports', to: '/opd/reports', icon: FileText, tl: TILES.cyan },
  { label: 'OPD Settings', desc: 'Branches & departments', to: '/opd/settings', icon: Settings2, tl: TILES.violet },
];

function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="rounded-xl border border-white/15 bg-white/10 px-3 py-1.5 text-right backdrop-blur">
      <div className="font-mono text-sm font-bold tabular-nums text-white">
        {now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </div>
      <div className="text-[10px] text-blue-50/80">
        {now.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tile = TILES.teal, onClick, sub }) {
  return (
    <button
      onClick={onClick}
      className="group relative overflow-hidden rounded-2xl border border-ink-100 bg-white p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-cardHover"
    >
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-blue-400/0 via-blue-400/40 to-blue-400/0 opacity-0 transition group-hover:opacity-100" />
      <div className="flex items-center gap-2.5">
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1', tile)}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <div className="truncate text-[11px] font-medium leading-tight text-ink-500">{label}</div>
          <div className="mt-0.5 truncate font-mono text-xl font-bold tracking-tight text-ink-900">{value}</div>
        </div>
      </div>
      {sub && <div className="mt-1.5 text-[10px] text-ink-400">{sub}</div>}
    </button>
  );
}

function SectionTitle({ icon: Icon, title, sub, action, onAction, tile = TILES.teal }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-ink-100 px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg ring-1', tile)}><Icon className="h-4 w-4" /></span>
        <div>
          <h2 className="text-sm font-bold text-ink-900">{title}</h2>
          {sub && <p className="text-[11px] text-ink-500">{sub}</p>}
        </div>
      </div>
      {action && (
        <button onClick={onAction} className="btn-ghost text-xs">
          {action} <ArrowRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export default function OpdDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data, isLoading, error } = useQuery({
    queryKey: ['opd-command-center'],
    queryFn: async () => (await api.get('/dashboard/opd')).data.data,
    refetchInterval: 30000,
  });

  if (isLoading) return <LoadingState label="Loading OPD control room…" />;
  if (error) return <ErrorState message={apiError(error)} />;

  const m = data.metrics || {};
  const visits = data.recentVisits || [];

  return (
    <div className="p-6">
      <div
        className="relative overflow-hidden rounded-2xl border border-blue-900/10 bg-gradient-to-br from-blue-800 via-blue-700 to-brand-700 px-6 py-6 text-white shadow-xl shadow-blue-900/20"
        style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.14) 1px, transparent 1px), linear-gradient(120deg, #1e3a8a, #2563eb, #0ea5e9)' }}
      >
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-blue-300/20 blur-3xl" />
        <span className="pointer-events-none absolute right-24 top-6 h-10 w-10 rounded-xl border border-white/10" style={{ transform: 'rotate(12deg)' }} />
        <span className="pointer-events-none absolute bottom-8 right-40 h-6 w-6 rounded-full border border-white/10" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
              <Stethoscope className="h-7 w-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-blue-100/90">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold normal-case tracking-normal ring-1 ring-white/20">
                  <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-300 opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-300" /></span>
                  LIVE
                </span>
                {user?.hospitalName || 'ZhanX Medical Centre'} · Main Branch
              </div>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">OPD Control Room</h1>
              <p className="mt-0.5 text-sm text-blue-50/90">Outpatient operations at a glance · tap anything to open it</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <LiveClock />
            <button
              className="btn-primary !border-0 bg-white text-blue-700 shadow-md shadow-blue-950/30 hover:bg-blue-50"
              onClick={() => navigate('/opd/registration')}
            >
              <Plus className="h-4 w-4" /> New Registration
            </button>
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        <Kpi icon={UserPlus} label="Today's OPD" value={m.totalOPD ?? 0} tile={TILES.teal} sub="total visits" onClick={() => navigate('/opd/queue')} />
        <Kpi icon={CalendarDays} label="Appointments" value={m.appointments ?? 0} tile={TILES.violet} sub={`${m.appointmentsBooked ?? 0} booked`} onClick={() => navigate('/opd/appointments')} />
        <Kpi icon={Footprints} label="Walk-ins" value={m.walkins ?? 0} tile={TILES.mint} sub="without appointment" onClick={() => navigate('/opd/walkin')} />
        <Kpi icon={Users} label="Waiting" value={m.waiting ?? 0} tile={TILES.amber} sub="in queue" onClick={() => navigate('/opd/queue')} />
        <Kpi icon={UserCheck} label="In Consultation" value={m.inConsultation ?? 0} tile={TILES.cyan} onClick={() => navigate('/opd/consultation')} />
        <Kpi icon={CheckCircle2} label="Completed" value={m.completed ?? 0} tile={TILES.mint} onClick={() => navigate('/opd/search')} />
        <Kpi icon={UserX} label="No Show" value={m.noShow ?? 0} tile={TILES.rose} onClick={() => navigate('/opd/appointments')} />
        <Kpi icon={Banknote} label="Pending Billing" value={m.pendingBilling ?? 0} tile={TILES.amber} sub="needs payment" onClick={() => navigate('/opd/billing')} />
        <Kpi icon={FlaskConical} label="Pending Tests" value={m.pendingInvestigations ?? 0} tile={TILES.violet} onClick={() => navigate('/opd/orders')} />
        <Kpi icon={CalendarClock} label="Follow-ups" value={m.followUps ?? 0} tile={TILES.cyan} onClick={() => navigate('/opd/followup')} />
        <Kpi icon={UserPlus} label="Registered Today" value={m.registeredToday ?? 0} tile={TILES.teal} onClick={() => navigate('/opd/registration')} />
        <Kpi icon={IndianRupee} label="Collection" value={formatCurrency(m.collection ?? 0)} tile={TILES.mint} onClick={() => navigate('/opd/billing')} />
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-ink-100 bg-white">
        <SectionTitle icon={HeartPulse} title="How an OP visit flows" sub="Standard outpatient journey — every hospital follows this" />
        <div className="scrollbar-none flex gap-2 overflow-x-auto p-3">
          {WORKFLOW.map((s, i) => (
            <div key={s.step} className="relative flex shrink-0 items-stretch" style={{ width: i === WORKFLOW.length - 1 ? 'auto' : 'min(230px, 100%)' }}>
              <button
                onClick={() => navigate(s.to)}
                className="group flex w-full flex-col gap-2 rounded-xl border border-ink-100 bg-gradient-to-br from-ink-50/70 to-white px-3 py-3 text-left transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-cardHover"
              >
                <div className="flex items-center gap-2">
                  <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ring-1', s.tl)}>{s.step}</span>
                  <s.icon className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <div className="text-[13px] font-bold text-ink-900">{s.label}</div>
                  <div className="text-[10px] font-semibold text-blue-600">{s.hint}</div>
                </div>
                <p className="text-[10.5px] leading-snug text-ink-500">{s.what}</p>
                <span className="mt-auto flex items-center gap-1 text-[10px] font-semibold text-blue-700 opacity-0 transition group-hover:opacity-100">
                  Open <ArrowRight className="h-3 w-3" />
                </span>
              </button>
              {i < WORKFLOW.length - 1 && (
                <span className="absolute -right-2 bottom-6 z-10 hidden text-blue-300 md:block"><ChevronRight className="h-4 w-4" /></span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-ink-100 bg-white">
        <SectionTitle icon={Gauge} title="Every module, one card away" sub="All OPD screens grouped logically" />
        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {MODULES.map(({ label, desc, to, icon: Icon, tl }) => (
            <button
              key={to + label}
              onClick={() => navigate(to)}
              className="group flex flex-col items-start gap-2 rounded-xl border border-ink-100 bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-cardHover"
            >
              <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 transition group-hover:scale-105', tl)}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-bold text-ink-900">{label}</span>
                <span className="block truncate text-[11px] text-ink-500">{desc}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="card overflow-hidden xl:col-span-2">
          <SectionTitle icon={Users} title="Today's OPD Flow" sub="Latest visits arriving in the outpatient department" action="Open queue" onAction={() => navigate('/opd/queue')} />
          {visits.length === 0 ? (
            <EmptyState title="No visits yet today" hint="Register the first patient to start the flow" />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>OPD No</th>
                  <th>Patient</th>
                  <th>Doctor</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {visits.map((v) => (
                  <tr key={v._id} className="cursor-pointer" onClick={() => navigate('/opd/walkin')}>
                    <td className="font-medium text-blue-700">{v.opdNumber}</td>
                    <td>
                      <div className="font-medium text-ink-900">{v.patientId?.firstName} {v.patientId?.lastName || ''}</div>
                      <div className="text-xs text-ink-400">{v.patientId?.uhid}</div>
                    </td>
                    <td className="text-[13px]">{v.doctorId?.name || '—'}</td>
                    <td>{v.visitType?.replace('_', ' ') || '—'}</td>
                    <td>{badge(v.status)}</td>
                    <td className="text-xs text-ink-500">{formatDateTime(v.visitDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="space-y-4">
          <div className="card p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg ring-1', TILES.teal)}><Stethoscope className="h-4 w-4" /></span>
              <h3 className="text-sm font-bold text-ink-900">Quick Actions</h3>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'New Registration', to: '/opd/registration', icon: UserPlus },
                { label: 'Walk-in', to: '/opd/walkin', icon: Footprints },
                { label: 'Book Appointment', to: '/opd/appointments', icon: CalendarDays },
                { label: 'OP Queue', to: '/opd/queue', icon: Users },
                { label: 'OP Billing', to: '/opd/billing', icon: IndianRupee },
                { label: 'Payments', to: '/opd/payments', icon: Banknote },
              ].map(({ label, to, icon: Icon }) => (
                <button
                  key={label}
                  onClick={() => navigate(to)}
                  className="flex items-center gap-2 rounded-xl border border-ink-100 bg-white px-2.5 py-2.5 text-left text-xs font-semibold text-ink-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                >
                  <Icon className="h-4 w-4 text-blue-600" />
                  <span className="leading-tight">{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="card p-4">
            <h3 className="mb-2 text-sm font-bold text-ink-900">How to use this screen</h3>
            <ul className="space-y-1.5 text-xs leading-relaxed text-ink-500">
              <li><b className="text-ink-700">Numbers</b> refresh every 30s.</li>
              <li><b className="text-ink-700">Flow strip</b> = patient journey in order.</li>
              <li><b className="text-ink-700">Module cards</b> jump to any screen.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}