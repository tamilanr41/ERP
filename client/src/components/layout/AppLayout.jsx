import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  LogOut,
  Activity,
  Search,
  Bell,
  ChevronsLeft,
  ChevronsRight,
  HeartHandshake,
  Sun,
  Moon,
  Keyboard,
  Command as CommandIcon,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { cn, initials } from '../../lib/utils';
import api from '../../lib/api';
import CommandPalette from '../command/CommandPalette';
import Breadcrumbs from '../ui/Breadcrumbs';
import { MODULES } from '../../data/modules';
import { useIpdShortcuts } from '../../lib/useIpdShortcuts';
import { POLL } from '../../lib/polling';
import { SHORTCUTS } from '../../lib/useIpdShortcuts';
import { MotionModal } from '../ui/Motion';

// The sidebar mirrors the module grid exactly — every module opens the same
// destination as its dashboard tile (mod.to or its module page).
const sidebarItems = (hasPermission) => [
  { to: '/', label: 'Command Center', icon: LayoutDashboard, perm: null, accent: 'from-brand-500/30 to-brand-600/10 text-brand-300 ring-brand-400/50' },
  ...MODULES.filter((mod) => !mod.perm || hasPermission(mod.perm)).map((mod) => ({
    to: mod.to || `/modules/${mod.key}`,
    label: mod.label,
    icon: mod.icon,
    perm: mod.perm,
    accent: mod.accent,
  })),
];

function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="hidden text-right md:block">
      <div className="font-mono text-xs font-semibold tabular-nums text-ink-900">
        {now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </div>
      <div className="text-[11px] text-ink-500">
        {now.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
      </div>
    </div>
  );
}

export default function AppLayout() {
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'clinical');

  const { data: unreadData } = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: async () => (await api.get('/notifications', { params: { read: 'false', limit: 1 } })).data,
    refetchInterval: POLL.IDLE,
  });
  const unreadCount = unreadData?.pagination?.total ?? 0;

  // Section 48: Ctrl+K is handled here (global search); the Alt+<key> clinical
  // actions live in useIpdShortcuts.
  useIpdShortcuts({ onOpenSearch: () => setPaletteOpen(true) });

  const toggleTheme = () => {
    const next = theme === 'clinical' ? 'light' : 'clinical';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('erp-theme', next);
    setTheme(next);
  };

  const tiles = useMemo(() => sidebarItems(hasPermission), [hasPermission]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const userInitials = initials(`${user?.firstName} ${user?.lastName}`);
  const roleLabel = (user?.roleCode || 'STAFF').split('_').map((w) => w[0] + w.slice(1).toLowerCase()).join(' ');

  return (
    <div className="flex h-screen overflow-hidden bg-ink-50">
      <CommandPalette isOpen={paletteOpen} onClose={() => setPaletteOpen(false)} />

      <aside className={cn('flex shrink-0 flex-col bg-ink-950 text-ink-200 transition-[width] duration-200', collapsed ? 'w-16' : 'w-64')}>
        <div className={cn('flex h-16 items-center border-b border-white/5', collapsed ? 'justify-center px-0' : 'justify-between px-4')}>
          <div className={cn('flex items-center gap-2.5', collapsed && 'justify-center')}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-card">
              <Activity className="h-5 w-5 text-white" />
            </div>
            {!collapsed && (
              <div>
                <div className="text-sm font-bold leading-tight text-white">ZhanX HospitalOS</div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-300/80">Clinical Command</div>
              </div>
            )}
          </div>
          {!collapsed && (
            <button onClick={() => setCollapsed(true)} className="btn-icon h-7 w-7 text-ink-400 hover:bg-white/5 hover:text-ink-200" title="Collapse sidebar">
              <ChevronsLeft className="h-4 w-4" />
            </button>
          )}
        </div>
        {collapsed && (
          <button onClick={() => setCollapsed(false)} className="btn-icon mx-auto mt-2 h-7 w-7 text-ink-400 hover:bg-white/5 hover:text-ink-200" title="Expand sidebar">
            <ChevronsRight className="h-4 w-4" />
          </button>
        )}

        {!collapsed && (
          <div className="px-3 pb-3 pt-3">
            <button
              onClick={() => setPaletteOpen(true)}
              className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-ink-400 transition hover:border-white/20 hover:text-ink-200"
            >
              <Search className="h-3.5 w-3.5" />
              Global search…
              <span className="kbd ml-auto bg-white/5 text-ink-400 ring-white/10">Ctrl K</span>
            </button>
          </div>
        )}

        <nav className="scrollbar-none flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
          {tiles.map(({ to, label, icon: Icon, accent }) => (
            <NavLink
              key={to}
              to={to}
              title={label}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors',
                  collapsed && 'justify-center px-0',
                  isActive ? `bg-gradient-to-r ${accent} ring-1` : 'text-ink-400 hover:bg-white/5 hover:text-ink-100',
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/5 p-2">
          <button
            onClick={() => setShortcutsOpen(true)}
            className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-ink-400 transition hover:bg-white/5 hover:text-ink-100', collapsed && 'justify-center px-0')}
            title="Keyboard shortcuts"
          >
            <Keyboard className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Shortcuts</span>}
          </button>
          <button
            onClick={handleLogout}
            className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-ink-400 transition hover:bg-white/5 hover:text-ink-100', collapsed && 'justify-center px-0')}
            title="Sign out"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-ink-200 bg-white/80 px-6 backdrop-blur">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPaletteOpen(true)}
              className="btn-secondary hidden items-center gap-2 px-3 py-1.5 text-xs sm:flex"
              title="Global patient search (Ctrl+K)"
            >
              <Search className="h-3.5 w-3.5" />
              Search patients, IP numbers, bills…
              <span className="kbd">Ctrl K</span>
            </button>
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-mint-100 text-mint-700">
                <HeartHandshake className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-bold text-ink-900">{user?.hospitalName || 'ZhanX Medical Centre'}</div>
                <div className="text-[11px] text-ink-500">{roleLabel} workstation</div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <LiveClock />
            <button onClick={() => navigate('/notifications')} title="Notifications" className="btn-icon relative">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold tabular-nums text-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
            <button onClick={() => setPaletteOpen(true)} className="btn-icon" title="Global search (Ctrl+K)">
              <Search className="h-4 w-4" />
            </button>
            <button
              onClick={toggleTheme}
              className="btn-icon"
              title={theme === 'clinical' ? 'Switch to light console' : 'Switch to dark clinical workstation'}
            >
              {theme === 'clinical' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <div className="ml-2 flex items-center gap-2 border-l border-ink-200 pl-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-mint-500 to-mint-700 text-xs font-bold text-white">
                {userInitials}
              </div>
              <div className="hidden text-left sm:block">
                <div className="text-[13px] font-semibold leading-tight text-ink-900">
                  {user?.firstName} {user?.lastName}
                </div>
                <div className="text-[11px] leading-tight text-ink-500">{roleLabel}</div>
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <Breadcrumbs />
          <Outlet />
        </div>
      </main>

      <MotionModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} maxWidth="max-w-md">
        <div className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-bold text-ink-900">
              <CommandIcon className="h-4 w-4" /> Keyboard shortcuts
            </h3>
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
