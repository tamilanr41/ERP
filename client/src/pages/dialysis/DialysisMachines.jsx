import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Activity, BedDouble, CalendarClock, CheckCircle2, ClipboardList, Droplets, Gauge, History,
  Pencil, Plus, Power, Settings2, Sparkles, Trash2, Wrench, X,
} from 'lucide-react';
import api, { apiError } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import { LoadingState, ErrorState, EmptyState, Spinner } from '../../components/ui/Feedback';
import { MotionPage, MotionStagger, MotionItem } from '../../components/ui/Motion';
import { formatDate, cn } from '../../lib/utils';
import { POLL } from '../../lib/polling';
import { useIpdRealtime } from '../../lib/useIpdRealtime';

const MACHINE_STATUSES = ['AVAILABLE', 'RESERVED', 'CLEANING', 'MAINTENANCE', 'BLOCKED', 'DECOMMISSIONED'];

const MACHINE_STYLE = {
  IN_USE: 'border-rose-400 bg-rose-50 text-rose-700',
  AVAILABLE: 'border-emerald-400 bg-emerald-50 text-emerald-700',
  CLEANING: 'border-cyan-400 bg-cyan-50 text-cyan-700',
  MAINTENANCE: 'border-amber-400 bg-amber-50 text-amber-700',
  BLOCKED: 'border-ink-300 bg-ink-100 text-ink-500',
  RESERVED: 'border-blue-400 bg-blue-50 text-blue-700',
  DECOMMISSIONED: 'border-ink-200 bg-ink-50 text-ink-400',
};

const MACHINE_TYPES = ['HEMODIALYSIS', 'CRRT', 'HDF', 'PERITONEAL', 'MOBILE'];
const STATION_KINDS = ['CHAIR', 'BED', 'STATION'];
const STATION_STATUSES = ['AVAILABLE', 'RESERVED', 'CLEANING', 'MAINTENANCE', 'BLOCKED'];
// Statuses that take a machine out of service, so the nurse has to say why.
const NEEDS_REASON = ['MAINTENANCE', 'BLOCKED', 'DECOMMISSIONED', 'OUT_OF_SERVICE'];
const SERVICE_TYPES = ['INSTALLATION', 'PREVENTIVE', 'REPAIR', 'CALIBRATION', 'SOFTWARE_UPGRADE', 'DEEP_CLEAN', 'DECOMMISSION'];

const Panel = ({ title, icon: Icon, right, children }) => (
  <section className="card p-3.5">
    <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink-900">
        {Icon && <Icon className="h-4 w-4 text-brand-600" />} {title}
      </h2>
      {right}
    </div>
    {children}
  </section>
);

const Modal = ({ title, icon: Icon, onClose, children, wide }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4">
    <div className={cn('card w-full p-5', wide ? 'max-w-3xl' : 'max-w-lg')}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-ink-900">
          {Icon && <Icon className="h-4 w-4 text-brand-600" />} {title}
        </h3>
        <button className="text-ink-400 hover:text-ink-700" onClick={onClose}><X className="h-4 w-4" /></button>
      </div>
      {children}
    </div>
  </div>
);


/**
 * Every action that takes a machine or a bay out of service asks for a reason
 * first, and says up front what the consequence is. A one-click toggle would
 * let a unit disappear from the bookable roster with no explanation.
 */
