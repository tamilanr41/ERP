import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Stethoscope, ClipboardList, Pill, FlaskConical, Receipt, CheckCircle2, CalendarClock,
  ArrowRightLeft, FileText, Circle, ClipboardCheck, CalendarDays, FlaskConical as _,
} from 'lucide-react';
import api, { apiError } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import Badge from '../../components/ui/Badge';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/Feedback';
import { cn } from '../../lib/utils';

const CHECKLIST = [
  { key: 'consultation', label: 'Consultation completed', desc: 'Doctor has seen the patient and documented the visit', icon: Stethoscope },
  { key: 'diagnosis', label: 'Diagnosis recorded', desc: 'A diagnosis is set on this visit', icon: ClipboardList },
  { key: 'prescription', label: 'Prescription finalized', desc: 'Prescription is signed and marked final', icon: Pill },
  { key: 'orders', label: 'Investigation orders created (if required)', desc: 'Required lab / radiology orders raised', icon: FlaskConical },
  { key: 'billing', label: 'Billing completed (if required)', desc: 'Required bills have been raised', icon: Receipt },
  { key: 'payment', label: 'Payment status checked', desc: 'Payment received or routed as per policy', icon: CheckCircle2 },
  { key: 'followup', label: 'Follow-up recorded (if required)', desc: 'Follow-up scheduled when required', icon: CalendarClock },
  { key: 'referral', label: 'Referral recorded (if required)', desc: 'Referral raised when required', icon: ArrowRightLeft },
];

const DELIVERABLES = [
  { key: 'prescription', label: 'Prescription', icon: Pill, href: '/opd/prescriptions' },
  { key: 'orders', label: 'Investigation Orders', icon: FlaskConical, href: '/opd/orders' },
  { key: 'reports', label: 'Reports', icon: FileText, href: '/reports' },
  { key: 'followup', label: 'Follow-up', icon: CalendarClock, href: '/opd/followup' },
  { key: 'receipt', label: 'Receipt', icon: Receipt, href: '/opd/billing' },
  { key: 'summary', label: 'Consultation Summary', icon: ClipboardList, href: '/opd/consultation' },
];

export default function OpCompletion() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [checks, setChecks] = useState({});

  const visitQuery = useQuery({
    queryKey: ['opd-visit', id],
    queryFn: async () => (await api.get(`/opd/visits/${id}`)).data.data,
    enabled: !!id,
  });
  const visit = visitQuery.data;
  const isCompleted = visit?.status === 'COMPLETED';
  const isReferred = visit?.status === 'REFERRED';

  const checksQuery = useQuery({
    queryKey: ['opd-completion', id],
    queryFn: async () => {
      try {
        return (await api.get(`/opd/visits/${id}/completion`)).data.data?.checks || {};
      } catch {
        return {};
      }
    },
    enabled: !!id,
  });

  const complete = useMutation({
    mutationFn: async () => (await api.put(`/opd/visits/${id}`, { status: 'COMPLETED' })).data,
    onSuccess: () => {
      toast.success('OP visit completed 🎉');
      qc.invalidateQueries({ queryKey: ['opd-visits'] });
      qc.invalidateQueries({ queryKey: ['opd-queue'] });
      qc.invalidateQueries({ queryKey: ['opd-visit', id] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const merged = { ...checksQuery.data, ...checks };

  const checkedCount = CHECKLIST.filter((c) => checks[c.key]).length;
  const allChecked = checkedCount === CHECKLIST.length;
  const visitDisplay = useMemo(() => visit, [visit]);

  return (
    <div className="p-6">
      <PageHeader
        title="OP Completion"
        subtitle="Verify the 8-step checklist, then mark the OP visit COMPLETED and hand over the OP deliverables."
        actions={visitDisplay ? <Badge label={isReferred ? 'REFERRED' : isCompleted ? 'COMPLETED' : 'IN PROGRESS'} status={isCompleted ? 'COMPLETED' : 'IN_PROGRESS'} /> : null}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          {visitQuery.isLoading ? (
            <LoadingState />
          ) : visitQuery.error ? (
            <ErrorState message={apiError(visitQuery.error)} />
          ) : !visit ? (
            <EmptyState title="No visit loaded" desc="Open this screen from a visit in the OP queue." />
          ) : (
            <>
              <div className="card">
                <div className="border-b border-ink-100 px-4 py-3">
                  <h3 className="text-sm font-semibold text-ink-900">Completion checklist</h3>
                  <p className="mt-0.5 text-xs text-ink-500">Tick every step that has been verified for this visit.</p>
                </div>
                <div className="grid grid-cols-1 gap-1.5 p-4 sm:grid-cols-2">
                  {CHECKLIST.map((item) => {
                    const done = checks[item.key] === true;
                    return (
                      <button
                        key={item.key}
                        onClick={() => setChecks((c) => ({ ...c, [item.key]: !done }))}
                        disabled={isCompleted}
                        className={cn(
                          'flex items-start gap-2.5 rounded-xl border p-3 text-left text-sm transition',
                          done ? 'border-brand-300 bg-brand-50 text-brand-800' : 'border-ink-100 bg-white text-ink-700 hover:bg-ink-50',
                          isCompleted && 'opacity-60',
                        )}
                      >
                        {done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-ink-300" />}
                        <span>
                          <span className="block font-medium">{item.label}</span>
                          <span className="mt-1 block text-xs text-ink-500">{item.desc}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between border-t border-ink-100 px-4 py-3">
                  <span className="text-xs text-ink-500">{checkedCount} of {CHECKLIST.length} verified</span>
                  <button
                    disabled={!allChecked || isCompleted}
                    onClick={() => complete.mutate()}
                    className={cn('btn btn-primary', (!allChecked || isCompleted) && 'opacity-40')}
                  >
                    <ClipboardCheck className="h-4 w-4" /> {complete.isPending ? 'Completing…' : isCompleted ? 'Already complete' : 'Mark VISIT COMPLETED'}
                  </button>
                </div>
              </div>

              {isCompleted && (
                <div className="card">
                  <div className="border-b border-ink-100 px-4 py-3">
                    <h3 className="text-sm font-semibold text-ink-900">OP Summary</h3>
                    <Badge label="COMPLETED" status="COMPLETED" className="mt-1" />
                  </div>
                  <div className="p-4">
                    <p className="mb-3 text-sm text-ink-600">The OP visit is complete. Hand the patient their deliverables:</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {DELIVERABLES.map(({ key, label, href, icon: Icon }) => (
                        <button key={key} onClick={() => navigate(href)} className="btn-secondary flex flex-col items-center gap-1.5 px-2 py-3 text-xs">
                          <Icon className="h-4 w-4 text-brand-600" />
                          <span>{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <aside className="card h-fit p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-400">How to complete</h4>
          <ol className="mt-3 space-y-2 text-sm text-ink-700">
            <li>1. Finish the consultation and record the diagnosis.</li>
            <li>2. Finalize the prescription.</li>
            <li>3. Create required investigation orders.</li>
            <li>4. Complete required billing and check payment.</li>
            <li>5. Record follow-up and referral if required.</li>
            <li>6. Tick all 8 steps, then Complete.</li>
            <li>7. Hand over the OP Summary deliverables.</li>
          </ol>
        </aside>
      </div>
    </div>
  );
}
