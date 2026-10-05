import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeftRight,
  Truck,
  Building2,
  Phone,
  FileText,
  Upload,
  Check,
  X,
} from 'lucide-react';
import api, { apiError } from '../../lib/api';
import { LoadingState, ErrorState, EmptyState, Spinner } from '../../components/ui/Feedback';
import { badge } from '../../components/ui/Badge';
import { formatDateTime, cn } from '../../lib/utils';

const TRANSFER_TYPES = [
  { value: 'WARD', label: 'Ward transfer' },
  { value: 'ICU', label: 'ICU transfer' },
  { value: 'OT', label: 'OT transfer' },
  { value: 'RADIOLOGY', label: 'Radiology transfer' },
  { value: 'LAB', label: 'Lab transfer' },
  { value: 'ANOTHER_HOSPITAL', label: 'Another hospital' },
];
const TRANSPORT = ['AMBULANCE', 'CAB', 'WHEELCHAIR', 'STRETCHER', 'WALKING', 'NEONATAL_AMBULANCE', 'BLUE_LIGHT'];
const STATUS_FLOW = ['REQUESTED', 'APPROVED', 'IN_PROGRESS', 'COMPLETED'];

const Section = ({ title, children, right }) => (
  <div className="card p-4">
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-sm font-bold text-ink-900">{title}</h3>
      {right}
    </div>
    {children}
  </div>
);

const loc = (t) => (t?.hospitalName
  ? t.hospitalName
  : [t?.wardName, t?.roomNumber, t?.bedNumber].filter(Boolean).join(' / ') || '—');

