import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle, CalendarClock, CalendarPlus, CheckCircle2, Clock3, History, PauseCircle,
  PlayCircle, Plus, Repeat, Search, Siren, UserCheck, X, Zap,
} from 'lucide-react';
import api, { apiError } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import { LoadingState, ErrorState, EmptyState, Spinner } from '../../components/ui/Feedback';
import { MotionPage, MotionTab } from '../../components/ui/Motion';
import { formatDate, formatDateTime, cn } from '../../lib/utils';
import { POLL } from '../../lib/polling';

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

const SESSION_STATUS_STYLE = {
  REQUESTED: 'bg-amber-50 text-amber-700 ring-amber-200',
  SCHEDULED: 'bg-blue-50 text-blue-700 ring-blue-200',
  CONFIRMED: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
  CHECKED_IN: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  WAITING: 'bg-violet-50 text-violet-700 ring-violet-200',
  PRE_ASSESSED: 'bg-violet-50 text-violet-700 ring-violet-200',
  READY: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
  CONNECTED: 'bg-orange-50 text-orange-700 ring-orange-200',
  IN_PROGRESS: 'bg-rose-50 text-rose-700 ring-rose-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  BILLED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  CLOSED: 'bg-ink-100 text-ink-600 ring-ink-200',
  CANCELLED: 'bg-ink-100 text-ink-500 ring-ink-200',
  NO_SHOW: 'bg-ink-100 text-ink-500 ring-ink-200',
};

const SCHEDULE_STATUS_STYLE = {
  DRAFT: 'bg-ink-100 text-ink-600 ring-ink-200',
  ACTIVE: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  PAUSED: 'bg-amber-50 text-amber-700 ring-amber-200',
  COMPLETED: 'bg-ink-100 text-ink-500 ring-ink-200',
  CANCELLED: 'bg-rose-50 text-rose-700 ring-rose-200',
};

const Field = ({ label, children, hint, required, className }) => (
  <label className={cn('label', className)}>
    <span className={required ? 'font-semibold text-rose-600' : ''}>{label}{required ? ' *' : ''}</span>
    {children}
    {hint && <span className="mt-0.5 text-[10px] font-normal text-ink-400">{hint}</span>}
  </label>
);

const dateStr = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const timeStr = (h = 8) => `${String(h).padStart(2, '0')}:00`;
const RUNNABLE_MACHINE = ['AVAILABLE', 'RESERVED'];

/**
 * A bay can only take a booking when the bay is free AND the machine installed
 * in it can actually run — a machine being cleaned or under service makes the
 * whole bay unusable, and the server would reject the booking anyway.
 */
const bayRunnable = (station) => Boolean(
  station
  && station.status === 'AVAILABLE'
  && (!station.machineId || RUNNABLE_MACHINE.includes(station.machineStatus)),
);

