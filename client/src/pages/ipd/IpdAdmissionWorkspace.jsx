import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  User,
  ClipboardList,
  Activity,
  ClipboardPaste,
  Pill,
  FlaskConical,
  Receipt,
  DoorOpen,
  Phone,
  BedDouble,
  ArrowLeftRight,
  X,
  CalendarClock,
  Stethoscope,
  ScanLine,
  Scissors,
  Salad,
  FolderOpen,
  Wallet,
  ShieldCheck,
  History,
  ListTree,
  AlertTriangle,
  Syringe as SyringeIcon,
  PackageCheck,
  Scale,
  Dumbbell,
  Droplets,
} from 'lucide-react';
import api, { apiError } from '../../lib/api';
import { POLL } from '../../lib/polling';
import { LoadingState, ErrorState, EmptyState, Spinner } from '../../components/ui/Feedback';
import { badge } from '../../components/ui/Badge';
import { formatDate, formatDateTime, cn } from '../../lib/utils';
import { TransferTab, DocumentsTab } from './IpdTransferDocuments';
import { MotionTab } from '../../components/ui/Motion';
import { useIpdRealtime } from '../../lib/useIpdRealtime';

const TABS = [
  { key: 'overview', label: 'Overview', icon: User },
  { key: 'clinical', label: 'Clinical', icon: ClipboardList },
  { key: 'vitals', label: 'Vitals', icon: Activity },
  { key: 'nursing', label: 'Nursing', icon: ClipboardPaste },
  { key: 'visits', label: 'Doctor Visits', icon: Stethoscope },
  { key: 'orders', label: 'Orders', icon: ListTree },
  { key: 'medications', label: 'Medications', icon: Pill },
  { key: 'mar', label: 'MAR', icon: SyringeIcon },
  { key: 'pharmacy', label: 'Pharmacy', icon: PackageCheck },
  { key: 'lab', label: 'Lab', icon: FlaskConical },
  { key: 'radiology', label: 'Radiology', icon: ScanLine },
  { key: 'procedures', label: 'Procedures', icon: Scissors },
  { key: 'ot', label: 'OT', icon: Scissors },
  { key: 'diet', label: 'Diet', icon: Salad },
  { key: 'blood', label: 'Blood Bank', icon: Droplets },
  { key: 'physio', label: 'Physiotherapy', icon: Dumbbell },
  { key: 'io', label: 'I/O Chart', icon: Scale },
  { key: 'documents', label: 'Documents', icon: FolderOpen },
  { key: 'billing', label: 'Billing', icon: Receipt },
  { key: 'payments', label: 'Payments', icon: Wallet },
  { key: 'insurance', label: 'Insurance', icon: ShieldCheck },
  { key: 'transfers', label: 'Transfers', icon: ArrowLeftRight },
  { key: 'timeline', label: 'Timeline', icon: History },
  { key: 'discharge', label: 'Discharge', icon: DoorOpen },
];

/** Section 47: each workstation opens the workspace focused on what it does. */
export const WORKSTATION_TABS = {
  doctor: ['overview', 'clinical', 'vitals', 'visits', 'orders', 'medications', 'lab', 'radiology', 'timeline'],
  nurse: ['overview', 'vitals', 'nursing', 'mar', 'io', 'medications', 'diet', 'timeline'],
  billing: ['overview', 'billing', 'payments', 'insurance', 'documents', 'discharge'],
  admin: ['overview', 'transfers', 'documents', 'timeline'],
};

const TYPES = { EMERGENCY: 'Emergency', ELECTIVE: 'Elective', OPD: 'From OPD', TRANSFER: 'Transfer', DAY_CARE: 'Day Care' };
const ROUTES = ['ORAL', 'IV', 'IM', 'SC', 'S/TOPICAL', 'NEBULIZATION', 'RECTAL', 'INTRAMUSCULAR', 'SUBCUTANEOUS', 'TRANSDERMAL'];
const ACTIVE = ['ADMITTED', 'TRANSFERRED', 'DISCHARGE_PLANNED'];
const WAITING = ['WAITING_FOR_BED', 'APPROVED', 'ADMISSION_REQUESTED'];

export default function IpdAdmissionWorkspace() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const tab = params.get('tab') || 'overview';
  const validId = /^[a-f\d]{24}$/i.test(String(id || ''));
  useIpdRealtime({ admissionId: validId ? id : null });

  const ws = useQuery({
    queryKey: ['ipd-workspace', id],
    queryFn: async () => (await api.get(`/ipd/admissions/${id}/workspace`)).data.data,
    enabled: validId,
    refetchInterval: POLL.ACTIVE,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['ipd-workspace', id] });
    qc.invalidateQueries({ queryKey: ['ipd-command-center'] });
    qc.invalidateQueries({ queryKey: ['ipd-admissions'] });
  };

  if (!validId) {
    return (
      <div className="p-6">
        <ErrorState message="This admission link is not valid — the admission reference is missing." />
        <div className="mt-3 flex gap-2">
          <Link to="/ipd/admissions" className="btn-primary text-xs">Open admissions register</Link>
          <Link to="/ipd/dashboard" className="btn-secondary text-xs">Back to IPD command center</Link>
        </div>
      </div>
    );
  }

  if (ws.isLoading) return <LoadingState label="Loading admission workspace…" />;
  if (ws.error) return <ErrorState message={apiError(ws.error)} />;

  const d = ws.data;
  const a = d.admission;
  const p = d.patient360;
  const active = ACTIVE.includes(a.status);
  const waiting = WAITING.includes(a.status);
  const go = (k) => setParams({ tab: k });

  const critical = (d.vitals || []).filter((v) => v.flags?.flags?.some((f) => f.endsWith(':CRITICAL'))).length;

  return (
    <div className="p-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#060d1a] via-[#0a1a30] to-[#062b3a] p-5 text-white shadow-lg shadow-black/50">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-mono text-lg font-extrabold tracking-tight">{a.admissionNumber}</h1>
              {badge(a.status)}
              {a.priority === 'STAT' && <span className="rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-bold">STAT</span>}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-blue-100">
              <span className="font-semibold text-white">{p?.firstName} {p?.lastName || ''}</span>
              <span className="font-mono text-xs">UHID {p?.uhid}</span>
              <span>{p?.gender} · {p?.age ? `${p.age} yrs` : p?.dateOfBirth ? formatDate(p.dateOfBirth) : '—'}</span>
              <span>{TYPES[a.admissionType] || a.admissionType}</span>
              <span className="flex items-center gap-1">
                <BedDouble className="h-3.5 w-3.5" />
                {[a.wardId?.name, a.roomId?.roomNumber, a.bedId?.bedNumber].filter(Boolean).join(' / ') || 'No bed'}
              </span>
              {a.admittedAt && <span>Admitted {formatDateTime(a.admittedAt)}</span>}
              {a.expectedDischargeDate && <span>Expected DC {formatDate(a.expectedDischargeDate)}</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {waiting && <QuickAction label="Assign bed" icon={<BedDouble className="h-4 w-4" />} onClick={() => go('overview')} />}
            {active && <QuickAction label="Transfer bed" icon={<ArrowLeftRight className="h-4 w-4" />} onClick={() => go('transfers')} />}
            {(active || waiting) && <QuickAction label="Plan discharge" icon={<CalendarClock className="h-4 w-4" />} onClick={() => go('discharge')} />}
            {(active || waiting) && <QuickAction danger label="Cancel admission" icon={<X className="h-4 w-4" />} onClick={() => go('overview')} />}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-blue-100">
          <span><b className="text-white">{a.consultantDoctorId?.name || 'Consultant TBD'}</b> {a.departmentId?.name || ''}</span>
          <span>Blood group <b className="text-white">{p?.bloodGroup || '—'}</b></span>
          <span>Allergies <b className="text-white">{p?.allergies?.length ? p.allergies.join(', ') : 'NKDA'}</b></span>
          {a.attendant?.name && (
            <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {a.attendant.name}{a.attendant.relation ? ` (${a.attendant.relation})` : ''}{a.attendant.phone ? ` · ${a.attendant.phone}` : ''}</span>
          )}
        </div>
      </div>

      {critical > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-200">
          <AlertTriangle className="h-4 w-4" /> {critical} critical vital reading{critical > 1 ? 's' : ''} recorded — review the Vitals tab
        </div>
      )}

      <div className="scrollbar-none sticky top-0 z-10 -mx-6 mt-4 flex gap-1 overflow-x-auto border-b border-ink-200 bg-ink-50/95 px-6 py-2 backdrop-blur">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => go(t.key)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                tab === t.key ? 'bg-brand-600 text-white shadow-md shadow-brand-600/20' : 'text-ink-600 hover:bg-ink-100',
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        <MotionTab tabKey={tab}>
        {tab === 'overview' && <OverviewTab d={d} onChanged={invalidate} />}
        {tab === 'clinical' && <ClinicalTab d={d} onChanged={invalidate} />}
        {tab === 'vitals' && <VitalsTab d={d} onChanged={invalidate} />}
        {tab === 'nursing' && <NursingTab d={d} onChanged={invalidate} />}
        {tab === 'visits' && <DoctorVisitsTab d={d} onChanged={invalidate} />}
        {tab === 'orders' && <OrdersTab d={d} onChanged={invalidate} />}
        {tab === 'medications' && <MedicationsTab d={d} onChanged={invalidate} />}
        {tab === 'mar' && <MarTab d={d} onChanged={invalidate} />}
        {tab === 'pharmacy' && <PharmacyTab d={d} onChanged={invalidate} />}
        {tab === 'lab' && <LabTab d={d} onChanged={invalidate} />}
        {tab === 'radiology' && <RadiologyTab d={d} onChanged={invalidate} />}
        {tab === 'procedures' && <ProceduresTab d={d} onChanged={invalidate} />}
        {tab === 'ot' && <OtTab d={d} onChanged={invalidate} />}
        {tab === 'diet' && <DietTab d={d} onChanged={invalidate} />}
        {tab === 'blood' && <BloodTab d={d} onChanged={invalidate} />}
        {tab === 'physio' && <PhysioTab d={d} onChanged={invalidate} />}
        {tab === 'io' && <IoTab d={d} onChanged={invalidate} />}
        {tab === 'transfers' && (
          <div className="space-y-4">
            <TransferTab d={d} onChanged={invalidate} />
            <TransfersTab d={d} onChanged={invalidate} />
          </div>
        )}
        {tab === 'documents' && <DocumentsTab d={d} />}
        {tab === 'billing' && <BillingTab d={d} />}
        {tab === 'payments' && <PaymentsTab d={d} />}
        {tab === 'insurance' && <InsuranceTab d={d} />}
        {tab === 'timeline' && <TimelineTab d={d} />}
        {tab === 'discharge' && <DischargeTab d={d} onChanged={invalidate} />}
        </MotionTab>
      </div>
    </div>
  );
}

function QuickAction({ label, icon, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 ring-inset backdrop-blur transition',
        danger ? 'bg-red-500/15 text-red-200 ring-red-300/40 hover:bg-red-500/25' : 'bg-white/15 text-white ring-white/30 hover:bg-white/25',
      )}
    >
      {icon} {label}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{label}</div>
      <div className="mt-0.5 text-sm text-ink-800">{children || '—'}</div>
    </div>
  );
}

