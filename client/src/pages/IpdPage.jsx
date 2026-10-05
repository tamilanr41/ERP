import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Plus,
  X,
  BedDouble,
  Stethoscope,
  Users,
  Phone,
  DoorOpen,
  FileText,
  ShieldCheck,
  CalendarDays,
  ArrowUpRight,
  HeartPulse,
} from 'lucide-react';
import api, { apiError } from '../lib/api';
import PageHeader from '../components/ui/PageHeader';
import Pagination from '../components/ui/Pagination';
import { LoadingState, ErrorState, EmptyState, Spinner } from '../components/ui/Feedback';
import Badge, { badge } from '../components/ui/Badge';
import { formatDate, formatDateTime, durationLabel, cn } from '../lib/utils';

const ADMISSION_TYPES = { EMERGENCY: 'Emergency', ELECTIVE: 'Elective', OPD: 'From OPD', TRANSFER: 'Transfer' };

export default function IpdPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [showAdmit, setShowAdmit] = useState(false);
  const [openAdmission, setOpenAdmission] = useState(null);

  const admissions = useQuery({
    queryKey: ['ipd-admissions', { page }],
    queryFn: async ({ queryKey }) => (await api.get('/ipd/admissions', { params: queryKey[1] })).data,
  });

  const bedMap = useQuery({
    queryKey: ['ipd-bed-map'],
    queryFn: async () => (await api.get('/ipd/bed-map')).data.data,
  });

  return (
    <div className="p-6">
      <PageHeader
        title="IPD / Admissions"
        subtitle="In-patient admissions, care team, bed and discharge management"
        actions={
          <button className="btn-primary" onClick={() => setShowAdmit(true)}>
            <Plus className="h-4 w-4" /> Admit Patient
          </button>
        }
      />

      {showAdmit && <AdmitModal onClose={() => setShowAdmit(false)} onDone={() => { setShowAdmit(false); qc.invalidateQueries({ queryKey: ['ipd-admissions'] }); qc.invalidateQueries({ queryKey: ['ipd-bed-map'] }); }} />}
      {openAdmission && <AdmissionDetail admissionId={openAdmission} onClose={() => setOpenAdmission(null)} onChanged={() => { qc.invalidateQueries({ queryKey: ['ipd-admissions'] }); qc.invalidateQueries({ queryKey: ['ipd-bed-map'] }); }} />}

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
        {(() => {
          const b = bedMap.data || {};
          const pct = b.total ? Math.round(((b.occupied || 0) / b.total) * 100) : 0;
          return (
            <>
              <div className="card flex items-center gap-3 p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink-100 text-ink-600"><BedDouble className="h-5 w-5" /></div>
                <div><div className="text-[13px] text-ink-500">Total beds</div><div className="text-xl font-bold text-ink-900">{b.total ?? 0}</div></div>
              </div>
              <div className="card flex items-center gap-3 p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-red-600"><BedDouble className="h-5 w-5" /></div>
                <div><div className="text-[13px] text-ink-500">Occupied</div><div className="text-xl font-bold text-ink-900">{b.occupied ?? 0}</div></div>
              </div>
              <div className="card flex items-center gap-3 p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><DoorOpen className="h-5 w-5" /></div>
                <div><div className="text-[13px] text-ink-500">Available</div><div className="text-xl font-bold text-ink-900">{b.available ?? 0}</div></div>
              </div>
              <div className="card flex items-center gap-3 p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><Activity className="h-5 w-5" /></div>
                <div><div className="text-[13px] text-ink-500">Occupancy</div><div className="text-xl font-bold text-ink-900">{pct}%</div></div>
              </div>
            </>
          );
        })()}
      </div>

      <div className="mb-5 overflow-hidden card p-4">
        <h3 className="mb-3 text-sm font-semibold text-ink-800">Live Bed Map</h3>
        {bedMap.isLoading ? <LoadingState /> : bedMap.error ? <ErrorState message={apiError(bedMap.error)} /> : (
          <div className="space-y-4">
            {(bedMap.data?.wards || []).map((w) => (
              <div key={w._id}>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-brand-700">{w.name} {w.floorId?.name ? `· ${w.floorId.name}` : ''}</span>
                  <span className="text-xs text-ink-400">
                    {w.beds.filter((b) => b.status === 'OCCUPIED').length}/{w.beds.length} occupied
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6 lg:grid-cols-10">
                  {w.beds.map((bed) => (
                    <div
                      key={bed._id}
                      title={bed.status}
                      className={cn('rounded-md border px-2 py-1.5 text-center text-xs font-semibold transition hover:shadow-cardHover', {
                        'border-emerald-200 bg-emerald-50 text-emerald-800': bed.status === 'AVAILABLE',
                        'border-red-200 bg-red-50 text-red-700': bed.status === 'OCCUPIED',
                        'border-amber-200 bg-amber-50 text-amber-800': bed.status === 'RESERVED',
                        'border-ink-100 bg-ink-50 text-ink-500': bed.status === 'CLEANING',
                      })}
                    >
                      {bed.bedNumber}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        {admissions.isLoading ? <LoadingState /> : admissions.error ? (
          <ErrorState message={apiError(admissions.error)} />
        ) : !admissions.data?.data?.length ? (
          <EmptyState title="No admissions yet" hint="Admit a patient from the OPD, emergency or elective list" />
        ) : (
          <table className="table">
            <thead>
              <tr><th>Admission</th><th>Patient</th><th>Admission type</th><th>Department / Consultant</th><th>Bed</th><th>Admitted</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {admissions.data.data.map((a) => (
                <tr key={a._id} className="cursor-pointer" onClick={() => setOpenAdmission(a._id)}>
                  <td className="font-medium text-brand-700">{a.admissionNumber}</td>
                  <td>
                    <div className="font-medium text-ink-900">{a.patientId?.firstName} {a.patientId?.lastName || ''}</div>
                    <div className="text-xs text-ink-400">{a.patientId?.uhid}</div>
                  </td>
                  <td>{ADMISSION_TYPES[a.admissionType] || a.admissionType}</td>
                  <td>
                    <div>{a.departmentId?.name || '—'}</div>
                    <div className="text-xs text-ink-400">{a.consultantDoctorId?.name || ''}</div>
                  </td>
                  <td>{a.bedId?.bedNumber || '—'}</td>
                  <td>{formatDateTime(a.admittedAt)}</td>
                  <td>{badge(a.status)}</td>
                  <td className="text-right">
                    <button className="btn-icon-primary" onClick={(e) => { e.stopPropagation(); setOpenAdmission(a._id); }}>
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

function Activity(props) { return <HeartPulse {...props} />; }

function AdmissionDetail({ admissionId, onClose, onChanged }) {
  const { data: a, isLoading, error } = useQuery({
    queryKey: ['ipd-admission', admissionId],
    queryFn: async () => (await api.get(`/ipd/admissions/${admissionId}`)).data.data,
  });
  const [dischargeOpen, setDischargeOpen] = useState(false);

  if (isLoading) return <Modal onClose={onClose} wide><LoadingState label="Loading admission…" /></Modal>;
  if (error) return <Modal onClose={onClose} wide><ErrorState message={apiError(error)} /></Modal>;

  const stayDays = a.admittedAt ? durationLabel(new Date(a.admittedAt), new Date()) : null;

  return (
    <Modal onClose={onClose} wide>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-ink-900">{a.admissionNumber}</h2>
            {badge(a.status)}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-500">
            <span className="font-semibold text-ink-800">{a.patientId?.firstName} {a.patientId?.lastName}</span>
            <span className="font-mono text-xs">UHID {a.patientId?.uhid}</span>
            <span>{ADMISSION_TYPES[a.admissionType] || a.admissionType}</span>
            <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> Admitted {formatDateTime(a.admittedAt)}</span>
            {stayDays && <span className="font-medium text-brand-700">{stayDays} in hospital</span>}
          </div>
        </div>
        {a.status === 'ADMITTED' && (
          <button className="btn-danger text-xs" onClick={() => setDischargeOpen(true)}>Discharge patient</button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-ink-200 px-3 py-2">
          <div className="flex items-center gap-1 text-[11px] font-medium text-ink-400"><BedDouble className="h-3.5 w-3.5" /> Bed</div>
          <div className="text-sm font-semibold text-ink-800">{a.bedId?.bedNumber || '—'} <span className="text-xs text-ink-400">{a.wardId?.name || a.roomId?.name || ''}</span></div>
        </div>
        <div className="rounded-lg border border-ink-200 px-3 py-2">
          <div className="flex items-center gap-1 text-[11px] font-medium text-ink-400"><Stethoscope className="h-3.5 w-3.5" /> Consultant</div>
          <div className="text-sm font-semibold text-ink-800">{a.consultantDoctorId?.name || a.admittingDoctor?.name || '—'}</div>
          <div className="text-xs text-ink-400">{a.departmentId?.name || ''}</div>
        </div>
        <div className="rounded-lg border border-ink-200 px-3 py-2">
          <div className="flex items-center gap-1 text-[11px] font-medium text-ink-400"><ShieldCheck className="h-3.5 w-3.5" /> Insurance</div>
          <div className="text-sm font-semibold text-ink-800">{a.insurancePolicyId?.policyNumber || 'Not on insurance'}</div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-ink-200 px-3 py-2">
          <div className="text-[11px] font-medium uppercase tracking-wide text-ink-400">Admitting diagnosis</div>
          <div className="text-sm text-ink-800">{a.admittingDiagnosis || '—'}</div>
        </div>
        <div className="rounded-lg border border-ink-200 px-3 py-2">
          <div className="text-[11px] font-medium uppercase tracking-wide text-ink-400">Chief complaint</div>
          <div className="text-sm text-ink-800">{a.chiefComplaint || '—'}</div>
        </div>
      </div>

      {(a.careTeam?.length > 0) && (
        <div className="mt-3 rounded-lg border border-ink-200 px-3 py-2">
          <div className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-ink-400"><Users className="h-3.5 w-3.5" /> Care team</div>
          <div className="flex flex-wrap gap-1.5">
            {a.careTeam.map((m, i) => (
              <span key={i} className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-200">
                {m.doctorId?.name || 'Consultant'} {m.role ? `· ${m.role}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {a.attendant?.name && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-ink-200 px-3 py-2 text-sm">
          <Phone className="h-3.5 w-3.5 text-ink-400" />
          <span className="text-ink-400">Attendant:</span>
          <b className="text-ink-800">{a.attendant.name}</b>
          {a.attendant.relation && <span className="text-xs text-ink-400">{a.attendant.relation}</span>}
          {a.attendant.phone && <span className="font-mono text-xs text-ink-400">{a.attendant.phone}</span>}
        </div>
      )}

      {a.notes && <div className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-700"><b>Notes:</b> {a.notes}</div>}

      {a.status === 'DISCHARGED' && a.dischargeSummaryId && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2">
          <div className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-emerald-600"><FileText className="h-3.5 w-3.5" /> Discharge summary</div>
          <div className="mt-1 text-sm text-ink-800">
            {a.dischargeSummaryId.finalDiagnosis && <><b>Final diagnosis:</b> {a.dischargeSummaryId.finalDiagnosis}<br /></>}
            {a.dischargeSummaryId.treatmentGiven && <><b>Treatment given:</b> {a.dischargeSummaryId.treatmentGiven}<br /></>}
            {a.dischargeSummaryId.advice && <><b>Advice:</b> {a.dischargeSummaryId.advice}<br /></>}
            Discharged on {formatDateTime(a.dischargedAt)}
          </div>
        </div>
      )}

      {dischargeOpen && <DischargeModal admission={a} onClose={() => setDischargeOpen(false)} onDone={() => { setDischargeOpen(false); onChanged(); }} />}
    </Modal>
  );
}

function DischargeModal({ admission, onClose, onDone }) {
  const [finalDiagnosis, setFinalDiagnosis] = useState('');
  const [treatmentGiven, setTreatmentGiven] = useState('');
  const [advice, setAdvice] = useState('');
  const mutation = useMutation({
    mutationFn: async () =>
      (await api.post(`/ipd/admissions/${admission._id}/discharge`, {
        summary: { finalDiagnosis: finalDiagnosis || admission.admittingDiagnosis, treatmentGiven: treatmentGiven || undefined, advice: advice || undefined },
      })).data.data,
    onSuccess: () => { toast.success('Patient discharged — bed set to cleaning'); onDone(); },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <Modal onClose={onClose}>
      <h2 className="mb-1 text-lg font-bold text-ink-900">Discharge & summary</h2>
      <p className="mb-3 text-xs text-ink-500">{admission.admissionNumber} · {admission.patientId?.firstName} {admission.patientId?.lastName}</p>
      <div className="space-y-3">
        <div><label className="label">Final diagnosis</label><input className="input" value={finalDiagnosis} onChange={(e) => setFinalDiagnosis(e.target.value)} /></div>
        <div><label className="label">Treatment given</label><textarea className="input" rows={2} value={treatmentGiven} onChange={(e) => setTreatmentGiven(e.target.value)} /></div>
        <div><label className="label">Advice / instructions</label><textarea className="input" rows={2} value={advice} onChange={(e) => setAdvice(e.target.value)} /></div>
        <button className="btn-danger w-full" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? <Spinner className="h-4 w-4 text-white" /> : 'Confirm Discharge'}
        </button>
      </div>
    </Modal>
  );
}

function AdmitModal({ onClose, onDone }) {
  const [patientId, setPatientId] = useState('');
  const [bedId, setBedId] = useState('');
  const [admissionType, setAdmissionType] = useState('ELECTIVE');
  const [primaryDiagnosis, setPrimaryDiagnosis] = useState('');
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [notes, setNotes] = useState('');

  const { data: patients } = useQuery({
    queryKey: ['ipd-patients'],
    queryFn: async () => (await api.get('/patients', { params: { limit: 100 } })).data.data,
  });
  const { data: beds } = useQuery({
    queryKey: ['ipd-beds'],
    queryFn: async () => (await api.get('/ipd/beds', { params: { limit: 100 } })).data.data,
  });

  const mutation = useMutation({
    mutationFn: async (p) => (await api.post('/ipd/admissions', p)).data.data,
    onSuccess: (a) => { toast.success(`Admitted: ${a.admissionNumber}`); onDone(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const available = (beds || []).filter((b) => b.status === 'AVAILABLE' || b.status === 'RESERVED');

  const submit = () => {
    if (!patientId) return toast.error('Select a patient');
    if (!bedId) return toast.error('Select a bed');
    mutation.mutate({
      patientId,
      bedId,
      admissionType,
      admittingDiagnosis: primaryDiagnosis || undefined,
      chiefComplaint: chiefComplaint || undefined,
      notes: notes || undefined,
    });
  };

  return (
    <Modal onClose={onClose}>
      <h2 className="mb-4 text-lg font-bold text-ink-900">Admit Patient</h2>
      <div className="space-y-4">
        <div>
          <label className="label">Patient *</label>
          <select className="select" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
            <option value="">Select…</option>
            {patients?.map((p) => <option key={p._id} value={p._id}>{p.uhid} · {p.firstName} {p.lastName || ''}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Admission type</label>
          <select className="select" value={admissionType} onChange={(e) => setAdmissionType(e.target.value)}>
            {Object.entries(ADMISSION_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Bed *</label>
          <select className="select" value={bedId} onChange={(e) => setBedId(e.target.value)}>
            <option value="">Select…</option>
            {available.map((b) => <option key={b._id} value={b._id}>{b.bedNumber} ({b.wardName || b.wardId?.name || 'ward'})</option>)}
          </select>
          {!available.length && <p className="mt-1 text-xs text-amber-400">No available beds.</p>}
        </div>
        <div>
          <label className="label">Admitting diagnosis</label>
          <input className="input" value={primaryDiagnosis} onChange={(e) => setPrimaryDiagnosis(e.target.value)} />
        </div>
        <div>
          <label className="label">Chief complaint</label>
          <input className="input" value={chiefComplaint} onChange={(e) => setChiefComplaint(e.target.value)} />
        </div>
        <div>
          <label className="label">Notes</label>
          <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <button className="btn-primary w-full" disabled={mutation.isPending} onClick={submit}>
          {mutation.isPending ? <Spinner className="h-4 w-4 text-white" /> : 'Confirm Admission'}
        </button>
      </div>
    </Modal>
  );
}

function Modal({ children, onClose, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/60 p-4 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className={cn('card my-8 w-full animate-slide-up p-6', wide ? 'max-w-3xl' : 'max-w-lg')}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="btn-icon float-right -mr-1 -mt-1">
          <X className="h-5 w-5" />
        </button>
        {children}
      </div>
    </div>
  );
}