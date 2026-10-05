import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Stethoscope, UserCheck, ArrowRight, ShieldCheck } from 'lucide-react';
import api from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/Feedback';
import Badge from '../../components/ui/Badge';
import { StepVitals } from '../OpdPage';
import { cn, formatDateTime } from '../../lib/utils';

const AVATAR_COLORS = ['bg-brand-100 text-brand-700', 'bg-cyan-100 text-cyan-700', 'bg-violet-100 text-violet-700', 'bg-emerald-100 text-emerald-700'];

export default function NurseVitals() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState(null);

  const visits = useQuery({
    queryKey: ['nurse-vitals-list'],
    queryFn: async () => (await api.get('/opd/visits', { params: { limit: 100 } })).data.data,
    refetchInterval: 15000,
    refetchIntervalInBackground: true,
  });

  // Waiting/called/in-consultation all still need vitals; a closed or no-show
  // visit does not, so it must not sit in the nurse's list forever.
  const OPEN_STATUSES = ['WAITING', 'CALLED', 'IN_CONSULTATION'];

  const awaiting = useMemo(() => {
    const rows = visits.data || [];
    return rows
      .filter((v) => v.vitalsStatus !== 'COMPLETED' && OPEN_STATUSES.includes(v.status))
      .sort((a, b) => (a.tokenSeq ?? Infinity) - (b.tokenSeq ?? Infinity));
  }, [visits.data]);

  const completedToday = useMemo(() => (visits.data || []).filter((v) => v.vitalsStatus === 'COMPLETED').length, [visits.data]);

  const selected = useMemo(() => awaiting.find((v) => v._id === selectedId) || null, [awaiting, selectedId]);

  const handleRecorded = () => {
    qc.invalidateQueries({ queryKey: ['nurse-vitals-list'] });
    setSelectedId(null);
  };

  const initials = (p) => ((p?.firstName || '?')[0] || '') + ((p?.lastName || '')[0] || '');
  const patientName = (p) => `${p?.firstName || ''} ${p?.lastName || ''}`.trim() || 'Unknown patient';

  return (
    <div className="p-6">
      <PageHeader
        title="Vitals / Nurse Screening"
        subtitle="Nurse workbench — patients awaiting vitals are queued here; record vitals before the doctor sees them."
        actions={[
          <Badge key="n" label={`${awaiting.length} awaiting`} status="PENDING" />,
          <Badge key="d" label={`${completedToday} completed`} status="COMPLETED" />,
        ]}
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-[360px_1fr]">
        <aside className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-bold text-ink-900"><UserCheck className="h-4 w-4 text-brand-600" /> Awaiting vitals</div>
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">{awaiting.length}</span>
          </div>
          <div className="scrollbar-none max-h-[calc(100vh-15rem)] overflow-y-auto">
            {visits.isLoading ? (
              <LoadingState label="Loading queue…" />
            ) : visits.isError ? (
              <ErrorState title="Could not load queue" message={visits.error?.message} />
            ) : awaiting.length === 0 ? (
              <EmptyState title="No patients awaiting vitals" hint="Patients who are checked in and in progress will appear here." />
            ) : (
              <ul className="divide-y divide-ink-100">
                {awaiting.map((v, i) => {
                  const p = v.patientId || {};
                  return (
                    <li key={v._id}>
                      <button
                        onClick={() => setSelectedId(v._id)}
                        className={cn(
                          'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-ink-50',
                          selectedId === v._id && 'bg-brand-50',
                        )}
                      >
                        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold', AVATAR_COLORS[i % AVATAR_COLORS.length])}>
                          {initials(p)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold text-ink-900">{patientName(p)}</span>
                            <span className="font-mono text-[10px] font-semibold text-ink-400">{p?.uhid || '—'}</span>
                          </span>
                          <span className="mt-0.5 block text-xs text-ink-500">
                            OP {v.opdNumber} · {v.visitType || ''} · {formatDateTime(v.visitDate)}
                          </span>
                          <span className="mt-1 flex items-center gap-3 text-[11px] text-ink-400">
                            {v.doctorId ? <span className="flex items-center gap-1"><Stethoscope className="h-3 w-3" /> Dr. {v.doctorId.name || '—'}</span> : null}
                            {v.chiefComplaint ? <span className="truncate">“{v.chiefComplaint}”</span> : null}
                          </span>
                        </span>
                        <ArrowRight className="mt-2 h-4 w-4 shrink-0 text-ink-300" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        <section>
          {selected ? (
            <StepVitals key={selected._id} journey={{ visit: selected }} onNext={handleRecorded} />
          ) : (
            <div className="card flex h-full min-h-[24rem] flex-col items-center justify-center gap-3 p-10 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><Activity className="h-7 w-7" /></span>
              <div className="text-lg font-bold text-ink-900">Select a patient from the queue</div>
              <p className="max-w-sm text-sm text-ink-500">
                Choose a patient on the left to open the nurse vitals form — record vital signs, allergy confirmation, fall risk and triage priority.
              </p>
            </div>
          )}
        </section>
      </div>

      <div className="mt-4 flex items-center gap-1.5 text-[11px] text-ink-400">
        <ShieldCheck className="h-3.5 w-3.5" /> Nurse identity and a time-stamp are recorded with every vitals entry; queue refreshes automatically every 15s.
      </div>
    </div>
  );
}