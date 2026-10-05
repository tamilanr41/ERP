import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft, Activity, AlertTriangle, Ban, CheckCircle2, CircleDot, ClipboardCheck, ClipboardList, CreditCard,
  Droplets, FlaskConical, Gauge, HeartPulse, LogIn, Pill, Play, Plug, PlugZap, Receipt, Syringe,
  Timer, TriangleAlert, UserCheck, Wallet, Wind, XCircle,
} from 'lucide-react';
import api, { apiError } from '../../lib/api';
import { LoadingState, ErrorState, EmptyState, Spinner } from '../../components/ui/Feedback';
import { MotionPage } from '../../components/ui/Motion';
import { formatDate, formatDateTime, cn } from '../../lib/utils';
import { POLL } from '../../lib/polling';
import { useIpdRealtime } from '../../lib/useIpdRealtime';

const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const STEPS = [
  { key: 'SCHEDULED', label: 'Scheduled', icon: CalendarIcon },
  { key: 'CHECKED_IN', label: 'Checked in', icon: LogIn },
  { key: 'PRE_ASSESSED', label: 'Pre-assessed', icon: ClipboardCheck },
  { key: 'READY', label: 'Ready', icon: UserCheck },
  { key: 'CONNECTED', label: 'Connected', icon: Plug },
  { key: 'IN_PROGRESS', label: 'Running', icon: Activity },
  { key: 'COMPLETED', label: 'Completed', icon: CheckCircle2 },
  { key: 'BILLED', label: 'Billed', icon: Receipt },
  { key: 'CLOSED', label: 'Closed', icon: CheckCircle2 },
];
const STEP_ORDER = STEPS.map((s) => s.key);

const STATUS_STYLE = {
  SCHEDULED: 'bg-blue-50 text-blue-700 ring-blue-200',
  CHECKED_IN: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  PRE_ASSESSED: 'bg-violet-50 text-violet-700 ring-violet-200',
  READY: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
  CONNECTED: 'bg-amber-50 text-amber-700 ring-amber-200',
  IN_PROGRESS: 'bg-rose-50 text-rose-700 ring-rose-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  BILLED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  CLOSED: 'bg-ink-100 text-ink-600 ring-ink-200',
  CANCELLED: 'bg-ink-100 text-ink-500 ring-ink-200',
  NO_SHOW: 'bg-ink-100 text-ink-500 ring-ink-200',
};

function CalendarIcon(props) {
  return <Timer {...props} />;
}

const Panel = ({ title, icon: Icon, hint, right, children, tone }) => (
  <section className={cn('card p-3.5', tone === 'danger' && 'border-rose-300')}>
    <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink-900">
          {Icon && <Icon className="h-4 w-4 text-brand-600" />} {title}
        </h2>
        {hint && <p className="text-[11px] text-ink-500">{hint}</p>}
      </div>
      {right}
    </div>
    {children}
  </section>
);

const Field = ({ label, children, className }) => (
  <label className={cn('label', className)}>{label}{children}</label>
);

/**
 * Spec 17 — the eight items verified before START DIALYSIS. They are rendered
 * from the server's own answer rather than recomputed here, so the screen and
 * the endpoint can never disagree about whether a session may start. A failed
 * required item does not hide the button: a supervisor can still proceed with a
 * recorded reason, which is how an emergency is handled without a silent gap.
 */
