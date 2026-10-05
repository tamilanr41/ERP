import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Search, UserPlus, ShieldCheck, AlertTriangle, ArrowRight } from 'lucide-react';
import api, { apiError } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import { LoadingState, EmptyState } from '../../components/ui/Feedback';
import { MotionPage } from '../../components/ui/Motion';
import { cn } from '../../lib/utils';

const TYPES = ['HEMODIALYSIS', 'PERITONEAL', 'CRRT', 'SLED', 'HDF'];
const ACCESS = [
  { value: 'AV_FISTULA', label: 'AV fistula' },
  { value: 'AV_GRAFT', label: 'AV graft' },
  { value: 'CVC', label: 'Central venous catheter' },
  { value: 'PD_CATHETER', label: 'PD catheter' },
  { value: 'BUTTON_HOLE', label: 'Button hole' },
  { value: 'NONE', label: 'No access yet' },
];
const CKD = ['STAGE_3', 'STAGE_4', 'STAGE_5', 'ESRD', 'AKI', 'UNKNOWN'];
const PAYMENT = ['CASH', 'INSURANCE', 'SPONSOR', 'CREDIT', 'GOVT_SCHEME'];
const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

const Field = ({ label, children, hint }) => (
  <label className="label">
    {label}
    {children}
    {hint && <span className="mt-0.5 text-[10px] font-normal text-ink-400">{hint}</span>}
  </label>
);

