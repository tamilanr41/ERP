import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  UserSearch,
  Plus,
  X,
  Stethoscope,
  Activity,
  CheckCircle2,
  UserPlus,
  CalendarClock,
  ClipboardList,
  Pill,
  FlaskConical,
  ArrowRight,
  Ticket,
  Receipt,
  History,
  Layers,
  FileText,
  AlertTriangle,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import api, { apiError } from '../lib/api';
import PageHeader from '../components/ui/PageHeader';
import { LoadingState, ErrorState, EmptyState, Spinner } from '../components/ui/Feedback';
import Badge, { badge } from '../components/ui/Badge';
import { useAuth } from '../context/AuthContext';
import { formatDate, formatDateTime, formatCurrency, initials, cn } from '../lib/utils';
import PaymentReceipt, { MODE_LABEL } from '../components/ui/PaymentReceipt';

const VISIT_TYPES = { NEW: 'New', FOLLOW_UP: 'Follow-up', WALK_IN: 'Walk-in', EMERGENCY: 'Emergency' };
const ORDER_CATEGORIES = ['LAB', 'RADIOLOGY', 'PROCEDURE', 'MEDICATION', 'REFERRAL', 'DIET', 'OTHER'];
const ORDER_PRIORITIES = ['ROUTINE', 'URGENT', 'STAT'];
const PAY_MODES = ['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'WALLET', 'CHEQUE', 'INSURANCE', 'CREDIT', 'SPONSOR'];
const ITEM_TYPES = ['CONSULTATION', 'SERVICE', 'TEST', 'MEDICINE', 'PROCEDURE', 'MISCELLANEOUS'];

const todayISO = () => new Date().toISOString().slice(0, 10);
const nowTime = () => new Date().toTimeString().slice(0, 5);

// Walk-in visits get a General Medicine token derived from the OP number seq,
// e.g. OP-260921-021 → GM-021. Booked appointments keep their #tokenNumber.
const tokenFromOpd = (opdNumber = '') => {
  const m = String(opdNumber).match(/OP-\d{6}-(\d+)$/);
  return m ? `GM-${m[1]}` : null;
};

const billingSummary = (v) => {
  const b = v.billing;
  if (!b || !b.billCount) return <span className="text-xs text-ink-400">—</span>;
  if (b.outstandingCount > 0) return <Badge label={`Due ${formatCurrency(b.totalDue)}`} status="PENDING" />;
  if (b.totalPaid > 0) return <Badge label="Paid" status="PAID" />;
  return <span className="text-xs text-ink-400">Billed</span>;
};

const STAGES = [
  { key: 'arrive', label: 'Arrival', icon: UserSearch },
  { key: 'register', label: 'OP Registration', icon: CalendarClock },
  { key: 'billing', label: 'Billing & Payment', icon: Receipt },
  { key: 'queue', label: 'Token & Queue', icon: Ticket },
  { key: 'vitals', label: 'Nurse / Vitals', icon: Activity },
  { key: 'consult', label: 'Consultation', icon: Stethoscope },
  { key: 'investigate', label: 'Investigations', icon: FlaskConical },
  { key: 'prescribe', label: 'Prescription', icon: Pill },
  { key: 'complete', label: 'Follow-up & Complete', icon: CheckCircle2 },
];

export default function OpdPage() {
  const qc = useQueryClient();
  const location = useLocation();
  const [journey, setJourney] = useState(() => (location.state?.start ? {} : null));
  const [resetKey, setResetKey] = useState(0);

  const visits = useQuery({
    queryKey: ['opd-visits', { page: 1, status: '' }],
    queryFn: async () => (await api.get('/opd/visits', { params: { page: 1, limit: 8 } })).data,
  });
  const qcux = () => qc.invalidateQueries({ queryKey: ['opd-visits'] });

  return (
    <div className="p-6">
      <div className="relative overflow-hidden rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-700 via-brand-600 to-mint-600 px-6 py-7 text-white shadow-lg shadow-brand-700/10">
        <div className="pointer-events-none absolute -right-10 -top-16 h-52 w-52 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-8 h-44 w-44 rounded-full bg-mint-400/20 blur-2xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
              <Stethoscope className="h-7 w-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-brand-100/90">
                ZhanX Clinical · OPD
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white ring-1 ring-inset ring-white/25">
                  Journey ready
                </span>
              </div>
              <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-white">OPD Patient Journey</h1>
              <p className="mt-1 text-sm text-brand-100/95">Arrival → registration → billing → queue → vitals → consultation → investigations → prescription → completion</p>
            </div>
          </div>
          <button
            className="btn-primary !border-0 bg-white text-brand-400 shadow-md shadow-brand-900/20 hover:bg-brand-50"
            onClick={() => { setJourney({}); setResetKey((k) => k + 1); }}
          >
            <Plus className="h-4 w-4" /> Start Patient Journey
          </button>
        </div>
      </div>

      {journey ? (
        <JourneyWorkspace key={resetKey} journey={journey} setJourney={setJourney} onInvalidate={qcux} />
      ) : (
        <div className="mt-6">
          {visits.isLoading ? <LoadingState /> : visits.error ? (
            <ErrorState message={apiError(visits.error)} />
          ) : !visits.data?.data?.length ? (
            <EmptyState title="No OPD visits yet" hint="Start a patient journey to begin the flow" />
          ) : (
            <div className="card overflow-hidden">
              <div className="border-b border-ink-100 bg-ink-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-ink-400">Recent visits</div>
              <table className="table">
                <thead>
                  <tr>
                    <th>OPD No</th>
                    <th>Patient</th>
                    <th>Doctor</th>
                    <th>Complaint</th>
                    <th>Billing</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visits.data.data.slice(0, 5).map((v) => (
                    <tr key={v._id}>
<td className="font-medium text-brand-700">{v.opdNumber}</td>
                      <td>
                        <div className="font-medium text-ink-900">{v.patientId?.firstName} {v.patientId?.lastName || ''}</div>
                        <div className="text-xs text-ink-400">{v.patientId?.uhid}</div>
                      </td>
                      <td>{v.doctorId?.name || '—'}</td>
                      <td className="max-w-[240px] truncate">{v.chiefComplaint || '—'}</td>
                      <td>{billingSummary(v)}</td>
                      <td>{badge(v.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const STAGE_ORDER = STAGES.map((s) => s.key);

function JourneyWorkspace({ journey, setJourney, onInvalidate }) {
  const { patient } = journey;
  const [openVisitList, setOpenVisitList] = useState(false);

  const activeStage = useMemo(() => {
    if (!patient) return 'arrive';
    if (!journey.visit?.opdNumber) return 'register';
    if (!journey.billDone) return 'billing';
    if (journey.stageRanked <= 3) return 'queue';
    if (!journey.isCheckedIn) return 'queue';
    if (journey.isCheckedIn && !journey.vitalsDone) return 'vitals';
    if (journey.isCheckedIn && journey.vitalsDone && !journey.consultDone) return 'consult';
    if (journey.isCheckedIn && journey.vitalsDone && journey.consultDone && !journey.investigateDone) return 'investigate';
    if (journey.isCheckedIn && journey.vitalsDone && journey.consultDone && journey.investigateDone && !journey.rxDone) return 'prescribe';
    return 'complete';
  }, [journey]);

  const stageIndex = STAGE_ORDER.indexOf(activeStage);
  const stageMeta = STAGES[stageIndex];

  const advance = (patch) => setJourney((j) => ({ ...j, ...patch }));

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button className="btn-secondary text-xs" onClick={() => setOpenVisitList((v) => !v)}>
          <ArrowRight className="h-3.5 w-3.5" /> Recent visits
        </button>
        {patient && (
          <button className="btn-secondary text-xs" onClick={() => { setJourney(null); }}>
            <X className="h-3.5 w-3.5" /> End journey
          </button>
        )}
      </div>

      {openVisitList && (
        <div className="my-4">
          <RecentVisits onPick={(v) => { advance({ visit: v, opdNumber: v.opdNumber }); setOpenVisitList(false); }} />
        </div>
      )}

      {/* Journey stepper */}
      <div className="mt-4 flex items-center gap-1 overflow-x-auto pb-1">
        {STAGES.map((s, i) => {
          const Icon = s.icon;
          const done = i < stageIndex;
          const active = i === stageIndex;
          return (
            <div key={s.key} className={cn('flex items-center gap-1', active && 'flex-1')}>
              <div
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold',
                  done && 'bg-emerald-100 text-emerald-400',
                  active && 'bg-brand-700 text-white shadow-md shadow-brand-700/20',
                  !done && !active && 'bg-ink-100 text-ink-500',
                )}
              >
                <Icon className="h-3.5 w-3.5" /> {s.label}
              </div>
              {i < STAGES.length - 1 && <div className={cn('h-px w-3 shrink-0', i < stageIndex ? 'bg-emerald-400' : 'bg-ink-200')} />}
            </div>
          );
        })}
      </div>

      <div className="mt-5">
        {activeStage === 'arrive' && <StepArrival journey={journey} onNext={advance} />}
        {activeStage === 'register' && <StepRegistration journey={journey} onNext={advance} />}
        {activeStage === 'billing' && <StepBilling journey={journey} onNext={advance} />}
        {activeStage === 'queue' && <StepQueue journey={journey} onNext={advance} />}
        {activeStage === 'vitals' && <StepVitals journey={journey} onNext={advance} />}
        {activeStage === 'consult' && <StepConsult journey={journey} onNext={advance} />}
        {activeStage === 'investigate' && <StepInvestigate journey={journey} onNext={advance} />}
        {activeStage === 'prescribe' && <StepPrescribe journey={journey} onNext={advance} />}
        {activeStage === 'complete' && <StepComplete journey={journey} onNext={advance} onEnd={() => setJourney(null)} />}
      </div>

      {stageMeta && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-2.5 text-xs text-brand-400">
          <ClipboardList className="h-4 w-4 shrink-0" />
          Connecting every stage to one patient journey — nothing is a separate screen. Everything written here flows to billing, queue, lab and pharmacy.
        </div>
      )}
    </div>
  );
}

function RecentVisits({ onPick }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['opd-visits-recent'],
    queryFn: async () => (await api.get('/opd/visits', { params: { page: 1, limit: 6 } })).data,
  });
  if (isLoading) return <LoadingState label="Loading visits…" />;
  if (error) return <ErrorState message={apiError(error)} />;
  if (!data?.data?.length) return <EmptyState title="No recent visits" />;
  return (
    <div className="card overflow-hidden">
      <table className="table">
        <thead>
          <tr>
            <th>OPD No</th>
            <th>Patient</th>
            <th>Doctor</th>
            <th>Billing</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data.data.map((v) => (
            <tr key={v._id} className="cursor-pointer" onClick={() => onPick(v)}>
              <td className="font-medium text-brand-700">{v.opdNumber}</td>
              <td>{v.patientId?.firstName} {v.patientId?.lastName || ''}</td>
              <td>{v.doctorId?.name || '—'}</td>
              <td>{billingSummary(v)}</td>
              <td>{badge(v.status)}</td>
              <td className="text-right"><ArrowRight className="h-4 w-4 text-ink-300" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* STAGE 1 — ARRIVAL & SEARCH                                         */
/* ------------------------------------------------------------------ */
function StepArrival({ journey, onNext }) {
  const [q, setQ] = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const qc = useQueryClient();

  const search = useQuery({
    queryKey: ['patients-search', q.trim()],
    queryFn: async ({ queryKey }) => (await api.get('/patients', { params: { search: queryKey[1], limit: 8 } })).data,
    enabled: q.trim().length >= 2,
  });

  const pick = (p) => onNext({ patient: { _id: p._id, uhid: p.uhid, firstName: p.firstName, lastName: p.lastName, gender: p.gender, mobile: p.mobile, age: p.age, bloodGroup: p.bloodGroup } });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="card p-5">
        <div className="flex items-center gap-2 text-base font-bold text-ink-900"><UserSearch className="h-5 w-5 text-brand-600" /> Patient arrival & search</div>
        <p className="mt-1 text-sm text-ink-400">Search by UHID, name, mobile or ID proof. Register a new patient if they are not on file — UHID is generated automatically.</p>
        <div className="mt-4 flex items-center gap-2">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
            <input className="input !pl-9" placeholder="Search UHID / name / mobile…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button className="btn-secondary whitespace-nowrap" onClick={() => setShowRegister(true)}>
            <UserPlus className="h-4 w-4" /> Register new
          </button>
        </div>

        {search.isLoading && <LoadingState label="Searching…" />}
        {!search.isLoading && search.error && <ErrorState message={apiError(search.error)} />}
        {!search.isLoading && q.trim().length >= 2 && !search.data?.data?.length && (
          <EmptyState title="No match" hint="Register the patient as new, or refine the search" />
        )}
        {search.data?.data?.length > 0 && (
          <ul className="mt-4 divide-y divide-ink-100">
            {search.data.data.map((p) => (
              <li key={p._id}>
                <button className="flex w-full items-center gap-3 px-2 py-2.5 text-left hover:bg-ink-50" onClick={() => pick(p)}>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                    {(p.firstName?.[0] || '').toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink-900">{p.firstName} {p.lastName || ''}</span>
                      <span className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[10px] text-ink-400">{p.uhid}</span>
                    </div>
                    <div className="text-xs text-ink-400">{p.gender} · {p.age?.years ?? '—'}y · {p.mobile || '—'}</div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-ink-300" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showRegister && <RegisterPanel onDone={(p) => { toast.success(`Patient registered · UHID ${p.uhid}`); qc.invalidateQueries({ queryKey: ['patients-search'] }); setShowRegister(false); onNext({ patient: { _id: p._id, uhid: p.uhid, firstName: p.firstName, lastName: p.lastName, gender: p.gender, mobile: p.mobile } }); }} />}
    </div>
  );
}

function SearchIcon(props) { return <UserSearch {...props} />; }

/* ------------------------------------------------------------------ */
/* STAGE 1b — REGISTRATION / UHID                                     */
/* ------------------------------------------------------------------ */
function RegisterPanel({ onDone }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', gender: 'MALE', mobile: '', dateOfBirth: '' });
  const { user, hasPermission } = useAuth();
  const canCreate = hasPermission('PATIENT_CREATE') || user?.roleCode === 'SUPER_ADMIN';
  const mutation = useMutation({
    mutationFn: async (p) => (await api.post('/patients', p)).data.data,
    onSuccess: (p) => onDone(p),
    onError: (e) => toast.error(apiError(e)),
  });
  if (!canCreate) return <div className="card p-5 text-sm text-ink-400">You need PATIENT_CREATE permission to register patients.</div>;
  const submit = () => {
    if (!form.firstName.trim()) return toast.error('First name required');
    if (!/^[0-9]{10,15}$/.test(form.mobile)) return toast.error('Valid 10+ digit mobile required');
    mutation.mutate({ firstName: form.firstName, lastName: form.lastName || undefined, gender: form.gender, mobile: form.mobile, dateOfBirth: form.dateOfBirth || undefined });
  };
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 text-base font-bold text-ink-900"><UserPlus className="h-5 w-5 text-brand-600" /> Register new patient</div>
      <p className="mt-1 text-xs text-ink-400">Unique UHID is generated automatically.</p>
      <div className="mt-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">First name *</label><input className="input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
          <div><label className="label">Last name</label><input className="input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="label">Gender *</label>
            <select className="select" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
              {['MALE', 'FEMALE', 'OTHER'].map((g) => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div><label className="label">Mobile *</label><input className="input" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></div>
          <div><label className="label">Date of birth</label><input type="date" className="input" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} /></div>
        </div>
        <div className="flex justify-end">
          <button className="btn-primary" disabled={mutation.isPending} onClick={submit}>
            {mutation.isPending ? <Spinner className="h-4 w-4 text-white" /> : <><UserPlus className="h-4 w-4" /> Register & continue</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* STAGE 2 — OP REGISTRATION (appointment / walk-in → visit)          */
/* ------------------------------------------------------------------ */
function StepRegistration({ journey, onNext }) {
  const { patient } = journey;
  const qc = useQueryClient();
  const [mode, setMode] = useState('BOOKED'); // BOOKED | WALK_IN
  const [doctorId, setDoctorId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [time, setTime] = useState(nowTime());
  const [complaint, setComplaint] = useState('');
  const mutation = useMutation({
    mutationFn: async (payload) => {
      const appt = await api.post('/appointments', payload.appointment);
      const visit = await api.post('/opd/visits', payload.visit);
      let bill = null;
      if (Number(payload.fee) > 0) {
        try {
          const res = await api.post('/billing', {
            patientId: payload.visit.patientId,
            opdVisitId: visit.data.data._id,
            billType: 'OPD',
            status: 'PENDING',
            doctorId: payload.doctorId,
            departmentId: payload.departmentId,
            items: [{ itemType: 'CONSULTATION', code: 'CONSULT', name: 'Consultation fee', quantity: 1, rate: Number(payload.fee), gstPct: 0 }],
          });
          bill = res.data.data;
        } catch (e) {
          console.warn('Auto bill skipped:', e);
        }
      }
      return { appointment: appt.data.data, visit: visit.data.data, bill };
    },
    onSuccess: ({ appointment, visit, bill }) => {
      const gm = tokenFromOpd(visit.opdNumber);
      toast.success(`Registered · ${appointment.tokenNumber ? `Token #${appointment.tokenNumber}` : `GM ${gm}`} · ${visit.opdNumber}${bill ? ` · Bill ${bill.billNumber}` : ''}`);
      qc.invalidateQueries({ queryKey: ['opd-visits'] });
      onNext({
        appointment: { _id: appointment._id, tokenNumber: appointment.tokenNumber, appointmentNumber: appointment.appointmentNumber, doctorId: appointment.doctorId },
        visit: { _id: visit._id, opdNumber: visit.opdNumber, doctorId: visit.doctorId, departmentId: visit.departmentId },
        autoBillId: bill?._id,
        autoBillNumber: bill?.billNumber,
        stageRanked: 1,
      });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const { data: doctors } = useQuery({
    queryKey: ['m-doctors'],
    queryFn: async () => (await api.get('/masters/doctors', { params: { limit: 100 } })).data.data,
  });
  const selectedDoctor = doctors?.find((d) => d._id === doctorId);

  const submit = () => {
    if (!doctorId) return toast.error('Select a doctor');
    const extra = { doctorId, departmentId: departmentId || selectedDoctor?.departmentId || undefined, chiefComplaint: complaint || undefined };
    mutation.mutate({
      appointment: { patientId: patient._id, doctorId, date: todayISO(), time: mode === 'WALK_IN' ? nowTime() : time, type: 'OPD', visitType: mode === 'WALK_IN' ? 'WALK_IN' : undefined },
      visit: { patientId: patient._id, visitType: mode === 'WALK_IN' ? 'WALK_IN' : 'NEW', ...extra },
      fee: selectedDoctor?.consultationFee || 0,
      doctorId,
      departmentId: departmentId || selectedDoctor?.departmentId || undefined,
    });
  };

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-base font-bold text-ink-900">
          <CalendarClock className="h-5 w-5 text-brand-600" /> OP Registration — {patient.firstName} {patient.lastName || ''}
          <span className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[10px] text-ink-400">{patient.uhid}</span>
        </div>
        <div className="flex gap-1 rounded-lg bg-ink-100 p-1">
          {[['BOOKED', 'Appointment'], ['WALK_IN', 'Walk-in']].map(([k, label]) => (
            <button key={k} className={cn('rounded-md px-3 py-1 text-xs font-semibold', mode === k ? 'bg-white text-brand-400 shadow' : 'text-ink-500')} onClick={() => setMode(k)}>{label}</button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="label">Doctor *</label>
          <select className="select" value={doctorId} onChange={(e) => { setDoctorId(e.target.value); const d = doctors?.find((x) => x._id === e.target.value); if (d?.departmentId) setDepartmentId(typeof d.departmentId === 'string' ? d.departmentId : d.departmentId?._id); }}>
            <option value="">Select doctor…</option>
            {doctors?.map((d) => <option key={d._id} value={d._id}>{d.name} — {d.specialization || ''} {d.consultationFee ? `(₹${d.consultationFee})` : ''}</option>)}
          </select>
          {selectedDoctor?.consultationFee > 0 && <p className="mt-1 text-xs text-ink-400">Consultation fee: <b>₹{selectedDoctor.consultationFee}</b></p>}
        </div>
        {mode === 'BOOKED' && (
          <div>
            <label className="label">Time</label>
            <input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        )}
        <div className="sm:col-span-2 lg:col-span-1">
          <label className="label">Chief complaint</label>
          <input className="input" placeholder="e.g. Fever and cough for 3 days" value={complaint} onChange={(e) => setComplaint(e.target.value)} />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <span className="text-xs text-ink-400">Token is issued automatically on the queue board.</span>
        <button className="btn-primary" disabled={mutation.isPending} onClick={submit}>
          {mutation.isPending ? <Spinner className="h-4 w-4 text-white" /> : <><ArrowRight className="h-4 w-4" /> Register {mode === 'WALK_IN' ? 'walk-in' : 'appointment'}</>}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* STAGE 3 — OP BILLING + PAYMENT                                     */
/* ------------------------------------------------------------------ */
function StepBilling({ journey, onNext }) {
  const { patient, appointment, visit } = journey;
  const qc = useQueryClient();
  const [payFor, setPayFor] = useState(null);
  const [payMode, setPayMode] = useState('CASH');
  const [payAmount, setPayAmount] = useState('');
  const [payRef, setPayRef] = useState('');
  const [receiptFor, setReceiptFor] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newItems, setNewItems] = useState([]);
  const [newType, setNewType] = useState('SERVICE');
  const [newName, setNewName] = useState('');
  const [newQty, setNewQty] = useState(1);
  const [newRate, setNewRate] = useState('');
  const [newDisc, setNewDisc] = useState(0);
  const [newGst, setNewGst] = useState(0);

  const billing = useQuery({
    queryKey: ['opd-visit-billing', visit._id],
    queryFn: async () => (await api.get(`/opd/visits/${visit._id}/billing`)).data.data,
    refetchInterval: 15000,
    refetchIntervalInBackground: true,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['opd-visit-billing', visit._id] });
    qc.invalidateQueries({ queryKey: ['opd-visits'] });
  };

  const { data: doctors } = useQuery({
    queryKey: ['m-doctors'],
    queryFn: async () => (await api.get('/masters/doctors', { params: { limit: 100 } })).data.data,
  });

  const fee = (doctors?.find((d) => d._id === (appointment?.doctorId || visit?.doctorId)))?.consultationFee || 0;
  const doctorId = appointment?.doctorId || visit?.doctorId || undefined;
  const departmentId = visit?.departmentId || undefined;

  const bills = billing.data?.bills || [];
  const summary = billing.data?.summary || { billCount: 0, totalGross: 0, totalPaid: 0, totalDue: 0, outstandingCount: 0 };
  const settled = bills.length > 0 && summary.outstandingCount === 0;
  const lastPaidBill = bills.filter((b) => (b.paidAmount || 0) > 0).sort((a, b) => new Date(b.billDate) - new Date(a.billDate))[0];

  useEffect(() => {
    if (!receiptFor || !billing.data) return;
    const p = (billing.data.payments || [])
      .filter((x) => String(x.billId?._id || x.billId) === String(receiptFor))
      .sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt))[0];
    const rb = (billing.data.bills || []).find((b) => b._id === receiptFor);
    if (p && rb) setReceipt({ payment: p, bill: rb });
  }, [receiptFor, billing.data]);

  const pay = useMutation({
    mutationFn: async ({ billId, amount, mode, referenceNumber }) => (await api.post('/billing/payments', { billId, amount, mode, referenceNumber })).data.data,
    onSuccess: (bill) => {
      toast.success(`Payment collected · ₹${Number(payAmount || bill.dueAmount).toFixed(2)}`);
      setReceiptFor(payFor);
      setPayFor(null);
      setPayAmount('');
      setPayRef('');
      refresh();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const createBill = useMutation({
    mutationFn: async (items) => (await api.post('/billing', {
      patientId: patient._id,
      opdVisitId: visit._id,
      billType: 'OPD',
      status: 'PENDING',
      doctorId,
      departmentId,
      items,
    })).data.data,
    onSuccess: (b) => {
      toast.success(`Bill ${b.billNumber} added · awaiting collection`);
      setShowAdd(false);
      setNewItems([]);
      refresh();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const addItemRow = () => {
    if (!newName.trim()) return toast.error('Enter item name');
    setNewItems([...newItems, { itemType: newType, name: newName.trim(), quantity: Number(newQty) || 1, rate: Number(newRate) || 0, discountPct: Number(newDisc) || 0, gstPct: Number(newGst) || 0 }]);
    setNewName('');
    setNewQty(1);
    setNewRate('');
    setNewDisc(0);
    setNewGst(0);
  };

  const continueNext = () => {
    const target = lastPaidBill || bills[bills.length - 1];
    onNext({ billDone: true, billNumber: target?.billNumber, billId: target?._id, stageRanked: 3 });
  };

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-base font-bold text-ink-900"><Receipt className="h-5 w-5 text-brand-600" /> OP Billing & Payment</div>
        <div className="text-right">
          <div className="font-mono text-sm font-semibold text-brand-700">{visit.opdNumber}</div>
          <div className="text-xs text-ink-400">{patient.firstName} {patient.lastName || ''}</div>
        </div>
      </div>
      {journey.autoBillNumber && !settled && (
        <p className="mt-1 text-xs text-amber-600">Registration bill {journey.autoBillNumber} was auto-raised — collect the due amount to issue the token.</p>
      )}
      {!bills.length && fee > 0 && (
        <p className="mt-1 text-xs text-ink-400">Doctor consultation fee is <b>₹{fee}</b>. No bill exists yet — raise one below or continue without billing.</p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Summary stat="Bills" value={summary.billCount} />
        <Summary stat="Gross" value={formatCurrency(summary.totalGross)} />
        <Summary stat="Paid" value={formatCurrency(summary.totalPaid)} tone="mint" />
        <Summary stat="Due" value={formatCurrency(summary.totalDue)} tone="amber" />
      </div>

      <div className="mt-4 space-y-3">
        {bills.map((b) => {
          const due = b.dueAmount;
          const collecting = payFor === b._id;
          return (
            <div key={b._id} className="rounded-xl border border-ink-100 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-brand-700">{b.billNumber}</span>
                  {journey.autoBillId === b._id && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">registration</span>}
                  <Badge label={b.status} status={b.status} />
                </div>
                <span className="text-xs text-ink-400">{formatDateTime(b.billDate)}</span>
              </div>
              <div className="mt-2 divide-y divide-ink-100">
                {b.items.map((it, i) => (
                  <div key={i} className="flex items-center justify-between py-1 text-xs">
                    <span className="text-ink-700">{it.name} <span className="text-ink-400">× {it.quantity} @ {formatCurrency(it.rate)}{it.discountPct > 0 ? ` (−${it.discountPct}%)` : ''}{it.gstPct > 0 ? ` (+${it.gstPct}% GST)` : ''}</span></span>
                    <span className="tabular-nums font-medium text-ink-800">{formatCurrency(it.total)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-ink-200 pt-2">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
                  <span>Gross {formatCurrency(b.grossTotal)}</span>
                  <span>Disc {formatCurrency(b.discount)}</span>
                  <span>Tax {formatCurrency(b.tax)}</span>
                  <span>Paid {formatCurrency(b.paidAmount)}</span>
                  <span className={due > 0.01 ? 'font-semibold text-amber-600' : 'font-semibold text-emerald-600'}>Due {formatCurrency(due)}</span>
                </div>
                {due > 0.01 && b.status !== 'CANCELLED' ? (
                  collecting ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <select className="select w-28 !py-1 text-xs" value={payMode} onChange={(e) => setPayMode(e.target.value)}>
                        {PAY_MODES.map((m) => <option key={m}>{m}</option>)}
                      </select>
                      <input type="number" className="input w-24 !py-1 text-right" min="0" max={due} value={payAmount} placeholder={String(due)} onChange={(e) => setPayAmount(e.target.value)} />
                      <input className="input w-28 !py-1 text-xs" placeholder="Ref no (opt)" value={payRef} onChange={(e) => setPayRef(e.target.value)} />
                      <button className="btn-primary !px-3 !py-1 text-xs" disabled={pay.isPending} onClick={() => pay.mutate({ billId: b._id, amount: Math.min(Number(payAmount) || due, due), mode: payMode, referenceNumber: payRef || undefined })}>
                        {pay.isPending ? <Spinner className="h-3.5 w-3.5" /> : <><CheckCircle2 className="h-3.5 w-3.5" /> Collect</>}
                      </button>
                      <button className="btn-secondary !px-2 !py-1 text-xs" onClick={() => { setPayFor(null); setPayAmount(''); setPayRef(''); }}><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ) : (
                    <button className="btn-primary !px-3 !py-1 text-xs" onClick={() => { setPayFor(b._id); setPayAmount(String(due)); setReceipt(null); setPayMode('CASH'); setPayRef(''); }}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Collect ₹{due}
                    </button>
                  )
                ) : (
                  <span className="text-xs font-semibold text-emerald-600">{b.status === 'CANCELLED' ? 'Cancelled' : b.status === 'REFUNDED' ? 'Refunded' : 'Settled'}</span>
                )}
              </div>
              {collecting && <p className="mt-1 text-[11px] text-ink-400">Amount cannot exceed due ₹{due}. Paying via {MODE_LABEL[payMode] || payMode}.</p>}
            </div>
          );
        })}
        {!bills.length && (
          <div className="rounded-xl border border-dashed border-ink-200 p-5 text-center">
            <p className="text-sm text-ink-500">No bill raised for this visit yet.</p>
            <p className="mt-1 text-xs text-ink-400">{fee > 0 ? 'Registration auto-raises a consultation bill when a doctor is selected on the previous step.' : 'This doctor has no consultation fee configured — add a charge below or continue without a bill.'}</p>
          </div>
        )}
      </div>

      {showAdd && (
        <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50/40 p-3">
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-brand-600">Add services / charges</div>
          <div className="flex flex-wrap items-center gap-2">
            <select className="select w-32 !py-1.5 text-xs" value={newType} onChange={(e) => setNewType(e.target.value)}>
              {ITEM_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
            <input className="input min-w-[140px] flex-1 text-xs" placeholder="Item name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <input type="number" className="input w-12 text-xs" min="1" value={newQty} onChange={(e) => setNewQty(e.target.value)} />
            <input type="number" className="input w-20 text-xs" min="0" placeholder="₹ rate" value={newRate} onChange={(e) => setNewRate(e.target.value)} />
            <input type="number" className="input w-14 text-xs" min="0" max="100" placeholder="Disc%" value={newDisc} onChange={(e) => setNewDisc(e.target.value)} />
            <input type="number" className="input w-14 text-xs" min="0" max="28" placeholder="GST%" value={newGst} onChange={(e) => setNewGst(e.target.value)} />
            <button className="btn-secondary text-xs" onClick={addItemRow}><Plus className="h-3.5 w-3.5" /> Add item</button>
          </div>
          {newItems.length > 0 && (
            <div className="mt-2 divide-y divide-ink-100 rounded-lg bg-white p-2">
              {newItems.map((it, i) => (
                <div key={i} className="flex items-center justify-between py-1 text-xs">
                  <span className="text-ink-700">{it.name} <span className="text-ink-400">({it.itemType} × {it.quantity}{it.discountPct > 0 ? `, −${it.discountPct}%` : ''}{it.gstPct > 0 ? `, +${it.gstPct}% GST` : ''})</span></span>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums text-ink-800">{formatCurrency((it.rate * (100 - it.discountPct) / 100) * (1 + it.gstPct / 100) * it.quantity)}</span>
                    <button className="btn-icon" onClick={() => setNewItems(newItems.filter((_, x) => x !== i))}><X className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-2 flex justify-end gap-2">
            <button className="btn-secondary text-xs" onClick={() => { setShowAdd(false); setNewItems([]); }}>Cancel</button>
            <button className="btn-primary text-xs" disabled={!newItems.length || createBill.isPending} onClick={() => createBill.mutate(newItems)}>
              {createBill.isPending ? <Spinner className="h-3.5 w-3.5" /> : <><Receipt className="h-3.5 w-3.5" /> Save bill (pay later)</>}
            </button>
          </div>
        </div>
      )}

      {receipt && (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Payment collected — receipt</div>
            <button className="btn-icon" onClick={() => setReceipt(null)}><X className="h-4 w-4" /></button>
          </div>
          <PaymentReceipt payment={receipt.payment} bill={receipt.bill} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-ink-200 pt-3">
        <button className="btn-secondary text-xs" onClick={() => setShowAdd((s) => !s)}>
          <Plus className="h-3.5 w-3.5" /> {showAdd ? 'Close charges form' : 'Add services / new bill'}
        </button>
        {bills.length === 0 ? (
          <button className="btn-ghost text-xs" onClick={continueNext}>
            Continue without bill <ArrowRight className="h-3.5 w-3.5" />
          </button>
        ) : settled ? (
          <button className="btn-primary text-xs" onClick={continueNext}>
            <ArrowRight className="h-3.5 w-3.5" /> Continue to queue
          </button>
        ) : (
          <button className="btn-secondary text-xs" disabled>
            Collect remaining dues to continue
          </button>
        )}
      </div>
    </div>
  );
}

function Summary({ stat, value, tone }) {
  return (
    <div className={cn('rounded-lg px-3 py-2', tone === 'amber' ? 'bg-amber-50' : tone === 'mint' ? 'bg-emerald-50' : 'bg-ink-50')}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">{stat}</div>
      <div className={cn('text-base font-bold tabular-nums', tone === 'amber' ? 'text-amber-600' : tone === 'mint' ? 'text-emerald-600' : 'text-ink-900')}>{value}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* STAGE 4 — TOKEN & QUEUE                                            */
/* ------------------------------------------------------------------ */
function StepQueue({ journey, onNext }) {
  const { appointment, visit } = journey;
  const qc = useQueryClient();
  const board = useQuery({
    queryKey: ['queue-board'],
    queryFn: async () => (await api.get('/queue/board')).data,
    refetchInterval: 10000,
    refetchIntervalInBackground: true,
  });
  const checkin = useMutation({
    mutationFn: async () => (await api.patch(`/appointments/${appointment._id}/status`, { status: 'CHECKED_IN' })).data.data,
    onSuccess: () => { toast.success('Checked in — now in the doctor queue'); qc.invalidateQueries({ queryKey: ['queue-board'] }); onNext({ isCheckedIn: true, stageRanked: 4 }); },
    onError: () => { /* walk-ins without appointment can skip */ onNext({ isCheckedIn: true, stageRanked: 4 }); },
  });

  const myPosition = useMemo(() => {
    const items = board.data?.data?.doctors?.flatMap((d) => d.items) || [];
    if (appointment?._id) {
      const mine = items.find((i) => i._id === appointment._id);
      if (mine) return { position: items.filter((i) => i.status !== 'COMPLETED' && i.tokenNumber <= mine.tokenNumber).length, token: mine.tokenNumber };
    }
    return null;
  }, [board.data, appointment]);

  const token = appointment?.tokenNumber || myPosition?.token;
  const gmToken = tokenFromOpd(visit.opdNumber);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card p-5">
        <div className="flex items-center gap-2 text-base font-bold text-ink-900"><Ticket className="h-5 w-5 text-brand-600" /> Your token</div>
        <div className="mt-4 flex items-center justify-center">
          <div className="rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50/50 px-10 py-6 text-center">
            <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-brand-500">
              {appointment?.tokenNumber ? 'Queue token' : 'Walk-in token · General Medicine'}
            </div>
            <div className="mt-1 text-5xl font-black tabular-nums text-brand-700">
              {appointment?.tokenNumber ? `#${token ?? '—'}` : (gmToken || '—')}
            </div>
            <div className="mt-1 font-mono text-xs text-ink-400">
              {gmToken ? (appointment?.tokenNumber ? `GM ${gmToken} · ${visit.opdNumber}` : `${gmToken} · ${visit.opdNumber}`) : visit.opdNumber}
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-center">
          {journey.isCheckedIn ? (
            <button className="btn-secondary text-xs">Checked in — {myPosition?.position ? `position ${myPosition.position} in queue` : 'in live queue'}</button>
          ) : (
            <button className="btn-primary" disabled={checkin.isPending} onClick={() => checkin.mutate()}>
              {checkin.isPending ? <Spinner className="h-4 w-4 text-white" /> : <><CheckCircle2 className="h-4 w-4" /> Check in to waiting queue</>}
            </button>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-ink-100 bg-ink-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-ink-400">Live queue board</div>
        {board.isLoading ? <LoadingState /> : board.error ? <ErrorState message={apiError(board.error)} /> : (
          <ul className="max-h-[340px] divide-y divide-ink-100 overflow-y-auto">
            {board.data?.data?.doctors?.map((doc) => (
              <li key={doc.doctorId} className="p-3">
                <div className="mb-2 text-xs font-bold text-ink-700">{doc.name} <span className="font-normal text-ink-400">· {doc.specialization}</span></div>
                <div className="flex flex-wrap gap-1.5 text-ink-700">
                  {doc.items.map((item) => {
                    const isMine = item._id === appointment?._id;
                    return (
                      <span key={item._id} className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]', isMine ? 'border-brand-400 bg-brand-600 font-bold text-white' : 'border-ink-200 bg-ink-100')}>
                        #{item.tokenNumber} {item.patient?.firstName} {item.patient?.lastName || ''} {isMine && '●'}
                      </span>
                    );
                  })}
                </div>
              </li>
            ))}
            {!board.data?.data?.doctors?.length && <li className="p-6 text-center text-sm text-ink-400">Empty queue for today.</li>}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* STAGE 5 — NURSE / VITALS                                           */
/* ------------------------------------------------------------------ */
const VITAL_FIELDS = [
  ['temperature', 'Temp (°F)'], ['pulse', 'Pulse (bpm)'], ['bpSystolic', 'BP systolic'], ['bpDiastolic', 'BP diastolic'], ['respiratoryRate', 'Resp. rate (/min)'],
  ['spo2', 'SpO₂ (%)'], ['heightCm', 'Height (cm)'], ['weightKg', 'Weight (kg)'], ['bloodSugar', 'Blood sugar (mg/dL)'], ['painScore', 'Pain score (0–10)'],
];
const FALL_RISKS = ['LOW', 'MODERATE', 'HIGH'];
const TRIAGE_PRIORITIES = ['ROUTINE', 'URGENT', 'STAT'];
const normList = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  return String(value).split(',').map((s) => s.trim()).filter(Boolean);
};
export function StepVitals({ journey, onNext }) {
  const { visit } = journey;
  const { user } = useAuth();
  const qc = useQueryClient();
  const [vitals, setVitals] = useState({ source: 'NURSE' });
  const [assess, setAssess] = useState({ allergiesConfirmed: false, fallRisk: '', priority: '' });
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState(null);

  const visitInfo = useQuery({
    queryKey: ['opd-visit', visit._id],
    queryFn: async () => (await api.get(`/opd/visits/${visit._id}`)).data.data,
  });
  const patientAllergies = normList(visitInfo.data?.patientId?.allergies);

  const mutation = useMutation({
    mutationFn: async (p) => (await api.post(`/opd/visits/${visit._id}/vitals`, p)).data,
    onSuccess: () => {
      const who = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : 'Nurse';
      setSaved({ by: who, at: new Date(), patient: visitInfo.data?.patientId?.firstName || '' });
      qc.invalidateQueries({ queryKey: ['opd-workspace', visit._id] });
      qc.invalidateQueries({ queryKey: ['opd-visit', visit._id] });
      qc.invalidateQueries({ queryKey: ['opd-visits'] });
      toast.success('Vitals completed — patient is READY FOR DOCTOR');
      onNext({ vitalsDone: true, stageRanked: 4 });
    },
    onError: (e) => toast.error(apiError(e)),
  });
  const set = (k, v) => setVitals((s) => ({ ...s, [k]: v === '' ? undefined : Number(v) }));
  const filled = VITAL_FIELDS.filter(([k]) => vitals[k] !== undefined).length;
  const bmi = vitals.heightCm && vitals.weightKg ? Math.round((Number(vitals.weightKg) / Math.pow(Number(vitals.heightCm) / 100, 2)) * 100) / 100 : null;

  const save = () => {
    if (!filled) return toast.error('Record at least one vital sign');
    mutation.mutate({
      ...Object.fromEntries(Object.entries(vitals).filter(([, v]) => v !== undefined)),
      allergiesConfirmed: assess.allergiesConfirmed || undefined,
      fallRisk: assess.fallRisk || undefined,
      priority: assess.priority || undefined,
      notes: notes.trim() || undefined,
      source: 'NURSE',
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-base font-bold text-ink-900"><Activity className="h-5 w-5 text-brand-600" /> Nurse vitals — {visit.opdNumber}</div>
            <Badge label={`${filled}/${VITAL_FIELDS.length} recorded`} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {VITAL_FIELDS.map(([k, label]) => (
              <div key={k}>
                <label className="label">{label}</label>
                <input type="number" className="input" min={k === 'painScore' ? 0 : undefined} max={k === 'painScore' ? 10 : undefined} value={(vitals[k] ?? '')} onChange={(e) => set(k, e.target.value)} />
              </div>
            ))}
            <div>
              <label className="label">BMI (auto)</label>
              <div className="flex h-9 items-center rounded-lg border border-dashed border-ink-200 px-2 text-sm font-semibold tabular-nums text-ink-700">{bmi ? bmi.toFixed(2) : '—'}</div>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-ink-400">
            Nurse identity ({user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : '—'}) and a time-stamp are recorded automatically; BMI is computed from height & weight on save.
          </p>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 text-sm font-bold text-ink-900"><AlertTriangle className="h-4 w-4 text-brand-600" /> Assessments & triage</div>
          <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-ink-100 px-3 py-2.5">
            <input type="checkbox" className="mt-0.5 accent-brand-600" checked={assess.allergiesConfirmed} onChange={(e) => setAssess({ ...assess, allergiesConfirmed: e.target.checked })} />
            <span className="text-sm text-ink-800">Allergy confirmation — patient asked, no reaction noted</span>
          </label>
          {patientAllergies.length > 0 && (
            <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Known allergies on file</div>
              <div className="mt-1 flex flex-wrap gap-1">{patientAllergies.map((a) => <span key={a} className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">{a}</span>)}</div>
            </div>
          )}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="label">Fall risk</label>
              <select className="select" value={assess.fallRisk} onChange={(e) => setAssess({ ...assess, fallRisk: e.target.value })}>
                <option value="">—</option>
                {FALL_RISKS.map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Triage priority</label>
              <select className="select" value={assess.priority} onChange={(e) => setAssess({ ...assess, priority: e.target.value })}>
                <option value="">—</option>
                {TRIAGE_PRIORITIES.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-3">
            <label className="label">Nurse notes</label>
            <textarea className="input" rows={2} placeholder="e.g. patient anxious, needs assistance to walk…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
      </div>

      {saved && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-5 w-5" />
          <div>
            <div className="font-bold">VITALS COMPLETED — READY FOR DOCTOR</div>
            <div className="text-xs text-emerald-600">Recorded by {saved.by} · {saved.at.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} · {saved.patient || 'patient'} can now be called into the consultation room.</div>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button className="btn-primary" disabled={mutation.isPending} onClick={save}>
          {mutation.isPending ? <Spinner className="h-4 w-4 text-white" /> : <><CheckCircle2 className="h-4 w-4" /> Record vitals & mark ready for doctor</>}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* STAGE 6 — DOCTOR CONSULTATION WORKSTATION                          */
/* ------------------------------------------------------------------ */
const DIAGNOSIS_TYPES = ['PROVISIONAL', 'PRIMARY', 'SECONDARY', 'FINAL'];
const DIAG_TYPE_STYLES = {
  PROVISIONAL: 'bg-amber-100 text-amber-700',
  PRIMARY: 'bg-indigo-100 text-indigo-700',
  SECONDARY: 'bg-sky-100 text-sky-700',
  FINAL: 'bg-emerald-100 text-emerald-700',
};
function VitalsStrip({ vitals }) {
  if (!vitals) return <p className="text-xs text-ink-400">No vitals recorded for this visit.</p>;
  const chips = [
    ['Temp', vitals.temperature ? `${vitals.temperature} °F` : '—'],
    ['Pulse', vitals.pulse ?? '—'],
    ['BP', vitals.bpSystolic ? `${vitals.bpSystolic}/${vitals.bpDiastolic}` : '—'],
    ['RR', vitals.respiratoryRate ?? '—'],
    ['SpO₂', vitals.spo2 ? `${vitals.spo2}%` : '—'],
    ['BMI', vitals.bmi ?? '—'],
    ['Pain', vitals.painScore ?? '—'],
    ['Blood sugar', vitals.bloodSugar ?? '—'],
  ];
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg border border-dashed border-ink-200 bg-ink-50/60 px-3 py-2 sm:grid-cols-4">
      {chips.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between text-xs">
          <span className="text-ink-400">{k}</span>
          <span className="font-semibold tabular-nums text-ink-800">{v}</span>
        </div>
      ))}
    </div>
  );
}
export function StepConsult({ journey, onNext }) {
  const { visit, appointment, patient } = journey;
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const patientId = patient?._id || visit.patientId?._id || visit.patientId;
  const [form, setForm] = useState({ chiefComplaint: '', historyOfPresentingIllness: '', pastMedicalHistory: '', pastSurgicalHistory: '', familyHistory: '', personalHistory: '', medicationHistory: '', allergies: '', treatmentPlan: '', advice: '' });
  const [examState, setExamState] = useState({});
  const [templateId, setTemplateId] = useState('');
  const [diagType, setDiagType] = useState('PRIMARY');
  const [diagQuery, setDiagQuery] = useState('');
  const [diagPending, setDiagPending] = useState(null);
  const [diagOpen, setDiagOpen] = useState(false);
  const [selectedVisitId, setSelectedVisitId] = useState(null);

  const workspace = useQuery({
    queryKey: ['opd-workspace', visit._id],
    queryFn: async () => (await api.get(`/opd/visits/${visit._id}/workspace`)).data.data,
  });
  const history = useQuery({
    queryKey: ['opd-patient-history', patientId],
    enabled: !!patientId,
    queryFn: async () => (await api.get(`/opd/patients/${patientId}/history`)).data.data,
  });

  const ws = workspace.data;
  const p = ws?.visit?.patientId || patient || {};

  useEffect(() => {
    if (!ws?.visit) return;
    const v = ws.visit;
    const templates = ws.examinationTemplates || [];
    const prevExam = v.examination || {};
    setForm((f) => ({
      ...f,
      chiefComplaint: v.chiefComplaint || '',
      historyOfPresentingIllness: v.historyOfPresentingIllness || '',
      pastMedicalHistory: v.pastMedicalHistory || v.pastHistory || '',
      pastSurgicalHistory: v.pastSurgicalHistory || '',
      familyHistory: v.familyHistory || '',
      personalHistory: v.personalHistory || '',
      medicationHistory: v.medicationHistory || '',
      allergies: normList(v.allergies).join(', '),
      treatmentPlan: v.treatmentPlan || '',
      advice: v.advice || '',
    }));
    const priorSections = { ...(prevExam.sections || {}) };
    if (prevExam.general && !priorSections['general.notes']) priorSections['general.notes'] = prevExam.general;
    if (prevExam.systemic && !priorSections['system.notes']) priorSections['system.notes'] = prevExam.systemic;
    setExamState(priorSections);
    setTemplateId((cur) => {
      if (cur && templates.some((t) => t._id === cur)) return cur;
      if (prevExam.templateId && templates.some((t) => t._id === String(prevExam.templateId))) return String(prevExam.templateId);
      const bySpecialty = templates.find((t) => t.specialty === prevExam.specialty);
      if (bySpecialty) return bySpecialty._id;
      return templates[0]?._id || '';
    });
    setDiagPending(null);
  }, [ws]);

  const save = useMutation({
    mutationFn: async (payload) => (await api.put(`/opd/visits/${visit._id}`, payload)).data.data,
    onSuccess: () => {
      toast.success('Consultation saved');
      qc.invalidateQueries({ queryKey: ['opd-workspace', visit._id] });
      qc.invalidateQueries({ queryKey: ['opd-patient-history', patientId] });
      qc.invalidateQueries({ queryKey: ['opd-visits'] });
      onNext({ consultDone: true, stageRanked: 5 });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const addDiag = useMutation({
    mutationFn: async ({ name, icd10Code, type }) => (await api.post(`/opd/visits/${visit._id}/diagnoses`, { name, icd10Code, type })).data.data,
    onSuccess: () => {
      toast.success('Diagnosis added');
      setDiagQuery(''); setDiagPending(null); setDiagOpen(false);
      qc.invalidateQueries({ queryKey: ['opd-workspace', visit._id] });
      qc.invalidateQueries({ queryKey: ['opd-patient-history', patientId] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const removeDiag = useMutation({
    mutationFn: async (id) => (await api.delete(`/opd/diagnoses/${id}`)).data,
    onSuccess: () => { toast.success('Diagnosis removed'); qc.invalidateQueries({ queryKey: ['opd-workspace', visit._id] }); qc.invalidateQueries({ queryKey: ['opd-patient-history', patientId] }); },
    onError: (e) => toast.error(apiError(e)),
  });

  const changeDiagType = useMutation({
    mutationFn: async ({ id, type }) => (await api.put(`/opd/diagnoses/${id}`, { type, status: type === 'PROVISIONAL' ? 'PROVISIONAL' : 'CONFIRMED' })).data.data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['opd-workspace', visit._id] }); qc.invalidateQueries({ queryKey: ['opd-patient-history', patientId] }); },
    onError: (e) => toast.error(apiError(e)),
  });

  const diagSearch = useQuery({
    queryKey: ['opd-diagnosis-search', diagQuery.trim(), patientId],
    enabled: diagQuery.trim().length >= 2,
    queryFn: async () => (await api.get('/opd/diagnoses/search', { params: { q: diagQuery.trim(), patientId } })).data.data,
  });

  const submit = () => {
    const prevExam = ws?.visit?.examination || {};
    save.mutate({
      status: 'IN_PROGRESS',
      consultedBy: user?.id,
      chiefComplaint: form.chiefComplaint || undefined,
      historyOfPresentingIllness: form.historyOfPresentingIllness || undefined,
      pastMedicalHistory: form.pastMedicalHistory || undefined,
      pastSurgicalHistory: form.pastSurgicalHistory || undefined,
      familyHistory: form.familyHistory || undefined,
      personalHistory: form.personalHistory || undefined,
      medicationHistory: form.medicationHistory || undefined,
      allergies: form.allergies ? form.allergies.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      examination: {
        general: prevExam.general || undefined,
        systemic: prevExam.systemic || undefined,
        ...(activeTemplate ? { templateId: activeTemplate._id, specialty: activeTemplate.specialty, templateName: activeTemplate.name } : {}),
        sections: Object.fromEntries(Object.entries(examState).filter(([, val]) => val !== undefined && String(val).trim() !== '')),
      },
      treatmentPlan: form.treatmentPlan || undefined,
      advice: form.advice || undefined,
    });
  };

  const vitals = ws?.vitals?.[0];
  const templates = ws?.examinationTemplates || [];
  const activeTemplate = templates.find((t) => t._id === String(templateId)) || templates[0];
  const setExamVal = (key, value) => setExamState((s) => ({ ...s, [key]: value }));

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.35fr_1fr]">
      {/* LEFT — patient summary + quick actions + latest vitals */}
      <div className="space-y-4">
        <div className="card p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-700 text-base font-black text-white">{initials(`${p.firstName || ''} ${p.lastName || ''}`)}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-bold text-ink-900">{p.firstName} {p.lastName || ''}</div>
              <div className="font-mono text-xs text-ink-400">{p.uhid || '—'}</div>
            </div>
            <Badge label={ws?.visit?.vitalsStatus === 'COMPLETED' ? 'VITALS ✔' : 'VITALS PENDING'} status={ws?.visit?.vitalsStatus === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS'} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div><div className="text-[10px] uppercase tracking-wider text-ink-400">OP number</div><div className="font-semibold text-ink-800">{visit.opdNumber}</div></div>
            <div><div className="text-[10px] uppercase tracking-wider text-ink-400">Age / Gender</div><div className="font-semibold text-ink-800">{p.age?.years ?? '—'}y · {p.gender || '—'}</div></div>
            <div><div className="text-[10px] uppercase tracking-wider text-ink-400">Blood group</div><div className="font-semibold text-ink-800">{p.bloodGroup || '—'}</div></div>
            <div><div className="text-[10px] uppercase tracking-wider text-ink-400">Visit</div><div className="font-semibold text-ink-800">{VISIT_TYPES[ws?.visit?.visitType] || ws?.visit?.visitType || '—'}</div></div>
          </div>
          {(normList(p.allergies).length > 0) && (
            <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Allergies</div>
              <div className="mt-1 flex flex-wrap gap-1">{normList(p.allergies).map((a) => <span key={a} className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">{a}</span>)}</div>
            </div>
          )}
          <div className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-600">
            <div className="font-semibold text-ink-700">Current visit — {visit.opdNumber}</div>
            <div className="mt-1">{ws?.visit?.chiefComplaint ? `“${ws?.visit?.chiefComplaint}”` : 'No chief complaint recorded'}</div>
            <div className="mt-1 text-ink-400">Dr. {ws?.visit?.doctorId?.name || 'TBD'}{ws?.visit?.doctorId?.specialization ? ` · ${ws.visit.doctorId.specialization}` : ''}{appointment?.tokenNumber ? ` · Token #${appointment.tokenNumber}` : ''}</div>
            <div className="text-ink-400">{ws?.visit?.visitDate ? formatDateTime(ws.visit.visitDate) : ''}</div>
          </div>
        </div>

        <div className="card p-5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Quick actions</div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button className="btn-secondary !justify-start !px-2.5 !py-2 text-xs" onClick={() => navigate(`/patients/${patientId}?tab=opVisits`)}><History className="h-3.5 w-3.5" /> Previous visits</button>
            <button className="btn-secondary !justify-start !px-2.5 !py-2 text-xs" onClick={() => navigate(`/patients/${patientId}?tab=lab`)}><FlaskConical className="h-3.5 w-3.5" /> Lab</button>
            <button className="btn-secondary !justify-start !px-2.5 !py-2 text-xs" onClick={() => navigate(`/patients/${patientId}?tab=radiology`)}><Layers className="h-3.5 w-3.5" /> Radiology</button>
            <button className="btn-secondary !justify-start !px-2.5 !py-2 text-xs" onClick={() => navigate(`/patients/${patientId}?tab=prescriptions`)}><Pill className="h-3.5 w-3.5" /> Prescription</button>
            <button className="btn-secondary !justify-start !px-2.5 !py-2 text-xs" onClick={() => navigate(`/patients/${patientId}?tab=bills`)}><Receipt className="h-3.5 w-3.5" /> Bills</button>
            <button className="btn-secondary !justify-start !px-2.5 !py-2 text-xs" onClick={() => navigate(`/patients/${patientId}?tab=documents`)}><FileText className="h-3.5 w-3.5" /> Documents</button>
          </div>
        </div>

        <div className="card p-5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Latest vitals</div>
          {vitals ? (
            <>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                <div className="flex items-center justify-between"><span className="text-ink-400">Temp</span><span className="font-semibold tabular-nums text-ink-800">{vitals.temperature ?? '—'} °F</span></div>
                <div className="flex items-center justify-between"><span className="text-ink-400">Pulse</span><span className="font-semibold tabular-nums text-ink-800">{vitals.pulse ?? '—'}</span></div>
                <div className="flex items-center justify-between"><span className="text-ink-400">BP</span><span className="font-semibold tabular-nums text-ink-800">{vitals.bpSystolic ? `${vitals.bpSystolic}/${vitals.bpDiastolic}` : '—'}</span></div>
                <div className="flex items-center justify-between"><span className="text-ink-400">SpO₂</span><span className="font-semibold tabular-nums text-ink-800">{vitals.spo2 ? `${vitals.spo2}%` : '—'}</span></div>
                <div className="flex items-center justify-between"><span className="text-ink-400">BMI</span><span className="font-semibold tabular-nums text-ink-800">{vitals.bmi ?? '—'}</span></div>
                <div className="flex items-center justify-between"><span className="text-ink-400">Pain</span><span className="font-semibold tabular-nums text-ink-800">{vitals.painScore ?? '—'}</span></div>
              </div>
              <div className="mt-2 text-[11px] text-ink-400">
                {vitals.recordedAt ? formatDateTime(vitals.recordedAt) : ''}{vitals.recordedBy?.firstName ? ` · ${vitals.recordedBy.firstName} ${vitals.recordedBy.lastName || ''}` : ''}
                {vitals.fallRisk ? ` · fall risk ${vitals.fallRisk}` : ''}{vitals.priority ? ` · ${vitals.priority}` : ''}{vitals.allergiesConfirmed ? ' · allergies confirmed' : ''}
              </div>
              {vitals.notes && <div className="mt-1 rounded bg-ink-50 px-2 py-1 text-xs text-ink-500">{vitals.notes}</div>}
            </>
          ) : (
            <p className="mt-2 text-xs text-ink-400">No vitals recorded for this visit.</p>
          )}
        </div>
      </div>

      {/* CENTER — structured clinical documentation */}
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-base font-bold text-ink-900"><Stethoscope className="h-5 w-5 text-brand-600" /> Clinical documentation — {visit.opdNumber}</div>
          <Badge label={appointment ? `Token #${appointment.tokenNumber}` : 'Walk-in'} status={appointment ? 'CONFIRMED' : undefined} />
        </div>

        <div className="mt-4 space-y-4">
          <ClinicalSection title="Chief complaint">
            <textarea className="input" rows={2} value={form.chiefComplaint} onChange={(e) => setForm({ ...form, chiefComplaint: e.target.value })} />
          </ClinicalSection>
          <ClinicalSection title="History of presenting illness">
            <textarea className="input" rows={3} value={form.historyOfPresentingIllness} onChange={(e) => setForm({ ...form, historyOfPresentingIllness: e.target.value })} />
          </ClinicalSection>

          <div className="space-y-3 rounded-xl border border-ink-100 bg-ink-50/40 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Past history</div>
            <ClinField label="Medical" value={form.pastMedicalHistory} onChange={(v) => setForm({ ...form, pastMedicalHistory: v })} ph="e.g. Diabetes, HTN…" />
            <ClinField label="Surgical" value={form.pastSurgicalHistory} onChange={(v) => setForm({ ...form, pastSurgicalHistory: v })} ph="e.g. Appendicectomy 2019…" />
            <ClinField label="Family" value={form.familyHistory} onChange={(v) => setForm({ ...form, familyHistory: v })} ph="e.g. Diabetes in mother…" />
            <ClinField label="Personal / habits" value={form.personalHistory} onChange={(v) => setForm({ ...form, personalHistory: v })} ph="Smoking, alcohol, diet…" />
            <ClinField label="Medication" value={form.medicationHistory} onChange={(v) => setForm({ ...form, medicationHistory: v })} ph="e.g. Amlodipine 5 mg OD…" />
            <ClinField label="Allergies (comma-separated)" value={form.allergies} onChange={(v) => setForm({ ...form, allergies: v })} ph="Penicillin, dust…" />
          </div>

          <div className="space-y-3 rounded-xl border border-ink-100 bg-ink-50/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Clinical examination</div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-ink-400">Template</label>
                <select className="select w-52 !py-1 text-xs" value={activeTemplate?._id || ''} onChange={(e) => { setTemplateId(e.target.value); setDiagPending(null); }}>
                  {templates.map((t) => <option key={t._id} value={t._id}>{t.specialty}</option>)}
                </select>
              </div>
            </div>
            {activeTemplate?.sections?.map((section) => (
              <div key={section.key} className="space-y-2 rounded-lg border border-ink-100 bg-white p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-ink-400">{section.title}</div>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {section.fields.map((field) => {
                    const key = `${section.key}.${field.key}`;
                    if (field.type === 'vitals') {
                      return <div key={key} className="sm:col-span-2"><VitalsStrip vitals={vitals} /></div>;
                    }
                    if (field.type === 'select') {
                      return (
                        <div key={key}>
                          <label className="label">{field.label}</label>
                          <select className="select" value={examState[key] ?? ''} onChange={(e) => setExamVal(key, e.target.value)}>
                            <option value="">—</option>
                            {field.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </div>
                      );
                    }
                    if (field.type === 'textarea') {
                      return (
                        <div key={key} className="sm:col-span-2">
                          <label className="label">{field.label}</label>
                          <textarea className="input" rows={2} placeholder={field.placeholder} value={examState[key] ?? ''} onChange={(e) => setExamVal(key, e.target.value)} />
                        </div>
                      );
                    }
                    return (
                      <div key={key}>
                        <label className="label">{field.label}</label>
                        <input className="input" placeholder={field.placeholder} value={examState[key] ?? ''} onChange={(e) => setExamVal(key, e.target.value)} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {!templates.length && <p className="text-xs text-ink-400">No examination templates configured. Add one via the Examination templates settings.</p>}
          </div>

          <div className="space-y-3 rounded-xl border border-ink-100 bg-ink-50/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Diagnosis</div>
              <Badge label={`${ws?.diagnoses?.length || 0} on record`} />
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-[220px] flex-1">
                <input className="input !py-1.5" placeholder="Search diagnosis / ICD-10…" value={diagQuery} onChange={(e) => { setDiagQuery(e.target.value); setDiagPending(null); setDiagOpen(true); }} onFocus={() => setDiagOpen(true)} onBlur={() => setTimeout(() => setDiagOpen(false), 150)} />
                {diagOpen && diagQuery.trim().length >= 2 && (
                  <div className="absolute left-0 right-0 z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-ink-100 bg-white shadow-lg">
                    {diagSearch.isLoading ? <div className="p-3 text-xs text-ink-400">Searching…</div> : !diagSearch.data?.master?.length && !diagSearch.data?.previous?.length ? <div className="p-3 text-xs text-ink-400">No matches. Use the typed text to add a free diagnosis.</div> : (
                      <>
                        {diagSearch.data?.previous?.length > 0 && (
                          <div className="border-b border-ink-100 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-400">Previous diagnoses</div>
                        )}
                        {diagSearch.data?.previous?.map((d) => (
                          <button key={d._id} className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-ink-50" onMouseDown={(e) => e.preventDefault()} onClick={() => { setDiagPending({ name: d.name, icd10Code: d.icd10Code }); setDiagQuery(d.name); setDiagOpen(false); }}>
                            <span className="truncate">{d.name}</span>
                            <span className="shrink-0 text-[10px] text-ink-400">{d.icd10Code || ''}{d.visitId?.opdNumber ? ` · ${d.visitId.opdNumber}` : ''}</span>
                          </button>
                        ))}
                        {diagSearch.data?.master?.length > 0 && (
                          <div className="border-b border-ink-100 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-400">Master dictionary</div>
                        )}
                        {diagSearch.data?.master?.map((m) => (
                          <button key={m._id} className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-ink-50" onMouseDown={(e) => e.preventDefault()} onClick={() => { setDiagPending({ name: m.name, icd10Code: m.icd10Code }); setDiagQuery(m.name); setDiagOpen(false); }}>
                            <span className="truncate">{m.name}</span>
                            <span className="shrink-0 font-mono text-[10px] text-ink-400">{m.icd10Code || ''}</span>
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
              <select className="select w-32 !py-1.5 text-xs" value={diagType} onChange={(e) => setDiagType(e.target.value)}>
                {DIAGNOSIS_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>)}
              </select>
              <button className="btn-primary !px-3 !py-1.5 text-xs" disabled={addDiag.isPending || !(diagPending?.name || diagQuery.trim())} onClick={() => addDiag.mutate({ name: diagPending?.name || diagQuery.trim(), icd10Code: diagPending?.icd10Code, type: diagType })}>
                {addDiag.isPending ? <Spinner className="h-3.5 w-3.5 text-white" /> : <><Plus className="h-3.5 w-3.5" /> Add</>}
              </button>
            </div>
            <ul className="space-y-1.5">
              {ws?.diagnoses?.map((d) => (
                <li key={d._id} className="flex items-center justify-between gap-2 rounded-md bg-white px-2.5 py-1.5 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-ink-800">{d.name}</span>
                    <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold', DIAG_TYPE_STYLES[d.type] || 'bg-ink-100 text-ink-500')}>{d.type}</span>
                    {d.icd10Code && <span className="shrink-0 font-mono text-[10px] text-ink-400">{d.icd10Code}</span>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <select className="select w-28 !py-1 text-xs" value={d.type} onChange={(e) => changeDiagType.mutate({ id: d._id, type: e.target.value })}>
                      {DIAGNOSIS_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>)}
                    </select>
                    <button className="btn-icon !h-6 !w-6" onClick={() => removeDiag.mutate(d._id)}><X className="h-3 w-3" /></button>
                  </div>
                </li>
              ))}
              {!ws?.diagnoses?.length && <li className="text-xs text-ink-400">Search above to add the first diagnosis. Previous diagnoses are never overwritten — each is added as a separate record.</li>}
            </ul>
          </div>

          <ClinicalSection title="Treatment plan">
            <textarea className="input" rows={2} value={form.treatmentPlan} onChange={(e) => setForm({ ...form, treatmentPlan: e.target.value })} />
          </ClinicalSection>
          <ClinicalSection title="Advice / counselling">
            <textarea className="input" rows={2} value={form.advice} onChange={(e) => setForm({ ...form, advice: e.target.value })} />
          </ClinicalSection>
        </div>

        <div className="mt-4 flex justify-end">
          <button className="btn-primary" disabled={save.isPending} onClick={submit}>
            {save.isPending ? <Spinner className="h-4 w-4 text-white" /> : <><CheckCircle2 className="h-4 w-4" /> Save consultation</>}
          </button>
        </div>
      </div>

      {/* RIGHT — previous clinical history */}
      <div className="space-y-4">
        <div className="card overflow-hidden">
          <div className="border-b border-ink-100 bg-ink-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-ink-400">Previous visits</div>
          {history.isLoading ? <LoadingState /> : !history.data?.visits?.length ? <div className="p-4 text-xs text-ink-400">No previous visits.</div> : (
            <ul className="max-h-[220px] divide-y divide-ink-100 overflow-y-auto">
              {history.data.visits.filter((v) => v._id !== visit._id).map((v) => {
                const open = selectedVisitId === v._id;
                const entries = (history.data.diagnoses || []).filter((d) => d.visitId?._id === v._id);
                const ords = (history.data.orders || []).filter((o) => o.visitId?._id === v._id);
                return (
                  <li key={v._id}>
                    <button className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-ink-50" onClick={() => setSelectedVisitId(open ? null : v._id)}>
                      <span className="font-mono text-xs font-semibold text-brand-700">{v.opdNumber}</span>
                      <span className="text-xs text-ink-500">{formatDate(v.visitDate)}</span>
                    </button>
                    {open && (
                      <div className="border-t border-ink-100 bg-ink-50/60 px-3 py-2 text-xs">
                        <div className="text-ink-500">Dr. {v.doctorId?.name || '—'} · {VISIT_TYPES[v.visitType] || v.visitType || '—'}</div>
                        {v.chiefComplaint && <div className="mt-1 text-ink-700">“{v.chiefComplaint}”</div>}
                        {entries.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{entries.map((d) => <span key={d._id} className="rounded bg-white px-1.5 py-0.5 text-[11px] text-ink-700">{d.name}</span>)}</div>}
                        {ords.length > 0 && <div className="mt-1 text-ink-500">Orders: {ords.map((o) => `${o.category} · ${o.name}`).join(', ')}</div>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-ink-100 bg-ink-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-ink-400">Diagnosis history</div>
          <ul className="max-h-[200px] divide-y divide-ink-100 overflow-y-auto">
            {(history.data?.diagnoses || []).slice(0, 12).map((d) => (
              <li key={d._id} className="px-3 py-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-ink-800">{d.name}</span>
                  <span className="text-[10px] text-ink-400">{d.visitId?.opdNumber ? formatDate(d.visitId.visitDate) : ''}</span>
                </div>
                {d.icd10Code && <div className="text-[10px] text-ink-400">{d.icd10Code} · {d.status}</div>}
              </li>
            ))}
            {!history.data?.diagnoses?.length && <li className="p-4 text-xs text-ink-400">No diagnosis history.</li>}
          </ul>
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-ink-100 bg-ink-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-ink-400">Investigations</div>
          <ul className="max-h-[200px] divide-y divide-ink-100 overflow-y-auto">
            {(history.data?.orders || []).slice(0, 12).map((o) => (
              <li key={o._id} className="px-3 py-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-ink-800"><span className="mr-1 rounded bg-ink-100 px-1.5 py-0.5 text-[10px] text-ink-500">{o.category}</span>{o.name}</span>
                  <span className="text-[10px] text-ink-400">{o.visitId?.opdNumber ? formatDate(o.visitId.visitDate) : ''}</span>
                </div>
                <div className="text-[10px] text-ink-400">{o.status || ''}</div>
              </li>
            ))}
            {!history.data?.orders?.length && <li className="p-4 text-xs text-ink-400">No prior investigations.</li>}
          </ul>
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-ink-100 bg-ink-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-ink-400">Prescriptions</div>
          <ul className="max-h-[220px] divide-y divide-ink-100 overflow-y-auto">
            {(history.data?.prescriptions || []).map((rx) => (
              <li key={rx._id} className="px-3 py-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] font-semibold text-brand-700">{rx.rxNumber}</span>
                  <span className="text-[10px] text-ink-400">{formatDate(rx.prescriptionDate)}</span>
                </div>
                <div className="mt-1 text-ink-700">{rx.items?.map((i) => `${i.medicineName} ${i.dosage || ''} ${i.frequency || ''}`.trim()).join(' · ') || '—'}</div>
                <div className="text-[10px] text-ink-400">Dr. {rx.doctorId?.name || '—'}{rx.advice ? ` · ${rx.advice}` : ''}</div>
              </li>
            ))}
            {!history.data?.prescriptions?.length && <li className="p-4 text-xs text-ink-400">No prior prescriptions.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}

function ClinicalSection({ title, children }) {
  return (
    <div>
      <div className="mb-1 text-xs font-bold uppercase tracking-wider text-ink-400">{title}</div>
      {children}
    </div>
  );
}

function ClinField({ label, value, onChange, ph }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" value={value} placeholder={ph} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* STAGE 7 — INVESTIGATIONS (lab orders connected to Lab module)      */
/* ------------------------------------------------------------------ */
function StepInvestigate({ journey, onNext }) {
  const { patient, visit } = journey;
  const qc = useQueryClient();
  const [tests, setTests] = useState([]);
  const [priority, setPriority] = useState('ROUTINE');
  const { data: labTests } = useQuery({
    queryKey: ['lab-tests'],
    queryFn: async () => (await api.get('/lab/tests', { params: { limit: 100 } })).data.data,
  });
  const results = useQuery({
    queryKey: ['lab-results-patient', patient._id],
    queryFn: async () => (await api.get('/lab/results', { params: { patientId: patient._id } })).data.data || [],
  });

  const orderMutation = useMutation({
    mutationFn: async (payload) => {
      const labOrder = await api.post('/lab/orders', payload);
      const clinical = await api.post(`/opd/visits/${visit._id}/orders`, {
        category: 'LAB', name: payload.items.map((i) => i.testName).join(', ') || 'Lab investigation', priority, labOrderId: labOrder.data.data._id, status: 'ORDERED',
      });
      return { labOrder: labOrder.data.data, clinical };
    },
    onSuccess: ({ labOrder }) => {
      toast.success(`Lab order ${labOrder.labOrderNumber} created — sample & result flow to Lab module`);
      setTests([]);
      qc.invalidateQueries({ queryKey: ['lab-results-patient', patient._id] });
      qc.invalidateQueries({ queryKey: ['opd-workspace', visit._id] });
      onNext({ investigateDone: true });
    },
    onError: (e) => toast.error(apiError(e)),
  });
  const toggleTest = (t) => setTests((cur) => (cur.some((x) => x.labTestId === t._id) ? cur.filter((x) => x.labTestId !== t._id) : [...cur, { labTestId: t._id, testName: t.name, rate: t.price || 0 }]));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card p-5">
        <div className="flex items-center gap-2 text-base font-bold text-ink-900"><FlaskConical className="h-5 w-5 text-brand-600" /> Order investigations — {visit.opdNumber}</div>
        <p className="mt-1 text-xs text-ink-400">Select lab tests. They create a real Lab order (auto-billed) and appear in the Lab module for sampling & results.</p>
        <div className="mt-3 flex items-center gap-2">
          <span className="label !mb-0">Priority</span>
          <select className="select w-36" value={priority} onChange={(e) => setPriority(e.target.value)}>
            {ORDER_PRIORITIES.map((p) => <option key={p}>{p}</option>)}
          </select>
          <span className="ml-auto text-xs text-ink-400">{tests.length} selected</span>
        </div>
        <div className="mt-3 max-h-[300px] space-y-1 overflow-y-auto">
          {labTests?.map((t) => (
            <label key={t._id} className={cn('flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2', tests.some((x) => x.labTestId === t._id) ? 'border-brand-400 bg-brand-50' : 'border-ink-100')}>
              <input type="checkbox" className="accent-brand-600" checked={tests.some((x) => x.labTestId === t._id)} onChange={() => toggleTest(t)} />
              <span className="flex-1 text-sm text-ink-800">{t.name}</span>
              {t.price > 0 && <span className="text-xs text-ink-400">{formatCurrency(t.price)}</span>}
            </label>
          ))}
          {!labTests?.length && <p className="text-xs text-ink-400">No active lab tests configured.</p>}
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button className="btn-primary" disabled={orderMutation.isPending || !tests.length} onClick={() => orderMutation.mutate({ patientId: patient._id, doctorId: journey.appointment?.doctorId || visit.doctorId?._id, items: tests, priority, skipBilling: false })}>
            {orderMutation.isPending ? <Spinner className="h-4 w-4 text-white" /> : <><FlaskConical className="h-4 w-4" /> Send {tests.length > 1 ? `${tests.length} tests` : 'test'} to lab</>}
          </button>
          <button className="btn-secondary" onClick={() => onNext({ investigateDone: true })}>
            No investigations needed
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-ink-100 bg-ink-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-ink-400">Lab results for patient</div>
        {results.isLoading ? <LoadingState /> : results.error ? <ErrorState message={apiError(results.error)} /> : (
          <ul className="max-h-[360px] divide-y divide-ink-100 overflow-y-auto">
            {results.data.map((r) => (
              <li key={r._id} className="p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-ink-900">{r.testName || r.labTestId?.name}</span>
                  <Badge label={r.status} status={r.status === 'VERIFIED' ? 'VERIFIED' : 'IN_PROGRESS'} />
                </div>
                <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
                  {(r.values || []).map((v, i) => (
                    <div key={i} className="flex items-baseline gap-1 text-xs">
                      <span className="text-ink-400">{v.parameter}:</span>
                      <b className={cn('text-ink-800', (v.flag === 'HIGH' || v.flag === 'CRITICAL_HIGH' || v.flag === 'CRITICAL_LOW') && 'text-rose-600', v.flag === 'LOW' && 'text-amber-600')}>{v.value}</b>
                      <span className="text-[10px] text-ink-400">{v.unit}</span>
                    </div>
                  ))}
                  {!r.values?.length && <span className="text-xs text-ink-400">Result values pending…</span>}
                </div>
              </li>
            ))}
            {!results.data?.length && <li className="p-6 text-center text-sm text-ink-400">No lab results yet for this patient.</li>}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* STAGE 8 — PRESCRIPTION → PHARMACY                                  */
/* ------------------------------------------------------------------ */
function StepPrescribe({ journey, onNext }) {
  const { patient, visit } = journey;
  const qc = useQueryClient();
  const [diagnosis, setDiagnosis] = useState('');
  const [advice, setAdvice] = useState('');
  const [rows, setRows] = useState([]);
  const [sel, setSel] = useState('');
  const { data: medicines } = useQuery({
    queryKey: ['pharmacy-medicines'],
    queryFn: async () => (await api.get('/pharmacy/medicines', { params: { limit: 100 } })).data.data,
  });

  const mutation = useMutation({
    mutationFn: async (payload) => (await api.post(`/opd/visits/${visit._id}/prescriptions`, payload)).data.data,
    onSuccess: () => {
      toast.success('Prescription issued with RX number');
      qc.invalidateQueries({ queryKey: ['opd-visits-rx'] });
      onNext({ rxDone: true, stageRanked: 6 });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const addRow = (m) => {
    const existing = rows.find((r) => r.medicineId === m._id);
    if (existing) { setRows(rows.map((r) => (r.medicineId === m._id ? { ...r, quantity: r.quantity + 1 } : r))); setSel(''); return; }
    setRows([...rows, { medicineId: m._id, medicineName: m.name, dosage: '', frequency: '1-0-1', duration: '3 days', quantity: (m.totalStock) > 0 ? 1 : 1, timing: 'AFTER_FOOD', route: 'ORAL' }]);
    setSel('');
  };

  const submit = () => {
    if (!rows.length) return toast.error('Add at least one medicine');
    mutation.mutate({ patientId: patient._id, doctorId: journey.appointment?.doctorId || visit.doctorId?._id, diagnosis: diagnosis || undefined, advice: advice || undefined, items: rows });
  };

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 text-base font-bold text-ink-900"><Pill className="h-5 w-5 text-brand-600" /> Prescription — {visit.opdNumber}</div>
      <p className="mt-1 text-xs text-ink-400">Issue medicines; the prescription is handed to pharmacy for dispensing.</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div><label className="label">Diagnosis (on RX)</label><input className="input" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} /></div>
        <div><label className="label">Advice</label><input className="input" value={advice} onChange={(e) => setAdvice(e.target.value)} /></div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <select className="select flex-1" value={sel} onChange={(e) => { if (e.target.value) { const m = medicines?.find((x) => x._id === e.target.value); if (m) addRow(m); } }}>
          <option value="">+ Add medicine…</option>
          {medicines?.map((m) => <option key={m._id} value={m._id}>{m.name}{m.totalStock === 0 ? ' (out of stock)' : ''}</option>)}
        </select>
      </div>

      {rows.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="table">
            <thead>
              <tr><th>Medicine</th><th>Dosage</th><th>Frequency</th><th>Duration</th><th>Timing</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={idx}>
                  <td className="font-medium text-ink-900">{r.medicineName}</td>
                  <td><input className="input !py-1" value={r.dosage} onChange={(e) => { const next = [...rows]; next[idx] = { ...r, dosage: e.target.value }; setRows(next); }} /></td>
                  <td><input className="input !py-1 w-20" value={r.frequency} onChange={(e) => { const next = [...rows]; next[idx] = { ...r, frequency: e.target.value }; setRows(next); }} /></td>
                  <td><input className="input !py-1 w-24" value={r.duration} onChange={(e) => { const next = [...rows]; next[idx] = { ...r, duration: e.target.value }; setRows(next); }} /></td>
                  <td>
                    <select className="select !py-1 text-xs" value={r.timing} onChange={(e) => { const next = [...rows]; next[idx] = { ...r, timing: e.target.value }; setRows(next); }}>
                      {['BEFORE_FOOD', 'AFTER_FOOD', 'WITH_FOOD', 'ANY_TIME'].map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </td>
                  <td><button className="btn-icon" onClick={() => setRows(rows.filter((_, i) => i !== idx))}><X className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button className="btn-primary" disabled={mutation.isPending || !rows.length} onClick={submit}>
          {mutation.isPending ? <Spinner className="h-4 w-4 text-white" /> : <><Pill className="h-4 w-4" /> Issue prescription → pharmacy</>}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* STAGE 9 — FOLLOW-UP / REFERRAL / COMPLETION + receipts             */
/* ------------------------------------------------------------------ */
function StepComplete({ journey, onNext, onEnd }) {
  const { visit, appointment, patient } = journey;
  const qc = useQueryClient();
  const [followUpDate, setFollowUpDate] = useState('');
  const [referTo, setReferTo] = useState('');
  const [completed, setCompleted] = useState(false);

  const followMut = useMutation({
    mutationFn: async () => (await api.post(`/opd/visits/${visit._id}/followups`, { date: new Date(followUpDate).toISOString(), reason: 'Review / follow-up', status: 'SCHEDULED' })).data.data,
    onSuccess: () => toast.success(`Follow-up scheduled for ${formatDate(followUpDate)}`),
    onError: (e) => toast.error(apiError(e)),
  });
  const completeMut = useMutation({
    mutationFn: async () => {
      const payload = { status: 'COMPLETED' };
      if (referTo.trim()) { payload.status = 'REFERRED'; payload.referral = { toDoctor: referTo.trim(), notes: '' }; }
      return (await api.put(`/opd/visits/${visit._id}`, payload)).data.data;
    },
    onSuccess: (v) => { toast.success(referTo.trim() ? 'Visit referred' : 'OPD visit completed and closed'); setCompleted(true); qc.invalidateQueries({ queryKey: ['opd-visits'] }); },
    onError: (e) => toast.error(apiError(e)),
  });

  const billing = useQuery({
    queryKey: ['opd-billing', visit._id],
    queryFn: async () => (await api.get(`/opd/visits/${visit._id}/billing`)).data.data,
    enabled: completed,
  });
  const timeline = useQuery({
    queryKey: ['opd-timeline', visit._id],
    queryFn: async () => (await api.get(`/opd/visits/${visit._id}/timeline`)).data.data,
    enabled: completed,
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card p-5">
        <div className="flex items-center gap-2 text-base font-bold text-ink-900"><CheckCircle2 className="h-5 w-5 text-brand-600" /> Follow-up & completion — {visit.opdNumber}</div>

        <div className="mt-4 flex items-end gap-2">
          <div className="flex-1"><label className="label">Follow-up date</label><input type="date" className="input" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} /></div>
          <button className="btn-secondary" disabled={followMut.isPending || !followUpDate} onClick={() => followMut.mutate()}>
            {followMut.isPending ? <Spinner className="h-4 w-4" /> : 'Schedule follow-up'}
          </button>
        </div>

        <div className="mt-3 flex items-end gap-2">
          <div className="flex-1"><label className="label">Refer to (optional)</label><input className="input" placeholder="e.g. Cardiology" value={referTo} onChange={(e) => setReferTo(e.target.value)} /></div>
        </div>

        <div className="mt-5 flex justify-between gap-2">
          <button className={cn('btn-primary', referTo.trim() && 'bg-amber-600 hover:bg-amber-700')} disabled={completeMut.isPending || completed} onClick={() => completeMut.mutate()}>
            {completeMut.isPending ? <Spinner className="h-4 w-4 text-white" /> : <><CheckCircle2 className="h-4 w-4" /> {referTo.trim() ? 'Refer visit' : 'Complete visit'}</>}
          </button>
          {completed && (
            <button className="btn-secondary" onClick={onEnd}>
              <X className="h-4 w-4" /> End journey — patient leaves
            </button>
          )}
        </div>

        {appointment && (
          <div className="mt-4 rounded-lg bg-ink-50 p-3 text-xs text-ink-400">
            Linked appointment #{appointment.tokenNumber} — queue status updates automatically as the visit progresses.
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="card overflow-hidden">
          <div className="border-b border-ink-100 bg-ink-50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-ink-400">Receipts / billing</div>
          {!completed ? <p className="p-5 text-sm text-ink-400">Complete the visit to pull the receipt and event timeline.</p> : billing.isLoading ? <LoadingState /> : (
            <div className="divide-y divide-ink-100">
              {billing.data?.bills?.map((b) => (
                <div key={b._id} className="p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-brand-700">{b.billNumber}</span>
                    <Badge label={b.status} status={b.status} />
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-1 text-xs text-ink-400">
                    <span>Gross: {formatCurrency(b.grossTotal)}</span>
                    <span>Tax: {formatCurrency(b.tax)}</span>
                    <span>Paid: {formatCurrency(b.paidAmount)}</span>
                    <span>Due: {formatCurrency(b.dueAmount)}</span>
                  </div>
                </div>
              ))}
              {!billing.data?.bills?.length && <p className="p-4 text-xs text-ink-400">No bills for this visit.</p>}
            </div>
          )}
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-ink-100 bg-ink-50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-ink-400">Journey events</div>
          {!completed ? <p className="p-5 text-sm text-ink-400">Timeline appears once the visit completes.</p> : timeline.isLoading ? <LoadingState /> : (
            <ul className="max-h-[220px] divide-y divide-ink-100 overflow-y-auto">
              {timeline.data?.map((e) => (
                <li key={e._id} className="flex items-center gap-2 px-3 py-2 text-xs">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                  <span className="flex-1 text-ink-700">{e.title || e.type}</span>
                  <span className="text-ink-400">{formatDateTime(e.happenedAt)}</span>
                </li>
              ))}
              {!timeline.data?.length && <li className="p-4 text-xs text-ink-400">No events yet.</li>}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}