function Section({ title, children, right }) {
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink-900">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

function Modal({ title, subtitle, children, onClose, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/60 p-4 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className={cn('card my-8 w-full animate-slide-up p-6', wide ? 'max-w-3xl' : 'max-w-lg')} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="btn-icon float-right -mr-1 -mt-1"><X className="h-5 w-5" /></button>
        <h2 className="mb-1 text-lg font-bold text-ink-900">{title}</h2>
        {subtitle && <p className="mb-3 text-xs text-ink-500">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

// ===== OVERVIEW =====
function OverviewTab({ d, onChanged }) {
  const a = d.admission;
  const p = d.patient360;
  const [bedModal, setBedModal] = useState(null);
  const waiting = WAITING.includes(a.status);
  const active = ACTIVE.includes(a.status);

  const cancel = useMutation({
    mutationFn: async () => (await api.post(`/ipd/admissions/${a._id}/cancel`, { reason: 'Cancelled from workspace' })).data.data,
    onSuccess: () => { toast.info('Admission cancelled'); onChanged(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const openAlloc = (d.allocations || []).find((x) => x.open);

  return (
    <div className="space-y-4">
      <Section title="Patient 360" right={<span className="text-[11px] text-ink-400">{p?.uhid}</span>}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Field label="Gender">{p?.gender}</Field>
          <Field label="Age">{p?.age ? `${p.age} yrs` : p?.dateOfBirth ? formatDate(p.dateOfBirth) : '—'}</Field>
          <Field label="Blood group">{p?.bloodGroup || '—'}</Field>
          <Field label="Mobile">{p?.mobile || '—'}</Field>
          <Field label="Allergies">{p?.allergies?.length ? p.allergies.join(', ') : 'None'}</Field>
          <Field label="Address">{p?.address?.line1 ? `${p.address.line1}, ${p.address.city || ''}` : '—'}</Field>
        </div>
      </Section>

      <Section title="Admission details">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <Field label="Admitting diagnosis">{a.admittingDiagnosis}</Field>
          <Field label="Provisional diagnosis">{a.provisionalDiagnosis}</Field>
          <Field label="Chief complaint">{a.chiefComplaint}</Field>
          <Field label="Department">{a.departmentId?.name}</Field>
          <Field label="Consultant">{a.consultantDoctorId?.name || a.admittingDoctor?.name}</Field>
          <Field label="Payment">{a.paymentCategory || '—'}</Field>
          <Field label="Estimated stay">{a.estimatedStayDays ? `${a.estimatedStayDays} days` : '—'}</Field>
          <Field label="Insurance">
            {a.insurancePolicyId?.policyNumber || (a.sponsor?.name ? `Sponsor: ${a.sponsor.name}` : 'Not on insurance')}
          </Field>
          <Field label="Ward">{a.wardId?.name}</Field>
          <Field label="Room">{a.roomId?.roomNumber}</Field>
          <Field label="Bed tariff">{a.bedId?.chargePerDay ? `₹${a.bedId.chargePerDay}/day` : '—'}</Field>
          <Field label="Expected discharge">{a.expectedDischargeDate ? formatDate(a.expectedDischargeDate) : '—'}</Field>
        </div>
      </Section>

      <Section title="Clinical activity snapshot">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {[
            ['Doctor visits', d.doctorVisits?.length],
            ['Vitals', d.vitals?.length],
            ['Nursing', d.nursingNotes?.length],
            ['Orders', d.orders?.length],
            ['Medications', d.medications?.length],
            ['Transfers', (d.allocations?.length || 0) - 1],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-ink-50 px-3 py-2 text-center">
              <div className="text-lg font-extrabold text-ink-900">{v ?? 0}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{k}</div>
            </div>
          ))}
        </div>
      </Section>

      {(waiting || active) && (
        <Section title="Bed & lifecycle actions">
          <div className="flex flex-wrap gap-2">
            {waiting && (
              <button className="btn-primary text-xs" onClick={() => setBedModal({ mode: 'assign' })}>
                <BedDouble className="h-4 w-4" /> Assign bed now
              </button>
            )}
            {a.bedId && active && (
              <button className="btn-secondary text-xs" onClick={() => setBedModal({ mode: 'transfer' })}>
                <ArrowLeftRight className="h-4 w-4" /> Transfer to another bed
              </button>
            )}
            {openAlloc && (
              <span className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                Current allocation: {openAlloc.to || a.bedId?.bedNumber} since {formatDateTime(openAlloc.fromAt)}
              </span>
            )}
            {!cancel.isPending && (
              <button className="btn-danger text-xs" onClick={() => { if (window.confirm('Cancel this admission?')) cancel.mutate(); }}>
                <X className="h-4 w-4" /> Cancel admission
              </button>
            )}
          </div>
        </Section>
      )}

      {bedModal && <BedAssignModal admission={a} mode={bedModal.mode} onClose={() => setBedModal(null)} onDone={() => { setBedModal(null); onChanged(); }} />}
    </div>
  );
}

function BedAssignModal({ admission, mode, onClose, onDone }) {
  const qc = useQueryClient();
  const beds = useQuery({
    queryKey: ['ipd-beds-available'],
    queryFn: async () => (await api.get('/ipd/beds')).data.data,
  });
  const [bedId, setBedId] = useState('');
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      if (mode === 'assign') return (await api.post(`/ipd/admissions/${admission._id}/assign-bed`, { bedId, reason: reason || undefined })).data.data;
      return (await api.post(`/ipd/admissions/${admission._id}/transfer`, { newBedId: bedId, reason: reason || undefined })).data.data;
    },
    onSuccess: (a) => {
      toast.success(mode === 'assign' ? 'Bed assigned' : `Transferred to ${a.bedId?.bedNumber || 'new bed'}`);
      qc.invalidateQueries({ queryKey: ['ipd-beds-available'] });
      onDone();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  let options = (beds.data || []).filter((b) => b.status === 'AVAILABLE' || b.status === 'RESERVED');
  if (mode === 'transfer') options = options.filter((b) => String(b._id) !== String(admission.bedId?._id));

  return (
    <Modal title={mode === 'assign' ? 'Assign a bed' : 'Transfer to another bed'} subtitle={`${admission.admissionNumber} · ${admission.patientId?.firstName || ''} ${admission.patientId?.lastName || ''}`} onClose={onClose}>
      <label className="label">Target bed</label>
      <select className="select" value={bedId} onChange={(e) => setBedId(e.target.value)}>
        <option value="">Select…</option>
        {options.map((b) => <option key={b._id} value={b._id}>{b.code || b.bedNumber} · {b.wardId?.name || 'ward'} · ₹{b.chargePerDay || 0}/day</option>)}
      </select>
      {!options.length && <p className="mt-1 text-xs text-amber-600">No available beds right now.</p>}
      <div className="mt-3">
        <label className="label">{mode === 'assign' ? 'Allocation reason' : 'Transfer reason'}</label>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={mode === 'assign' ? 'e.g. Admission allocation' : 'e.g. Patient requested nearer washroom'} />
      </div>
      <button className="btn-primary mt-4 w-full" disabled={!bedId || mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? <Spinner className="h-4 w-4 text-white" /> : mode === 'assign' ? 'Assign bed' : 'Transfer bed'}
      </button>
    </Modal>
  );
}

// ===== CLINICAL (initial assessment + notes) =====
const ASSESSMENT_FIELDS = [
  { k: 'complaint', label: 'Patient complaint', type: 'input' },
  { k: 'hpi', label: 'History of present illness', type: 'area' },
  { k: 'pastMedical', label: 'Past medical history', type: 'area' },
  { k: 'pastSurgical', label: 'Past surgical history', type: 'area' },
  { k: 'familyHistory', label: 'Family history', type: 'area' },
  { k: 'medicationHistory', label: 'Medication history', type: 'area' },
  { k: 'allergiesText', label: 'Allergies', type: 'input' },
  { k: 'physicalExam', label: 'Physical examination', type: 'area' },
  { k: 'generalCondition', label: 'General condition', type: 'input' },
  { k: 'systemExam', label: 'System examination', type: 'area' },
  { k: 'initialDiagnosis', label: 'Initial diagnosis', type: 'input' },
  { k: 'provisionalDiagnosis', label: 'Provisional diagnosis', type: 'input' },
  { k: 'riskAssessment', label: 'Risk assessment', type: 'input' },
  { k: 'carePlan', label: 'Care plan', type: 'area' },
  { k: 'doctorNotes', label: 'Doctor notes', type: 'area' },
  { k: 'nursingAssessment', label: 'Nursing assessment', type: 'area' },
  { k: 'attenderName', label: 'Attender name', type: 'input' },
  { k: 'attenderRelation', label: 'Attender relation', type: 'input' },
  { k: 'attenderPhone', label: 'Attender phone', type: 'input' },
];

const NOTE_TYPES = ['GENERAL', 'CHIEF_COMPLAINT', 'HPI', 'EXAMINATION', 'ASSESSMENT', 'PLAN', 'NURSING', 'FOLLOW_UP'];

function ClinicalTab({ d, onChanged }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({});
  const [noteType, setNoteType] = useState('GENERAL');
  const [body, setBody] = useState('');

  const assessments = (d.clinicalNotes || []).filter((n) => n.noteType === 'INITIAL_ASSESSMENT');
  const notes = (d.clinicalNotes || []).filter((n) => n.noteType !== 'INITIAL_ASSESSMENT');

  const saveAssessment = useMutation({
    mutationFn: async () => {
      const structured = {};
      for (const f of ASSESSMENT_FIELDS) structured[f.k] = form[f.k];
      structured.attenderInfo = { name: form.attenderName, relation: form.attenderRelation, phone: form.attenderPhone };
      return (await api.post(`/ipd/admissions/${d.admission._id}/initial-assessment`, { structured })).data.data;
    },
    onSuccess: () => { setForm({}); setShowForm(false); toast.success('Initial assessment saved'); onChanged(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const note = useMutation({
    mutationFn: async (p) => (await api.post(`/ipd/admissions/${d.admission._id}/clinical-notes`, p)).data.data,
    onSuccess: () => { setNoteType('GENERAL'); setBody(''); toast.success('Clinical note saved'); onChanged(); },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <div className="space-y-4">
      <Section
        title="Structured initial assessment"
        right={
          <button className="btn-secondary text-xs" onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Close' : '+ New assessment'}
          </button>
        }
      >
        {showForm && (
          <div className="mb-4 rounded-xl border border-ink-200 bg-ink-50/60 p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {ASSESSMENT_FIELDS.map((f) => (
                <div key={f.k} className={f.type === 'area' ? 'sm:col-span-2 lg:col-span-3' : ''}>
                  <label className="label">{f.label}</label>
                  {f.type === 'area' ? (
                    <textarea className="input" rows={2} value={form[f.k] || ''} onChange={(e) => setForm((x) => ({ ...x, [f.k]: e.target.value }))} />
                  ) : (
                    <input className="input" value={form[f.k] || ''} onChange={(e) => setForm((x) => ({ ...x, [f.k]: e.target.value }))} />
                  )}
                </div>
              ))}
            </div>
            <button className="btn-primary mt-3 text-xs" disabled={saveAssessment.isPending || !form.complaint} onClick={() => saveAssessment.mutate()}>
              {saveAssessment.isPending ? <Spinner className="h-4 w-4 text-white" /> : 'Save initial assessment'}
            </button>
          </div>
        )}
        {!assessments.length ? (
          <EmptyState title="No initial assessment" hint="Record the structured admission assessment" />
        ) : (
          <div className="space-y-3">
            {assessments.map((n) => (
              <div key={n._id} className="rounded-xl border border-ink-100 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-ink-400">
                  <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand-700 ring-1 ring-inset ring-brand-200">Initial assessment</span>
                  <span>{n.createdBy?.name || '—'} · {formatDateTime(n.createdAt)}</span>
                </div>
                <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
                  {ASSESSMENT_FIELDS.filter((f) => !f.k.startsWith('attender')).map((f) => (
                    <div key={f.k} className="text-xs">
                      <span className="font-semibold text-ink-500">{f.label}:</span>{' '}
                      <span className="text-ink-800">{n.structured?.[f.k] || '—'}</span>
                    </div>
                  ))}
                </div>
                {n.structured?.attenderInfo?.name && (
                  <div className="mt-2 text-xs text-ink-600">
                    <span className="font-semibold text-ink-500">Attender:</span> {n.structured.attenderInfo.name}
                    {n.structured.attenderInfo.relation ? ` (${n.structured.attenderInfo.relation})` : ''}
                    {n.structured.attenderInfo.phone ? ` · ${n.structured.attenderInfo.phone}` : ''}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Clinical notes & progress" right={<span className="text-[11px] text-ink-400">{notes.length} notes</span>}>
        <div className="rounded-xl border border-ink-200 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            <select className="select" value={noteType} onChange={(e) => setNoteType(e.target.value)}>
              {NOTE_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
            <input className="input sm:col-span-3 text-sm" placeholder="Write consultation / progress note…" value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <button className="btn-primary mt-2 text-xs" disabled={!body.trim() || note.isPending} onClick={() => note.mutate({ noteType, body })}>
            {note.isPending ? <Spinner className="h-4 w-4 text-white" /> : 'Save note'}
          </button>
        </div>
        {!notes.length ? (
          <div className="mt-3"><EmptyState title="No clinical notes" hint="Start the first round note above" /></div>
        ) : (
          <div className="mt-3 space-y-2.5">
            {notes.map((n) => (
              <div key={n._id} className="rounded-xl border border-ink-100 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand-700 ring-1 ring-inset ring-brand-200">{n.noteType.replace(/_/g, ' ')}</span>
                  <span className="text-[11px] text-ink-400">{n.createdBy?.name || '—'} · {formatDateTime(n.createdAt)}</span>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink-800">{n.body}</p>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ===== VITALS =====
const VITAL_FIELDS = [
  { k: 'temperature', label: 'Temp °F' },
  { k: 'pulse', label: 'Pulse' },
  { k: 'respiratoryRate', label: 'Resp rate' },
  { k: 'spo2', label: 'SpO₂ %' },
  { k: 'bpSystolic', label: 'BP sys' },
  { k: 'bpDiastolic', label: 'BP dia' },
  { k: 'bloodSugar', label: 'Blood sugar' },
  { k: 'painScore', label: 'Pain (0-10)' },
  { k: 'gcs', label: 'GCS (3-15)' },
];

function Sparkline({ points, invert }) {
  const vals = points.filter((v) => typeof v === 'number' && !Number.isNaN(v));
  if (vals.length < 2) return <span className="text-[10px] text-ink-300">not enough data</span>;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const w = 120;
  const h = 28;
  const step = w / (points.length - 1);
  const path = points
    .map((v, i) => (typeof v === 'number' && !Number.isNaN(v) ? `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(h - ((v - min) / span) * h).toFixed(1)}` : null))
    .filter(Boolean)
    .join(' ');
  return (
    <svg width={w} height={h} className="overflow-visible" style={{ transform: invert ? 'scaleY(-1)' : 'none' }}>
      <path d={path} fill="none" stroke="#2563eb" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function VitalsTab({ d, onChanged }) {
  const vitals = d.vitals || [];
  const trend = [...vitals].reverse();

  return (
    <div className="space-y-4">
      <Section title="Latest vitals vs trend" right={<span className="text-[11px] text-ink-400">{vitals.length} readings</span>}>
        {!vitals.length ? (
          <EmptyState title="No vitals recorded" hint="Record the first set below" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {VITAL_FIELDS.map((f) => {
                const latest = vitals.find((v) => v[f.k] != null);
                const flagged = latest?.flags?.flags?.find((x) => x.startsWith(`${f.k}:`));
                const level = flagged?.split(':')[1];
                return (
                  <div key={f.k} className={cn('rounded-xl border px-3 py-2', level === 'CRITICAL' ? 'border-red-300 bg-red-50' : level === 'ABNORMAL' ? 'border-amber-300 bg-amber-50' : 'border-ink-100 bg-white')}>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{f.label}</div>
                    <div className="text-lg font-extrabold text-ink-900">{latest?.[f.k] ?? '—'}</div>
                    <Sparkline points={trend.map((v) => v[f.k])} invert={f.k === 'spo2' || f.k === 'gcs'} />
                    {level && <div className={cn('text-[10px] font-bold uppercase', level === 'CRITICAL' ? 'text-red-600' : 'text-amber-600')}>{level}</div>}
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[10px] text-ink-400">Charts show the last {trend.length} readings, oldest → newest. Red/amber tiles mean out-of-range values.</p>
          </>
        )}
      </Section>

      <MedicalList
        title="Vital recordings"
        items={vitals}
        mutationFn={(p) => api.post(`/ipd/admissions/${d.admission._id}/vitals`, p)}
        onChanged={onChanged}
        empty="No vitals recorded yet"
        render={(v) => (
          <div key={v._id} className="rounded-xl border border-ink-100 px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="font-mono text-ink-400">{formatDateTime(v.recordedAt)}</span>
              <span><b className="text-ink-900">{v.temperature ?? '—'}°F</b> <span className="text-ink-400">temp</span></span>
              <span><b className="text-ink-900">{v.bpSystolic ?? '—'}/{v.bpDiastolic ?? '—'}</b> <span className="text-ink-400">BP</span></span>
              <span><b className="text-ink-900">{v.pulse ?? '—'}</b> <span className="text-ink-400">pulse</span></span>
              <span><b className="text-ink-900">{v.respiratoryRate ?? '—'}</b> <span className="text-ink-400">RR</span></span>
              <span><b className="text-ink-900">{v.spo2 ?? '—'}%</b> <span className="text-ink-400">SpO₂</span></span>
              {v.gcs != null && <span><b className="text-ink-900">{v.gcs}</b> <span className="text-ink-400">GCS</span></span>}
              {v.bloodSugar != null && <span><b className="text-ink-900">{v.bloodSugar}</b> <span className="text-ink-400">sugar</span></span>}
              {v.bmi != null && <span><b className="text-ink-900">{v.bmi}</b> <span className="text-ink-400">BMI</span></span>}
              {v.painScore != null && <span><b className="text-ink-900">{v.painScore}/10</b> <span className="text-ink-400">pain</span></span>}
              {v.weightKg != null && <span><b className="text-ink-900">{v.weightKg}kg</b></span>}
              <span className="text-[10px] uppercase text-ink-400">{v.source}</span>
              {v.recordedBy?.name && <span className="text-[10px] text-ink-400">by {v.recordedBy.name}</span>}
              {(v.flags?.flags || []).map((f) => {
                const [k, lvl] = f.split(':');
                return (
                  <span key={f} className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold uppercase', lvl === 'CRITICAL' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')}>
                    {k} {lvl}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      >
        {(form, set) => (
          <>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {VITAL_FIELDS.map((f) => <NumInput key={f.k} label={f.label} k={f.k} form={form} set={set} />)}
              <NumInput label="Height cm" k="heightCm" form={form} set={set} />
              <NumInput label="Weight kg" k="weightKg" form={form} set={set} />
              <div><label className="label">Notes</label><input className="input" value={form.notes || ''} onChange={set('notes')} /></div>
            </div>
            <p className="mt-1 text-[10px] text-ink-400">BMI is calculated automatically from height & weight. Out-of-range values are flagged; critical values raise a banner.</p>
            <button className="btn-primary mt-2 text-xs" onClick={() => set('__save')()}>Save vitals</button>
          </>
        )}
      </MedicalList>
    </div>
  );
}

// ===== NURSING =====
const NURSING_TYPES = [
  'DAILY_PROGRESS', 'NURSING_NOTE', 'PATIENT_OBSERVATION', 'PAIN_ASSESSMENT', 'FALL_RISK', 'PRESSURE_SORE_RISK',
  'HYGIENE', 'MOBILITY', 'FEEDING', 'SLEEP', 'ELIMINATION', 'SPECIAL_INSTRUCTIONS', 'HANDOVER', 'CARE_PLAN', 'TASK',
];
const NURSING_STATUS = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED'];

function NursingTab({ d, onChanged }) {
  return (
    <MedicalList
      title="Nursing notes, assessments & task list"
      items={d.nursingNotes || []}
      mutationFn={(p) => api.post(`/ipd/admissions/${d.admission._id}/nursing-notes`, p)}
      onChanged={onChanged}
      empty="No nursing records yet"
      render={(n) => (
        <div key={n._id} className="space-y-1 rounded-xl border border-ink-100 px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-violet-700 ring-1 ring-inset ring-violet-200">{n.shift} · {n.noteType.replace(/_/g, ' ')}</span>
            {n.status && n.status !== 'COMPLETED' && (
              <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ring-1 ring-inset', {
                'bg-amber-50 text-amber-700 ring-amber-200': n.status === 'PENDING',
                'bg-sky-50 text-sky-700 ring-sky-200': n.status === 'IN_PROGRESS',
                'bg-ink-100 text-ink-600 ring-ink-200': n.status === 'SKIPPED',
              })}>{n.status}</span>
            )}
            <span className="text-[11px] text-ink-400">{n.recordedBy?.name || '—'} · {formatDateTime(n.recordedAt)}</span>
            {n.taskDueAt && <span className="text-[10px] text-ink-400">due {formatDateTime(n.taskDueAt)}</span>}
          </div>
          <p className="whitespace-pre-wrap text-ink-800">{n.note}</p>
          {(n.vitals?.temperature || n.intakeOutput) && (
            <div className="flex flex-wrap gap-x-3 text-[11px] text-ink-500">
              {n.vitals?.temperature && <span>Temp {n.vitals.temperature}°F</span>}
              {n.vitals?.pulse && <span>Pulse {n.vitals.pulse}</span>}
              {n.vitals?.spo2 && <span>SpO₂ {n.vitals.spo2}%</span>}
              {n.intakeOutput?.intakeMl != null && <span>Intake {n.intakeOutput.intakeMl}ml</span>}
              {n.intakeOutput?.outputMl != null && <span>Output {n.intakeOutput.outputMl}ml</span>}
            </div>
          )}
        </div>
      )}
    >
      {(form, set) => (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <div>
              <label className="label">Shift</label>
              <select className="select" value={form.shift || 'MORNING'} onChange={set('shift')}>
                {['MORNING', 'EVENING', 'NIGHT'].map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Type</label>
              <select className="select" value={form.noteType || 'NURSING_NOTE'} onChange={set('noteType')}>
                {NURSING_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="select" value={form.status || 'COMPLETED'} onChange={set('status')}>
                {NURSING_STATUS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div><label className="label">Intake ml</label><input className="input" value={form.intakeMl || ''} onChange={set('intakeMl')} /></div>
            <div><label className="label">Output ml</label><input className="input" value={form.outputMl || ''} onChange={set('outputMl')} /></div>
          </div>
          <div className="mt-2"><label className="label">Note *</label><textarea className="input" rows={2} value={form.note || ''} onChange={set('note')} /></div>
          <button className="btn-primary mt-2 text-xs" onClick={() => set('__save')()}>Save nursing record</button>
        </>
      )}
    </MedicalList>
  );
}

// ===== DOCTOR VISITS =====
const VISIT_TYPES = ['ROUND', 'PROGRESS_NOTE', 'EMERGENCY', 'SPECIALIST', 'CONSULTATION'];

function DoctorVisitsTab({ d, onChanged }) {
  const doctors = useQuery({
    queryKey: ['masters-doctors'],
    queryFn: async () => (await api.get('/masters/doctors')).data.data,
  });
  const [form, setForm] = useState({});
  const [open, setOpen] = useState(false);

  const create = useMutation({
    mutationFn: async (p) => (await api.post(`/ipd/admissions/${d.admission._id}/doctor-visits`, p)).data.data,
    onSuccess: () => { setForm({}); setOpen(false); toast.success('Doctor visit recorded'); onChanged(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Section
      title="Doctor rounds & visits"
      right={
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-ink-400">{d.doctorVisits?.length || 0} visits</span>
          <button className="btn-secondary text-xs" onClick={() => setOpen((o) => !o)}>{open ? 'Close' : '+ New visit'}</button>
        </div>
      }
    >
      {open && (
        <div className="mb-4 grid grid-cols-1 gap-2 rounded-xl border border-ink-200 bg-ink-50/60 p-3 sm:grid-cols-3">
          <div>
            <label className="label">Visit type</label>
            <select className="select" value={form.visitType || 'ROUND'} onChange={set('visitType')}>{VISIT_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
          </div>
          <div>
            <label className="label">Doctor</label>
            <select className="select" value={form.doctorId || ''} onChange={set('doctorId')}>
              <option value="">Consultant (default)</option>
              {(doctors.data || []).map((doc) => <option key={doc._id} value={doc._id}>{doc.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Date & time</label>
            <input type="datetime-local" className="input" value={form.visitDateLocal || ''} onChange={set('visitDateLocal')} />
          </div>
          <div className="sm:col-span-3"><label className="label">Clinical notes</label><textarea className="input" rows={2} value={form.clinicalNotes || ''} onChange={set('clinicalNotes')} /></div>
          <div className="sm:col-span-3"><label className="label">Examination</label><textarea className="input" rows={2} value={form.examination || ''} onChange={set('examination')} /></div>
          <div><label className="label">Assessment</label><textarea className="input" rows={2} value={form.assessment || ''} onChange={set('assessment')} /></div>
          <div><label className="label">Diagnosis</label><textarea className="input" rows={2} value={form.diagnosis || ''} onChange={set('diagnosis')} /></div>
          <div><label className="label">Plan</label><textarea className="input" rows={2} value={form.plan || ''} onChange={set('plan')} /></div>
          <button
            className="btn-primary self-end text-xs"
            disabled={create.isPending || !(form.clinicalNotes || form.diagnosis || form.assessment)}
            onClick={() => create.mutate({ ...form, visitDate: form.visitDateLocal ? new Date(form.visitDateLocal).toISOString() : undefined })}
          >
            {create.isPending ? <Spinner className="h-4 w-4 text-white" /> : 'Save visit'}
          </button>
        </div>
      )}

      {!d.doctorVisits?.length ? (
        <EmptyState title="No doctor visits" hint="Every round is stored as a separate clinical record" />
      ) : (
        <div className="space-y-2.5">
          {d.doctorVisits.map((v) => (
            <div key={v._id} className="rounded-xl border border-ink-100 p-3">
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="font-mono text-brand-700">{v.visitNumber}</span>
                <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-700 ring-1 ring-inset ring-emerald-200">{v.visitType.replace(/_/g, ' ')}</span>
                <span className="text-ink-500">{v.doctorId?.name || '—'}{v.specialty ? ` · ${v.specialty}` : v.departmentId?.name ? ` · ${v.departmentId.name}` : ''}</span>
                <span className="text-ink-400">{formatDateTime(v.visitDate)}</span>
              </div>
              <div className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                {v.clinicalNotes && <div><span className="font-semibold text-ink-500">Notes:</span> <span className="text-ink-800">{v.clinicalNotes}</span></div>}
                {v.examination && <div><span className="font-semibold text-ink-500">Examination:</span> <span className="text-ink-800">{v.examination}</span></div>}
                {v.assessment && <div><span className="font-semibold text-ink-500">Assessment:</span> <span className="text-ink-800">{v.assessment}</span></div>}
                {v.diagnosis && <div><span className="font-semibold text-ink-500">Diagnosis:</span> <span className="text-ink-800">{v.diagnosis}</span></div>}
                {v.plan && <div className="sm:col-span-2"><span className="font-semibold text-ink-500">Plan:</span> <span className="text-ink-800">{v.plan}</span></div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ===== ORDERS (all) =====
const ORDER_CATEGORIES = ['LAB', 'RADIOLOGY', 'PROCEDURE', 'MEDICATION', 'DIET', 'NURSING_INSTRUCTION', 'PHYSIOTHERAPY', 'BLOOD_REQUEST', 'SPECIALIST_REFERRAL', 'OTHER'];
const ORDER_STATUSES = ['ORDERED', 'ACKNOWLEDGED', 'SCHEDULED', 'COLLECTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REJECTED'];

function OrderRow({ o, onChanged, compact }) {
  const statusChange = useMutation({
    mutationFn: async (status) => (await api.patch(`/ipd/orders/${o._id}/status`, { status })).data.data,
    onSuccess: () => { toast.success('Order status updated'); onChanged(); },
    onError: (e) => toast.error(apiError(e)),
  });
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-100 px-3 py-2 text-xs">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-brand-700">{o.orderNumber}</span>
          <span className="font-semibold text-ink-900">{o.name}</span>
          {!compact && <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold text-ink-500">{o.category.replace(/_/g, ' ')}</span>}
          {badge(o.priority)}
          {badge(o.status)}
        </div>
        <div className="mt-0.5 text-[11px] text-ink-400">
          {o.orderedBy?.name || '—'} · {formatDateTime(o.orderedAt)}{o.instructions ? ` · ${o.instructions}` : ''}
        </div>
      </div>
      <select
        className="select w-40 py-1 text-[11px]"
        value={o.status}
        disabled={statusChange.isPending}
        onChange={(e) => statusChange.mutate(e.target.value)}
      >
        {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  );
}

function OrdersTab({ d, onChanged }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('LAB');
  const [priority, setPriority] = useState('ROUTINE');
  const [instructions, setInstructions] = useState('');
  const create = useMutation({
    mutationFn: async (p) => (await api.post(`/ipd/admissions/${d.admission._id}/orders`, p)).data.data,
    onSuccess: () => { setName(''); setInstructions(''); toast.success('Order created'); onChanged(); },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <Section
      title="All clinical orders"
      right={<span className="text-[11px] text-ink-400">{d.orders?.length || 0} orders</span>}
    >
      <div className="rounded-xl border border-ink-200 p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
          <input className="input sm:col-span-2 text-sm" placeholder="Order name (e.g. Serum Electrolytes) *" value={name} onChange={(e) => setName(e.target.value)} />
          <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
            {ORDER_CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
          </select>
          <select className="select" value={priority} onChange={(e) => setPriority(e.target.value)}>
            {['ROUTINE', 'URGENT', 'STAT'].map((p) => <option key={p}>{p}</option>)}
          </select>
          <button className="btn-primary text-xs" disabled={!name.trim() || create.isPending} onClick={() => create.mutate({ name, category, priority, instructions: instructions || undefined })}>
            {create.isPending ? <Spinner className="h-4 w-4 text-white" /> : 'Create order'}
          </button>
        </div>
        <input className="input mt-2 text-xs" placeholder="Instructions (optional)" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {ORDER_CATEGORIES.filter((c) => d.orderCounts?.[c]).map((c) => (
          <span key={c} className="rounded-lg bg-ink-50 px-2 py-1 text-[10px] font-semibold text-ink-600">
            {c.replace(/_/g, ' ')} <b className="text-ink-900">{d.orderCounts[c]}</b>
          </span>
        ))}
      </div>

      {!d.orders?.length ? (
        <div className="mt-3"><EmptyState title="No orders" hint="Create a lab, radiology or procedure order above" /></div>
      ) : (
        <div className="mt-3 space-y-2">
          {d.orders.map((o) => <OrderRow key={o._id} o={o} onChanged={onChanged} />)}
        </div>
      )}
    </Section>
  );
}

// ============================================================
// 16. MAR — Medication Administration Record
// ============================================================
const MAR_STATUSES = ['SCHEDULED', 'GIVEN', 'MISSED', 'HELD', 'REFUSED', 'CANCELLED'];
const MAR_ACTIONS = ['GIVEN', 'MISSED', 'HELD', 'REFUSED'];
const FREQ_LABEL = { OD: 'Once daily', BD: 'Twice daily', TDS: 'Three times daily', QID: 'Four times daily', HS: 'At bedtime', STAT: 'Stat', PRN: 'As needed' };

const marStatusStyle = (s) => ({
  'bg-emerald-50 text-emerald-700 ring-emerald-200': s === 'GIVEN',
  'bg-amber-50 text-amber-700 ring-amber-200': s === 'SCHEDULED',
  'bg-orange-50 text-orange-700 ring-orange-200': s === 'MISSED' || s === 'HELD',
  'bg-red-50 text-red-600 ring-red-200': s === 'REFUSED' || s === 'CANCELLED',
});

function MarTab({ d, onChanged }) {
  const [remark, setRemark] = useState({});
  const rows = d.workflow?.mar || [];
  const charts = d.medications || [];

  const schedule = useMutation({
    mutationFn: async ({ chartId, frequency }) => (await api.post(`/ipd/medication-charts/${chartId}/schedule`, { frequency })).data.data,
    onSuccess: () => { toast.success('MAR slots scheduled'); onChanged(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const record = useMutation({
    mutationFn: async ({ chartId, administrationId, status }) =>
      (await api.patch(`/ipd/medication-charts/${chartId}/administrations/${administrationId}`, { status, remark: remark[administrationId] || undefined })).data.data,
    onSuccess: () => { toast.success('Administration recorded by nurse'); onChanged(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const unscheduled = charts.filter((c) => !(c.administrations || []).length);

  return (
    <div className="space-y-4">
      <Section title="MAR — schedule administration slots" right={<span className="text-[11px] text-ink-400">{rows.length} MAR rows</span>}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {charts.map((c) => {
            const count = (c.administrations || []).length;
            return (
              <div key={c._id} className="flex items-center justify-between gap-2 rounded-xl border border-ink-100 px-3 py-2 text-xs">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-ink-900">{c.medicineName} {c.strength || ''}</div>
                  <div className="text-[10px] text-ink-400">{c.dosage} · {c.route} · {FREQ_LABEL[String(c.frequency || '').toUpperCase()] || c.frequency} · {count} slots</div>
                </div>
                <button
                  className="btn-secondary shrink-0 text-[11px]"
                  disabled={schedule.isPending}
                  onClick={() => schedule.mutate({ chartId: c._id, frequency: c.frequency })}
                >
                  {count ? '+ Slots' : 'Schedule'}
                </button>
              </div>
            );
          })}
        </div>
        {!charts.length && <EmptyState title="No medications charted" hint="Chart medicines in the Medications tab first" />}
        {unscheduled.length > 0 && (
          <p className="mt-2 text-[10px] text-amber-600">{unscheduled.length} medicine(s) have no MAR slots — a nurse must schedule and record each dose; nothing is marked given automatically.</p>
        )}
      </Section>

      <Section title="Medication administration record">
        {!rows.length ? (
          <EmptyState title="No MAR rows" hint="Schedule administration slots to build the MAR" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-xs">
              <thead className="border-b border-ink-200 text-[10px] uppercase tracking-wide text-ink-400">
                <tr>
                  <th className="py-2 pr-3">Medicine</th>
                  <th className="py-2 pr-3">Dose</th>
                  <th className="py-2 pr-3">Route</th>
                  <th className="py-2 pr-3">Frequency</th>
                  <th className="py-2 pr-3">Scheduled</th>
                  <th className="py-2 pr-3">Administered</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Nurse</th>
                  <th className="py-2 pr-3">Remarks</th>
                  <th className="py-2">Record</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.administrationId} className="border-b border-ink-50">
                    <td className="py-2 pr-3">
                      <div className="font-semibold text-ink-900">{r.medicineName}</div>
                      <div className="text-[10px] text-ink-400">{r.genericName}{r.strength ? ` · ${r.strength}` : ''}</div>
                    </td>
                    <td className="py-2 pr-3">{r.dosage || '—'}</td>
                    <td className="py-2 pr-3">{r.route || '—'}</td>
                    <td className="py-2 pr-3">{r.frequency || '—'}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{r.scheduledTime ? formatDateTime(r.scheduledTime) : '—'}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{r.administeredTime ? formatDateTime(r.administeredTime) : '—'}</td>
                    <td className="py-2 pr-3">
                      <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold ring-1 ring-inset', marStatusStyle[r.status] || 'bg-ink-50 text-ink-600 ring-ink-200')}>{r.status}</span>
                    </td>
                    <td className="py-2 pr-3">{r.nurse || '—'}</td>
                    <td className="py-2 pr-3">
                      {r.remarks || <input className="input w-28 py-0.5 text-[11px]" placeholder="remark" value={remark[r.administrationId] || ''} onChange={(e) => setRemark((x) => ({ ...x, [r.administrationId]: e.target.value }))} />}
                    </td>
                    <td className="py-2">
                      {r.status === 'SCHEDULED' ? (
                        <select
                          className="select w-32 py-1 text-[11px]"
                          value=""
                          disabled={record.isPending}
                          onChange={(e) => e.target.value && record.mutate({ chartId: r.chartId, administrationId: r.administrationId, status: e.target.value })}
                        >
                          <option value="">Record…</option>
                          {MAR_ACTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : (
                        <span className="text-[10px] text-ink-400">recorded</span>
                      )}
                    </td>
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

// ============================================================
// 17. Pharmacy integration
// ============================================================
const PHARMACY_FLOW = ['REQUESTED', 'VERIFIED', 'DISPENSED', 'PARTIAL', 'RETURNED', 'CANCELLED'];

function PharmacyTab({ d, onChanged }) {
  const medicines = useQuery({ queryKey: ['pharmacy-medicines'], queryFn: async () => (await api.get('/pharmacy/medicines', { params: { limit: 100 } })).data.data });
  const [medicineId, setMedicineId] = useState('');
  const [qty, setQty] = useState(10);
  const requests = d.workflow?.pharmacyRequests || [];

  const create = useMutation({
    mutationFn: async () => (await api.post(`/ipd/admissions/${d.admission._id}/pharmacy-requests`, { medicineId, quantityRequested: Number(qty) })).data.data,
    onSuccess: () => { toast.success('Pharmacy request raised'); setMedicineId(''); onChanged(); },
    onError: (e) => toast.error(apiError(e)),
  });
  const act = useMutation({
    mutationFn: async ({ requestId, action, body }) => (await api.patch(`/ipd/pharmacy-requests/${requestId}/${action}`, body || {})).data.data,
    onSuccess: (_, v) => { toast.success(`Pharmacy request ${v.action}`); onChanged(); },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <Section
      title="IP pharmacy requests & ward issue"
      right={<span className="text-[11px] text-ink-400">{requests.length} requests</span>}
    >
      <div className="rounded-xl border border-ink-200 p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <select className="select sm:col-span-2" value={medicineId} onChange={(e) => setMedicineId(e.target.value)}>
            <option value="">Select medicine…</option>
            {(medicines.data || []).map((m) => <option key={m._id} value={m._id}>{m.name} {m.genericName ? `(${m.genericName})` : ''}</option>)}
          </select>
          <input className="input" type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} />
          <button className="btn-primary text-xs" disabled={!medicineId || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? <Spinner className="h-4 w-4 text-white" /> : 'Raise request'}
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {!requests.length ? (
          <EmptyState title="No pharmacy requests" hint="Raise a request to dispense ward medicine" />
        ) : requests.map((r) => (
          <div key={r._id} className="rounded-xl border border-ink-100 px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-mono text-brand-700">{r.requestNumber}</span>
                <span className="ml-2 font-semibold text-ink-900">{r.medicineName}</span>
                {badge(r.status)}
                <div className="text-[11px] text-ink-400">
                  Requested {r.quantityRequested} · dispensed {r.quantityDispensed} · returned {r.quantityReturned} · wastage {r.wastageQuantity} · stock {r.availableStock}
                  {r.requestedBy?.name ? ` · by ${r.requestedBy.name}` : ''}
                </div>
                {(r.batches || []).length > 0 && (
                  <div className="text-[11px] text-ink-500">
                    Batches: {r.batches.map((b) => `${b.batchNumber} × ${b.quantity} (exp ${b.expiryDate ? formatDate(b.expiryDate) : '—'})`).join(', ')}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {r.status === 'REQUESTED' && (
                  <button className="btn-secondary text-[11px]" onClick={() => act.mutate({ requestId: r._id, action: 'verify' })}>Verify stock</button>
                )}
                {['VERIFIED', 'PARTIAL'].includes(r.status) && (
                  <>
                    <button className="btn-primary text-[11px]" onClick={() => act.mutate({ requestId: r._id, action: 'dispense' })}>Dispense (FEFO)</button>
                    <button
                      className="btn-secondary text-[11px]"
                      onClick={() => {
                        const q = window.prompt('Return quantity', '1');
                        const w = window.prompt('Wastage quantity (optional)', '0');
                        if (q === null) return;
                        act.mutate({ requestId: r._id, action: 'return', body: { quantity: Number(q), wastageQuantity: Number(w || 0) } });
                      }}
                    >
                      Return
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {PHARMACY_FLOW.map((s) => (
                <span key={s} className={cn('rounded px-1.5 py-0.5 text-[9px] font-bold uppercase', s === r.status ? 'bg-brand-600 text-white' : 'bg-ink-50 text-ink-400')}>{s}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ============================================================
// 18. Lab integration
// ============================================================
const LAB_FLOW = ['ORDERED', 'BILLED', 'SAMPLE_COLLECTED', 'PROCESSING', 'RESULT_READY', 'VERIFIED', 'CANCELLED'];

function LabTab({ d, onChanged }) {
  const tests = useQuery({ queryKey: ['lab-tests'], queryFn: async () => (await api.get('/lab/tests', { params: { limit: 100 } })).data.data });
  const [picked, setPicked] = useState([]);
  const [priority, setPriority] = useState('ROUTINE');
  const lab = d.workflow?.labOrders || { orders: [], results: [] };

  const create = useMutation({
    mutationFn: async () => (await api.post(`/ipd/admissions/${d.admission._id}/lab-orders`, { items: picked.map((id) => ({ labTestId: id })), priority })).data.data,
    onSuccess: () => { toast.success('Lab order created'); setPicked([]); onChanged(); },
    onError: (e) => toast.error(apiError(e)),
  });
  const flagCritical = useMutation({
    mutationFn: async (resultId) => (await api.patch(`/ipd/lab-results/${resultId}/critical`, { comments: 'Flagged as critical from IPD workspace' })).data.data,
    onSuccess: () => { toast.success('Critical alert sent to doctor, nurse & lab'); onChanged(); },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <div className="space-y-4">
      <Section title="Order lab investigations" right={<span className="text-[11px] text-ink-400">{lab.orders?.length || 0} lab orders</span>}>
        <div className="rounded-xl border border-ink-200 p-3">
          <div className="mb-2 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
            {(tests.data || []).map((t) => {
              const on = picked.includes(t._id);
              return (
                <button
                  key={t._id}
                  type="button"
                  onClick={() => setPicked((p) => (on ? p.filter((x) => x !== t._id) : [...p, t._id]))}
                  className={cn('rounded-lg px-2 py-1 text-[11px] font-semibold ring-1 ring-inset transition', on ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-ink-600 ring-ink-200 hover:bg-ink-50')}
                >
                  {t.name} <span className="opacity-60">₹{t.price || 0}</span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select className="select w-36" value={priority} onChange={(e) => setPriority(e.target.value)}>
              {['ROUTINE', 'URGENT', 'STAT'].map((p) => <option key={p}>{p}</option>)}
            </select>
            <button className="btn-primary text-xs" disabled={!picked.length || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? <Spinner className="h-4 w-4 text-white" /> : `Order ${picked.length || ''} test(s)`}
            </button>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {!lab.orders?.length ? <EmptyState title="No lab orders" hint="Select tests above to raise a lab order" /> : lab.orders.map((o) => (
            <div key={o._id} className="rounded-xl border border-ink-100 px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono text-brand-700">{o.labOrderNumber}</span>
                  {badge(o.status)}{badge(o.priority)}
                  {o.isCritical && <span className="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">CRITICAL</span>}
                  <div className="mt-0.5 text-[11px] text-ink-400">
                    {(o.items || []).map((i) => `${i.testName} (${i.status})`).join(' · ')}
                    {o.orderedBy?.name ? ` · ${o.orderedBy.name}` : ''} · {formatDateTime(o.orderedAt)}
                  </div>
                </div>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {LAB_FLOW.map((s) => (
                  <span key={s} className={cn('rounded px-1.5 py-0.5 text-[9px] font-bold uppercase', o.status === s ? 'bg-brand-600 text-white' : 'bg-ink-50 text-ink-400')}>{s.replace(/_/g, ' ')}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Results & critical alerts" right={<span className="text-[11px] text-ink-400">{lab.results?.length || 0} results</span>}>
        {!lab.results?.length ? (
          <EmptyState title="No results yet" hint="Results appear once the lab enters and verifies them" />
        ) : (
          <div className="space-y-2">
            {lab.results.map((r) => (
        <div key={r._id} className={cn('rounded-xl border px-3 py-2 text-xs', r.isCritical ? 'border-red-300 bg-red-50' : r.releasedToDoctor ? 'border-ink-100' : 'border-amber-200 bg-amber-50')}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-semibold text-ink-900">{r.testName}</span>
              {badge(r.status)}
              {r.isCritical && <span className="ml-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">CRITICAL VALUE</span>}
              {!r.releasedToDoctor && (
                <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                  Awaiting lab verification
                </span>
              )}
              <div className="text-[11px] text-ink-400">
                {r.verifiedBy?.name ? `Verified by ${r.verifiedBy.name}` : 'Not verified'}
                {r.enteredAt ? ` · ${formatDateTime(r.enteredAt)}` : ''}
              </div>
                  </div>
                  {!r.isCritical && (
                    <button className="btn-danger text-[11px]" disabled={flagCritical.isPending} onClick={() => flagCritical.mutate(r._id)}>
                      Flag critical & alert
                    </button>
                  )}
                </div>
                {(r.values || []).length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-2 text-[11px]">
                    {r.values.map((v, i) => (
                      <span key={i} className={cn('rounded px-1.5 py-0.5 ring-1 ring-inset', v.flag === 'NORMAL' ? 'bg-ink-50 text-ink-600 ring-ink-200' : 'bg-red-50 text-red-700 ring-red-200')}>
                        {v.parameter}: {v.value} {v.unit} {v.flag !== 'NORMAL' ? `(${v.flag})` : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ============================================================
// 19. Radiology integration
// ============================================================
const RAD_FLOW = ['ORDERED', 'SCHEDULED', 'IN_PROGRESS', 'REPORTING', 'VERIFIED', 'COMPLETED', 'CANCELLED'];
const MODALITIES = ['X_RAY', 'CT', 'MRI', 'ULTRASOUND', 'MAMMOGRAPHY', 'FLUOROSCOPY', 'PET', 'OTHER'];

function RadiologyTab({ d, onChanged }) {
  const tests = useQuery({ queryKey: ['radiology-tests'], queryFn: async () => (await api.get('/radiology/tests', { params: { limit: 100 } })).data.data });
  const [picked, setPicked] = useState([]);
  const [reportFor, setReportFor] = useState(null);
  const [report, setReport] = useState({});
  const rad = d.workflow?.radiologyOrders || { orders: [], reports: [] };

  const create = useMutation({
    mutationFn: async () => (await api.post(`/ipd/admissions/${d.admission._id}/radiology-orders`, { tests: picked.map((id) => ({ radiologyTestId: id })) })).data.data,
    onSuccess: () => { toast.success('Imaging order created'); setPicked([]); onChanged(); },
    onError: (e) => toast.error(apiError(e)),
  });
  const step = useMutation({
    mutationFn: async ({ orderId, body }) => (await api.patch(`/ipd/radiology-orders/${orderId}`, body)).data.data,
    onSuccess: () => { toast.success('Imaging order updated'); onChanged(); },
    onError: (e) => toast.error(apiError(e)),
  });
  const saveReport = useMutation({
    mutationFn: async () => (await api.post('/ipd/radiology-reports', {
      radiologyOrderId: reportFor._id,
      findings: report.findings,
      impression: report.impression,
      docReferences: (report.pacs || '').split(',').map((s) => s.trim()).filter(Boolean),
      images: (report.images || '').split(',').map((s) => s.trim()).filter(Boolean),
    })).data.data,
    onSuccess: () => { toast.success('Report entered'); setReportFor(null); setReport({}); onChanged(); },
    onError: (e) => toast.error(apiError(e)),
  });
  const verify = useMutation({
    mutationFn: async (reportId) => (await api.patch(`/ipd/radiology-reports/${reportId}/verify`)).data.data,
    onSuccess: () => { toast.success('Report verified & released for doctor review'); onChanged(); },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <div className="space-y-4">
      <Section title="Order imaging (X-Ray / USG / CT / MRI)" right={<span className="text-[11px] text-ink-400">{rad.orders?.length || 0} imaging orders</span>}>
        <div className="rounded-xl border border-ink-200 p-3">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {(tests.data || []).map((t) => {
              const on = picked.includes(t._id);
              return (
                <button
                  key={t._id}
                  type="button"
                  onClick={() => setPicked((p) => (on ? p.filter((x) => x !== t._id) : [...p, t._id]))}
                  className={cn('rounded-lg px-2 py-1 text-[11px] font-semibold ring-1 ring-inset transition', on ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-ink-600 ring-ink-200 hover:bg-ink-50')}
                >
                  {t.name} <span className="opacity-60">{t.modality?.replace(/_/g, ' ')}</span>
                </button>
              );
            })}
          </div>
          <button className="btn-primary text-xs" disabled={!picked.length || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? <Spinner className="h-4 w-4 text-white" /> : `Order ${picked.length || ''} study(ies)`}
          </button>
        </div>

        <div className="mt-3 space-y-2">
          {!rad.orders?.length ? <EmptyState title="No imaging orders" hint="Select a study above" /> : rad.orders.map((o) => (
            <div key={o._id} className="rounded-xl border border-ink-100 px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono text-brand-700">{o.radiologyOrderNumber}</span>
                  {badge(o.status)}
                  <div className="mt-0.5 text-[11px] text-ink-400">
                    {(o.tests || []).map((t) => `${t.testName} [${t.modality}]`).join(' · ')}
                    {o.orderedBy?.name ? ` · ${o.orderedBy.name}` : ''}
                    {o.tests?.[0]?.scheduledAt ? ` · slot ${formatDateTime(o.tests[0].scheduledAt)}` : ''}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {o.status === 'ORDERED' && (
                    <button className="btn-secondary text-[11px]" onClick={() => step.mutate({ orderId: o._id, body: { status: 'SCHEDULED', scheduledAt: new Date(Date.now() + 3600000).toISOString() } })}>Schedule</button>
                  )}
                  {['ORDERED', 'SCHEDULED'].includes(o.status) && (
                    <button className="btn-secondary text-[11px]" onClick={() => step.mutate({ orderId: o._id, body: { status: 'IN_PROGRESS', scannedAt: new Date().toISOString() } })}>Mark scanned</button>
                  )}
                  {['IN_PROGRESS', 'REPORTING'].includes(o.status) && (
                    <button className="btn-primary text-[11px]" onClick={() => { setReportFor(o); setReport({}); }}>Enter report</button>
                  )}
                </div>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {RAD_FLOW.map((s) => (
                  <span key={s} className={cn('rounded px-1.5 py-0.5 text-[9px] font-bold uppercase', o.status === s ? 'bg-brand-600 text-white' : 'bg-ink-50 text-ink-400')}>{s}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Imaging reports & PACS references" right={<span className="text-[11px] text-ink-400">{rad.reports?.length || 0} reports</span>}>
        {!rad.reports?.length ? (
          <EmptyState title="No reports" hint="Reports entered by the radiologist appear here" />
        ) : (
          <div className="space-y-2">
            {rad.reports.map((r) => (
              <div key={r._id} className="rounded-xl border border-ink-100 px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold text-ink-900">{r.testName || 'Imaging'}</span>
                    {badge(r.status)}
                    <div className="mt-0.5 text-[11px] text-ink-400">
                      {r.radiologistId?.name ? `Radiologist ${r.radiologistId.name}` : ''}{r.verifiedBy?.name ? ` · verified by ${r.verifiedBy.name}` : ''}
                    </div>
                  </div>
                  {r.status !== 'VERIFIED' && (
                    <button className="btn-secondary text-[11px]" onClick={() => verify.mutate(r._id)}>Verify & release</button>
                  )}
                </div>
                {r.findings && <div className="mt-1"><b className="text-ink-500">Findings:</b> {r.findings}</div>}
                {r.impression && <div><b className="text-ink-500">Impression:</b> {r.impression}</div>}
                {(r.docReferences || []).length > 0 && <div className="text-[11px] text-ink-500">PACS: {r.docReferences.join(', ')}</div>}
                {(r.images || []).length > 0 && <div className="text-[11px] text-ink-500">Images: {r.images.length} reference(s)</div>}
              </div>
            ))}
          </div>
        )}
      </Section>

      {reportFor && (
        <Modal title="Enter imaging report" subtitle={reportFor.radiologyOrderNumber} onClose={() => setReportFor(null)}>
          <div className="space-y-2">
            <div><label className="label">Findings</label><textarea className="input" rows={3} value={report.findings || ''} onChange={(e) => setReport((x) => ({ ...x, findings: e.target.value }))} /></div>
            <div><label className="label">Impression</label><textarea className="input" rows={2} value={report.impression || ''} onChange={(e) => setReport((x) => ({ ...x, impression: e.target.value }))} /></div>
            <div><label className="label">PACS / DICOM references (comma separated)</label><input className="input" placeholder="PACS://study/123, DICOM://image/1" value={report.pacs || ''} onChange={(e) => setReport((x) => ({ ...x, pacs: e.target.value }))} /></div>
            <div><label className="label">Image references (comma separated)</label><input className="input" value={report.images || ''} onChange={(e) => setReport((x) => ({ ...x, images: e.target.value }))} /></div>
            <button className="btn-primary w-full text-xs" disabled={saveReport.isPending || !report.findings} onClick={() => saveReport.mutate()}>
              {saveReport.isPending ? <Spinner className="h-4 w-4 text-white" /> : 'Save report'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ============================================================
// 20. Input / Output chart
// ============================================================
const IO_INPUTS = [['oral', 'Oral fluids'], ['ivFluid', 'IV fluids'], ['blood', 'Blood'], ['tubeFeed', 'Tube feeds'], ['otherInput', 'Other input']];
const IO_OUTPUTS = [['urine', 'Urine'], ['drain', 'Drain'], ['vomitus', 'Vomiting'], ['stool', 'Stool'], ['otherOutput', 'Other output']];

function IoTab({ d, onChanged }) {
  const io = d.workflow?.ioChart || { entries: [], totals: { input: 0, output: 0, balance: 0, inputBreakdown: {}, outputBreakdown: {} }, hourly: [], byShift: [] };
  const [form, setForm] = useState({});
  const [view, setView] = useState('SHIFT');

  const record = useMutation({
    mutationFn: async (p) => (await api.post(`/ipd/admissions/${d.admission._id}/io-chart`, p)).data.data,
    onSuccess: () => { setForm({}); toast.success('I/O entry recorded'); onChanged(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const buckets = view === 'SHIFT' ? io.byShift : io.hourly;
  const num = (k) => ({ type: 'number', min: 0, step: 'any', value: form[k] ?? '', onChange: (e) => setForm((x) => ({ ...x, [k]: e.target.value })) });

  return (
    <div className="space-y-4">
      <Section title="Fluid balance" right={<span className="text-[11px] text-ink-400">{io.entries?.length || 0} entries</span>}>
        <div className="grid grid-cols-3 gap-3">
          {[['Total input', io.totals.input, 'text-emerald-700'], ['Total output', io.totals.output, 'text-sky-700'], ['Balance', io.totals.balance, (io.totals.balance < 0 ? 'text-red-600' : 'text-ink-900')]].map(([k, v, cls]) => (
            <div key={k} className="rounded-xl bg-ink-50 px-3 py-2 text-center">
              <div className={cn('text-lg font-extrabold', cls)}>{(Number(v) || 0).toLocaleString('en-IN')} ml</div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{k}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {IO_INPUTS.map(([k, label]) => <div key={k}><div className="text-[10px] font-semibold text-ink-400">{label}</div><div className="text-sm font-bold text-emerald-700">{io.totals.inputBreakdown?.[k] || 0}</div></div>)}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {IO_OUTPUTS.map(([k, label]) => <div key={k}><div className="text-[10px] font-semibold text-ink-400">{label}</div><div className="text-sm font-bold text-sky-700">{io.totals.outputBreakdown?.[k] || 0}</div></div>)}
        </div>
      </Section>

      <Section title="Record intake / output" right={<span className="text-[10px] text-ink-400">Negative values are rejected</span>}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {IO_INPUTS.map(([k, label]) => <div key={k}><label className="label">{label} ml</label><input className="input" {...num(`i_${k}`)} /></div>)}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {IO_OUTPUTS.map(([k, label]) => <div key={k}><label className="label">{label} ml</label><input className="input" {...num(`o_${k}`)} /></div>)}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input className="input flex-1 text-xs" placeholder="Notes (optional)" value={form.notes || ''} onChange={(e) => setForm((x) => ({ ...x, notes: e.target.value }))} />
          <button
            className="btn-primary text-xs"
            disabled={record.isPending}
            onClick={() => record.mutate({
              input: Object.fromEntries(IO_INPUTS.map(([k]) => [k, form[`i_${k}`]])),
              output: Object.fromEntries(IO_OUTPUTS.map(([k]) => [k, form[`o_${k}`]])),
              notes: form.notes,
            })}
          >
            {record.isPending ? <Spinner className="h-4 w-4 text-white" /> : 'Record entry'}
          </button>
        </div>
      </Section>

      <Section
        title="Chart by"
        right={
          <div className="flex gap-1">
            {['SHIFT', 'DAY'].map((v) => (
              <button key={v} onClick={() => setView(v)} className={cn('rounded px-2 py-1 text-[10px] font-bold uppercase', view === v ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-500')}>{v === 'SHIFT' ? 'By shift' : 'By day'}</button>
            ))}
          </div>
        }
      >
        {!buckets?.length ? <EmptyState title="Nothing charted yet" hint="Record an entry to build the chart" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead className="border-b border-ink-200 text-[10px] uppercase tracking-wide text-ink-400">
                <tr><th className="py-2 pr-3">{view === 'SHIFT' ? 'Shift' : 'Date'}</th><th className="py-2 pr-3">Entries</th><th className="py-2 pr-3">Input</th><th className="py-2 pr-3">Output</th><th className="py-2">Balance</th></tr>
              </thead>
              <tbody>
                {buckets.map((b) => (
                  <tr key={b.key} className="border-b border-ink-50">
                    <td className="py-2 pr-3 font-semibold text-ink-800">{b.key}</td>
                    <td className="py-2 pr-3">{b.count}</td>
                    <td className="py-2 pr-3 text-emerald-700">{b.input}</td>
                    <td className="py-2 pr-3 text-sky-700">{b.output}</td>
                    <td className={cn('py-2 font-bold', b.balance < 0 ? 'text-red-600' : 'text-ink-900')}>{b.balance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Recent entries">
        {!io.entries?.length ? <EmptyState title="No entries" /> : (
          <div className="space-y-1.5">
            {io.entries.slice(0, 30).map((e) => (
              <div key={e._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-100 px-3 py-1.5 text-[11px]">
                <span className="font-mono text-ink-400">{formatDateTime(e.recordedAt)}</span>
                <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-violet-700">{e.shift}</span>
                <span className="text-emerald-700">In {e.inputTotal}ml</span>
                <span className="text-sky-700">Out {e.outputTotal}ml</span>
                <span className={cn('font-bold', e.balance < 0 ? 'text-red-600' : 'text-ink-800')}>Bal {e.balance}</span>
                <span className="text-ink-400">{e.recordedBy?.name || '—'}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ============================================================
// 21. Procedures
// ============================================================
const PROC_STATUSES = ['PLANNED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const PROC_CATEGORIES = ['DIAGNOSTIC', 'THERAPEUTIC', 'SURGICAL', 'ENDOSCOPIC', 'OBSTETRIC', 'CARDIAC', 'NEURO', 'ORTHO', 'UROLOGY', 'GYNEC', 'ENT', 'OPHTHALMIC', 'OTHER'];

function ProceduresTab({ d, onChanged }) {
  const [form, setForm] = useState({});
  const procedures = d.workflow?.procedures || [];

  const create = useMutation({
    mutationFn: async () => (await api.post(`/ipd/admissions/${d.admission._id}/procedures`, {
      name: form.name, category: form.category, indication: form.indication, charge: Number(form.charge || 0),
    })).data.data,
    onSuccess: () => { setForm({}); toast.success('Procedure recorded'); onChanged(); },
    onError: (e) => toast.error(apiError(e)),
  });
  const step = useMutation({
    mutationFn: async ({ id, status }) => (await api.patch(`/ipd/procedures/${id}`, { status })).data.data,
    onSuccess: (_, v) => { toast.success(`Procedure ${v.status}`); onChanged(); },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <Section title="Procedures" right={<span className="text-[11px] text-ink-400">{procedures.length} procedures</span>}>
      <div className="rounded-xl border border-ink-200 p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <input className="input sm:col-span-2 text-sm" placeholder="Procedure name *" value={form.name || ''} onChange={(e) => setForm((x) => ({ ...x, name: e.target.value }))} />
          <select className="select" value={form.category || 'THERAPEUTIC'} onChange={(e) => setForm((x) => ({ ...x, category: e.target.value }))}>
            {PROC_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <input className="input" type="number" min="0" placeholder="Charge ₹" value={form.charge || ''} onChange={(e) => setForm((x) => ({ ...x, charge: e.target.value }))} />
        </div>
        <input className="input mt-2 text-xs" placeholder="Indication" value={form.indication || ''} onChange={(e) => setForm((x) => ({ ...x, indication: e.target.value }))} />
        <button className="btn-primary mt-2 text-xs" disabled={!form.name?.trim() || create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? <Spinner className="h-4 w-4 text-white" /> : 'Record procedure'}
        </button>
        <p className="mt-1 text-[10px] text-ink-400">Charges are posted to the admission bill automatically when a procedure is completed.</p>
      </div>

      <div className="mt-3 space-y-2">
        {!procedures.length ? <EmptyState title="No procedures" hint="Record ward procedures here" /> : procedures.map((p) => (
          <div key={p._id} className="rounded-xl border border-ink-100 px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-semibold text-ink-900">{p.name}</span>
                {badge(p.status)}
                <span className="ml-1 rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold text-ink-500">{p.category}</span>
                <div className="mt-0.5 text-[11px] text-ink-400">
                  {p.doctorId?.name || '—'} · {formatDateTime(p.procedureDate)} · charge ₹{p.charge || 0}
                  {p.billId ? ' · billed' : ''}
                </div>
                {p.indication && <div className="text-[11px] text-ink-500">{p.indication}</div>}
              </div>
              <select className="select w-36 py-1 text-[11px]" value={p.status} disabled={step.isPending} onChange={(e) => step.mutate({ id: p._id, status: e.target.value })}>
                {PROC_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ============================================================
// 22. OT
// ============================================================
const OT_STATUSES = ['SCHEDULED', 'PRE_OP_COMPLETE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

function OtTab({ d, onChanged }) {
  const doctors = useQuery({ queryKey: ['masters-doctors'], queryFn: async () => (await api.get('/masters/doctors')).data.data });
  const [form, setForm] = useState({});
  const surgeries = d.workflow?.otRequests || [];

  const create = useMutation({
    mutationFn: async () => (await api.post(`/ipd/admissions/${d.admission._id}/ot-requests`, {
      procedure: form.procedure,
      surgeonId: form.surgeonId,
      scheduledStart: form.scheduledStart ? new Date(form.scheduledStart).toISOString() : undefined,
      urgency: form.urgency || 'ELECTIVE',
      diagnosis: form.diagnosis,
    })).data.data,
    onSuccess: () => { setForm({}); toast.success('OT request booked'); onChanged(); },
    onError: (e) => toast.error(apiError(e)),
  });
  const step = useMutation({
    mutationFn: async ({ id, status }) => (await api.patch(`/ipd/ot-requests/${id}`, { status })).data.data,
    onSuccess: (_, v) => { toast.success(`OT ${v.status}`); onChanged(); },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <Section title="OT requests" right={<span className="text-[11px] text-ink-400">{surgeries.length} OT requests</span>}>
      <div className="rounded-xl border border-ink-200 p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <input className="input sm:col-span-2 text-sm" placeholder="Procedure *" value={form.procedure || ''} onChange={(e) => setForm((x) => ({ ...x, procedure: e.target.value }))} />
          <select className="select" value={form.surgeonId || ''} onChange={(e) => setForm((x) => ({ ...x, surgeonId: e.target.value }))}>
            <option value="">Surgeon *</option>
            {(doctors.data || []).map((doc) => <option key={doc._id} value={doc._id}>{doc.name}</option>)}
          </select>
          <input className="input" type="datetime-local" value={form.scheduledStart || ''} onChange={(e) => setForm((x) => ({ ...x, scheduledStart: e.target.value }))} />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <select className="select w-32" value={form.urgency || 'ELECTIVE'} onChange={(e) => setForm((x) => ({ ...x, urgency: e.target.value }))}>
            {['ELECTIVE', 'URGENT', 'EMERGENCY'].map((u) => <option key={u}>{u}</option>)}
          </select>
          <input className="input flex-1 text-xs" placeholder="Diagnosis / indication" value={form.diagnosis || ''} onChange={(e) => setForm((x) => ({ ...x, diagnosis: e.target.value }))} />
          <button className="btn-primary text-xs" disabled={!form.procedure || !form.surgeonId || !form.scheduledStart || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? <Spinner className="h-4 w-4 text-white" /> : 'Book OT'}
          </button>
        </div>
        <p className="mt-1 text-[10px] text-ink-400">The existing patient record is reused — no duplicate patient is created.</p>
      </div>

      <div className="mt-3 space-y-2">
        {!surgeries.length ? <EmptyState title="No OT requests" hint="Book surgery from this admission" /> : surgeries.map((s) => (
          <div key={s._id} className="rounded-xl border border-ink-100 px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-mono text-brand-700">{s.surgeryNumber || 'OT'}</span>
                <span className="ml-2 font-semibold text-ink-900">{s.procedure}</span>
                {badge(s.status)}
                <div className="mt-0.5 text-[11px] text-ink-400">
                  Surgeon {s.surgeonId?.name || '—'} · {formatDateTime(s.scheduledStart)} · {s.urgency}
                </div>
              </div>
              <select className="select w-40 py-1 text-[11px]" value={s.status} disabled={step.isPending} onChange={(e) => step.mutate({ id: s._id, status: e.target.value })}>
                {OT_STATUSES.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ============================================================
// 23. Diet
// ============================================================
const DIET_TYPES = ['REGULAR', 'LIQUID', 'SOFT', 'DIABETIC', 'LOW_SALT', 'HIGH_PROTEIN', 'NPO', 'CUSTOM'];
const MEALS = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACKS'];
const MEAL_FLOW = ['ORDERED', 'KITCHEN_REQUESTED', 'PREPARING', 'DISPATCHED', 'DELIVERED', 'ACKNOWLEDGED'];
const NEXT_MEAL = { ORDERED: 'KITCHEN_REQUESTED', KITCHEN_REQUESTED: 'PREPARING', PREPARING: 'DISPATCHED', DISPATCHED: 'DELIVERED', DELIVERED: 'ACKNOWLEDGED' };

function DietTab({ d, onChanged }) {
  const [form, setForm] = useState({});
  const orders = d.workflow?.dietOrders || [];

  const create = useMutation({
    mutationFn: async () => (await api.post(`/ipd/admissions/${d.admission._id}/diet-orders`, {
      dietType: form.dietType, instructions: form.instructions, customDescription: form.customDescription,
      chargePerDay: Number(form.charge || 0),
    })).data.data,
    onSuccess: () => { setForm({}); toast.success('Diet order placed'); onChanged(); },
    onError: (e) => toast.error(apiError(e)),
  });
  const step = useMutation({
    mutationFn: async ({ orderId, meal, status }) => (await api.patch(`/ipd/diet-orders/${orderId}/meals/${meal}`, { status })).data.data,
    onSuccess: (_, v) => { toast.success(`${v.meal} → ${v.status.replace(/_/g, ' ')}`); onChanged(); },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <Section title="Diet orders & kitchen dispatch" right={<span className="text-[11px] text-ink-400">{orders.length} diet orders</span>}>
      <div className="rounded-xl border border-ink-200 p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <select className="select" value={form.dietType || 'REGULAR'} onChange={(e) => setForm((x) => ({ ...x, dietType: e.target.value }))}>
            {DIET_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select>
          <input className="input sm:col-span-2 text-sm" placeholder="Custom description / items" value={form.customDescription || ''} onChange={(e) => setForm((x) => ({ ...x, customDescription: e.target.value }))} />
          <input className="input" type="number" min="0" placeholder="Charge/day ₹" value={form.charge || ''} onChange={(e) => setForm((x) => ({ ...x, charge: e.target.value }))} />
        </div>
        <input className="input mt-2 text-xs" placeholder="Instructions for kitchen / dietician" value={form.instructions || ''} onChange={(e) => setForm((x) => ({ ...x, instructions: e.target.value }))} />
        <button className="btn-primary mt-2 text-xs" disabled={create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? <Spinner className="h-4 w-4 text-white" /> : 'Place diet order'}
        </button>
      </div>

      <div className="mt-3 space-y-3">
        {!orders.length ? <EmptyState title="No diet orders" hint="Order a diet to generate kitchen requests" /> : orders.map((o) => (
          <div key={o._id} className="rounded-xl border border-ink-100 px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-700 ring-1 ring-inset ring-emerald-200">{String(o.dietType).replace(/_/g, ' ')}</span>
              <span className="text-[11px] text-ink-400">{formatDate(o.orderDate)}{o.chargePerDay ? ` · ₹${o.chargePerDay}/day${o.billId ? ' · billed' : ''}` : ''}</span>
              {o.instructions && <span className="text-[11px] text-ink-500">{o.instructions}</span>}
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {(o.meals || []).map((m) => (
                <div key={m.meal} className="rounded-lg border border-ink-100 p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase text-ink-500">{m.meal}</span>
                    <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-bold uppercase', m.status === 'ACKNOWLEDGED' ? 'bg-emerald-100 text-emerald-700' : 'bg-ink-100 text-ink-600')}>
                      {String(m.status).replace(/_/g, ' ')}
                    </span>
                  </div>
                  {m.deliveredAt && <div className="text-[10px] text-ink-400">Delivered {formatDateTime(m.deliveredAt)}</div>}
                  {m.acknowledgedAt && <div className="text-[10px] text-emerald-600">Patient acknowledged</div>}
                  {NEXT_MEAL[m.status] && (
                    <button className="btn-secondary mt-1 w-full text-[10px]" disabled={step.isPending} onClick={() => step.mutate({ orderId: o._id, meal: m.meal, status: NEXT_MEAL[m.status] })}>
                      → {NEXT_MEAL[m.status].replace(/_/g, ' ')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ============================================================
// 24. Blood bank
// ============================================================
const BLOOD_COMPONENTS = ['WHOLE_BLOOD', 'PACKED_RBC', 'PLATELETS', 'FRESH_FROZEN_PLASMA', 'CRYOPRECIPITATE'];
const BLOOD_FLOW = ['REQUESTED', 'SCREENING', 'AVAILABLE', 'ISSUED', 'TRANSFUSED', 'REJECTED', 'CANCELLED'];
const NEXT_BLOOD = { REQUESTED: 'SCREENING', SCREENING: 'AVAILABLE', AVAILABLE: 'ISSUED', ISSUED: 'TRANSFUSED' };

function BloodTab({ d, onChanged }) {
  const doctors = useQuery({ queryKey: ['masters-doctors'], queryFn: async () => (await api.get('/masters/doctors')).data.data });
  const [form, setForm] = useState({});
  const requests = d.workflow?.bloodRequests || [];

  const create = useMutation({
    mutationFn: async () => (await api.post(`/ipd/admissions/${d.admission._id}/blood-requests`, {
      component: form.component, unitsRequested: Number(form.units || 1), priority: form.priority,
      reason: form.reason, doctorId: form.doctorId, neededBy: form.neededBy || undefined,
    })).data.data,
    onSuccess: () => { setForm({}); toast.success('Blood request raised'); onChanged(); },
    onError: (e) => toast.error(apiError(e)),
  });
  const step = useMutation({
    mutationFn: async ({ id, status }) => (await api.patch(`/ipd/blood-requests/${id}`, { status, reaction: status === 'TRANSFUSED' ? { occurred: false } : undefined })).data.data,
    onSuccess: (_, v) => { toast.success(`Blood request ${v.status}`); onChanged(); },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <Section title="Blood bank requests" right={<span className="text-[11px] text-ink-400">{requests.length} requests</span>}>
      <div className="rounded-xl border border-ink-200 p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <select className="select" value={form.component || 'PACKED_RBC'} onChange={(e) => setForm((x) => ({ ...x, component: e.target.value }))}>
            {BLOOD_COMPONENTS.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
          </select>
          <input className="input" type="number" min="1" placeholder="Units *" value={form.units || ''} onChange={(e) => setForm((x) => ({ ...x, units: e.target.value }))} />
          <select className="select" value={form.priority || 'ROUTINE'} onChange={(e) => setForm((x) => ({ ...x, priority: e.target.value }))}>
            {['ROUTINE', 'URGENT', 'STAT'].map((p) => <option key={p}>{p}</option>)}
          </select>
          <select className="select" value={form.doctorId || ''} onChange={(e) => setForm((x) => ({ ...x, doctorId: e.target.value }))}>
            <option value="">Requesting doctor</option>
            {(doctors.data || []).map((doc) => <option key={doc._id} value={doc._id}>{doc.name}</option>)}
          </select>
        </div>
        <input className="input mt-2 text-xs" placeholder="Clinical reason" value={form.reason || ''} onChange={(e) => setForm((x) => ({ ...x, reason: e.target.value }))} />
        <button className="btn-primary mt-2 text-xs" disabled={!form.units || create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? <Spinner className="h-4 w-4 text-white" /> : 'Raise request'}
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {!requests.length ? <EmptyState title="No blood requests" hint="Raise a request for components" /> : requests.map((r) => (
          <div key={r._id} className="rounded-xl border border-ink-100 px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-mono text-brand-700">{r.requestNumber}</span>
                <span className="ml-2 font-semibold text-ink-900">{String(r.component).replace(/_/g, ' ')}</span>
                {badge(r.status)}
                {r.priority === 'STAT' && <span className="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">STAT</span>}
                <div className="mt-0.5 text-[11px] text-ink-400">
                  {r.bloodGroup} · {r.unitsRequested}U requested · {r.unitsIssued}U issued
                  {r.doctorId?.name ? ` · ${r.doctorId.name}` : ''} · {formatDateTime(r.requestedAt)}
                  {r.transfusedAt ? ` · transfused ${formatDateTime(r.transfusedAt)}` : ''}
                </div>
                {r.reaction?.occurred && (
                  <div className="mt-1 rounded bg-red-50 px-2 py-1 text-[11px] text-red-700 ring-1 ring-inset ring-red-200">
                    Reaction: {r.reaction.type} ({r.reaction.severity}) — {r.reaction.notes}
                  </div>
                )}
              </div>
              {NEXT_BLOOD[r.status] && (
                <button className="btn-primary text-[11px]" disabled={step.isPending} onClick={() => step.mutate({ id: r._id, status: NEXT_BLOOD[r.status] })}>
                  → {NEXT_BLOOD[r.status]}
                </button>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {BLOOD_FLOW.map((s) => (
                <span key={s} className={cn('rounded px-1.5 py-0.5 text-[9px] font-bold uppercase', r.status === s ? 'bg-brand-600 text-white' : 'bg-ink-50 text-ink-400')}>{s}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ============================================================
// 25. Physiotherapy
// ============================================================
const PHYSIO_PROGRESS = ['NO_PROGRESS', 'SLOW', 'MODERATE', 'GOOD', 'COMPLETED'];

function PhysioTab({ d, onChanged }) {
  const [form, setForm] = useState({});
  const requests = d.workflow?.physioRequests || [];

  const create = useMutation({
    mutationFn: async () => (await api.post(`/ipd/admissions/${d.admission._id}/physiotherapy`, {
      procedure: form.procedure, totalSessions: Number(form.sessions || 1), chargePerSession: Number(form.charge || 0), indication: form.indication,
    })).data.data,
    onSuccess: () => { setForm({}); toast.success('Physiotherapy requested'); onChanged(); },
    onError: (e) => toast.error(apiError(e)),
  });
  const session = useMutation({
    mutationFn: async ({ requestId, sessionId, body }) => (await api.patch(`/ipd/physiotherapy/${requestId}/sessions/${sessionId}`, body)).data.data,
    onSuccess: (_, v) => { toast.success(`Session recorded — ${v.completedSessions}/${v.totalSessions}`); onChanged(); },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <Section title="Physiotherapy" right={<span className="text-[11px] text-ink-400">{requests.length} requests</span>}>
      <div className="rounded-xl border border-ink-200 p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <input className="input sm:col-span-2 text-sm" placeholder="Procedure / therapy *" value={form.procedure || ''} onChange={(e) => setForm((x) => ({ ...x, procedure: e.target.value }))} />
          <input className="input" type="number" min="1" placeholder="No. of sessions" value={form.sessions || ''} onChange={(e) => setForm((x) => ({ ...x, sessions: e.target.value }))} />
          <input className="input" type="number" min="0" placeholder="Charge/session ₹" value={form.charge || ''} onChange={(e) => setForm((x) => ({ ...x, charge: e.target.value }))} />
        </div>
        <input className="input mt-2 text-xs" placeholder="Indication" value={form.indication || ''} onChange={(e) => setForm((x) => ({ ...x, indication: e.target.value }))} />
        <button className="btn-primary mt-2 text-xs" disabled={!form.procedure?.trim() || create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? <Spinner className="h-4 w-4 text-white" /> : 'Request physiotherapy'}
        </button>
        <p className="mt-1 text-[10px] text-ink-400">Each completed session is billed to the admission bill automatically.</p>
      </div>

      <div className="mt-3 space-y-3">
        {!requests.length ? <EmptyState title="No physiotherapy requests" hint="Request physiotherapy above" /> : requests.map((r) => (
          <div key={r._id} className="rounded-xl border border-ink-100 px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-semibold text-ink-900">{r.procedure}</span>
                {badge(r.status)}
                <div className="mt-0.5 text-[11px] text-ink-400">
                  {r.completedSessions}/{r.totalSessions} sessions completed
                  {r.therapistId?.name ? ` · ${r.therapistId.name}` : ''}
                  {r.chargePerSession ? ` · ₹${r.chargePerSession}/session` : ''}
                  {r.billedSessions ? ` · ${r.billedSessions} billed` : ''}
                </div>
              </div>
              <div className="h-2 w-32 overflow-hidden rounded-full bg-ink-100">
                <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, (r.completedSessions / Math.max(1, r.totalSessions)) * 100)}%` }} />
              </div>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {(r.sessions || []).map((s) => (
                <div key={s._id} className={cn('rounded-lg border p-2', s.status === 'COMPLETED' ? 'border-emerald-200 bg-emerald-50/50' : 'border-ink-100')}>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase text-ink-500">Session {s.sessionNumber}</span>
                    <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[9px] font-bold text-ink-600">{s.status}</span>
                  </div>
                  {s.therapistName && <div className="text-[10px] text-ink-400">{s.therapistName}</div>}
                  {s.progress && <div className="text-[10px] font-semibold text-brand-700">Progress: {s.progress}</div>}
                  {s.notes && <div className="text-[10px] text-ink-500">{s.notes}</div>}
                  {s.status === 'SCHEDULED' && (
                    <div className="mt-1 flex gap-1">
                      <button className="btn-primary flex-1 text-[10px]" onClick={() => session.mutate({ requestId: r._id, sessionId: s._id, body: { status: 'COMPLETED', progress: 'MODERATE' } })}>Complete</button>
                      <button className="btn-secondary flex-1 text-[10px]" onClick={() => session.mutate({ requestId: r._id, sessionId: s._id, body: { status: 'SKIPPED' } })}>Skip</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-ink-400">Progress options: {PHYSIO_PROGRESS.join(', ')}</p>
    </Section>
  );
}

// ===== MEDICATIONS =====
function MedicationsTab({ d, onChanged }) {
  return (
    <MedicalList
      title="Medication chart & administration"
      items={d.medications || []}
      mutationFn={(p) => api.post(`/ipd/admissions/${d.admission._id}/medications`, p)}
      onChanged={onChanged}
      empty="No medications charted"
      render={(m) => <MedRow m={m} onChanged={onChanged} />}
    >
      {(form, set) => (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="col-span-2"><label className="label">Medicine (brand) *</label><input className="input" value={form.medicineName || ''} onChange={set('medicineName')} /></div>
            <div><label className="label">Generic name</label><input className="input" value={form.genericName || ''} onChange={set('genericName')} /></div>
            <div><label className="label">Strength</label><input className="input" placeholder="500mg" value={form.strength || ''} onChange={set('strength')} /></div>
            <div><label className="label">Dose</label><input className="input" placeholder="1 Tab" value={form.dosage || ''} onChange={set('dosage')} /></div>
            <div>
              <label className="label">Route</label>
              <select className="select" value={form.route || 'ORAL'} onChange={set('route')}>
                {ROUTES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div><label className="label">Frequency</label><input className="input" placeholder="TDS" value={form.frequency || ''} onChange={set('frequency')} /></div>
            <div><label className="label">Duration</label><input className="input" placeholder="5 days" value={form.duration || ''} onChange={set('duration')} /></div>
            <div><label className="label">Start date</label><input type="date" className="input" value={form.startDate || ''} onChange={set('startDate')} /></div>
            <div><label className="label">End date</label><input type="date" className="input" value={form.endDate || ''} onChange={set('endDate')} /></div>
            <div className="col-span-2 sm:col-span-4"><label className="label">Special instructions</label><input className="input" value={form.instructions || ''} onChange={set('instructions')} /></div>
          </div>
          <button className="btn-primary mt-2 text-xs" disabled={!form.medicineName} onClick={() => set('__save')()}>Chart medication</button>
        </>
      )}
    </MedicalList>
  );
}

function MedRow({ m, onChanged }) {
  const [modal, setModal] = useState(null);
  const admin = useMutation({
    mutationFn: async ({ chartId, p }) => (await api.post(`/ipd/medications/${chartId}/administer`, p)).data.data,
    onSuccess: () => { toast.success('Administration recorded'); setModal(null); onChanged(); },
    onError: (e) => toast.error(apiError(e)),
  });
  const start = m.startDate ? new Date(m.startDate) : null;
  const end = m.endDate ? new Date(m.endDate) : null;
  const now = new Date();
  const state = end && end < now ? 'COMPLETED' : start && start > now ? 'SCHEDULED' : 'ACTIVE';
  return (
    <div className="rounded-xl border border-ink-100 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-semibold text-ink-900">
            {m.medicineName} {m.strength && <span className="text-ink-500">({m.strength})</span>}
            <span className="ml-1 text-ink-400">{m.dosage} {m.route}</span>
          </div>
          <div className="text-[11px] text-ink-400">
            {m.genericName ? `${m.genericName} · ` : ''}{m.frequency}{m.frequencyTiming ? ` (${m.frequencyTiming})` : ''}{m.duration ? ` · ${m.duration}` : ''}
            {m.startDate ? ` · ${formatDate(m.startDate)}` : ''}{m.endDate ? ` → ${formatDate(m.endDate)}` : ''}
          </div>
          <div className="text-[11px] text-ink-400">
            {m.instructions ? `${m.instructions} · ` : ''}ordered by {m.orderedBy?.name || '—'} {formatDate(m.createdAt)}
            {' · '}<span className={cn('font-semibold', state === 'ACTIVE' ? 'text-emerald-600' : 'text-ink-500')}>{state}</span>
          </div>
        </div>
        <button className="btn-secondary text-xs" onClick={() => setModal(m)}>Administer</button>
      </div>
      {m.administrations?.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {m.administrations.map((ad, i) => (
            <span key={i} className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold', {
              'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200': ad.status === 'GIVEN',
              'bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-200': ad.status === 'MISSED',
              'bg-red-50 text-red-600 ring-1 ring-inset ring-red-200': ad.status === 'REFUSED',
              'bg-ink-100 text-ink-600 ring-1 ring-inset ring-ink-200': ad.status === 'HELD',
            })}>
              {ad.status} · {ad.administeredBy?.name || '—'} · {ad.givenTime ? formatDateTime(ad.givenTime) : ad.scheduledTime ? formatDateTime(ad.scheduledTime) : ''}
            </span>
          ))}
        </div>
      )}
      {modal && (
        <Modal title="Record administration" subtitle={`${m.medicineName} ${m.strength || ''}`} onClose={() => setModal(null)}>
          {['GIVEN', 'MISSED', 'REFUSED', 'HELD'].map((s) => (
            <button key={s} className="btn-secondary mb-2 w-full text-xs" disabled={admin.isPending} onClick={() => admin.mutate({ chartId: m._id, p: { status: s } })}>
              {s}
            </button>
          ))}
        </Modal>
      )}
    </div>
  );
}

function PaymentsTab({ d }) {
  const payments = d.payments || [];
  return (
    <Section title="Payments received" right={<span className="text-[11px] text-ink-400">Paid ₹{(d.billSummary?.paid || 0).toLocaleString('en-IN')}</span>}>
      {!payments.length ? (
        <EmptyState title="No payments recorded" hint="Payments against this admission's bills appear here" />
      ) : (
        <div className="space-y-2">
          {payments.map((p) => (
            <div key={p._id} className="flex flex-wrap items-center justify-between rounded-xl border border-ink-100 px-3 py-2 text-xs">
              <div>
                <span className="font-mono text-brand-700">{p.receiptNumber || p.transactionId}</span>
                <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">{p.mode}</span>
                <div className="text-[11px] text-ink-400">{p.paymentType?.replace(/_/g, ' ')} · {formatDateTime(p.paidAt)} · by {p.receivedBy?.name || '—'}</div>
              </div>
              <div className="text-sm font-bold text-emerald-700">₹{(p.amount || 0).toLocaleString('en-IN')}</div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function InsuranceTab({ d }) {
  const a = d.admission;
  const ins = d.insurance || {};
  return (
    <Section title="Insurance & sponsorship">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <Field label="Payment category">{ins.paymentCategory || a.paymentCategory}</Field>
        <Field label="Policy number">{a.insurancePolicyId?.policyNumber}</Field>
        <Field label="Policy holder">{a.insurancePolicyId?.policyHolderName}</Field>
        <Field label="Sum insured">{a.insurancePolicyId?.sumInsured ? `₹${a.insurancePolicyId.sumInsured.toLocaleString('en-IN')}` : '—'}</Field>
        <Field label="Sponsor">{ins.sponsor?.name}</Field>
        <Field label="Sponsor company">{ins.sponsor?.company}</Field>
        <Field label="Funding limit">{ins.sponsor?.fundingLimit ? `₹${ins.sponsor.fundingLimit.toLocaleString('en-IN')}` : '—'}</Field>
        <Field label="Sponsor note">{ins.sponsor?.note}</Field>
      </div>
      {!a.insurancePolicyId && !ins.sponsor?.name && (
        <p className="mt-3 text-xs text-ink-400">This admission is self-pay. Pre-authorisation and claims are handled in the Insurance module.</p>
      )}
    </Section>
  );
}

// ===== TRANSFERS / ALLOCATIONS =====
function TransfersTab({ d, onChanged }) {
  const a = d.admission;
  const [open, setOpen] = useState(false);
  const allocs = [...(d.allocations || [])].reverse();
  const active = ACTIVE.includes(a.status);

  return (
    <div className="space-y-4">
      <Section
        title="Bed allocation history"
        right={active ? <button className="btn-primary text-xs" onClick={() => setOpen(true)}><ArrowLeftRight className="h-3.5 w-3.5" /> Transfer bed</button> : null}
      >
        {!allocs.length ? (
          <EmptyState title="No allocations yet" hint="Bed assignments and transfers are recorded permanently" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="border-b border-ink-200 text-[10px] uppercase tracking-wide text-ink-400">
                <tr>
                  <th className="py-2 pr-3">Action</th>
                  <th className="py-2 pr-3">Bed</th>
                  <th className="py-2 pr-3">From</th>
                  <th className="py-2 pr-3">To</th>
                  <th className="py-2 pr-3">Tariff</th>
                  <th className="py-2 pr-3">Reason</th>
                  <th className="py-2">By</th>
                </tr>
              </thead>
              <tbody>
                {allocs.map((x) => (
                  <tr key={x._id} className="border-b border-ink-50">
                    <td className="py-2 pr-3"><span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold', x.open ? 'bg-emerald-50 text-emerald-700' : 'bg-ink-100 text-ink-600')}>{x.action}</span></td>
                    <td className="py-2 pr-3 font-mono">{x.to || '—'}</td>
                    <td className="py-2 pr-3 text-ink-500">{formatDateTime(x.fromAt)}</td>
                    <td className="py-2 pr-3 text-ink-500">{x.toAt ? formatDateTime(x.toAt) : <span className="text-emerald-600">ongoing</span>}</td>
                    <td className="py-2 pr-3">{x.chargePerDay ? `₹${x.chargePerDay}/day` : '—'}</td>
                    <td className="py-2 pr-3 text-ink-500">{x.reason || '—'}</td>
                    <td className="py-2 text-ink-500">{x.changedBy?.name || 'System'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[10px] text-ink-400">Previous allocations are never overwritten — every move appends a new record with from/to timestamps and the tariff applicable at that time.</p>
      </Section>

      {open && <BedAssignModal admission={a} mode="transfer" onClose={() => setOpen(false)} onDone={() => { setOpen(false); onChanged(); }} />}
    </div>
  );
}

// ===== TIMELINE =====
const TIMELINE_STYLE = {
  VITAL: { cls: 'bg-emerald-500', icon: Activity },
  NURSING: { cls: 'bg-violet-500', icon: ClipboardPaste },
  CLINICAL: { cls: 'bg-brand-600', icon: ClipboardList },
  DOCTOR_VISIT: { cls: 'bg-emerald-600', icon: Stethoscope },
  MEDICATION: { cls: 'bg-cyan-500', icon: Pill },
  ORDER: { cls: 'bg-blue-500', icon: ListTree },
  BED: { cls: 'bg-amber-500', icon: BedDouble },
  PROCEDURE: { cls: 'bg-rose-500', icon: Scissors },
  BLOOD: { cls: 'bg-red-600', icon: Droplets },
  PHYSIO: { cls: 'bg-teal-500', icon: Dumbbell },
  IO: { cls: 'bg-sky-600', icon: Scale },
};

function TimelineTab({ d }) {
  const events = [...(d.timeline || [])].reverse();
  return (
    <Section title="Complete admission timeline" right={<span className="text-[11px] text-ink-400">{events.length} events</span>}>
      {!events.length ? (
        <EmptyState title="No events" hint="Every clinical and operational event is logged here" />
      ) : (
        <ol className="relative space-y-3 border-l border-ink-200 pl-5">
          {events.map((e, i) => {
            const style = TIMELINE_STYLE[e.type] || { cls: 'bg-ink-400', icon: History };
            const Icon = style.icon;
            return (
              <li key={i} className="relative">
                <span className={cn('absolute -left-[27px] flex h-5 w-5 items-center justify-center rounded-full text-white ring-4 ring-white', style.cls)}>
                  <Icon className="h-2.5 w-2.5" />
                </span>
                <div className="rounded-xl border border-ink-100 px-3 py-2 text-xs">
                  <div className="font-semibold text-ink-900">{e.title}</div>
                  <div className="text-[11px] text-ink-400">
                    {formatDateTime(e.at)} · {e.by || 'System'}
                    {e.detail?.reason ? ` · ${e.detail.reason}` : ''}
                    {e.detail?.status ? ` · ${e.detail.status}` : ''}
                    {e.detail?.chargePerDay ? ` · ₹${e.detail.chargePerDay}/day` : ''}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}

// ===== BILLING =====
function BillingTab({ d }) {
  return (
    <Section title="Bills" right={<span className="text-[11px] text-ink-400">Due ₹{(d.billSummary?.due || 0).toLocaleString('en-IN')}</span>}>
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[['Total', d.billSummary?.total], ['Net', d.billSummary?.net], ['Paid', d.billSummary?.paid], ['Due', d.billSummary?.due], ['Discount', d.billSummary?.discount]].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-ink-50 px-3 py-2 text-center">
            <div className="text-base font-extrabold text-ink-900">₹{(v || 0).toLocaleString('en-IN')}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{k}</div>
          </div>
        ))}
      </div>
      {!d.bills?.length ? (
        <div><EmptyState title="No bills yet" hint="Charges accrue here from the Billing module (room, nursing, lab, pharmacy)" /></div>
      ) : (
        <div className="space-y-2">
          {d.bills.map((b) => (
            <div key={b._id} className="flex flex-wrap items-center justify-between rounded-xl border border-ink-100 px-3 py-2 text-xs">
              <div>
                <span className="font-mono text-brand-700">{b.billNumber}</span>
                <span className="ml-2 text-ink-800">{b.description || b.billType || 'Bill'}</span>
                <div className="text-[11px] text-ink-400">{formatDate(b.billDate)} · {b.status} · {b.items?.length || 0} items</div>
              </div>
              <div className="flex gap-3 tabular-nums">
                <span>Net <b className="text-ink-900">₹{(b.netTotal || 0).toLocaleString('en-IN')}</b></span>
                <span>Paid <b className="text-emerald-700">₹{(b.paidAmount || 0).toLocaleString('en-IN')}</b></span>
                <span>Due <b className="text-red-600">₹{(b.dueAmount || 0).toLocaleString('en-IN')}</b></span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ===== DISCHARGE (sections 31-35) =====
const DISCHARGE_TYPES = [
  { value: 'NORMAL', label: 'Normal discharge', needs: [] },
  { value: 'LAMA', label: 'LAMA — left against medical advice', needs: ['signedBy', 'relation'] },
  { value: 'DAMA', label: 'DAMA — discharged against medical advice', needs: ['signedBy', 'relation', 'witnessedBy'] },
  { value: 'ABSCONDED', label: 'Absconded', needs: ['notes'] },
  { value: 'TRANSFERRED', label: 'Transferred to another hospital', needs: ['notes'] },
  { value: 'DEATH', label: 'Death', needs: ['causeOfDeath'] },
  { value: 'REFERRAL', label: 'Referral to another facility', needs: ['notes', 'documentType'] },
];

const STAGES = ['DISCHARGE_INITIATED', 'BILLING_PENDING', 'PAYMENT_PENDING', 'INSURANCE_PENDING', 'READY_FOR_DISCHARGE', 'DISCHARGED'];

function DischargeTab({ d, onChanged }) {
  const a = d.admission;
  const [planDate, setPlanDate] = useState(a.expectedDischargeDate ? a.expectedDischargeDate.slice(0, 10) : '');
  const [planNotes, setPlanNotes] = useState('');
  const [finalDiagnosis, setFinalDiagnosis] = useState('');
  const [treatmentGiven, setTreatmentGiven] = useState('');
  const [advice, setAdvice] = useState('');
  const [type, setType] = useState(a.dischargeType || 'NORMAL');
  const [docs, setDocs] = useState({});
  const [death, setDeath] = useState({});

  const dischargeable = ACTIVE.includes(a.status);
  const needs = DISCHARGE_TYPES.find((t) => t.value === type)?.needs || [];
  const docsReady = needs.every((k) => (k === 'causeOfDeath' ? death.causeOfDeath : docs[k]));

  const readiness = useQuery({
    queryKey: ['ipd-readiness', a._id],
    queryFn: async () => (await api.get(`/ipd/billing/discharge-readiness/${a._id}`)).data.data,
    enabled: !['DISCHARGED', 'CANCELLED'].includes(a.status),
  });
  const settlement = useQuery({
    queryKey: ['ipd-settlement', a._id],
    queryFn: async () => (await api.get(`/ipd/billing/final/${a._id}`)).data.data,
    retry: false,
    enabled: !!a._id,
  });

  const invalidateAll = () => onChanged();

  const plan = useMutation({
    mutationFn: async () => (await api.post(`/ipd/admissions/${a._id}/plan-discharge`, { expectedDischargeDate: planDate ? new Date(planDate).toISOString() : undefined, notes: planNotes || undefined })).data.data,
    onSuccess: () => { toast.success('Discharge planned'); onChanged(); },
    onError: (e) => toast.error(apiError(e)),
  });
  const initiate = useMutation({
    mutationFn: async () => (await api.post(`/ipd/billing/discharge/${a._id}/initiate`, {
      dischargeType: type,
      reason: planNotes || undefined,
      documents: {
        documentType: docs.documentType,
        referenceNumber: docs.referenceNumber,
        signedBy: docs.signedBy,
        relation: docs.relation,
        witnessedBy: docs.witnessedBy,
        notes: docs.notes,
      },
      deathDetails: type === 'DEATH' ? { causeOfDeath: death.causeOfDeath, timeOfDeath: death.timeOfDeath, mortuaryRef: death.mortuaryRef } : undefined,
    })).data.data,
    onSuccess: () => { toast.success('Discharge initiated'); onChanged(); },
    onError: (e) => toast.error(apiError(e)),
  });
  const stage = useMutation({
    mutationFn: async (next) => (await api.post(`/ipd/billing/discharge/${a._id}/stage`, { stage: next })).data.data,
    onSuccess: (r) => { toast.success(`Stage → ${String(r.stage).replace(/_/g, ' ')}`); onChanged(); },
    onError: (e) => toast.error(apiError(e)),
  });
  const toggle = useMutation({
    mutationFn: async ({ key, done }) => (await api.patch(`/ipd/billing/discharge-readiness/${a._id}/${key}`, { done })).data.data,
    onSuccess: () => onChanged(),
    onError: (e) => toast.error(apiError(e)),
  });
  const buildFinal = useMutation({
    mutationFn: async () => (await api.post(`/ipd/billing/final/${a._id}/build`)).data.data,
    onSuccess: (r) => { toast.success(`Final bill ${r.finalBill.billNumber} ready`); onChanged(); },
    onError: (e) => toast.error(apiError(e)),
  });
  const makeSummary = useMutation({
    mutationFn: async () => (await api.get(`/ipd/billing/discharge-summary/${a._id}`)).data.data,
    onSuccess: () => { toast.success('Discharge summary generated'); onChanged(); },
    onError: (e) => toast.error(apiError(e)),
  });
  const discharge = useMutation({
    mutationFn: async () => (await api.post(`/ipd/admissions/${a._id}/discharge`, {
      summary: { finalDiagnosis: finalDiagnosis || a.admittingDiagnosis, treatmentGiven: treatmentGiven || undefined, advice: advice || undefined, conditionAtDischarge: 'Stable' },
    })).data.data,
    onSuccess: () => { toast.success('Patient discharged — bed sent for cleaning'); onChanged(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const s = settlement.data;
  const stageIdx = STAGES.indexOf(a.dischargeStage || 'DISCHARGE_INITIATED');
  const nextStage = STAGES[stageIdx + 1];

  return (
    <div className="space-y-4">
      <Section title="Discharge planning">
        {a.status === 'DISCHARGE_PLANNED' && (
          <div className="mb-3 rounded-xl bg-orange-50 px-3 py-2 text-xs text-orange-700 ring-1 ring-inset ring-orange-200">
            Discharge planned for {a.dischargePlannedAt ? formatDateTime(a.dischargePlannedAt) : '—'}
            {a.dischargePlanningNotes ? ` · ${a.dischargePlanningNotes}` : ''}
          </div>
        )}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div><label className="label">Expected discharge date</label><input type="date" className="input" value={planDate} onChange={(e) => setPlanDate(e.target.value)} /></div>
          <div><label className="label">Planning notes</label><input className="input" value={planNotes} onChange={(e) => setPlanNotes(e.target.value)} /></div>
        </div>
        <button className="btn-secondary mt-2 text-xs" disabled={plan.isPending} onClick={() => plan.mutate()}>
          {plan.isPending ? <Spinner className="h-4 w-4" /> : <CalendarClock className="h-4 w-4" />} Set discharge plan
        </button>
      </Section>

      {dischargeable && (
        <>
          <Section title="Discharge type & documentation" hint="Each type follows its own documentation requirement">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label className="label">Discharge type</label>
                <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
                  {DISCHARGE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div><label className="label">Document reference no.</label><input className="input" value={docs.referenceNumber || ''} onChange={(e) => setDocs((x) => ({ ...x, referenceNumber: e.target.value }))} /></div>
              {needs.includes('signedBy') && <div><label className="label">Signed by *</label><input className="input" value={docs.signedBy || ''} onChange={(e) => setDocs((x) => ({ ...x, signedBy: e.target.value }))} /></div>}
              {needs.includes('relation') && <div><label className="label">Relation *</label><input className="input" value={docs.relation || ''} onChange={(e) => setDocs((x) => ({ ...x, relation: e.target.value }))} /></div>}
              {needs.includes('witnessedBy') && <div><label className="label">Witnessed by *</label><input className="input" value={docs.witnessedBy || ''} onChange={(e) => setDocs((x) => ({ ...x, witnessedBy: e.target.value }))} /></div>}
              {needs.includes('documentType') && (
                <div><label className="label">Document type *</label><input className="input" placeholder="REFERRAL_LETTER" value={docs.documentType || ''} onChange={(e) => setDocs((x) => ({ ...x, documentType: e.target.value }))} /></div>
              )}
              {needs.includes('notes') && (
                <div className="sm:col-span-2"><label className="label">Documentation notes *</label><textarea className="input" rows={2} value={docs.notes || ''} onChange={(e) => setDocs((x) => ({ ...x, notes: e.target.value }))} /></div>
              )}
              {type === 'DEATH' && (
                <>
                  <div className="sm:col-span-2"><label className="label">Cause of death *</label><input className="input" value={death.causeOfDeath || ''} onChange={(e) => setDeath((x) => ({ ...x, causeOfDeath: e.target.value }))} /></div>
                  <div><label className="label">Time of death</label><input type="datetime-local" className="input" value={death.timeOfDeath || ''} onChange={(e) => setDeath((x) => ({ ...x, timeOfDeath: e.target.value }))} /></div>
                  <div><label className="label">Mortuary reference</label><input className="input" value={death.mortuaryRef || ''} onChange={(e) => setDeath((x) => ({ ...x, mortuaryRef: e.target.value }))} /></div>
                </>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button className="btn-primary text-xs" disabled={!docsReady || initiate.isPending} onClick={() => initiate.mutate()}>
                {initiate.isPending ? <Spinner className="h-4 w-4 text-white" /> : 'Initiate discharge'}
              </button>
              {!docsReady && <span className="text-[11px] text-amber-600">Complete the required documentation for {type}</span>}
            </div>
          </Section>

          <Section title="Settlement workflow" right={<span className="text-[11px] text-ink-400">stage: {String(a.dischargeStage || 'not started').replace(/_/g, ' ')}</span>}>
            <div className="flex flex-wrap gap-1.5">
              {STAGES.map((st, i) => (
                <span key={st} className={cn(
                  'rounded-lg px-2 py-1 text-[10px] font-bold uppercase ring-1 ring-inset',
                  i < stageIdx ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                    : i === stageIdx ? 'bg-brand-600 text-white ring-brand-600'
                      : 'bg-ink-50 text-ink-400 ring-ink-200',
                )}>{st.replace(/_/g, ' ')}</span>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn-secondary text-xs" disabled={buildFinal.isPending} onClick={() => buildFinal.mutate()}>
                {buildFinal.isPending ? <Spinner className="h-4 w-4" /> : 'Generate final bill'}
              </button>
              <button className="btn-secondary text-xs" disabled={makeSummary.isPending} onClick={() => makeSummary.mutate()}>
                {makeSummary.isPending ? <Spinner className="h-4 w-4" /> : 'Generate discharge summary'}
              </button>
              <a className="btn-secondary text-xs" href={`/api/ipd/billing/discharge-summary/${a._id}/pdf`} target="_blank" rel="noreferrer">Summary PDF</a>
              <a className="btn-secondary text-xs" href={`/api/ipd/billing/discharge-summary/${a._id}/print`} target="_blank" rel="noreferrer">Print</a>
              {nextStage && nextStage !== 'DISCHARGED' && (
                <button className="btn-primary text-xs" disabled={stage.isPending} onClick={() => stage.mutate(nextStage)}>
                  Move to {nextStage.replace(/_/g, ' ')}
                </button>
              )}
            </div>

            {s && (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[['Net total', s.netTotal], ['Insurance adj', s.insuranceAdjustment], ['Sponsor adj', s.sponsorAdjustment], ['Advance adj', s.advanceAdjusted], ['Paid', s.paid], ['Net payable', s.netPayable]].map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-ink-50 px-2 py-1.5 text-center">
                    <div className="text-xs font-bold text-ink-900">₹{(Number(v) || 0).toLocaleString('en-IN')}</div>
                    <div className="text-[9px] uppercase tracking-wide text-ink-400">{k}</div>
                  </div>
                ))}
                <div className={cn('rounded-lg px-2 py-1.5 text-center ring-1', s.balance > 0 ? 'bg-red-50 ring-red-200' : 'bg-emerald-50 ring-emerald-200')}>
                  <div className={cn('text-xs font-bold', s.balance > 0 ? 'text-red-600' : 'text-emerald-600')}>₹{(s.balance || 0).toLocaleString('en-IN')}</div>
                  <div className="text-[9px] uppercase tracking-wide text-ink-400">Balance</div>
                </div>
                <div className="rounded-lg bg-ink-50 px-2 py-1.5 text-center">
                  <div className="text-xs font-bold text-ink-900">{s.status}</div>
                  <div className="text-[9px] uppercase tracking-wide text-ink-400">Settlement</div>
                </div>
              </div>
            )}
          </Section>

          <Section title="Discharge readiness checklist" right={readiness.data ? <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold uppercase', readiness.data.readiness === 'READY' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>{readiness.data.readiness.replace(/_/g, ' ')}</span> : null}>
            {!readiness.data ? <LoadingState label="Loading checklist…" /> : (
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {readiness.data.items.map((i) => (
                  <label key={i.key} className={cn('flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-[11px]', i.done ? 'border-emerald-200 bg-emerald-50/50' : 'border-ink-100')}>
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={i.done}
                      disabled={i.auto || toggle.isPending || a.status === 'DISCHARGED'}
                      onChange={(e) => toggle.mutate({ key: i.key, done: e.target.checked })}
                    />
                    <span className="min-w-0">
                      <span className="font-semibold text-ink-800">{i.label}{i.auto && <span className="ml-1 text-[9px] font-normal text-ink-400">(auto)</span>}</span>
                      {i.note && <span className="block truncate text-[10px] text-ink-400">{i.note}</span>}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </Section>
        </>
      )}

      <Section title="Discharge summary">
        {a.status === 'DISCHARGED' ? (
          d.dischargeSummary ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-sm">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-600">Final summary · {String(d.dischargeSummary.dischargeType || a.dischargeType).replace(/_/g, ' ')}</div>
                <div className="flex gap-2 text-[11px]">
                  <a className="font-semibold text-brand-600 hover:underline" href={`/api/ipd/billing/discharge-summary/${a._id}/pdf`} target="_blank" rel="noreferrer">PDF</a>
                  <a className="font-semibold text-brand-600 hover:underline" href={`/api/ipd/billing/discharge-summary/${a._id}/print`} target="_blank" rel="noreferrer">Print</a>
                </div>
              </div>
              <div className="mt-1 space-y-1 text-ink-800">
                <div><b>Final diagnosis:</b> {d.dischargeSummary.diagnosis || d.dischargeSummary.finalDiagnosis || a.admittingDiagnosis}</div>
                {d.dischargeSummary.hospitalCourse && <div><b>Hospital course:</b> {String(d.dischargeSummary.hospitalCourse).slice(0, 160)}</div>}
                {(d.dischargeSummary.medicationsOnDischarge || []).length > 0 && (
                  <div><b>Discharge medication:</b> {d.dischargeSummary.medicationsOnDischarge.map((m) => `${m.medicineName} ${m.dosage || ''}`).join(', ')}</div>
                )}
                {d.dischargeSummary.advice?.diet && <div><b>Advice:</b> diet {d.dischargeSummary.advice.diet}</div>}
                <div className="text-xs text-ink-400">Discharged {formatDateTime(a.dischargedAt)} · LOS {d.dischargeSummary.lengthOfStayDays || '—'} days</div>
              </div>
            </div>
          ) : (
            <EmptyState title="Discharged" hint="Discharge summary not found" />
          )
        ) : dischargeable ? (
          <>
            <div className="grid grid-cols-1 gap-2">
              <div><label className="label">Final diagnosis</label><input className="input" value={finalDiagnosis} onChange={(e) => setFinalDiagnosis(e.target.value)} /></div>
              <div><label className="label">Treatment given</label><textarea className="input" rows={2} value={treatmentGiven} onChange={(e) => setTreatmentGiven(e.target.value)} /></div>
              <div><label className="label">Advice / follow-up</label><textarea className="input" rows={2} value={advice} onChange={(e) => setAdvice(e.target.value)} /></div>
            </div>
            {(d.billSummary?.due || 0) > 0 && (
              <p className="mt-2 text-xs text-amber-600">Outstanding balance ₹{d.billSummary.due.toLocaleString('en-IN')} — settle in Billing before finalising.</p>
            )}
            <button className="btn-danger mt-3 w-full" disabled={discharge.isPending} onClick={() => { if (window.confirm(`Discharge ${a.admissionNumber}? Bed will be freed.`)) discharge.mutate(); }}>
              {discharge.isPending ? <Spinner className="h-4 w-4 text-white" /> : 'Confirm discharge & finalize summary'}
            </button>
          </>
        ) : (
          <EmptyState title="Not dischargeable" hint="Only active admissions can be discharged" />
        )}
      </Section>
    </div>
  );
}

// ===== Generic medical list with inline add form =====
function MedicalList({ title, items, render, children, mutationFn, onChanged, empty }) {
  const [form, setForm] = useState({});
  const mutation = useMutation({
    mutationFn: async (p) => (await mutationFn(p)).data.data,
    onSuccess: () => { setForm({}); toast.success('Saved'); onChanged(); },
    onError: (e) => toast.error(apiError(e)),
  });
  const set = (k) => (e) => {
    if (k === '__save') return mutation.mutate(form);
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };
  return (
    <Section title={title} right={<span className="text-[11px] text-ink-400">{items?.length || 0} records</span>}>
      <div className="rounded-xl border border-ink-200 p-3">
        {children(form, set)}
      </div>
      <div className="mt-3 space-y-2">
        {!items?.length ? <EmptyState title="Nothing here yet" hint={empty} /> : items.map((it, i) => render(it, i))}
      </div>
    </Section>
  );
}

function NumInput({ label, k, form, set }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" type="number" value={form[k] ?? ''} onChange={set(k)} />
    </div>
  );
}
