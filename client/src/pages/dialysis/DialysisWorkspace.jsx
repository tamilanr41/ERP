import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BarChart3, CalendarPlus, ClipboardList, Droplets, Gauge, Grid3X3, ListChecks,
  Repeat, UserPlus, Users, Wrench, PanelLeftClose, PanelLeftOpen, ArrowRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/utils';

const SECTIONS = [
  { to: '/dialysis', label: 'Command Center', icon: Gauge },
  { to: '/dialysis/assessment', label: 'Nephrology Assessment', icon: StethoscopeIcon },
  { to: '/dialysis/prescriptions', label: 'Prescriptions', icon: ClipboardList },
  { to: '/dialysis/schedule', label: 'Scheduling', icon: Repeat },
  { to: '/dialysis/slots', label: 'Slot Board', icon: Grid3X3 },
  { to: '/dialysis/patients', label: 'Dialysis Register', icon: ListChecks },
  { to: '/dialysis/machines', label: 'Machines & Stations', icon: Wrench },
  { to: '/dialysis/reports', label: 'Reporting Centre', icon: BarChart3 },
];

function StethoscopeIcon(props) {
  return <Droplets {...props} />;
}

export default function DialysisWorkspace() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('dialysis-sidebar-collapsed') === '1');

  const toggle = (next) => {
    setCollapsed(next);
    localStorage.setItem('dialysis-sidebar-collapsed', next ? '1' : '0');
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
            <div className="flex items-center gap-1.5 text-[13px] font-bold text-ink-900">
              <Droplets className="h-3.5 w-3.5 text-brand-600" /> Dialysis Unit
            </div>
            <div className="mt-0.5 truncate text-[10px] text-ink-500">
              {user?.hospitalName || 'ZhanX Medical Centre'} · Dialysis
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
              end={to === '/dialysis'}
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

        <div className={cn('space-y-1.5 border-t border-ink-100', collapsed ? 'flex flex-col items-center px-1 py-2' : 'px-3 py-2')}>
          <button
            onClick={() => navigate('/dialysis/schedule')}
            title="Book a dialysis session"
            className={cn(
              'flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-600 to-brand-700 text-[11px] font-semibold text-white shadow-sm transition hover:from-brand-700 hover:to-brand-800',
              collapsed ? 'h-8 w-8' : 'px-2.5 py-1.5',
            )}
          >
            {collapsed ? <CalendarPlus className="h-4 w-4" /> : <><ArrowRight className="h-3.5 w-3.5" /> Book a session</>}
          </button>
          <button
            onClick={() => navigate('/dialysis/register')}
            title="Register a dialysis patient"
            className={cn(
              'flex w-full items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold text-ink-500 transition hover:bg-ink-50 hover:text-ink-800',
              collapsed ? 'h-8 w-8' : 'px-2.5 py-1.5',
            )}
          >
            {collapsed ? <UserPlus className="h-4 w-4" /> : <><UserPlus className="h-3.5 w-3.5" /> Register patient</>}
          </button>
          <button
            onClick={() => navigate('/dialysis/patients')}
            title="Dialysis patients"
            className={cn(
              'flex w-full items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold text-ink-500 transition hover:bg-ink-50 hover:text-ink-800',
              collapsed ? 'h-8 w-8' : 'px-2.5 py-1.5',
            )}
          >
            {collapsed ? <Users className="h-4 w-4" /> : <><ListChecks className="h-3.5 w-3.5" /> Dialysis register</>}
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