const ReasonDialog = ({ title, icon, note, confirmLabel, pending, onCancel, onConfirm, checkbox }) => {
  const [reason, setReason] = useState('');
  const [tick, setTick] = useState(false);
  const ok = reason.trim().length >= 3;
  return (
    <Modal title={title} icon={icon} onClose={onCancel}>
      {note && <p className="mb-3 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">{note}</p>}
      <label className="label">Reason
        <textarea
          className="input mt-1" rows={2} autoFocus value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why is this happening?"
        />
      </label>
      {checkbox && (
        <label className="mt-2 flex items-center gap-2 text-[11px] text-ink-700">
          <input type="checkbox" checked={tick} onChange={(e) => setTick(e.target.checked)} />
          {checkbox.label}
        </label>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onCancel} disabled={pending}>Cancel</button>
        <button
          className="btn-primary" disabled={!ok || pending}
          onClick={() => onConfirm(reason.trim(), tick)}
        >
          {pending ? <Spinner className="h-4 w-4 text-white" /> : null} {confirmLabel}
        </button>
      </div>
    </Modal>
  );
};

export default function DialysisMachines() {
  const qc = useQueryClient();
  useIpdRealtime();
  const [showMachine, setShowMachine] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', machineType: 'HEMODIALYSIS', manufacturer: '', model: '', serialNumber: '', maxBloodFlow: 300, stationId: '' });
  const [showStation, setShowStation] = useState(false);
  const [sForm, setSForm] = useState({ code: '', name: '', area: 'Dialysis Unit', machineId: '' });
  const [q, setQ] = useState('');
  // spec 11 — engineering register: which unit needs service, and what was done to it
  const [serviceFor, setServiceFor] = useState(null);
  const [logForm, setLogForm] = useState({ type: 'PREVENTIVE', details: '', performedOn: '', nextServiceDue: '' });
  const [editMachine, setEditMachine] = useState(null);
  // a status change or a retirement that has to be justified
  const [reasonFor, setReasonFor] = useState(null);
  const [stationAction, setStationAction] = useState(null);

  const machines = useQuery({
    queryKey: ['dialysis-machines'],
    queryFn: async () => (await api.get('/dialysis/machines')).data.data,
    refetchInterval: POLL.ACTIVE,
  });
  const stations = useQuery({
    queryKey: ['dialysis-stations'],
    queryFn: async () => (await api.get('/dialysis/stations')).data.data,
    refetchInterval: POLL.ACTIVE,
  });
  const sessions = useQuery({
    queryKey: ['dialysis-machines-sessions'],
    queryFn: async () => (await api.get('/dialysis/sessions', { params: { limit: 100 } })).data.data,
    refetchInterval: POLL.ACTIVE,
  });
  const serviceDue = useQuery({
    queryKey: ['dialysis-service-due'],
    queryFn: async () => (await api.get('/dialysis/machines/service-due')).data.data,
    refetchInterval: POLL.LONG,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['dialysis-machines'] });
    qc.invalidateQueries({ queryKey: ['dialysis-stations'] });
    qc.invalidateQueries({ queryKey: ['dialysis-command-center'] });
    qc.invalidateQueries({ queryKey: ['dialysis-service-due'] });
  };

  const setStatus = useMutation({
    mutationFn: async ({ id, status, reason }) => (await api.patch(`/dialysis/machines/${id}/status`, { status, reason })).data.data,
    onSuccess: (m) => { toast.success(`${m.code} → ${m.status}`); refresh(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const setStationStatus = useMutation({
    mutationFn: async ({ id, status, reason, cleaningCompleted, machineToAvailable }) => (
      await api.patch(`/dialysis/stations/${id}/status`, { status, reason, cleaningCompleted, machineToAvailable })
    ).data.data,
    onSuccess: (s) => { toast.success(`${s.code} → ${s.status}`); refresh(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const saveMachine = useMutation({
    mutationFn: async () => (await api.post('/dialysis/machines', { ...form, stationId: form.stationId || undefined, maxBloodFlow: form.maxBloodFlow ? Number(form.maxBloodFlow) : undefined })).data.data,
    onSuccess: (m) => { toast.success(`Machine ${m.code} added`); setShowMachine(false); setForm({ code: '', name: '', machineType: 'HEMODIALYSIS', manufacturer: '', model: '', serialNumber: '', maxBloodFlow: 300, stationId: '' }); refresh(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const updateMachine = useMutation({
    mutationFn: async ({ id, ...rest }) => (await api.post('/dialysis/machines', {
      _id: id, ...rest, stationId: rest.stationId || undefined, maxBloodFlow: rest.maxBloodFlow ? Number(rest.maxBloodFlow) : undefined,
    })).data.data,
    onSuccess: (m) => { toast.success(`Machine ${m.code} updated`); setEditMachine(null); refresh(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const retireMachine = useMutation({
    mutationFn: async ({ id, reason }) => (await api.delete(`/dialysis/machines/${id}`, { data: { reason } })).data.data,
    onSuccess: (m) => { toast.success(`${m.code} retired from the roster`, { description: 'Its service history and past sessions are kept for audit.' }); setReasonFor(null); refresh(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const retireStation = useMutation({
    mutationFn: async ({ id, reason }) => (await api.delete(`/dialysis/stations/${id}`, { data: { reason } })).data.data,
    onSuccess: (s) => { toast.success(`Bay ${s.code} retired from the roster`); setStationAction(null); refresh(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const serviceLog = useQuery({
    queryKey: ['dialysis-machine-service', serviceFor?._id],
    queryFn: async () => (await api.get(`/dialysis/machines/${serviceFor._id}/service`)).data.data,
    enabled: Boolean(serviceFor),
  });

  const recordService = useMutation({
    mutationFn: async () => (await api.post(`/dialysis/machines/${serviceFor._id}/service`, {
      type: logForm.type,
      details: logForm.details || undefined,
      performedOn: logForm.performedOn || undefined,
      nextServiceDue: logForm.nextServiceDue || undefined,
    })).data.data,
    onSuccess: () => {
      toast.success('Service entry recorded', { description: 'The maintenance clock has been moved.' });
      setLogForm({ type: 'PREVENTIVE', details: '', performedOn: '', nextServiceDue: '' });
      serviceLog.refetch();
      refresh();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const saveStation = useMutation({
    mutationFn: async () => (await api.post('/dialysis/stations', { ...sForm, machineId: sForm.machineId || undefined })).data.data,
    onSuccess: (s) => { toast.success(`Station ${s.code} added`); setShowStation(false); setSForm({ code: '', name: '', area: 'Dialysis Unit', machineId: '' }); refresh(); },
    onError: (e) => toast.error(apiError(e)),
  });


  if (machines.isLoading || stations.isLoading) return <LoadingState label="Loading machines and stations…" />;
  if (machines.error) return <ErrorState message={apiError(machines.error)} />;

  const m = machines.data || [];
  const st = stations.data || [];
  const running = (sessions.data || []).filter((x) => ['CONNECTED', 'IN_PROGRESS'].includes(x.status));
  const byMachine = running.reduce((acc, x) => ({ ...acc, [x.machineId?._id]: x }), {});
  const filtered = m.filter((x) => !q || x.code.toLowerCase().includes(q.toLowerCase()) || (x.name || '').toLowerCase().includes(q.toLowerCase()));
  const count = (list, key) => list.filter((x) => x.status === key).length;
  const due = serviceDue.data;

  return (
    <MotionPage className="p-5 space-y-4">
      <PageHeader
        title="Machines & Stations"
        subtitle="Live dialysis machine status, bay allocation and housekeeping turnover"
        actions={(
          <div className="flex flex-wrap gap-2">
            <input className="input h-8 w-40 py-1 text-xs" placeholder="Filter machines…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn-secondary text-xs" onClick={() => setShowStation((v) => !v)}><BedDouble className="h-3.5 w-3.5" /> Add station</button>
            <button className="btn-primary text-xs" onClick={() => setShowMachine((v) => !v)}><Plus className="h-3.5 w-3.5" /> Add machine</button>
          </div>
        )}
      />

      {/* ---------- KPI ---------- */}
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-7">
        {[
          ['Machines', m.length], ['In use', count(m, 'IN_USE')], ['Available', count(m, 'AVAILABLE')],
          ['Cleaning', count(m, 'CLEANING')], ['Maintenance', count(m, 'MAINTENANCE')], ['Blocked', count(m, 'BLOCKED')],
          ['Bays', st.length],
        ].map(([l, v]) => (
          <div key={l} className="card p-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">{l}</div>
            <div className="text-lg font-bold tabular-nums text-ink-900">{v}</div>
          </div>
        ))}
      </div>


      {showMachine && (
        <Panel title="Register a new dialysis machine" icon={Plus} right={<button className="btn-ghost text-xs" onClick={() => setShowMachine(false)}>Close</button>}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Code', 'code', 'text'], ['Name', 'name', 'text'], ['Type', 'machineType', 'select'],
              ['Manufacturer', 'manufacturer', 'text'], ['Model', 'model', 'text'], ['Serial number', 'serialNumber', 'text'],
              ['Max blood flow (ml/min)', 'maxBloodFlow', 'number'], ['Install in bay', 'stationId', 'station'],
            ].map(([label, key, kind]) => (
              <label key={key} className="label">
                {label}
                {kind === 'select' ? (
                  <select className="select mt-1" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}>
                    {MACHINE_TYPES.map((x) => <option key={x}>{x}</option>)}
                  </select>
                ) : kind === 'station' ? (
                  <select className="select mt-1" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}>
                    <option value="">—</option>
                    {st.map((x) => <option key={x._id} value={x._id}>{x.code} · {x.area}</option>)}
                  </select>
                ) : (
                  <input className="input mt-1" type={kind} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
                )}
              </label>
            ))}
          </div>
          <button className="btn-primary mt-3" disabled={saveMachine.isPending || !form.code} onClick={() => saveMachine.mutate()}>
            {saveMachine.isPending ? <Spinner className="h-4 w-4 text-white" /> : <Plus className="h-4 w-4" />} Add machine
          </button>
        </Panel>
      )}

      {showStation && (
        <Panel title="Add a dialysis bay / station" icon={BedDouble} right={<button className="btn-ghost text-xs" onClick={() => setShowStation(false)}>Close</button>}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="label">Code<input className="input mt-1" value={sForm.code} onChange={(e) => setSForm({ ...sForm, code: e.target.value })} placeholder="BAY-09" /></label>
            <label className="label">Name<input className="input mt-1" value={sForm.name} onChange={(e) => setSForm({ ...sForm, name: e.target.value })} placeholder="Bay 9" /></label>
            <label className="label">Area<input className="input mt-1" value={sForm.area} onChange={(e) => setSForm({ ...sForm, area: e.target.value })} /></label>
            <label className="label">Type
              <select className="select mt-1" value={sForm.bedOrChair || 'CHAIR'} onChange={(e) => setSForm({ ...sForm, bedOrChair: e.target.value })}>
                {STATION_KINDS.map((k) => <option key={k}>{k}</option>)}
              </select>
            </label>
            <label className="label">Machine
              <select className="select mt-1" value={sForm.machineId} onChange={(e) => setSForm({ ...sForm, machineId: e.target.value })}>
                <option value="">—</option>
                {m.map((x) => <option key={x._id} value={x._id}>{x.code}</option>)}
              </select>
            </label>
          </div>
          <button className="btn-primary mt-3" disabled={saveStation.isPending || !sForm.code} onClick={() => saveStation.mutate()}>
            {saveStation.isPending ? <Spinner className="h-4 w-4 text-white" /> : <BedDouble className="h-4 w-4" />} Add station
          </button>
        </Panel>
      )}

      {/* ---------- MACHINE GRID ---------- */}
      <Panel
        title="Machine board"
        icon={Wrench}
        right={<span className="text-[11px] text-ink-500">Click a machine to change its status · a machine running a session is locked</span>}
      >
        <MotionStagger className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((x) => {
            const live = byMachine[x._id];
            return (
              <MotionItem key={x._id}>
                <div className={cn('rounded-xl border p-2.5', MACHINE_STYLE[x.status] || MACHINE_STYLE.AVAILABLE)}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold">{x.code}</span>
                    <span className="text-[9px] font-bold uppercase tracking-wider opacity-80">{x.status}</span>
                  </div>
                  <div className="mt-0.5 text-[10px] opacity-80">{x.name || x.machineType}</div>
                  <div className="mt-1 text-[10px] opacity-80">
                    {x.stationId ? `Bay ${x.stationId.code}` : 'No bay'} · {x.totalSessions || 0} sessions · {Math.round(x.totalDialysisHours || 0)} h
                  </div>
                  {x.statusReason && <div className="mt-0.5 text-[10px] font-semibold">{x.statusReason}</div>}
                  {x.nextServiceDue && (
                    <div className={cn('mt-0.5 text-[10px]', new Date(x.nextServiceDue) < new Date() ? 'font-bold' : '')}>
                      Service due {formatDate(x.nextServiceDue)}
                    </div>
                  )}

                  {live ? (
                    <Link to={`/dialysis/session/${live._id}`} className="mt-2 flex items-center justify-between rounded-lg bg-white/70 px-2 py-1 text-[10px] font-semibold hover:bg-white">
                      <span className="truncate">{live.patientId?.firstName} {live.patientId?.lastName}</span>
                      <Activity className="h-3 w-3 shrink-0" />
                    </Link>
                  ) : x.status === 'IN_USE' ? (
                    <div className="mt-2 rounded-lg bg-white/70 px-2 py-1 text-[10px] font-semibold">Session in progress</div>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {MACHINE_STATUSES.filter((stt) => stt !== x.status).map((stt) => (
                        <button
                          key={stt}
                          disabled={setStatus.isPending}
                          onClick={() => {
                            // Taking a unit out of service is a clinical-safety
                            // decision, so it cannot be a one-click toggle.
                            if (NEEDS_REASON.includes(stt)) setReasonFor({ kind: 'machine', machine: x, status: stt });
                            else setStatus.mutate({ id: x._id, status: stt, reason: `Set from machine board` });
                          }}
                          className="rounded bg-white/70 px-1.5 py-0.5 text-[9px] font-bold hover:bg-white disabled:opacity-50"
                        >
                          {stt === 'AVAILABLE' ? 'Free' : stt === 'CLEANING' ? 'To cleaning' : stt.charAt(0) + stt.slice(1).toLowerCase()}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* the engineering register is part of machine management, not a paper trail */}
                  <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-white/50 pt-1.5">
                    <button className="inline-flex items-center gap-1 rounded bg-white/70 px-1.5 py-0.5 text-[9px] font-bold hover:bg-white" onClick={() => setServiceFor(x)}>
                      <History className="h-2.5 w-2.5" /> Service log
                    </button>
                    <button className="inline-flex items-center gap-1 rounded bg-white/70 px-1.5 py-0.5 text-[9px] font-bold hover:bg-white" onClick={() => setEditMachine({ ...x, stationId: x.stationId?._id || x.stationId?.id || '', serviceIntervalDays: x.serviceIntervalDays || '' })}>
                      <Pencil className="h-2.5 w-2.5" /> Edit
                    </button>
                    <button
                      className="inline-flex items-center gap-1 rounded bg-white/70 px-1.5 py-0.5 text-[9px] font-bold text-rose-700 hover:bg-white"
                      onClick={() => setReasonFor({ kind: 'retire-machine', machine: x })}
                    >
                      <Power className="h-2.5 w-2.5" /> Retire
                    </button>
                  </div>
                </div>
              </MotionItem>
            );
          })}
          {!filtered.length && <EmptyState title="No machines match" hint="Register a machine to get started" />}
        </MotionStagger>
      </Panel>

      {/* ---------- STATIONS ---------- */}
      <Panel
        title="Stations / bays"
        icon={BedDouble}
        right={`${st.length} bay(s) · turnover is a recorded state change`}
      >
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {st.map((x) => {
            const occupied = x.status === 'OCCUPIED' || Boolean(x.currentSessionId);
            return (
              <div key={x._id} className={cn('rounded-xl border p-2.5', MACHINE_STYLE[x.status === 'OCCUPIED' ? 'IN_USE' : x.status] || 'border-ink-200 bg-ink-50 text-ink-600')}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">{x.code}</span>
                  <span className="text-[9px] font-bold uppercase tracking-wider opacity-80">{x.status}</span>
                </div>
                <div className="mt-0.5 text-[10px] opacity-80">{x.name || x.area} · {x.bedOrChair || 'CHAIR'}</div>
                <div className="mt-1 text-[10px] opacity-80">
                  {x.machineId ? `Machine ${x.machineId.code} · ${x.machineId.status}` : 'No machine installed'}
                </div>
                {x.statusReason && <div className="mt-0.5 text-[10px] font-semibold">{x.statusReason}</div>}
                {x.currentSessionId && (
                  <Link to={`/dialysis/session/${x.currentSessionId._id || x.currentSessionId}`} className="mt-2 block rounded-lg bg-white/70 px-2 py-1 text-[10px] font-semibold hover:bg-white">
                    {x.currentSessionId.sessionNumber || 'Open session'}
                  </Link>
                )}
                {x.lastTurnoverAt && <div className="mt-1 text-[10px] opacity-70">Turnover {formatDate(x.lastTurnoverAt)}</div>}

                {!occupied && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {STATION_STATUSES.filter((s) => s !== x.status).map((s) => (
                      <button
                        key={s}
                        disabled={setStationStatus.isPending}
                        onClick={() => {
                          if (s === 'AVAILABLE') {
                            setStationAction({ kind: 'turnover', station: x });
                          } else {
                            setStationAction({ kind: 'status', station: x, status: s });
                          }
                        }}
                        className="rounded bg-white/70 px-1.5 py-0.5 text-[9px] font-bold hover:bg-white disabled:opacity-50"
                      >
                        {s === 'AVAILABLE' ? 'Sign off' : s === 'CLEANING' ? 'To cleaning' : s.charAt(0) + s.slice(1).toLowerCase()}
                      </button>
                    ))}
                    <button
                      className="rounded bg-white/70 px-1.5 py-0.5 text-[9px] font-bold text-rose-700 hover:bg-white"
                      onClick={() => setStationAction({ kind: 'retire', station: x })}
                    >
                      Retire
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {!st.length && <EmptyState title="No stations yet" hint="Add a bay to start allocating machines" />}
        </div>
      </Panel>

      {/* ---------- SERVICE / ENGINEERING REGISTER ---------- */}
      <Panel
        title="Maintenance & service due"
        icon={CalendarClock}
        right={due ? (
          <span className="text-[11px] text-ink-500">
            {due.overdue} overdue · {due.due?.length || 0} due within {due.warningWindowDays} days · {due.neverServiced?.length || 0} never serviced
          </span>
        ) : null}
      >
        {!due ? <LoadingState label="Loading the engineering register…" /> : (
          <div className="grid gap-3 lg:grid-cols-3">
            <div>
              <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-500">Service due / overdue</h3>
              {!due.due?.length ? <p className="text-[11px] text-ink-500">Nothing falls due in this window.</p> : (
                <div className="space-y-1.5">
                  {due.due.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setServiceFor(m.find((x) => x._id === d.id) || d)}
                      className={cn('flex w-full items-center justify-between rounded-lg border px-2 py-1.5 text-left text-[11px] hover:bg-ink-50',
                        d.overdue ? 'border-rose-300 bg-rose-50' : 'border-amber-300 bg-amber-50')}
                    >
                      <span className="font-bold text-ink-900">{d.code}</span>
                      <span className="text-ink-600">
                        {d.overdue ? `${Math.abs(d.daysUntilDue)} d overdue` : `in ${d.daysUntilDue} d`}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-500">Never serviced</h3>
              {!due.neverServiced?.length ? <p className="text-[11px] text-ink-500">Every machine has a service record.</p> : (
                <div className="space-y-1.5">
                  {due.neverServiced.map((d) => (
                    <div key={d.id} className="flex items-center justify-between rounded-lg border border-ink-200 px-2 py-1.5 text-[11px]">
                      <span className="font-bold text-ink-900">{d.code}</span>
                      <span className="text-ink-500">{d.installedOn ? `installed ${formatDate(d.installedOn)}` : 'no install date'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-500">Out of service</h3>
              {!due.unavailable?.length ? <p className="text-[11px] text-ink-500">The whole fleet is in service.</p> : (
                <div className="space-y-1.5">
                  {due.unavailable.map((d) => (
                    <div key={d.id} className="rounded-lg border border-ink-200 px-2 py-1.5 text-[11px]">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-ink-900">{d.code}</span>
                        <span className="text-[9px] font-bold uppercase tracking-wider text-ink-500">{d.status}</span>
                      </div>
                      {d.reason && <div className="text-ink-600">{d.reason}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Panel>

      {/* ---------- RUNNING SESSIONS ---------- */}
      <Panel title="Sessions running right now" icon={Droplets} right={`${running.length} active`}>
        {!running.length ? <EmptyState title="No session is running" hint="Running sessions appear here with a direct link" /> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Session</th><th>Patient</th><th>Machine</th><th>Bay</th><th>Nurse</th><th>Started</th><th>Status</th><th /></tr></thead>
              <tbody>
                {running.map((x) => (
                  <tr key={x._id}>
                    <td className="font-mono text-[11px] font-semibold text-brand-700">{x.sessionNumber}</td>
                    <td className="text-xs text-ink-900">{x.patientId?.firstName} {x.patientId?.lastName}<div className="text-[10px] text-ink-500">{x.patientId?.uhid}</div></td>
                    <td className="text-[11px]">{x.machineId?.code || '—'}</td>
                    <td className="text-[11px]">{x.stationId?.code || '—'}</td>
                    <td className="text-[11px]">{x.nurseId?.name || '—'}</td>
                    <td className="text-[11px]">{x.startedAt ? formatDate(x.startedAt) : '—'}</td>
                    <td><span className="badge bg-rose-50 text-rose-700 ring-1 ring-rose-200">{String(x.status).replace(/_/g, ' ')}</span></td>
                    <td><Link className="btn-secondary px-2 py-1 text-[11px]" to={`/dialysis/session/${x._id}`}>Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Housekeeping & availability" icon={Sparkles} hint="Turnover is a real state change — releasing a machine also frees its bay">
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-secondary text-xs"
            disabled={setStatus.isPending}
            onClick={() => {
              const cleaning = m.filter((x) => x.status === 'CLEANING');
              cleaning.forEach((x) => setStatus.mutate({ id: x._id, status: 'AVAILABLE', reason: 'Housekeeping turnover complete' }));
              if (!cleaning.length) toast.info('No machine is in cleaning right now');
            }}
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Release all cleaning machines
          </button>
          <button
            className="btn-secondary text-xs"
            disabled={setStatus.isPending}
            onClick={() => {
              const idle = m.filter((x) => x.status === 'MAINTENANCE');
              idle.forEach((x) => setStatus.mutate({ id: x._id, status: 'AVAILABLE', reason: 'Servicing complete' }));
              if (!idle.length) toast.info('No machine is under maintenance right now');
            }}
          >
            <Gauge className="h-3.5 w-3.5" /> Bring serviced machines back
          </button>
          <Link to="/dialysis" className="btn-secondary text-xs"><Settings2 className="h-3.5 w-3.5" /> Command center</Link>
        </div>
      </Panel>

      {/* ---------- SERVICE LOG ---------- */}
      {serviceFor && (
        <Modal title={`Service log — ${serviceFor.code}`} icon={ClipboardList} onClose={() => setServiceFor(null)} wide>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-500">Record an intervention</h4>
              <div className="space-y-2">
                <label className="label">Type
                  <select className="select mt-1" value={logForm.type} onChange={(e) => setLogForm({ ...logForm, type: e.target.value })}>
                    {SERVICE_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </label>
                <label className="label">Details
                  <textarea
                    className="input mt-1" rows={2} value={logForm.details}
                    onChange={(e) => setLogForm({ ...logForm, details: e.target.value })}
                    placeholder="What was done, and what was found"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="label">Performed on
                    <input type="date" className="input mt-1" value={logForm.performedOn} onChange={(e) => setLogForm({ ...logForm, performedOn: e.target.value })} />
                  </label>
                  <label className="label">Next due
                    <input type="date" className="input mt-1" value={logForm.nextServiceDue} onChange={(e) => setLogForm({ ...logForm, nextServiceDue: e.target.value })} />
                  </label>
                </div>
                <button className="btn-primary w-full" disabled={recordService.isPending} onClick={() => recordService.mutate()}>
                  {recordService.isPending ? <Spinner className="h-4 w-4 text-white" /> : <Plus className="h-4 w-4" />} Record service
                </button>
                <p className="text-[10px] text-ink-500">
                  Leave “next due” empty to use the machine&rsquo;s configured service interval.
                </p>
              </div>
            </div>

            <div>
              <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-500">History</h4>
              {serviceLog.isLoading ? <LoadingState label="Loading service history…" /> : !serviceLog.data?.serviceHistory?.length ? (
                <EmptyState title="No service recorded yet" hint="This unit has never been logged" />
              ) : (
                <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                  {serviceLog.data.serviceHistory.map((h, i) => (
                    <div key={h._id || i} className="rounded-lg border border-ink-200 px-2 py-1.5 text-[11px]">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-ink-900">{h.type}</span>
                        <span className="text-ink-500">{formatDate(h.performedOn || h.performedAt)}</span>
                      </div>
                      {h.details && <div className="text-ink-600">{h.details}</div>}
                      <div className="text-[10px] text-ink-500">
                        by {h.performedBy?.name || h.performedByName || '—'}
                        {h.nextServiceDue ? ` · next due ${formatDate(h.nextServiceDue)}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {serviceLog.data?.serviceDue && (
                <div className="mt-2 rounded-lg bg-ink-50 px-2 py-1.5 text-[11px] text-ink-600">
                  Last serviced {serviceLog.data.serviceDue.lastServicedAt ? formatDate(serviceLog.data.serviceDue.lastServicedAt) : 'never'} ·
                  next due {serviceLog.data.serviceDue.nextServiceDue ? formatDate(serviceLog.data.serviceDue.nextServiceDue) : 'not scheduled'}
                  {serviceLog.data.serviceDue.overdue ? ' · OVERDUE' : ''}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* ---------- EDIT MACHINE ---------- */}
      {editMachine && (
        <Modal title={`Edit ${editMachine.code}`} icon={Pencil} onClose={() => setEditMachine(null)} wide>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              ['Name', 'name', 'text'], ['Type', 'machineType', 'machineType'],
              ['Manufacturer', 'manufacturer', 'text'], ['Model', 'model', 'text'],
              ['Serial number', 'serialNumber', 'text'], ['Max blood flow (ml/min)', 'maxBloodFlow', 'number'],
              ['Installed on', 'installedOn', 'date'], ['Warranty ends on', 'warrantyEndsOn', 'date'],
              ['Service interval (days)', 'serviceIntervalDays', 'number'], ['Install in bay', 'stationId', 'station'],
            ].map(([label, key, kind]) => (
              <label key={key} className="label">
                {label}
                {kind === 'machineType' ? (
                  <select className="select mt-1" value={editMachine[key] || ''} onChange={(e) => setEditMachine({ ...editMachine, [key]: e.target.value })}>
                    {MACHINE_TYPES.map((x) => <option key={x}>{x}</option>)}
                  </select>
                ) : kind === 'station' ? (
                  <select className="select mt-1" value={editMachine[key] || ''} onChange={(e) => setEditMachine({ ...editMachine, [key]: e.target.value })}>
                    <option value="">—</option>
                    {st.map((x) => <option key={x._id} value={x._id}>{x.code} · {x.area}</option>)}
                  </select>
                ) : (
                  <input
                    className="input mt-1" type={kind}
                    value={kind === 'date' ? (editMachine[key] ? String(editMachine[key]).slice(0, 10) : '') : (editMachine[key] ?? '')}
                    onChange={(e) => setEditMachine({ ...editMachine, [key]: e.target.value })}
                  />
                )}
              </label>
            ))}
          </div>
          <button className="btn-primary mt-3" disabled={updateMachine.isPending} onClick={() => updateMachine.mutate({ id: editMachine._id, ...editMachine })}>
            {updateMachine.isPending ? <Spinner className="h-4 w-4 text-white" /> : <Pencil className="h-4 w-4" />} Save changes
          </button>
        </Modal>
      )}

      {/* ---------- REASON-GATED MACHINE ACTIONS ---------- */}
      {reasonFor && (
        <ReasonDialog
          title={reasonFor.kind === 'retire-machine'
            ? `Retire ${reasonFor.machine.code} from the roster`
            : `Move ${reasonFor.machine.code} to ${reasonFor.status.replace(/_/g, ' ').toLowerCase()}`}
          icon={reasonFor.kind === 'retire-machine' ? Trash2 : Wrench}
          note={reasonFor.kind === 'retire-machine'
            ? 'The machine stops being bookable. Its service history and every session it ran are kept for audit.'
            : 'Taking a unit out of service is a clinical-safety decision, so it is recorded with your name against it.'}
          confirmLabel={reasonFor.kind === 'retire-machine' ? 'Retire machine' : 'Confirm status'}
          pending={reasonFor.kind === 'retire-machine' ? retireMachine.isPending : setStatus.isPending}
          onCancel={() => setReasonFor(null)}
          onConfirm={(reason) => {
            if (reasonFor.kind === 'retire-machine') retireMachine.mutate({ id: reasonFor.machine._id, reason });
            else setStatus.mutate({ id: reasonFor.machine._id, status: reasonFor.status, reason });
          }}
        />
      )}

      {/* ---------- STATION ACTIONS ---------- */}
      {stationAction && (
        <ReasonDialog
          title={
            stationAction.kind === 'retire' ? `Retire bay ${stationAction.station.code}`
              : stationAction.kind === 'turnover' ? `Sign off bay ${stationAction.station.code} after turnover`
                : `Move bay ${stationAction.station.code} to ${stationAction.status.replace(/_/g, ' ').toLowerCase()}`
          }
          icon={stationAction.kind === 'turnover' ? Sparkles : BedDouble}
          note={stationAction.kind === 'turnover'
            ? 'Signing the bay off returns it to the bookable roster. Send the installed machine back to service at the same time if housekeeping has finished with it.'
            : stationAction.kind === 'retire'
              ? 'The bay stops being bookable. Machines still installed in it must be moved or retired first.'
              : 'The reason is stored on the bay and shows in the turnover trail.'}
          confirmLabel={stationAction.kind === 'retire' ? 'Retire bay' : stationAction.kind === 'turnover' ? 'Sign off bay' : 'Confirm status'}
          checkbox={stationAction.kind === 'turnover' ? { label: 'The installed machine is clean and back in service too', value: true } : null}
          pending={stationAction.kind === 'retire' ? retireStation.isPending : setStationStatus.isPending}
          onCancel={() => setStationAction(null)}
          onConfirm={(reason, extra) => {
            const s = stationAction.station;
            if (stationAction.kind === 'retire') retireStation.mutate({ id: s._id, reason });
            else if (stationAction.kind === 'turnover') {
              setStationStatus.mutate({ id: s._id, status: 'AVAILABLE', reason, cleaningCompleted: true, machineToAvailable: Boolean(extra) });
            } else setStationStatus.mutate({ id: s._id, status: stationAction.status, reason });
          }}
        />
      )}
    </MotionPage>
  );
}

