import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  BedDouble, CalendarDays, ChevronLeft, ChevronRight, Clock3, History, Plus, RefreshCw,
  UserCheck, X, AlertTriangle,
} from 'lucide-react';
import api, { apiError } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import { LoadingState, ErrorState, EmptyState, Spinner } from '../../components/ui/Feedback';
import { MotionPage } from '../../components/ui/Motion';
import { formatDate, cn } from '../../lib/utils';
import { POLL } from '../../lib/polling';
import { useIpdRealtime } from '../../lib/useIpdRealtime';

const STATUS_STYLE = {
  REQUESTED: 'bg-amber-100 text-amber-900 ring-amber-300',
  SCHEDULED: 'bg-blue-50 text-blue-800 ring-blue-200',
  CONFIRMED: 'bg-cyan-50 text-cyan-800 ring-cyan-300',
  CHECKED_IN: 'bg-indigo-50 text-indigo-800 ring-indigo-200',
  WAITING: 'bg-violet-50 text-violet-800 ring-violet-200',
  PRE_ASSESSED: 'bg-violet-50 text-violet-800 ring-violet-200',
  READY: 'bg-cyan-50 text-cyan-800 ring-cyan-200',
  CONNECTED: 'bg-orange-50 text-orange-800 ring-orange-200',
  IN_PROGRESS: 'bg-rose-100 text-rose-800 ring-rose-300',
  COMPLETED: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  BILLED: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  CLOSED: 'bg-ink-100 text-ink-600 ring-ink-200',
  CANCELLED: 'bg-ink-50 text-ink-400 ring-ink-200 line-through',
  NO_SHOW: 'bg-ink-50 text-ink-400 ring-ink-200',
};

const LIVE_STATUSES = ['CHECKED_IN', 'WAITING', 'PRE_ASSESSED', 'READY', 'CONNECTED', 'IN_PROGRESS'];
const DESK_STATUSES = ['REQUESTED', 'SCHEDULED', 'CONFIRMED'];
const RUNNABLE_MACHINE = ['AVAILABLE', 'RESERVED'];

/**
 * A bay is only bookable when the bay itself is free AND the machine installed
 * in it can actually run — a machine being cleaned or serviced makes the whole
 * bay unusable, and the booking would otherwise be rejected at save time.
 */
const bayRunnable = (station) => Boolean(
  station
  && station.status === 'AVAILABLE'
  && (!station.machineId || RUNNABLE_MACHINE.includes(station.machineStatus)),
);

const dateStr = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const today = () => dateStr(new Date());
const shiftDate = (base, delta) => {
  const d = new Date(base);
  d.setDate(d.getDate() + delta);
  return dateStr(d);
};

