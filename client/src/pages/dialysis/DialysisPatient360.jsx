import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft, CalendarPlus, ClipboardCheck, ClipboardList, Droplets, FileText, FlaskConical,
  Gauge, HeartPulse, History, Pencil, Pill, Power, Receipt, Stethoscope, Syringe, TriangleAlert, Wallet, X,
} from 'lucide-react';
import api, { apiError } from '../../lib/api';
import { LoadingState, ErrorState, EmptyState, Spinner } from '../../components/ui/Feedback';
import { MotionPage, MotionTab } from '../../components/ui/Motion';
import { formatDate, formatDateTime, cn } from '../../lib/utils';
import { POLL } from '../../lib/polling';
import { useIpdRealtime } from '../../lib/useIpdRealtime';

const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

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

const Section = ({ title, hint, right, children, className }) => (
  <section className={cn('card p-3.5', className)}>
    <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 className="text-sm font-bold text-ink-900">{title}</h2>
        {hint && <p className="text-[11px] text-ink-500">{hint}</p>}
      </div>
      {right}
    </div>
    {children}
  </section>
);

const TABS = [
  { key: 'overview', label: 'Overview', icon: Gauge },
  { key: 'sessions', label: 'Dialysis Sessions', icon: History },
  { key: 'prescription', label: 'Prescription', icon: ClipboardList },
  { key: 'vitals', label: 'Vitals', icon: HeartPulse },
  { key: 'lab', label: 'Lab', icon: FlaskConical },
  { key: 'medications', label: 'Medications', icon: Pill },
  { key: 'access', label: 'Access', icon: Droplets },
  { key: 'complications', label: 'Complications', icon: TriangleAlert },
  { key: 'consumables', label: 'Consumables', icon: Syringe },
  { key: 'billing', label: 'Billing', icon: Receipt },
  { key: 'payments', label: 'Payments', icon: Wallet },
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'timeline', label: 'Timeline', icon: History },
];

