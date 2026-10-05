import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Users, Stethoscope, Pill, CalendarDays, IndianRupee, BedDouble, ChevronRight, Zap, ListChecks, Wallet, ShieldCheck, FlaskConical } from 'lucide-react';
import { cn } from '../../lib/utils';
import api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const QUICK_ACTIONS = [
  { label: 'OPD Workspace', ref: '/opd', permission: 'OPD_VIEW', icon: Stethoscope, roles: ['DOCTOR', 'NURSE'] },
  { label: 'IPD / Admissions', ref: '/ipd', permission: 'IPD_VIEW', icon: BedDouble, roles: ['DOCTOR', 'NURSE'] },
  { label: 'Laboratory', ref: '/lab', permission: 'LAB_VIEW', icon: FlaskConical, roles: ['DOCTOR', 'NURSE', 'LAB_TECHNICIAN'] },
  { label: 'Pharmacy', ref: '/pharmacy', permission: 'PHARMACY_VIEW', icon: Pill, roles: ['PHARMACIST', 'STORE_MANAGER'] },
  { label: 'Billing', ref: '/billing', permission: 'BILLING_VIEW', icon: IndianRupee, roles: ['BILLING_STAFF', 'ACCOUNTANT'] },
  { label: 'Cashier', ref: '/cashier', permission: 'PAYMENT_CREATE', icon: Wallet, roles: ['PHARMACIST', 'BILLING_STAFF'] },
  { label: 'Insurance / TPA', ref: '/insurance', permission: 'INSURANCE_VIEW', icon: ShieldCheck, roles: ['INSURANCE_STAFF'] },
  { label: 'OPD Queue', ref: '/opd/queue', permission: 'OPD_VIEW', icon: ListChecks, roles: ['RECEPTIONIST', 'NURSE'] },
  { label: 'Bed Command', ref: '/beds', permission: 'BED_VIEW', icon: BedDouble, roles: ['NURSE'] },
  { label: 'New Patient', ref: '/patients/new', permission: 'PATIENT_CREATE', icon: Users, roles: ['RECEPTIONIST'] },
  { label: 'New Appointment', ref: '/appointments', permission: 'APPOINTMENT_CREATE', icon: CalendarDays, roles: ['RECEPTIONIST'] },
  { label: 'Patients', ref: '/patients', permission: 'PATIENT_VIEW', icon: Users, roles: ['RECEPTIONIST', 'NURSE', 'DOCTOR'] },
  { label: 'Appointments', ref: '/appointments', permission: 'APPOINTMENT_VIEW', icon: CalendarDays, roles: ['RECEPTIONIST', 'DOCTOR'] },
];

const TYPE_ICONS = {
  patient: Users,
  doctor: Stethoscope,
  user: Users,
  medicine: Pill,
  appointment: CalendarDays,
  bill: IndianRupee,
  admission: BedDouble,
  bed: BedDouble,
};

const ROLE_LABELS = {
  DOCTOR: 'Doctor',
  NURSE: 'Nurse',
  RECEPTIONIST: 'Receptionist',
  PHARMACIST: 'Pharmacist',
  LAB_TECHNICIAN: 'Lab Technician',
  BILLING_STAFF: 'Billing',
  INSURANCE_STAFF: 'Insurance',
  ACCOUNTANT: 'Accounts',
  STORE_MANAGER: 'Store',
  SUPER_ADMIN: 'Super Admin',
  HOSPITAL_ADMIN: 'Hospital Admin',
};

const GROUP_LABELS = {
  patients: 'Patients',
  doctors: 'Doctors',
  users: 'Staff',
  medicines: 'Medicines',
  appointments: 'Appointments',
  bills: 'Bills',
  admissions: 'Admissions',
  beds: 'Beds',
};

