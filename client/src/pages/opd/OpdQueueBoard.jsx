import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BellRing,
  CalendarDays,
  DoorOpen,
  Stethoscope,
  UserMinus,
  UserX,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import api, { apiError } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import PageHeader from '../../components/ui/PageHeader';
import { LoadingState, ErrorState, EmptyState, Spinner } from '../../components/ui/Feedback';
import Badge from '../../components/ui/Badge';
import { cn, formatDateTime, initials } from '../../lib/utils';

const AVATAR_COLORS = [
  'bg-cyan-100 text-cyan-700',
  'bg-brand-100 text-brand-700',
  'bg-violet-100 text-violet-700',
  'bg-emerald-100 text-emerald-700',
];

const COLUMNS = [
  { key: 'waiting', status: 'WAITING', title: 'Waiting', icon: Users, tone: 'text-amber-700' },
  { key: 'called', status: 'CALLED', title: 'Called', icon: BellRing, tone: 'text-cyan-700' },
  { key: 'inConsultation', status: 'IN_CONSULTATION', title: 'In consultation', icon: Stethoscope, tone: 'text-violet-700' },
];

const patientName = (p) => [p?.firstName, p?.lastName].filter(Boolean).join(' ') || 'Unnamed patient';

/** Wait/seat/consult minutes rendered as a short human string, or an em dash. */
const waitLabel = (mins) => {
  if (mins == null) return '—';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};

