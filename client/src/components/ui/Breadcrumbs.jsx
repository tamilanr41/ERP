import { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, LayoutDashboard } from 'lucide-react';
import { MODULES } from '../../data/modules';
import { cn } from '../../lib/utils';

const TO_MODULE = new Map(MODULES.filter((m) => m.to).map((m) => [m.to, m]));

const OPD_SECTIONS = {
  dashboard: 'Command Center',
  registration: 'Patient Registration',
  search: 'Patient Search',
  appointments: 'Appointments',
  walkin: 'Walk-in Registration',
  queue: 'OP Queue',
  vitals: 'Vitals / Nurse Screening',
  consultation: 'Doctor Consultation',
  orders: 'Investigation Orders',
  prescriptions: 'Prescriptions',
  referrals: 'Referrals',
  followup: 'Follow-up',
  completion: 'Visit Completion',
  documents: 'Documents',
  billing: 'OP Billing',
  payments: 'Payments',
  refunds: 'Refunds',
  reports: 'Reports',
  settings: 'OPD Settings',
};

const TOP_LABELS = {
  modules: null,
  patients: 'Patient Management',
  appointments: 'Appointments',
  queue: 'Emergency (Casualty)',
  beds: 'Bed Command',
  cashier: 'Cashier Closing',
  reports: 'Reports',
  users: 'Users & Roles',
  notifications: 'Alerts & Notifications',
  audit: 'Audit Logs',
  settings: 'System Settings',
};

const SETTINGS_TAB_LABELS = {
  hospital: 'Hospital',
  users: 'Users',
  medicines: 'Medicines',
  'lab-tests': 'Test names',
  general: 'Configuration',
};

function crumbsFor(pathname) {
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) return [{ label: 'Command Center', to: '/' }];

  const full = `/${segments.join('/')}`;
  const mod = TO_MODULE.get(full);
  if (mod) {
    return [
      { label: 'Command Center', to: '/' },
      { label: mod.label, active: true },
    ];
  }

  if (segments[0] === 'modules' && segments[1]) {
    const key = segments[1];
    const target = MODULES.find((m) => m.key === key);
    return [
      { label: 'Command Center', to: '/' },
      { label: target ? target.label : 'Module', active: true },
    ];
  }

  if (segments[0] === 'patients') {
    const parent = { label: 'Patient Management', to: '/patients' };
    if (segments.length === 1) return [{ label: 'Command Center', to: '/' }, parent];
    if (segments[2] === 'edit') {
      return [
        { label: 'Command Center', to: '/' },
        parent,
        { label: 'Edit Patient', active: true },
      ];
    }
    return [
      { label: 'Command Center', to: '/' },
      parent,
      { label: 'Patient Detail', active: true },
    ];
  }

  if (segments[0] === 'opd' && segments[1]) {
    const section = OPD_SECTIONS[segments[1]] || 'Workspace';
    return [
      { label: 'Command Center', to: '/' },
      { label: 'OPD Workspace', to: '/opd' },
      { label: section, active: true },
    ];
  }

  const topLabel = TOP_LABELS[segments[0]];
  if (!topLabel) return [{ label: 'Command Center', to: '/' }];

  return [
    { label: 'Command Center', to: '/' },
    { label: topLabel, active: true },
  ];
}

export default function Breadcrumbs({ className }) {
  const { pathname, search } = useLocation();
  const crumbs = useMemo(() => crumbsFor(pathname), [pathname]);

  // The settings screen is one route with ?tab= selecting the panel, so the
  // active tab is appended here - otherwise every tab reads "System Settings".
  const settingsTab = useMemo(() => {
    if (pathname !== '/settings') return null;
    const tab = new URLSearchParams(search).get('tab');
    return SETTINGS_TAB_LABELS[tab] || null;
  }, [pathname, search]);

  const trail = settingsTab ? [...crumbs, { label: settingsTab, active: true }] : crumbs;

  return (
    <nav aria-label="Breadcrumb" className={cn('scrollbar-none overflow-x-auto px-6 pt-4', className)}>
      <ol className="flex items-center gap-1 text-[13px] text-ink-500">
        {trail.map((crumb, i) => {
          const last = i === trail.length - 1;
          return (
            <li key={`${crumb.label}-${i}`} className="flex shrink-0 items-center gap-1">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-ink-300" />}
              {crumb.to && !last ? (
                <Link
                  to={crumb.to}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded font-medium text-ink-600 transition-colors hover:text-brand-600',
                    crumb.label === 'Command Center' && 'gap-1.5',
                  )}
                >
                  {i === 0 && crumb.label === 'Command Center' && <LayoutDashboard className="h-3.5 w-3.5" />}
                  {crumb.label}
                </Link>
              ) : (
                <span className={cn('truncate font-semibold', last ? 'text-ink-900' : 'text-ink-600')}>{crumb.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}