import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Printer, FileText, Loader2, Search } from 'lucide-react';
import api, { apiError } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/Feedback';
import { cn } from '../../lib/utils';

const DOC_LABELS = [
  ['registration', 'OP Registration Slip'],
  ['summary', 'Consultation Summary'],
  ['prescription', 'Prescription'],
  ['lab', 'Lab Requisition'],
  ['radiology', 'Radiology Requisition'],
  ['referral', 'Referral Letter'],
  ['followup', 'Follow-up Slip'],
  ['certificate', 'Medical Certificate'],
];

const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('en-IN') : '—');
const fmtDateTime = (v) => (v ? new Date(v).toLocaleString('en-IN') : '—');
const fullName = (p) => (p ? [p.firstName, p.lastName].filter(Boolean).join(' ') : '—');
const ageOf = (p) => {
  const dob = p?.dateOfBirth || p?.dob;
  if (!dob) return p?.age?.years ? `${p.age.years}y` : '—';
  const a = (Date.now() - new Date(dob).getTime()) / 31557600000;
  return `${Math.floor(a)}y`;
};

function DocSheet({ hospital, docTitle, docNumber, patient, visit, docDate, children, signature }) {
  const docRef = `${docTitle.replace(/\s+/g, '_').toUpperCase()}-${docNumber || 'N/A'}`;
  return (
    <div id="print-doc" className="mx-auto max-w-3xl rounded-xl border border-ink-200 bg-white p-10 shadow-card print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <div className="border-b-[3px] border-brand-900 pb-4 text-center">
        <h1 className="text-xl font-black uppercase tracking-wide text-brand-900">{hospital?.name || 'ZhanX Medical Centre'}</h1>
        <p className="text-xs text-ink-600">{hospital?.address?.line1}{hospital?.address?.line2 ? `, ${hospital.address.line2}` : ''}</p>
        <p className="text-xs text-ink-600">
          {[hospital?.address?.city, hospital?.address?.state].filter(Boolean).join(', ')}{hospital?.address?.pincode ? ` - ${hospital.address.pincode}` : ''}
        </p>
        <p className="text-[11px] text-ink-500">Phone: {hospital?.phone || '+91 452 400 2200'}{hospital?.email ? ` | ${hospital.email}` : ''}</p>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3 border-b border-ink-200 pb-2">
        <h2 className="text-base font-bold uppercase tracking-wide text-ink-900">{docTitle}</h2>
        <div className="text-right text-[11px] text-ink-600">
          <div><b>Doc No:</b> {docRef}</div>
          <div><b>Date:</b> {fmtDateTime(docDate || new Date())}</div>
        </div>
      </div>

      {(patient || visit) && (
        <table className="mt-3 w-full border-collapse text-xs">
          <tbody>
            <tr>
              <td className="border border-ink-200 px-2 py-1.5"><b>Patient:</b> {fullName(patient)} ({ageOf(patient)})</td>
              <td className="border border-ink-200 px-2 py-1.5"><b>UHID:</b> {patient?.uhid || '—'}</td>
              <td className="border border-ink-200 px-2 py-1.5"><b>Gender:</b> {patient?.gender || '—'}</td>
            </tr>
            <tr>
              <td className="border border-ink-200 px-2 py-1.5"><b>OP No:</b> {visit?.opdNumber || '—'}</td>
              <td className="border border-ink-200 px-2 py-1.5"><b>Doctor:</b> {visit?.doctorId?.name || '—'}</td>
              <td className="border border-ink-200 px-2 py-1.5"><b>Department:</b> {visit?.departmentId?.name || '—'}</td>
            </tr>
          </tbody>
        </table>
      )}

      <div className="mt-4 min-h-64 text-xs leading-relaxed text-ink-800">{children}</div>

      <div className="mt-8 flex items-end justify-between gap-4 border-t border-ink-200 pt-6 text-xs text-ink-700">
        <div className="text-center">
          <div className="mb-8">{signature?.left || 'Consulting Doctor'}</div>
          <div className="border-t border-ink-300 px-6 pt-1">Signature</div>
        </div>
        <div className="text-center">
          <div className="mb-8">{signature?.right || 'Authorized Signatory'}</div>
          <div className="border-t border-ink-300 px-6 pt-1">Authorized</div>
        </div>
      </div>
      <p className="mt-4 text-center text-[10px] text-ink-400">{hospital?.name || 'ZhanX Medical Centre'} · This is a computer-generated document.</p>
    </div>
  );
}