const CheckList = ({ checks, title, tone = 'ok' }) => {
  if (!checks?.length) return null;
  const failed = checks.filter((c) => c.required && !c.ok);
  return (
    <div className={cn('mb-3 rounded-lg border p-2.5', failed.length ? 'border-rose-200 bg-rose-50/60' : 'border-emerald-200 bg-emerald-50/60')}>
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-600">
        {title} · {checks.length - failed.length}/{checks.length} verified
      </div>
      <ul className="grid gap-1 sm:grid-cols-2">
        {checks.map((c) => (
          <li key={c.key} className="flex items-start gap-1.5 text-[11px]">
            {c.ok
              ? <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
              : c.required
                ? <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0 text-rose-600" />
                : <CircleDot className="mt-0.5 h-3 w-3 shrink-0 text-ink-400" />}
            <span className="min-w-0">
              <span className={cn('font-semibold', c.ok ? 'text-ink-700' : c.required ? 'text-rose-700' : 'text-ink-600')}>{c.label}</span>
              {c.detail && <span className="block text-ink-500">{c.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

const OverrideBox = ({ placeholder, onOverride, busy }) => {
  const [reason, setReason] = useState('');
  if (!reason && busy) return null;
  return (
    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
      <Field label="Reason for proceeding without this (recorded and audited)">
        <input className="input mt-1" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={placeholder} />
      </Field>
      <button
        className="btn-secondary mt-2"
        disabled={busy || reason.trim().length < 5}
        onClick={() => onOverride(reason.trim())}
      >
        Start anyway with this reason
      </button>
    </div>
  );
};

const StartChecklist = ({ onOverride }) => {
  const { id } = useParams();
  const [showOverride, setShowOverride] = useState(false);
  const q = useQuery({
    queryKey: ['dialysis-start-context', id],
    queryFn: async () => (await api.get(`/dialysis/sessions/${id}/start-context`)).data.data,
    enabled: Boolean(id),
  });
  const checks = q.data?.checks || [];
  const blocked = (q.data?.blockers || []).length > 0;
  return (
    <>
      {q.isLoading && <div className="mb-2 text-[11px] text-ink-500">Checking the start conditions…</div>}
      <CheckList checks={checks} title="Before starting" />
      {blocked && !showOverride && (
        <button className="btn-secondary" onClick={() => setShowOverride(true)}>
          Cannot start — record an override
        </button>
      )}
      {blocked && showOverride && (
        <OverrideBox busy placeholder="e.g. nephrologist at the machine, nurse covering two bays" onOverride={onOverride} />
      )}
    </>
  );
};

const PostChecklist = ({ onOverride }) => {
  const { id } = useParams();
  const [showOverride, setShowOverride] = useState(false);
  const q = useQuery({
    queryKey: ['dialysis-post-context', id],
    queryFn: async () => (await api.get(`/dialysis/sessions/${id}/post-context`)).data.data,
    enabled: Boolean(id),
  });
  const blocked = (q.data?.blockers || []).length > 0;
  return (
    <>
      <CheckList checks={q.data?.checks || []} title="Before ending the session" />
      {blocked && !showOverride && (
        <button className="btn-secondary" onClick={() => setShowOverride(true)}>
          Cannot complete — record an override
        </button>
      )}
      {blocked && showOverride && (
        <OverrideBox placeholder="e.g. patient collapsed, transferred before the full record" onOverride={onOverride} />
      )}
    </>
  );
};

const num = (v) => (v === '' || v == null ? undefined : Number(v));

/**
 * Mirrors the server's safety thresholds so the nurse sees an alert before
 * saving rather than after. The server stays the authority — this is a preview.
 */
const previewAlerts = (pre, access) => {
  const out = [];
  const n = (v) => (v === '' || v == null ? null : Number(v));
  const w = n(pre.weightKg); const dry = n(pre.dryWeightKg);
  if (w != null && dry != null) {
    const diff = w - dry;
    if (diff > 3) out.push(`Weight is ${diff.toFixed(1)} kg above dry weight`);
    if (diff < -3) out.push(`Weight is ${Math.abs(diff).toFixed(1)} kg below dry weight`);
  }
  const sys = n(pre.bpSystolic);
  if (sys != null && sys < 90) out.push(`Systolic BP ${sys} mmHg is low`);
  if (sys != null && sys > 180) out.push(`Systolic BP ${sys} mmHg is high`);
  const dia = n(pre.bpDiastolic);
  if (dia != null && dia < 60) out.push(`Diastolic BP ${dia} mmHg is low`);
  const pulse = n(pre.pulse);
  if (pulse != null && pulse < 50) out.push(`Pulse ${pulse} bpm is low`);
  if (pulse != null && pulse > 100) out.push(`Pulse ${pulse} bpm is high`);
  const spo2 = n(pre.spo2);
  if (spo2 != null && spo2 < 90) out.push(`SpO2 ${spo2}% is low`);
  const sugar = n(pre.bloodSugar);
  if (sugar != null && sugar < 70) out.push(`Blood sugar ${sugar} mg/dL is low`);
  if (sugar != null && sugar > 300) out.push(`Blood sugar ${sugar} mg/dL is high`);
  if (['POOR', 'UNSTABLE'].includes(pre.generalCondition)) out.push(`General condition recorded as ${String(pre.generalCondition).toLowerCase()}`);
  if (['REDNESS', 'SWELLING', 'BLEEDING', 'THRILL_ABSENT', 'INFECTED', 'COLLAPSED'].includes(access?.status)) out.push('Access site needs attention');
  return out;
};

/** The weight trend is what tells the nurse about fluid overload before a line goes in. */
const WeightTrend = ({ pre, session }) => {
  const w = pre.weightKg === '' ? null : Number(pre.weightKg);
  const dry = pre.dryWeightKg === '' ? (session.prescriptionSnapshot?.targetDryWeightKg ?? null) : Number(pre.dryWeightKg);
  const prev = session.previousSessionWeightKg ?? session.lastPreWeightKg ?? null;
  if (w == null || Number.isNaN(w)) return <span className="text-ink-400">Enter a weight to see the trend.</span>;
  const parts = [];
  if (dry != null && !Number.isNaN(dry)) {
    const diff = w - dry;
    const pct = dry ? (diff / dry) * 100 : 0;
    parts.push(
      <span key="dry" className={cn('font-semibold', diff > 3 ? 'text-rose-700' : diff < -3 ? 'text-amber-700' : 'text-emerald-700')}>
        {diff >= 0 ? '+' : ''}{diff.toFixed(1)} kg ({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%) vs dry weight
      </span>,
    );
  }
  if (prev != null) {
    const diff = w - prev;
    parts.push(
      <span key="prev" className={cn('font-semibold', diff > 2 ? 'text-rose-700' : 'text-emerald-700')}>
        {diff >= 0 ? '+' : ''}{diff.toFixed(1)} kg vs last sitting ({prev} kg)
      </span>,
    );
  }
  if (!parts.length) return <span className="text-ink-400">No dry weight or previous sitting recorded for comparison.</span>;
  return <div className="flex flex-wrap gap-x-4 gap-y-1">{parts}</div>;
};

export default function DialysisSession() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  useIpdRealtime();

  const [elapsed, setElapsed] = useState(0);
  const [monitor, setMonitor] = useState({
    bpSystolic: '', bpDiastolic: '', pulse: '', temperature: '', spo2: '',
    bloodFlowRate: '', dialysateFlowRate: '', ufRemovedMl: '', venousPressure: '', arterialPressure: '', notes: '',
  });
  const [pre, setPre] = useState({
    weightKg: '', dryWeightKg: '', bpSystolic: '', bpDiastolic: '', pulse: '', temperature: '',
    spo2: '', bloodSugar: '', painScore: '', respiratoryRate: '', recentSymptoms: '',
    generalCondition: 'FAIR', edema: false, breathlessness: false,
    chestPain: false, fever: false, notes: '',
    regularMedicationsTaken: true, antihypertensivesHeld: false, anticoagulantHeld: false,
    insulinTaken: false, lastDoseTime: '', discrepancies: '', medicationNotes: '',
    allergiesKnown: true, reactionReported: '', verifiedAgainstRecord: false, allergyNotes: '',
  });
  const [access, setAccess] = useState({ status: 'NORMAL', thrill: true, bruit: true, redness: false, swelling: false, bleeding: false, notes: '' });
  const [ack, setAck] = useState(false);
  const [start, setStart] = useState({ bloodFlowRate: '', dialysateFlowRate: '', dialyserType: '', heparinUnits: '', salineFlushMl: '' });
  const [post, setPost] = useState({
    weightKg: '', bpSystolic: '', bpDiastolic: '', pulse: '', temperature: '', spo2: '',
    condition: 'STABLE', accessSiteCondition: 'NORMAL', outputMl: '', nextPlan: '',
    patientAcceptable: true, dizziness: false, cramps: false, nausea: false, bleedingAtAccess: false,
    ufRemovedMl: '', durationMinutes: '', notes: '',
  });
  const [med, setMed] = useState({ name: '', dose: '', route: 'IV', oxygenGiven: false });
  const [comp, setComp] = useState({ type: '', severity: 'MILD', management: '', medicationGiven: '', notes: '' });
  const [reason, setReason] = useState('');
  const [sessionCharge, setSessionCharge] = useState('');
  const [payment, setPayment] = useState({ amount: '', mode: 'CASH', referenceNumber: '' });
  const [chargeReason, setChargeReason] = useState('');
  const [issue, setIssue] = useState({});
  const [labPick, setLabPick] = useState([]);
  const [checkInPriority, setCheckInPriority] = useState('ROUTINE');
  const [overrideReason, setOverrideReason] = useState('');
  const [ackNote, setAckNote] = useState('');

  const s = useQuery({
    queryKey: ['dialysis-session', id],
    queryFn: async () => (await api.get(`/dialysis/sessions/${id}`)).data.data,
    refetchInterval: (q) => (['CONNECTED', 'IN_PROGRESS'].includes(q.state.data?.status) ? POLL.ACTIVE : POLL.STANDARD),
  });

  // spec 13 — the seven checks are shown before check-in, not discovered after it
  const ctx = useQuery({
    queryKey: ['dialysis-checkin-context', id],
    queryFn: async () => (await api.get(`/dialysis/sessions/${id}/check-in-context`)).data.data,
    enabled: s.data?.status === 'SCHEDULED',
  });

  const consumables = useQuery({
    queryKey: ['dialysis-consumables'],
    queryFn: async () => (await api.get('/dialysis/consumables')).data.data,
  });
  const labs = useQuery({
    queryKey: ['dialysis-session-labs', id],
    queryFn: async () => (await api.get(`/dialysis/sessions/${id}/lab-orders`)).data.data,
  });
  const labTests = useQuery({
    queryKey: ['lab-tests'],
    queryFn: async () => (await api.get('/lab/tests', { params: { limit: 100 } })).data.data,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['dialysis-session', id] });
    qc.invalidateQueries({ queryKey: ['dialysis-session-labs', id] });
    qc.invalidateQueries({ queryKey: ['dialysis-consumables'] });
    qc.invalidateQueries({ queryKey: ['dialysis-command-center'] });
    qc.invalidateQueries({ queryKey: ['dialysis-360'] });
  };

  const act = useMutation({
    mutationFn: async ({ path, body, method = 'post', reset }) => {
      const res = method === 'patch'
        ? await api.patch(`/dialysis/sessions/${id}/${path}`, body)
        : await api.post(`/dialysis/sessions/${id}/${path}`, body);
      return { result: res.data.data, reset };
    },
    onSuccess: ({ reset }) => { toast.success('Session updated'); refresh(); if (typeof reset === 'function') reset(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const issueConsumables = useMutation({
    mutationFn: async (items) => (await api.post(`/dialysis/sessions/${id}/consumables`, { items })).data.data,
    onSuccess: (r) => { toast.success(`${r.issued.length} consumable(s) issued — stock updated`); setIssue({}); refresh(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const orderLabs = useMutation({
    mutationFn: async (items) => (await api.post(`/dialysis/sessions/${id}/lab-orders`, { items: items.map((t) => ({ labTestId: t })) })).data.data,
    onSuccess: (o) => { toast.success(`Lab order ${o.labOrderNumber} raised`); setLabPick([]); refresh(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const running = s.data && ['CONNECTED', 'IN_PROGRESS'].includes(s.data.status);
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => setElapsed(Date.now() - new Date(s.data.startedAt || s.data.connectedAt || Date.now()).getTime()), 1000);
    return () => clearInterval(t);
  }, [running, s.data?.startedAt, s.data?.connectedAt]);

  useEffect(() => {
    if (s.data?.prescriptionSnapshot) {
      const ps = s.data.prescriptionSnapshot;
      setStart((f) => ({
        ...f,
        bloodFlowRate: f.bloodFlowRate || ps.bloodFlowRate || '',
        dialysateFlowRate: f.dialysateFlowRate || ps.dialysateFlowRate || '',
        dialyserType: f.dialyserType || ps.dialyserType || '',
      }));
    }
    if (s.data?.priority) setCheckInPriority(s.data.priority);
  }, [s.data?.prescriptionSnapshot, s.data?.priority]);

  const machineParams = {
    bloodFlowRate: num(start.bloodFlowRate),
    dialysateFlowRate: num(start.dialysateFlowRate),
    dialyserType: start.dialyserType || undefined,
    heparinUnits: num(start.heparinUnits),
    salineFlushMl: num(start.salineFlushMl),
  };

  const postBody = {
    postAssessment: {
      weightKg: num(post.weightKg), bpSystolic: num(post.bpSystolic), bpDiastolic: num(post.bpDiastolic),
      pulse: num(post.pulse), temperature: num(post.temperature), spo2: num(post.spo2), condition: post.condition,
      accessSiteCondition: post.accessSiteCondition, outputMl: num(post.outputMl), nextPlan: post.nextPlan || undefined,
      patientAcceptable: post.patientAcceptable, dizziness: post.dizziness, cramps: post.cramps,
      nausea: post.nausea, bleedingAtAccess: post.bleedingAtAccess, notes: post.notes,
    },
    ufRemovedMl: num(post.ufRemovedMl), durationMinutes: num(post.durationMinutes),
  };

  if (s.isLoading) return <LoadingState label="Loading dialysis session…" />;
  if (s.error) return <ErrorState message={apiError(s.error)} />;

  const d = s.data;
  const st = d.status;
  const stepIdx = STEP_ORDER.indexOf(st);
  const finished = ['CANCELLED', 'NO_SHOW'].includes(st) || st === 'CLOSED';
  const lastReading = (d.vitals || []).slice(-1)[0];
  const pendingItems = Object.entries(issue).filter(([, q]) => Number(q) > 0).map(([cid, q]) => ({ consumableId: cid, quantity: Number(q) }));
  // shown live while the nurse types, so an unsafe reading is never a surprise
  const liveAlerts = ['CHECKED_IN', 'PRE_ASSESSED'].includes(st) ? previewAlerts(pre, access) : [];

  const submitPre = () => act.mutate({
    path: 'pre-assessment',
    body: {
    preAssessment: {
      weightKg: num(pre.weightKg), dryWeightKg: num(pre.dryWeightKg), bpSystolic: num(pre.bpSystolic),
      bpDiastolic: num(pre.bpDiastolic), pulse: num(pre.pulse), temperature: num(pre.temperature),
      spo2: num(pre.spo2), bloodSugar: num(pre.bloodSugar), generalCondition: pre.generalCondition,
      respiratoryRate: num(pre.respiratoryRate), painScore: num(pre.painScore),
      recentSymptoms: pre.recentSymptoms || undefined,
      edema: pre.edema, breathlessness: pre.breathlessness, chestPain: pre.chestPain, fever: pre.fever,
      medicationReview: {
        regularMedicationsTaken: pre.regularMedicationsTaken,
        antihypertensivesHeld: pre.antihypertensivesHeld,
        anticoagulantHeld: pre.anticoagulantHeld,
        insulinTaken: pre.insulinTaken,
        lastDoseTime: pre.lastDoseTime || undefined,
        discrepancies: pre.discrepancies ? pre.discrepancies.split(',').map((x) => x.trim()).filter(Boolean) : [],
        notes: pre.medicationNotes || undefined,
      },
      allergyCheck: {
        allergiesKnown: pre.allergiesKnown,
        reactionReported: pre.reactionReported || undefined,
        verifiedAgainstRecord: pre.verifiedAgainstRecord,
        notes: pre.allergyNotes || undefined,
      },
      notes: pre.notes,
    },
    accessSite: {
      status: access.status, thrill: access.thrill, bruit: access.bruit,
      redness: access.redness, swelling: access.swelling, bleeding: access.bleeding, notes: access.notes,
    },
    acknowledgeCritical: ack,
    acknowledgementNote: ackNote.trim() || undefined,
    },
  });

  return (
    <MotionPage className="p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link to="/dialysis" className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 hover:text-ink-800">
          <ArrowLeft className="h-3.5 w-3.5" /> Command center
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {d.criticalFlag && <span className="badge bg-rose-100 text-rose-700 ring-1 ring-rose-300">{d.criticalFlag.replace(/_/g, ' ')}</span>}
          <span className={cn('badge ring-1 ring-inset', STATUS_STYLE[st])}>{String(st).replace(/_/g, ' ')}</span>
          {['SCHEDULED', 'CHECKED_IN'].includes(st) && (
            <>
              <button className="btn-secondary text-[11px]" disabled={act.isPending} onClick={() => act.mutate({ path: 'no-show', body: { reason: reason || 'Patient did not attend' } })}>No-show</button>
              <button className="btn-secondary text-[11px] text-rose-600" disabled={act.isPending || !reason} onClick={() => act.mutate({ path: 'cancel', body: { reason } })}>Cancel</button>
            </>
          )}
          {['PRE_ASSESSED', 'READY', 'CONNECTED', 'IN_PROGRESS'].includes(st) && (
            <button className="btn-secondary text-[11px] text-rose-600" disabled={act.isPending || !reason} onClick={() => act.mutate({ path: 'cancel', body: { reason } })}>Cancel session</button>
          )}
        </div>
      </div>

      {['SCHEDULED', 'CHECKED_IN', 'PRE_ASSESSED', 'READY', 'CONNECTED', 'IN_PROGRESS'].includes(st) && (
        <div className="card flex flex-wrap items-end gap-2 p-3">
          <label className="label flex-1 min-w-[220px]">
            Reason (required to cancel or mark no-show)
            <input className="input mt-1" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. patient unstable, machine fault…" />
          </label>
        </div>
      )}

      {/* ---------- HEADER ---------- */}
      <div className="card border-l-4 border-l-brand-500 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-bold text-brand-600">{d.sessionNumber}</span>
              <span className="text-lg font-bold text-ink-900">{d.patientId?.firstName} {d.patientId?.lastName}</span>
              <span className="text-xs text-ink-500">{d.patientId?.uhid} · {d.patientId?.age?.years ?? d.patientId?.age ?? '—'} yrs · {d.patientId?.gender} · {d.patientId?.bloodGroup || 'blood group n/a'}</span>
            </div>
            <div className="mt-1 text-[11px] text-ink-500">
              {d.dialysisPatientId?.dialysisNumber} · {d.dialysisPatientId?.primaryDiagnosis || '—'} · {d.shift} shift · {d.priority}
              {d.admissionId ? ` · linked to admission ${d.admissionId.admissionNumber}` : ''}
            </div>
            <div className="mt-1 text-[11px] text-ink-500">
              Machine {d.machineId?.code || '—'} · Station {d.stationId?.code || '—'} · Doctor {d.doctorId?.name || '—'} · Nurse {d.nurseId?.name || '—'}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            {[
              ['Pre wt', d.preWeightKg != null ? `${d.preWeightKg} kg` : '—'],
              ['Post wt', d.postWeightKg != null ? `${d.postWeightKg} kg` : '—'],
              ['UF', `${d.ufRemovedMl ?? 0} / ${d.ufGoalMl ?? 0} ml`],
              ['Elapsed', running ? `${Math.floor(elapsed / 3600000)}h ${Math.floor((elapsed % 3600000) / 60000)}m` : d.durationMinutes ? `${d.durationMinutes} min` : '—'],
            ].map(([l, v]) => (
              <div key={l} className="rounded-lg bg-ink-50 px-3 py-1.5">
                <div className="text-[10px] uppercase tracking-wide text-ink-500">{l}</div>
                <div className="text-sm font-bold tabular-nums text-ink-900">{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ---------- STEPPER ---------- */}
      <div className="card flex flex-wrap items-center gap-1 overflow-x-auto p-2">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          const done = stepIdx > i;
          const active = stepIdx === i;
          return (
            <div key={step.key} className="flex items-center gap-1">
              <div className={cn(
                'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold',
                active ? 'bg-brand-600 text-white' : done ? 'bg-emerald-50 text-emerald-700' : 'bg-ink-50 text-ink-400',
              )}
              >
                <Icon className="h-3.5 w-3.5" /> {step.label}
              </div>
              {i < STEPS.length - 1 && <span className={cn('h-px w-4', done ? 'bg-emerald-300' : 'bg-ink-200')} />}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* ---------- LEFT: NEXT ACTION ---------- */}
        <div className="space-y-4 xl:col-span-2">
          {st === 'SCHEDULED' && (
            <Panel
              title="Pre-arrival verification & check-in"
              icon={LogIn}
              hint={ctx.data
                ? (ctx.data.canCheckIn
                  ? 'All required checks pass. After check-in the patient joins the dialysis waiting list.'
                  : 'Required checks are failing. You can still check the patient in, but the override is recorded against your name.')
                : 'Confirm the patient has arrived at the unit'}
            >
              {ctx.data && (
                <div className="mb-3 space-y-1.5">
                  {ctx.data.checks.map((c) => (
                    <div
                      key={c.key}
                      className={cn(
                        'flex items-start gap-2 rounded-lg border px-2.5 py-1.5',
                        c.ok ? 'border-emerald-200 bg-emerald-50' : c.required ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50',
                      )}
                    >
                      {c.ok
                        ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        : c.required
                          ? <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
                          : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />}
                      <div className="min-w-0">
                        <div className="text-[11px] font-bold text-ink-900">
                          {c.label}
                          {!c.required && <span className="ml-1 font-normal text-ink-500">(optional)</span>}
                        </div>
                        {c.detail && <div className="text-[10px] text-ink-600">{c.detail}</div>}
                      </div>
                    </div>
                  ))}
                  {ctx.data.blockers?.length > 0 && (
                    <div className="rounded-lg bg-rose-50 px-2.5 py-2 text-[11px] text-rose-800">
                      Cannot check in automatically: {ctx.data.blockers.map((b) => b.label).join(', ')}.
                      The server will refuse without a recorded override.
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="Priority">
                  <select className="select mt-1" value={checkInPriority} onChange={(e) => setCheckInPriority(e.target.value)}>
                    {['ROUTINE', 'URGENT', 'EMERGENCY'].map((x) => <option key={x}>{x}</option>)}
                  </select>
                </Field>
                <Field label="Scheduled slot">
                  <input className="input mt-1" readOnly value={d.scheduledStart ? formatDateTime(d.scheduledStart) : '—'} />
                </Field>
              </div>

              {ctx.data && !ctx.data.canCheckIn && (
                <label className="label mt-2 block">
                  Override reason (required while a check is failing)
                  <textarea
                    className="input mt-1" rows={2} value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="Why is the patient being checked in against a failing check?"
                  />
                </label>
              )}

              <button
                className="btn-primary mt-3"
                disabled={act.isPending || (Boolean(ctx.data) && !ctx.data.canCheckIn && overrideReason.trim().length < 3)}
                onClick={() => act.mutate({
                  path: 'check-in',
                  body: { priority: checkInPriority, ...(overrideReason.trim() ? { overrideReason: overrideReason.trim() } : {}) },
                })}
              >
                {act.isPending ? <Spinner className="h-4 w-4 text-white" /> : <LogIn className="h-4 w-4" />}
                {ctx.data?.canCheckIn === false ? 'Check in with override' : 'Check in'}
              </button>
            </Panel>
          )}

          {(st === 'CHECKED_IN' || st === 'PRE_ASSESSED') && (
            <Panel
              title={st === 'PRE_ASSESSED' ? 'Amend the pre-dialysis assessment' : 'Pre-dialysis assessment'}
              icon={ClipboardCheck}
              hint="The system flags abnormal readings, it does not block them. The nurse decides, and the decision is recorded."
            >
              {st === 'PRE_ASSESSED' && d.preAssessment && (
                <div className="mb-3 rounded-xl bg-ink-50 p-2.5 text-[11px] text-ink-600">
                  <div className="mb-1 font-bold uppercase tracking-wider text-ink-500">Currently recorded</div>
                  <div>
                    Weight {d.preWeightKg ?? '—'} kg · BP {d.preAssessment.bpSystolic ?? '—'}/{d.preAssessment.bpDiastolic ?? '—'} ·
                    pulse {d.preAssessment.pulse ?? '—'} · SpO2 {d.preAssessment.spo2 ?? '—'}% · condition {String(d.preAssessment.generalCondition || '—').toLowerCase()}
                  </div>
                  {d.preAssessment.safetyAlerts?.length > 0 && (
                    <div className="mt-1 font-semibold text-rose-700">
                      {d.preAssessment.safetyAlerts.length} alert(s) raised: {d.preAssessment.safetyAlerts.join('; ')}
                    </div>
                  )}
                  <div className="mt-1">
                    Alerts {d.preAssessment.alertsAcknowledged
                      ? <span className="font-semibold text-emerald-700">acknowledged{d.preAssessment.alertsAcknowledgedAt ? ` on ${formatDateTime(d.preAssessment.alertsAcknowledgedAt)}` : ''}</span>
                      : <span className="font-semibold text-rose-700">not yet acknowledged — this session cannot be marked ready</span>}
                  </div>
                  {d.preAssessmentAmendedAt && (
                    <div className="mt-1 text-ink-500">Amended {formatDateTime(d.preAssessmentAmendedAt)}</div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="Weight (kg)"><input className="input mt-1" type="number" step="0.1" value={pre.weightKg} onChange={(e) => setPre({ ...pre, weightKg: e.target.value })} placeholder={d.prescriptionSnapshot?.targetDryWeightKg || ''} /></Field>
                <Field label="Dry weight (kg)"><input className="input mt-1" type="number" step="0.1" value={pre.dryWeightKg} onChange={(e) => setPre({ ...pre, dryWeightKg: e.target.value })} placeholder={d.prescriptionSnapshot?.targetDryWeightKg || ''} /></Field>
                <Field label="BP systolic"><input className="input mt-1" type="number" value={pre.bpSystolic} onChange={(e) => setPre({ ...pre, bpSystolic: e.target.value })} placeholder="120" /></Field>
                <Field label="BP diastolic"><input className="input mt-1" type="number" value={pre.bpDiastolic} onChange={(e) => setPre({ ...pre, bpDiastolic: e.target.value })} placeholder="80" /></Field>
                <Field label="Pulse"><input className="input mt-1" type="number" value={pre.pulse} onChange={(e) => setPre({ ...pre, pulse: e.target.value })} placeholder="80" /></Field>
                <Field label="Temperature (°F)"><input className="input mt-1" type="number" step="0.1" value={pre.temperature} onChange={(e) => setPre({ ...pre, temperature: e.target.value })} placeholder="98.6" /></Field>
                <Field label="SpO2 (%)"><input className="input mt-1" type="number" value={pre.spo2} onChange={(e) => setPre({ ...pre, spo2: e.target.value })} placeholder="98" /></Field>
                <Field label="Blood sugar"><input className="input mt-1" type="number" value={pre.bloodSugar} onChange={(e) => setPre({ ...pre, bloodSugar: e.target.value })} placeholder="110" /></Field>
                <Field label="General condition">
                  <select className="select mt-1" value={pre.generalCondition} onChange={(e) => setPre({ ...pre, generalCondition: e.target.value })}>
                    {['GOOD', 'FAIR', 'POOR', 'UNSTABLE'].map((x) => <option key={x}>{x}</option>)}
                  </select>
                </Field>
                <Field label="Pain score (0-10)"><input className="input mt-1" type="number" min="0" max="10" value={pre.painScore} onChange={(e) => setPre({ ...pre, painScore: e.target.value })} placeholder="0" /></Field>
                <Field label="Respiratory rate"><input className="input mt-1" type="number" value={pre.respiratoryRate} onChange={(e) => setPre({ ...pre, respiratoryRate: e.target.value })} placeholder="16" /></Field>
              </div>
              <label className="label mt-2 block text-[11px]">Symptoms the patient reports today
                <input
                  className="input mt-1" value={pre.recentSymptoms || ''}
                  onChange={(e) => setPre({ ...pre, recentSymptoms: e.target.value })}
                  placeholder="e.g. mild cramps in the left calf since last sitting"
                />
              </label>
              <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-ink-600">
                {['edema', 'breathlessness', 'chestPain', 'fever'].map((k) => (
                  <label key={k} className="flex items-center gap-1.5">
                    <input type="checkbox" checked={pre[k]} onChange={(e) => setPre({ ...pre, [k]: e.target.checked })} />
                    {k === 'chestPain' ? 'Chest pain' : k[0].toUpperCase() + k.slice(1)}
                  </label>
                ))}
              </div>

              {/* the weight trend is what tells the nurse whether this patient is
                  fluid overloaded before a single line is put in */}
              <div className="mt-3 rounded-xl bg-ink-50 p-2.5 text-[11px] text-ink-600">
                <div className="mb-1 font-bold uppercase tracking-wider text-ink-500">Weight against dry weight &amp; last sitting</div>
                <WeightTrend pre={pre} session={d} />
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-ink-200 p-2.5">
                  <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-500">Medication review</div>
                  <label className="flex items-center gap-1.5 text-[11px] text-ink-700">
                    <input type="checkbox" checked={pre.regularMedicationsTaken} onChange={(e) => setPre({ ...pre, regularMedicationsTaken: e.target.checked })} />
                    Regular medications taken as prescribed
                  </label>
                  <label className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-700">
                    <input type="checkbox" checked={pre.antihypertensivesHeld} onChange={(e) => setPre({ ...pre, antihypertensivesHeld: e.target.checked })} />
                    Antihypertensives held before dialysis
                  </label>
                  <label className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-700">
                    <input type="checkbox" checked={pre.anticoagulantHeld} onChange={(e) => setPre({ ...pre, anticoagulantHeld: e.target.checked })} />
                    Anticoagulant held
                  </label>
                  <label className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-700">
                    <input type="checkbox" checked={pre.insulinTaken} onChange={(e) => setPre({ ...pre, insulinTaken: e.target.checked })} />
                    Insulin taken
                  </label>
                  <label className="label mt-1.5 block text-[11px]">Last dose time
                    <input
                      className="input mt-1" value={pre.lastDoseTime || ''}
                      onChange={(e) => setPre({ ...pre, lastDoseTime: e.target.value })}
                      placeholder="e.g. 06:30"
                    />
                  </label>
                  <label className="label mt-1.5 block text-[11px]">Discrepancies (comma separated)
                    <input
                      className="input mt-1" value={pre.discrepancies || ''}
                      onChange={(e) => setPre({ ...pre, discrepancies: e.target.value })}
                      placeholder="e.g. amlodipine dose changed, patient unsure"
                    />
                  </label>
                  <label className="label mt-1.5 block text-[11px]">Notes
                    <input className="input mt-1" value={pre.medicationNotes || ''} onChange={(e) => setPre({ ...pre, medicationNotes: e.target.value })} />
                  </label>
                </div>
                <div className="rounded-xl border border-ink-200 p-2.5">
                  <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-500">Allergy review</div>
                  <label className="flex items-center gap-1.5 text-[11px] text-ink-700">
                    <input type="checkbox" checked={pre.allergiesKnown} onChange={(e) => setPre({ ...pre, allergiesKnown: e.target.checked })} />
                    Allergies known and checked against the chart
                  </label>
                  <div className="mt-1.5 text-[11px]">
                    <span className="text-ink-500">Allergies on record: </span>
                    {d.patientId?.allergies?.length
                      ? d.patientId.allergies.join(', ')
                      : <span className="font-semibold text-emerald-700">none recorded</span>}
                  </div>
                  <label className="label mt-1.5 block text-[11px]">Reaction reported
                    <input
                      className="input mt-1" value={pre.reactionReported || ''}
                      onChange={(e) => setPre({ ...pre, reactionReported: e.target.value })}
                      placeholder="What the patient reports on exposure"
                    />
                  </label>
                  <label className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-700">
                    <input type="checkbox" checked={pre.verifiedAgainstRecord} onChange={(e) => setPre({ ...pre, verifiedAgainstRecord: e.target.checked })} />
                    Verified against the patient record
                  </label>
                  <label className="label mt-1.5 block text-[11px]">Notes
                    <input className="input mt-1" value={pre.allergyNotes || ''} onChange={(e) => setPre({ ...pre, allergyNotes: e.target.value })} />
                  </label>
                </div>
              </div>

              <div className="mt-3 rounded-xl bg-ink-50 p-2.5">
                <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-500">Access site check</div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Field label="Access status">
                    <select className="select mt-1" value={access.status} onChange={(e) => setAccess({ ...access, status: e.target.value })}>
                      {['NORMAL', 'REDNESS', 'SWELLING', 'BLEEDING', 'THRILL_ABSENT', 'INFECTED', 'COLLAPSED'].map((x) => <option key={x}>{x}</option>)}
                    </select>
                  </Field>
                  {['thrill', 'bruit', 'redness', 'swelling', 'bleeding'].map((k) => (
                    <label key={k} className="mt-5 flex items-center gap-1.5 text-[11px] text-ink-600">
                      <input type="checkbox" checked={access[k]} onChange={(e) => setAccess({ ...access, [k]: e.target.checked })} />
                      {k[0].toUpperCase() + k.slice(1)}
                    </label>
                  ))}
                </div>
              </div>

              {/* alerts are advisory, but the nurse has to look at them and own
                  the decision before the session can be moved to ready */}
              {liveAlerts.length > 0 && (
                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-2.5">
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-rose-700">
                    <AlertTriangle className="h-3.5 w-3.5" /> {liveAlerts.length} safety alert(s) from these readings
                  </div>
                  <ul className="list-inside list-disc text-[11px] text-rose-800">
                    {liveAlerts.map((a) => <li key={a}>{a}</li>)}
                  </ul>
                  <p className="mt-1 text-[10px] text-rose-700">
                    Saving is not blocked. Record the assessment, inform the nephrologist, then acknowledge to unlock &ldquo;ready&rdquo;.
                  </p>
                </div>
              )}

              <label className="mt-2 flex items-start gap-1.5 text-[11px] text-ink-600">
                <input type="checkbox" className="mt-0.5" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                <span>Nephrologist has been informed and I accept responsibility to proceed despite abnormal vitals</span>
              </label>
              {ack && (
                <label className="label mt-1.5 block text-[11px]">Acknowledgement note (kept on the record)
                  <input
                    className="input mt-1" value={ackNote}
                    onChange={(e) => setAckNote(e.target.value)}
                    placeholder="e.g. low BP reviewed by Dr. Nair, repeat reading normal"
                  />
                </label>
              )}
              <button
                className="btn-primary mt-3"
                disabled={act.isPending || (ack && ackNote.trim().length < 3)}
                onClick={submitPre}
              >
                {act.isPending ? <Spinner className="h-4 w-4 text-white" /> : <ClipboardCheck className="h-4 w-4" />}
                {st === 'PRE_ASSESSED' ? 'Save amendment' : 'Save pre-assessment'}
              </button>
            </Panel>
          )}

          {st === 'PRE_ASSESSED' && (
            <Panel title="Issue consumables & mark ready" icon={Syringe} hint="Stock reduces atomically; over-issue is rejected by the server">
              <ConsumablePicker items={consumables.data || []} issue={issue} setIssue={setIssue} disabled={!['PRE_ASSESSED', 'READY'].includes(st)} />
              <button
                className="btn-secondary mt-3"
                disabled={issueConsumables.isPending || !pendingItems.length}
                onClick={() => issueConsumables.mutate(pendingItems)}
              >
                {issueConsumables.isPending ? <Spinner className="h-4 w-4" /> : <Syringe className="h-4 w-4" />} Issue {pendingItems.length || ''} item(s)
              </button>
              {d.preAssessment && !d.preAssessment.alertsAcknowledged && (
                <p className="mt-2 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-800">
                  {d.preAssessment.safetyAlerts?.length
                    ? 'Safety alerts are still unacknowledged. Amend the assessment above and tick the acknowledgement, or the server will refuse to mark this session ready.'
                    : 'The assessment is still awaiting review.'}
                </p>
              )}
              <button
                className="btn-primary ml-2 mt-3"
                disabled={act.isPending || Boolean(d.preAssessment && !d.preAssessment.alertsAcknowledged && d.preAssessment.safetyAlerts?.length)}
                onClick={() => act.mutate({ path: 'ready', body: {} })}
              >
                {act.isPending ? <Spinner className="h-4 w-4 text-white" /> : <UserCheck className="h-4 w-4" />} Mark ready for dialysis
              </button>
            </Panel>
          )}


          {st === 'READY' && (
            <Panel title="Connect the patient" icon={Plug} hint="The machine and bay are locked to this session on connect">
              <ConsumablePicker items={consumables.data || []} issue={issue} setIssue={setIssue} />
              <button
                className="btn-secondary mt-3"
                disabled={issueConsumables.isPending || !pendingItems.length}
                onClick={() => issueConsumables.mutate(pendingItems)}
              >
                {issueConsumables.isPending ? <Spinner className="h-4 w-4" /> : <Syringe className="h-4 w-4" />} Issue consumables
              </button>
              <button className="btn-primary ml-2 mt-3" disabled={act.isPending} onClick={() => act.mutate({ path: 'connect', body: {} })}>
                {act.isPending ? <Spinner className="h-4 w-4 text-white" /> : <Plug className="h-4 w-4" />} Connect patient
              </button>
            </Panel>
          )}

          {st === 'CONNECTED' && (
            <Panel title="Start dialysis" icon={Play} hint="Machine parameters default to the nephrologist's prescription">
              <StartChecklist onOverride={(r) => act.mutate({ path: 'start', body: { ...machineParams, overrideReason: r } })} />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <Field label="Blood flow (ml/min)"><input className="input mt-1" type="number" value={start.bloodFlowRate} onChange={(e) => setStart({ ...start, bloodFlowRate: e.target.value })} /></Field>
                <Field label="Dialysate flow"><input className="input mt-1" type="number" value={start.dialysateFlowRate} onChange={(e) => setStart({ ...start, dialysateFlowRate: e.target.value })} /></Field>
                <Field label="Dialyser"><input className="input mt-1" value={start.dialyserType} onChange={(e) => setStart({ ...start, dialyserType: e.target.value })} /></Field>
                <Field label="Heparin (U)"><input className="input mt-1" type="number" value={start.heparinUnits} onChange={(e) => setStart({ ...start, heparinUnits: e.target.value })} /></Field>
                <Field label="Saline flush (ml)"><input className="input mt-1" type="number" value={start.salineFlushMl} onChange={(e) => setStart({ ...start, salineFlushMl: e.target.value })} /></Field>
              </div>
              <button
                className="btn-primary mt-3"
                disabled={act.isPending}
                onClick={() => act.mutate({ path: 'start', body: machineParams })}
              >
                {act.isPending ? <Spinner className="h-4 w-4 text-white" /> : <Play className="h-4 w-4" />} Start dialysis
              </button>
            </Panel>
          )}

          {['CONNECTED', 'IN_PROGRESS'].includes(st) && (
            <>
              <Panel title="Record monitoring" icon={HeartPulse} hint="Every reading is time-stamped and appended to the session chart" right={lastReading ? <span className="text-[11px] text-ink-500">last {formatDateTime(lastReading.at)}</span> : null}>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <Field label="BP"><div className="flex gap-1"><input className="input mt-1" type="number" placeholder="120" value={monitor.bpSystolic} onChange={(e) => setMonitor({ ...monitor, bpSystolic: e.target.value })} /><input className="input mt-1" type="number" placeholder="80" value={monitor.bpDiastolic} onChange={(e) => setMonitor({ ...monitor, bpDiastolic: e.target.value })} /></div></Field>
                  <Field label="Pulse"><input className="input mt-1" type="number" value={monitor.pulse} onChange={(e) => setMonitor({ ...monitor, pulse: e.target.value })} /></Field>
                  <Field label="SpO2 (%)"><input className="input mt-1" type="number" value={monitor.spo2} onChange={(e) => setMonitor({ ...monitor, spo2: e.target.value })} /></Field>
                  <Field label="Blood flow"><input className="input mt-1" type="number" value={monitor.bloodFlowRate} onChange={(e) => setMonitor({ ...monitor, bloodFlowRate: e.target.value })} /></Field>
                  <Field label="Dialysate flow"><input className="input mt-1" type="number" value={monitor.dialysateFlowRate} onChange={(e) => setMonitor({ ...monitor, dialysateFlowRate: e.target.value })} /></Field>
                  <Field label="UF removed (ml)"><input className="input mt-1" type="number" value={monitor.ufRemovedMl} onChange={(e) => setMonitor({ ...monitor, ufRemovedMl: e.target.value })} /></Field>
                  <Field label="Temp (°F)"><input className="input mt-1" type="number" step="0.1" value={monitor.temperature} onChange={(e) => setMonitor({ ...monitor, temperature: e.target.value })} /></Field>
                  <Field label="Art. pressure"><input className="input mt-1" type="number" value={monitor.arterialPressure} onChange={(e) => setMonitor({ ...monitor, arterialPressure: e.target.value })} /></Field>
                  <Field label="Ven. pressure"><input className="input mt-1" type="number" value={monitor.venousPressure} onChange={(e) => setMonitor({ ...monitor, venousPressure: e.target.value })} /></Field>
                  <Field label="Notes"><input className="input mt-1" value={monitor.notes} onChange={(e) => setMonitor({ ...monitor, notes: e.target.value })} /></Field>
                </div>
                <button
                  className="btn-primary mt-3"
                  disabled={act.isPending}
                  onClick={() => act.mutate({
                    path: 'monitoring',
                    body: {
                      bpSystolic: num(monitor.bpSystolic), bpDiastolic: num(monitor.bpDiastolic), pulse: num(monitor.pulse),
                      spo2: num(monitor.spo2), temperature: num(monitor.temperature), bloodFlowRate: num(monitor.bloodFlowRate),
                      dialysateFlowRate: num(monitor.dialysateFlowRate), ufRemovedMl: num(monitor.ufRemovedMl),
                      venousPressure: num(monitor.venousPressure), arterialPressure: num(monitor.arterialPressure), notes: monitor.notes,
                    },
                    reset: () => setMonitor((m) => ({ ...m, notes: '' })),
                  })}
                >
                  {act.isPending ? <Spinner className="h-4 w-4 text-white" /> : <Activity className="h-4 w-4" />} Save reading
                </button>
              </Panel>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Panel title="Medication / oxygen" icon={Pill}>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Drug"><input className="input mt-1" value={med.name} onChange={(e) => setMed({ ...med, name: e.target.value })} placeholder="e.g. Heparin 5000 U" /></Field>
                    <Field label="Dose"><input className="input mt-1" value={med.dose} onChange={(e) => setMed({ ...med, dose: e.target.value })} placeholder="5000 U" /></Field>
                    <Field label="Route">
                      <select className="select mt-1" value={med.route} onChange={(e) => setMed({ ...med, route: e.target.value })}>
                        {['IV', 'IM', 'PO', 'SUBCUTANEOUS', 'TOPICAL'].map((x) => <option key={x}>{x}</option>)}
                      </select>
                    </Field>
                    <label className="mt-5 flex items-center gap-1.5 text-[11px] text-ink-600">
                      <input type="checkbox" checked={med.oxygenGiven} onChange={(e) => setMed({ ...med, oxygenGiven: e.target.checked })} />
                      <Wind className="h-3.5 w-3.5" /> Oxygen given
                    </label>
                  </div>
                  <button className="btn-secondary mt-3" disabled={act.isPending || !med.name} onClick={() => act.mutate({ path: 'medication', body: med, reset: () => setMed({ name: '', dose: '', route: 'IV', oxygenGiven: false }) })}>
                    <Pill className="h-4 w-4" /> Record
                  </button>
                </Panel>

                <Panel title="Complication" icon={TriangleAlert} tone="danger" hint="Appended permanently with management and resolution">
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Type *"><input className="input mt-1" value={comp.type} onChange={(e) => setComp({ ...comp, type: e.target.value })} placeholder="e.g. HYPOTENSION" /></Field>
                    <Field label="Severity">
                      <select className="select mt-1" value={comp.severity} onChange={(e) => setComp({ ...comp, severity: e.target.value })}>
                        {['MILD', 'MODERATE', 'SEVERE'].map((x) => <option key={x}>{x}</option>)}
                      </select>
                    </Field>
                  </div>
                  <Field label="Management" className="mt-2"><input className="input mt-1" value={comp.management} onChange={(e) => setComp({ ...comp, management: e.target.value })} placeholder="Saline bolus, reduce Qb, oxygen…" /></Field>
                  <Field label="Medication given (comma separated)" className="mt-2"><input className="input mt-1" value={comp.medicationGiven} onChange={(e) => setComp({ ...comp, medicationGiven: e.target.value })} placeholder="Normal saline 100 ml" /></Field>
                  <button
                    className="btn-danger mt-3"
                    disabled={act.isPending || !comp.type}
                    onClick={() => act.mutate({
                      path: 'complications',
                      body: {
                        type: comp.type, severity: comp.severity, management: comp.management, notes: comp.notes,
                        medicationGiven: comp.medicationGiven ? comp.medicationGiven.split(',').map((x) => x.trim()).filter(Boolean) : [],
                        vitalsAtOnset: {
                          bpSystolic: num(monitor.bpSystolic) ?? lastReading?.bpSystolic,
                          bpDiastolic: num(monitor.bpDiastolic) ?? lastReading?.bpDiastolic,
                          pulse: num(monitor.pulse) ?? lastReading?.pulse,
                          spo2: num(monitor.spo2) ?? lastReading?.spo2,
                        },
                      },
                      reset: () => setComp({ type: '', severity: 'MILD', management: '', medicationGiven: '', notes: '' }),
                    })}
                  >
                    <TriangleAlert className="h-4 w-4" /> Record complication
                  </button>
                </Panel>
              </div>

              {(d.complications || []).length > 0 && (
                <Panel title="Open complications" icon={AlertTriangle} tone="danger">
                  <ul className="space-y-1.5">
                    {d.complications.map((c) => (
                      <li key={c._id} className={cn('rounded-lg border px-3 py-2 text-xs', c.resolved ? 'border-ink-100' : 'border-rose-300 bg-rose-50')}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-ink-900">{c.type} · {c.severity}</span>
                          <span className="flex items-center gap-2">
                            <span className="text-[10px] text-ink-500">{formatDateTime(c.occurredAt)}</span>
                            {!c.resolved && (
                              <button
                                className="btn-secondary px-2 py-0.5 text-[10px]"
                                disabled={act.isPending}
                                onClick={() => act.mutate({ path: `complications/${c._id}/resolve`, body: { management: c.management }, method: 'patch' })}
                              >
                                Mark resolved
                              </button>
                            )}
                            {c.resolved && <span className="badge bg-emerald-50 text-emerald-700">Resolved</span>}
                          </span>
                        </div>
                        {c.management && <p className="mt-0.5 text-ink-700">{c.management}</p>}
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}
            </>
          )}

          {st === 'IN_PROGRESS' && (
            <Panel title="Post-dialysis assessment" icon={ClipboardCheck} hint="Completing the session records duration, UF delivered and weight change">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="Post weight (kg)"><input className="input mt-1" type="number" step="0.1" value={post.weightKg} onChange={(e) => setPost({ ...post, weightKg: e.target.value })} placeholder={d.preWeightKg || ''} /></Field>
                <Field label="BP systolic"><input className="input mt-1" type="number" value={post.bpSystolic} onChange={(e) => setPost({ ...post, bpSystolic: e.target.value })} /></Field>
                <Field label="BP diastolic"><input className="input mt-1" type="number" value={post.bpDiastolic} onChange={(e) => setPost({ ...post, bpDiastolic: e.target.value })} /></Field>
                <Field label="Pulse"><input className="input mt-1" type="number" value={post.pulse} onChange={(e) => setPost({ ...post, pulse: e.target.value })} /></Field>
                <Field label="SpO2 (%)"><input className="input mt-1" type="number" value={post.spo2} onChange={(e) => setPost({ ...post, spo2: e.target.value })} /></Field>
                <Field label="Temp (°F)"><input className="input mt-1" type="number" step="0.1" value={post.temperature} onChange={(e) => setPost({ ...post, temperature: e.target.value })} /></Field>
                <Field label="UF removed (ml)"><input className="input mt-1" type="number" value={post.ufRemovedMl || d.ufRemovedMl} onChange={(e) => setPost({ ...post, ufRemovedMl: e.target.value })} /></Field>
                <Field label="Condition">
                  <select className="select mt-1" value={post.condition} onChange={(e) => setPost({ ...post, condition: e.target.value })}>
                    {['STABLE', 'UNSTABLE', 'CRITICAL'].map((x) => <option key={x}>{x}</option>)}
                  </select>
                </Field>
                <Field label="Access site at end">
                  <select className="select mt-1" value={post.accessSiteCondition} onChange={(e) => setPost({ ...post, accessSiteCondition: e.target.value })}>
                    {['NORMAL', 'REDNESS', 'SWELLING', 'BLEEDING', 'THRILL_ABSENT', 'INFECTED', 'COLLAPSED'].map((x) => <option key={x}>{x}</option>)}
                  </select>
                </Field>
                <Field label="Output (ml)"><input className="input mt-1" type="number" value={post.outputMl} onChange={(e) => setPost({ ...post, outputMl: e.target.value })} /></Field>
                <Field label="Next plan" className="sm:col-span-2"><input className="input mt-1" value={post.nextPlan} onChange={(e) => setPost({ ...post, nextPlan: e.target.value })} placeholder="e.g. routine MWF, review in 2 weeks" /></Field>
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-ink-600">
                {['dizziness', 'cramps', 'nausea', 'bleedingAtAccess'].map((k) => (
                  <label key={k} className="flex items-center gap-1.5">
                    <input type="checkbox" checked={post[k]} onChange={(e) => setPost({ ...post, [k]: e.target.checked })} />
                    {k === 'bleedingAtAccess' ? 'Bleeding at access' : k[0].toUpperCase() + k.slice(1)}
                  </label>
                ))}
              </div>
              <PostChecklist
                onOverride={(r) => act.mutate({ path: 'post-assessment', body: { ...postBody, overrideReason: r } })}
              />
              <button
                className="btn-primary mt-3"
                disabled={act.isPending}
                onClick={() => act.mutate({ path: 'post-assessment', body: postBody })}
              >
                {act.isPending ? <Spinner className="h-4 w-4 text-white" /> : <CheckCircle2 className="h-4 w-4" />} Complete session
              </button>
            </Panel>
          )}

          {st === 'COMPLETED' && (
            <Panel title="Disconnect & release the machine" icon={PlugZap} hint="Machine and bay move to CLEANING for housekeeping turnover">
              <div className="flex flex-wrap items-center gap-2 text-xs text-ink-600">
                <span>Completed {formatDateTime(d.completedAt)}</span>
                {d.ufGoalMl ? <span className="badge bg-ink-100 text-ink-600">UF delivered {d.ufDeliveredPct ?? 0}%</span> : null}
                {(d.complications || []).filter((c) => !c.resolved).length > 0 && (
                  <span className="badge bg-rose-50 text-rose-700">{(d.complications || []).filter((c) => !c.resolved).length} unresolved complication(s)</span>
                )}
              </div>
              <button className="btn-primary mt-3" disabled={act.isPending} onClick={() => act.mutate({ path: 'disconnect', body: {} })}>
                {act.isPending ? <Spinner className="h-4 w-4 text-white" /> : <PlugZap className="h-4 w-4" />} Disconnect patient
              </button>
            </Panel>
          )}

          {['COMPLETED', 'CLOSED'].includes(st) && !d.billId && (
            <Panel title="Generate the session bill" icon={Receipt} hint="Built from the configured charge components plus every billable consumable actually issued. The total is always calculated, never typed in.">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Session charge override (₹)" hint="Leave blank to use the configured rate">
                  <input className="input mt-1" type="number" value={sessionCharge} onChange={(e) => setSessionCharge(e.target.value)} placeholder="configured rate" />
                </Field>
                {sessionCharge !== '' && (
                  <Field label="Reason for the different rate" hint="Recorded and audited" className="sm:col-span-2">
                    <input className="input mt-1" value={chargeReason} onChange={(e) => setChargeReason(e.target.value)} placeholder="e.g. charity rate approved by management" />
                  </Field>
                )}
              </div>
              <button
                className="btn-primary mt-3"
                disabled={act.isPending || (sessionCharge !== '' && chargeReason.trim().length < 5)}
                onClick={() => act.mutate({ path: 'bill', body: { sessionCharge: num(sessionCharge), chargeOverrideReason: chargeReason.trim() || undefined } })}
              >
                {act.isPending ? <Spinner className="h-4 w-4 text-white" /> : <Receipt className="h-4 w-4" />} Generate bill
              </button>
            </Panel>
          )}

          {d.billId && (
            <Panel title="Billing & payment" icon={CreditCard} hint={`Bill ${d.billId.billNumber} · payment status ${d.paymentStatus}`}>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ['Net', rupees(d.billId.netTotal)],
                  ['Paid', rupees(d.billId.paidAmount)],
                  ['Due', rupees(d.billId.dueAmount)],
                  ['Status', d.billId.status],
                ].map(([l, v]) => (
                  <div key={l} className="rounded-lg bg-ink-50 px-3 py-1.5">
                    <div className="text-[10px] uppercase tracking-wide text-ink-500">{l}</div>
                    <div className="text-sm font-bold tabular-nums text-ink-900">{v}</div>
                  </div>
                ))}
              </div>
              {d.billId.dueAmount > 0.01 ? (
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <Field label="Amount (₹)"><input className="input mt-1 w-32" type="number" value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} /></Field>
                  <Field label="Mode">
                    <select className="select mt-1" value={payment.mode} onChange={(e) => setPayment({ ...payment, mode: e.target.value })}>
                      {['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'WALLET', 'INSURANCE', 'CREDIT', 'SPONSOR'].map((x) => <option key={x}>{x}</option>)}
                    </select>
                  </Field>
                  {['UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE'].includes(payment.mode) && (
                    <Field label="Reference" hint="Gateway/UTR — a repeat is refused as a double capture">
                      <input className="input mt-1 w-44" value={payment.referenceNumber} onChange={(e) => setPayment({ ...payment, referenceNumber: e.target.value })} placeholder="transaction id" />
                    </Field>
                  )}
                  <button
                    className="btn-primary"
                    disabled={act.isPending || !payment.amount || (['UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE'].includes(payment.mode) && payment.referenceNumber.trim().length < 4)}
                    onClick={() => act.mutate({
                      path: 'payment',
                      body: { amount: num(payment.amount), mode: payment.mode, referenceNumber: payment.referenceNumber.trim() || undefined },
                      reset: () => setPayment({ amount: '', mode: 'CASH', referenceNumber: '' }),
                    })}
                  >
                    <Wallet className="h-4 w-4" /> Record payment
                  </button>
                </div>
              ) : (
                <p className="mt-3 text-[11px] font-semibold text-emerald-700">Bill fully settled — session closed.</p>
              )}
              <Link to={`/billing?bill=${d.billId._id}`} className="btn-secondary mt-3 ml-2 inline-flex"><CreditCard className="h-4 w-4" /> Open in billing</Link>
            </Panel>
          )}

          {finished && (
            <Panel title="Session closed" icon={CheckCircle2} hint="This record is append-only and cannot be edited">
              <Link to={`/dialysis/patient/${d.dialysisPatientId?._id}`} className="btn-secondary inline-flex">Open patient 360</Link>
            </Panel>
          )}
        </div>

        {/* ---------- RIGHT: LIVE DATA ---------- */}
        <div className="space-y-4">
          <Panel title="Live vitals" icon={Gauge} right={running ? <span className="badge bg-rose-50 text-rose-700">monitoring</span> : null}>
            {!lastReading ? <EmptyState title="No readings yet" hint="Record a monitoring entry once dialysis starts" /> : (
              <>
                <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-3">
                  {[
                    ['BP', `${lastReading.bpSystolic ?? '—'}/${lastReading.bpDiastolic ?? '—'}`],
                    ['Pulse', lastReading.pulse ?? '—'],
                    ['SpO2', `${lastReading.spo2 ?? '—'}%`],
                    ['Qb', lastReading.bloodFlowRate ?? '—'],
                    ['Qd', lastReading.dialysateFlowRate ?? '—'],
                    ['UF', `${lastReading.ufRemovedMl ?? d.ufRemovedMl ?? 0} ml`],
                  ].map(([l, v]) => (
                    <div key={l} className={cn('rounded-lg p-1.5', (l === 'SpO2' && lastReading.spo2 < 90) || (l === 'BP' && (lastReading.bpSystolic < 80 || lastReading.bpSystolic > 180)) ? 'bg-rose-50' : 'bg-ink-50')}>
                      <div className="text-[10px] uppercase tracking-wide text-ink-500">{l}</div>
                      <div className="text-sm font-bold tabular-nums text-ink-900">{v}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                  {(d.vitals || []).slice(-15).reverse().map((v) => (
                    <div key={v._id} className="flex items-center justify-between rounded bg-ink-50 px-2 py-1 text-[10px] text-ink-600">
                      <span>{new Date(v.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="tabular-nums">{v.bpSystolic || '—'}/{v.bpDiastolic || '—'} · {v.pulse || '—'} · {v.spo2 ? `${v.spo2}%` : '—'} · UF {v.ufRemovedMl ?? '—'}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Panel>

          <Panel title="Prescription snapshot" icon={ClipboardList} hint="Frozen at scheduling time">
            <div className="space-y-1 text-[11px]">
              {[
                ['Prescribed by', d.prescriptionSnapshot?.prescribedByName],
                ['Modality', d.prescriptionSnapshot?.modality],
                ['Duration', d.prescriptionSnapshot?.durationMinutes ? `${d.prescriptionSnapshot.durationMinutes} min` : '—'],
                ['Blood flow', d.prescriptionSnapshot?.bloodFlowRate],
                ['Dialysate flow', d.prescriptionSnapshot?.dialysateFlowRate],
                ['Dialyser', d.prescriptionSnapshot?.dialyserType],
                ['Dry weight', d.prescriptionSnapshot?.targetDryWeightKg],
                ['UF goal', d.prescriptionSnapshot?.ultrafiltrationGoalMl ? `${d.prescriptionSnapshot.ultrafiltrationGoalMl} ml` : '—'],
                ['Max UF', d.prescriptionSnapshot?.maxUltrafiltrationMl ? `${d.prescriptionSnapshot.maxUltrafiltrationMl} ml` : '—'],
                ['Heparin', d.prescriptionSnapshot?.heparinProtocol],
              ].map(([l, v]) => (
                <div key={l} className="flex justify-between gap-2 border-b border-ink-100 py-1 last:border-0">
                  <span className="text-ink-500">{l}</span>
                  <span className="text-right font-medium text-ink-800">{v ?? '—'}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Consumables issued" icon={Syringe}>
            {!d.consumables?.length ? <EmptyState title="Nothing issued" /> : (
              <ul className="space-y-1">
                {d.consumables.map((c) => (
                  <li key={c._id} className="flex items-center justify-between rounded-lg bg-ink-50 px-2.5 py-1.5 text-[11px]">
                    <span className="font-medium text-ink-900">{c.name} <span className="text-ink-500">({c.code})</span></span>
                    <span className="tabular-nums text-ink-700">{c.quantity} {c.unit} · {rupees(c.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Investigations" icon={FlaskConical} hint="Real lab orders — results land in the lab module">
            <div className="space-y-2">
              {(labs.data || []).map((o) => (
                <div key={o._id} className="rounded-lg bg-ink-50 px-2.5 py-1.5 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold text-brand-700">{o.labOrderNumber}</span>
                    <span className="badge bg-white text-ink-600 ring-1 ring-ink-200">{o.status}</span>
                  </div>
                  <div className="mt-0.5 text-ink-600">{(o.items || []).map((i) => i.testName).join(', ')}</div>
                </div>
              ))}
              <select
                className="select"
                value=""
                onChange={(e) => { if (e.target.value) setLabPick((p) => [...p, e.target.value]); }}
                disabled={orderLabs.isPending || ['CLOSED', 'CANCELLED', 'NO_SHOW'].includes(st)}
              >
                <option value="">Add investigation…</option>
                {(labTests.data || []).filter((t) => !labPick.includes(t._id)).map((t) => (
                  <option key={t._id} value={t._id}>{t.name}</option>
                ))}
              </select>
              {labPick.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {labPick.map((id2) => {
                    const t = (labTests.data || []).find((x) => x._id === id2);
                    return (
                      <button key={id2} className="badge bg-brand-50 text-brand-700" onClick={() => setLabPick((p) => p.filter((x) => x !== id2))}>
                        {t?.name || 'test'} ×
                      </button>
                    );
                  })}
                  <button className="btn-primary px-2 py-1 text-[11px]" disabled={orderLabs.isPending} onClick={() => orderLabs.mutate(labPick)}>
                    Raise lab order
                  </button>
                </div>
              )}
              {['CLOSED', 'CANCELLED', 'NO_SHOW'].includes(st) && <p className="text-[10px] text-ink-400">Investigations cannot be raised on a closed session.</p>}
            </div>
          </Panel>

          <Panel title="Medications given" icon={Pill}>
            {!d.medicationsGiven?.length ? <EmptyState title="None recorded" /> : (
              <ul className="space-y-1">
                {d.medicationsGiven.map((m, i) => (
                  <li key={i} className="flex items-center justify-between rounded-lg bg-ink-50 px-2.5 py-1.5 text-[11px]">
                    <span className="font-medium text-ink-900">{m.name} {m.dose}</span>
                    <span className="text-ink-500">{m.route} · {formatDateTime(m.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Status history" icon={Droplets} hint="Append-only audit trail">
            <ol className="relative space-y-2 border-l-2 border-ink-200 pl-4">
              {(d.statusHistory || []).slice().reverse().map((h, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[22px] top-1.5 h-2 w-2 rounded-full bg-brand-500" />
                  <div className="text-[10px] uppercase tracking-wide text-ink-500">{formatDateTime(h.at)}</div>
                  <div className="text-[11px] font-semibold text-ink-900">{String(h.from || 'NEW').replace(/_/g, ' ')} → {String(h.to).replace(/_/g, ' ')}</div>
                  {h.note && <div className="text-[10px] text-ink-500">{h.note}</div>}
                </li>
              ))}
            </ol>
          </Panel>

          <Panel title="Session charges" icon={Receipt}>
            {!d.charges?.length ? <EmptyState title="No charges yet" /> : (
              <>
                <ul className="space-y-1 text-[11px]">
                  {d.charges.map((c) => (
                    <li key={c._id} className="flex items-center justify-between rounded bg-ink-50 px-2.5 py-1.5">
                      <span className="text-ink-800">{c.description}</span>
                      <span className="tabular-nums font-semibold text-ink-900">{rupees(c.amount)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex items-center justify-between rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs font-bold text-brand-800">
                  <span>Total</span><span className="tabular-nums">{rupees(d.totalAmount)}</span>
                </div>
              </>
            )}
          </Panel>
        </div>
      </div>

      {act.isError && (
        <div className="card flex items-center gap-2 border-rose-300 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
          <Ban className="h-4 w-4" /> {apiError(act.error)}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary" onClick={() => navigate('/dialysis')}>Back to command center</button>
        {d.dialysisPatientId?._id && <Link className="btn-secondary" to={`/dialysis/patient/${d.dialysisPatientId._id}`}>Patient 360</Link>}
        <Link className="btn-secondary" to="/dialysis/machines">Machines & stations</Link>
      </div>

      <p className="text-[10px] text-ink-400">Session date {formatDate(d.sessionDate)} · scheduled {formatDateTime(d.scheduledStart)} · created {formatDateTime(d.createdAt)}</p>
    </MotionPage>
  );
}

function ConsumablePicker({ items, issue, setIssue }) {
  const [q, setQ] = useState('');
  const filtered = items.filter((i) => !q || i.name.toLowerCase().includes(q.toLowerCase()) || i.code.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <input className="input mb-2" placeholder="Filter consumables…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="max-h-56 space-y-1 overflow-y-auto">
        {filtered.map((i) => (
          <div key={i._id} className="flex items-center justify-between rounded-lg bg-ink-50 px-2.5 py-1.5">
            <div className="min-w-0">
              <div className="truncate text-[11px] font-semibold text-ink-900">{i.name}</div>
              <div className={cn('text-[10px]', i.stockQty <= i.reorderLevel ? 'font-bold text-amber-700' : 'text-ink-500')}>
                {i.code} · {i.category} · stock {i.stockQty} {i.unit}
              </div>
            </div>
            <input
              className="input w-16 py-1 text-[11px]"
              type="number"
              min={0}
              step="1"
              value={issue[i._id] || ''}
              onChange={(e) => setIssue({ ...issue, [i._id]: e.target.value })}
              disabled={i.stockQty <= 0}
            />
          </div>
        ))}
        {!filtered.length && <p className="py-3 text-center text-[11px] text-ink-400">No consumables</p>}
      </div>
    </div>
  );
}
