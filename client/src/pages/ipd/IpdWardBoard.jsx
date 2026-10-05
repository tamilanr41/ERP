import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Armchair,
  ArrowUpRight,
  Ban,
  BedDouble,
  DoorOpen,
  Sparkles,
  UserPlus,
  Wrench,
} from 'lucide-react';
import api, { apiError } from '../../lib/api';
import { admissionPath } from '../../lib/admissionPath';
import PageHeader from '../../components/ui/PageHeader';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/Feedback';
import { formatDate, formatDateTime, cn } from '../../lib/utils';
import { useIpdRealtime } from '../../lib/useIpdRealtime';
import { POLL } from '../../lib/polling';

const BED_STYLE = {
  OCCUPIED: 'border-rose-300 bg-rose-50 text-rose-700 hover:ring-rose-400',
  AVAILABLE: 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:ring-emerald-400',
  RESERVED: 'border-blue-300 bg-blue-50 text-blue-700 hover:ring-blue-400',
  CLEANING: 'border-ink-200 bg-ink-50 text-ink-600 hover:ring-ink-400',
  MAINTENANCE: 'border-yellow-300 bg-yellow-50 text-yellow-800 hover:ring-yellow-400',
  BLOCKED: 'border-rose-300 bg-rose-50 text-rose-700 hover:ring-rose-400',
};

const STATUS_LABEL = {
  OCCUPIED: 'Occupied', AVAILABLE: 'Free', RESERVED: 'Reserved',
  CLEANING: 'Cleaning', MAINTENANCE: 'Maintenance', BLOCKED: 'Blocked',
};

const BedAction = ({ label, icon, onClick, neutral, danger }) => (
  <button
    onClick={onClick}
    className={cn(
      'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition',
      danger ? 'bg-rose-50 text-rose-700 hover:bg-rose-100' : neutral ? 'bg-ink-50 text-ink-700 hover:bg-ink-100' : 'bg-brand-600 text-white hover:bg-brand-700',
    )}
  >
    {icon} {label}
  </button>
);

