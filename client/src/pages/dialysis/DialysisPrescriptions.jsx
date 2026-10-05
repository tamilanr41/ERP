import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CheckCircle2, ClipboardList, FileClock, Filter, History, PauseCircle, PlayCircle,
  Plus, Search, Settings2, Sliders, X, XCircle,
} from 'lucide-react';
import api, { apiError } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import { LoadingState, ErrorState, EmptyState, Spinner } from '../../components/ui/Feedback';
import { MotionPage, MotionTab } from '../../components/ui/Motion';
import { formatDate, formatDateTime, cn } from '../../lib/utils';
import { POLL } from '../../lib/polling';

const STATUS_STYLE = {
  DRAFT: 'bg-ink-100 text-ink-600 ring-ink-200',
  ACTIVE: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  SUSPENDED: 'bg-amber-50 text-amber-700 ring-amber-200',
  MODIFIED: 'bg-blue-50 text-blue-700 ring-blue-200',
  COMPLETED: 'bg-ink-100 text-ink-500 ring-ink-200',
  CANCELLED: 'bg-rose-50 text-rose-700 ring-rose-200',
};

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

const Field = ({ label, children, hint, required, className }) => (
  <label className={cn('label', className)}>
    <span className={required ? 'font-semibold text-rose-600' : ''}>{label}{required ? ' *' : ''}</span>
    {children}
    {hint && <span className="mt-0.5 text-[10px] font-normal text-ink-400">{hint}</span>}
  </label>
);

