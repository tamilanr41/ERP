import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarClock, Users, Timer, CheckCircle2, ChevronRight, SkipForward, RotateCcw, Stethoscope, UserCheck, RefreshCcw, Zap, ArrowRight } from 'lucide-react';
import api, { apiError } from '../lib/api';
import PageHeader from '../components/ui/PageHeader';
import { LoadingState, ErrorState } from '../components/ui/Feedback';
import { cn } from '../lib/utils';
import Badge from '../components/ui/Badge.jsx';

const DISPLAY = {
  REQUESTED: { label: 'Requested', status: 'PENDING' },
  SCHEDULED: { label: 'Scheduled', status: 'SCHEDULED' },
  CONFIRMED: { label: 'Confirmed', status: 'CONFIRMED' },
  ARRIVED: { label: 'Vitals', status: 'ARRIVED' },
  CHECKED_IN: { label: 'Waiting', status: 'CHECKED_IN' },
  WAITING: { label: 'Ready for Doctor', status: 'WAITING' },
  IN_CONSULTATION: { label: 'In Consultation', status: 'IN_CONSULTATION' },
  IN_PROGRESS: { label: 'In Consultation', status: 'IN_PROGRESS' },
  COMPLETED: { label: 'Completed', status: 'COMPLETED' },
  SKIPPED: { label: 'Skipped', status: 'SKIPPED' },
  CANCELLED: { label: 'Cancelled', status: 'CANCELLED' },
  NO_SHOW: { label: 'No Show', status: 'NO_SHOW' },
};

const VISIT_LABEL = { NEW: 'New', FOLLOW_UP: 'Follow-up', WALK_IN: 'Walk-in', EMERGENCY: 'Emergency' };

const fmtTime = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
};

function WaitChip({ minutes }) {
  if (minutes == null) return <span className="text-xs text-ink-500">—</span>;
  const overdue = minutes >= 30;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap', overdue ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800')}>
      <Timer className="h-3 w-3" /> {minutes}m
    </span>
  );
}

function TokenChip({ label, value, accent }) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-ink-100 bg-white px-2 py-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">{label}</span>
      <span className={cn('text-sm font-black tabular-nums', accent)}>{value ?? '—'}</span>
    </div>
  );
}