export default function CommandPalette({ isOpen, onClose }) {
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const [selectedIdx, setSelectedIdx] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const { data: searchData } = useQuery({
    queryKey: ['search', query],
    queryFn: async () => {
      const res = await api.get('/v1/search', { params: { q: query, limit: 5 } });
      return res.data.data;
    },
    enabled: isOpen && query.length >= 2,
    staleTime: 60_000,
  });

  const actions = QUICK_ACTIONS
    .filter((a) => !a.permission || hasPermission(a.permission))
    .sort((a, b) => {
      const ha = a.roles?.includes(user?.roleCode) ? 0 : 1;
      const hb = b.roles?.includes(user?.roleCode) ? 0 : 1;
      return ha - hb;
    });

  const roleName = ROLE_LABELS[user?.roleCode] || (user?.roleCode || 'Staff').split('_').map((w) => w[0] + w.slice(1).toLowerCase()).join(' ');

  const allResults = [];
  if (searchData?.results) {
    for (const [group, items] of Object.entries(searchData.results)) {
      if (!items?.length) continue;
      for (const item of items) {
        allResults.push({ ...item, group, label: GROUP_LABELS[group] || group });
      }
    }
  }

  const combined = query.length < 2 ? actions : allResults;

  const onSelect = useCallback(
    (item) => {
      const target = item.ref || '/';
      onClose();
      navigate(target);
    },
    [navigate, onClose],
  );

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, combined.length - 1));
        listRef.current?.children[Math.min(selectedIdx + 1, combined.length - 1)]?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && combined[selectedIdx]) {
        e.preventDefault();
        onSelect(combined[selectedIdx]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, combined, selectedIdx, onSelect]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]" role="dialog" aria-modal>
      <div className="fixed inset-0 bg-ink-950/60 backdrop-blur-sm transition-opacity animate-fade-in" onClick={onClose} />
      <div className="relative z-10 flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-ink-200/70 bg-white shadow-overlay animate-slide-up">
        <div className="flex items-center gap-3 border-b border-ink-100 px-4">
          <Search className="h-5 w-5 shrink-0 text-ink-400" />
          <input
            ref={inputRef}
            className="h-12 flex-1 bg-transparent text-sm text-ink-900 placeholder-ink-400 outline-none"
            placeholder={query.length < 2 ? 'Search patients, doctors, bills, meds…' : 'Refining search…'}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIdx(0); }}
            onKeyDown={(e) => e.key === 'Escape' && onClose()}
          />
          <kbd className="kbd hidden sm:inline">ESC</kbd>
        </div>

        <ul ref={listRef} className="max-h-80 overflow-y-auto py-2" role="listbox">
          {query.length < 2 ? (
            <li className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-400">Quick Actions · {roleName}</li>
          ) : allResults.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-ink-400">No results for "{query}"</li>
          ) : null}

          {combined.map((item, idx) => {
            const Icon = item.icon || TYPE_ICONS[item.type] || Zap;
            const isActive = idx === selectedIdx;
            return (
              <li
                key={`${item.id || item.label}-${idx}`}
                role="option"
                aria-selected={isActive}
                className={cn(
                  'flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                  isActive ? 'bg-brand-50 text-brand-800' : 'text-ink-700 hover:bg-ink-50',
                )}
                onClick={() => onSelect(item)}
                onMouseEnter={() => setSelectedIdx(idx)}
              >
                <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg ring-1 ring-inset', isActive ? 'bg-brand-600/10 ring-brand-200 text-brand-600' : 'bg-ink-50 ring-ink-200 text-ink-400')}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{item.label}</div>
                  {item.subtitle && <div className="truncate text-xs text-ink-400">{item.subtitle}</div>}
                </div>
                {item.ref && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-300" />}
              </li>
            );
          })}
        </ul>

        <div className="flex items-center justify-between border-t border-ink-100 bg-ink-50/60 px-4 py-2 text-[11px] text-ink-400">
          <span className="flex items-center gap-1"><kbd className="kbd">↑↓</kbd> Navigate</span>
          <span className="flex items-center gap-1"><kbd className="kbd">↵</kbd> Open</span>
          <span className="flex items-center gap-1"><kbd className="kbd">ESC</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}