export default function DialysisPrescriptions() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('write');
  const [q, setQ] = useState('');
  const [patientId, setPatientId] = useState('');
  const [reason, setReason] = useState('');
  const [action, setAction] = useState(null);

  const defaults = useQuery({
    queryKey: ['dialysis-prescription-defaults'],
    queryFn: async () => (await api.get('/dialysis/config/prescription-defaults')).data.data,
  });

  const patients = useQuery({
    queryKey: ['dialysis-rx-patients', q],
    queryFn: async () => (await api.get('/dialysis/patients', { params: { q, limit: 20 } })).data.data,
    enabled: q.trim().length >= 2,
  });

  const history = useQuery({
    queryKey: ['dialysis-rx-history', patientId],
    queryFn: async () => (await api.get(`/dialysis/prescriptions/${patientId}`, { params: { limit: 50 } })).data.data,
    enabled: Boolean(patientId),
  });

  const config = useQuery({
    queryKey: ['dialysis-config'],
    queryFn: async () => (await api.get('/dialysis/config')).data.data,
  });

  const save = useMutation({
    mutationFn: async (body) => (await api.post('/dialysis/prescriptions', body)).data.data,
    onSuccess: (p) => {
      toast.success(`${p.prescriptionNumber} v${p.version} written as ${p.status}`);
      qc.invalidateQueries({ queryKey: ['dialysis-rx-history', patientId] });
      qc.invalidateQueries({ queryKey: ['dialysis-rx-patients'] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status, why }) => (await api.patch(`/dialysis/prescriptions/${id}/status`, { status, reason: why })).data.data,
    onSuccess: (p) => { toast.success(`${p.prescriptionNumber} → ${p.status}`); setAction(null); setReason(''); qc.invalidateQueries({ queryKey: ['dialysis-rx-history', patientId] }); },
    onError: (e) => toast.error(apiError(e)),
  });

  const saveConfig = useMutation({
    mutationFn: async (body) => (await api.patch('/dialysis/config', body)).data.data,
    onSuccess: () => { toast.success('Hospital dialysis defaults updated'); qc.invalidateQueries({ queryKey: ['dialysis-config'] }); qc.invalidateQueries({ queryKey: ['dialysis-prescription-defaults'] }); },
    onError: (e) => toast.error(apiError(e)),
  });

  if (defaults.isLoading) return <LoadingState label="Loading prescription rules…" />;
  if (defaults.error) return <ErrorState message={apiError(defaults.error)} />;

  return (
    <MotionPage className="p-5 space-y-4">
      <PageHeader
        title="Dialysis Prescription"
        subtitle="Every clinical field is hospital-configurable; each version is preserved and auditable"
        actions={<Link to="/dialysis/assessment" className="btn-secondary text-xs">Nephrology assessment</Link>}
      />

      <div className="flex flex-wrap gap-1">
        {[
          ['write', 'Write prescription', ClipboardList],
          ['versions', 'Version history', History],
          ['defaults', 'Hospital defaults', Settings2],
        ].map(([k, label, Icon]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition', tab === k ? 'bg-brand-600 text-white' : 'bg-white text-ink-600 ring-1 ring-inset ring-ink-200 hover:bg-ink-50')}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      <MotionTab tabKey={tab}>
        {tab === 'write' && (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[340px_1fr]">
            <div className="card p-3.5">
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-500"><Search className="h-3.5 w-3.5" /> Dialysis patient</h3>
              <input className="input" placeholder="Search dialysis ID, UHID or name" value={q} onChange={(e) => setQ(e.target.value)} />
              {q.trim().length >= 2 && (
                <div className="mt-2 max-h-80 space-y-1 overflow-y-auto">
                  {patients.isLoading ? <LoadingState label="Searching…" /> : (patients.data || []).map((p) => (
                    <button
                      key={p._id}
                      onClick={() => setPatientId(p.patientId._id)}
                      className={cn('w-full rounded-lg border px-2.5 py-2 text-left text-xs transition', patientId === p.patientId._id ? 'border-brand-500 bg-brand-50' : 'border-ink-200 hover:bg-ink-50')}
                    >
                      <span className="block font-semibold text-ink-900">{p.patientId?.firstName} {p.patientId?.lastName}</span>
                      <span className="text-[10px] text-ink-500">{p.dialysisNumber} · {p.patientId?.uhid} · {p.primaryDiagnosis || 'no diagnosis'}</span>
                    </button>
                  ))}
                  {!patients.isLoading && !(patients.data || []).length && <EmptyState title="No dialysis patient matches" />}
                </div>
              )}
            </div>

            {patientId ? (
              <PrescriptionForm
                defaults={defaults.data}
                history={history.data}
                historyLoading={history.isLoading}
                onSave={(body) => save.mutate(body)}
                saving={save.isPending}
              />
            ) : (
              <div className="card"><EmptyState title="Select a dialysis patient" hint="Search on the left to write a prescription" /></div>
            )}
          </div>
        )}

        {tab === 'versions' && (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[340px_1fr]">
            <div className="card p-3.5">
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-500"><Filter className="h-3.5 w-3.5" /> Choose a patient</h3>
              <input className="input" placeholder="Search dialysis ID, UHID or name" value={q} onChange={(e) => setQ(e.target.value)} />
              <div className="mt-2 max-h-[30rem] space-y-1 overflow-y-auto">
                {(patients.data || []).map((p) => (
                  <button
                    key={p._id}
                    onClick={() => setPatientId(p.patientId._id)}
                    className={cn('w-full rounded-lg border px-2.5 py-2 text-left text-xs transition', patientId === p.patientId._id ? 'border-brand-500 bg-brand-50' : 'border-ink-200 hover:bg-ink-50')}
                  >
                    <span className="block font-semibold text-ink-900">{p.patientId?.firstName} {p.patientId?.lastName}</span>
                    <span className="text-[10px] text-ink-500">{p.dialysisNumber} · {p.patientId?.uhid}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="card p-3.5">
              {!patientId ? <EmptyState title="No patient selected" hint="Pick a patient to see the full version chain" /> : history.isLoading ? <LoadingState label="Loading versions…" /> : !history.data?.length ? (
                <EmptyState title="No prescription written yet" />
              ) : (
                <>
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] text-ink-500">
                    <FileClock className="h-3.5 w-3.5" />
                    {history.data.length} version(s) on file — nothing is ever overwritten, each is linked to the next.
                  </div>
                  <div className="space-y-2">
                    {history.data.map((p) => (
                      <div key={p._id} className="rounded-xl border border-ink-100 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold text-brand-700">{p.prescriptionNumber}</span>
                            <span className="badge bg-ink-100 text-ink-600">v{p.version}</span>
                            <span className={cn('badge ring-1 ring-inset', STATUS_STYLE[p.status])}>{p.status}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {p.status === 'DRAFT' && <StatusButton icon={PlayCircle} label="Activate" onClick={() => { setAction(p); setReason(''); }} />}
                            {p.status === 'ACTIVE' && <StatusButton icon={PauseCircle} label="Suspend" tone="warn" onClick={() => { setAction(p); setReason(''); }} />}
                            {['ACTIVE', 'SUSPENDED'].includes(p.status) && <StatusButton icon={CheckCircle2} label="Complete" onClick={() => setStatus.mutate({ id: p._id, status: 'COMPLETED' })} />}
                            {!['CANCELLED', 'COMPLETED'].includes(p.status) && <StatusButton icon={XCircle} label="Cancel" tone="danger" onClick={() => { setAction(p); setReason(''); }} />}
                          </div>
                        </div>
                        <div className="mt-1.5 text-[11px] text-ink-600">
                          {p.prescribedByName || p.prescribedBy?.name} · {formatDate(p.prescribedAt)} · {p.modality} · {p.durationMinutes} min · Qb {p.bloodFlowRate} · Qd {p.dialysateFlowRate}
                          {p.frequencyPerWeek ? ` · ${p.frequencyPerWeek}/week` : ''}
                        </div>
                        <div className="mt-1 text-[11px] text-ink-500">
                          Dry weight {p.targetDryWeightKg ?? '—'} kg · UF goal {p.ultrafiltrationGoalMl ?? '—'} ml · max UF {p.maxUltrafiltrationMl ?? '—'} ml
                          {p.dialyserType ? ` · ${p.dialyserType}` : ''}{p.accessType ? ` · ${String(p.accessType).replace(/_/g, ' ')}` : ''}
                        </div>
                        {(p.anticoagulation || p.heparinProtocol) && <div className="mt-1 text-[11px] text-ink-600">Anticoagulation: {p.anticoagulation || p.heparinProtocol}</div>}
                        {(p.dialysateCalcium || p.dialysatePotassium || p.dialysateSodium) && (
                          <div className="mt-1 text-[11px] text-ink-600">
                            Dialysate: Ca {p.dialysateCalcium || '—'} · K {p.dialysatePotassium ?? '—'} · Na {p.dialysateSodium ?? '—'}
                          </div>
                        )}
                        {(p.medicationOrders || []).length > 0 && (
                          <div className="mt-1 text-[11px] text-ink-600">Medication orders: {p.medicationOrders.map((m) => `${m.name} ${m.dose || ''} ${m.frequency || ''}`.trim()).join(' · ')}</div>
                        )}
                        {p.specialInstructions && <div className="mt-1 text-[11px] font-medium text-brand-700">Special instructions: {p.specialInstructions}</div>}
                        {(p.statusReason || p.suspendedReason) && <div className="mt-1 text-[11px] text-amber-700">Reason: {p.statusReason || p.suspendedReason}</div>}
                        {p.previousPrescriptionId && (
                          <div className="mt-1 flex items-center gap-1 text-[10px] text-ink-400">
                            <History className="h-3 w-3" /> supersedes version {history.data.find((x) => x._id === p.previousPrescriptionId?._id)?.version ?? p.previousPrescriptionId}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {tab === 'defaults' && (
          <DefaultsEditor config={config.data} onSave={(body) => saveConfig.mutate(body)} saving={saveConfig.isPending} />
        )}
      </MotionTab>

      {action && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-md p-5">
            <div className="flex items-start justify-between">
              <h3 className="text-sm font-bold text-ink-900">
                {action.status === 'DRAFT' ? 'Activate' : action.status === 'ACTIVE' ? 'Suspend' : 'Cancel'} {action.prescriptionNumber}
              </h3>
              <button className="text-ink-400" onClick={() => setAction(null)}><X className="h-4 w-4" /></button>
            </div>
            <p className="mt-1 text-[11px] text-ink-500">
              {action.status === 'DRAFT'
                ? 'Activating makes this the prescription every new session will use.'
                : action.status === 'ACTIVE'
                  ? 'Suspending stops new sessions from using this prescription. Sessions already booked keep their snapshot.'
                  : 'Cancelling permanently closes this version. It stays in the history.'}
            </p>
            {action.status !== 'DRAFT' && (
              <Field label="Reason" required className="mt-3">
                <textarea className="input mt-1 h-20" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this happening?" />
              </Field>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setAction(null)}>Close</button>
              <button
                className="btn-primary"
                disabled={setStatus.isPending || (action.status !== 'DRAFT' && !reason.trim())}
                onClick={() => setStatus.mutate({ id: action._id, status: action.status === 'DRAFT' ? 'ACTIVE' : action.status === 'ACTIVE' ? 'SUSPENDED' : 'CANCELLED', why: reason })}
              >
                {setStatus.isPending ? <Spinner className="h-4 w-4 text-white" /> : <CheckCircle2 className="h-4 w-4" />} Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </MotionPage>
  );
}

const StatusButton = ({ icon: Icon, label, onClick, tone }) => (
  <button
    onClick={onClick}
    className={cn(
      'flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold ring-1 ring-inset transition',
      tone === 'danger' ? 'bg-rose-50 text-rose-700 ring-rose-200 hover:bg-rose-100'
        : tone === 'warn' ? 'bg-amber-50 text-amber-700 ring-amber-200 hover:bg-amber-100'
          : 'bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100',
    )}
  >
    <Icon className="h-3 w-3" /> {label}
  </button>
);

// ================================================================ FORM
function PrescriptionForm({ defaults, history, historyLoading, onSave, saving }) {
  const d = defaults.defaults;
  const active = useMemo(() => (history || []).find((p) => p.status === 'ACTIVE'), [history]);
  const [form, setForm] = useState(() => ({
    prescribedBy: '', status: 'ACTIVE', modality: d.modality, durationMinutes: d.durationMinutes,
    frequencyPerWeek: d.frequencyPerWeek, daysOfWeek: ['MON', 'WED', 'FRI'],
    targetDryWeightKg: '', ultrafiltrationGoalMl: d.ultrafiltrationGoalMl, maxUltrafiltrationMl: d.maxUltrafiltrationMl,
    bloodFlowRate: d.bloodFlowRate, dialysateFlowRate: d.dialysateFlowRate,
    dialysateCalcium: d.dialysateCalcium || '', dialysatePotassium: d.dialysatePotassium ?? '', dialysateSodium: d.dialysateSodium ?? '',
    dialysateTemperature: d.dialysateTemperature ?? '', dialyserType: d.dialyserType || '', filterType: '',
    anticoagulation: d.anticoagulationProtocol || '', heparinProtocol: d.anticoagulationProtocol || '',
    heparinPrimeUnits: d.heparinPrimeUnits, heparinMaintenanceUnits: '',
    potassiumTarget: '', accessType: d.accessType, accessSide: 'LEFT', accessSite: '',
    medicationOrders: [], specialInstructions: '', notes: '', changeNote: '',
  }));
  const [free, setFree] = useState({ med: '' });

  useEffect(() => {
    if (!active) return;
    setForm((f) => ({
      ...f,
      prescribedBy: f.prescribedBy || active.prescribedBy?._id || active.prescribedBy,
      modality: active.modality || f.modality,
      durationMinutes: active.durationMinutes ?? f.durationMinutes,
      bloodFlowRate: active.bloodFlowRate ?? f.bloodFlowRate,
      dialysateFlowRate: active.dialysateFlowRate ?? f.dialysateFlowRate,
      ultrafiltrationGoalMl: active.ultrafiltrationGoalMl ?? f.ultrafiltrationGoalMl,
      maxUltrafiltrationMl: active.maxUltrafiltrationMl ?? f.maxUltrafiltrationMl,
      targetDryWeightKg: active.targetDryWeightKg ?? f.targetDryWeightKg,
      dialyserType: active.dialyserType || f.dialyserType,
      accessType: active.accessType || f.accessType,
    }));
  }, [active]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    const body = { ...form };
    ['targetDryWeightKg', 'ultrafiltrationGoalMl', 'maxUltrafiltrationMl', 'dialysatePotassium', 'dialysateSodium', 'dialysateTemperature', 'heparinPrimeUnits', 'heparinMaintenanceUnits', 'potassiumTarget', 'durationMinutes', 'frequencyPerWeek', 'bloodFlowRate', 'dialysateFlowRate'].forEach((k) => {
      if (body[k] === '') body[k] = undefined;
    });
    if (body.status !== 'ACTIVE') {
      toast.info('A draft prescription cannot be used for scheduling until it is activated.');
    }
    onSave(body);
  };

  return (
    <div className="space-y-4">
      {active && (
        <div className="card border-l-4 border-l-emerald-500 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-bold text-ink-900">Current active prescription</div>
              <div className="text-[11px] text-ink-500">
                {active.prescriptionNumber} v{active.version} · {active.modality} · {active.durationMinutes} min · Qb {active.bloodFlowRate} · UF goal {active.ultrafiltrationGoalMl ?? '—'} ml
                {active.prescribedByName || active.prescribedBy?.name ? ` · ${active.prescribedByName || active.prescribedBy?.name}` : ''}
              </div>
            </div>
            <span className="badge bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200">ACTIVE</span>
          </div>
          <p className="mt-2 text-[10px] text-ink-500">Saving the form below writes a <strong>new version</strong>. The active version is closed out and linked — it is never edited.</p>
        </div>
      )}

      <div className="card p-3.5">
        <h3 className="mb-2 text-sm font-bold text-ink-900">Dialysis prescription</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Modality" required>
            <select className="select mt-1" value={form.modality} onChange={set('modality')}>
              {(defaults.modalities || []).map((x) => <option key={x} value={x}>{x.replace(/_/g, ' ')}</option>)}
            </select>
          </Field>
          <Field label="Session duration (min)" required>
            <select className="select mt-1" value={form.durationMinutes} onChange={set('durationMinutes')}>
              {(defaults.durationOptions || [240]).map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </Field>
          <Field label="Frequency / week">
            <input className="input mt-1" type="number" step="0.5" min="0" max="7" value={form.frequencyPerWeek} onChange={set('frequencyPerWeek')} />
          </Field>
          <Field label="Prescribed days">
            <div className="mt-1 flex flex-wrap gap-1">
              {DAYS.map((x) => (
                <button
                  key={x}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, daysOfWeek: f.daysOfWeek.includes(x) ? f.daysOfWeek.filter((y) => y !== x) : [...f.daysOfWeek, x] }))}
                  className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset', form.daysOfWeek.includes(x) ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-ink-600 ring-ink-200')}
                >
                  {x}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Target / dry weight (kg)">
            <input className="input mt-1" type="number" step="0.1" value={form.targetDryWeightKg} onChange={set('targetDryWeightKg')} />
          </Field>
          <Field label="Ultrafiltration goal (ml)">
            <input className="input mt-1" type="number" value={form.ultrafiltrationGoalMl} onChange={set('ultrafiltrationGoalMl')} />
          </Field>
          <Field label="Maximum UF (ml)" hint="Safety ceiling set by the nephrologist">
            <input className="input mt-1" type="number" value={form.maxUltrafiltrationMl} onChange={set('maxUltrafiltrationMl')} />
          </Field>
          <Field label="Blood flow (ml/min)">
            <input className="input mt-1" type="number" value={form.bloodFlowRate} onChange={set('bloodFlowRate')} />
          </Field>
          <Field label="Dialysate flow (ml/min)">
            <input className="input mt-1" type="number" value={form.dialysateFlowRate} onChange={set('dialysateFlowRate')} />
          </Field>
          <Field label="Dialyser type">
            <input className="input mt-1" value={form.dialyserType} onChange={set('dialyserType')} placeholder="e.g. FX90" />
          </Field>
          <Field label="Filter type">
            <input className="input mt-1" value={form.filterType} onChange={set('filterType')} />
          </Field>
          <Field label="Potassium target">
            <input className="input mt-1" value={form.potassiumTarget} onChange={set('potassiumTarget')} />
          </Field>
        </div>

        <h4 className="mb-2 mt-4 flex items-center gap-1.5 text-xs font-bold text-ink-700"><Sliders className="h-3.5 w-3.5 text-brand-600" /> Dialysate parameters</h4>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Calcium"><input className="input mt-1" value={form.dialysateCalcium} onChange={set('dialysateCalcium')} placeholder="1.25 / 1.5 / 2.5" /></Field>
          <Field label="Potassium (mEq/L)"><input className="input mt-1" type="number" step="0.1" value={form.dialysatePotassium} onChange={set('dialysatePotassium')} /></Field>
          <Field label="Sodium (mEq/L)"><input className="input mt-1" type="number" value={form.dialysateSodium} onChange={set('dialysateSodium')} /></Field>
          <Field label="Temperature (°C)"><input className="input mt-1" type="number" step="0.1" value={form.dialysateTemperature} onChange={set('dialysateTemperature')} /></Field>
        </div>

        <h4 className="mb-2 mt-4 flex items-center gap-1.5 text-xs font-bold text-ink-700"><PauseCircle className="h-3.5 w-3.5 text-brand-600" /> Anticoagulation order</h4>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Anticoagulation"><input className="input mt-1" value={form.anticoagulation} onChange={set('anticoagulation')} placeholder="Heparin / LMWH / Citrate / None" /></Field>
          <Field label="Heparin prime (U)"><input className="input mt-1" type="number" value={form.heparinPrimeUnits} onChange={set('heparinPrimeUnits')} /></Field>
          <Field label="Maintenance / hr"><input className="input mt-1" type="number" value={form.heparinMaintenanceUnits} onChange={set('heparinMaintenanceUnits')} /></Field>
          <Field label="Protocol notes"><input className="input mt-1" value={form.heparinProtocol} onChange={set('heparinProtocol')} /></Field>
        </div>

        <h4 className="mb-2 mt-4 flex items-center gap-1.5 text-xs font-bold text-ink-700"><ClipboardList className="h-3.5 w-3.5 text-brand-600" /> Access</h4>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Access type">
            <select className="select mt-1" value={form.accessType} onChange={set('accessType')}>
              {(defaults.accessTypes || []).map((x) => <option key={x} value={x}>{x.replace(/_/g, ' ')}</option>)}
            </select>
          </Field>
          <Field label="Access side">
            <select className="select mt-1" value={form.accessSide} onChange={set('accessSide')}>
              <option>LEFT</option><option>RIGHT</option><option>NOT_APPLICABLE</option>
            </select>
          </Field>
          <Field label="Access site"><input className="input mt-1" value={form.accessSite} onChange={set('accessSite')} placeholder="e.g. radiocephalic AVF" /></Field>
        </div>

        <h4 className="mb-2 mt-4 flex items-center gap-1.5 text-xs font-bold text-ink-700"><ClipboardList className="h-3.5 w-3.5 text-brand-600" /> Medication orders</h4>
        <div className="space-y-1">
          {form.medicationOrders.map((m, i) => (
            <div key={i} className="flex flex-wrap items-center gap-1.5">
              <input className="input h-8 w-44 py-0.5 text-[11px]" placeholder="Drug" value={m.name} onChange={(e) => setForm((f) => ({ ...f, medicationOrders: f.medicationOrders.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) }))} />
              <input className="input h-8 w-28 py-0.5 text-[11px]" placeholder="Dose" value={m.dose} onChange={(e) => setForm((f) => ({ ...f, medicationOrders: f.medicationOrders.map((x, j) => (j === i ? { ...x, dose: e.target.value } : x)) }))} />
              <input className="input h-8 w-28 py-0.5 text-[11px]" placeholder="Frequency" value={m.frequency} onChange={(e) => setForm((f) => ({ ...f, medicationOrders: f.medicationOrders.map((x, j) => (j === i ? { ...x, frequency: e.target.value } : x)) }))} />
              <input className="input h-8 w-24 py-0.5 text-[11px]" placeholder="Route" value={m.route} onChange={(e) => setForm((f) => ({ ...f, medicationOrders: f.medicationOrders.map((x, j) => (j === i ? { ...x, route: e.target.value } : x)) }))} />
              <input className="input h-8 flex-1 py-0.5 text-[11px]" placeholder="Timing / note" value={m.timing} onChange={(e) => setForm((f) => ({ ...f, medicationOrders: f.medicationOrders.map((x, j) => (j === i ? { ...x, timing: e.target.value } : x)) }))} />
              <button type="button" className="text-rose-500" onClick={() => setForm((f) => ({ ...f, medicationOrders: f.medicationOrders.filter((_, j) => j !== i) }))}><X className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex gap-1.5">
          <input className="input" placeholder="Drug | dose | frequency | route | timing" value={free.med} onChange={(e) => setFree({ ...free, med: e.target.value })} />
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              const [name, dose, frequency, route, timing] = free.med.split('|').map((x) => x.trim());
              if (name) setForm((f) => ({ ...f, medicationOrders: [...f.medicationOrders, { name, dose: dose || '', frequency: frequency || '', route: route || '', timing: timing || '', note: '' }] }));
              setFree({ med: '' });
            }}
          ><Plus className="h-3.5 w-3.5" /> Add</button>
        </div>

        <Field label="Special instructions" className="mt-4" hint="Printed on the session run sheet and visible to the nursing team">
          <textarea className="input mt-1 h-20" value={form.specialInstructions} onChange={set('specialInstructions')} />
        </Field>
        <Field label="Change note" className="mt-3" hint="Recorded in the audit trail alongside this version">
          <input className="input mt-1" value={form.changeNote} onChange={set('changeNote')} placeholder="e.g. increased UF goal after fluid overload" />
        </Field>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-2 rounded-xl bg-ink-50 p-3">
          <div className="flex gap-2">
            <Field label="Prescribing doctor">
              <input className="input mt-1 w-56" value={form.prescribedBy} onChange={set('prescribedBy')} placeholder="Doctor id (defaults to the signed-in doctor)" />
            </Field>
            <Field label="Save as">
              <select className="select mt-1" value={form.status} onChange={set('status')}>
                <option value="ACTIVE">ACTIVE — usable for scheduling</option>
                <option value="DRAFT">DRAFT — review before activating</option>
              </select>
            </Field>
          </div>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? <Spinner className="h-4 w-4 text-white" /> : <Plus className="h-4 w-4" />} Write new version
          </button>
        </div>
      </div>

      <div className="card p-3.5">
        <h3 className="mb-2 text-sm font-bold text-ink-900">Version chain for this patient</h3>
        {historyLoading ? <LoadingState label="Loading versions…" /> : !history?.length ? <EmptyState title="No prescription yet" hint="The form above will create version 1" /> : (
          <ol className="relative space-y-2 border-l-2 border-ink-200 pl-4">
            {history.map((p) => (
              <li key={p._id} className="relative">
                <span className={cn('absolute -left-[22px] top-1.5 h-2.5 w-2.5 rounded-full', p.status === 'ACTIVE' ? 'bg-emerald-500' : p.status === 'DRAFT' ? 'bg-amber-500' : 'bg-ink-300')} />
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="font-mono font-semibold text-brand-700">{p.prescriptionNumber}</span>
                  <span className="badge bg-ink-100 text-ink-600">v{p.version}</span>
                  <span className={cn('badge ring-1 ring-inset', STATUS_STYLE[p.status])}>{p.status}</span>
                  <span className="text-ink-500">{p.prescribedByName || p.prescribedBy?.name} · {formatDateTime(p.prescribedAt)}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

// ================================================================ DEFAULTS
function DefaultsEditor({ config, onSave, saving }) {
  const [safety, setSafety] = useState(null);
  const [preset, setPreset] = useState(null);

  useEffect(() => {
    if (config && !safety) setSafety({ ...config.prescription.safety });
    if (config && !preset) setPreset({ ...config.prescription.defaults });
  }, [config, safety, preset]);

  if (!config) return <LoadingState label="Loading configuration…" />;

  const numField = (label, key, obj, setObj, step = 1) => (
    <Field key={key} label={label}>
      <input className="input mt-1" type="number" step={step} value={obj?.[key] ?? ''} onChange={(e) => setObj((o) => ({ ...o, [key]: e.target.value === '' ? '' : Number(e.target.value) }))} />
    </Field>
  );

  return (
    <div className="space-y-4">
      <div className="card border-l-4 border-l-amber-400 p-3.5">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-ink-900"><Settings2 className="h-4 w-4 text-brand-600" /> Why this screen exists</h3>
        <p className="mt-1 text-[11px] text-ink-600">
          No medical value is hard-coded in the dialysis engine. The defaults below seed every new prescription, and the safety thresholds
          below decide when a pre-dialysis reading is blocked. Change them here and the whole unit follows this hospital&apos;s protocol.
        </p>
      </div>

      <div className="card p-3.5">
        <h3 className="mb-2 text-sm font-bold text-ink-900">Prescription defaults</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Modality">
            <select className="select mt-1" value={preset.modality} onChange={(e) => setPreset({ ...preset, modality: e.target.value })}>
              {(config.prescription.modalities || []).map((x) => <option key={x} value={x}>{x.replace(/_/g, ' ')}</option>)}
            </select>
          </Field>
          {numField('Duration (min)', 'durationMinutes', preset, setPreset)}
          {numField('Frequency / week', 'frequencyPerWeek', preset, setPreset, 0.5)}
          {numField('Blood flow (ml/min)', 'bloodFlowRate', preset, setPreset)}
          {numField('Dialysate flow (ml/min)', 'dialysateFlowRate', preset, setPreset)}
          {numField('UF goal (ml)', 'ultrafiltrationGoalMl', preset, setPreset)}
          {numField('Max UF (ml)', 'maxUltrafiltrationMl', preset, setPreset)}
          {numField('Heparin prime (U)', 'heparinPrimeUnits', preset, setPreset)}
          <Field label="Access type">
            <select className="select mt-1" value={preset.accessType} onChange={(e) => setPreset({ ...preset, accessType: e.target.value })}>
              {(config.prescription.accessTypes || []).map((x) => <option key={x} value={x}>{x.replace(/_/g, ' ')}</option>)}
            </select>
          </Field>
          <Field label="Anticoagulation protocol"><input className="input mt-1" value={preset.anticoagulationProtocol || ''} onChange={(e) => setPreset({ ...preset, anticoagulationProtocol: e.target.value })} /></Field>
        </div>
      </div>

      <div className="card p-3.5">
        <h3 className="mb-1 text-sm font-bold text-ink-900">Pre-dialysis safety thresholds</h3>
        <p className="mb-2 text-[11px] text-ink-500">A reading outside these limits blocks the session until the nephrologist acknowledges it.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {numField('Systolic min', 'systolicMin', safety, setSafety)}
          {numField('Systolic max', 'systolicMax', safety, setSafety)}
          {numField('Diastolic min', 'diastolicMin', safety, setSafety)}
          {numField('Diastolic max', 'diastolicMax', safety, setSafety)}
          {numField('Pulse min', 'pulseMin', safety, setSafety)}
          {numField('Pulse max', 'pulseMax', safety, setSafety)}
          {numField('Temperature min (°F)', 'temperatureMinF', safety, setSafety, 0.1)}
          {numField('Temperature max (°F)', 'temperatureMaxF', safety, setSafety, 0.1)}
          {numField('SpO2 min (%)', 'spo2Min', safety, setSafety)}
          {numField('Blood sugar min', 'bloodSugarMin', safety, setSafety)}
          {numField('Blood sugar max', 'bloodSugarMax', safety, setSafety)}
        </div>
      </div>

      <div className="card p-3.5">
        <h3 className="mb-2 text-sm font-bold text-ink-900">Scheduling & slot board</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Default shift">
            <select className="select mt-1" value={config.scheduling.defaultShift} onChange={(e) => onSave({ scheduling: { defaultShift: e.target.value } })}>
              {(config.scheduling.shifts || []).map((s) => <option key={s.code} value={s.code}>{s.label || s.code}</option>)}
            </select>
          </Field>
          <Field label="Default duration (min)"><input className="input mt-1" type="number" value={config.scheduling.defaultDurationMinutes} onChange={(e) => onSave({ scheduling: { defaultDurationMinutes: Number(e.target.value) } })} /></Field>
          <Field label="Booking lead time (days)"><input className="input mt-1" type="number" value={config.scheduling.leadTimeDays} onChange={(e) => onSave({ scheduling: { leadTimeDays: Number(e.target.value) } })} /></Field>
          <Field label="Max advance (days)"><input className="input mt-1" type="number" value={config.scheduling.maxAdvanceDays} onChange={(e) => onSave({ scheduling: { maxAdvanceDays: Number(e.target.value) } })} /></Field>
          <Field label="Slot grid starts"><input className="input mt-1" type="time" value={config.slotGrid.dayStart} onChange={(e) => onSave({ slotGrid: { dayStart: e.target.value } })} /></Field>
          <Field label="Slot grid ends"><input className="input mt-1" type="time" value={config.slotGrid.dayEnd} onChange={(e) => onSave({ slotGrid: { dayEnd: e.target.value } })} /></Field>
          <Field label="Row interval (min)"><input className="input mt-1" type="number" value={config.slotGrid.slotMinutes} onChange={(e) => onSave({ slotGrid: { slotMinutes: Number(e.target.value) } })} /></Field>
          <Field label="Bays shown on the board"><input className="input mt-1" type="number" value={config.slotGrid.visibleStations} onChange={(e) => onSave({ slotGrid: { visibleStations: Number(e.target.value) } })} /></Field>
        </div>
        <p className="mt-2 text-[10px] text-ink-400">Grid fields save as you change them.</p>
      </div>

      <div className="card p-3.5">
        <h3 className="mb-2 text-sm font-bold text-ink-900">Recurring patterns offered by this hospital</h3>
        <div className="flex flex-wrap gap-1.5">
          {(config.scheduling.recurrencePatterns || []).map((p) => (
            <span key={p.code} className="rounded-lg bg-ink-50 px-2.5 py-1.5 text-[11px]">
              <span className="font-semibold text-ink-900">{p.code}</span>
              <span className="ml-1.5 text-ink-600">{p.label}</span>
              <span className="ml-1.5 text-ink-400">{(p.days || []).join('/')}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <button className="btn-primary" onClick={() => onSave({ prescription: { defaults: preset, safety } })} disabled={saving}>
          {saving ? <Spinner className="h-4 w-4 text-white" /> : <CheckCircle2 className="h-4 w-4" />} Save prescription defaults & thresholds
        </button>
      </div>
    </div>
  );
}
