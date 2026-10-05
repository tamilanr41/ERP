import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Plus,
  X,
  Search,
  UserPlus,
  BedDouble,
  Stethoscope,
  CalendarDays,
  ArrowUpRight,
  ShieldCheck,
  Clock3,
} from 'lucide-react';
import api, { apiError } from '../../lib/api';
import { admissionPath } from '../../lib/admissionPath';
import PageHeader from '../../components/ui/PageHeader';
import { LoadingState, ErrorState, EmptyState, Spinner } from '../../components/ui/Feedback';
import Pagination from '../../components/ui/Pagination';
import { badge } from '../../components/ui/Badge';
import { formatDate, formatDateTime, cn } from '../../lib/utils';

const ADMISSION_TYPES = [
  ['EMERGENCY', 'Emergency'],
  ['ELECTIVE', 'Elective'],
  ['OPD', 'From OPD'],
  ['TRANSFER', 'Transfer from hospital'],
  ['DAY_CARE', 'Day Care'],
];
const PRIORITIES = ['ROUTINE', 'URGENT', 'STAT'];
const PAYMENT_CATEGORIES = ['CASH', 'INSURANCE', 'SPONSOR', 'CREDIT', 'GOVT_SCHEME'];

export default function IpdAdmissions() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [debounce, setDebounce] = useState('');
  // Section 48: Alt+A deep-links here with ?new=1 to open the admission form
  const [showAdmit, setShowAdmit] = useState(params.get('new') === '1');

  useEffect(() => {
    if (params.get('new') === '1') {
      setShowAdmit(true);
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const admissions = useQuery({
    queryKey: ['ipd-admissions', { page, status, q: debounce }],
    queryFn: async ({ queryKey }) => (await api.get('/ipd/admissions', { params: queryKey[1] })).data,
  });

  const onSearch = (e) => {
    setQ(e.target.value);
    clearTimeout(onSearch.t);
    onSearch.t = setTimeout(() => { setDebounce(e.target.value.trim()); setPage(1); }, 400);
  };

  return (
    <div className="p-6">
      <PageHeader
        title="IPD Admissions"
        subtitle="Register in-patient admissions, track bed allocation and discharge"
        actions={
          <button className="btn-primary" onClick={() => setShowAdmit(true)}>
            <Plus className="h-4 w-4" /> New Admission
          </button>
        }
      />

      {showAdmit && (
        <AdmitModal
          onClose={() => setShowAdmit(false)}
          onDone={() => {
            setShowAdmit(false);
            qc.invalidateQueries({ queryKey: ['ipd-admissions'] });
            qc.invalidateQueries({ queryKey: ['ipd-command-center'] });
          }}
        />
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input className="input h-9 w-56 pl-8 text-xs" placeholder="IP no. / UHID / name / mobile…" value={q} onChange={onSearch} />
        </div>
        <select className="select h-9 w-40 text-xs" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          {['ADMISSION_REQUESTED', 'APPROVED', 'WAITING_FOR_BED', 'BED_ALLOCATED', 'ADMITTED', 'TRANSFERRED', 'DISCHARGE_PLANNED', 'DISCHARGED', 'CANCELLED'].map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      <div className="card overflow-hidden">
        {admissions.isLoading ? (
          <LoadingState />
        ) : admissions.error ? (
          <ErrorState message={apiError(admissions.error)} />
        ) : !admissions.data?.data?.length ? (
          <EmptyState title="No admissions found" hint="Admit a patient from OPD, emergency or elective list" />
        ) : (
          <table className="table">
            <thead>
              <tr><th>IP Number</th><th>Patient</th><th>Type</th><th>Department / Consultant</th><th>Bed</th><th>Admitted</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {admissions.data.data.map((a) => (
                <tr key={a._id} className="cursor-pointer" onClick={() => navigate(admissionPath(a) || '/ipd/admissions')}>
                  <td className="font-mono text-xs font-semibold text-brand-700">{a.admissionNumber}</td>
                  <td>
                    <div className="font-medium text-ink-900">{a.patientId?.firstName} {a.patientId?.lastName || ''}</div>
                    <div className="text-[11px] text-ink-400">{a.patientId?.uhid}</div>
                  </td>
                  <td className="text-xs">{ADMISSION_TYPES_MAP[a.admissionType] || a.admissionType}</td>
                  <td>
                    <div className="text-xs text-ink-800">{a.departmentId?.name || '—'}</div>
                    <div className="text-[11px] text-ink-400">{a.consultantDoctorId?.name || ''}</div>
                  </td>
                  <td className="text-xs">{a.bedId?.bedNumber || <span className="text-amber-600">No bed</span>}</td>
                  <td className="text-xs">{a.admittedAt ? formatDateTime(a.admittedAt) : '—'}</td>
                  <td>{badge(a.status)}</td>
                  <td className="text-right">
                    <button className="btn-icon-primary" onClick={(e) => { e.stopPropagation(); navigate(admissionPath(a) || '/ipd/admissions'); }}>
                      <ArrowUpRight className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {admissions.data?.pagination && <Pagination {...admissions.data.pagination} onChange={setPage} />}
      </div>
    </div>
  );
}

const ADMISSION_TYPES_MAP = Object.fromEntries(ADMISSION_TYPES);

function AdmitModal({ onClose, onDone }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [patientId, setPatientId] = useState('');
  const [form, setForm] = useState({
    admissionType: 'ELECTIVE',
    priority: 'ROUTINE',
    departmentId: '',
    consultantDoctorId: '',
    admittingDiagnosis: '',
    provisionalDiagnosis: '',
    chiefComplaint: '',
    estimatedStayDays: '',
    paymentCategory: 'CASH',
    attendantName: '',
    attendantRelation: '',
    attendantPhone: '',
    sponsorName: '',
    sponsorRelation: '',
    sponsorCompany: '',
    notes: '',
    bedMode: 'none',
    bedId: '',
  });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const patients = useQuery({
    queryKey: ['ipd-patient-search', q],
    queryFn: async ({ queryKey }) => (await api.get('/patients', { params: { q: queryKey[1], limit: 30 } })).data.data,
    enabled: q.length > 1,
  });
  const departments = useQuery({
    queryKey: ['ipd-departments'],
    queryFn: async () => (await api.get('/masters/departments')).data.data,
  });
  const doctors = useQuery({
    queryKey: ['ipd-doctors'],
    queryFn: async () => (await api.get('/masters/doctors', { params: { limit: 200 } })).data.data,
  });
  const beds = useQuery({
    queryKey: ['ipd-beds-available'],
    queryFn: async () => (await api.get('/ipd/beds', { params: { limit: 200 } })).data.data,
  });

  const mutation = useMutation({
    mutationFn: async (p) => (await api.post('/ipd/admissions', p)).data.data,
    onSuccess: (a) => {
      toast.success(`Admitted ${a.admissionNumber}`);
      qc.invalidateQueries({ queryKey: ['ipd-admissions'] });
      qc.invalidateQueries({ queryKey: ['ipd-command-center'] });
      onDone();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const available = (beds.data || []).filter((b) => b.status === 'AVAILABLE' || b.status === 'RESERVED');

  const submit = () => {
    if (!patientId) return toast.error('Select a patient');
    if (form.bedMode === 'assign' && !form.bedId) return toast.error('Select a bed');
    mutation.mutate({
      patientId,
      admissionType: form.admissionType,
      priority: form.priority,
      departmentId: form.departmentId || undefined,
      consultantDoctorId: form.consultantDoctorId || undefined,
      admittingDiagnosis: form.admittingDiagnosis || undefined,
      provisionalDiagnosis: form.provisionalDiagnosis || undefined,
      chiefComplaint: form.chiefComplaint || undefined,
      estimatedStayDays: form.estimatedStayDays ? Number(form.estimatedStayDays) : undefined,
      paymentCategory: form.paymentCategory,
      bedId: form.bedMode === 'assign' ? form.bedId : undefined,
      attendant: {
        name: form.attendantName || undefined,
        relation: form.attendantRelation || undefined,
        phone: form.attendantPhone || undefined,
      },
      sponsor: form.sponsorName
        ? { name: form.sponsorName, relation: form.sponsorRelation, company: form.sponsorCompany || undefined }
        : undefined,
      notes: form.notes || undefined,
    });
  };

  const onSearch = (e) => {
    setSearch(e.target.value);
    clearTimeout(onSearch.t);
    onSearch.t = setTimeout(() => setQ(e.target.value.trim()), 400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/60 p-4 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="card my-8 w-full max-w-3xl animate-slide-up p-6" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="btn-icon float-right -mr-1 -mt-1"><X className="h-5 w-5" /></button>
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><UserPlus className="h-5 w-5" /></div>
          <div>
            <h2 className="text-lg font-bold text-ink-900">New IP Admission</h2>
            <p className="text-xs text-ink-500">Register an in-patient — with bed or put on waiting list</p>
          </div>
        </div>

        {/* Patient picker */}
        <div className="mt-4 rounded-xl border border-ink-200 p-3">
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-semibold text-ink-700">Patient *</label>
            <a href="/patients/new" className="text-[11px] font-medium text-brand-600 hover:underline">Register new patient →</a>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input className="input pl-8 text-sm" placeholder="Search by UHID, name or mobile…" value={search} onChange={onSearch} />
          </div>
          {patientId && (
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700 ring-1 ring-inset ring-emerald-200">
              <ShieldCheck className="h-3.5 w-3.5" /> {chosenPatient(patients.data, patientId)}
              <button className="ml-auto font-medium hover:underline" onClick={() => setPatientId('')}>Change</button>
            </div>
          )}
          {!patientId && q && patients.isSuccess && (
            <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-ink-100">
              {!patients.data?.length ? (
                <div className="px-3 py-2 text-[11px] text-ink-400">No patient found — register a new one.</div>
              ) : (
                patients.data.map((p) => (
                  <button key={p._id} onClick={() => setPatientId(p._id)} className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-brand-50/60">
                    <div>
                      <div className="text-sm font-medium text-ink-900">{p.firstName} {p.lastName || ''}</div>
                      <div className="text-[11px] text-ink-400">{p.uhid} · {p.gender || ''}{p.mobile ? ` · ${p.mobile}` : ''}</div>
                    </div>
                    <span className="text-[11px] font-medium text-brand-600">Select</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Admission type</label>
            <select className="select" value={form.admissionType} onChange={set('admissionType')}>
              {ADMISSION_TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Priority</label>
            <select className="select" value={form.priority} onChange={set('priority')}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Department</label>
            <select className="select" value={form.departmentId} onChange={set('departmentId')}>
              <option value="">Select…</option>
              {(departments.data || []).map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Consultant doctor</label>
            <select className="select" value={form.consultantDoctorId} onChange={set('consultantDoctorId')}>
              <option value="">Select…</option>
              {(doctors.data || []).map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Admitting diagnosis</label>
            <input className="input" value={form.admittingDiagnosis} onChange={set('admittingDiagnosis')} />
          </div>
          <div>
            <label className="label">Provisional diagnosis</label>
            <input className="input" value={form.provisionalDiagnosis} onChange={set('provisionalDiagnosis')} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Chief complaint</label>
            <input className="input" value={form.chiefComplaint} onChange={set('chiefComplaint')} />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="label">Payment category</label>
            <select className="select" value={form.paymentCategory} onChange={set('paymentCategory')}>
              {PAYMENT_CATEGORIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Estimated stay (days)</label>
            <input className="input" type="number" min="1" value={form.estimatedStayDays} onChange={set('estimatedStayDays')} />
          </div>
          <div>
            <label className="label">Bed</label>
            <select className="select" value={form.bedMode} onChange={set('bedMode')}>
              <option value="assign">Assign bed now</option>
              <option value="none">Wait for bed</option>
            </select>
          </div>
          {form.bedMode === 'assign' && (
            <div className="sm:col-span-3">
              <label className="label">Available beds</label>
              <SelectSearchable options={available} value={form.bedId} onChange={set('bedId')} placeholder="Choose an available bed…" />
              {!available.length && <p className="mt-1 text-xs text-amber-600">No available beds right now — switch to “Wait for bed”.</p>}
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="label">Attendant name</label>
            <input className="input" value={form.attendantName} onChange={set('attendantName')} />
          </div>
          <div>
            <label className="label">Relation</label>
            <input className="input" value={form.attendantRelation} onChange={set('attendantRelation')} />
          </div>
          <div>
            <label className="label">Attendant phone</label>
            <input className="input" value={form.attendantPhone} onChange={set('attendantPhone')} />
          </div>
        </div>

        {form.paymentCategory === 'SPONSOR' && (
          <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-ink-200 p-3 sm:grid-cols-3">
            <div>
              <label className="label">Sponsor name</label>
              <input className="input" value={form.sponsorName} onChange={set('sponsorName')} />
            </div>
            <div>
              <label className="label">Relation</label>
              <input className="input" value={form.sponsorRelation} onChange={set('sponsorRelation')} />
            </div>
            <div>
              <label className="label">Company</label>
              <input className="input" value={form.sponsorCompany} onChange={set('sponsorCompany')} />
            </div>
          </div>
        )}

        <div className="mt-3">
          <label className="label">Notes</label>
          <textarea className="input" rows={2} value={form.notes} onChange={set('notes')} />
        </div>

        <button className="btn-primary mt-4 w-full" disabled={mutation.isPending} onClick={submit}>
          {mutation.isPending ? <Spinner className="h-4 w-4 text-white" /> : (
            <>{form.bedMode === 'assign' ? <BedDouble className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
              {form.bedMode === 'assign' ? 'Confirm Admission (bed assigned)' : 'Add to Waiting List'}</>
          )}
        </button>
      </div>
    </div>
  );
}

function chosenPatient(list, id) {
  const p = (list || []).find((x) => String(x._id) === String(id));
  return p ? `${p.firstName} ${p.lastName || ''} · ${p.uhid}` : 'Patient selected';
}

function SelectSearchable({ options, value, onChange, placeholder }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const sel = options.find((b) => String(b._id) === String(value));
  const filtered = options.filter((b) => (b.bedNumber + (b.wardName || b.wardId?.name || '')).toLowerCase().includes(filter.toLowerCase()));
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="input flex w-full items-center justify-between text-left text-sm">
        <span className={cn(sel ? 'text-ink-900' : 'text-ink-400')}>{sel ? `${sel.bedNumber} · ${sel.wardName || sel.wardId?.name || 'ward'}` : placeholder}</span>
        <span className="text-ink-400">▾</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-ink-200 bg-white shadow-lg">
          <input autoFocus className="input border-0 border-b border-ink-100 rounded-none text-sm" placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="max-h-48 overflow-y-auto">
            {filtered.map((b) => (
              <button
                key={b._id}
                className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-brand-50/60"
                onClick={() => { onChange({ target: { value: b._id } }); setOpen(false); }}
              >
                <span>{b.bedNumber} · {b.wardName || b.wardId?.name || 'ward'}</span>
                {String(b._id) === String(value) && <span className="text-brand-600">✓</span>}
              </button>
            ))}
            {!filtered.length && <div className="px-3 py-2 text-xs text-ink-400">No matching beds</div>}
          </div>
        </div>
      )}
    </div>
  );
}