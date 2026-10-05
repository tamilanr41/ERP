import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Gauge,
  UserPlus,
  UserSearch,
  CalendarDays,
  Footprints,
  Ticket,
  Activity,
  Stethoscope,
  FlaskConical,
  Pill,
  ArrowLeftRight,
  CalendarClock,
  Receipt,
  Wallet,
  Undo2,
  FileText,
  Settings2,
  ArrowRight,
  ClipboardCheck,
  Printer,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/utils';

const SECTIONS = [
  { to: '/opd/dashboard', label: 'OPD Dashboard', icon: Gauge },
  { to: '/opd/registration', label: 'Patient Registration', icon: UserPlus },
  { to: '/opd/search', label: 'Patient Search', icon: UserSearch },
  { to: '/opd/appointments', label: 'Appointments', icon: CalendarDays },
  { to: '/opd/walkin', label: 'Walk-in Registration', icon: Footprints },
  { to: '/opd/queue', label: 'OP Queue', icon: Ticket },
  { to: '/opd/vitals', label: 'Vitals / Nurse Screening', icon: Activity },
  { to: '/opd/consultation', label: 'Doctor Consultation', icon: Stethoscope },
  { to: '/opd/orders', label: 'Investigation Orders', icon: FlaskConical },
  { to: '/opd/prescriptions', label: 'Prescriptions', icon: Pill },
  { to: '/opd/referrals', label: 'Referrals', icon: ArrowLeftRight },
  { to: '/opd/followup', label: 'Follow-up', icon: CalendarClock },
  { to: '/opd/completion', label: 'Complete Visit', icon: ClipboardCheck },
  { to: '/opd/documents', label: 'Documents', icon: Printer },
  { to: '/opd/billing', label: 'OP Billing', icon: Receipt },
  { to: '/opd/payments', label: 'Payments', icon: Wallet },
  { to: '/opd/refunds', label: 'Refunds', icon: Undo2 },
  { to: '/opd/reports', label: 'Reports', icon: FileText },
  { to: '/opd/settings', label: 'OPD Settings', icon: Settings2 },
];

export default function OpdWorkspace() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('opd-sidebar-collapsed') === '1');

  const enter = (to, extra) => {
    setCollapsed(true);
    localStorage.setItem('opd-sidebar-collapsed', '1');
    navigate(to, extra);
  };

  const toggle = (next) => {
    setCollapsed(next);
    localStorage.setItem('opd-sidebar-collapsed', next ? '1' : '0');
  };

  return (
    <div className="flex min-h-full items-start">
      <aside
        className={cn(
          'sticky top-0 flex h-[calc(100vh-7.5rem)] shrink-0 flex-col border-r border-ink-200 bg-white transition-all duration-200',
          collapsed ? 'w-12' : 'w-52',
        )}
      >
        <div className={cn('flex items-center border-b border-ink-100', collapsed ? 'justify-center py-3' : 'justify-between px-3 py-2.5')}>
          <div className={cn(collapsed && 'hidden')}>
            <div className="text-[13px] font-bold text-ink-900">OPD Workspace</div>
            <div className="mt-0.5 truncate text-[10px] text-ink-500">
              {user?.hospitalName || 'ZhanX Medical Centre'} · Main Branch
            </div>
          </div>
          <button
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => toggle(!collapsed)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-500 transition hover:bg-brand-50 hover:text-brand-600"
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
        <nav className="scrollbar-none flex-1 space-y-0.5 overflow-y-auto p-1.5">
          {SECTIONS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              title={label}
              onClick={() => toggle(true)}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-2 rounded-lg py-1.5 text-xs font-medium transition-colors',
                  collapsed ? 'justify-center px-0' : 'px-2.5',
                  isActive
                    ? 'bg-brand-600 text-white shadow-md shadow-brand-600/20'
                    : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cn('absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-transparent', isActive && 'bg-brand-300')} />
                  <Icon className={cn('h-4 w-4 shrink-0', isActive && 'text-brand-100')} />
                  {!collapsed && <span className="truncate">{label}</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className={cn('border-t border-ink-100', collapsed ? 'flex justify-center py-2' : 'px-3 py-2')}>
          <button
            onClick={() => enter('/opd/walkin', { state: { start: true } })}
            title="Start Patient Journey"
            className={cn(
              'flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-600 to-brand-700 text-[11px] font-semibold text-white shadow-sm transition hover:from-brand-700 hover:to-brand-800',
              collapsed ? 'h-8 w-8' : 'px-2.5 py-1.5',
            )}
          >
            {collapsed ? <Stethoscope className="h-4 w-4" /> : <><ArrowRight className="h-3.5 w-3.5" /> Start Journey</>}
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}