export default function QueueBoard() {
  const qc = useQueryClient();
  const board = useQuery({
    queryKey: ['queue-board'],
    queryFn: async () => (await api.get('/queue/board')).data,
    refetchInterval: 10000,
    refetchIntervalInBackground: true,
  });

  const transition = useMutation({
    mutationFn: async ({ id, status }) => (await api.patch(`/appointments/${id}/status`, { status })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['queue-board'] }); qc.invalidateQueries({ queryKey: ['appointments'] }); },
    onError: (e) => toast.error(apiError(e)),
  });

  const act = (id, status, label) => transition.mutate({ id, status }, { onSuccess: () => toast.success(label) });

  const data = board.data?.data;
  const summary = data?.summary || {};

  return (
    <div className="p-6">
      <PageHeader
        title="Token Management"
        subtitle={data ? `Live OPD queue · ${data.date} · refresh every 10s` : 'Live queue command center'}
        actions={<span className="text-xs text-ink-500"><RefreshCcw className="mr-1 inline h-3 w-3" />auto-refresh</span>}
      />

      {board.isLoading ? <LoadingState /> : board.error ? <ErrorState message={apiError(board.error)} /> : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
            <div className="card flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><Zap className="h-5 w-5" /></div>
              <div>
                <div className="text-2xl font-black tabular-nums leading-tight text-ink-900">{summary.currentToken ?? '—'}</div>
                <div className="text-xs text-ink-500">Current token</div>
              </div>
            </div>
            <div className="card flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><ArrowRight className="h-5 w-5" /></div>
              <div>
                <div className="text-2xl font-black tabular-nums leading-tight text-ink-900">{summary.nextToken ?? '—'}</div>
                <div className="text-xs text-ink-500">Next token</div>
              </div>
            </div>
            <div className="card flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><Users className="h-5 w-5" /></div>
              <div>
                <div className="text-2xl font-black tabular-nums leading-tight text-ink-900">{summary.waiting ?? 0}</div>
                <div className="text-xs text-ink-500">Waiting now</div>
              </div>
            </div>
            <div className="card flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-5 w-5" /></div>
              <div>
                <div className="text-2xl font-black tabular-nums leading-tight text-ink-900">{summary.skipped ?? 0}</div>
                <div className="text-xs text-ink-500">Skipped</div>
              </div>
            </div>
            <div className="card flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-100 text-ink-600"><Timer className="h-5 w-5" /></div>
              <div>
                <div className="text-2xl font-black tabular-nums leading-tight text-ink-900">{summary.avgWaitMinutes ? `${summary.avgWaitMinutes}m` : '—'}</div>
                <div className="text-xs text-ink-500">Avg waiting time</div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
            {(!data.doctors || data.doctors.length === 0) && (
              <div className="card col-span-full p-10 text-center text-sm text-ink-500">No appointments in today&apos;s queue.</div>
            )}
            {(data.doctors || []).map((doc) => (
              <div key={doc.doctorId || 'unassigned'} className="card overflow-hidden">
                <div className="flex items-center justify-between gap-2 border-b border-ink-100 bg-ink-50 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-ink-900">{doc.name || 'Unassigned doctor'}</div>
                    <div className="truncate text-xs text-ink-500">{doc.specialization}{doc.consultationFee ? ` · ₹${doc.consultationFee}` : ''}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 text-xs text-ink-500">
                    <Users className="h-3.5 w-3.5" />
                    <span className="font-semibold">{doc.total}</span> today
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 border-b border-ink-100 bg-white px-4 py-2">
                  <TokenChip label="Current" value={doc.currentToken} accent="text-violet-700" />
                  <TokenChip label="Next" value={doc.nextToken} accent="text-brand-700" />
                  <TokenChip label="Waiting" value={doc.waitingCount} accent="text-amber-700" />
                  <TokenChip label="Avg wait" value={doc.avgWaitLabel} accent="text-ink-700" />
                </div>
                <div className="max-h-[360px] overflow-y-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-ink-100 bg-white text-left text-[10px] uppercase tracking-wider text-ink-400">
                        <th className="py-1.5 pl-4 pr-1">Tkn</th>
                        <th className="px-1 py-1.5">OP No</th>
                        <th className="px-1 py-1.5">Patient</th>
                        <th className="px-1 py-1.5">Age/G</th>
                        <th className="px-1 py-1.5">Type</th>
                        <th className="px-1 py-1.5">Arrived</th>
                        <th className="px-1 py-1.5">Wait</th>
                        <th className="px-1 py-1.5">Status</th>
                        <th className="py-1.5 pr-2 pl-1 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100 bg-white">
                      {[...(doc.items || [])]
                        .sort((a, b) => {
                          const rank = (s) => (s === 'COMPLETED' || s === 'CANCELLED' || s === 'NO_SHOW' ? 9 : 0);
                          return rank(a.status) - rank(b.status) || (a.tokenNumber || 99999) - (b.tokenNumber || 99999);
                        })
                        .map((item) => {
                          const d = DISPLAY[item.status] || { label: item.status, status: null };
                          const done = item.status === 'COMPLETED' || item.status === 'CANCELLED' || item.status === 'NO_SHOW';
                          return (
                            <tr key={item._id} className={cn('align-middle', done && 'opacity-50')}>
                              <td className="py-2 pl-4 pr-1 text-sm font-black text-brand-700 tabular-nums">{item.tokenNumber ?? '·'}</td>
                              <td className="px-1 py-2 font-mono text-[11px] text-ink-500">{item.opdNumber || '—'}</td>
                              <td className="px-1 py-2">
                                <div className={cn('max-w-[150px] truncate text-sm font-medium text-ink-900', done && 'line-through')}>
                                  {item.patient?.firstName} {item.patient?.lastName || ''}
                                </div>
                                <div className="max-w-[150px] truncate font-mono text-[10px] text-ink-400">{item.patient?.uhid}</div>
                              </td>
                              <td className="whitespace-nowrap px-1 py-2 text-xs text-ink-600">
                                {item.age != null ? `${item.age}y` : '—'} / {(item.patient?.gender || '—').slice(0, 1)}
                              </td>
                              <td className="whitespace-nowrap px-1 py-2 text-[11px] text-ink-500">{VISIT_LABEL[item.visitType] || item.visitType || '—'}</td>
                              <td className="whitespace-nowrap px-1 py-2 text-xs tabular-nums text-ink-500">{fmtTime(item.arrivalAt)}</td>
                              <td className="px-1 py-2"><WaitChip minutes={item.waitMinutes} /></td>
                              <td className="px-1 py-2"><Badge label={d.label} status={d.status || (done ? item.status : undefined)} /></td>
                              <td className="py-2 pr-2 pl-1 text-right">
                                <ActionButtons item={item} busy={transition.isPending} onAct={act} />
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ActionButtons({ item, busy, onAct }) {
  const s = item.status;
  const buttons = [];

  if (s === 'ARRIVED') {
    buttons.push({ label: 'Check in', icon: <UserCheck className="h-3 w-3" />, to: 'CHECKED_IN', style: 'btn-secondary', msg: 'Checked in → waiting' });
  }
  if (s === 'CHECKED_IN') {
    buttons.push({ label: 'Call next', icon: <ChevronRight className="h-3 w-3" />, to: 'WAITING', style: 'btn-primary', msg: 'Called → ready for doctor' });
  }
  if (s === 'WAITING') {
    buttons.push({ label: 'Skip', icon: <SkipForward className="h-3 w-3" />, to: 'SKIPPED', style: 'btn-secondary', msg: 'Skipped' });
    buttons.push({ label: 'Consult', icon: <Stethoscope className="h-3 w-3" />, to: 'IN_CONSULTATION', style: 'btn-primary', msg: 'Consultation started' });
  }
  if (s === 'SKIPPED') {
    buttons.push({ label: 'Recall', icon: <RotateCcw className="h-3 w-3" />, to: 'WAITING', style: 'btn-secondary', msg: 'Recalled → ready for doctor' });
  }
  if (s === 'IN_CONSULTATION' || s === 'IN_PROGRESS') {
    buttons.push({ label: 'Complete', icon: <CheckCircle2 className="h-3 w-3" />, to: 'COMPLETED', style: 'btn-secondary', msg: 'Visit completed' });
  }

  if (!buttons.length) return <span className="text-[10px] text-ink-300">—</span>;

  return (
    <div className="flex items-center justify-end gap-1.5">
      {buttons.map((b) => (
        <button key={b.to} className={cn(b.style, 'whitespace-nowrap px-2 py-1 text-[11px]')} disabled={busy} onClick={() => onAct(item._id, b.to, b.msg)}>
          <span className="inline-flex items-center gap-1">{b.icon}{b.label}</span>
        </button>
      ))}
    </div>
  );
}