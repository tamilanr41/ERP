import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardCheck, CheckCircle2, Circle, FileText, FlaskConical, Pill,
  CalendarClock, Receipt, Stethoscope, ArrowRightLeft, ClipboardList,
} from 'lucide-react';
import api, { apiError } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/Feedback';
import Badge from '../../components/ui/Badge';
import { cn } from '../../lib/utils';

const CHECKLIST = [
  { key: 'consultation', label: 'Consultation completed', icon: Stethoscope },
  { key: 'diagnosis', label: 'Diagnosis recorded', icon: ClipboardList },
  { key: 'prescription', label: 'Prescription finalized', icon: Pill },
  { key: 'orders', label: 'Investigation orders created', icon: FlaskConical },
  { key: 'billing', label: 'Required billing completed', icon: Receipt },
  { key: 'payment', label: 'Payment status checked', icon: CheckCircle2 },
  { key: 'followup', label: 'Follow-up recorded', icon: CalendarClock },
  { key: 'referral', label: 'Referral recorded', icon: ArrowRightLeft },
];

const DELIVERABLES = [
  { key: 'prescription', label: 'Prescription', href: '/opd/prescriptions', icon: Pill },
  { key: 'orders', label: 'Investigation Orders', href: '/opd/orders', icon: FlaskConical },
  { key: 'reports', label: 'Reports', href: '/reports', icon: FileText },
  { key: 'followup', label: 'Follow-up', href: '/opd/followup', icon: CalendarClock },
  { key: 'receipt', label: 'Receipt', href: '/opd/billing', icon: Receipt },
  { key: 'summary', label: 'Consultation Summary', href: '/opd/consultation', icon: ClipboardList },
];

export default function OpdCompletion() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [checks, setChecks] = useState({});
  const [completed, setCompleted] = useState(false1);

  const complete = useMutation({
    mutationFn: async (visitId) => (await api.put(`/opd/visits/${visitId}`, { status: 'COMPLETED' })).data,
    onSuccess: () => {
      toast.success('OP visit marked as COMPLETED');
      setCompleted(true);
      qc.invalidateQueries({ queryKey: ['opd'] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const check = (key) => setChecks((c) => ({ ...c, [key]: !c[key] }));
  const doneCount = CHECKLIST.filter((c) => checks[c.key]).length;
  const allDone = doneCount === CHECKLIST.length;

  return (
    <div className="p-6">
      <PageHeader
        title="OP Visit Completion"
        subtitle="Verify the consultation checklist, then mark the visit COMPLETED and hand over the patient deliverables."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <div className="card">
            <div className="border-b border-ink-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-ink-900">Completion Checklist</h3>
              <p className="mt-0.5 text-xs text-ink-500">Tick only what has actually been done for this visit.</p>
            </div>
            <div className="grid grid-cols-1 gap-1.5 p-4 sm:grid-cols-2">
              {CHECKLIST.map(({ key, label, icon: Icon }) => {
                const on = checks[key] === true;
                return (
                  <button
                    key={key}
                    onClick={() => check(key)}
                    className={cn(
                      'flex items-center gap-2.5 rounded-xl border p-3 text-left text-sm transition',
                      on ? 'border-brand-300 bg-brand-50 text-brand-800' : 'border-ink-100 bg-white text-ink-700 hover:bg-ink-50',
                    )}
                  >
                    {on ? <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-600" /> : <Circle className="h-4 w-4 shrink-0 text-ink-300" />}
                    <Icon className="h-4 w-4 shrink-0 text-ink-400" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between border-t border-ink-100 px-4 py-3">
              <span className="text-xs text-ink-500">{doneCount} of {CHECKLIST.length} steps verified</span>
              <button
                disabled={!allDone || complete.isPending}
                onClick={() => complete.mutate(undefined)}
                className={cn('btn btn-primary', (!allDone || complete.isPending) && 'opacity-40')}
              >
                <ClipboardCheck className="h-4 w-4" /> {complete.isPending ? 'Completing…' : 'Complete OP Visit'}
              </button>
            </div>
          </div>

          {completed && (
            <div className="card">
              <div className="border-b border-ink-100 px-4 py-3">
                <h3 className="text-sm font-semibold text-ink-900">OP Summary</h3>
                <Badge label="COMPLETED" status="COMPLETED" className="mt-1" />
              </div>
              <div className="p-4">
                <p className="text-sm text-ink-700">
                  The OP visit has been completed. All required steps were verified on-screen and the visit status is now
                  <span className="font-semibold text-ink-900"> COMPLETED</span>.
                </p>
                <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Patient can receive</p>
                  <div className="flex flex-wrap gap-2">
                    {DELIVERABLES.map(({ key, label, href, icon: Icon }) => (
                      <button key={key} onClick={() => navigate(href)} className="btn-secondary px-3 py-1.5 text-xs">
                        <Icon className="h-3.5 w-3.5" /> {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <aside className="card h-fit p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-400">How to complete a visit</h4>
          <ol className="mt-3 space-y-2.5 text-sm text-ink-700">
            <li>Open the patient's consultation screen.</li>
            <li>Record diagnosis, finalize the prescription and create required investigation orders.</li>
            <li>Complete billing and verify payment status.</li>
            <li>Record follow-up and referral if required.</li>
            <li>Return here, tick all eight steps, and hit <span className="font-semibold text-ink-900">Complete OP Visit</span>.</li>
            <li>Hand the patient their deliverables from the summary panel.</li>
          </ol>
          <div className="mt-4 rounded-xl bg-ink-50 p-3 text-xs text-ink-500">
            The scheduler, queue and follow-up modules reflect the COMPLETED status automatically.
          </div>
        </aside>
      </div>
    </div>
  );
}