export default function DialysisRegister() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [patient, setPatient] = useState(null);
  const [form, setForm] = useState({
    primaryDiagnosis: '', ckdStage: 'STAGE_5', dialysisType: 'HEMODIALYSIS',
    accessType: 'AV_FISTULA', accessSide: 'LEFT', sessionsPerWeek: 2,
    scheduleDays: ['MON', 'WED', 'FRI'], preferredShift: 'MORNING',
    paymentCategory: 'CASH', sponsor: '', tpaName: '', dryWeightKg: '', specialNeeds: '',
    insurancePolicyId: '',
  });

  // search the hospital master index — dialysis never creates a new patient
  const search = useQuery({
    queryKey: ['dialysis-patient-search', q],
    queryFn: async () => (await api.get('/patients', { params: { q, limit: 12 } })).data.data,
    enabled: q.trim().length >= 2,
  });

  const doctors = useQuery({ queryKey: ['dialysis-doctors'], queryFn: async () => (await api.get('/masters/doctors', { params: { limit: 100 } })).data.data });
  const nephros = (doctors.data || []);

  const existing = useQuery({
    queryKey: ['dialysis-registration-check', patient?._id],
    queryFn: async () => (await api.get('/dialysis/patients', { params: { q: patient.uhid, limit: 20 } })).data.data,
    enabled: Boolean(patient?._id),
  });
  const alreadyRegistered = (existing.data || []).some((r) => r.patientId?._id === patient?._id);

  const policies = useQuery({ queryKey: ['dialysis-policies'], queryFn: async () => (await api.get('/insurance/policies', { params: { limit: 50 } })).data.data, enabled: form.paymentCategory === 'INSURANCE' || form.paymentCategory === 'SPONSOR' });

  const register = useMutation({
    mutationFn: async () => (await api.post('/dialysis/patients', {
      ...form,
      patientId: patient._id,
      nephrologistId: form.nephrologistId,
      referringDoctorId: form.referringDoctorId,
      dryWeightKg: form.dryWeightKg ? Number(form.dryWeightKg) : undefined,
      insurancePolicyId: form.insurancePolicyId || undefined,
    })).data.data,
    onSuccess: (rec) => {
      toast.success(`Registered — dialysis ID ${rec.dialysisNumber}`);
      qc.invalidateQueries({ queryKey: ['dialysis-patients'] });
      navigate(`/dialysis/patient/${rec._id}`);
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const toggleDay = (d) => setForm((f) => ({
    ...f,
    scheduleDays: f.scheduleDays.includes(d) ? f.scheduleDays.filter((x) => x !== d) : [...f.scheduleDays, d],
  }));

  return (
    <MotionPage className="p-5">
      <PageHeader
        title="Dialysis Registration"
        subtitle="Link an existing hospital patient to the dialysis programme — a patient is never duplicated"
        actions={<button className="btn-secondary text-xs" onClick={() => navigate('/dialysis/patients')}>Dialysis register</button>}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
        <div className="card p-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-500">
            <Search className="h-3.5 w-3.5" /> Find existing patient
          </h3>
          <input className="input" placeholder="Search UHID, name or mobile" value={q} onChange={(e) => setQ(e.target.value)} />
          {q.trim().length >= 2 && (
            <div className="mt-2 max-h-72 space-y-1 overflow-y-auto">
              {search.isLoading ? <LoadingState label="Searching…" /> : (search.data || []).map((p) => (
                <button
                  key={p._id}
                  onClick={() => { setPatient(p); setForm((f) => ({ ...f, nephrologistId: '' })); }}
                  className={cn('flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-left text-xs transition', patient?._id === p._id ? 'border-brand-500 bg-brand-50' : 'border-ink-200 hover:bg-ink-50')}
                >
                  <span>
                    <span className="block font-semibold text-ink-900">{p.firstName} {p.lastName}</span>
                    <span className="text-[10px] text-ink-500">{p.uhid} · {p.gender} · {p.age?.years ?? p.age ?? '—'} yrs{p.bloodGroup ? ` · ${p.bloodGroup}` : ''}</span>
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-ink-400" />
                </button>
              ))}
              {!search.isLoading && !(search.data || []).length && <EmptyState title="No patient matches" hint="Register the patient in Patient Management first" />}
            </div>
          )}

          {patient && (
            <div className={cn('mt-3 rounded-xl border p-3', alreadyRegistered ? 'border-amber-300 bg-amber-50' : 'border-emerald-300 bg-emerald-50')}>
              <div className="text-sm font-bold text-ink-900">{patient.firstName} {patient.lastName}</div>
              <div className="text-[11px] text-ink-600">
                {patient.uhid} · {patient.mobile} · {patient.gender} · {patient.bloodGroup || 'blood group not recorded'}
              </div>
              {alreadyRegistered && (
                <p className="mt-2 flex items-start gap-1.5 text-[11px] font-semibold text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  This patient is already registered for dialysis. Open the existing record instead of creating a duplicate.
                  <button className="underline" onClick={() => navigate(`/dialysis/patient/${(existing.data || []).find((r) => r.patientId?._id === patient._id)?._id}`)}>Open</button>
                </p>
              )}
            </div>
          )}
        </div>

        <div className="card p-4">
          {!patient ? (
            <EmptyState title="Select a patient" hint="Search the hospital master index on the left to begin" />
          ) : (
            <form
              onSubmit={(e) => { e.preventDefault(); if (!alreadyRegistered) register.mutate(); }}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Primary diagnosis *" hint="e.g. CKD stage 5 — ESRD">
                  <input className="input mt-1" required value={form.primaryDiagnosis} onChange={set('primaryDiagnosis')} placeholder="Diagnosis" />
                </Field>
                <Field label="CKD stage">
                  <select className="select mt-1" value={form.ckdStage} onChange={set('ckdStage')}>
                    {CKD.map((x) => <option key={x}>{x}</option>)}
                  </select>
                </Field>
                <Field label="Dialysis type">
                  <select className="select mt-1" value={form.dialysisType} onChange={set('dialysisType')}>
                    {TYPES.map((x) => <option key={x}>{x}</option>)}
                  </select>
                </Field>
                <Field label="Nephrologist *">
                  <select className="select mt-1" required value={form.nephrologistId || ''} onChange={set('nephrologistId')}>
                    <option value="">Select doctor…</option>
                    {nephros.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}
                  </select>
                </Field>
                <Field label="Referring doctor">
                  <select className="select mt-1" value={form.referringDoctorId || ''} onChange={set('referringDoctorId')}>
                    <option value="">—</option>
                    {nephros.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}
                  </select>
                </Field>
                <Field label="Vascular access">
                  <select className="select mt-1" value={form.accessType} onChange={set('accessType')}>
                    {ACCESS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </Field>
                <Field label="Access side">
                  <select className="select mt-1" value={form.accessSide} onChange={set('accessSide')}>
                    <option>LEFT</option><option>RIGHT</option><option>NOT_APPLICABLE</option>
                  </select>
                </Field>
                <Field label="Dry weight (kg)">
                  <input className="input mt-1" type="number" value={form.dryWeightKg} onChange={set('dryWeightKg')} placeholder="kg" />
                </Field>
                <Field label="Payment category">
                  <select className="select mt-1" value={form.paymentCategory} onChange={set('paymentCategory')}>
                    {PAYMENT.map((x) => <option key={x}>{x}</option>)}
                  </select>
                </Field>
                {['INSURANCE', 'SPONSOR'].includes(form.paymentCategory) && (
                  <Field label="Insurance policy">
                    <select className="select mt-1" value={form.insurancePolicyId} onChange={set('insurancePolicyId')}>
                      <option value="">—</option>
                      {(policies.data || []).map((p) => <option key={p._id} value={p._id}>{p.companyName} · {p.policyNumber}</option>)}
                    </select>
                  </Field>
                )}
                {['INSURANCE', 'SPONSOR'].includes(form.paymentCategory) && (
                  <Field label="Sponsor / TPA">
                    <input className="input mt-1" value={form.sponsor} onChange={set('sponsor')} placeholder="Sponsor name" />
                  </Field>
                )}
                <Field label="Sessions per week">
                  <input className="input mt-1" type="number" min={1} max={7} value={form.sessionsPerWeek} onChange={set('sessionsPerWeek')} />
                </Field>
                <Field label="Preferred shift">
                  <select className="select mt-1" value={form.preferredShift} onChange={set('preferredShift')}>
                    {['MORNING', 'AFTERNOON', 'EVENING', 'NIGHT'].map((x) => <option key={x}>{x}</option>)}
                  </select>
                </Field>
                <Field label="Special needs">
                  <input className="input mt-1" value={form.specialNeeds} onChange={set('specialNeeds')} placeholder="Wheelchair, hearing, language…" />
                </Field>
              </div>

              <div>
                <span className="label">Schedule days</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {DAYS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDay(d)}
                      className={cn('rounded-lg px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset transition', form.scheduleDays.includes(d) ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-ink-600 ring-ink-200')}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-xl bg-ink-50 px-3 py-2.5">
                <div className="flex items-start gap-2 text-[11px] text-ink-600">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 text-emerald-600" />
                  <span>
                    A dialysis registration number (DIA-YYMMDD-0000) is generated on save and the patient keeps the same UHID.
                    {alreadyRegistered && <strong className="ml-1 text-rose-600"> Already registered — saving is blocked.</strong>}
                  </span>
                </div>
                <button className="btn-primary" type="submit" disabled={register.isPending || alreadyRegistered || !form.nephrologistId || !form.primaryDiagnosis}>
                  <UserPlus className="h-4 w-4" /> Register for dialysis
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </MotionPage>
  );
}
