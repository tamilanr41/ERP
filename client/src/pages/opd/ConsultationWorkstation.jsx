import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stethoscope, UserCheck, ArrowRight, ShieldCheck, ClipboardList } from 'lucide-react';
import api from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/Feedback';
import Badge from '../../components/ui/Badge';
import { StepConsult } from '../OpdPage';
import { cn, formatDateTime } from '../../lib/utils';

const AVATAR_COLORS = ['bg-cyan-100 text-cyan-700', 'bg-brand-100 text-brand-700', 'bg-violet-100 text-violet-700', 'bg-emerald-100 text-emerald-700'];

export default function ConsultationWorkstation() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState(null);

  const visits = useQuery({
    queryKey: ['doc-consult-list'],
    queryFn: async () => (await api.get('/opd/visits', { params: { limit: 100 } })).data.data,
    refetchInterval: 15000,
    refetchIntervalInBackground: true,
  });

  const ready = useMemo(() => {
    const rows = visits.data || [];
    return rows
      .filter((v) => v.vitalsStatus === 'COMPLETED' && v.status === 'IN_PROGRESS')
      .sort((a, b) => new Date(a.visitDate) - new Date(b.visitDate));
  }, [visits.data]);

  const selected = useMemo(() => ready.find((v) => v._id === selectedId) || null, [ready, selectedId]);

  const handleSaved = () => {
    qc.invalidateQueries({ queryKey: ['doc-consult-list'] });
    setSelectedId(null);
  };

  const initials = (p) => ((p?.firstName || '?')[0] || '') + ((p?.lastName || '')[0] || '');
  const patientName = (p) => `${p?.firstName || ''} ${p?.lastName || ''}`.trim() || 'Unknown patient';

  return (
    <div className="p-6">
      <PageHeader
        title="Doctor Consultation"
        subtitle="Doctor workbench — vitals-completed patients are ready to be consulted; open a record to assess, examine, diagnose and prescribe."
        actions={[
          <Badge key="r" label={`${ready.length} ready`} status="COMPLETED" />,
          <Badge key="c" label={`${selected ? 1 : 0} in consultation`} status="IN_PROGRESS" />,
        ]}
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-[360px_1fr]">
        <aside className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-bold text-ink-900"><UserCheck className="h-4 w-4 text-cyan-600" /> Ready for doctor</div>
            <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[11px] font-bold text-cyan-700">{ready.length}</span>
          </div>
          <div className="scrollbar-none max-h-[calc(100vh-15rem)] overflow-y-auto">
            {visits.isLoading ? (
              <LoadingState label="Loading consultation list…" />
            ) : visits.isError ? (
              <ErrorState message={visits.error?.message} />
            ) : ready.length === 0 ? (
              <EmptyState title="No patients ready yet" hint="Patients appear here once the nurse completes their vitals." />
            ) : (
              <ul className="divide-y divide-ink-100">
                {ready.map((v, i) => {
                  const p = v.patientId || {};
                  return (
                    <li key={v._id}>
                      <button
                        onClick={() => setSelectedId(v._id)}
                        className={cn(
                          'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-ink-50',
                          selectedId === v._id && 'bg-cyan-50',
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
                          {v.chiefComplaint ? (
                            <span className="mt-1 flex items-center gap-1 text-[11px] text-ink-400"><ClipboardList className="h-3 w-3" /> “{v.chiefComplaint}”</span>
                          ) : null}
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

        <section className="min-w-0">
          {selected ? (
            <StepConsult key={selected._id} journey={{ visit: selected, patient: selected.patientId, appointment: null }} onNext={handleSaved} />
          ) : (
            <div className="card flex h-full min-h-[24rem] flex-col items-center justify-center gap-3 p-10 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-600"><Stethoscope className="h-7 w-7" /></span>
              <div className="text-lg font-bold text-ink-900">Open a patient to start consultation</div>
              <p className="max-w-sm text-sm text-ink-500">
                Select a ready patient on the left to open the full consultation workstation — summary, clinical notes, examination, diagnoses and prescriptions.
              </p>
            </div>
          )}
        </section>
      </div>

      <div className="mt-4 flex items-center gap-1.5 text-[11px] text-ink-400">
        <ShieldCheck className="h-3.5 w-3.5" /> The consulting doctor is recorded automatically; the list refreshes every 15s.
      </div>
    </div>
  );
}