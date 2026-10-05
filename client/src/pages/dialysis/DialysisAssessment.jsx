import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle, ArrowLeft, Beaker, CalendarClock, ClipboardCheck, Droplets, FileSignature,
  FlaskConical, History, Pill, Save, Stethoscope, Syringe, UserRound, X,
} from 'lucide-react';
import api, { apiError } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import { LoadingState, ErrorState, EmptyState, Spinner } from '../../components/ui/Feedback';
import { MotionPage, MotionTab } from '../../components/ui/Motion';
import { formatDate, formatDateTime, cn } from '../../lib/utils';
import { POLL } from '../../lib/polling';

const ENCOUNTERS = ['DIALYSIS_UNIT', 'OPD', 'IPD', 'EMERGENCY', 'TELEHEALTH', 'DAY_CARE'];
const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

const Section = ({ title, hint, icon: Icon, tone, right, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={cn('card p-3.5', tone === 'warn' && 'border-amber-300')}>
      <button className="mb-2 flex w-full items-center justify-between gap-2 text-left" onClick={() => setOpen((v) => !v)}>
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink-900">
            {Icon && <Icon className="h-4 w-4 text-brand-600" />} {title}
          </h2>
          {hint && <p className="text-[11px] text-ink-500">{hint}</p>}
        </div>
        <span className="text-[11px] font-semibold text-brand-600">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && children}
    </section>
  );
};

const Field = ({ label, children, hint, required, className }) => (
  <label className={cn('label', className)}>
    <span className={required ? 'font-semibold text-rose-600' : ''}>{label}{required ? ' *' : ''}</span>
    {children}
    {hint && <span className="mt-0.5 text-[10px] font-normal text-ink-400">{hint}</span>}
  </label>
);

const Chips = ({ values, selected, onToggle, tone = 'brand' }) => (
  <div className="flex flex-wrap gap-1.5">
    {values.map((v) => (
      <button
        key={v}
        type="button"
        onClick={() => onToggle(v)}
        className={cn(
          'rounded-lg px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset transition',
          selected.includes(v)
            ? (tone === 'rose' ? 'bg-rose-600 text-white ring-rose-600' : 'bg-brand-600 text-white ring-brand-600')
            : 'bg-white text-ink-600 ring-ink-200 hover:bg-ink-50',
        )}
      >
        {v}
      </button>
    ))}
  </div>
);