export default function DialysisPatient360() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState('overview');
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [schedule, setSchedule] = useState(() => {
    const at = new Date(Date.now() + 864e5);
    at.setHours(at.getHours() + 1, 0, 0, 0);
    return {
      scheduledAt: new Date(at.getTime() - at.getTimezoneOffset() * 60000).toISOString().slice(0, 16),
      shift: 'MORNING',
      priority: 'ROUTINE',
    };
  });
  useIpdRealtime();

  const p = useQuery({
    queryKey: ['dialysis-360', id],
    queryFn: async () => (await api.get(`/dialysis/patients/${id}/360`)).data.data,
    refetchInterval: POLL.STANDARD,
  });

  const quick = useMutation({
    mutationFn: async (body) => (await api.post('/dialysis/sessions', { dialysisPatientId: id, ...body })).data.data,
    onSuccess: (s) => { toast.success(`Session ${s.sessionNumber} scheduled`); setScheduleOpen(false); navigate(`/dialysis/session/${s._id}`); },
    onError: (e) => toast.error(apiError(e)),
  });

  const prescribe = useMutation({
    mutationFn: async (body) => (await api.post('/dialysis/prescriptions', { dialysisPatientId: id, ...body })).data.data,
    onSuccess: () => { toast.success('Prescription saved'); qc.invalidateQueries({ queryKey: ['dialysis-360', id] }); },
    onError: (e) => toast.error(apiError(e)),
  });

  if (p.isLoading) return <LoadingState label="Loading dialysis patient 360…" />;
  if (p.error) return <ErrorState message={apiError(p.error)} />;
  const d = p.data;
  const rec = d.patient;
  const patientId = rec.patientId?._id;
  const s = d.summary;

  return (
    <MotionPage className="p-5 space-y-4">
      <Link to="/dialysis/patients" className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-3.5 w-3.5" /> Dialysis register
      </Link>

      {/* ---------- HEADER ---------- */}
      <div className="card border-l-4 border-l-brand-500 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-bold text-brand-600">{rec.dialysisNumber}</span>
              <span className={cn('badge ring-1 ring-inset', rec.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-ink-100 text-ink-600 ring-ink-200')}>{rec.status}</span>
              <span className="text-lg font-bold text-ink-900">{rec.patientId?.firstName} {rec.patientId?.lastName}</span>
              <span className="text-xs text-ink-500">
                {rec.patientId?.uhid} · {rec.patientId?.age?.years ?? rec.patientId?.age ?? '—'} yrs · {rec.patientId?.gender} · {rec.patientId?.bloodGroup || rec.bloodGroup || 'blood group n/a'}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-ink-500">
              {rec.primaryDiagnosis || 'No primary diagnosis'} · CKD {String(rec.ckdStage || '').replace('STAGE_', '')} · Nephrologist: {rec.nephrologistId?.name || '—'} · Access: {String(rec.accessType || '').replace(/_/g, ' ')} {rec.accessSide !== 'NOT_APPLICABLE' ? `(${rec.accessSide})` : ''} · {rec.dialysisType}
            </div>
            <div className="mt-1 text-[11px] text-ink-500">
              {rec.sessionsPerWeek}/week · {(rec.scheduleDays || []).join(' ')} · {rec.preferredShift} shift · Payment: {rec.paymentCategory}{rec.sponsor ? ` · ${rec.sponsor}` : ''}
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <QuickAction icon={CalendarPlus} label="New session" onClick={() => setScheduleOpen((v) => !v)} primary />
            <QuickAction icon={Stethoscope} label="Prescription" onClick={() => setTab('prescription')} />
            <QuickAction icon={HeartPulse} label="Vitals" onClick={() => setTab('vitals')} />
            <QuickAction icon={FlaskConical} label="Lab" onClick={() => setTab('lab')} />
            <QuickAction icon={Receipt} label="Billing" onClick={() => setTab('billing')} />
            <QuickAction icon={FileText} label="Reports" onClick={() => navigate('/dialysis/reports')} />
            <QuickAction icon={History} label="History" onClick={() => setTab('sessions')} />
          </div>
        </div>

        {scheduleOpen && (
          <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-ink-50 p-3">
            <label className="label">Schedule date & time
              <input
                className="input mt-1"
                type="datetime-local"
                value={schedule.scheduledAt}
                onChange={(e) => setSchedule((s) => ({ ...s, scheduledAt: e.target.value }))}
              />
            </label>
            <label className="label">Shift
              <select className="select mt-1" value={schedule.shift} onChange={(e) => setSchedule((s) => ({ ...s, shift: e.target.value }))}>
                {['MORNING', 'AFTERNOON', 'EVENING', 'NIGHT'].map((x) => <option key={x}>{x}</option>)}
              </select>
            </label>
            <label className="label">Priority
              <select className="select mt-1" value={schedule.priority} onChange={(e) => setSchedule((s) => ({ ...s, priority: e.target.value }))}>
                {['ROUTINE', 'URGENT', 'EMERGENCY'].map((x) => <option key={x}>{x}</option>)}
              </select>
            </label>
            <button
              className="btn-primary"
              disabled={quick.isPending}
              onClick={() => quick.mutate({ ...schedule, scheduledAt: new Date(schedule.scheduledAt).toISOString() })}
            >
              {quick.isPending ? <Spinner className="h-4 w-4 text-white" /> : <CalendarPlus className="h-4 w-4" />} Schedule
            </button>
          </div>
        )}
      </div>

      {/* ---------- KPI STRIP ---------- */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
        {[
          ['Sessions', s.totalSessions], ['Completed', s.completedSessions], ['Complications', s.complicationSessions],
          ['UF removed', `${(s.totalUfRemovedMl / 1000).toFixed(1)} L`], ['Hours', Math.round(s.totalDialysisMinutes / 60)],
          ['Billed', rupees(s.totalBilled)], ['Outstanding', rupees(s.outstanding)],
        ].map(([l, v]) => (
          <div key={l} className="card p-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">{l}</div>
            <div className="text-lg font-bold tabular-nums text-ink-900">{v ?? 0}</div>
          </div>
        ))}
      </div>

      {/* ---------- TABS ---------- */}
      <div className="scrollbar-none flex gap-1 overflow-x-auto rounded-xl bg-ink-100 p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn('flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition', tab === t.key ? 'bg-brand-600 text-white shadow-sm' : 'text-ink-600 hover:bg-white')}
            >
              <Icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      <MotionTab tabKey={tab}>
        {tab === 'overview' && <OverviewTab d={d} />}
        {tab === 'sessions' && <SessionsTab d={d} />}
        {tab === 'prescription' && <PrescriptionTab d={d} onPrescribe={prescribe} />}
        {tab === 'vitals' && <VitalsTab d={d} />}
        {tab === 'lab' && <LabTab d={d} />}
        {tab === 'medications' && <MedicationsTab d={d} />}
        {tab === 'access' && <AccessTab d={d} patientId={patientId} />}
        {tab === 'complications' && <ComplicationsTab d={d} />}
        {tab === 'consumables' && <ConsumablesTab d={d} />}
        {tab === 'billing' && <BillingTab d={d} />}
        {tab === 'payments' && <PaymentsTab d={d} />}
        {tab === 'documents' && <DocumentsTab d={d} rec={rec} />}
        {tab === 'timeline' && <TimelineTab d={d} />}
      </MotionTab>
    </MotionPage>
  );
}

const QuickAction = ({ icon: Icon, label, onClick, primary }) => (
  <button onClick={onClick} className={cn('flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition', primary ? 'bg-brand-600 text-white hover:bg-brand-700' : 'bg-ink-100 text-ink-700 hover:bg-ink-200')}>
    <Icon className="h-3.5 w-3.5" /> {label}
  </button>
);

const Row = ({ label, value }) => (
  <div className="flex justify-between gap-3 border-b border-ink-100 py-1.5 text-xs last:border-0">
    <span className="text-ink-500">{label}</span>
    <span className="text-right font-medium text-ink-800">{value ?? '—'}</span>
  </div>
);

// ---------------------------------------------------------------- OVERVIEW
function OverviewTab({ d }) {
  const rec = d.patient;
  const s = d.summary;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Section title="Programme summary">
        <Row label="Registered" value={formatDate(rec.registeredAt)} />
        <Row label="Sessions completed" value={`${s.completedSessions} of ${s.totalSessions}`} />
        <Row label="No-show / cancelled" value={`${s.noShowSessions} / ${s.cancelledSessions}`} />
        <Row label="First session" value={s.firstSession ? formatDate(s.firstSession) : '—'} />
        <Row label="Last session" value={s.lastSession ? formatDate(s.lastSession) : '—'} />
        <Row label="Complication sessions" value={s.complicationSessions} />
        <Row label="Total UF removed" value={`${(s.totalUfRemovedMl / 1000).toFixed(2)} L`} />
        <Row label="Dialysis hours" value={(s.totalDialysisMinutes / 60).toFixed(1)} />
      </Section>

      <Section title="Clinical">
        <Row label="Primary diagnosis" value={rec.primaryDiagnosis} />
        <Row label="CKD stage" value={rec.ckdStage} />
        <Row label="Nephrologist" value={rec.nephrologistId?.name} />
        <Row label="Referring doctor" value={rec.referringDoctorId?.name} />
        <Row label="Dry weight" value={rec.dryWeightKg ? `${rec.dryWeightKg} kg` : '—'} />
        <Row label="Comorbidities" value={(rec.comorbidities || []).join(', ') || '—'} />
        <Row label="Allergies" value={(rec.allergies || []).join(', ') || 'None known'} />
        <Row label="Special needs" value={rec.specialNeeds || '—'} />
      </Section>

      <Section title="Weight trend (kg)">
        {s.weightTrend?.length ? (
          <>
            <WeightSpark points={s.weightTrend} />
            <div className="mt-2 space-y-1">
              {s.weightTrend.slice(-5).reverse().map((w) => (
                <div key={w.date} className="flex justify-between rounded bg-ink-50 px-2 py-1 text-[11px]">
                  <span>{formatDate(w.date)}</span>
                  <span className="font-semibold">pre {w.pre ?? '—'} · post {w.post ?? '—'}{w.dry ? ` · dry ${w.dry}` : ''}</span>
                </div>
              ))}
            </div>
          </>
        ) : <EmptyState title="No weights recorded yet" hint="Weights are captured at every session" />}
      </Section>

      <div className="lg:col-span-3">
        <Section title="Recent sessions">
          {!d.sessions.length ? <EmptyState title="No sessions yet" /> : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Session</th><th>Date</th><th>Machine</th><th>Doctor</th><th>Nurse</th><th>Duration</th><th>Pre</th><th>Post</th><th>UF goal</th><th>UF removed</th><th>Status</th></tr></thead>
                <tbody>
                  {d.sessions.slice(0, 8).map((x) => (
                    <tr key={x._id}>
                      <td><Link className="font-mono text-[11px] text-brand-600 hover:underline" to={`/dialysis/session/${x._id}`}>{x.sessionNumber}</Link></td>
                      <td className="text-[11px]">{formatDate(x.sessionDate)}</td>
                      <td className="text-[11px]">{x.machineId?.code || '—'}</td>
                      <td className="text-[11px]">{x.doctorId?.name || '—'}</td>
                      <td className="text-[11px]">{x.nurseId?.name || '—'}</td>
                      <td className="text-[11px] tabular-nums">{x.durationMinutes ? `${Math.floor(x.durationMinutes / 60)}h ${x.durationMinutes % 60}m` : '—'}</td>
                      <td className="text-[11px] tabular-nums">{x.preWeightKg ?? '—'}</td>
                      <td className="text-[11px] tabular-nums">{x.postWeightKg ?? '—'}</td>
                      <td className="text-[11px] tabular-nums">{x.ufGoalMl ?? '—'}</td>
                      <td className="text-[11px] tabular-nums">{x.ufRemovedMl ?? '—'}</td>
                      <td><StatusBadge status={x.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

const StatusBadge = ({ status }) => (
  <span className={cn(
    'badge ring-1 ring-inset',
    ['COMPLETED', 'BILLED', 'CLOSED'].includes(status) ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : ['IN_PROGRESS', 'CONNECTED'].includes(status) ? 'bg-rose-50 text-rose-700 ring-rose-200'
        : status === 'CANCELLED' || status === 'NO_SHOW' ? 'bg-ink-100 text-ink-500 ring-ink-200'
          : 'bg-blue-50 text-blue-700 ring-blue-200',
  )}
  >
    {String(status).replace(/_/g, ' ')}
  </span>
);

function WeightSpark({ points }) {
  const values = points.map((p) => Number(p.post ?? p.pre ?? 0)).filter(Boolean);
  if (values.length < 2) return null;
  const min = Math.min(...values); const max = Math.max(...values);
  const range = max - min || 1;
  const path = values.map((v, i) => {
    const x = (i / (values.length - 1)) * 100;
    const y = 30 - ((v - min) / range) * 26;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg viewBox="0 0 100 32" className="h-16 w-full">
      <path d={path} fill="none" stroke="#22d3ee" strokeWidth="1.5" />
      {values.map((v, i) => (
        <circle key={i} cx={(i / (values.length - 1)) * 100} cy={30 - ((v - min) / range) * 26} r="1.2" fill="#38bdf8" />
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------- SESSIONS
function SessionsTab({ d }) {
  return (
    <Section title="Dialysis session history" hint="Append-only — every completed session stays traceable">
      {!d.sessions.length ? <EmptyState title="No sessions yet" /> : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr><th>Session No</th><th>Date</th><th>Shift</th><th>Machine</th><th>Station</th><th>Doctor</th><th>Nurse</th>
                <th>Duration</th><th>Pre wt</th><th>Post wt</th><th>UF goal</th><th>UF removed</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {d.sessions.map((x) => (
                <tr key={x._id}>
                  <td className="font-mono text-[11px] font-semibold text-brand-700">{x.sessionNumber}</td>
                  <td className="text-[11px]">{formatDate(x.sessionDate)}</td>
                  <td className="text-[11px]">{x.shift}</td>
                  <td className="text-[11px]">{x.machineId?.code || '—'}</td>
                  <td className="text-[11px]">{x.stationId?.code || '—'}</td>
                  <td className="text-[11px]">{x.doctorId?.name || '—'}</td>
                  <td className="text-[11px]">{x.nurseId?.name || '—'}</td>
                  <td className="text-[11px] tabular-nums">{x.durationMinutes ?? '—'}</td>
                  <td className="text-[11px] tabular-nums">{x.preWeightKg ?? '—'}</td>
                  <td className="text-[11px] tabular-nums">{x.postWeightKg ?? '—'}</td>
                  <td className="text-[11px] tabular-nums">{x.ufGoalMl ?? '—'}</td>
                  <td className="text-[11px] tabular-nums">{x.ufRemovedMl ?? '—'}</td>
                  <td><StatusBadge status={x.status} /></td>
                  <td><Link className="btn-secondary px-2 py-1 text-[11px]" to={`/dialysis/session/${x._id}`}>Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------- PRESCRIPTION
function PrescriptionTab({ d, onPrescribe }) {
  const active = d.prescriptions?.find((x) => x.status === 'ACTIVE') || d.prescriptions?.[0];
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    durationMinutes: active?.durationMinutes || 240,
    bloodFlowRate: active?.bloodFlowRate || 300,
    dialysateFlowRate: active?.dialysateFlowRate || 500,
    targetDryWeightKg: d.patient.dryWeightKg || '',
    ultrafiltrationGoalMl: active?.ultrafiltrationGoalMl ?? 2500,
    maxUltrafiltrationMl: active?.maxUltrafiltrationMl ?? 3500,
    dialyserType: active?.dialyserType || 'FX800',
    heparinPrimeUnits: active?.heparinPrimeUnits ?? 5000,
    frequencyPerWeek: d.patient.sessionsPerWeek || 2,
  });

  return (
    <div className="space-y-4">
      <Section
        title="Active prescription"
        right={<button className="btn-primary text-xs" onClick={() => setOpen((v) => !v)}>Write prescription</button>}
      >
        {!active ? <EmptyState title="No active prescription" hint="A session cannot be scheduled until the nephrologist prescribes" /> : (
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            {[
              ['Prescription no', active.prescriptionNumber], ['Prescribed by', active.prescribedByName],
              ['Date', formatDate(active.prescribedAt)], ['Modality', active.modality],
              ['Duration', `${active.durationMinutes} min`], ['Blood flow', `${active.bloodFlowRate} ml/min`],
              ['Dialysate flow', `${active.dialysateFlowRate} ml/min`], ['Dialyser', active.dialyserType],
              ['Dry weight', active.targetDryWeightKg ? `${active.targetDryWeightKg} kg` : '—'],
              ['UF goal', active.ultrafiltrationGoalMl ? `${active.ultrafiltrationGoalMl} ml` : '—'],
              ['Max UF', active.maxUltrafiltrationMl ? `${active.maxUltrafiltrationMl} ml` : '—'],
              ['Heparin prime', active.heparinPrimeUnits ? `${active.heparinPrimeUnits} U` : '—'],
            ].map(([l, v]) => (
              <div key={l} className="rounded-lg bg-ink-50 p-2">
                <div className="text-[10px] uppercase tracking-wide text-ink-500">{l}</div>
                <div className="font-semibold text-ink-900">{v ?? '—'}</div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {open && (
        <Section title="New dialysis prescription">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.keys(form).map((k) => (
              <label key={k} className="label">
                {k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}
                <input
                  className="input mt-1"
                  type="number"
                  value={form[k]}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value === '' ? '' : Number(e.target.value) })}
                />
              </label>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-ink-500">
            Signed by {d.patient.nephrologistId?.name || 'the signed-in doctor'}. The previous prescription is automatically marked modified and kept in history.
          </p>
          <button
            className="btn-primary mt-3"
            disabled={onPrescribe.isPending}
            onClick={() => onPrescribe.mutate({
              ...form,
              prescribedBy: d.patient.nephrologistId?._id,
              targetDryWeightKg: form.targetDryWeightKg === '' ? undefined : Number(form.targetDryWeightKg),
            })}
          >
            {onPrescribe.isPending ? <Spinner className="h-4 w-4 text-white" /> : <ClipboardList className="h-4 w-4" />} Save prescription
          </button>
        </Section>
      )}

      <Section title="Prescription history">
        {!d.prescriptions.length ? <EmptyState title="No prescriptions yet" /> : (
          <div className="space-y-1.5">
            {d.prescriptions.map((x) => (
              <div key={x._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ink-50 px-3 py-2 text-xs">
                <span className="font-mono text-[11px] font-semibold text-brand-700">{x.prescriptionNumber}</span>
                <span>{formatDate(x.prescribedAt)} · {x.prescribedBy?.name || x.prescribedByName}</span>
                <span>Qb {x.bloodFlowRate} · {x.durationMinutes} min · UF {x.ultrafiltrationGoalMl ?? '—'} ml</span>
                <span className="badge bg-white text-ink-600 ring-1 ring-ink-200">{x.status}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------- VITALS
function VitalsTab({ d }) {
  const rows = d.sessions.flatMap((s) => (s.vitals || []).map((v) => ({ ...v, sessionNumber: s.sessionNumber })));
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Section title="Session vitals" hint="Pre and post dialysis readings">
        <div className="space-y-1.5">
          {d.sessions.slice(0, 10).map((s) => (
            <div key={s._id} className="rounded-lg bg-ink-50 px-3 py-2 text-xs">
              <div className="flex justify-between">
                <span className="font-mono text-[11px] font-semibold text-brand-700">{s.sessionNumber}</span>
                <span className="text-[10px] text-ink-500">{formatDate(s.sessionDate)}</span>
              </div>
              <div className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-4">
                <Vital label="Pre BP" value={s.preAssessment?.bpSystolic ? `${s.preAssessment.bpSystolic}/${s.preAssessment.bpDiastolic}` : '—'} />
                <Vital label="Pulse" value={s.preAssessment?.pulse ?? '—'} />
                <Vital label="Post BP" value={s.postAssessment?.bpSystolic ? `${s.postAssessment.bpSystolic}/${s.postAssessment.bpDiastolic}` : '—'} />
                <Vital label="Condition" value={s.postAssessment?.condition || s.preAssessment?.generalCondition || '—'} />
              </div>
            </div>
          ))}
          {!d.sessions.length && <EmptyState title="No sessions" />}
        </div>
      </Section>

      <Section title="Intra-dialysis monitoring" hint="Machine and patient parameters recorded during treatment">
        {!rows.length ? <EmptyState title="No monitoring entries" /> : (
          <div className="max-h-96 overflow-y-auto">
            <table className="table">
              <thead><tr><th>Time</th><th>BP</th><th>Pulse</th><th>SpO2</th><th>Qb</th><th>Qd</th><th>UF</th></tr></thead>
              <tbody>
                {rows.slice(-40).reverse().map((v, i) => (
                  <tr key={i}>
                    <td className="text-[11px]">{formatDateTime(v.at)}</td>
                    <td className="text-[11px] tabular-nums">{v.bpSystolic || '—'}/{v.bpDiastolic || '—'}</td>
                    <td className="text-[11px] tabular-nums">{v.pulse ?? '—'}</td>
                    <td className={cn('text-[11px] tabular-nums', v.spo2 < 90 && 'font-bold text-rose-600')}>{v.spo2 ?? '—'}</td>
                    <td className="text-[11px] tabular-nums">{v.bloodFlowRate ?? '—'}</td>
                    <td className="text-[11px] tabular-nums">{v.dialysateFlowRate ?? '—'}</td>
                    <td className="text-[11px] tabular-nums">{v.ufRemovedMl ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

const Vital = ({ label, value }) => (
  <div><span className="text-[10px] uppercase tracking-wide text-ink-500">{label}</span>{' '}
    <span className="font-semibold text-ink-900">{value}</span>
  </div>
);

// ---------------------------------------------------------------- LAB
function LabTab({ d }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Section title="Recent laboratory results" hint="Includes every lab order for this patient across the hospital">
        {!d.labs.length ? <EmptyState title="No lab results" /> : (
          <div className="space-y-1.5">
            {d.labs.slice(0, 20).map((l) => (
              <div key={l._id} className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2 text-xs">
                <span className="font-medium text-ink-900">{l.labTestId?.name || l.testName}</span>
                <span className="text-[11px] text-ink-500">{l.status} · {formatDate(l.enteredAt || l.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
      <Section title="Clinical notes" hint="Written by the nephrologist and nursing team">
        {!d.clinicalNotes.length ? <EmptyState title="No clinical notes" /> : (
          <div className="space-y-1.5">
            {d.clinicalNotes.slice(0, 15).map((n) => (
              <div key={n._id} className="rounded-lg bg-ink-50 px-3 py-2 text-xs">
                <div className="flex justify-between text-[10px] text-ink-500">
                  <span className="font-semibold uppercase tracking-wide">{String(n.noteType).replace(/_/g, ' ')}</span>
                  <span>{formatDate(n.createdAt)}</span>
                </div>
                <p className="mt-0.5 text-ink-800">{n.title ? `${n.title} — ` : ''}{n.body}</p>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------- MEDICATIONS
function MedicationsTab({ d }) {
  const meds = d.sessions.flatMap((s) => (s.medicationsGiven || []).map((m) => ({ ...m, sessionNumber: s.sessionNumber, at2: m.at })));
  return (
    <Section title="Medications & injections given during dialysis">
      {!meds.length ? <EmptyState title="No medication recorded" hint="Saline, heparin, antispasmodics and drugs given mid-session appear here" /> : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Session</th><th>Drug</th><th>Dose</th><th>Route</th><th>Given at</th></tr></thead>
            <tbody>
              {meds.map((m, i) => (
                <tr key={i}>
                  <td className="font-mono text-[11px] text-brand-700">{m.sessionNumber}</td>
                  <td className="text-xs font-medium text-ink-900">{m.name}</td>
                  <td className="text-[11px]">{m.dose}</td>
                  <td className="text-[11px]">{m.route}</td>
                  <td className="text-[11px]">{formatDateTime(m.at2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------- ACCESS
function AccessTab({ d, patientId }) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['dialysis-360'] });
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ accessType: 'AV_FISTULA', side: 'LEFT', site: '' });
  const [editing, setEditing] = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [historyFor, setHistoryFor] = useState(null);
  const [decommission, setDecommission] = useState(null);

  // the vocabulary is hospital-configured, so the registry must read it rather
  // than hard-code a list that drifts from the server's validation
  const cfg = useQuery({
    queryKey: ['dialysis-config'],
    queryFn: async () => (await api.get('/dialysis/config')).data.data,
  });
  const accessCfg = cfg.data?.access || {};
  const accessTypes = cfg.data?.prescription?.accessTypes || ['AV_FISTULA', 'AV_GRAFT', 'CVC', 'PD_CATHETER', 'BUTTON_HOLE'];
  const statuses = accessCfg.statuses || ['NEW', 'PATENT', 'DYSFUNCTIONAL', 'STENOSIS', 'THROMBOSIS', 'INFECTION', 'ANEURYSM', 'NEEDS_REVISION', 'DECOMMISSIONED'];
  const siteConditions = accessCfg.siteConditions || ['NORMAL'];
  const attentionSigns = accessCfg.attentionSigns || [];
  const patencyResults = accessCfg.patencyResults || ['NOT_ASSESSED'];

  const create = useMutation({
    mutationFn: async () => (await api.post('/dialysis/access', { ...form, patientId })).data.data,
    onSuccess: () => { toast.success('Access recorded'); setShow(false); refresh(); },
    onError: (e) => toast.error(apiError(e)),
  });
  const update = useMutation({
    mutationFn: async ({ id, ...body }) => (await api.patch(`/dialysis/access/${id}`, body)).data.data,
    onSuccess: () => { toast.success('Access record updated'); setEditing(null); setDecommission(null); refresh(); },
    onError: (e) => toast.error(apiError(e)),
  });
  const assess = useMutation({
    mutationFn: async ({ id, ...body }) => (await api.post(`/dialysis/access/${id}/assessments`, body)).data.data,
    onSuccess: (r) => {
      toast.success('Access assessment recorded', { description: `Registry status is now ${r.access?.status}.` });
      setAssessing(null);
      historyFor && setHistoryFor(historyFor);
      refresh();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const hist = useQuery({
    queryKey: ['dialysis-access-history', historyFor?._id],
    queryFn: async () => (await api.get(`/dialysis/access/${historyFor._id}/history`)).data.data,
    enabled: Boolean(historyFor),
  });

  return (
    <Section
      title="Vascular access registry"
      right={<button className="btn-secondary text-xs" onClick={() => setShow((v) => !v)}>Record access</button>}
    >
      {show && (
        <div className="mb-3 flex flex-wrap items-end gap-2 rounded-xl bg-ink-50 p-3">
          <label className="label">Type
            <select className="select mt-1" value={form.accessType} onChange={(e) => setForm({ ...form, accessType: e.target.value })}>
              {accessTypes.map((x) => <option key={x}>{x}</option>)}
            </select>
          </label>
          <label className="label">Side
            <select className="select mt-1" value={form.side} onChange={(e) => setForm({ ...form, side: e.target.value })}>
              <option>LEFT</option><option>RIGHT</option>
            </select>
          </label>
          <label className="label">Site / notes
            <input className="input mt-1" value={form.site} onChange={(e) => setForm({ ...form, site: e.target.value })} placeholder="Radiocephalic AVF…" />
          </label>
          <button className="btn-primary" disabled={create.isPending} onClick={() => create.mutate()}>Save</button>
        </div>
      )}

      {!d.access.length ? <EmptyState title="No access recorded" /> : (
        <div className="space-y-1.5">
          {d.access.map((a) => {
            const dead = a.status === 'DECOMMISSIONED';
            return (
              <div key={a._id} className={cn('rounded-lg border px-3 py-2 text-xs', dead ? 'border-ink-200 bg-ink-50 opacity-80' : 'border-ink-100')}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-ink-900">
                    {String(a.accessType).replace(/_/g, ' ')} · {a.side}
                    {a.isPrimary && <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider text-brand-600">primary</span>}
                  </span>
                  <span className={cn('badge', a.status === 'PATENT' ? 'bg-emerald-50 text-emerald-700' : dead ? 'bg-ink-100 text-ink-500' : 'bg-amber-50 text-amber-700')}>{a.status}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-ink-500">
                  Created {formatDate(a.createdAt)}{a.site ? ` · ${a.site}` : ''}{a.lastAssessedAt ? ` · last assessed ${formatDate(a.lastAssessedAt)}` : ''}{a.totalUses ? ` · ${a.totalUses} uses` : ''}
                </div>
                {a.notes && <div className="mt-0.5 text-[11px] text-ink-600">{a.notes}</div>}
                {dead && a.decommissionedAt && (
                  <div className="mt-0.5 text-[11px] font-semibold text-ink-600">
                    Retired {formatDate(a.decommissionedAt)}{a.decommissionReason ? ` — ${a.decommissionReason}` : ''}
                  </div>
                )}
                {a.complicationHistory?.length > 0 && (
                  <div className="mt-1 text-[11px] text-rose-600">{a.complicationHistory.slice(-2).join(' · ')}</div>
                )}

                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button className="btn-secondary px-2 py-0.5 text-[10px]" onClick={() => setAssessing(a)}>Record assessment</button>
                  <button className="btn-secondary px-2 py-0.5 text-[10px]" onClick={() => setHistoryFor(a)}>History</button>
                  <button className="btn-secondary px-2 py-0.5 text-[10px]" onClick={() => setEditing({ ...a })}>Edit</button>
                  {!dead && (
                    <button className="btn-secondary px-2 py-0.5 text-[10px] text-rose-600" onClick={() => setDecommission(a)}>Decommission</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ---------- EDIT ---------- */}
      {editing && (
        <Modal title={`Edit access — ${String(editing.accessType).replace(/_/g, ' ')} ${editing.side}`} icon={Pencil} onClose={() => setEditing(null)}>
          <div className="grid grid-cols-2 gap-3">
            {[
              ['Site', 'site', 'text'], ['Anastomosis', 'anastomosis', 'text'],
              ['Graft material', 'graftMaterial', 'text'], ['Catheter type', 'catheterType', 'text'],
            ].map(([label, key]) => (
              <label key={key} className="label">{label}
                <input className="input mt-1" value={editing[key] || ''} onChange={(e) => setEditing({ ...editing, [key]: e.target.value })} />
              </label>
            ))}
            <label className="label">Status
              <select className="select mt-1" value={editing.status || 'NEW'} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>
                {statuses.filter((s) => s !== 'DECOMMISSIONED').map((x) => <option key={x}>{x}</option>)}
              </select>
            </label>
            <label className="mt-6 flex items-center gap-2 text-[11px] text-ink-700">
              <input type="checkbox" checked={Boolean(editing.isPrimary)} onChange={(e) => setEditing({ ...editing, isPrimary: e.target.checked })} />
              Primary access for this patient
            </label>
          </div>
          <label className="label mt-2 block">Notes
            <textarea className="input mt-1" rows={2} value={editing.notes || ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
          </label>
          <div className="mt-3 flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button
              className="btn-primary" disabled={update.isPending}
              onClick={() => update.mutate({
                id: editing._id, site: editing.site, anastomosis: editing.anastomosis,
                graftMaterial: editing.graftMaterial, catheterType: editing.catheterType,
                status: editing.status, isPrimary: Boolean(editing.isPrimary), notes: editing.notes,
              })}
            >
              {update.isPending ? <Spinner className="h-4 w-4 text-white" /> : null} Save changes
            </button>
          </div>
        </Modal>
      )}

      {/* ---------- DECOMMISSION ---------- */}
      {decommission && (
        <Modal title={`Decommission access — ${String(decommission.accessType).replace(/_/g, ' ')} ${decommission.side}`} icon={Power} onClose={() => setDecommission(null)}>
          <p className="mb-3 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
            A decommissioned access stops being usable but stays on the record. It also stops blocking the side, so a
            failed catheter can be replaced.
          </p>
          <label className="label">Reason (kept on the record)
            <textarea className="input mt-1" rows={2} value={decommission.notes || ''} onChange={(e) => setDecommission({ ...decommission, notes: e.target.value })} />
          </label>
          <div className="mt-3 flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setDecommission(null)}>Cancel</button>
            <button
              className="btn-primary" disabled={update.isPending || (decommission.notes || '').trim().length < 3}
              onClick={() => update.mutate({ id: decommission._id, status: 'DECOMMISSIONED', notes: decommission.notes })}
            >
              {update.isPending ? <Spinner className="h-4 w-4 text-white" /> : null} Decommission access
            </button>
          </div>
        </Modal>
      )}

      {/* ---------- ASSESSMENT ---------- */}
      {assessing && (
        <AccessAssessmentForm
          access={assessing}
          vocab={{ siteConditions, attentionSigns, patencyResults, statuses }}
          pending={assess.isPending}
          onCancel={() => setAssessing(null)}
          onSubmit={(body) => assess.mutate({ id: assessing._id, ...body })}
        />
      )}

      {/* ---------- HISTORY ---------- */}
      {historyFor && (
        <Modal title={`Access history — ${String(historyFor.accessType).replace(/_/g, ' ')} ${historyFor.side}`} icon={History} onClose={() => setHistoryFor(null)} wide>
          {hist.isLoading ? <LoadingState label="Loading access history…" /> : !hist.data?.assessments?.length ? (
            <EmptyState title="No assessment recorded yet" hint="Record the first access assessment" />
          ) : (
            <>
              <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ['Assessments', hist.data.summary?.totalAssessments],
                  ['Needing intervention', hist.data.summary?.requiringIntervention],
                  ['Current status', hist.data.summary?.currentStatus || '—'],
                  ['First assessed', hist.data.summary?.firstAssessedAt ? formatDate(hist.data.summary.firstAssessedAt) : '—'],
                ].map(([l, v]) => (
                  <div key={l} className="rounded-lg bg-ink-50 px-2.5 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">{l}</div>
                    <div className="text-sm font-bold text-ink-900">{v ?? 0}</div>
                  </div>
                ))}
              </div>
              <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
                {hist.data.assessments.map((a, i) => (
                  <div key={a._id || i} className={cn('rounded-lg border px-2.5 py-2 text-[11px]', a.requiresIntervention ? 'border-rose-200 bg-rose-50' : 'border-ink-200')}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-ink-900">{formatDate(a.assessedAt)}</span>
                      <span className="text-ink-500">
                        {a.patency ? String(a.patency).replace(/_/g, ' ').toLowerCase() : ''}
                        {a.accessStatusAfter ? ` → ${a.accessStatusAfter}` : ''}
                      </span>
                    </div>
                    <div className="mt-0.5 text-ink-600">
                      Site {String(a.siteCondition || '—').toLowerCase()}
                      {a.attentionSigns?.length ? ` · signs needing attention: ${a.attentionSigns.map((s) => String(s).replace(/_/g, ' ').toLowerCase()).join(', ')}` : ''}
                    </div>
                    {a.assessedAsUsable === false && <div className="font-semibold text-rose-700">Assessed as not usable for dialysis</div>}
                    {a.nursingPlan && <div className="text-ink-600">Plan: {a.nursingPlan}</div>}
                    {a.interventionPlan && <div className="text-ink-600">Intervention: {a.interventionPlan}</div>}
                    {a.reportedToDoctor && <div className="text-ink-500">Reported to the nephrologist</div>}
                    {a.assessedBy?.name && <div className="text-ink-500">by {a.assessedBy.name}</div>}
                  </div>
                ))}
              </div>
            </>
          )}
        </Modal>
      )}
    </Section>
  );
}

/** spec 15 — a dated, structured access assessment, not a free-text note. */
function AccessAssessmentForm({ access, vocab, pending, onCancel, onSubmit }) {
  const [f, setF] = useState({
    siteCondition: 'NORMAL', attentionSigns: [], patency: 'NOT_ASSESSED',
    thrillPalpable: true, bruitAudible: true, otherSign: '',
    nursingNotes: '', nursingPlan: '', reportedToDoctor: false,
    assessedAsUsable: true, requiresIntervention: false, interventionPlan: '',
    accessStatusAfter: 'PATENT',
  });
  const toggleSign = (s) => setF((p) => ({
    ...p, attentionSigns: p.attentionSigns.includes(s) ? p.attentionSigns.filter((x) => x !== s) : [...p.attentionSigns, s],
  }));
  return (
    <Modal title="Record access assessment" icon={ClipboardCheck} onClose={onCancel} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="label">Site condition
          <select className="select mt-1" value={f.siteCondition} onChange={(e) => setF({ ...f, siteCondition: e.target.value })}>
            {vocab.siteConditions.map((x) => <option key={x}>{x}</option>)}
          </select>
        </label>
        <label className="label">Patency
          <select className="select mt-1" value={f.patency} onChange={(e) => setF({ ...f, patency: e.target.value })}>
            {vocab.patencyResults.map((x) => <option key={x}>{x}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-3">
        <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-ink-500">Signs needing attention</div>
        <div className="flex flex-wrap gap-1.5">
          {vocab.attentionSigns.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleSign(s)}
              className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                f.attentionSigns.includes(s) ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-ink-200 text-ink-600 hover:bg-ink-50')}
            >
              {String(s).replace(/_/g, ' ').toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-ink-700">
        {[['thrillPalpable', 'Thrill palpable'], ['bruitAudible', 'Bruit audible'], ['reportedToDoctor', 'Reported to the nephrologist']].map(([k, label]) => (
          <label key={k} className="flex items-center gap-1.5">
            <input type="checkbox" checked={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} />
            {label}
          </label>
        ))}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="label">Nursing notes
          <textarea className="input mt-1" rows={2} value={f.nursingNotes} onChange={(e) => setF({ ...f, nursingNotes: e.target.value })} />
        </label>
        <label className="label">Nursing plan
          <input className="input mt-1" value={f.nursingPlan} onChange={(e) => setF({ ...f, nursingPlan: e.target.value })} placeholder="e.g. recheck thrill before connecting" />
        </label>
      </div>

      <label className="label mt-3 block">Other sign
        <input className="input mt-1" value={f.otherSign} onChange={(e) => setF({ ...f, otherSign: e.target.value })} />
      </label>

      <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-ink-700">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={f.assessedAsUsable} onChange={(e) => setF({ ...f, assessedAsUsable: e.target.checked })} />
          Usable for dialysis today
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={f.requiresIntervention} onChange={(e) => setF({ ...f, requiresIntervention: e.target.checked })} />
          Needs intervention
        </label>
      </div>

      {f.requiresIntervention && (
        <label className="label mt-2 block">Intervention plan
          <input className="input mt-1" value={f.interventionPlan} onChange={(e) => setF({ ...f, interventionPlan: e.target.value })} placeholder="e.g. vascular referral, doppler this week" />
        </label>
      )}

      <label className="label mt-3 block">Registry status after this assessment
        <select className="select mt-1" value={f.accessStatusAfter} onChange={(e) => setF({ ...f, accessStatusAfter: e.target.value })}>
          {vocab.statuses.filter((s) => s !== 'DECOMMISSIONED').map((x) => <option key={x}>{x}</option>)}
        </select>
      </label>

      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onCancel} disabled={pending}>Cancel</button>
        <button className="btn-primary" disabled={pending} onClick={() => onSubmit(f)}>
          {pending ? <Spinner className="h-4 w-4 text-white" /> : <ClipboardCheck className="h-4 w-4" />} Record assessment
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- COMPLICATIONS
function ComplicationsTab({ d }) {
  const rows = d.sessions.flatMap((s) => (s.complications || []).map((c) => ({ ...c, session: s })));
  return (
    <Section title="Complication log" hint="Every event is kept permanently with its management and resolution">
      {!rows.length ? <EmptyState title="No complications recorded" hint="A clean dialysis history" /> : (
        <div className="space-y-1.5">
          {rows.map((c, i) => (
            <div key={i} className={cn('rounded-lg border px-3 py-2 text-xs', c.resolved ? 'border-ink-100' : 'border-rose-300 bg-rose-50')}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-ink-900">
                  <TriangleAlert className="mr-1 inline h-3.5 w-3.5 text-rose-500" />
                  {c.type} · {c.severity}
                </span>
                <span className="text-[10px] text-ink-500">
                  {c.session.sessionNumber} · {formatDateTime(c.occurredAt)} · {c.resolved ? 'RESOLVED' : 'OPEN'}
                </span>
              </div>
              {c.management && <p className="mt-0.5 text-ink-700">Management: {c.management}</p>}
              {c.medicationGiven?.length > 0 && <p className="text-[11px] text-ink-500">Given: {c.medicationGiven.join(', ')}</p>}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------- CONSUMABLES
function ConsumablesTab({ d }) {
  const rows = d.sessions.flatMap((s) => (s.consumables || []).map((c) => ({ ...c, session: s })));
  return (
    <div className="space-y-4">
      <Section title="Consumables used per session">
        {!rows.length ? <EmptyState title="No consumables recorded" /> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Session</th><th>Date</th><th>Code</th><th>Consumable</th><th>Qty</th><th>Batch</th><th>Amount</th></tr></thead>
              <tbody>
                {rows.map((c, i) => (
                  <tr key={i}>
                    <td className="font-mono text-[11px] text-brand-700">{c.session.sessionNumber}</td>
                    <td className="text-[11px]">{formatDate(c.session.sessionDate)}</td>
                    <td className="text-[11px]">{c.code}</td>
                    <td className="text-xs text-ink-900">{c.name}</td>
                    <td className="text-[11px] tabular-nums">{c.quantity} {c.unit}</td>
                    <td className="text-[11px]">{c.batchNumber || '—'}</td>
                    <td className="text-[11px] tabular-nums">{rupees(c.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      <Section title="Catalogue & live stock">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {d.consumables.map((c) => (
            <div key={c._id} className={cn('rounded-lg p-2 text-xs', c.stockQty <= c.reorderLevel ? 'bg-amber-50' : 'bg-ink-50')}>
              <div className="font-semibold text-ink-900">{c.name}</div>
              <div className="text-[10px] text-ink-500">{c.code} · {c.category}</div>
              <div className="mt-1 text-sm font-bold tabular-nums text-ink-900">{c.stockQty} <span className="text-[10px] font-normal text-ink-500">{c.unit}</span></div>
              {c.stockQty <= c.reorderLevel && <div className="text-[10px] font-bold text-amber-700">REORDER</div>}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------- BILLING
function BillingTab({ d }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[
          ['Total billed', rupees(d.summary.totalBilled)],
          ['Paid', rupees(d.summary.paidAmount)],
          ['Outstanding', rupees(d.summary.outstanding)],
          ['Sessions billed', d.bills.length],
        ].map(([l, v]) => (
          <div key={l} className="card p-3">
            <div className="text-[10px] uppercase tracking-wider text-ink-500">{l}</div>
            <div className="text-lg font-bold tabular-nums text-ink-900">{v}</div>
          </div>
        ))}
      </div>
      <Section title="Dialysis bills">
        {!d.bills.length ? <EmptyState title="No dialysis bills yet" /> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Bill</th><th>Date</th><th>Type</th><th>Items</th><th>Net</th><th>Paid</th><th>Due</th><th>Status</th></tr></thead>
              <tbody>
                {d.bills.map((b) => (
                  <tr key={b._id}>
                    <td className="font-mono text-[11px] font-semibold text-brand-700">{b.billNumber}</td>
                    <td className="text-[11px]">{formatDate(b.billDate)}</td>
                    <td className="text-[11px]">{b.billType}</td>
                    <td className="text-[11px]">{(b.items || []).length}</td>
                    <td className="text-[11px] tabular-nums">{rupees(b.netTotal)}</td>
                    <td className="text-[11px] tabular-nums">{rupees(b.paidAmount)}</td>
                    <td className="text-[11px] font-semibold tabular-nums">{rupees(b.dueAmount)}</td>
                    <td><span className="badge bg-ink-100 text-ink-600">{b.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

function PaymentsTab({ d }) {
  return (
    <Section title="Payments received" hint="Every receipt stays linked to its dialysis bill">
      {!d.payments.length ? <EmptyState title="No payments recorded" /> : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Receipt</th><th>Transaction</th><th>Date</th><th>Bill</th><th>Mode</th><th>Amount</th></tr></thead>
            <tbody>
              {d.payments.map((p) => (
                <tr key={p._id}>
                  <td className="font-mono text-[11px] text-brand-700">{p.receiptNumber}</td>
                  <td className="font-mono text-[10px] text-ink-500">{p.transactionId}</td>
                  <td className="text-[11px]">{formatDateTime(p.paidAt)}</td>
                  <td className="font-mono text-[11px]">{p.billId?.billNumber || '—'}</td>
                  <td className="text-[11px]">{p.mode}</td>
                  <td className="text-[11px] font-semibold tabular-nums">{rupees(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function DocumentsTab({ d, rec }) {
  const docs = [
    { name: 'Dialysis registration', detail: `${rec.dialysisNumber} · ${formatDate(rec.registeredAt)}` },
    { name: 'Consent for dialysis', detail: 'Capture in Documents module' },
    { name: 'Nephrologist prescription', detail: d.prescriptions[0]?.prescriptionNumber || '—' },
    { name: 'Access record', detail: d.access[0] ? `${d.access[0].accessType} · ${d.access[0].side}` : 'Not recorded' },
    { name: 'Billing & receipts', detail: `${d.bills.length} bill(s), ${d.payments.length} receipt(s)` },
  ];
  return (
    <Section title="Patient documents" hint="Dialysis record pack">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {docs.map((x) => (
          <Link key={x.name} to={`/patients/${rec.patientId?._id}`} className="rounded-xl border border-ink-100 p-3 hover:border-brand-300 hover:bg-ink-50">
            <FileText className="h-4 w-4 text-brand-600" />
            <div className="mt-1 text-xs font-semibold text-ink-900">{x.name}</div>
            <div className="text-[11px] text-ink-500">{x.detail}</div>
          </Link>
        ))}
      </div>
    </Section>
  );
}

function TimelineTab({ d }) {
  const events = [
    ...d.sessions.map((s) => ({ at: s.sessionDate, type: 'SESSION', title: `${s.sessionNumber} — ${s.status}`, detail: `${s.machineId?.code || 'no machine'} · ${s.shift}` })),
    ...d.prescriptions.map((p) => ({ at: p.prescribedAt, type: 'PRESCRIPTION', title: `Prescription ${p.prescriptionNumber}`, detail: p.prescribedBy?.name || p.prescribedByName })),
    ...d.bills.map((b) => ({ at: b.billDate, type: 'BILL', title: `Bill ${b.billNumber}`, detail: rupees(b.netTotal) })),
    { at: d.patient.registeredAt, type: 'REGISTRATION', title: `Registered as ${d.patient.dialysisNumber}`, detail: d.patient.primaryDiagnosis },
  ].filter((e) => e.at).sort((a, b) => new Date(b.at) - new Date(a.at));

  return (
    <Section title="Patient timeline" hint="Sessions, prescriptions, billing and registration in one chronology">
      <ol className="relative space-y-2 border-l-2 border-ink-200 pl-4">
        {events.map((e, i) => (
          <li key={i} className="relative">
            <span className={cn('absolute -left-[22px] top-1.5 h-2.5 w-2.5 rounded-full', e.type === 'SESSION' ? 'bg-brand-500' : e.type === 'BILL' ? 'bg-emerald-500' : e.type === 'PRESCRIPTION' ? 'bg-cyan-500' : 'bg-ink-400')} />
            <div className="text-[10px] uppercase tracking-wide text-ink-500">{e.type} · {formatDateTime(e.at)}</div>
            <div className="text-xs font-semibold text-ink-900">{e.title}</div>
            <div className="text-[11px] text-ink-500">{e.detail}</div>
          </li>
        ))}
      </ol>
    </Section>
  );
}