export default function DialysisSlots() {
  const qc = useQueryClient();
  useIpdRealtime();
  const [date, setDate] = useState(today());
  const [action, setAction] = useState(null);
  const [move, setMove] = useState({ date: today(), time: '08:00' });
  const [reason, setReason] = useState('');

  const board = useQuery({
    queryKey: ['dialysis-slot-board', date],
    queryFn: async () => (await api.get('/dialysis/slots', { params: { date } })).data.data,
    refetchInterval: POLL.ACTIVE,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['dialysis-slot-board'] });
    qc.invalidateQueries({ queryKey: ['dialysis-sessions-desk'] });
    qc.invalidateQueries({ queryKey: ['dialysis-command-center'] });
  };

  const assign = useMutation({
    mutationFn: async ({ id, body }) => (await api.patch(`/dialysis/sessions/${id}/assignment`, body)).data.data,
    onSuccess: (s) => { toast.success(`${s.sessionNumber} → bay ${s.stationId?.code || 'cleared'}`); setAction(null); refresh(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const confirm = useMutation({
    mutationFn: async (id) => (await api.post(`/dialysis/sessions/${id}/confirm`, { notes: 'Confirmed from the slot board' })).data.data,
    onSuccess: (s) => { toast.success(`${s.sessionNumber} confirmed`); refresh(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const reschedule = useMutation({
    mutationFn: async ({ id, body }) => (await api.post(`/dialysis/sessions/${id}/reschedule`, body)).data.data,
    onSuccess: (r) => { toast.success(`Moved to ${r.replacement.sessionNumber}`); setAction(null); refresh(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const cancel = useMutation({
    mutationFn: async ({ id, why }) => (await api.post(`/dialysis/sessions/${id}/cancel-desk`, { reason: why })).data.data,
    onSuccess: (s) => { toast.success(`${s.sessionNumber} cancelled`); setAction(null); setReason(''); refresh(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const stations = board.data?.stations || [];
  const grid = board.data?.grid || [];
  const summary = board.data?.summary;

  const sessionById = useMemo(() => {
    const map = new Map();
    grid.forEach((row) => row.cells.forEach((cell) => { if (cell.session) map.set(cell.session.id, cell.session); }));
    return map;
  }, [grid]);

  return (
    <MotionPage className="p-5 space-y-4">
      <PageHeader
        title="Dialysis Slot Board"
        subtitle="Visual bay timetable — assign, reassign, reschedule and cancel without ever double-booking"
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-secondary px-2 py-1" onClick={() => setDate(shiftDate(date, -1))}><ChevronLeft className="h-4 w-4" /></button>
            <input type="date" className="input h-8 w-36 py-1 text-xs" value={date} onChange={(e) => setDate(e.target.value)} />
            <button className="btn-secondary px-2 py-1" onClick={() => setDate(shiftDate(date, 1))}><ChevronRight className="h-4 w-4" /></button>
            <button className="btn-secondary px-2 py-1 text-xs" onClick={() => setDate(today())}>Today</button>
            <button className="btn-secondary px-2 py-1" onClick={refresh}><RefreshCw className={cn('h-4 w-4', board.isFetching && 'animate-spin')} /></button>
            <Link to="/dialysis/schedule" className="btn-primary text-xs"><Plus className="h-3.5 w-3.5" /> Book a session</Link>
          </div>
        )}
      />

      {board.isLoading ? <LoadingState label="Loading the slot board…" /> : board.error ? <ErrorState message={apiError(board.error)} /> : (
        <>
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-8">
            {[
              ['Total', summary.total, null],
              ['Requested', summary.requested, 'warn'],
              ['Scheduled', summary.scheduled, null],
              ['Confirmed', summary.confirmed, 'ok'],
              ['In unit', summary.inProgress, 'critical'],
              ['Completed', summary.completed, 'ok'],
              ['Cancelled / no-show', summary.cancelled, null],
              ['Needs a bay', summary.unplaced, summary.unplaced ? 'warn' : null],
            ].map(([l, v, tone]) => (
              <div key={l} className={cn('card p-2.5', tone === 'critical' && 'border-rose-300', tone === 'warn' && v > 0 && 'border-amber-300', tone === 'ok' && 'border-emerald-200')}>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">{l}</div>
                <div className="text-lg font-bold tabular-nums text-ink-900">{v ?? 0}</div>
              </div>
            ))}
          </div>

          {/* ---------- STATION LEGEND ---------- */}
          <div className="flex flex-wrap gap-2">
            {stations.map((st) => (
              <div
                key={st.id}
                title={st.machineId ? `Machine ${st.machineCode} is ${String(st.machineStatus || 'unknown').toLowerCase()}` : 'No machine installed in this bay'}
                className={cn(
                  'flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-[11px]',
                  !bayRunnable(st) ? 'border-ink-200 bg-ink-50 text-ink-600'
                    : st.status === 'OCCUPIED' ? 'border-rose-300 bg-rose-50 text-rose-800'
                      : 'border-emerald-300 bg-emerald-50 text-emerald-800',
                )}
              >
                <BedDouble className="h-3.5 w-3.5" />
                <span className="font-bold">{st.code}</span>
                <span>{st.machineCode || 'no machine'}</span>
                {st.machineId && !RUNNABLE_MACHINE.includes(st.machineStatus) && (
                  <span className="rounded bg-ink-200 px-1 py-0.5 text-[9px] font-bold uppercase">{String(st.machineStatus || '').toLowerCase()}</span>
                )}
                <span className="opacity-80">{st.sessionCount} session(s)</span>
              </div>
            ))}
          </div>

          {/* ---------- GRID ---------- */}
          <div className="card overflow-x-auto">
            <table className="table" style={{ minWidth: `${180 + stations.length * 180}px` }}>
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 w-[110px] bg-white">Time</th>
                  {stations.map((st, i) => (
                    <th key={st.id} className="min-w-[170px]">
                      <div className="text-xs font-bold">Station {i + 1} — {st.code}</div>
                      <div className="text-[10px] font-normal text-ink-500">
                        {st.machineCode || 'no machine'} · {bayRunnable(st) ? st.status : `machine ${String(st.machineStatus || 'unavailable').toLowerCase()}`}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.map((row) => (
                  <tr key={row.time}>
                    <td className="sticky left-0 z-10 bg-white">
                      <div className="font-mono text-xs font-semibold text-ink-800">{row.time}</div>
                      {row.shift && <div className="text-[9px] uppercase tracking-wide text-ink-400">{row.shift}</div>}
                    </td>
                    {row.cells.map((cell) => {
                      const s = cell.session;
                      const station = stations.find((st) => st.id === cell.stationId);
                      const blocked = station && !bayRunnable(station);
                      return (
                        <td key={cell.stationId} className="align-top p-1.5">
                          {s ? (
                            <SessionCard
                              s={s}
                              onOpen={() => setAction({ type: 'view', s })}
                              onAssign={() => setAction({ type: 'assign', s })}
                              onMove={() => { setAction({ type: 'move', s }); setMove({ date, time: s.timeOfDay || row.time }); }}
                              onCancel={() => { setAction({ type: 'cancel', s }); setReason(''); }}
                              onConfirm={() => confirm.mutate(s.id)}
                            />
                          ) : (
                            <button
                              disabled={blocked}
                              onClick={() => { setAction({ type: 'new', station: cell.stationId, time: row.time }); setMove({ date, time: row.time }); }}
                              className={cn(
                                'flex h-[54px] w-full items-center justify-center rounded-lg border border-dashed text-[10px] font-semibold transition',
                                blocked ? 'cursor-not-allowed border-ink-200 bg-ink-50 text-ink-300' : 'border-emerald-300 bg-emerald-50/50 text-emerald-700 hover:bg-emerald-100',
                              )}
                              title={blocked
                                ? `Bay ${station?.code} cannot take a booking — ${station?.machineId ? `machine ${String(station.machineStatus || 'unavailable').toLowerCase()}` : `bay ${String(station?.status || '').toLowerCase()}`}`
                                : `Book a session in ${station?.code} at ${row.time}`}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {!grid.length && (
                  <tr><td colSpan={stations.length + 1}><EmptyState title="No slot grid configured" hint="Set the grid start, end and row interval in Prescription → Hospital defaults" /></td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ---------- UNPLACED ---------- */}
          {board.data.unplaced.length > 0 && (
            <div className="card p-3.5">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink-900">
                <AlertTriangle className="h-4 w-4 text-amber-500" /> Sessions without a bay ({board.data.unplaced.length})
              </h3>
              <p className="mb-2 text-[11px] text-ink-500">These are waiting for a slot. Assign a bay, or reschedule them into a free cell above.</p>
              <div className="space-y-1.5">
                {board.data.unplaced.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px]">
                    <span>
                      <span className="font-mono font-semibold text-ink-900">{s.sessionNumber}</span>
                      <span className="ml-2 font-medium text-ink-900">{s.patient}</span>
                      <span className="ml-2 font-mono text-[10px] text-brand-700">{s.dialysisNumber || 'no dialysis id'}</span>
                      <span className="ml-2 text-ink-500">{s.timeOfDay} · {s.doctor || 'no doctor'} · {s.machineCode || 'no machine'}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className={cn('badge ring-1 ring-inset', STATUS_STYLE[s.status])}>{String(s.status).replace(/_/g, ' ')}</span>
                      {DESK_STATUSES.includes(s.status) && (
                        <>
                          <button className="btn-secondary px-2 py-0.5 text-[10px]" onClick={() => setAction({ type: 'assign', s })}><UserCheck className="h-3 w-3" /> Assign bay</button>
                          <button className="btn-secondary px-2 py-0.5 text-[10px]" onClick={() => { setAction({ type: 'move', s }); setMove({ date, time: s.timeOfDay || '08:00' }); }}><History className="h-3 w-3" /> Reschedule</button>
                        </>
                      )}
                      <Link to={`/dialysis/session/${s.id}`} className="btn-secondary px-2 py-0.5 text-[10px]">Open</Link>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-[10px] text-ink-400">Board for {board.data.date} · updated {new Date(board.data.updatedAt).toLocaleTimeString('en-IN')} · grid {board.data.config.dayStart}–{board.data.config.dayEnd} in {board.data.config.slotMinutes} minute rows</p>
        </>
      )}

      {/* ---------- ACTION DIALOG ---------- */}
      {action?.type === 'view' && (
        <Dialog title={`Session ${action.s.sessionNumber}`} onClose={() => setAction(null)}>
          <div className="space-y-1.5 text-[11px]">
            {[
              ['Patient', action.s.patient], ['UHID', action.s.uhid], ['Dialysis ID', action.s.dialysisNumber],
              ['Doctor', action.s.doctor || '—'], ['Nurse', action.s.nurse || '—'],
              ['Bay / machine', `${action.s.stationCode || '—'} / ${action.s.machineCode || '—'}`],
              ['Scheduled', `${formatDate(action.s.scheduledStart)} ${action.s.timeOfDay || ''}`],
              ['Duration', `${action.s.durationMinutes || '—'} min`],
              ['Priority', action.s.priority],
              ['From programme', action.s.scheduleNumber || 'single booking'],
              ['Rescheduled', action.s.rescheduleCount ? `${action.s.rescheduleCount} time(s)` : 'never'],
            ].map(([l, v]) => (
              <div key={l} className="flex justify-between gap-3 border-b border-ink-100 py-1 last:border-0">
                <span className="text-ink-500">{l}</span>
                <span className="text-right font-medium text-ink-900">{v ?? '—'}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            {DESK_STATUSES.includes(action.s.status) && <button className="btn-secondary" onClick={() => { setAction({ type: 'assign', s: action.s }); }}><UserCheck className="h-3.5 w-3.5" /> Assign</button>}
            {DESK_STATUSES.includes(action.s.status) && <button className="btn-secondary" onClick={() => { setAction({ type: 'move', s: action.s }); setMove({ date, time: action.s.timeOfDay || '08:00' }); }}><History className="h-3.5 w-3.5" /> Reschedule</button>}
            {DESK_STATUSES.includes(action.s.status) && <button className="btn-primary" onClick={() => { confirm.mutate(action.s.id); setAction(null); }}><UserCheck className="h-3.5 w-3.5" /> Confirm</button>}
            <Link to={`/dialysis/session/${action.s.id}`} className="btn-secondary">Open session</Link>
          </div>
        </Dialog>
      )}

      {action?.type === 'assign' && (
        <AssignDialog
          session={action.s}
          stations={stations}
          onClose={() => setAction(null)}
          onSave={(body) => assign.mutate({ id: action.s.id, body })}
          saving={assign.isPending}
        />
      )}

      {action?.type === 'cancel' && (
        <Dialog title={`Cancel ${action.s.sessionNumber}`} onClose={() => setAction(null)}>
          <p className="text-[11px] text-ink-500">The original record is kept and marked cancelled with your reason on file.</p>
          <label className="label mt-3">Reason <span className="font-semibold text-rose-600">*</span>
            <textarea className="input mt-1 h-20" value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setAction(null)}>Close</button>
            <button className="btn-primary" disabled={!reason.trim() || cancel.isPending} onClick={() => cancel.mutate({ id: action.s.id, why: reason })}>
              {cancel.isPending ? <Spinner className="h-4 w-4 text-white" /> : <X className="h-4 w-4" />} Cancel session
            </button>
          </div>
        </Dialog>
      )}

      {action?.type === 'move' && (
        <Dialog title={`Reschedule ${action.s.sessionNumber}`} onClose={() => setAction(null)} wide>
          <p className="text-[11px] text-ink-500">A new session is created and linked to this one. The original is preserved.</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="label">New date<input className="input mt-1" type="date" value={move.date} onChange={(e) => setMove({ ...move, date: e.target.value })} /></label>
            <label className="label">New time<input className="input mt-1" type="time" step="1800" value={move.time} onChange={(e) => setMove({ ...move, time: e.target.value })} /></label>
          </div>
          <div className="mt-2">
            <MovePicker date={move.date} duration={action.s.durationMinutes} stations={stations} value={{ stationId: move.stationId, machineId: move.machineId, time: move.time }} onChange={(v) => setMove((m) => ({ ...m, ...v }))} />
          </div>
          <label className="label mt-3">Reason<input className="input mt-1" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. patient requested another day" /></label>
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setAction(null)}>Close</button>
            <button
              className="btn-primary"
              disabled={reschedule.isPending}
              onClick={() => reschedule.mutate({ id: action.s.id, body: { date: move.date, timeOfDay: move.time, reason: reason || undefined, machineId: move.machineId, stationId: move.stationId } })}
            >
              {reschedule.isPending ? <Spinner className="h-4 w-4 text-white" /> : <History className="h-4 w-4" />} Reschedule
            </button>
          </div>
        </Dialog>
      )}

      {action?.type === 'new' && (
        <Dialog title={`Book a session in ${stations.find((s) => s.id === action.station)?.code || 'the bay'}`} onClose={() => setAction(null)}>
          <p className="text-[11px] text-ink-500">Use the scheduling screen for the full form, or pick a patient and create a single booking directly into this bay.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/dialysis/schedule" className="btn-primary text-xs"><CalendarDays className="h-3.5 w-3.5" /> Open the booking screen</Link>
            <Link to="/dialysis/patients" className="btn-secondary text-xs">Choose a patient first</Link>
          </div>
          <div className="mt-3 rounded-lg bg-ink-50 p-2.5 text-[11px] text-ink-600">
            Bay: <strong>{stations.find((s) => s.id === action.station)?.code}</strong> at <strong>{action.time}</strong> on <strong>{move.date}</strong>
          </div>
        </Dialog>
      )}
    </MotionPage>
  );
}

const Dialog = ({ title, children, onClose, wide }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <div className={cn('card w-full p-5', wide ? 'max-w-3xl' : 'max-w-md')}>
      <div className="mb-2 flex items-start justify-between">
        <h3 className="text-sm font-bold text-ink-900">{title}</h3>
        <button onClick={onClose} className="text-ink-400"><X className="h-4 w-4" /></button>
      </div>
      {children}
    </div>
  </div>
);

const SessionCard = ({ s, onOpen, onAssign, onMove, onCancel, onConfirm }) => {
  const live = LIVE_STATUSES.includes(s.status);
  const desk = DESK_STATUSES.includes(s.status);
  return (
    <div className={cn('rounded-lg border p-1.5 text-left ring-1 ring-inset transition', STATUS_STYLE[s.status] || STATUS_STYLE.SCHEDULED, live && 'shadow-sm')}>
      <button className="block w-full text-left" onClick={onOpen}>
        <div className="flex items-center justify-between gap-1">
          <span className="font-mono text-[10px] font-bold">{s.sessionNumber}</span>
          <span className="text-[9px] font-semibold uppercase tracking-wide">{String(s.status).replace(/_/g, ' ')}</span>
        </div>
        <div className="mt-0.5 truncate text-[11px] font-semibold">{s.patient}</div>
        <div className="truncate text-[9px] opacity-80">{s.dialysisNumber || '—'} · {s.uhid}</div>
        <div className="truncate text-[9px] opacity-80">{s.doctor || 'no doctor'}{s.machineCode ? ` · ${s.machineCode}` : ''}</div>
        {s.priority !== 'ROUTINE' && <div className="mt-0.5 text-[9px] font-bold">{s.priority}</div>}
      </button>
      {desk && (
        <div className="mt-1 flex flex-wrap gap-1">
          {s.status !== 'CONFIRMED' && <button title="Confirm" className="rounded bg-white/70 px-1 py-0.5 text-[9px] font-bold hover:bg-white" onClick={onConfirm}>OK</button>}
          <button title="Assign / reassign bay" className="rounded bg-white/70 px-1 py-0.5 text-[9px] font-bold hover:bg-white" onClick={onAssign}>Bay</button>
          <button title="Reschedule" className="rounded bg-white/70 px-1 py-0.5 text-[9px] font-bold hover:bg-white" onClick={onMove}>Move</button>
          <button title="Cancel" className="rounded bg-rose-200/70 px-1 py-0.5 text-[9px] font-bold text-rose-800 hover:bg-rose-200" onClick={onCancel}>X</button>
        </div>
      )}
    </div>
  );
};

const AssignDialog = ({ session, stations, onClose, onSave, saving }) => {
  const [pick, setPick] = useState({ stationId: session.stationCode ? stations.find((s) => s.code === session.stationCode)?.id : undefined, machineId: undefined });
  const [doctorId, setDoctorId] = useState('');
  const [nurseId, setNurseId] = useState('');
  return (
    <Dialog title={`Assign ${session.sessionNumber}`} onClose={onClose}>
      <p className="text-[11px] text-ink-500">{session.patient} · {session.timeOfDay} · currently {session.stationCode || 'no bay'} / {session.machineCode || 'no machine'}.</p>
      <label className="label mt-3">Bay
        <select className="select mt-1" value={pick.stationId || ''} onChange={(e) => {
          const st = stations.find((s) => s.id === e.target.value);
          setPick({ stationId: e.target.value, machineId: st?.machineId || undefined });
        }}
        >
          <option value="">— release the bay —</option>
          {stations.map((s) => (
            <option key={s.id} value={s.id} disabled={s.status !== 'AVAILABLE'}>
              {s.code} · {s.machineCode || 'no machine'} · {s.status}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <label className="label">Doctor id<input className="input mt-1" value={doctorId} onChange={(e) => setDoctorId(e.target.value)} placeholder="leave blank to keep" /></label>
        <label className="label">Nurse id<input className="input mt-1" value={nurseId} onChange={(e) => setNurseId(e.target.value)} placeholder="leave blank to keep" /></label>
      </div>
      <p className="mt-2 text-[10px] text-ink-400">The server rejects any assignment that would double-book the bay, the machine or the patient.</p>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Close</button>
        <button
          className="btn-primary"
          disabled={saving}
          onClick={() => onSave({ stationId: pick.stationId || null, machineId: pick.machineId || null, doctorId: doctorId || undefined, nurseId: nurseId || undefined })}
        >
          {saving ? <Spinner className="h-4 w-4 text-white" /> : <UserCheck className="h-4 w-4" />} Save assignment
        </button>
      </div>
    </Dialog>
  );
};

const MovePicker = ({ date, duration, stations, value, onChange }) => {
  const board = useQuery({
    queryKey: ['dialysis-slot-board', date],
    queryFn: async () => (await api.get('/dialysis/slots', { params: { date } })).data.data,
  });
  const step = board.data?.config?.slotMinutes || 60;
  const need = Math.max(1, Math.ceil((duration || 240) / step));
  const rows = board.data?.grid || [];
  const free = useMemo(() => stations.map((st) => {
    const freeFor = (i) => {
      for (let j = i; j < i + need; j += 1) {
        if (!rows[j]) return 0;
        if (rows[j].cells.find((c) => c.stationId === st.id)?.session) return j - i;
      }
      return need;
    };
    const all = rows.map((_, i) => freeFor(i));
    return { station: st, all, longest: Math.max(0, ...all), runnable: bayRunnable(st) };
  }), [stations, rows, need]);

  return (
    <div className="rounded-xl bg-ink-50 p-3">
      <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-ink-500">
        <span>Pick a free cell</span>
        <span className="font-normal normal-case tracking-normal text-ink-500">{need} row(s) needed</span>
      </div>
      <div className="space-y-1.5">
        {free.map(({ station, all, longest, runnable }) => (
          <div key={station.id} className="flex flex-wrap items-center gap-1.5">
            <span className="w-20 rounded bg-white px-1.5 py-0.5 text-center text-[10px] font-bold text-ink-700">{station.code}</span>
            <div className="flex flex-1 flex-wrap gap-0.5">
              {rows.map((r, i) => {
                const fits = runnable && all[i] >= need;
                const selected = value.stationId === station.id && value.time === r.time;
                return (
                  <button
                    key={r.time}
                    type="button"
                    disabled={!fits}
                    title={!runnable ? `Machine ${station.machineCode || 'not installed'} is ${String(station.machineStatus || 'unavailable').toLowerCase()}` : undefined}
                    onClick={() => onChange({ time: r.time, stationId: station.id, machineId: station.machineId || undefined })}
                    className={cn(
                      'rounded px-1 py-0.5 text-[9px] font-semibold ring-1 ring-inset',
                      !fits && 'cursor-not-allowed bg-ink-100 text-ink-400 ring-ink-200',
                      fits && !selected && 'bg-white text-ink-600 ring-ink-200 hover:bg-brand-50',
                      fits && selected && 'bg-brand-600 text-white ring-brand-600',
                    )}
                  >
                    {r.time}
                  </button>
                );
              })}
            </div>
            {!runnable
              ? <span className="text-[9px] font-semibold text-rose-700">{station.machineCode || 'no machine'} {String(station.machineStatus || '').toLowerCase()}</span>
              : longest < need && <span className="text-[9px] font-semibold text-amber-700">max {longest}h</span>}
          </div>
        ))}
        {board.isLoading && <p className="text-[11px] text-ink-400">Loading that day&apos;s board…</p>}
      </div>
    </div>
  );
};