const TransferTab = ({ d, onChanged }) => {
  const qc = useQueryClient();
  const a = d.admission;
  const wards = useQuery({ queryKey: ['ipd-wards'], queryFn: async () => (await api.get('/ipd/wards')).data.data });
  const [form, setForm] = useState({ transferType: 'WARD', reason: '', toWardId: '', toBedId: '', hospitalName: '', transportMode: 'AMBULANCE', attendantName: '', attendantPhone: '', attendantRelation: '' });
  const [open, setOpen] = useState(false);

  const external = form.transferType === 'ANOTHER_HOSPITAL';
  const beds = useQuery({
    queryKey: ['ipd-beds', form.toWardId],
    queryFn: async () => (await api.get('/ipd/beds', { params: { wardId: form.toWardId, status: 'AVAILABLE' } })).data.data,
    enabled: !!form.toWardId && !external,
  });

  const create = useMutation({
    mutationFn: async () => (await api.post(`/ipd/admissions/${a._id}/transfers`, {
      transferType: form.transferType,
      reason: form.reason,
      to: external
        ? { hospitalName: form.hospitalName, hospitalAddress: form.hospitalAddress, contactNumber: form.contactNumber, contactPerson: form.contactPerson }
        : { wardId: form.toWardId, bedId: form.toBedId || undefined },
      transportMode: form.transportMode,
      attendantName: form.attendantName,
      attendantPhone: form.attendantPhone,
      attendantRelation: form.attendantRelation,
    })).data.data,
    onSuccess: (t) => { toast.success(`Transfer ${t.transferNumber} requested`); setForm({ ...form, reason: '' }); setOpen(false); qc.invalidateQueries({ queryKey: ['ipd-transfers', a._id] }); onChanged(); },
    onError: (e) => toast.error(apiError(e)),
  });
  const approve = useMutation({
    mutationFn: async ({ id, ok }) => (await api.patch(`/ipd/transfers/${id}/approve`, { approve: ok })).data.data,
    onSuccess: () => { toast.success('Transfer decision saved'); qc.invalidateQueries({ queryKey: ['ipd-transfers', a._id] }); onChanged(); },
    onError: (e) => toast.error(apiError(e)),
  });
  const complete = useMutation({
    mutationFn: async (id) => (await api.post(`/ipd/transfers/${id}/complete`, {})).data.data,
    onSuccess: (t) => { toast.success(t.transferType === 'ANOTHER_HOSPITAL' ? 'Patient transferred out — bed released' : 'Transfer completed — bed moved'); qc.invalidateQueries({ queryKey: ['ipd-transfers', a._id] }); onChanged(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const transfers = d.transfers || [];
  const set = (k) => (e) => setForm((x) => ({ ...x, [k]: e.target.value }));
  const ready = form.reason && (external ? form.hospitalName : form.toWardId);

  return (
    <div className="space-y-4">
      <Section title="Patient transfers" right={<button className="btn-secondary text-xs" onClick={() => setOpen((o) => !o)}>{open ? 'Close' : '+ Request transfer'}</button>}>
        {open && (
          <div className="mb-4 rounded-xl border border-ink-200 bg-ink-50/60 p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div>
                <label className="label">Transfer type</label>
                <select className="select" value={form.transferType} onChange={(e) => setForm((x) => ({ ...x, transferType: e.target.value, toBedId: '' }))}>
                  {TRANSFER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              {external ? (
                <div className="sm:col-span-2"><label className="label">Destination hospital *</label><input className="input" value={form.hospitalName} onChange={set('hospitalName')} /></div>
              ) : (
                <>
                  <div>
                    <label className="label">To ward *</label>
                    <select className="select" value={form.toWardId} onChange={(e) => setForm((x) => ({ ...x, toWardId: e.target.value, toBedId: '' }))}>
                      <option value="">Select…</option>
                      {(wards.data || []).filter((w) => w._id !== a.wardId?._id).map((w) => <option key={w._id} value={w._id}>{w.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">To bed</label>
                    <select className="select" value={form.toBedId} onChange={set('toBedId')} disabled={!form.toWardId}>
                      <option value="">Unassigned (ward move)</option>
                      {(beds.data || []).map((b) => <option key={b._id} value={b._id}>{b.code || b.bedNumber} · ₹{b.chargePerDay || 0}/day</option>)}
                    </select>
                  </div>
                </>
              )}
              <div>
                <label className="label">Transport</label>
                <select className="select" value={form.transportMode} onChange={set('transportMode')}>
                  {TRANSPORT.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2"><label className="label">Reason *</label><input className="input" value={form.reason} onChange={set('reason')} placeholder="e.g. Step-down care, ICU needed, higher centre" /></div>
              <div><label className="label">Attendant</label><input className="input" value={form.attendantName} onChange={set('attendantName')} /></div>
              <div><label className="label">Attendant phone</label><input className="input" value={form.attendantPhone} onChange={set('attendantPhone')} /></div>
              <div><label className="label">Relation</label><input className="input" value={form.attendantRelation} onChange={set('attendantRelation')} /></div>
              {external && (
                <>
                  <div><label className="label">Contact person</label><input className="input" value={form.contactPerson || ''} onChange={set('contactPerson')} /></div>
                  <div><label className="label">Contact number</label><input className="input" value={form.contactNumber || ''} onChange={set('contactNumber')} /></div>
                </>
              )}
            </div>
            <button className="btn-primary mt-3 text-xs" disabled={!ready || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? <Spinner className="h-4 w-4 text-white" /> : <ArrowLeftRight className="h-3.5 w-3.5" />} Request transfer
            </button>
          </div>
        )}

        {!transfers.length ? (
          <EmptyState title="No transfers" hint="Ward, ICU, OT, modality or hospital transfers appear here" />
        ) : (
          <div className="space-y-2">
            {transfers.map((t) => (
              <div key={t._id} className="rounded-xl border border-ink-100 px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-brand-700">{t.transferNumber}</span>
                      {badge(t.status)}
                      <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold text-ink-600">{String(t.transferType).replace(/_/g, ' ')}</span>
                      {t.transferType === 'ANOTHER_HOSPITAL' && <Truck className="h-3.5 w-3.5 text-rose-500" />}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-600">
                      <span>{loc(t.from)}</span><ArrowLeftRight className="h-3 w-3" /><span className="font-semibold">{loc(t.to)}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-ink-400">
                      {t.reason} · {String(t.transportMode).replace(/_/g, ' ')}
                      {t.requestedBy?.name ? ` · requested by ${t.requestedBy.name}` : ''}
                      {t.approvedBy?.name ? ` · approved by ${t.approvedBy.name}` : ''}
                      {` · ${formatDateTime(t.requestedAt)}`}
                    </div>
                    {(t.attendantName || t.to?.contactNumber) && (
                      <div className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-500">
                        <Phone className="h-3 w-3" />
                        {t.attendantName}{t.attendantPhone ? ` · ${t.attendantPhone}` : ''}
                        {t.to?.contactNumber ? ` · hospital ${t.to.contactNumber}` : ''}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    {t.status === 'REQUESTED' && (
                      <>
                        <button className="btn-primary text-[11px]" disabled={approve.isPending} onClick={() => approve.mutate({ id: t._id, ok: true })}><Check className="h-3 w-3" /> Approve</button>
                        <button className="btn-secondary text-[11px]" disabled={approve.isPending} onClick={() => approve.mutate({ id: t._id, ok: false })}><X className="h-3 w-3" /> Reject</button>
                      </>
                    )}
                    {['REQUESTED', 'APPROVED', 'IN_PROGRESS'].includes(t.status) && (
                      <button className="btn-secondary text-[11px]" disabled={complete.isPending} onClick={() => complete.mutate(t._id)}>Mark moved</button>
                    )}
                  </div>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {STATUS_FLOW.map((s) => (
                    <span key={s} className={cn('rounded px-1.5 py-0.5 text-[9px] font-bold uppercase', t.status === s ? 'bg-brand-600 text-white' : 'bg-ink-50 text-ink-400')}>{s}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
};

const DOCUMENTS = [
  'ADMISSION_FORM', 'CONSENT_FORM', 'INITIAL_ASSESSMENT', 'DOCTOR_PROGRESS_NOTE', 'NURSING_NOTE',
  'INVESTIGATION_REPORT', 'RADIOLOGY_REPORT', 'PRESCRIPTION', 'MAR', 'PROCEDURE_NOTES', 'OPERATION_NOTES',
  'INSURANCE_DOCUMENT', 'DISCHARGE_SUMMARY', 'FINAL_BILL', 'RECEIPT', 'ADVANCE_RECEIPT', 'TRANSFER_NOTE', 'IDENTITY_PROOF', 'OTHER',
];

const DocumentsTab = ({ d }) => {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', documentType: 'CONSENT_FORM', fileName: '', fileUrl: '' });
  const link = useMutation({
    mutationFn: async () => (await api.post(`/ipd/admissions/${d.admission._id}/documents`, form)).data.data,
    onSuccess: () => { toast.success('Document linked'); setOpen(false); setForm({ title: '', documentType: 'CONSENT_FORM', fileName: '', fileUrl: '' }); },
    onError: (e) => toast.error(apiError(e)),
  });

  const docs = d.ipdDocuments || [];
  const groups = d.documentGroups || {};
  const set = (k) => (e) => setForm((x) => ({ ...x, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <Section title="IP document register" right={<button className="btn-secondary text-xs" onClick={() => setOpen((o) => !o)}>{open ? 'Close' : '+ Link document'}</button>}>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {DOCUMENTS.map((t) => (
            <span key={t} className={cn('rounded-lg px-2 py-1 text-[10px] font-semibold ring-1 ring-inset', groups[t] ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-ink-50 text-ink-400 ring-ink-200')}>
              {t.replace(/_/g, ' ')}{groups[t] ? ` · ${groups[t].count}` : ''}
            </span>
          ))}
        </div>
        {open && (
          <div className="mb-4 grid grid-cols-1 gap-2 rounded-xl border border-ink-200 bg-ink-50/60 p-3 sm:grid-cols-4">
            <div className="sm:col-span-2"><label className="label">Title *</label><input className="input" value={form.title} onChange={set('title')} /></div>
            <div>
              <label className="label">Document type</label>
              <select className="select" value={form.documentType} onChange={set('documentType')}>{DOCUMENTS.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}</select>
            </div>
            <div><label className="label">File name</label><input className="input" value={form.fileName} onChange={set('fileName')} /></div>
            <div className="sm:col-span-4"><label className="label">File URL / path</label><input className="input" value={form.fileUrl} onChange={set('fileUrl')} /></div>
            <button className="btn-primary text-xs sm:col-span-4" disabled={!form.title || link.isPending} onClick={() => link.mutate()}>
              {link.isPending ? <Spinner className="h-4 w-4 text-white" /> : <Upload className="h-3.5 w-3.5" />} Link to IP {d.admission.admissionNumber}
            </button>
          </div>
        )}
        {!docs.length ? (
          <EmptyState title="No documents" hint="Discharge summaries, final bills, advances and MARs are generated automatically" />
        ) : (
          <div className="space-y-1.5">
            {docs.map((doc) => (
              <div key={doc._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-100 px-3 py-1.5 text-[11px]">
                <div className="flex items-center gap-2">
                  {doc.sourceType ? <FileText className="h-3.5 w-3.5 text-brand-500" /> : <Upload className="h-3.5 w-3.5 text-ink-400" />}
                  <span className="font-semibold text-ink-800">{doc.title}</span>
                  <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-ink-500">{String(doc.documentType || doc.category).replace(/_/g, ' ')}</span>
                  {doc.sourceType && <span className="text-[9px] text-ink-400">generated</span>}
                </div>
                <div className="flex items-center gap-2 text-ink-400">
                  <span>{formatDateTime(doc.createdDate || doc.createdAt)}</span>
                  {doc.uploadedBy?.name && <span>· {doc.uploadedBy.name}</span>}
                  {doc.fileUrl && <a className="font-semibold text-brand-600 hover:underline" href={doc.fileUrl} target="_blank" rel="noreferrer">open</a>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
};

export { TransferTab, DocumentsTab };