export default function DialysisSchedule() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('single');

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['dialysis-sessions-desk'] });
    qc.invalidateQueries({ queryKey: ['dialysis-schedules'] });
    qc.invalidateQueries({ queryKey: ['dialysis-slot-board'] });
    qc.invalidateQueries({ queryKey: ['dialysis-command-center'] });
  };

  return (
    <MotionPage className="p-5 space-y-4">
      <PageHeader
        title="Dialysis Scheduling"
        subtitle="Single, recurring and emergency sessions — with a permanent reschedule chain and no double booking"
        actions={<Link to="/dialysis/slots" className="btn-secondary text-xs">Slot board</Link>}
      />

      <div className="flex flex-wrap gap-1">
        {[
          ['single', 'Book a session', CalendarPlus],
          ['recurring', 'Recurring programme', Repeat],
          ['emergency', 'Emergency session', Siren],
          ['desk', 'Scheduling desk', CalendarClock],
        ].map(([k, label, Icon]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition', tab === k ? 'bg-brand-600 text-white' : 'bg-white text-ink-600 ring-1 ring-inset ring-ink-200 hover:bg-ink-50')}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      <MotionTab tabKey={tab}>
        {tab === 'single' && <SingleBooking onDone={invalidate} />}
        {tab === 'recurring' && <RecurringPanel onDone={invalidate} />}
        {tab === 'emergency' && <EmergencyPanel onDone={invalidate} />}
        {tab === 'desk' && <DeskPanel onDone={invalidate} />}
      </MotionTab>
    </MotionPage>
  );
}

// ================================================================ shared bits
function PatientSearch({ value, onPick, exclude }) {
  const [q, setQ] = useState('');
  const search = useQuery({
    queryKey: ['dialysis-book-patient', q],
    queryFn: async () => (await api.get('/dialysis/patients', { params: { q, limit: 15 } })).data.data,
    enabled: q.trim().length >= 2,
  });
  return (
    <div>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
        <input className="input pl-8" placeholder="Search dialysis ID, UHID, name or mobile" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {q.trim().length >= 2 && (
        <div className="mt-1.5 max-h-56 space-y-1 overflow-y-auto">
          {search.isLoading ? <LoadingState label="Searching…" /> : (search.data || []).filter((p) => !exclude?.includes(p._id)).map((p) => (
            <button
              key={p._id}
              onClick={() => onPick(p)}
              className={cn('w-full rounded-lg border px-2.5 py-1.5 text-left text-[11px] transition', value === p._id ? 'border-brand-500 bg-brand-50' : 'border-ink-200 hover:bg-ink-50')}
            >
              <span className="font-semibold text-ink-900">{p.patientId?.firstName} {p.patientId?.lastName}</span>
              <span className="ml-1.5 font-mono text-[10px] text-brand-600">{p.dialysisNumber}</span>
              <span className="ml-1.5 text-[10px] text-ink-500">{p.primaryDiagnosis || ''}</span>
            </button>
          ))}
          {!search.isLoading && !(search.data || []).length && <EmptyState title="No dialysis patient matches" />}
        </div>
      )}
    </div>
  );
}

function ResourcePick({ date, duration, machineId, stationId, time, onChange, label = 'Allocation' }) {
  const board = useQuery({
    queryKey: ['dialysis-slot-board', date],
    queryFn: async () => (await api.get('/dialysis/slots', { params: { date } })).data.data,
    enabled: Boolean(date),
  });
  const step = board.data?.config?.slotMinutes || 60;
  const need = Math.max(1, Math.ceil((duration || 240) / step));
  const startIdx = useMemo(() => {
    const rows = board.data?.grid || [];
    return rows.findIndex((r) => r.time >= timeStr(0));
  }, [board.data]);

  const availability = useMemo(() => {
    const rows = board.data?.grid || [];
    return (board.data?.stations || []).map((st) => {
      const freeFor = (fromIdx) => {
        for (let i = fromIdx; i < fromIdx + need; i += 1) {
          if (!rows[i]) return 0;
          if (rows[i].cells.find((c) => c.stationId === st.id)?.session) return i - fromIdx;
        }
        return need;
      };
      const all = rows.map((_, i) => freeFor(i));
      return { station: st, freeFrom: all, longest: Math.max(0, ...all), runnable: bayRunnable(st) };
    });
  }, [board.data, need]);

  const timeOptions = (board.data?.grid || []).map((r) => r.time);

  return (
    <div className="rounded-xl bg-ink-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-ink-500">{label}</span>
        <span className="text-[10px] text-ink-500">
          {board.isLoading ? 'loading board…' : `${need} row(s) needed · ${board.data?.summary?.total ?? 0} session(s) that day`}
        </span>
      </div>
      <div className="space-y-1.5">
        {availability.map(({ station, freeFrom, longest, runnable }) => (
          <div key={station.id} className="flex flex-wrap items-center gap-1.5">
            <span className={cn('w-20 rounded px-1.5 py-0.5 text-center text-[10px] font-bold', runnable ? 'bg-emerald-100 text-emerald-800' : 'bg-ink-200 text-ink-500')}>
              {station.code}
            </span>
            <span className="text-[10px] text-ink-500">{station.machineCode || 'no machine'}</span>
            <div className="flex flex-1 flex-wrap gap-0.5">
              {timeOptions.map((t, i) => {
                const fits = runnable && freeFrom[i] >= need;
                const selected = station.id === stationId && t === time;
                return (
                  <button
                    key={t}
                    type="button"
                    disabled={!fits}
                    onClick={() => onChange({ time: t, stationId: station.id, machineId: station.machineId || undefined })}
                    title={!runnable
                      ? `Machine ${station.machineCode || 'not installed'} is ${String(station.machineStatus || 'unavailable').toLowerCase()}`
                      : `${station.code} at ${t} — ${fits ? `${need} row(s) free` : `${freeFrom[i]} of ${need} row(s) free`}`}
                    className={cn(
                      'rounded px-1 py-0.5 text-[9px] font-semibold ring-1 ring-inset transition',
                      !fits && 'cursor-not-allowed bg-ink-100 text-ink-400 ring-ink-200',
                      fits && selected && 'bg-brand-600 text-white ring-brand-600',
                      fits && !selected && 'bg-white text-ink-600 ring-ink-200 hover:bg-brand-50',
                    )}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
            {!runnable
              ? <span className="text-[9px] font-semibold text-rose-700">{station.machineCode || 'no machine'} {String(station.machineStatus || '').toLowerCase()}</span>
              : longest < need && <span className="text-[9px] font-semibold text-amber-700">max {longest}h</span>}
          </div>
        ))}
        {board.error && <p className="text-[11px] text-rose-600">{apiError(board.error)}</p>}
        {!board.isLoading && !availability.length && <p className="text-[11px] text-ink-400">No bays are configured for this unit</p>}
      </div>
      <p className="mt-2 text-[10px] text-ink-400">Grey cells cannot hold the whole session. Click a free cell to book that bay, machine and time in one step.</p>
    </div>
  );
}

function useStaff() {
  const doctors = useQuery({ queryKey: ['dialysis-sched-doctors'], queryFn: async () => (await api.get('/masters/doctors', { params: { limit: 100 } })).data.data });
  return doctors.data || [];
}

// ================================================================ SINGLE
function SingleBooking({ onDone }) {
  const doctors = useStaff();
  const [form, setForm] = useState({
    dialysisPatientId: '', date: dateStr(1), time: timeStr(8), durationMinutes: 240,
    shift: 'MORNING', priority: 'ROUTINE', status: 'SCHEDULED', doctorId: '', nurseId: '',
  });
  const [slot, setSlot] = useState({ stationId: undefined, machineId: undefined });

  const book = useMutation({
    mutationFn: async () => (await api.post('/dialysis/sessions', {
      dialysisPatientId: form.dialysisPatientId,
      date: form.date, timeOfDay: form.time,
      scheduledAt: new Date(`${form.date}T${form.time}:00`).toISOString(),
      durationMinutes: Number(form.durationMinutes),
      shift: form.shift, priority: form.priority, status: form.status,
      doctorId: form.doctorId || undefined,
      machineId: slot.machineId, stationId: slot.stationId,
    })).data.data,
    onSuccess: (s) => { toast.success(`Session ${s.sessionNumber} ${s.status.toLowerCase()}`); onDone(); },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <div className="card p-3.5 space-y-3">
        <h3 className="text-sm font-bold text-ink-900">Patient</h3>
        <PatientSearch
          value={form.dialysisPatientId}
          onPick={(p) => setForm((f) => ({ ...f, dialysisPatientId: p._id, durationMinutes: f.durationMinutes, shift: p.preferredShift || f.shift }))}
        />
        {form.dialysisPatientId && <p className="text-[11px] text-emerald-700">Patient selected — the active prescription will be used automatically.</p>}

        <h3 className="pt-1 text-sm font-bold text-ink-900">When</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Date" required><input className="input mt-1" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="Time" required><input className="input mt-1" type="time" step="1800" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></Field>
          <Field label="Duration (min)" required><input className="input mt-1" type="number" min={60} max={720} step={30} value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} /></Field>
          <Field label="Shift">
            <select className="select mt-1" value={form.shift} onChange={(e) => setForm({ ...form, shift: e.target.value })}>
              {['MORNING', 'AFTERNOON', 'EVENING', 'NIGHT'].map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select className="select mt-1" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              {['ROUTINE', 'URGENT', 'EMERGENCY'].map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>
          <Field label="Initial status" hint="REQUESTED waits for the slot desk">
            <select className="select mt-1" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="SCHEDULED">SCHEDULED</option>
              <option value="REQUESTED">REQUESTED</option>
            </select>
          </Field>
        </div>

        <h3 className="pt-1 text-sm font-bold text-ink-900">Clinical team</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Doctor" hint="Leave blank to use the patient's nephrologist">
            <select className="select mt-1" value={form.doctorId} onChange={(e) => setForm({ ...form, doctorId: e.target.value })}>
              <option value="">Patient's nephrologist</option>
              {doctors.map((d) => <option key={d._id} value={d._id}>{d.name}{d.specialization ? ` — ${d.specialization}` : ''}</option>)}
            </select>
          </Field>
          <Field label="Nurse id" hint="Optional — the signed-in nurse is recorded on check-in">
            <input className="input mt-1" value={form.nurseId} onChange={(e) => setForm({ ...form, nurseId: e.target.value })} />
          </Field>
        </div>

        <button
          className="btn-primary w-full"
          disabled={!form.dialysisPatientId || book.isPending}
          onClick={() => book.mutate()}
        >
          {book.isPending ? <Spinner className="h-4 w-4 text-white" /> : <CalendarPlus className="h-4 w-4" />} Book session
        </button>
      </div>

      <div className="card p-3.5">
        <h3 className="mb-2 text-sm font-bold text-ink-900">Bay & machine availability</h3>
        <p className="mb-2 text-[11px] text-ink-500">Pick a free cell to allocate the bay and its machine. Leave it untouched to auto-allocate the first free combination.</p>
        <ResourcePick
          date={form.date}
          duration={Number(form.durationMinutes)}
          machineId={slot.machineId}
          stationId={slot.stationId}
          time={form.time}
          onChange={({ time, stationId, machineId }) => { setSlot({ stationId, machineId }); setForm((f) => ({ ...f, time })); }}
        />
        {slot.stationId && (
          <div className="mt-3 flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2 text-[11px]">
            <span className="font-semibold text-brand-800">Bay and machine reserved in the form</span>
            <button className="text-ink-500" onClick={() => setSlot({ stationId: undefined, machineId: undefined })}><X className="h-3.5 w-3.5" /></button>
          </div>
        )}
      </div>
    </div>
  );
}

// ================================================================ RECURRING
function RecurringPanel({ onDone }) {
  const doctors = useStaff();
  const [form, setForm] = useState({
    dialysisPatientId: '', patternCode: 'MWF', daysOfWeek: ['MON', 'WED', 'FRI'],
    startDate: dateStr(7), endDate: '', timeOfDay: timeStr(8), slotDurationMinutes: 240,
    preferredShift: 'MORNING', doctorId: '', preferredMachineId: '', preferredStationId: '',
    horizonDays: 28, notes: '',
  });

  const machines = useQuery({ queryKey: ['dialysis-sched-machines'], queryFn: async () => (await api.get('/dialysis/machines')).data.data });
  const stations = useQuery({ queryKey: ['dialysis-sched-stations'], queryFn: async () => (await api.get('/dialysis/stations')).data.data });
  const defaults = useQuery({ queryKey: ['dialysis-prescription-defaults'], queryFn: async () => (await api.get('/dialysis/config/prescription-defaults')).data.data });

  const create = useMutation({
    mutationFn: async () => (await api.post('/dialysis/schedules', {
      ...form,
      daysOfWeek: form.daysOfWeek,
      preferredMachineId: form.preferredMachineId || undefined,
      preferredStationId: form.preferredStationId || undefined,
      doctorId: form.doctorId || undefined,
      endDate: form.endDate || undefined,
      generateHorizonDays: Number(form.horizonDays),
    })).data.data,
    onSuccess: (s) => { toast.success(`${s.scheduleNumber} created — ${s.generated?.length ?? 0} session(s) generated`); onDone(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const generate = useMutation({
    mutationFn: async ({ id, days }) => (await api.post(`/dialysis/schedules/${id}/generate`, { horizonDays: Number(days) })).data.data,
    onSuccess: (r) => { toast.success(`${r.generated.length} new session(s); ${r.skipped.length} already existed`); onDone(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const update = useMutation({
    mutationFn: async ({ id, body }) => (await api.patch(`/dialysis/schedules/${id}`, body)).data.data,
    onSuccess: (s) => { toast.success(`${s.scheduleNumber} → ${s.status}`); onDone(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const [cancelFor, setCancelFor] = useState(null);
  const [cancelReason, setCancelReason] = useState('');

  const schedules = useQuery({
    queryKey: ['dialysis-schedules'],
    queryFn: async () => (await api.get('/dialysis/schedules', { params: { limit: 50 } })).data.data,
    refetchInterval: POLL.SLOW,
  });

  const applyPattern = (code) => {
    const p = (defaults.data?.scheduling?.recurrencePatterns || []).find((x) => x.code === code);
    setForm((f) => ({ ...f, patternCode: code, daysOfWeek: p?.days || f.daysOfWeek }));
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
      <div className="card p-3.5 space-y-3">
        <h3 className="text-sm font-bold text-ink-900">New recurring programme</h3>
        <PatientSearch value={form.dialysisPatientId} onPick={(p) => setForm((f) => ({ ...f, dialysisPatientId: p._id, preferredShift: p.preferredShift || f.preferredShift, doctorId: f.doctorId }))} />

        <Field label="Pattern" required>
          <select className="select mt-1" value={form.patternCode} onChange={(e) => applyPattern(e.target.value)}>
            <option value="CUSTOM">Custom</option>
            {(defaults.data?.scheduling?.recurrencePatterns || []).map((p) => <option key={p.code} value={p.code}>{p.code} — {p.label}</option>)}
          </select>
        </Field>

        <div>
          <span className="label">Days of the week</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {DAYS.map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => setForm((f) => ({ ...f, patternCode: 'CUSTOM', daysOfWeek: f.daysOfWeek.includes(x) ? f.daysOfWeek.filter((y) => y !== x) : [...f.daysOfWeek, x] }))}
                className={cn('rounded-lg px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset', form.daysOfWeek.includes(x) ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-ink-600 ring-ink-200')}
              >
                {x}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Start date" required><input className="input mt-1" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field>
          <Field label="End date" hint="Leave blank for an open-ended programme"><input className="input mt-1" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></Field>
          <Field label="Time of day" required><input className="input mt-1" type="time" step="1800" value={form.timeOfDay} onChange={(e) => setForm({ ...form, timeOfDay: e.target.value })} /></Field>
          <Field label="Slot duration (min)"><input className="input mt-1" type="number" min={60} max={720} step={30} value={form.slotDurationMinutes} onChange={(e) => setForm({ ...form, slotDurationMinutes: e.target.value })} /></Field>
          <Field label="Preferred shift">
            <select className="select mt-1" value={form.preferredShift} onChange={(e) => setForm({ ...form, preferredShift: e.target.value })}>
              {(defaults.data?.scheduling?.shifts || [{ code: 'MORNING' }]).map((s) => <option key={s.code} value={s.code}>{s.label || s.code}</option>)}
            </select>
          </Field>
          <Field label="Generate horizon (days)"><input className="input mt-1" type="number" value={form.horizonDays} onChange={(e) => setForm({ ...form, horizonDays: e.target.value })} /></Field>
          <Field label="Preferred machine" hint="Falls back to any free machine">
            <select className="select mt-1" value={form.preferredMachineId} onChange={(e) => setForm({ ...form, preferredMachineId: e.target.value })}>
              <option value="">Any free machine</option>
              {(machines.data || []).map((m) => <option key={m._id} value={m._id}>{m.code} — {m.status}</option>)}
            </select>
          </Field>
          <Field label="Preferred bay" hint="Falls back to any free bay">
            <select className="select mt-1" value={form.preferredStationId} onChange={(e) => setForm({ ...form, preferredStationId: e.target.value })}>
              <option value="">Any free bay</option>
              {(stations.data || []).map((s) => <option key={s._id} value={s._id}>{s.code} — {s.status}</option>)}
            </select>
          </Field>
          <Field label="Doctor" hint="Defaults to the nephrologist">
            <select className="select mt-1" value={form.doctorId} onChange={(e) => setForm({ ...form, doctorId: e.target.value })}>
              <option value="">Patient's nephrologist</option>
              {doctors.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Notes"><input className="input mt-1" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>

        <div className="flex items-center gap-2 rounded-xl bg-ink-50 p-2.5 text-[11px] text-ink-600">
          <Repeat className="h-3.5 w-3.5 text-brand-600" />
          Every generated session stores <span className="font-mono">scheduleId</span> back to this programme — they are never unrelated records.
        </div>

        <button className="btn-primary w-full" disabled={!form.dialysisPatientId || !form.daysOfWeek.length || create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? <Spinner className="h-4 w-4 text-white" /> : <Repeat className="h-4 w-4" />} Create & generate
        </button>
      </div>

      <div className="space-y-3">
        <div className="card p-3.5">
          <h3 className="mb-2 text-sm font-bold text-ink-900">Recurring programmes</h3>
          {schedules.isLoading ? <LoadingState label="Loading programmes…" /> : !schedules.data?.length ? (
            <EmptyState title="No recurring programme yet" hint="Create one on the left" />
          ) : (
            <div className="space-y-2">
              {schedules.data.map((s) => (
                <div key={s._id} className="rounded-xl border border-ink-100 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-bold text-brand-700">{s.scheduleNumber}</span>
                        <span className={cn('badge ring-1 ring-inset', SCHEDULE_STATUS_STYLE[s.status])}>{s.status}</span>
                        {s.isRecurring !== false && s.totalGenerated > 0 && <span className="badge bg-ink-100 text-ink-600">{s.totalGenerated} generated</span>}
                      </div>
                      <div className="mt-0.5 text-[11px] text-ink-700">
                        {s.patientId?.firstName} {s.patientId?.lastName} · {s.patientId?.uhid}
                      </div>
                      <div className="text-[10px] text-ink-500">
                        {s.patternCode} · {(s.daysOfWeek || []).join(' ')} · {s.frequencyPerWeek}/week · {s.timeOfDay} · {s.preferredShift}
                        {s.doctorId?.name ? ` · ${s.doctorId.name}` : ''}
                        {s.preferredMachineId?.code ? ` · ${s.preferredMachineId.code}` : ''}
                        {s.preferredStationId?.code ? ` / ${s.preferredStationId.code}` : ''}
                      </div>
                      <div className="text-[10px] text-ink-500">From {formatDate(s.startDate)}{s.endDate ? ` to ${formatDate(s.endDate)}` : ' · open ended'}</div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {['ACTIVE', 'PAUSED', 'DRAFT'].includes(s.status) && (
                        <button className="btn-secondary px-2 py-1 text-[10px]" disabled={generate.isPending} onClick={() => generate.mutate({ id: s._id, days: 28 })}>
                          <Plus className="h-3 w-3" /> Extend 28d
                        </button>
                      )}
                      {s.status === 'ACTIVE' && (
                        <button className="btn-secondary px-2 py-1 text-[10px]" onClick={() => update.mutate({ id: s._id, body: { status: 'PAUSED' } })}>
                          <PauseCircle className="h-3 w-3" /> Pause
                        </button>
                      )}
                      {s.status === 'PAUSED' && (
                        <button className="btn-secondary px-2 py-1 text-[10px]" onClick={() => update.mutate({ id: s._id, body: { status: 'ACTIVE' } })}>
                          <PlayCircle className="h-3 w-3" /> Resume
                        </button>
                      )}
                      {s.status !== 'CANCELLED' && (
                        <button className="btn-secondary px-2 py-1 text-[10px] text-rose-600" onClick={() => { setCancelFor(s); setCancelReason(''); }}>
                          <X className="h-3 w-3" /> Cancel
                        </button>
                      )}
                    </div>
                  </div>
                  {s.notes && <p className="mt-1 text-[10px] text-ink-500">{s.notes}</p>}
                  {s.statusReason && <p className="mt-1 text-[10px] text-rose-600">Reason: {s.statusReason}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {cancelFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-md p-5">
            <div className="flex items-start justify-between">
              <h3 className="text-sm font-bold text-ink-900">Cancel {cancelFor.scheduleNumber}</h3>
              <button onClick={() => setCancelFor(null)} className="text-ink-400"><X className="h-4 w-4" /></button>
            </div>
            <p className="mt-1 text-[11px] text-ink-500">Future sittings stay on the board and can be cancelled individually. This programme will never generate anything new.</p>
            <Field label="Reason" required className="mt-3"><input className="input mt-1" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="e.g. patient transplanted" /></Field>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setCancelFor(null)}>Close</button>
              <button
                className="btn-primary"
                disabled={!cancelReason.trim() || update.isPending}
                onClick={() => { update.mutate({ id: cancelFor._id, body: { status: 'CANCELLED', statusReason: cancelReason } }); setCancelFor(null); }}
              >
                {update.isPending ? <Spinner className="h-4 w-4 text-white" /> : <X className="h-4 w-4" />} Cancel programme
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ================================================================ EMERGENCY
function EmergencyPanel({ onDone }) {
  const doctors = useStaff();
  const [form, setForm] = useState({ dialysisPatientId: '', durationMinutes: 180, doctorId: '', reason: '' });

  const book = useMutation({
    mutationFn: async () => (await api.post('/dialysis/sessions', {
      dialysisPatientId: form.dialysisPatientId,
      scheduledAt: new Date().toISOString(),
      isEmergency: true, priority: 'EMERGENCY',
      durationMinutes: Number(form.durationMinutes),
      doctorId: form.doctorId || undefined,
      notes: form.reason || undefined,
    })).data.data,
    onSuccess: (s) => { toast.success(`Emergency session ${s.sessionNumber} created`); onDone(); },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="card border-l-4 border-l-rose-500 p-3.5 space-y-3">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-ink-900"><Siren className="h-4 w-4 text-rose-500" /> Emergency dialysis session</h3>
        <p className="text-[11px] text-ink-600">
          An emergency sitting ignores the normal booking lead time and is flagged <span className="font-semibold">EMERGENCY</span> on the roster,
          the command centre and every report. It still cannot double-book a patient, a machine or a bay.
        </p>
        <PatientSearch value={form.dialysisPatientId} onPick={(p) => setForm((f) => ({ ...f, dialysisPatientId: p._id }))} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Duration (min)"><input className="input mt-1" type="number" min={60} max={720} step={30} value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} /></Field>
          <Field label="Doctor">
            <select className="select mt-1" value={form.doctorId} onChange={(e) => setForm({ ...form, doctorId: e.target.value })}>
              <option value="">Patient's nephrologist</option>
              {doctors.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Reason"><input className="input mt-1" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. refractory pulmonary oedema" /></Field>
        <button className="btn-danger w-full" disabled={!form.dialysisPatientId || book.isPending} onClick={() => book.mutate()}>
          {book.isPending ? <Spinner className="h-4 w-4 text-white" /> : <Zap className="h-4 w-4" />} Start emergency session now
        </button>
      </div>

      <EmergencyBoard />
    </div>
  );
}

function EmergencyBoard() {
  const sessions = useQuery({
    queryKey: ['dialysis-sessions-desk', 'emergency'],
    queryFn: async () => (await api.get('/dialysis/sessions', { params: { limit: 50 } })).data.data,
    refetchInterval: POLL.ACTIVE,
  });
  const rows = (sessions.data || []).filter((s) => s.isEmergency || s.priority === 'EMERGENCY').slice(0, 12);
  return (
    <div className="card p-3.5">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink-900"><AlertTriangle className="h-4 w-4 text-rose-500" /> Emergency sessions on record</h3>
      {sessions.isLoading ? <LoadingState label="Loading…" /> : !rows.length ? <EmptyState title="No emergency session yet" /> : (
        <div className="space-y-1.5">
          {rows.map((s) => (
            <Link key={s._id} to={`/dialysis/session/${s._id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-[11px] hover:bg-rose-100">
              <span>
                <span className="font-mono font-semibold text-rose-800">{s.sessionNumber}</span>
                <span className="ml-2 font-semibold text-ink-900">{s.patientId?.firstName} {s.patientId?.lastName}</span>
                <span className="ml-2 text-ink-500">{s.machineId?.code || 'no machine'} · {s.stationId?.code || 'no bay'}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="text-ink-500">{formatDateTime(s.scheduledStart)}</span>
                <span className={cn('badge ring-1 ring-inset', SESSION_STATUS_STYLE[s.status])}>{String(s.status).replace(/_/g, ' ')}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ================================================================ DESK
function DeskPanel({ onDone }) {
  const [filter, setFilter] = useState({ status: '', shift: '', date: dateStr(0) });
  const [target, setTarget] = useState(null);
  const [reason, setReason] = useState('');
  const [move, setMove] = useState({ date: dateStr(1), time: timeStr(8) });

  const sessions = useQuery({
    queryKey: ['dialysis-sessions-desk', filter],
    queryFn: async () => (await api.get('/dialysis/sessions', { params: { limit: 100, ...filter } })).data.data,
    refetchInterval: POLL.ACTIVE,
  });

  const confirm = useMutation({
    mutationFn: async (id) => (await api.post(`/dialysis/sessions/${id}/confirm`, { notes: 'Confirmed by the scheduling desk' })).data.data,
    onSuccess: (s) => { toast.success(`${s.sessionNumber} confirmed`); onDone(); },
    onError: (e) => toast.error(apiError(e)),
  });
  const cancel = useMutation({
    mutationFn: async ({ id, why }) => (await api.post(`/dialysis/sessions/${id}/cancel-desk`, { reason: why })).data.data,
    onSuccess: (s) => { toast.success(`${s.sessionNumber} cancelled`); setTarget(null); setReason(''); onDone(); },
    onError: (e) => toast.error(apiError(e)),
  });
  const waiting = useMutation({
    mutationFn: async (id) => (await api.post(`/dialysis/sessions/${id}/waiting`, { notes: 'Moved to the waiting list' })).data.data,
    onSuccess: (s) => { toast.success(`${s.sessionNumber} on the waiting list`); onDone(); },
    onError: (e) => toast.error(apiError(e)),
  });
  const reschedule = useMutation({
    mutationFn: async ({ id, body }) => (await api.post(`/dialysis/sessions/${id}/reschedule`, body)).data.data,
    onSuccess: (r) => { toast.success(`Moved to ${r.replacement.sessionNumber}`); setTarget(null); onDone(); },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap items-end gap-2 p-3">
        <Field label="Status">
          <select className="select mt-1" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
            <option value="">All upcoming</option>
            {['REQUESTED', 'SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'WAITING', 'IN_PROGRESS'].map((x) => <option key={x}>{x}</option>)}
          </select>
        </Field>
        <Field label="Shift">
          <select className="select mt-1" value={filter.shift} onChange={(e) => setFilter({ ...filter, shift: e.target.value })}>
            <option value="">All shifts</option>
            {['MORNING', 'AFTERNOON', 'EVENING', 'NIGHT'].map((x) => <option key={x}>{x}</option>)}
          </select>
        </Field>
        <Field label="Date">
          <input className="input mt-1" type="date" value={filter.date} onChange={(e) => setFilter({ ...filter, date: e.target.value })} />
        </Field>
        <Link to="/dialysis/slots" className="btn-secondary ml-auto text-xs">Open the slot board</Link>
      </div>

      <div className="card overflow-x-auto">
        {sessions.isLoading ? <LoadingState label="Loading sessions…" /> : sessions.error ? <ErrorState message={apiError(sessions.error)} /> : !sessions.data?.length ? (
          <EmptyState title="No session matches" />
        ) : (
          <table className="table">
            <thead>
              <tr><th>Session</th><th>Date & time</th><th>Patient</th><th>Shift</th><th>Machine / bay</th><th>Doctor</th><th>From</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {sessions.data.map((s) => (
                <tr key={s._id}>
                  <td className="font-mono text-[11px] font-semibold text-brand-700">
                    {s.sessionNumber}
                    {s.isEmergency && <span className="ml-1 badge bg-rose-100 text-rose-700">EMERGENCY</span>}
                    {s.isRecurring && <span className="ml-1 badge bg-ink-100 text-ink-600">REC</span>}
                    {(s.rescheduleCount || 0) > 0 && <span className="ml-1 badge bg-amber-50 text-amber-700">R{s.rescheduleCount}</span>}
                  </td>
                  <td className="text-[11px]">{formatDate(s.sessionDate)}<div className="text-[10px] text-ink-500">{s.timeOfDay || formatDateTime(s.scheduledStart).split(' ').pop()}</div></td>
                  <td className="text-[11px] text-ink-900">{s.patientId?.firstName} {s.patientId?.lastName}<div className="font-mono text-[10px] text-ink-500">{s.dialysisPatientId?.dialysisNumber}</div></td>
                  <td className="text-[11px]">{s.shift}</td>
                  <td className="text-[11px]">{s.machineId?.code || '—'}{s.stationId?.code ? ` / ${s.stationId.code}` : ''}</td>
                  <td className="text-[11px]">{s.doctorId?.name || '—'}</td>
                  <td className="text-[11px]">{s.scheduleId?.scheduleNumber || s.scheduleId || '—'}</td>
                  <td><span className={cn('badge ring-1 ring-inset', SESSION_STATUS_STYLE[s.status])}>{String(s.status).replace(/_/g, ' ')}</span></td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {['REQUESTED', 'SCHEDULED'].includes(s.status) && (
                        <button className="btn-secondary px-2 py-0.5 text-[10px]" disabled={confirm.isPending} onClick={() => confirm.mutate(s._id)}>
                          <CheckCircle2 className="h-3 w-3" /> Confirm
                        </button>
                      )}
                      {['CONFIRMED', 'CHECKED_IN'].includes(s.status) && (
                        <button className="btn-secondary px-2 py-0.5 text-[10px]" disabled={waiting.isPending} onClick={() => waiting.mutate(s._id)}>
                          <Clock3 className="h-3 w-3" /> Wait
                        </button>
                      )}
                      {['REQUESTED', 'SCHEDULED', 'CONFIRMED'].includes(s.status) && (
                        <button className="btn-secondary px-2 py-0.5 text-[10px]" onClick={() => { setTarget({ mode: 'move', s }); setMove({ date: s.sessionDate?.slice(0, 10) || dateStr(1), time: s.timeOfDay || timeStr(8) }); }}>
                          <History className="h-3 w-3" /> Reschedule
                        </button>
                      )}
                      {['REQUESTED', 'SCHEDULED', 'CONFIRMED'].includes(s.status) && (
                        <button className="btn-secondary px-2 py-0.5 text-[10px] text-rose-600" onClick={() => { setTarget({ mode: 'cancel', s }); setReason(''); }}>
                          <X className="h-3 w-3" /> Cancel
                        </button>
                      )}
                      <Link to={`/dialysis/session/${s._id}`} className="btn-secondary px-2 py-0.5 text-[10px]">Open</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {target && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-lg p-5">
            <div className="flex items-start justify-between">
              <h3 className="text-sm font-bold text-ink-900">
                {target.mode === 'cancel' ? 'Cancel session' : 'Reschedule session'} — {target.s.sessionNumber}
              </h3>
              <button onClick={() => setTarget(null)} className="text-ink-400"><X className="h-4 w-4" /></button>
            </div>

            {target.mode === 'cancel' ? (
              <>
                <p className="mt-1 text-[11px] text-ink-500">The original record is kept and marked cancelled, with the reason on file.</p>
                <Field label="Reason" required className="mt-3"><textarea className="input mt-1 h-20" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
              </>
            ) : (
              <>
                <p className="mt-1 text-[11px] text-ink-500">
                  A <strong>new</strong> session is created and linked to this one. The original is preserved and marked cancelled — nothing is rewritten.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Field label="New date" required><input className="input mt-1" type="date" value={move.date} onChange={(e) => setMove({ ...move, date: e.target.value })} /></Field>
                  <Field label="New time" required><input className="input mt-1" type="time" step="1800" value={move.time} onChange={(e) => setMove({ ...move, time: e.target.value })} /></Field>
                </div>
                <div className="mt-2">
                  <ResourcePick
                    date={move.date}
                    duration={target.s.slotDurationMinutes}
                    machineId={move.machineId}
                    stationId={move.stationId}
                    time={move.time}
                    onChange={({ time, stationId, machineId }) => setMove((m) => ({ ...m, time, stationId, machineId }))}
                    label="Move to"
                  />
                </div>
                <Field label="Reason" className="mt-3"><input className="input mt-1" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. patient requested a different day" /></Field>
              </>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setTarget(null)}>Close</button>
              {target.mode === 'cancel' ? (
                <button className="btn-primary" disabled={!reason.trim() || cancel.isPending} onClick={() => cancel.mutate({ id: target.s._id, why: reason })}>
                  {cancel.isPending ? <Spinner className="h-4 w-4 text-white" /> : <X className="h-4 w-4" />} Cancel session
                </button>
              ) : (
                <button
                  className="btn-primary"
                  disabled={reschedule.isPending}
                  onClick={() => reschedule.mutate({
                    id: target.s._id,
                    body: {
                      date: move.date, timeOfDay: move.time, reason: reason || undefined,
                      machineId: move.machineId, stationId: move.stationId,
                    },
                  })}
                >
                  {reschedule.isPending ? <Spinner className="h-4 w-4 text-white" /> : <History className="h-4 w-4" />} Reschedule
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