export default function OpdQueueBoard() {
  const qc = useQueryClient();
  const { hasPermission, user } = useAuth();
  const [doctorId, setDoctorId] = useState('');

  // Queue movement is a distinct grant from viewing or editing a visit. Hiding
  // the buttons keeps the board readable for a user who can only look at it.
  const canCall = hasPermission('OPD_QUEUE') || user?.roleCode === 'SUPER_ADMIN';
  const canAdvance = hasPermission('OPD_EDIT') || user?.roleCode === 'SUPER_ADMIN';

  const doctors = useQuery({
    queryKey: ['m-doctors'],
    queryFn: async () => (await api.get('/masters/doctors', { params: { limit: 100 } })).data.data,
  });

  const board = useQuery({
    queryKey: ['opd-queue', doctorId],
    queryFn: async () => (await api.get('/opd/queue', { params: { doctorId: doctorId || undefined } })).data.data,
    // The board is the front desk's live view of the department. Polled rather
    // than pushed because the server has no opd:* socket events yet.
    refetchInterval: 15000,
    refetchIntervalInBackground: true,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['opd-queue'] });
    qc.invalidateQueries({ queryKey: ['opd-visits'] });
    qc.invalidateQueries({ queryKey: ['doc-consult-list'] });
    qc.invalidateQueries({ queryKey: ['nurse-vitals-list'] });
  };

  // Every board action is the same shape, so they share one mutation and only
  // differ by endpoint. The status guard on the server is the real authority;
  // this only controls whether the button is offered.
  const action = useMutation({
    mutationFn: async ({ url, label }) => {
      const res = await api.post(url, {});
      return { ...res.data.data, label };
    },
    onSuccess: (data) => {
      if (!data) {
        // call-next returns null when nobody is waiting. Saying so beats a
        // silent no-op that looks like a dropped click.
        toast.info('Nobody is waiting right now');
        return;
      }
      const name = patientName(data.patient);
      toast.success(`${data.label}${data.queueToken ? ` T-${String(data.queueToken).padStart(3, '0')}` : ''}: ${name}`);
      invalidate();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const callNext = useMutation({
    mutationFn: async () => (await api.post(`/opd/queue/doctors/${doctorId}/call-next`, {})).data.data,
    onSuccess: (data) => {
      if (!data) return toast.info('Nobody is waiting right now');
      toast.success(`Called ${patientName(data.patient)}`);
      invalidate();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const rowsByStatus = useMemo(() => {
    const rows = board.data?.queue || [];
    return COLUMNS.reduce((acc, col) => {
      acc[col.status] = rows.filter((r) => r.status === col.status);
      return acc;
    }, {});
  }, [board.data]);

  const counts = board.data?.counts || {};
  const queue = board.data?.queue || [];
  const longWait = board.data?.maxWaitingMins || 0;

  return (
    <div className="p-6">
      <PageHeader
        title="OPD Queue"
        subtitle="Live waiting room by token order. Waiting time is measured from check-in, not from when someone pressed refresh."
        actions={
          <div className="flex items-center gap-2">
            <select className="select" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
              <option value="">All doctors</option>
              {(doctors.data || []).map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name}
                </option>
              ))}
            </select>
            {canCall && (
              <button
                type="button"
                className="btn-primary"
                disabled={callNext.isPending}
                onClick={() => {
                  if (!doctorId) return toast.error('Pick a doctor first — one shared queue would call the wrong patient');
                  callNext.mutate();
                }}
                title={doctorId ? 'Call the longest-waiting patient' : 'Select a doctor to use call-next'}
              >
                {callNext.isPending ? <Spinner className="h-3.5 w-3.5" /> : <BellRing className="h-4 w-4" />}
                Call next
              </button>
            )}
          </div>
        }
      />

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        {COLUMNS.map((col) => {
          const Icon = col.icon;
          return (
            <div key={col.key} className="card p-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-400">
                <Icon className={cn('h-4 w-4', col.tone)} />
                {col.title}
              </div>
              <div className={cn('mt-1 text-3xl font-bold tabular-nums', col.tone)}>{counts[col.key] ?? 0}</div>
            </div>
          );
        })}
        <div className="card p-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-400">
            <CalendarDays className="h-4 w-4 text-rose-600" />
            Longest wait
          </div>
          <div className="mt-1 text-3xl font-bold tabular-nums text-rose-600">{waitLabel(longWait)}</div>
        </div>
      </div>

      {longWait > 45 && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
          <BellRing className="h-4 w-4 shrink-0" />
          Somebody has been waiting {waitLabel(longWait)}. Consider calling the next patient.
        </div>
      )}

      {board.isLoading && <LoadingState label="Loading the waiting room…" />}
      {board.isError && <ErrorState message={apiError(board.error)} />}

      {!board.isLoading && !board.isError && queue.length === 0 && (
        <div className="mt-4">
          <EmptyState title="Nobody in the waiting room" hint="Register a patient at the front desk to start a queue." />
        </div>
      )}

      {queue.length > 0 && (
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {COLUMNS.map((col) => {
            const Icon = col.icon;
            const rows = rowsByStatus[col.status] || [];
            return (
              <section key={col.key} className="card overflow-hidden">
                <div className="flex items-center justify-between border-b border-ink-100 bg-ink-50 px-4 py-2.5">
                  <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-500">
                    <Icon className={cn('h-4 w-4', col.tone)} />
                    {col.title}
                  </span>
                  <span className="text-xs font-semibold tabular-nums text-ink-400">{rows.length}</span>
                </div>

                {rows.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-ink-400">Empty</p>
                ) : (
                  <ul className="scrollbar-none max-h-[calc(100vh-24rem)] divide-y divide-ink-100 overflow-y-auto">
                    {rows.map((r, i) => {
                      const overdue = col.status === 'WAITING' && r.waitingMins != null && r.waitingMins > 45;
                      const overdueSeated =
                        col.status === 'CALLED' && r.seatedMins != null && r.seatedMins > 15;
                      return (
                        <li key={r._id} className="px-4 py-3">
                          <div className="flex items-start gap-3">
                            <div
                              className={cn(
                                'grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold',
                                AVATAR_COLORS[i % AVATAR_COLORS.length],
                              )}
                            >
                              {initials(r.patient)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate text-sm font-semibold text-ink-800">{patientName(r.patient)}</span>
                                {r.queueToken && (
                                  <span className="shrink-0 rounded bg-ink-900 px-1.5 py-0.5 text-xs font-bold tabular-nums text-white">
                                    {r.queueToken}
                                  </span>
                                )}
                              </div>
                              <div className="mt-0.5 truncate text-xs text-ink-500">
                                {r.opdNumber}
                                {r.patient?.uhid ? ` · ${r.patient.uhid}` : ''}
                                {r.doctorId?.name ? ` · ${r.doctorId.name}` : ' · No doctor'}
                              </div>
                              {r.chiefComplaint && (
                                <div className="mt-1 line-clamp-2 text-xs italic text-ink-600">“{r.chiefComplaint}”</div>
                              )}
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                {col.status === 'WAITING' && (
                                  <Badge
                                    label={`waiting ${waitLabel(r.waitingMins)}`}
                                    status={overdue ? 'NO_SHOW' : 'PENDING'}
                                  />
                                )}
                                {col.status === 'CALLED' && (
                                  <Badge
                                    label={`seated ${waitLabel(r.seatedMins)}`}
                                    status={overdueSeated ? 'NO_SHOW' : 'CHECKED_IN'}
                                  />
                                )}
                                {col.status === 'IN_CONSULTATION' && (
                                  <Badge label={`consult ${waitLabel(r.consultMins)}`} status="IN_CONSULTATION" />
                                )}
                                {r.checkedInAt && (
                                  <span className="text-[11px] text-ink-400">in {formatDateTime(r.checkedInAt)}</span>
                                )}
                              </div>

                              {(canCall || canAdvance) && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {col.status === 'WAITING' && canCall && (
                                    <button
                                      type="button"
                                      className="btn-secondary !px-2.5 !py-1 text-xs"
                                      disabled={action.isPending}
                                      onClick={() =>
                                        action.mutate({ url: `/opd/visits/${r._id}/call`, label: 'Called' })
                                      }
                                    >
                                      <DoorOpen className="h-3.5 w-3.5" />
                                      Call
                                    </button>
                                  )}
                                  {col.status === 'CALLED' && canAdvance && (
                                    <button
                                      type="button"
                                      className="btn-primary !px-2.5 !py-1 text-xs"
                                      disabled={action.isPending}
                                      onClick={() =>
                                        action.mutate({
                                          url: `/opd/visits/${r._id}/start-consultation`,
                                          label: 'Started consultation with',
                                        })
                                      }
                                    >
                                      <Stethoscope className="h-3.5 w-3.5" />
                                      Start
                                    </button>
                                  )}
                                  {col.status === 'WAITING' && canCall && (
                                    <button
                                      type="button"
                                      className="btn-ghost !px-2.5 !py-1 text-xs"
                                      disabled={action.isPending}
                                      onClick={() =>
                                        action.mutate({ url: `/opd/visits/${r._id}/no-show`, label: 'Marked absent:' })
                                      }
                                    >
                                      <UserX className="h-3.5 w-3.5" />
                                      No-show
                                    </button>
                                  )}
                                  {col.status !== 'IN_CONSULTATION' && canAdvance && (
                                    <button
                                      type="button"
                                      className="btn-ghost !px-2.5 !py-1 text-xs"
                                      disabled={action.isPending}
                                      onClick={() =>
                                        action.mutate({ url: `/opd/visits/${r._id}/cancel`, label: 'Cancelled:' })
                                      }
                                    >
                                      <UserMinus className="h-3.5 w-3.5" />
                                      Cancel
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}