const today = () => new Date().toISOString().slice(0, 10);
const nowTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export default function DialysisAssessment() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const selected = params.get('patient');
  const viewing = params.get('view');

  const list = useQuery({
    queryKey: ['dialysis-assessments'],
    queryFn: async () => (await api.get('/dialysis/assessments', { params: { limit: 50 } })).data.data,
    refetchInterval: POLL.SLOW,
  });

  const viewed = useQuery({
    queryKey: ['dialysis-assessment', viewing],
    queryFn: async () => (await api.get(`/dialysis/assessments/${viewing}`)).data.data,
    enabled: Boolean(viewing),
  });

  const context = useQuery({
    queryKey: ['dialysis-assessment-context', selected],
    queryFn: async () => (await api.get(`/dialysis/assessments/context/${selected}`)).data.data,
    enabled: Boolean(selected),
  });

  const save = useMutation({
    mutationFn: async (body) => (await api.post('/dialysis/assessments', body)).data.data,
    onSuccess: (a) => {
      toast.success(`Assessment ${a.assessmentNumber} (v${a.version}) saved`);
      qc.invalidateQueries({ queryKey: ['dialysis-assessments'] });
      qc.invalidateQueries({ queryKey: ['dialysis-assessment-context'] });
      setParams({ view: a._id });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const amend = useMutation({
    mutationFn: async ({ id, body }) => (await api.post(`/dialysis/assessments/${id}/amend`, body)).data.data,
    onSuccess: (a) => {
      toast.success(`Amended — version ${a.version} created`);
      qc.invalidateQueries({ queryKey: ['dialysis-assessments'] });
      setParams({ view: a._id });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  // ---------------------------------------------------------------- VIEW
  if (viewing) {
    if (viewed.isLoading) return <LoadingState label="Loading assessment…" />;
    if (viewed.error) return <ErrorState message={apiError(viewed.error)} />;
    return <AssessmentView a={viewed.data} onBack={() => setParams({})} onAmend={() => setParams({ amend: viewing })} amendOpen={params.get('amend') === viewing} amend={amend} />;
  }

  // ---------------------------------------------------------------- NEW
  if (selected) {
    if (context.isLoading) return <LoadingState label="Loading patient history…" />;
    if (context.error) return <ErrorState message={apiError(context.error)} />;
    return (
      <AssessmentForm
        ctx={context.data}
        onCancel={() => setParams({})}
        onSave={(body) => save.mutate(body)}
        saving={save.isPending}
        onAmend={amend}
      />
    );
  }

  // ---------------------------------------------------------------- LIST
  return (
    <MotionPage className="p-5 space-y-4">
      <PageHeader
        title="Nephrologist Assessment"
        subtitle="Structured nephrology assessment — history, examination, plan and a permanent version trail"
        actions={<Link to="/dialysis/patients" className="btn-secondary text-xs">Dialysis register</Link>}
      />

      <PatientPicker onPick={(id) => setParams({ patient: id })} />

      <Section title="Recent assessments" icon={History} hint="Every assessment is signed with doctor, date, time and encounter">
        {!list.data?.length ? <EmptyState title="No assessments recorded" hint="Pick a dialysis patient above to write the first one" /> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Assessment</th><th>Patient</th><th>Doctor</th><th>Date</th><th>Time</th><th>Encounter</th><th>Encounter no.</th><th>Version</th><th>Status</th><th /></tr></thead>
              <tbody>
                {list.data.map((a) => (
                  <tr key={a._id} className="cursor-pointer" onClick={() => setParams({ view: a._id })}>
                    <td className="font-mono text-[11px] font-semibold text-brand-700">{a.assessmentNumber}</td>
                    <td className="text-xs text-ink-900">{a.patientId?.firstName} {a.patientId?.lastName}<div className="text-[10px] text-ink-500">{a.patientId?.uhid}</div></td>
                    <td className="text-[11px]">{a.doctorId?.name || '—'}</td>
                    <td className="text-[11px]">{formatDate(a.assessmentDate)}</td>
                    <td className="font-mono text-[11px]">{a.assessmentTime}</td>
                    <td className="text-[11px]">{String(a.encounterType).replace(/_/g, ' ')}</td>
                    <td className="font-mono text-[11px]">{a.encounterNumber || '—'}</td>
                    <td className="text-[11px]">v{a.version}</td>
                    <td><span className={cn('badge', a.status === 'FINAL' ? 'bg-emerald-50 text-emerald-700' : a.status === 'DRAFT' ? 'bg-amber-50 text-amber-700' : 'bg-ink-100 text-ink-600')}>{a.status}</span></td>
                    <td><button className="btn-secondary px-2 py-1 text-[11px]">Open</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </MotionPage>
  );
}

// ================================================================ PICKER
function PatientPicker({ onPick }) {
  const [q, setQ] = useState('');
  const search = useQuery({
    queryKey: ['dialysis-patient-pick', q],
    queryFn: async () => (await api.get('/dialysis/patients', { params: { q, limit: 20 } })).data.data,
    enabled: q.trim().length >= 2,
  });
  return (
    <Section title="Select a dialysis patient" icon={UserRound} hint="Only patients already enrolled in the programme can be assessed">
      <input className="input" placeholder="Search dialysis ID, UHID, name or mobile" value={q} onChange={(e) => setQ(e.target.value)} />
      {q.trim().length >= 2 && (
        <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
          {search.isLoading ? <LoadingState label="Searching…" /> : (search.data || []).map((p) => (
            <button
              key={p._id}
              onClick={() => onPick(p._id)}
              className="flex w-full items-center justify-between rounded-lg border border-ink-200 px-3 py-2 text-left text-xs hover:border-brand-400 hover:bg-brand-50"
            >
              <span>
                <span className="font-semibold text-ink-900">{p.patientId?.firstName} {p.patientId?.lastName}</span>
                <span className="ml-2 font-mono text-[10px] text-brand-600">{p.dialysisNumber}</span>
                <span className="ml-2 text-[10px] text-ink-500">{p.patientId?.uhid} · {p.primaryDiagnosis || 'no diagnosis'}</span>
              </span>
              <Stethoscope className="h-3.5 w-3.5 text-ink-400" />
            </button>
          ))}
          {!search.isLoading && !(search.data || []).length && <EmptyState title="No dialysis patient matches" />}
        </div>
      )}
    </Section>
  );
}

// ================================================================ FORM
function AssessmentForm({ ctx, onCancel, onSave, saving, onAmend }) {
  const rec = ctx.patient;
  const s = ctx.summary;
  const d = ctx.prescriptionDefaults?.defaults || {};
  const activeRx = ctx.activePrescription;

  const [form, setForm] = useState(() => ({
    doctorId: rec.nephrologistId?._id || '',
    encounterType: 'DIALYSIS_UNIT',
    encounterId: '',
    encounterNumber: '',
    assessmentDate: today(),
    assessmentTime: nowTime(),
    patientHistory: {
      uhid: rec.patientId?.uhid,
      ageYears: rec.patientId?.age?.years ?? rec.patientId?.age,
      gender: rec.patientId?.gender,
      primaryDiagnosis: rec.primaryDiagnosis,
      ckdOnsetDate: '', esrdDate: '', dialysisInitiationDate: rec.registeredAt?.slice(0, 10) || '',
      renalAetiology: '', familyHistory: '', socialHistory: '',
    },
    ckdHistory: {
      currentStage: rec.ckdStage, egfr: '', creatinine: '', urea: '', proteinuria: '',
      progressionNotes: '', yearsOnDialysis: s.yearsOnDialysis, priorModalities: [rec.dialysisType].filter(Boolean),
    },
    medicalHistory: { conditions: [], surgeries: [], hospitalisations: [], obstetricHistory: '', immunizationStatus: '' },
    comorbidities: (rec.comorbidities || []).map((c) => (typeof c === 'string' ? { name: c, since: '', controlled: null, note: '' } : { name: c, since: '', controlled: null, note: '' })),
    previousDialysis: {
      totalSessions: s.completedSessions, completedSessions: s.completedSessions,
      firstSessionDate: s.firstSessionDate?.slice(0, 10) || '', lastSessionDate: s.lastSessionDate?.slice(0, 10) || '',
      currentModality: rec.dialysisType, sessionsPerWeek: rec.sessionsPerWeek, scheduleDays: rec.scheduleDays || [],
      averageDurationMinutes: s.averageDurationMinutes, averageUfDeliveredPct: s.averageUfDeliveredPct,
      machineUsed: ctx.lastSession?.machineId?.code || '', accessType: rec.accessType,
    },
    previousComplications: ctx.complications.map((c) => ({ type: c.type, sessions: c.sessions, lastOccurredAt: c.lastOccurredAt?.slice(0, 10) || '', management: (c.management || []).join('; '), resolved: c.resolved })),
    allergies: ctx.allergies.map((a) => ({ substance: a.substance, reaction: a.reaction || '', severity: a.severity || 'UNKNOWN' })),
    currentMedications: ctx.currentMedications.map((m) => ({ name: m.name, dose: m.dose || '', frequency: m.frequency || '', route: m.route || '', indication: m.indication || '' })),
    previousLabResults: ctx.labs.slice(0, 12).map((l) => ({ testName: l.testName, value: l.value, unit: l.unit, referenceRange: l.referenceRange, flag: l.flag, testedAt: l.testedAt?.slice(0, 10) || '' })),
    accessHistory: ctx.access.map((a) => ({ accessId: a._id, accessType: a.accessType, side: a.side, site: a.site, createdAt: a.createdAt?.slice(0, 10) || '', status: a.status, totalUses: a.totalUses, interventions: (a.interventions || []).map((i) => `${i.type}: ${i.notes || ''}`), complicationHistory: a.complicationHistory || [] })),
    clinicalAssessment: {
      generalCondition: 'FAIR', volumeStatus: '', bloodPressure: '', pulse: '', temperature: '', spo2: '',
      weightKg: rec.dryWeightKg || '', dryWeightKg: activeRx?.targetDryWeightKg || rec.dryWeightKg || '',
      oedema: false, breathlessness: false, chestPain: false, pallor: false, pedalOedema: false, raisedJVP: false, pulmonaryCrackles: false,
      accessThrill: true, accessBruit: true, symptoms: [], examinationNotes: '',
    },
    doctorNotes: '',
    plan: {
      prescription: {
        modality: activeRx?.modality || d.modality,
        frequencyPerWeek: activeRx?.frequencyPerWeek || rec.sessionsPerWeek || d.frequencyPerWeek,
        daysOfWeek: rec.scheduleDays || [],
        durationMinutes: activeRx?.durationMinutes || d.durationMinutes,
        targetDryWeightKg: activeRx?.targetDryWeightKg || rec.dryWeightKg || '',
        ultrafiltrationGoalMl: activeRx?.ultrafiltrationGoalMl || d.ultrafiltrationGoalMl,
        maxUltrafiltrationMl: activeRx?.maxUltrafiltrationMl || d.maxUltrafiltrationMl,
        bloodFlowRate: activeRx?.bloodFlowRate || d.bloodFlowRate,
        dialysateFlowRate: activeRx?.dialysateFlowRate || d.dialysateFlowRate,
        dialyserType: activeRx?.dialyserType || d.dialyserType || '',
        anticoagulation: activeRx?.heparinProtocol || d.anticoagulationProtocol || '',
        accessType: rec.accessType, accessSide: rec.accessSide,
      },
      investigations: (ctx.scheduling?.labPanel || []).map((p) => ({ name: p.name, priority: 'ROUTINE', note: p.frequency || '' })),
      medicationOrders: [],
      dietaryAdvice: '', fluidAdvice: '', patientEducation: '', specialInstructions: '',
      followUpDate: '', nextReviewDate: '', referral: '',
    },
    status: 'FINAL',
  }));

  const [freeText, setFreeText] = useState({ conditions: '', surgery: '', hospitalisation: '', symptom: '', condition: '', investigation: '', medOrder: '' });

  const setPath = (path, value) => setForm((f) => {
    const next = { ...f };
    const keys = path.split('.');
    let node = next;
    for (let i = 0; i < keys.length - 1; i += 1) { node[keys[i]] = { ...node[keys[i]] }; node = node[keys[i]]; }
    node[keys[keys.length - 1]] = value;
    return next;
  });

  const addTo = (key, target, label = 'name') => {
    const raw = freeText[key].trim();
    if (!raw) return;
    const parts = raw.split('|').map((x) => x.trim()).filter(Boolean);
    setForm((f) => {
      const list = [...(f[target] || [])];
      parts.forEach((part) => { list.push(label === 'name' ? { name: part, since: '', controlled: null, note: '' } : { name: part }); });
      return { ...f, [target]: list };
    });
    setFreeText((t) => ({ ...t, [key]: '' }));
  };

  const removeFrom = (key, index) => setForm((f) => ({ ...f, [key]: f[key].filter((_, i) => i !== index) }));

  const encounterOptions = useMemo(() => {
    if (form.encounterType === 'IPD') return (ctx.admissions || []).map((a) => ({ id: a._id, label: `${a.admissionNumber} · ${a.status}` }));
    if (form.encounterType === 'OPD') return (ctx.visits || []).map((v) => ({ id: v._id, label: `${v.visitNumber || v.opdNumber} · ${v.status}` }));
    if (form.encounterType === 'DIALYSIS_UNIT') return (ctx.previousAssessments || []).length ? [] : [];
    return [];
  }, [form.encounterType, ctx]);

  const submit = (e) => {
    e.preventDefault();
    const body = JSON.parse(JSON.stringify(form));
    ['targetDryWeightKg', 'weightKg', 'dryWeightKg', 'egfr', 'creatinine', 'urea', 'yearsOnDialysis', 'averageDurationMinutes', 'averageUfDeliveredPct', 'totalSessions', 'completedSessions', 'pulse', 'temperature', 'spo2'].forEach((k) => {
      if (body.clinicalAssessment[k] === '') body.clinicalAssessment[k] = undefined;
    });
    if (body.plan.prescription.targetDryWeightKg === '') body.plan.prescription.targetDryWeightKg = undefined;
    onSave(body);
  };

  const priors = ctx.previousAssessments || [];

  return (
    <MotionPage className="p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 hover:text-ink-800" onClick={onCancel}>
          <ArrowLeft className="h-3.5 w-3.5" /> Assessment list
        </button>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={onCancel}><X className="h-3.5 w-3.5" /> Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? <Spinner className="h-4 w-4 text-white" /> : <FileSignature className="h-4 w-4" />} Sign assessment
          </button>
        </div>
      </div>

      <div className="card border-l-4 border-l-brand-500 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-bold text-brand-600">{rec.dialysisNumber}</span>
              <span className="text-lg font-bold text-ink-900">{rec.patientId?.firstName} {rec.patientId?.lastName}</span>
              <span className="text-xs text-ink-500">{rec.patientId?.uhid} · {rec.patientId?.age?.years ?? rec.patientId?.age ?? '—'} yrs · {rec.patientId?.gender} · {rec.patientId?.bloodGroup || 'blood group n/a'}</span>
            </div>
            <div className="mt-1 text-[11px] text-ink-500">
              {rec.primaryDiagnosis || 'No primary diagnosis'} · CKD {String(rec.ckdStage || '').replace('STAGE_', '')} · Access {String(rec.accessType || '').replace(/_/g, ' ')} {rec.accessSide !== 'NOT_APPLICABLE' ? `(${rec.accessSide})` : ''}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
            {[
              ['Completed', s.completedSessions], ['Complication types', s.complicationTypes],
              ['Years on dialysis', s.yearsOnDialysis], ['Avg duration', `${s.averageDurationMinutes}m`],
              ['Avg UF %', `${s.averageUfDeliveredPct}%`], ['Last session', s.lastSessionDate ? formatDate(s.lastSessionDate) : '—'],
            ].map(([l, v]) => (
              <div key={l} className="rounded-lg bg-ink-50 px-2 py-1.5">
                <div className="text-[9px] uppercase tracking-wide text-ink-500">{l}</div>
                <div className="text-sm font-bold tabular-nums text-ink-900">{v ?? '—'}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ---------- mandatory identity ---------- */}
      <Section title="Assessment identity" icon={FileSignature} hint="Every assessment must carry a doctor, date, time and encounter" tone="warn">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Assessing doctor" required>
            <select className="select mt-1" value={form.doctorId} onChange={(e) => setPath('doctorId', e.target.value)}>
              <option value="">Select doctor…</option>
              {(ctx.doctors || []).map((d) => <option key={d._id} value={d._id}>{d.name}{d.specialization ? ` — ${d.specialization}` : ''}</option>)}
            </select>
          </Field>
          <Field label="Date" required><input className="input mt-1" type="date" value={form.assessmentDate} onChange={(e) => setPath('assessmentDate', e.target.value)} /></Field>
          <Field label="Time" required><input className="input mt-1" type="time" value={form.assessmentTime} onChange={(e) => setPath('assessmentTime', e.target.value)} /></Field>
          <Field label="Encounter" required>
            <select className="select mt-1" value={form.encounterType} onChange={(e) => { setPath('encounterType', e.target.value); setPath('encounterId', ''); }}>
              {ENCOUNTERS.map((x) => <option key={x} value={x}>{x.replace(/_/g, ' ')}</option>)}
            </select>
          </Field>
          {['IPD', 'OPD'].includes(form.encounterType) && (
            <Field label={`Linked ${form.encounterType} encounter`} required className="col-span-2 sm:col-span-4">
              <select className="select mt-1" value={form.encounterId} onChange={(e) => setPath('encounterId', e.target.value)}>
                <option value="">Select the encounter…</option>
                {encounterOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </Field>
          )}
          <Field label="Sign as">
            <select className="select mt-1" value={form.status} onChange={(e) => setPath('status', e.target.value)}>
              <option value="FINAL">Sign now (FINAL)</option>
              <option value="DRAFT">Save as draft</option>
            </select>
          </Field>
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* ---------- 1-2 ---------- */}
        <div className="space-y-4">
          <Section title="1. Patient history" icon={UserRound}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="UHID"><input className="input mt-1" value={form.patientHistory.uhid || ''} onChange={(e) => setPath('patientHistory.uhid', e.target.value)} /></Field>
              <Field label="Age / sex"><input className="input mt-1" value={`${form.patientHistory.ageYears ?? '—'} / ${form.patientHistory.gender || '—'}`} readOnly /></Field>
              <Field label="CKD onset"><input className="input mt-1" type="date" value={form.patientHistory.ckdOnsetDate} onChange={(e) => setPath('patientHistory.ckdOnsetDate', e.target.value)} /></Field>
              <Field label="ESRD date"><input className="input mt-1" type="date" value={form.patientHistory.esrdDate} onChange={(e) => setPath('patientHistory.esrdDate', e.target.value)} /></Field>
              <Field label="Dialysis start"><input className="input mt-1" type="date" value={form.patientHistory.dialysisInitiationDate} onChange={(e) => setPath('patientHistory.dialysisInitiationDate', e.target.value)} /></Field>
              <Field label="Renal aetiology"><input className="input mt-1" value={form.patientHistory.renalAetiology} onChange={(e) => setPath('patientHistory.renalAetiology', e.target.value)} placeholder="Diabetes, hypertension…" /></Field>
            </div>
            <Field label="Family history" className="mt-2"><input className="input mt-1" value={form.patientHistory.familyHistory} onChange={(e) => setPath('patientHistory.familyHistory', e.target.value)} /></Field>
            <Field label="Social history" className="mt-2"><input className="input mt-1" value={form.patientHistory.socialHistory} onChange={(e) => setPath('patientHistory.socialHistory', e.target.value)} placeholder="Occupation, smoking, support…" /></Field>
          </Section>

          <Section title="2. CKD / ESRD history" icon={Droplets}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Current stage"><input className="input mt-1" value={form.ckdHistory.currentStage || ''} onChange={(e) => setPath('ckdHistory.currentStage', e.target.value)} /></Field>
              <Field label="eGFR"><input className="input mt-1" type="number" step="0.1" value={form.ckdHistory.egfr} onChange={(e) => setPath('ckdHistory.egfr', e.target.value)} /></Field>
              <Field label="Creatinine"><input className="input mt-1" type="number" step="0.1" value={form.ckdHistory.creatinine} onChange={(e) => setPath('ckdHistory.creatinine', e.target.value)} /></Field>
              <Field label="Years on dialysis"><input className="input mt-1" type="number" step="0.1" value={form.ckdHistory.yearsOnDialysis} onChange={(e) => setPath('ckdHistory.yearsOnDialysis', e.target.value)} /></Field>
            </div>
            <Field label="Proteinuria" className="mt-2"><input className="input mt-1" value={form.ckdHistory.proteinuria} onChange={(e) => setPath('ckdHistory.proteinuria', e.target.value)} placeholder="e.g. 3+ / 24 h" /></Field>
            <Field label="Progression notes" className="mt-2"><textarea className="input mt-1 h-16" value={form.ckdHistory.progressionNotes} onChange={(e) => setPath('ckdHistory.progressionNotes', e.target.value)} /></Field>
          </Section>

          <Section title="3. Relevant medical history" icon={ClipboardCheck}>
            <ListEditor items={form.medicalHistory.conditions} onRemove={(i) => removeFrom('medicalHistory.conditions', i)} render={(x) => x} empty="No conditions recorded" />
            <div className="mt-2 flex gap-1.5">
              <input className="input" placeholder="Condition (separate several with |)" value={freeText.conditions} onChange={(e) => setFreeText({ ...freeText, conditions: e.target.value })} />
              <button type="button" className="btn-secondary" onClick={() => addTo('conditions', 'medicalHistory.conditions')}>Add</button>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <ListEditor items={form.medicalHistory.surgeries} onRemove={(i) => removeFrom('medicalHistory.surgeries', i)} render={(x) => x} empty="No surgeries" />
                <div className="mt-1.5 flex gap-1.5">
                  <input className="input" placeholder="Surgery" value={freeText.surgery} onChange={(e) => setFreeText({ ...freeText, surgery: e.target.value })} />
                  <button type="button" className="btn-secondary" onClick={() => addTo('surgery', 'medicalHistory.surgeries')}>Add</button>
                </div>
              </div>
              <div>
                <ListEditor items={form.medicalHistory.hospitalisations} onRemove={(i) => removeFrom('medicalHistory.hospitalisations', i)} render={(x) => x} empty="No admissions" />
                <div className="mt-1.5 flex gap-1.5">
                  <input className="input" placeholder="Hospitalisation" value={freeText.hospitalisation} onChange={(e) => setFreeText({ ...freeText, hospitalisation: e.target.value })} />
                  <button type="button" className="btn-secondary" onClick={() => addTo('hospitalisation', 'medicalHistory.hospitalisations')}>Add</button>
                </div>
              </div>
            </div>
          </Section>

          <Section title="4. Comorbidities" icon={AlertTriangle}>
            {!form.comorbidities.length && <p className="text-[11px] text-ink-400">No comorbidities recorded on the dialysis register</p>}
            {form.comorbidities.map((c, i) => (
              <div key={i} className="mb-1.5 flex flex-wrap items-center gap-2 rounded-lg bg-ink-50 px-2.5 py-1.5 text-[11px]">
                <input className="input h-7 w-44 py-0.5 text-[11px]" value={c.name} onChange={(e) => setForm((f) => ({ ...f, comorbidities: f.comorbidities.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) }))} />
                <input className="input h-7 w-28 py-0.5 text-[11px]" type="date" value={c.since} onChange={(e) => setForm((f) => ({ ...f, comorbidities: f.comorbidities.map((x, j) => (j === i ? { ...x, since: e.target.value } : x)) }))} />
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={Boolean(c.controlled)} onChange={(e) => setForm((f) => ({ ...f, comorbidities: f.comorbidities.map((x, j) => (j === i ? { ...x, controlled: e.target.checked } : x)) }))} />
                  controlled
                </label>
                <button type="button" className="text-rose-500" onClick={() => removeFrom('comorbidities', i)}><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
            <div className="mt-2 flex gap-1.5">
              <input className="input" placeholder="Add comorbidity (separate several with |)" value={freeText.condition} onChange={(e) => setFreeText({ ...freeText, condition: e.target.value })} />
              <button type="button" className="btn-secondary" onClick={() => addTo('condition', 'comorbidities')}>Add</button>
            </div>
          </Section>
        </div>

        <div className="space-y-4">
          {/* ---------- 5-6 ---------- */}
          <Section title="5. Previous dialysis history" icon={CalendarClock}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['Total sessions', 'totalSessions', 'number'], ['Completed', 'completedSessions', 'number'],
                ['First session', 'firstSessionDate', 'date'], ['Last session', 'lastSessionDate', 'date'],
                ['Avg duration (min)', 'averageDurationMinutes', 'number'], ['Avg UF delivered (%)', 'averageUfDeliveredPct', 'number'],
                ['Sessions / week', 'sessionsPerWeek', 'number'], ['Machine used', 'machineUsed', 'text'],
              ].map(([label, key, type]) => (
                <Field key={key} label={label}><input className="input mt-1" type={type} value={form.previousDialysis[key] ?? ''} onChange={(e) => setPath(`previousDialysis.${key}`, e.target.value)} /></Field>
              ))}
            </div>
            <Field label="Schedule days" className="mt-2">
              <div className="mt-1"><Chips values={DAYS} selected={form.previousDialysis.scheduleDays} onToggle={(v) => setPath('previousDialysis.scheduleDays', form.previousDialysis.scheduleDays.includes(v) ? form.previousDialysis.scheduleDays.filter((x) => x !== v) : [...form.previousDialysis.scheduleDays, v])} /></div>
            </Field>
          </Section>

          <Section title="6. Previous complications" icon={AlertTriangle} tone={form.previousComplications.length ? 'warn' : undefined}>
            {!form.previousComplications.length ? <p className="text-[11px] text-emerald-700">No complications recorded in this programme</p> : (
              <table className="table">
                <thead><tr><th>Type</th><th>Sessions</th><th>Last occurred</th><th>Management</th><th>State</th></tr></thead>
                <tbody>
                  {form.previousComplications.map((c, i) => (
                    <tr key={i}>
                      <td className="text-[11px] font-semibold">{c.type}</td>
                      <td className="text-[11px] tabular-nums">{c.sessions}</td>
                      <td className="text-[11px]">{c.lastOccurredAt ? formatDate(c.lastOccurredAt) : '—'}</td>
                      <td className="text-[11px]">{c.management || '—'}</td>
                      <td><span className={cn('badge', c.resolved ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')}>{c.resolved ? 'Resolved' : 'Open'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          {/* ---------- 7-8 ---------- */}
          <Section title="7. Allergies" icon={AlertTriangle} tone={form.allergies.length ? 'warn' : undefined}>
            {!form.allergies.length ? <p className="text-[11px] text-ink-400">No known allergies</p> : (
              <ul className="space-y-1">
                {form.allergies.map((a, i) => (
                  <li key={i} className="flex items-center gap-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px]">
                    <span className="font-semibold text-amber-900">{a.substance}</span>
                    <span className="text-ink-600">{a.reaction || 'reaction not recorded'}</span>
                    <span className="badge bg-white text-amber-800 ring-1 ring-amber-200">{a.severity}</span>
                    <button type="button" className="ml-auto text-rose-500" onClick={() => removeFrom('allergies', i)}><X className="h-3.5 w-3.5" /></button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 flex gap-1.5">
              <input className="input" placeholder="Substance | reaction | SEVERITY (separate with |)" onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const parts = e.currentTarget.value.split('|').map((x) => x.trim());
                if (parts[0]) setForm((f) => ({ ...f, allergies: [...f.allergies, { substance: parts[0], reaction: parts[1] || '', severity: parts[2] || 'UNKNOWN' }] }));
                e.currentTarget.value = '';
              }}
              />
            </div>
          </Section>

          <Section title="8. Current medications" icon={Pill}>
            {!form.currentMedications.length ? <p className="text-[11px] text-ink-400">No active medication chart</p> : (
              <table className="table">
                <thead><tr><th>Drug</th><th>Dose</th><th>Frequency</th><th>Route</th></tr></thead>
                <tbody>
                  {form.currentMedications.map((m, i) => (
                    <tr key={i}>
                      <td className="text-[11px] font-medium">{m.name}</td>
                      <td className="text-[11px]">{m.dose || '—'}</td>
                      <td className="text-[11px]">{m.frequency || '—'}</td>
                      <td className="text-[11px]">{m.route || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          {/* ---------- 9-10 ---------- */}
          <Section title="9. Previous laboratory results" icon={FlaskConical} defaultOpen={false}>
            {!form.previousLabResults.length ? <p className="text-[11px] text-ink-400">No lab results on file</p> : (
              <table className="table">
                <thead><tr><th>Test</th><th>Value</th><th>Unit</th><th>Reference</th><th>Flag</th><th>Date</th></tr></thead>
                <tbody>
                  {form.previousLabResults.map((l, i) => (
                    <tr key={i}>
                      <td className="text-[11px]">{l.testName}</td>
                      <td className={cn('text-[11px] font-semibold', l.flag !== 'NORMAL' && 'text-rose-600')}>{l.value}</td>
                      <td className="text-[11px]">{l.unit || '—'}</td>
                      <td className="text-[11px]">{l.referenceRange || '—'}</td>
                      <td><span className={cn('badge', l.flag === 'NORMAL' ? 'bg-ink-100 text-ink-600' : 'bg-rose-50 text-rose-700')}>{l.flag}</span></td>
                      <td className="text-[11px]">{l.testedAt ? formatDate(l.testedAt) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          <Section title="10. Access history" icon={Syringe} defaultOpen={false}>
            {!form.accessHistory.length ? <p className="text-[11px] text-ink-400">No vascular access recorded</p> : (
              <ul className="space-y-1.5">
                {form.accessHistory.map((a, i) => (
                  <li key={i} className="rounded-lg border border-ink-100 px-2.5 py-2 text-[11px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink-900">{String(a.accessType).replace(/_/g, ' ')} · {a.side}</span>
                      <span className="badge bg-ink-100 text-ink-600">{a.status}</span>
                      {a.isPrimary && <span className="badge bg-brand-50 text-brand-700">PRIMARY</span>}
                    </div>
                    <div className="mt-0.5 text-ink-500">
                      {a.site || 'site not recorded'} · created {a.createdAt ? formatDate(a.createdAt) : '—'} · {a.totalUses || 0} uses
                    </div>
                    {(a.interventions || []).length > 0 && <div className="mt-0.5 text-ink-600">Interventions: {a.interventions.join(' · ')}</div>}
                    {(a.complicationHistory || []).length > 0 && <div className="mt-0.5 text-rose-600">Issues: {a.complicationHistory.join(' · ')}</div>}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>

      {/* ---------- 11-13 ---------- */}
      <Section title="11. Clinical assessment" icon={Stethoscope}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['General condition', 'generalCondition', 'select', ['GOOD', 'FAIR', 'POOR', 'UNSTABLE']],
            ['Volume status', 'volumeStatus', 'text', null],
            ['BP', 'bloodPressure', 'text', null],
            ['Pulse', 'pulse', 'number', null],
            ['Temperature (°F)', 'temperature', 'number', null],
            ['SpO2 (%)', 'spo2', 'number', null],
            ['Weight (kg)', 'weightKg', 'number', null],
            ['Dry weight (kg)', 'dryWeightKg', 'number', null],
          ].map(([label, key, type, options]) => (
            <Field key={key} label={label}>
              {type === 'select' ? (
                <select className="select mt-1" value={form.clinicalAssessment[key]} onChange={(e) => setPath(`clinicalAssessment.${key}`, e.target.value)}>
                  {options.map((o) => <option key={o}>{o}</option>)}
                </select>
              ) : (
                <input className="input mt-1" type={type} value={form.clinicalAssessment[key] ?? ''} onChange={(e) => setPath(`clinicalAssessment.${key}`, e.target.value)} />
              )}
            </Field>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-ink-600">
          {['oedema', 'breathlessness', 'chestPain', 'pallor', 'pedalOedema', 'raisedJVP', 'pulmonaryCrackles', 'accessThrill', 'accessBruit'].map((k) => (
            <label key={k} className="flex items-center gap-1.5">
              <input type="checkbox" checked={Boolean(form.clinicalAssessment[k])} onChange={(e) => setPath(`clinicalAssessment.${k}`, e.target.checked)} />
              {k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}
            </label>
          ))}
        </div>
        <Field label="Symptoms" className="mt-3">
          <div className="mt-1"><Chips values={form.clinicalAssessment.symptoms} selected={[]} onToggle={(v) => setPath('clinicalAssessment.symptoms', form.clinicalAssessment.symptoms.includes(v) ? form.clinicalAssessment.symptoms.filter((x) => x !== v) : [...form.clinicalAssessment.symptoms, v])} /></div>
          <input className="input mt-1.5" placeholder="Add symptom(s), separate with |" value={freeText.symptom} onChange={(e) => setFreeText({ ...freeText, symptom: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTo('symptom', 'clinicalAssessment.symptoms'); } }} />
        </Field>
        <Field label="Examination notes" className="mt-2"><textarea className="input mt-1 h-20" value={form.clinicalAssessment.examinationNotes} onChange={(e) => setPath('clinicalAssessment.examinationNotes', e.target.value)} /></Field>
      </Section>

      <Section title="12. Doctor notes" icon={FileSignature}>
        <textarea className="input h-28" placeholder="Clinical reasoning, differential, discussion with the patient…" value={form.doctorNotes} onChange={(e) => setPath('doctorNotes', e.target.value)} />
      </Section>

      <Section title="13. Plan" icon={ClipboardCheck} tone="warn" hint="The plan is mandatory and carries the dialysis prescription the scheduler will use">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Modality', 'modality', 'select', ctx.prescriptionDefaults?.modalities || ['HEMODIALYSIS']],
            ['Frequency / week', 'frequencyPerWeek', 'number', null],
            ['Session duration (min)', 'durationMinutes', 'number', null],
            ['Target dry weight (kg)', 'targetDryWeightKg', 'number', null],
            ['UF goal (ml)', 'ultrafiltrationGoalMl', 'number', null],
            ['Max UF (ml)', 'maxUltrafiltrationMl', 'number', null],
            ['Blood flow (ml/min)', 'bloodFlowRate', 'number', null],
            ['Dialysate flow (ml/min)', 'dialysateFlowRate', 'number', null],
            ['Dialyser', 'dialyserType', 'text', null],
            ['Anticoagulation', 'anticoagulation', 'text', null],
            ['Access type', 'accessType', 'select', ctx.prescriptionDefaults?.accessTypes || ['AV_FISTULA']],
            ['Access side', 'accessSide', 'select', ['LEFT', 'RIGHT', 'NOT_APPLICABLE']],
          ].map(([label, key, type, options]) => (
            <Field key={key} label={label} required={key === 'modality'}>
              {type === 'select' ? (
                <select className="select mt-1" value={form.plan.prescription[key] || ''} onChange={(e) => setPath(`plan.prescription.${key}`, e.target.value)}>
                  <option value="">—</option>
                  {options.map((o) => <option key={o} value={o}>{String(o).replace(/_/g, ' ')}</option>)}
                </select>
              ) : (
                <input className="input mt-1" type={type} value={form.plan.prescription[key] ?? ''} onChange={(e) => setPath(`plan.prescription.${key}`, e.target.value)} />
              )}
            </Field>
          ))}
        </div>

        <Field label="Prescribed days" className="mt-3">
          <div className="mt-1"><Chips values={DAYS} selected={form.plan.prescription.daysOfWeek} onToggle={(v) => setPath('plan.prescription.daysOfWeek', form.plan.prescription.daysOfWeek.includes(v) ? form.plan.prescription.daysOfWeek.filter((x) => x !== v) : [...form.plan.prescription.daysOfWeek, v])} /></div>
        </Field>

        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div>
            <span className="label">Investigations to order</span>
            <div className="mt-1 space-y-1">
              {form.plan.investigations.map((x, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input className="input h-8 flex-1 py-0.5 text-[11px]" value={x.name} onChange={(e) => setForm((f) => ({ ...f, plan: { ...f.plan, investigations: f.plan.investigations.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)) } }))} />
                  <select className="input h-8 w-24 py-0.5 text-[11px]" value={x.priority} onChange={(e) => setForm((f) => ({ ...f, plan: { ...f.plan, investigations: f.plan.investigations.map((y, j) => (j === i ? { ...y, priority: e.target.value } : y)) } }))}>
                    {['ROUTINE', 'URGENT', 'STAT'].map((p) => <option key={p}>{p}</option>)}
                  </select>
                  <button type="button" className="text-rose-500" onClick={() => setForm((f) => ({ ...f, plan: { ...f.plan, investigations: f.plan.investigations.filter((_, j) => j !== i) } }))}><X className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex gap-1.5">
              <input className="input" placeholder="Investigation (separate with |)" value={freeText.investigation} onChange={(e) => setFreeText({ ...freeText, investigation: e.target.value })} />
              <button type="button" className="btn-secondary" onClick={() => {
                const parts = freeText.investigation.split('|').map((x) => x.trim()).filter(Boolean);
                setForm((f) => ({ ...f, plan: { ...f.plan, investigations: [...f.plan.investigations, ...parts.map((p) => ({ name: p, priority: 'ROUTINE', note: '' }))] } }));
                setFreeText({ ...freeText, investigation: '' });
              }}>Add</button>
            </div>
          </div>

          <div>
            <span className="label">Medication orders</span>
            <div className="mt-1 space-y-1">
              {form.plan.medicationOrders.map((m, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input className="input h-8 flex-1 py-0.5 text-[11px]" placeholder="Drug" value={m.name} onChange={(e) => setForm((f) => ({ ...f, plan: { ...f.plan, medicationOrders: f.plan.medicationOrders.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)) } }))} />
                  <input className="input h-8 w-24 py-0.5 text-[11px]" placeholder="Dose" value={m.dose || ''} onChange={(e) => setForm((f) => ({ ...f, plan: { ...f.plan, medicationOrders: f.plan.medicationOrders.map((y, j) => (j === i ? { ...y, dose: e.target.value } : y)) } }))} />
                  <input className="input h-8 w-20 py-0.5 text-[11px]" placeholder="Route" value={m.route || ''} onChange={(e) => setForm((f) => ({ ...f, plan: { ...f.plan, medicationOrders: f.plan.medicationOrders.map((y, j) => (j === i ? { ...y, route: e.target.value } : y)) } }))} />
                  <button type="button" className="text-rose-500" onClick={() => setForm((f) => ({ ...f, plan: { ...f.plan, medicationOrders: f.plan.medicationOrders.filter((_, j) => j !== i) } }))}><X className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex gap-1.5">
              <input className="input" placeholder="Drug | dose | route" value={freeText.medOrder} onChange={(e) => setFreeText({ ...freeText, medOrder: e.target.value })} onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const [name, dose, route] = freeText.medOrder.split('|').map((x) => x.trim());
                if (name) setForm((f) => ({ ...f, plan: { ...f.plan, medicationOrders: [...f.plan.medicationOrders, { name, dose: dose || '', route: route || '', frequency: '', indication: '' }] } }));
                setFreeText({ ...freeText, medOrder: '' });
              }}
              />
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Field label="Dietary advice"><textarea className="input mt-1 h-16" value={form.plan.dietaryAdvice} onChange={(e) => setPath('plan.dietaryAdvice', e.target.value)} /></Field>
          <Field label="Fluid advice"><textarea className="input mt-1 h-16" value={form.plan.fluidAdvice} onChange={(e) => setPath('plan.fluidAdvice', e.target.value)} /></Field>
          <Field label="Patient education"><textarea className="input mt-1 h-16" value={form.plan.patientEducation} onChange={(e) => setPath('plan.patientEducation', e.target.value)} /></Field>
          <Field label="Special instructions"><textarea className="input mt-1 h-16" value={form.plan.specialInstructions} onChange={(e) => setPath('plan.specialInstructions', e.target.value)} /></Field>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Follow-up date"><input className="input mt-1" type="date" value={form.plan.followUpDate} onChange={(e) => setPath('plan.followUpDate', e.target.value)} /></Field>
          <Field label="Next review date"><input className="input mt-1" type="date" value={form.plan.nextReviewDate} onChange={(e) => setPath('plan.nextReviewDate', e.target.value)} /></Field>
          <Field label="Referral"><input className="input mt-1" value={form.plan.referral} onChange={(e) => setPath('plan.referral', e.target.value)} placeholder="e.g. vascular surgeon" /></Field>
        </div>
      </Section>

      {priors.length > 0 && (
        <Section title="Previous assessments" icon={History} defaultOpen={false} hint="Assessments are never overwritten — an amendment always creates a new version">
          <ul className="space-y-1">
            {priors.map((p) => (
              <li key={p._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ink-50 px-2.5 py-1.5 text-[11px]">
                <span className="font-mono font-semibold text-brand-700">{p.assessmentNumber} v{p.version}</span>
                <span>{formatDate(p.assessmentDate)} {p.assessmentTime} · {p.doctorId?.name}</span>
                <span className="text-ink-500">{String(p.encounterType).replace(/_/g, ' ')} {p.encounterNumber || ''}</span>
                <span className={cn('badge', p.status === 'FINAL' ? 'bg-emerald-50 text-emerald-700' : 'bg-ink-100 text-ink-600')}>{p.status}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="flex justify-end gap-2">
        <button className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" onClick={submit} disabled={saving}>
          {saving ? <Spinner className="h-4 w-4 text-white" /> : <Save className="h-4 w-4" />} {form.status === 'DRAFT' ? 'Save draft' : 'Sign assessment'}
        </button>
      </div>
    </MotionPage>
  );
}

const ListEditor = ({ items, onRemove, render, empty }) => (
  <div>
    {!items?.length ? <p className="text-[11px] text-ink-400">{empty}</p> : (
      <ul className="flex flex-wrap gap-1">
        {items.map((x, i) => (
          <li key={i} className="flex items-center gap-1 rounded-lg bg-ink-100 px-2 py-1 text-[11px] text-ink-700">
            {render(x)}
            <button type="button" className="text-rose-500" onClick={() => onRemove(i)}><X className="h-3 w-3" /></button>
          </li>
        ))}
      </ul>
    )}
  </div>
);

// ================================================================ VIEW
function AssessmentView({ a, onBack, onAmend, amendOpen, amend }) {
  const [tab, setTab] = useState('document');
  const [notes, setNotes] = useState(a.doctorNotes || '');

  useEffect(() => { setNotes(a.doctorNotes || ''); }, [a._id, a.doctorNotes]);

  const tabs = [
    { key: 'document', label: 'Assessment' },
    { key: 'history', label: 'History' },
    { key: 'plan', label: 'Plan' },
  ];

  return (
    <MotionPage className="p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 hover:text-ink-800" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" /> Assessment list
        </button>
        <div className="flex gap-2">
          {amendOpen && <button className="btn-secondary" onClick={() => amend.mutate({ id: a._id, body: { doctorNotes: notes } })}>
            {amend.isPending ? <Spinner className="h-3.5 w-3.5" /> : <FileSignature className="h-3.5 w-3.5" />} Save as new version
          </button>}
          <button className="btn-primary" onClick={onAmend}><FileSignature className="h-3.5 w-3.5" /> Amend</button>
        </div>
      </div>

      <div className="card border-l-4 border-l-brand-500 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-bold text-brand-600">{a.assessmentNumber}</span>
              <span className="badge bg-ink-100 text-ink-600">version {a.version}</span>
              <span className={cn('badge', a.status === 'FINAL' ? 'bg-emerald-50 text-emerald-700' : a.status === 'DRAFT' ? 'bg-amber-50 text-amber-700' : 'bg-ink-100 text-ink-600')}>{a.status}</span>
            </div>
            <div className="mt-1 text-lg font-bold text-ink-900">{a.patientId?.firstName} {a.patientId?.lastName} <span className="text-xs font-normal text-ink-500">{a.patientId?.uhid} · {a.dialysisPatientId?.dialysisNumber}</span></div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            {[
              ['Doctor', a.doctorId?.name || a.doctorName || '—'],
              ['Date', formatDate(a.assessmentDate)],
              ['Time', a.assessmentTime],
              ['Encounter', `${String(a.encounterType).replace(/_/g, ' ')}${a.encounterNumber ? ` · ${a.encounterNumber}` : ''}`],
            ].map(([l, v]) => (
              <div key={l} className="rounded-lg bg-ink-50 px-3 py-1.5">
                <div className="text-[9px] uppercase tracking-wide text-ink-500">{l}</div>
                <div className="text-xs font-semibold text-ink-900">{v}</div>
              </div>
            ))}
          </div>
        </div>
        {a.previousAssessmentId && (
          <p className="mt-2 text-[10px] text-ink-500">
            Amends {a.previousAssessmentId.assessmentNumber} v{a.previousAssessmentId.version} — the original stays on file unchanged.
          </p>
        )}
      </div>

      <div className="flex gap-1 rounded-xl bg-ink-100 p-1">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={cn('rounded-lg px-3 py-1.5 text-xs font-semibold transition', tab === t.key ? 'bg-brand-600 text-white' : 'text-ink-600 hover:bg-white')}>{t.label}</button>
        ))}
      </div>

      <MotionTab tabKey={tab}>
        {tab === 'document' && (
          <div className="space-y-4">
            <Section title="Clinical assessment" icon={Stethoscope}>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Object.entries(a.clinicalAssessment || {}).filter(([, v]) => v !== undefined && v !== null && v !== '' && typeof v !== 'boolean').map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-ink-50 px-2.5 py-1.5">
                    <div className="text-[10px] uppercase tracking-wide text-ink-500">{k.replace(/([A-Z])/g, ' $1')}</div>
                    <div className="text-xs font-semibold text-ink-900">{String(v)}</div>
                  </div>
                ))}
              </div>
              {Object.entries(a.clinicalAssessment || {}).filter(([, v]) => typeof v === 'boolean' && v).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Object.entries(a.clinicalAssessment).filter(([, v]) => typeof v === 'boolean' && v).map(([k]) => (
                    <span key={k} className="badge bg-amber-50 text-amber-800">{k.replace(/([A-Z])/g, ' $1')}</span>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Doctor notes" icon={FileSignature}>
              {amendOpen ? (
                <textarea className="input h-32" value={notes} onChange={(e) => setNotes(e.target.value)} />
              ) : (
                <p className="whitespace-pre-wrap text-xs text-ink-800">{a.doctorNotes || <span className="text-ink-400">No notes recorded</span>}</p>
              )}
            </Section>
          </div>
        )}

        {tab === 'history' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Section title="Patient & CKD history" icon={UserRound}>
              <KeyValues rows={[
                ['UHID', a.patientHistory?.uhid], ['Primary diagnosis', a.patientHistory?.primaryDiagnosis],
                ['CKD onset', a.patientHistory?.ckdOnsetDate && formatDate(a.patientHistory.ckdOnsetDate)],
                ['ESRD date', a.patientHistory?.esrdDate && formatDate(a.patientHistory.esrdDate)],
                ['Dialysis start', a.patientHistory?.dialysisInitiationDate && formatDate(a.patientHistory.dialysisInitiationDate)],
                ['Renal aetiology', a.patientHistory?.renalAetiology], ['Family history', a.patientHistory?.familyHistory],
                ['Social history', a.patientHistory?.socialHistory],
                ['Current stage', a.ckdHistory?.currentStage], ['eGFR', a.ckdHistory?.egfr],
                ['Creatinine', a.ckdHistory?.creatinine], ['Years on dialysis', a.ckdHistory?.yearsOnDialysis],
              ]} />
            </Section>
            <Section title="Previous dialysis" icon={CalendarClock}>
              <KeyValues rows={[
                ['Total sessions', a.previousDialysis?.totalSessions], ['First session', a.previousDialysis?.firstSessionDate && formatDate(a.previousDialysis.firstSessionDate)],
                ['Last session', a.previousDialysis?.lastSessionDate && formatDate(a.previousDialysis.lastSessionDate)],
                ['Modality', a.previousDialysis?.currentModality], ['Frequency', a.previousDialysis?.sessionsPerWeek],
                ['Avg duration', a.previousDialysis?.averageDurationMinutes], ['Avg UF %', a.previousDialysis?.averageUfDeliveredPct],
                ['Machine used', a.previousDialysis?.machineUsed], ['Access', a.previousDialysis?.accessType],
              ]} />
            </Section>
            <Section title="Comorbidities" icon={AlertTriangle}>
              {!a.comorbidities?.length ? <p className="text-[11px] text-ink-400">None</p> : (
                <ul className="space-y-1">
                  {a.comorbidities.map((c, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-lg bg-ink-50 px-2.5 py-1.5 text-[11px]">
                      <span className="font-semibold text-ink-900">{c.name}</span>
                      {c.since && <span className="text-ink-500">since {formatDate(c.since)}</span>}
                      {c.controlled != null && <span className={cn('badge', c.controlled ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>{c.controlled ? 'controlled' : 'uncontrolled'}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title="Previous complications" icon={AlertTriangle}>
              {!a.previousComplications?.length ? <p className="text-[11px] text-emerald-700">None recorded</p> : (
                <ul className="space-y-1">
                  {a.previousComplications.map((c, i) => (
                    <li key={i} className="rounded-lg bg-ink-50 px-2.5 py-1.5 text-[11px]">
                      <span className="font-semibold text-ink-900">{c.type}</span> · {c.sessions} session(s)
                      {c.management && <div className="text-ink-600">{c.management}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title="Allergies" icon={AlertTriangle} tone={a.allergies?.length ? 'warn' : undefined}>
              {!a.allergies?.length ? <p className="text-[11px] text-ink-400">No known allergies</p> : (
                <ul className="space-y-1">
                  {a.allergies.map((x, i) => (
                    <li key={i} className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900">
                      <strong>{x.substance}</strong> — {x.reaction || 'reaction not recorded'} <span className="badge bg-white text-amber-800">{x.severity}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title="Medications, labs & access" icon={Beaker}>
              <div className="space-y-2 text-[11px]">
                <div><span className="font-semibold text-ink-700">Current medications</span>
                  <ul className="mt-1 space-y-0.5">
                    {(a.currentMedications || []).map((m, i) => <li key={i} className="rounded bg-ink-50 px-2 py-1">{m.name} {m.dose} · {m.frequency} · {m.route}</li>)}
                    {!(a.currentMedications || []).length && <li className="text-ink-400">None</li>}
                  </ul>
                </div>
                <div><span className="font-semibold text-ink-700">Lab results</span>
                  <ul className="mt-1 space-y-0.5">
                    {(a.previousLabResults || []).map((l, i) => <li key={i} className="flex justify-between rounded bg-ink-50 px-2 py-1"><span>{l.testName}</span><span className={cn(l.flag !== 'NORMAL' && 'font-semibold text-rose-600')}>{l.value} {l.unit || ''} ({l.flag})</span></li>)}
                    {!(a.previousLabResults || []).length && <li className="text-ink-400">None</li>}
                  </ul>
                </div>
                <div><span className="font-semibold text-ink-700">Access history</span>
                  <ul className="mt-1 space-y-0.5">
                    {(a.accessHistory || []).map((x, i) => <li key={i} className="rounded bg-ink-50 px-2 py-1">{String(x.accessType).replace(/_/g, ' ')} · {x.side} · {x.status} · {x.totalUses || 0} uses</li>)}
                    {!(a.accessHistory || []).length && <li className="text-ink-400">None</li>}
                  </ul>
                </div>
              </div>
            </Section>
          </div>
        )}

        {tab === 'plan' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Section title="Prescription plan" icon={ClipboardCheck}>
              <KeyValues rows={Object.entries(a.plan?.prescription || {}).map(([k, v]) => [k.replace(/([A-Z])/g, ' $1'), Array.isArray(v) ? v.join(', ') : v])} />
            </Section>
            <Section title="Advice & follow-up" icon={ClipboardCheck}>
              <KeyValues rows={[
                ['Dietary advice', a.plan?.dietaryAdvice], ['Fluid advice', a.plan?.fluidAdvice],
                ['Patient education', a.plan?.patientEducation], ['Special instructions', a.plan?.specialInstructions],
                ['Follow-up', a.plan?.followUpDate && formatDate(a.plan.followUpDate)],
                ['Next review', a.plan?.nextReviewDate && formatDate(a.plan.nextReviewDate)],
                ['Referral', a.plan?.referral],
              ]} />
            </Section>
            <Section title="Investigations" icon={FlaskConical}>
              {!a.plan?.investigations?.length ? <p className="text-[11px] text-ink-400">None</p> : (
                <ul className="space-y-1">
                  {a.plan.investigations.map((x, i) => (
                    <li key={i} className="flex items-center justify-between rounded-lg bg-ink-50 px-2.5 py-1.5 text-[11px]">
                      <span className="font-medium text-ink-900">{x.name}</span>
                      <span className="badge bg-white text-ink-600">{x.priority}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title="Medication orders" icon={Pill}>
              {!a.plan?.medicationOrders?.length ? <p className="text-[11px] text-ink-400">None</p> : (
                <ul className="space-y-1">
                  {a.plan.medicationOrders.map((m, i) => (
                    <li key={i} className="rounded-lg bg-ink-50 px-2.5 py-1.5 text-[11px]">
                      <span className="font-semibold text-ink-900">{m.name}</span> {m.dose} · {m.frequency} · {m.route}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        )}
      </MotionTab>

      <p className="text-[10px] text-ink-400">
        Signed {a.signedAt ? formatDateTime(a.signedAt) : 'not signed'} · created {formatDateTime(a.createdAt)}
      </p>
    </MotionPage>
  );
}

const KeyValues = ({ rows }) => (
  <div className="space-y-0.5">
    {rows.map(([k, v]) => (
      <div key={k} className="flex justify-between gap-3 border-b border-ink-100 py-1 text-[11px] last:border-0">
        <span className="capitalize text-ink-500">{k}</span>
        <span className="text-right font-medium text-ink-900">{v === undefined || v === null || v === '' ? '—' : String(v)}</span>
      </div>
    ))}
  </div>
);
