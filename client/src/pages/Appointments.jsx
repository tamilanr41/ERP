import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, ChevronLeft, ChevronRight, Calendar as CalendarIcon, CalendarDays, CalendarRange, Filter, RefreshCcw } from 'lucide-react';
import api, { apiError } from '../lib/api';
import PageHeader from '../components/ui/PageHeader';
import { LoadingState, ErrorState, EmptyState, Spinner } from '../components/ui/Feedback';
import { formatDate, formatDateTime, formatCurrency, cn } from '../lib/utils';
import { badge } from '../components/ui/Badge.jsx';
import { useAuth } from '../context/AuthContext';
import { APPOINTMENT_FLOW } from './appointment-flow';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfWeek = (d) => {
  const x = new Date(d);
  const diff = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
};
const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

const STATUS_OPTIONS = ['REQUESTED', 'CONFIRMED', 'ARRIVED', 'CHECKED_IN', 'WAITING', 'IN_CONSULTATION', 'COMPLETED'];

export default function Appointments() {
  const qc = useQueryClient();
  const { hasPermission } = useAuth();

  const [view, setView] = useState('day');
  const [anchor, setAnchor] = useState(() => {
    const x = new Date();
    x.setHours(0, 0, 0, 0);
    return x;
  });
  const [departmentId, setDepartmentId] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [status, setStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState(null);
  const [rescheduleFor, setRescheduleFor] = useState(null);
  const [cancelFor, setCancelFor] = useState(null);

  const span = useMemoSpan(view, anchor);

  const params = { limit: 500 };
  if (view === 'day') params.date = dayKey(anchor);
  else if (span) {
    params.from = dayKey(span.from);
    params.to = dayKey(span.to);
  }
  if (departmentId) params.departmentId = departmentId;
  if (doctorId) params.doctorId = doctorId;
  if (specialty) params.specialty = specialty;
  if (status) params.status = status;

  const { data, isLoading, error } = useQuery({
    queryKey: ['appointments', view, params],
    queryFn: async ({ queryKey }) => (await api.get('/appointments', { params: queryKey[2] })).data,
  });

  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => (await api.get('/masters/departments', { params: { limit: 100, activeOnly: true } })).data.data,
  });
  const { data: doctors } = useQuery({
    queryKey: ['doctors'],
    queryFn: async () => (await api.get('/masters/doctors', { params: { limit: 100 } })).data.data,
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }) => (await api.patch(`/appointments/${id}/status`, { status })).data.data,
    onSuccess: (_, v) => {
      toast.success(`Appointment ${v.status.replace('_', ' ').toLowerCase()}`);
      qc.invalidateQueries({ queryKey: ['appointments'] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const cancelMutation = useMutation({
    mutationFn: async ({ id, reason }) => (await api.patch(`/appointments/${id}/status`, { status: 'CANCELLED', cancelledReason: reason })).data.data,
    onSuccess: () => { toast.success('Appointment cancelled'); setCancelFor(null); qc.invalidateQueries({ queryKey: ['appointments'] }); },
    onError: (e) => toast.error(apiError(e)),
  });

  const createVisitMutation = useMutation({
    mutationFn: async (a) => (await api.post('/opd/visits', {
      patientId: a.patientId?._id || a.patientId,
      appointmentId: a._id,
      visitType: 'NEW',
      departmentId: a.departmentId?._id || undefined,
      doctorId: a.doctorId?._id || undefined,
    })).data.data,
    onSuccess: (visit) => {
      toast.success(`OP visit ${visit.opdNumber} created`);
      qc.invalidateQueries({ queryKey: ['appointments'] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const appointments = data?.data || [];
  const grouped = groupByDay(appointments);

  const move = (dir) => {
    if (view === 'day') setAnchor(addDays(anchor, dir));
    else if (view === 'week') setAnchor(addDays(anchor, 7 * dir));
    else setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1));
    setSelected(null);
  };

  const goToday = () => {
    const x = new Date();
    x.setHours(0, 0, 0, 0);
    setAnchor(x);
    setSelected(null);
  };

  return (
    <div className="p-6">
      <PageHeader
        title="Appointments"
        subtitle="Day, week and month views with the full appointment lifecycle"
        actions={
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> Book Appointment
          </button>
        }
      />

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-ink-200 bg-white p-0.5">
          <button className={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium', view === 'day' ? 'bg-brand-600 text-white' : 'text-ink-500 hover:text-ink-800')} onClick={() => { setView('day'); setSelected(null); }}>
            <CalendarIcon className="h-3.5 w-3.5" /> Day
          </button>
          <button className={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium', view === 'week' ? 'bg-brand-600 text-white' : 'text-ink-500 hover:text-ink-800')} onClick={() => { setView('week'); setSelected(null); }}>
            <CalendarDays className="h-3.5 w-3.5" /> Week
          </button>
          <button className={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium', view === 'month' ? 'bg-brand-600 text-white' : 'text-ink-500 hover:text-ink-800')} onClick={() => { setView('month'); setSelected(null); }}>
            <CalendarRange className="h-3.5 w-3.5" /> Month
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button className="btn-secondary px-2.5 py-1.5" onClick={() => move(-1)}><ChevronLeft className="h-4 w-4" /></button>
          <button className="btn-secondary px-2.5 py-1.5" onClick={() => move(1)}><ChevronRight className="h-4 w-4" /></button>
          <button className="btn-secondary px-3 py-1.5 text-xs" onClick={goToday}>Today</button>
        </div>

        <span className="ml-1 hidden text-sm font-semibold text-ink-800 sm:block">{labelFor(view, anchor)}</span>

        {view === 'day' && (
          <input type="date" className="input max-w-[170px]" value={dayKey(anchor)} onChange={(e) => { if (e.target.value) setAnchor(new Date(`${e.target.value}T00:00:00`)); }} />
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-ink-400" />
          <select className="input max-w-[170px] py-1 text-xs" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">All departments</option>
            {(departments || []).map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
          </select>
          <select className="input max-w-[180px] py-1 text-xs" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
            <option value="">All doctors</option>
            {(doctors || []).map((d) => <option key={d._id} value={d._id}>{d.name}{d.specialization ? ` — ${d.specialization}` : ''}</option>)}
          </select>
          <select className="input max-w-[170px] py-1 text-xs" value={specialty} onChange={(e) => setSpecialty(e.target.value)}>
            <option value="">All specialties</option>
            {[...new Set((doctors || []).map((d) => d.specialization).filter(Boolean))].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="input max-w-[160px] py-1 text-xs" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
          {(departmentId || doctorId || specialty || status) && (
            <button className="btn-ghost px-2.5 py-1.5 text-xs" onClick={() => { setDepartmentId(''); setDoctorId(''); setSpecialty(''); setStatus(''); }}>
              <RefreshCcw className="h-3.5 w-3.5" /> Reset
            </button>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateAppointmentModal
          patients={[]}
          doctors={doctors || []}
          departments={departments || []}
          onClose={() => setShowCreate(false)}
          onDone={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ['appointments'] }); }}
        />
      )}

      {isLoading ? (
        <LoadingState label="Loading appointments…" />
      ) : error ? (
        <ErrorState message={apiError(error)} />
      ) : view === 'day' ? (
        <DayView appointments={appointments} selected={selected} setSelected={setSelected} onReschedule={setRescheduleFor} onCancel={setCancelFor} onStatus={statusMutation.mutate} onCreateVisit={createVisitMutation.mutate} hasPermission={hasPermission} />
      ) : view === 'week' ? (
        <WeekView anchor={anchor} grouped={grouped} selected={selected} setSelected={setSelected} />
      ) : (
        <MonthView anchor={anchor} grouped={grouped} onDayClick={(d) => { setAnchor(d); setView('day'); setSelected(null); }} />
      )}

      {selected && (
        <AppointmentDetail appointment={selected} onReschedule={setRescheduleFor} onCancel={setCancelFor} onStatus={statusMutation.mutate} onCreateVisit={createVisitMutation.mutate} hasPermission={hasPermission} />
      )}

      {rescheduleFor && (
        <RescheduleModal appointment={rescheduleFor} onClose={() => setRescheduleFor(null)} onDone={() => { setRescheduleFor(null); qc.invalidateQueries({ queryKey: ['appointments'] }); }} />
      )}

      {cancelFor && (
        <CancelModal appointment={cancelFor} onClose={() => setCancelFor(null)} onConfirm={(reason) => cancelMutation.mutate({ id: cancelFor._id, reason })} pending={cancelMutation.isPending} />
      )}
    </div>
  );
}

function useMemoSpan(view, anchor) {
  if (view === 'week') {
    const from = startOfWeek(anchor);
    return { from, to: addDays(from, 6) };
  }
  if (view === 'month') {
    const from = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const to = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return { from, to };
  }
  return null;
}

function groupByDay(appointments) {
  const map = {};
  for (const a of appointments) {
    const d = new Date(a.date);
    if (isNaN(d)) continue;
    const key = dayKey(d);
    (map[key] = map[key] || []).push(a);
  }
  for (const k of Object.keys(map)) map[k].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  return map;
}

function labelFor(view, anchor) {
  if (view === 'day') return formatDate(anchor);
  if (view === 'week') {
    const from = startOfWeek(anchor);
    const to = addDays(from, 6);
    const sameMonth = from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear();
    return sameMonth
      ? `${from.getDate()} – ${to.getDate()} ${MONTHS[to.getMonth()]} ${to.getFullYear()}`
      : `${from.getDate()} ${MONTHS[from.getMonth()]} – ${to.getDate()} ${MONTHS[to.getMonth()]} ${to.getFullYear()}`;
  }
  return `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`;
}

function AppointmentChip({ appointment, onClick }) {
  const tone = {
    REQUESTED: 'border-amber-200 bg-amber-50 text-amber-800',
    SCHEDULED: 'border-amber-200 bg-amber-50 text-amber-800',
    CONFIRMED: 'border-brand-200 bg-brand-50 text-brand-800',
    ARRIVED: 'border-cyan-200 bg-cyan-50 text-cyan-800',
    CHECKED_IN: 'border-cyan-200 bg-cyan-50 text-cyan-800',
    WAITING: 'border-violet-200 bg-violet-50 text-violet-800',
    IN_CONSULTATION: 'border-indigo-200 bg-indigo-50 text-indigo-800',
    IN_PROGRESS: 'border-indigo-200 bg-indigo-50 text-indigo-800',
    COMPLETED: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    CANCELLED: 'border-ink-200 bg-ink-50 text-ink-500 line-through',
    NO_SHOW: 'border-ink-200 bg-ink-100 text-ink-500',
  }[appointment.status] || 'border-ink-200 bg-white text-ink-700';

  return (
    <button
      onClick={() => onClick(appointment)}
      className={cn('w-full rounded-lg border px-2 py-1 text-left text-[11px] leading-tight transition hover:shadow', tone)}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-semibold">#{appointment.tokenNumber || '—'}</span>
        <span className="truncate">{appointment.time}</span>
      </div>
      <div className="mt-0.5 truncate">{appointment.patientId?.firstName} {appointment.patientId?.lastName || ''}</div>
    </button>
  );
}

function DayView({ appointments, selected, setSelected, onReschedule, onCancel, onStatus, onCreateVisit, hasPermission }) {
  if (!appointments.length) return <EmptyState title="No appointments for this day" hint="Use Book Appointment to create one" />;
  return (
    <div className="card overflow-hidden">
      <table className="table">
        <thead>
          <tr>
            <th>Token</th>
            <th>Patient</th>
            <th>Doctor</th>
            <th>Department</th>
            <th>Time</th>
            <th>Fee</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {appointments.map((a) => (
            <tr key={a._id} className={cn(selected?._id === a._id && 'bg-brand-50/60')}>
              <td className="font-semibold text-ink-500">#{a.tokenNumber}</td>
              <td>
                <div className="font-medium text-ink-900">{a.patientId?.firstName} {a.patientId?.lastName || ''}</div>
                <div className="text-xs text-ink-400">{a.patientId?.uhid} · {a.patientId?.mobile || '—'}</div>
              </td>
              <td>
                <div>{a.doctorId?.name || '—'}</div>
                <div className="text-xs text-ink-400">{a.doctorId?.specialization || ''}</div>
              </td>
              <td>{a.departmentId?.name || '—'}</td>
              <td><span className="font-mono text-xs font-semibold">{a.time}</span></td>
              <td className="font-medium">{a.doctorId?.consultationFee ? formatCurrency(a.doctorId.consultationFee) : '—'}</td>
              <td>{badge(a.status)}</td>
              <td>
                <RowActions appointment={a} onReschedule={onReschedule} onCancel={onCancel} onStatus={onStatus} onCreateVisit={onCreateVisit} hasPermission={hasPermission} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WeekView({ anchor, grouped, selected, setSelected }) {
  const from = startOfWeek(anchor);
  const days = DAYS.map((label, i) => ({ label, date: addDays(from, i) }));
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-200 bg-white shadow-sm">
      <div className="grid min-w-[860px] grid-cols-7">
        {days.map(({ label, date }) => {
          const key = dayKey(date);
          const list = grouped[key] || [];
          const isToday = dayKey(new Date()) === key;
          return (
            <div key={key} className={cn('min-h-[220px] border-r border-ink-100 last:border-r-0', isToday && 'bg-brand-50/50')}>
              <div className={cn('border-b border-ink-100 px-3 py-2', isToday && 'bg-brand-600 text-white')}>
                <div className="text-[11px] font-medium uppercase tracking-wide opacity-80">{label}</div>
                <div className={cn('text-sm font-bold', !isToday && 'text-ink-900')}>{date.getDate()}</div>
              </div>
              <div className="space-y-1.5 p-2">
                {list.map((a) => <AppointmentChip key={a._id} appointment={a} onClick={setSelected} />)}
                {!list.length && <p className="px-1 text-[11px] text-ink-300">No appointments</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthView({ anchor, grouped, onDayClick }) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const daysInMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  const startIdx = (first.getDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < startIdx; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(anchor.getFullYear(), anchor.getMonth(), d));
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
      <div className="grid grid-cols-7 border-b border-ink-100">
        {DAYS.map((d) => (
          <div key={d} className="bg-ink-50 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-500">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((date, idx) => {
          if (!date) return <div key={idx} className="min-h-[96px] border-b border-ink-100 bg-ink-50/40" />;
          const key = dayKey(date);
          const list = grouped[key] || [];
          const isToday = key === dayKey(new Date());
          const isOtherMonth = date.getMonth() !== anchor.getMonth();
          return (
            <button
              key={idx}
              onClick={() => onDayClick(date)}
              className={cn(
                'min-h-[96px] border-b border-r border-ink-100 p-1.5 text-left align-top transition last:border-r-0 hover:bg-brand-50/40',
                isOtherMonth && 'bg-ink-50/40 opacity-60',
                isToday && 'bg-brand-50',
              )}
            >
              <div className={cn('flex items-center justify-between px-1')}>
                <span
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
                    isToday ? 'bg-brand-600 text-white' : 'text-ink-700',
                  )}
                >
                  {date.getDate()}
                </span>
                {list.length > 0 && <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-700">{list.length}</span>}
              </div>
              <div className="mt-1 space-y-1">
                {list.slice(0, 3).map((a) => (
                  <div key={a._id} className="truncate rounded bg-white/70 px-1.5 py-0.5 text-[10px] text-ink-600 ring-1 ring-ink-100">
                    <span className="font-semibold text-ink-800">#{a.tokenNumber}</span> {a.time} {a.patientId?.firstName || ''}
                  </div>
                ))}
                {list.length > 3 && <div className="px-1 text-[10px] font-semibold text-brand-600">+{list.length - 3} more</div>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RowActions({ appointment, onReschedule, onCancel, onStatus, onCreateVisit, hasPermission }) {
  const flow = APPOINTMENT_FLOW[appointment.status] || [];
  const options = flow.filter((s) => s !== 'RESCHEDULED' && s !== 'CANCELLED');
  const canCancel = flow.includes('CANCELLED');
  return (
    <div className="flex items-center gap-1">
      {options.length > 0 && (
        <select
          className="input max-w-[140px] py-1 text-xs"
          value=""
          onChange={(e) => e.target.value && onStatus({ id: appointment._id, status: e.target.value })}
        >
          <option value="">Move to…</option>
          {options.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
      )}
      {flow.includes('RESCHEDULED') && (
        <button className="btn-secondary px-2 py-1 text-[11px]" onClick={() => onReschedule(appointment)}>Reschedule</button>
      )}
      {canCancel && (
        <button className="btn-ghost px-2 py-1 text-[11px] text-red-600 hover:bg-red-50" onClick={() => onCancel(appointment)}>Cancel</button>
      )}
      {hasPermission('OPD_CREATE') && !['CANCELLED', 'NO_SHOW'].includes(appointment.status) && (
        <button className="btn-primary px-2 py-1 text-[11px]" onClick={() => onCreateVisit(appointment)}>
          <Plus className="h-3 w-3" /> OP Visit
        </button>
      )}
    </div>
  );
}

function AppointmentDetail({ appointment, onReschedule, onCancel, onStatus, onCreateVisit, hasPermission }) {
  return (
    <div className="card mt-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-ink-900">
              {appointment.patientId?.firstName} {appointment.patientId?.lastName || ''}
            </h3>
            <span className="font-mono text-xs text-ink-400">{appointment.patientId?.uhid}</span>
            {badge(appointment.status)}
          </div>
          <div className="mt-1 text-xs text-ink-500">
            #{appointment.tokenNumber} · {formatDateTime(appointment.date)} · Dr. {appointment.doctorId?.name || '—'}
            {appointment.doctorId?.consultationFee ? ` · Fee ${formatCurrency(appointment.doctorId.consultationFee)}` : ''}
            {appointment.type ? ` · ${appointment.type}` : ''}
          </div>
          {appointment.cancelledReason && <div className="mt-1 text-xs text-red-600">Reason: {appointment.cancelledReason}</div>}
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary px-2.5 py-1 text-xs" onClick={() => onReschedule(appointment)}>Reschedule</button>
          <button className="btn-ghost px-2.5 py-1 text-xs text-red-600" onClick={() => onCancel(appointment)}>Cancel</button>
          {hasPermission('OPD_CREATE') && (
            <button className="btn-primary px-2.5 py-1 text-xs" onClick={() => onCreateVisit(appointment)}>
              <Plus className="h-3.5 w-3.5" /> Create OP Visit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function RescheduleModal({ appointment, onClose, onDone }) {
  const [date, setDate] = useState(typeof appointment.date === 'string' ? appointment.date.slice(0, 10) : dayKey(new Date(appointment.date)));
  const [time, setTime] = useState(appointment.time || '09:00');
  const mutation = useMutation({
    mutationFn: async () => (await api.patch(`/appointments/${appointment._id}/reschedule`, { date, time })).data.data,
    onSuccess: () => { toast.success('Appointment rescheduled'); onDone(); },
    onError: (e) => toast.error(apiError(e)),
  });
  return (
    <ModalShell title="Reschedule Appointment" onClose={onClose}>
      <p className="mb-3 text-xs text-ink-500">Moving Dr. {appointment.doctorId?.name || ''} · #{appointment.tokenNumber} to a new slot.</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">New date *</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label">New time *</label>
          <input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={!date || !time || mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending && <Spinner className="h-4 w-4 text-white" />} Reschedule
        </button>
      </div>
    </ModalShell>
  );
}

function CancelModal({ appointment, onClose, onConfirm, pending }) {
  const [reason, setReason] = useState('');
  return (
    <ModalShell title="Cancel Appointment" onClose={onClose}>
      <p className="mb-3 text-xs text-ink-500">
        Cancel #{appointment.tokenNumber} for {appointment.patientId?.firstName} {appointment.patientId?.lastName || ''} on {formatDate(appointment.date)}?
      </p>
      <div>
        <label className="label">Reason</label>
        <textarea className="input w-full" rows={3} placeholder="Optional reason…" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>Keep it</button>
        <button className="btn-danger" disabled={pending} onClick={() => onConfirm(reason)}>
          {pending && <Spinner className="h-4 w-4 text-white" />} Cancel Appointment
        </button>
      </div>
    </ModalShell>
  );
}

function ModalShell({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="card my-8 w-full max-w-md space-y-3 p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function CreateAppointmentModal({ doctors, departments, onClose, onDone }) {
  const [patientId, setPatientId] = useState('');
  const [patientQ, setPatientQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState(dayKey(new Date()));
  const [time, setTime] = useState('09:00');
  const [type, setType] = useState('OPD');
  const [reason, setReason] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(patientQ.trim()), 300);
    return () => clearTimeout(t);
  }, [patientQ]);

  const { data: patientResults, isLoading: patientsLoading } = useQuery({
    queryKey: ['patients-search', debouncedQ],
    queryFn: async () => {
      const res = await api.get('/patients', { params: debouncedQ ? { search: debouncedQ, limit: 8 } : { limit: 8 } });
      return res.data.data;
    },
    enabled: true,
  });

  const chosenDoctor = doctors.find((d) => d._id === doctorId);
  const mutation = useMutation({
    mutationFn: async () => (await api.post('/appointments', { patientId, doctorId, date, time, type, reason })).data.data,
    onSuccess: (a) => { toast.success(`Appointment #${a.tokenNumber || ''} booked`); onDone(); },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <ModalShell title="Book Appointment" onClose={onClose}>
      <div>
        <label className="label">Patient *</label>
        <div className="relative">
          <input
            className="input w-full"
            placeholder="Search by UHID / name / mobile…"
            value={patientQ}
            onChange={(e) => { setPatientQ(e.target.value); setPatientId(''); }}
            autoFocus
          />
        </div>
        <div className="mt-1.5 rounded-lg border border-ink-100">
          {patientsLoading ? (
            <p className="px-3 py-2 text-xs text-ink-400">Loading…</p>
          ) : (patientResults || []).length ? (
            <div className="divide-y divide-ink-100 max-h-40 overflow-y-auto">
              {(patientResults || []).map((p) => (
                <button
                  key={p._id}
                  type="button"
                  onClick={() => { setPatientId(p._id); setPatientQ(`${p.firstName} ${p.lastName || ''} · ${p.uhid}`); }}
                  className={cn('flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-brand-50/60', patientId === p._id && 'bg-brand-50')}
                >
                  <span className="font-medium text-ink-800">{p.firstName} {p.lastName || ''}</span>
                  <span className="font-mono text-[10px] text-ink-400">{p.uhid} · {p.gender}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="px-3 py-2 text-xs text-ink-400">Type to search patients</p>
          )}
        </div>
      </div>
      <div>
        <label className="label">Doctor *</label>
        <select className="input" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
          <option value="">Select doctor…</option>
          {doctors.map((d) => (
            <option key={d._id} value={d._id}>
              {d.name}{d.specialization ? ` — ${d.specialization}` : ''}{d.consultationFee ? ` (₹${d.consultationFee})` : ''}
            </option>
          ))}
        </select>
        {chosenDoctor?.consultationFee && <p className="mt-1 text-xs text-ink-500">Consultation fee: <span className="font-semibold">{formatCurrency(chosenDoctor.consultationFee)}</span>{chosenDoctor.name && ` · ${chosenDoctor.name}`}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Date *</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Time *</label>
          <input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="label">Type</label>
        <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
          {['OPD', 'FOLLOW_UP', 'EMERGENCY', 'VIRTUAL', 'PROCEDURE'].map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Reason / Symptoms</label>
        <textarea className="input w-full" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional" />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={!patientId || !doctorId || !date || !time || mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending && <Spinner className="h-4 w-4 text-white" />} Book
        </button>
      </div>
      {departments.length === 0 && <p className="text-[11px] text-amber-600">No departments loaded; appointments will still work via doctor selection.</p>}
    </ModalShell>
  );
}