function AssignBedModal({ bedTarget, admission, onClose, onDone }) {
  const [reason, setReason] = useState('Bed allocation');
  const assign = useMutation({
    mutationFn: async () => (await api.post(`/ipd/admissions/${admission._id}/assign-bed`, { bedId: bedTarget._id, reason })).data.data,
    onSuccess: () => { toast.success(`Bed ${bedTarget.bedNumber} allocated`); onDone(); },
    onError: (e) => toast.error(apiError(e)),
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="card w-full max-w-md p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-ink-900">Assign bed</h3>
          <button className="btn-ghost px-2 py-1 text-xs" onClick={onClose}>Cancel</button>
        </div>
        <p className="mb-3 text-xs text-ink-600">
          {admission.patientId?.firstName} {admission.patientId?.lastName} ({admission.admissionNumber}) → bed {bedTarget.code || bedTarget.bedNumber}
        </p>
        <label className="label">Reason
          <input className="input mt-1" value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <button className="btn-primary mt-3 w-full" disabled={assign.isPending} onClick={() => assign.mutate()}>
          Confirm assignment
        </button>
      </div>
    </div>
  );
}

export default function IpdWardBoard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [wardId, setWardId] = useState('ALL');
  const [selected, setSelected] = useState(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const { status: liveStatus } = useIpdRealtime();

  const cc = useQuery({
    queryKey: ['ipd-command-center'],
    queryFn: async () => (await api.get('/ipd/command-center')).data.data,
    refetchInterval: POLL.STANDARD,
  });

  const waiting = useQuery({
    queryKey: ['ipd-waiting'],
    queryFn: async () => (await api.get('/ipd/admissions/waiting')).data.data,
    refetchInterval: POLL.STANDARD,
  });

  const turnoverQueue = useQuery({
    queryKey: ['ipd-turnover-queue'],
    queryFn: async () => (await api.get('/ipd/beds/turnover-queue')).data.data,
    refetchInterval: POLL.SLOW,
  });

  const bedsQuery = useQuery({
    queryKey: ['ipd-beds-available'],
    queryFn: async () => (await api.get('/ipd/beds', { params: { limit: 200 } })).data.data,
    refetchInterval: POLL.SLOW,
  });

  const statusM = useMutation({
    mutationFn: async ({ bedId, status, reason }) => (await api.patch(`/ipd/beds/${bedId}/status`, { status, reason })).data.data,
    onSuccess: (bed) => {
      toast.success(`Bed ${bed.bedNumber} is now ${STATUS_LABEL[bed.status] || bed.status}`);
      qc.invalidateQueries({ queryKey: ['ipd-command-center'] });
      setSelected(null);
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const reserveM = useMutation({
    mutationFn: async ({ bedId, reason, admissionId }) => (await api.post(`/ipd/beds/${bedId}/reserve`, { reason, admissionId })).data.data,
    onSuccess: () => { toast.success('Bed reserved'); qc.invalidateQueries({ queryKey: ['ipd-command-center'] }); setSelected(null); },
    onError: (e) => toast.error(apiError(e)),
  });

  const releaseM = useMutation({
    mutationFn: async ({ bedId, reason }) => (await api.post(`/ipd/beds/${bedId}/release`, { reason })).data.data,
    onSuccess: () => { toast.success('Bed released'); qc.invalidateQueries({ queryKey: ['ipd-command-center'] }); setSelected(null); },
    onError: (e) => toast.error(apiError(e)),
  });

  const turnoverM = useMutation({
    mutationFn: async (bedId) => (await api.post(`/ipd/beds/${bedId}/turnover`, { reason: 'Housekeeping completed' })).data.data,
    onSuccess: (bed) => {
      toast.success(`Bed ${bed.bedNumber} cleaned and available`);
      qc.invalidateQueries({ queryKey: ['ipd-command-center'] });
      qc.invalidateQueries({ queryKey: ['ipd-turnover-queue'] });
      setSelected(null);
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const completeTurnover = () => {
    if (!selected) return;
    if (!window.confirm(`Housekeeping completed for bed ${selected.bedNumber}? It becomes AVAILABLE.`)) return;
    turnoverM.mutate(selected._id);
  };

  const changeStatus = (status) => {
    if (!selected) return;
    let reason = '';
    if (status === 'BLOCKED' || status === 'MAINTENANCE') {
      reason = window.prompt(`${status === 'BLOCKED' ? 'Block' : 'Maintenance'} reason for bed ${selected.bedNumber}?`, '');
      if (reason === null) return;
    }
    if (window.confirm(`Set bed ${selected.bedNumber} to ${status}?`)) statusM.mutate({ bedId: selected._id, status, reason });
  };

  const reserve = () => {
    if (!selected) return;
    const reason = window.prompt('Reserve bed for? (e.g. waiting admission, OP case)', '');
    if (reason === null) return;
    reserveM.mutate({ bedId: selected._id, reason });
  };

  const release = () => {
    if (!selected) return;
    if (!window.confirm(`Release bed ${selected.bedNumber}? It becomes available.`)) return;
    const reason = window.prompt('Release reason (optional)', '') || undefined;
    releaseM.mutate({ bedId: selected._id, reason });
  };

  const wards = cc.data?.wards || [];
  const view = wardId === 'ALL' ? wards : wards.filter((w) => String(w._id) === wardId);

  if (cc.isLoading) return <LoadingState label="Loading bed board…" />;
  if (cc.error) return <ErrorState message={apiError(cc.error)} />;

  return (
    <div className="p-6">
      <PageHeader
        title="Ward / Bed Board"
        subtitle="Interactive live map of every bed — tap a bed to act"
        actions={<span className="flex items-center gap-1.5 text-xs text-ink-500">{liveStatus === 'live' ? <><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span> Live</> : <><span className={cn('h-2 w-2 rounded-full', liveStatus === 'reconnecting' ? 'bg-amber-500' : 'bg-ink-400')} /> {liveStatus === 'reconnecting' ? 'Reconnecting' : 'Offline'}</>}</span>}
      />

      <div className="mb-3 flex flex-wrap gap-1.5">
        <button
          onClick={() => setWardId('ALL')}
          className={cn('rounded-lg px-3 py-1.5 text-xs font-semibold transition', wardId === 'ALL' ? 'bg-brand-600 text-white' : 'bg-white text-ink-600 ring-1 ring-inset ring-ink-200 hover:bg-ink-50')}
        >
          All wards
        </button>
        {wards.map((w) => (
          <button
            key={w._id}
            onClick={() => setWardId(String(w._id))}
            className={cn('rounded-lg px-3 py-1.5 text-xs font-semibold transition', wardId === String(w._id) ? 'bg-brand-600 text-white' : 'bg-white text-ink-600 ring-1 ring-inset ring-ink-200 hover:bg-ink-50')}
          >
            {w.name}
          </button>
        ))}
        {!wards.length && <p className="text-xs text-ink-500">No wards — create a ward from Ward Management</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {view.map((w) => (
            <div key={w._id} className="card p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-ink-900">{w.name}</h3>
                  <p className="text-[11px] text-ink-500">{w.wardType} · tariff ₹{w.chargePerDay || 0}/day</p>
                </div>
                <span className="text-xs font-semibold text-ink-500">
                  {w.counts?.occupied || 0}/{w.total} occupied · {w.counts?.available || 0} free
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {(w.beds || []).map((b) => (
                  <button
                    key={b._id}
                    onClick={() => setSelected(b)}
                    className={cn(
                      'rounded-xl border px-2 py-2 text-left text-[11px] font-semibold ring-1 ring-inset transition',
                      BED_STYLE[b.status] || BED_STYLE.AVAILABLE,
                      selected?._id === b._id && 'ring-2',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span>{b.code || b.bedNumber}</span>
                      {b.currentAdmissionId && <BedDouble className="h-3 w-3" />}
                    </div>
                    <div className="mt-0.5 text-[10px] font-normal opacity-80">
                      {b.currentAdmission?.admissionNumber || STATUS_LABEL[b.status]}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <div className="card p-4">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-500">
              Waiting for bed ({waiting.data?.length || 0})
            </h3>
            {(waiting.data || []).length ? (
              <div className="space-y-1.5">
                {waiting.data.map((a) => (
                  <div key={a._id} className="rounded-lg bg-ink-50 px-3 py-2 text-xs">
                    <div className="font-semibold text-ink-900">{a.patientId?.firstName} {a.patientId?.lastName}</div>
                    <div className="font-mono text-[10px] text-ink-500">{a.admissionNumber} · {a.priority || 'ROUTINE'}</div>
                  </div>
                ))}
              </div>
            ) : <EmptyState title="No admissions waiting for a bed." />}
          </div>

          {selected ? (
            <div className="card p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-ink-900">{selected.code || selected.bedNumber}</h3>
                  <p className="text-[11px] text-ink-500">{selected.wardId?.name || wards.find((w) => String(w._id) === String(selected.wardId?._id || selected.wardId))?.name}</p>
                </div>
                <span className={cn('badge', selected.status === 'AVAILABLE' ? 'bg-emerald-50 text-emerald-700' : selected.status === 'OCCUPIED' ? 'bg-rose-50 text-rose-700' : 'bg-ink-100 text-ink-600')}>
                  {STATUS_LABEL[selected.status] || selected.status}
                </span>
              </div>

              <dl className="space-y-1.5 text-[11px]">
                <div className="flex justify-between"><dt className="text-ink-500">Bed type</dt><dd className="font-medium text-ink-800">{selected.bedType || '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-500">Room category</dt><dd className="font-medium text-ink-800">{selected.roomId?.roomType || '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-500">Room</dt><dd className="font-medium text-ink-800">{selected.roomId?.roomNumber || '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-500">Tariff</dt><dd className="font-medium text-ink-800">₹{selected.chargePerDay || 0}/day</dd></div>
                <div className="flex justify-between"><dt className="text-ink-500">Expected discharge</dt><dd className="font-medium text-ink-800">{selected.admission?.expectedDischargeDate ? formatDate(selected.admission.expectedDischargeDate) : 'Not planned'}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-500">Reason</dt><dd className="max-w-[180px] truncate font-medium text-ink-800">{selected.blockedReason || '—'}</dd></div>
              </dl>

              {selected.admission && (
                <button className="btn-primary mt-2 w-full text-xs" onClick={() => navigate(admissionPath(selected.admission) || '/ipd/admissions')}>
                  Open workspace <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              )}

              <div className="mt-4 space-y-2">
                {selected.status === 'CLEANING' && (
                  <BedAction label="Housekeeping done — make available" icon={<Sparkles className="h-4 w-4" />} onClick={completeTurnover} />
                )}
                {['AVAILABLE', 'CLEANING'].includes(selected.status) && <BedAction label="Reserve" icon={<Armchair className="h-4 w-4" />} onClick={reserve} />}
                {['RESERVED', 'CLEANING', 'MAINTENANCE', 'BLOCKED'].includes(selected.status) && <BedAction label="Release bed" icon={<DoorOpen className="h-4 w-4" />} onClick={release} neutral />}
                {selected.status === 'AVAILABLE' && <BedAction label="Start cleaning" icon={<Sparkles className="h-4 w-4" />} onClick={() => changeStatus('CLEANING')} neutral />}
                {['RESERVED', 'MAINTENANCE', 'BLOCKED'].includes(selected.status) && <BedAction label="Set available / Unblock" icon={<DoorOpen className="h-4 w-4" />} onClick={() => changeStatus('AVAILABLE')} neutral />}
                {['AVAILABLE', 'RESERVED', 'CLEANING'].includes(selected.status) && <BedAction label="Maintenance" icon={<Wrench className="h-4 w-4" />} onClick={() => changeStatus('MAINTENANCE')} danger />}
                {['AVAILABLE', 'RESERVED', 'CLEANING'].includes(selected.status) && <BedAction label="Block bed" icon={<Ban className="h-4 w-4" />} onClick={() => changeStatus('BLOCKED')} danger />}
                {['RESERVED', 'AVAILABLE', 'CLEANING'].includes(selected.status) && waiting.data?.length > 0 && (
                  <button className="btn-primary w-full text-xs" onClick={() => setAssignOpen({ admission: waiting.data[0] })}>
                    <UserPlus className="h-4 w-4" /> Allocate to waiting patient
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="card p-4 text-center">
              <BedDouble className="mx-auto h-6 w-6 text-ink-300" />
              <div className="mt-2 text-xs font-medium text-ink-500">Select a bed to manage it</div>
            </div>
          )}

          {turnoverQueue.data?.length > 0 && (
            <div className="card p-4">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-500">Awaiting housekeeping</h3>
              <div className="space-y-1.5">
                {turnoverQueue.data.map((b) => (
                  <div key={b._id} className="flex items-center justify-between gap-2 rounded-lg bg-ink-50 px-3 py-2 text-[11px]">
                    <span className="font-semibold text-ink-800">{b.code || b.bedNumber}</span>
                    <span className="truncate text-ink-500">{b.wardId?.name}</span>
                    <span className="shrink-0 text-ink-400">{formatDateTime(b.lastTurnoverAt || b.updatedAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {assignOpen && (
        <AssignBedModal
          bedTarget={selected}
          admission={assignOpen.admission}
          onClose={() => setAssignOpen(false)}
          onDone={() => {
            setAssignOpen(false);
            qc.invalidateQueries({ queryKey: ['ipd-command-center'] });
            qc.invalidateQueries({ queryKey: ['ipd-waiting'] });
          }}
        />
      )}

      {bedsQuery.data?.length ? null : null}
    </div>
  );
}