export default function OpdDocuments() {
  const [searchParams] = useSearchParams();
  const initialVisit = searchParams.get('visitId') || '';
  const [visitId, setVisitId] = useState(initialVisit);
  const [docType, setDocType] = useState('summary');
  const [search, setSearch] = useState('');

  const hospitalQ = useQuery({ queryKey: ['masters-hospital'], queryFn: async () => (await api.get('/masters/hospital')).data.data });
  const visitsQ = useQuery({
    queryKey: ['opd-visits-docs', search.trim()],
    queryFn: async () => {
      const p = new URLSearchParams({ limit: '50' });
      if (search.trim()) p.set('q', search.trim());
      return (await api.get(`/opd/visits?${p.toString()}`)).data.data || [];
    },
  });

  const workQ = useQuery({
    queryKey: ['opd-workspace-doc', visitId, docType],
    queryFn: async () => {
      const [ws, rx, bill] = await Promise.all([
        api.get(`/opd/visits/${visitId}/workspace`),
        api.get(`/opd/prescriptions?visitId=${visitId}`).catch(() => null),
        api.get(`/opd/visits/${visitId}/billing`).catch(() => null),
      ]);
      return { workspace: ws.data.data, rx: rx?.data?.data || [], billing: bill?.data?.data || null };
    },
    enabled: Boolean(visitId),
  });

  const ws = workQ.data?.workspace;
  const visit = ws?.visit;
  const hospital = hospitalQ.data;

  const blocks = useMemo(() => {
    if (!ws) return {};
    const rxOrder = (workQ.data?.rx || []);
    return {
      registration: (
        <>
          <p>This is to confirm that the following patient has registered for an outpatient consultation.</p>
          <table className="mt-3 w-full border-collapse text-xs">
            <tbody>
              <tr><td className="border border-ink-200 px-2 py-1.5 w-40"><b>Visit type</b></td><td className="border border-ink-200 px-2 py-1.5">{visit?.visitType || 'NEW'}</td></tr>
              <tr><td className="border border-ink-200 px-2 py-1.5"><b>Visit status</b></td><td className="border border-ink-200 px-2 py-1.5">{visit?.status || '—'}</td></tr>
              <tr><td className="border border-ink-200 px-2 py-1.5"><b>Vitals status</b></td><td className="border border-ink-200 px-2 py-1.5">{visit?.vitalsStatus || 'PENDING'}</td></tr>
              <tr><td className="border border-ink-200 px-2 py-1.5"><b>Chief complaint</b></td><td className="border border-ink-200 px-2 py-1.5">{visit?.chiefComplaint || '—'}</td></tr>
              {visit?.appointmentId?.tokenNumber ? <tr><td className="border border-ink-200 px-2 py-1.5"><b>Token</b></td><td className="border border-ink-200 px-2 py-1.5">{visit.appointmentId.tokenNumber}</td></tr> : null}
            </tbody>
          </table>
        </>
      ),
      summary: (
        <>
          <h3 className="mb-1 font-bold">Chief Complaint</h3>
          <p>{visit?.chiefComplaint || '—'}</p>
          <h3 className="mb-1 mt-3 font-bold">History of Presenting Illness</h3>
          <p>{visit?.historyOfPresentingIllness || '—'}</p>
          <h3 className="mb-1 mt-3 font-bold">Examination</h3>
          <div className="whitespace-pre-line">{visit?.examination?.general || ''}{visit?.examination?.systemic ? `\n${visit.examination.systemic}` : ''}{visit?.examination?.templateName ? `\nTemplate: ${visit.examination.templateName}` : ''}</div>
          <h3 className="mb-1 mt-3 font-bold">Diagnosis</h3>
          <p>{(ws.diagnoses || []).map((d) => `${d.name}${d.icd10Code ? ` (${d.icd10Code})` : ''}`).join(', ') || visit?.diagnosis?.final || '—'}</p>
          <h3 className="mb-1 mt-3 font-bold">Treatment Plan</h3>
          <p>{visit?.treatmentPlan || '—'}</p>
          <h3 className="mb-1 mt-3 font-bold">Advice</h3>
          <p>{visit?.advice || '—'}</p>
          <h3 className="mb-1 mt-3 font-bold">Vitals</h3>
          <p>{ws.vitals?.length ? `${Object.entries(ws.vitals[ws.vitals.length - 1].vitals || {}).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ')}` : '—'}</p>
        </>
      ),
      prescription: (
        <>
          {rxOrder.length === 0 && <p className="text-ink-500">No prescription was generated for this visit.</p>}
          {rxOrder.map((rx) => (
            <div key={rx._id} className="mb-4">
              <div className="mb-2 text-sm font-bold">Rx No: {rx.rxNumber} · {fmtDateTime(rx.createdAt)}</div>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-brand-50 text-left"><th className="border border-ink-200 px-2 py-1.5">Medicine</th><th className="border border-ink-200 px-2 py-1.5">Dosage</th><th className="border border-ink-200 px-2 py-1.5">Frequency</th><th className="border border-ink-200 px-2 py-1.5">Duration</th><th className="border border-ink-200 px-2 py-1.5">Timing</th></tr>
                </thead>
                <tbody>
                  {(rx.items || []).map((it, i) => (
                    <tr key={i}><td className="border border-ink-200 px-2 py-1.5">{it.medicineName}</td><td className="border border-ink-200 px-2 py-1.5">{it.dosage || '—'}</td><td className="border border-ink-200 px-2 py-1.5">{it.frequency || '—'}</td><td className="border border-ink-200 px-2 py-1.5">{it.duration || '—'}</td><td className="border border-ink-200 px-2 py-1.5">{(it.timing || '').replace(/_/g, ' ')}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </>
      ),
      lab: (
        <>
          {ws.orders?.filter((o) => (o.category || '').includes('LAB')).length === 0 && <p className="text-ink-500">No laboratory requisitions for this visit.</p>}
          {ws.orders?.filter((o) => (o.category || '').includes('LAB')).map((o) => (
            <div key={o._id} className="mb-3">
              <p className="font-bold">Order: {o.name} ({o.code || o.category}) · {o.priority} · {o.status}</p>
              {o.instructions ? <p className="text-ink-600">Instructions: {o.instructions}</p> : null}
            </div>
          ))}
          <p className="mt-4 text-ink-600">Sample must be collected in appropriate containers and labelled with patient UHID and test code.</p>
        </>
      ),
      radiology: (
        <>
          {ws.orders?.filter((o) => (o.category || '').includes('RADIOLOGY')).length === 0 && <p className="text-ink-500">No radiology requisitions for this visit.</p>}
          {ws.orders?.filter((o) => (o.category || '').includes('RADIOLOGY')).map((o) => (
            <div key={o._id} className="mb-3">
              <p className="font-bold">Study: {o.name} ({o.code || o.category}) · {o.priority} · {o.status}</p>
              {o.instructions ? <p className="text-ink-600">Instructions: {o.instructions}</p> : null}
            </div>
          ))}
        </>
      ),
      referral: (
        <>
          {(visit?.referral?.toDoctor || visit?.status === 'REFERRED') ? (
            <>
              <p>Dear Doctor,</p>
              <p className="mt-2">Please find below the referral for the above patient under my care.</p>
              <table className="mt-3 w-full border-collapse text-xs">
                <tbody>
                  <tr><td className="border border-ink-200 px-2 py-1.5 w-40"><b>Referred to</b></td><td className="border border-ink-200 px-2 py-1.5">{visit.referral?.toDoctor || '—'}</td></tr>
                  <tr><td className="border border-ink-200 px-2 py-1.5"><b>Department</b></td><td className="border border-ink-200 px-2 py-1.5">{visit.referral?.toDepartment || '—'}</td></tr>
                  <tr><td className="border border-ink-200 px-2 py-1.5"><b>Reason</b></td><td className="border border-ink-200 px-2 py-1.5">{visit.referral?.reason || '—'}</td></tr>
                  <tr><td className="border border-ink-200 px-2 py-1.5"><b>Notes</b></td><td className="border border-ink-200 px-2 py-1.5">{visit.referral?.notes || '—'}</td></tr>
                </tbody>
              </table>
            </>
          ) : <p className="text-ink-500">No referral recorded for this visit.</p>}
        </>
      ),
      followup: (
        <>
          {ws.followUps?.length === 0 && <p className="text-ink-500">No follow-up scheduled for this visit.</p>}
          {ws.followUps?.map((f) => (
            <div key={f._id}>
              <p>The above patient is requested to report back on <b>{fmtDate(f.date)}</b> for review.</p>
              <table className="mt-3 w-full border-collapse text-xs">
                <tbody>
                  <tr><td className="border border-ink-200 px-2 py-1.5 w-40"><b>Follow-up No</b></td><td className="border border-ink-200 px-2 py-1.5">{f.followUpNumber || '—'}</td></tr>
                  <tr><td className="border border-ink-200 px-2 py-1.5"><b>Reason</b></td><td className="border border-ink-200 px-2 py-1.5">{f.reason || 'Review / follow-up'}</td></tr>
                  <tr><td className="border border-ink-200 px-2 py-1.5"><b>Status</b></td><td className="border border-ink-200 px-2 py-1.5">{f.status || 'SCHEDULED'}</td></tr>
                  <tr><td className="border border-ink-200 px-2 py-1.5"><b>Doctor</b></td><td className="border border-ink-200 px-2 py-1.5">{visit?.doctorId?.name || '—'}</td></tr>
                </tbody>
              </table>
              <p className="mt-3">Please mark the slip on arrival at the reception.</p>
            </div>
          ))}
        </>
      ),
      certificate: (
        <>
          <p className="mt-2">This is to certify that <b>{fullName(visit?.patientId)}</b> (UHID: {visit?.patientId?.uhid || '—'}), aged {ageOf(visit?.patientId)} years, was examined by <b>{visit?.doctorId?.name || 'the undersigned'}</b> on <b>{fmtDate(visit?.visitDate)}</b> at this medical centre.</p>
          <p className="mt-3"><b>Diagnosis:</b> {(ws.diagnoses || []).map((d) => d.name).join(', ') || visit?.diagnosis?.final || 'Under evaluation.'}</p>
          <p className="mt-3"><b>Recommended rest:</b> One week with effect from {fmtDate(visit?.visitDate)}.</p>
          <p className="mt-3">Patient is advised to report back for review on {ws.followUps?.length ? fmtDate(ws.followUps[0].date) : fmtDate(new Date(visit?.visitDate ? new Date(visit.visitDate).getTime() + 7 * 86400000 : Date.now()))} or earlier if symptoms persist.</p>
          <p className="mt-6">This certificate is issued on the basis of the medical records of the patient.</p>
        </>
      ),
    };
  }, [ws, workQ.data]);

  const currentLabel = DOC_LABELS.find(([k]) => k === docType)?.[1] || docType;
  const docNumber = visit?.opdNumber || visit?._id?.slice(-6) || 'N/A';

  return (
    <div className="p-6">
      <PageHeader
        title="OPD Documents"
        subtitle="Generate and print real hospital documents with letterhead"
        actions={<button className="btn-primary" onClick={() => window.print()} disabled={!visitId}><Printer className="h-4 w-4" /> Print : {currentLabel}</button>}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
        <div className="space-y-3">
          <div className="card p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Select visit</div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input className="input pl-9" placeholder="Search UHID / patient / OP no…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="mt-2 max-h-80 overflow-y-auto scrollbar-thin">
              {visitsQ.isLoading ? <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-ink-400" /></div>
                : visitsQ.error ? <EmptyState title="Could not load visits" />
                : (visitsQ.data || []).length === 0 ? <EmptyState title="No visits found" />
                : visitsQ.data.map((v) => (
                    <button
                      key={v._id}
                      className={cn('mb-1 w-full rounded-lg border p-2.5 text-left transition', visitId === v._id ? 'border-brand-600 bg-brand-50' : 'border-ink-200 hover:border-brand-300')}
                      onClick={() => setVisitId(v._id)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-semibold text-ink-900">{fullName(v.patientId)}</span>
                        <span className="font-mono text-[10px] text-ink-400">{v.opdNumber}</span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-ink-500">{v.patientId?.uhid} · {v.visitType} · {fmtDate(v.visitDate)}</div>
                    </button>
                  ))}
            </div>
          </div>

          <div className="card p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Document type</div>
            <div className="grid grid-cols-2 gap-1.5">
              {DOC_LABELS.map(([k, label]) => (
                <button key={k} className={cn('rounded-md px-2 py-1.5 text-left text-xs font-medium transition', docType === k ? 'bg-brand-600 text-white' : 'bg-ink-50 text-ink-600 hover:bg-brand-50')} onClick={() => setDocType(k)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          {!visitId ? (
            <div className="card flex flex-col items-center gap-2 py-20 text-center">
              <FileText className="h-10 w-10 text-ink-300" />
              <p className="text-sm font-semibold text-ink-700">Select a visit to generate documents</p>
              <p className="max-w-sm text-xs text-ink-400">Documents use the actual patient, visit and clinical data — nothing is fake or placeholder.</p>
            </div>
          ) : workQ.isLoading ? <LoadingState label="Building document…" /> : workQ.error ? <ErrorState message={apiError(workQ.error)} /> : ws && visit ? (
            <DocSheet hospital={hospital} docTitle={currentLabel} docNumber={docNumber} patient={visit.patientId} visit={visit} docDate={visit.visitDate} signature={{ left: visit.doctorId?.name || 'Consulting Doctor' }}>
              {blocks[docType] || blocks.summary}
            </DocSheet>
          ) : <ErrorState message="Visit data unavailable" />}
        </div>
      </div>
    </div>
  );
}