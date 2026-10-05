import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Gauge,
  ListChecks,
  BedDouble,
  Grid3X3,
  Building2,
  UserPlus,
  PanelLeftClose,
  PanelLeftOpen,
  ArrowRight,
  Activity,
  Stethoscope,
  Receipt,
  BarChart3,
  MonitorSmartphone,
  Keyboard,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/utils';
import { SHORTCUTS } from '../../lib/useIpdShortcuts';
import { MotionModal } from '../../components/ui/Motion';

const SECTIONS = [
  { to: '/ipd/workstations', label: 'Workstations', icon: MonitorSmartphone },
  { to: '/ipd/dashboard', label: 'IPD Command Center', icon: Gauge },
  { to: '/ipd/admissions', label: 'Admissions Register', icon: ListChecks },
  { to: '/ipd/wards', label: 'Ward / Bed Board', icon: Grid3X3 },
  { to: '/ipd/billing', label: 'Billing & Discharge', icon: Receipt },
  { to: '/ipd/reports', label: 'Reporting Centre', icon: BarChart3 },
  { to: '/ipd/hierarchy', label: 'Ward Management', icon: Building2 },
];

export default function IpdWorkspace() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('ipd-sidebar-collapsed') === '1');
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const toggle = (next) => {
    setCollapsed(next);
    localStorage.setItem('ipd-sidebar-collapsed', next ? '1' : '0');
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
            <div className="text-[13px] font-bold text-ink-900">IPD Workspace</div>
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
            onClick={() => navigate('/ipd/admissions?new=1')}
            title="New IP admission (Alt+A)"
            className={cn(
              'flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-600 to-brand-700 text-[11px] font-semibold text-white shadow-sm transition hover:from-brand-700 hover:to-brand-800',
              collapsed ? 'h-8 w-8' : 'px-2.5 py-1.5',
            )}
          >
            {collapsed ? <UserPlus className="h-4 w-4" /> : <><ArrowRight className="h-3.5 w-3.5" /> New Admission</>}
          </button>
          <button
            onClick={() => setShortcutsOpen(true)}
            title="Keyboard shortcuts"
            className={cn(
              'mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold text-ink-500 transition hover:bg-ink-50 hover:text-ink-800',
              collapsed ? 'h-8 w-8' : 'px-2.5 py-1.5',
            )}
          >
            <Keyboard className="h-3.5 w-3.5" />
            {!collapsed && 'Shortcuts'}
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <Outlet />
      </main>

      <MotionModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} maxWidth="max-w-md">
        <div className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink-900">Keyboard shortcuts</h3>
            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setShortcutsOpen(false)}>Close</button>
          </div>
          <ul className="space-y-1.5">
            {SHORTCUTS.map((s) => (
              <li key={s.keys} className="flex items-center justify-between gap-3 rounded-lg bg-ink-50 px-3 py-2 text-xs">
                <span className="text-ink-700">{s.label}</span>
                <span className="kbd">{s.keys}</span>
              </li>
            ))}
          </ul>
        </div>
      </MotionModal>
    </div>
  );
}