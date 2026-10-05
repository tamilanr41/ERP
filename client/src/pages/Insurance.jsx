import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Building2, FileText, ShieldCheck, HandCoins, X, Plus, CheckCircle2, XCircle, Send,
  Layers, ClipboardCheck, IndianRupee,
} from 'lucide-react';
import api, { apiError } from '../lib/api';
import PageHeader from '../components/ui/PageHeader';
import { LoadingState, ErrorState, Spinner } from '../components/ui/Feedback';
import { formatCurrency, formatDate, cn } from '../lib/utils';
import Badge from '../components/ui/Badge.jsx';

const TABS = [
  { key: 'companies', label: 'Companies', icon: Building2 },
  { key: 'policies', label: 'Policies', icon: FileText },
  { key: 'preauths', label: 'Pre-authorization', icon: ClipboardCheck },
  { key: 'claims', label: 'Claims', icon: HandCoins },
];

const CLAIM_BADGE = {
  DRAFT: 'ORDERED', SUBMITTED: 'CHECKED_IN', APPROVED: 'COMPLETED',
  PARTIALLY_APPROVED: 'CHECKED_IN', REJECTED: 'CANCELLED', SETTLED: 'PAID',
};
const PREAUTH_BADGE = {
  PENDING: 'PENDING', APPROVED: 'COMPLETED', PARTIALLY_APPROVED: 'CHECKED_IN', REJECTED: 'CANCELLED',
};

export default function Insurance() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('companies');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});

  const inval = () => qc.invalidateQueries({ queryKey: ['insurance-'] });

  const companies = useQuery({ queryKey: ['insurance-companies'], queryFn: async () => (await api.get('/insurance/companies')).data });
  const policies = useQuery({ queryKey: ['insurance-policies'], queryFn: async () => (await api.get('/insurance/policies?limit=100')).data });
  const preauths = useQuery({ queryKey: ['insurance-preauths'], queryFn: async () => (await api.get('/insurance/pre-authorizations?limit=100')).data });
  const claims = useQuery({ queryKey: ['insurance-claims'], queryFn: async () => (await api.get('/insurance/claims?limit=100')).data });

  const patients = useQuery({
    queryKey: ['insurance-patients'],
    queryFn: async () => (await api.get('/patients?limit=100')).data,
    enabled: modal === 'policy' || modal === 'preauth' || modal === 'claim',
  });

  const companyList = companies.data?.data || [];
  const policyList = policies.data?.data || [];
  const preauthList = preauths.data?.data || [];
  const claimList = claims.data?.data || [];

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const mkMutation = (fn, msg) =>
    useMutation({
      mutationFn: fn,
      onSuccess: () => { toast.success(msg); setModal(null); setForm({}); inval(); },
      onError: (e) => toast.error(apiError(e)),
    });

  const cat = {
    companies: mkMutation(async () => (await api.post('/insurance/companies', form)).data, 'Company created'),
    policy: mkMutation(async () => (await api.post('/insurance/policies', { ...form, companyId: form.companyId || companyList[0]?._id })).data, 'Policy enrolled'),
    preauth: mkMutation(async () => (await api.post('/insurance/pre-authorizations', { ...form, policyId: form.policyId || policyList[0]?._id })).data, 'Pre-authorization requested'),
    claim: mkMutation(async () => (await api.post('/insurance/claims', { ...form, policyId: form.policyId || policyList[0]?._id })).data, 'Claim created'),
  };

  const decidePreauth = useMutation({
    mutationFn: async ({ id, decision, approvedAmount }) => (await api.patch(`/insurance/pre-authorizations/${id}/decide`, { decision, approvedAmount: Number(approvedAmount) || 0 })).data,
    onSuccess: () => { toast.success('Pre-authorization decided'); inval(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const submitClaim = useMutation({
    mutationFn: async (id) => (await api.patch(`/insurance/claims/${id}/submit`)).data,
    onSuccess: () => { toast.success('Claim submitted'); inval(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const decideClaim = useMutation({
    mutationFn: async ({ id, decision, approvedAmount }) => (await api.patch(`/insurance/claims/${id}/decide`, { decision, approvedAmount: Number(approvedAmount) || 0 })).data,
    onSuccess: () => { toast.success('Claim decision recorded'); inval(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const settleClaim = useMutation({
    mutationFn: async (id) => (await api.patch(`/insurance/claims/${id}/settle`)).data,
    onSuccess: () => { toast.success('Claim settled'); inval(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const busy = decidePreauth.isPending || submitClaim.isPending || decideClaim.isPending || settleClaim.isPending || Object.values(cat).some((m) => m.isPending);

  return (
    <div className="p-6">
      <PageHeader
        title="Insurance / TPA"
        subtitle="Insurers, policies, pre-authorization and claims"
        actions={
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => setTab('preauths')}>
              <ClipboardCheck className="h-4 w-4" /> {preauthList.filter((p) => p.status === 'PENDING').length} pending
            </button>
            <button
              className="btn-primary"
              onClick={() => setModal(tab === 'companies' ? 'companies' : tab === 'policies' ? 'policy' : tab === 'preauths' ? 'preauth' : 'claim')}
            >
              <Plus className="h-4 w-4" /> New
            </button>
          </div>
        }
      />

      <div className="mb-4 flex gap-1 rounded-lg bg-ink-100 p-1">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium', tab === t.key ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800')}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'companies' && (
        <div className="card overflow-hidden">
          <table className="table">
            <thead><tr><th>Company</th><th>TPA</th><th>Contact</th><th>Empanelled</th></tr></thead>
            <tbody>
              {companies.isLoading ? <tr><td colSpan={4}><LoadingState /></td></tr>
                : companyList.length === 0 ? <tr><td colSpan={4} className="p-6 text-center text-sm text-ink-500">No insurers yet. Add your first insurance company.</td></tr>
                : companyList.map((c) => (
                  <tr key={c._id}>
                    <td><div className="font-medium text-ink-900">{c.name}</div><div className="text-xs text-ink-500">{c.code}</div></td>
                    <td>{c.tpaName || '—'}</td>
                    <td><div className="text-sm">{c.contactPhone || '—'}</div><div className="text-xs text-ink-500">{c.contactEmail || ''}</div></td>
                    <td>{c.empanelled ? <Badge label="EMPANELLED" status="PAID" /> : <Badge label="NOT EMPANELLED" status="NO_SHOW" />}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'policies' && (
        <div className="card overflow-hidden">
          <table className="table">
            <thead><tr><th>Policy</th><th>Patient</th><th>Company</th><th>Sum insured</th><th>Validity</th><th>Status</th></tr></thead>
            <tbody>
              {policies.isLoading ? <tr><td colSpan={6}><LoadingState /></td></tr>
                : policyList.length === 0 ? <tr><td colSpan={6} className="p-6 text-center text-sm text-ink-500">No policies enrolled.</td></tr>
                : policyList.map((p) => (
                  <tr key={p._id}>
                    <td className="font-mono text-xs font-semibold text-brand-700">{p.policyNumber}</td>
                    <td>{p.patientId?.firstName} {p.patientId?.lastName || ''} <span className="ml-1 text-xs text-ink-500">{p.patientId?.uhid}</span></td>
                    <td>{p.companyId?.name}</td>
                    <td className="tabular-nums">{formatCurrency(p.sumInsured)}</td>
                    <td className="text-xs">{formatDate(p.startDate)} → {formatDate(p.endDate)}</td>
                    <td>{p.active ? <Badge label="ACTIVE" status="PAID" /> : <Badge label="INACTIVE" status="NO_SHOW" />}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'preauths' && (
        <div className="card overflow-hidden">
          <table className="table">
            <thead><tr><th>Pre-auth</th><th>Patient</th><th>Company</th><th>Requested</th><th>Approved</th><th>Status</th><th className="text-right">Action</th></tr></thead>
            <tbody>
              {preauths.isLoading ? <tr><td colSpan={7}><LoadingState /></td></tr>
                : preauthList.length === 0 ? <tr><td colSpan={7} className="p-6 text-center text-sm text-ink-500">No pre-authorization requests.</td></tr>
                : preauthList.map((p) => (
                  <tr key={p._id}>
                    <td className="font-mono text-xs font-semibold text-brand-700">{p.preAuthNumber}</td>
                    <td>{p.patientId?.firstName} {p.patientId?.lastName || ''}</td>
                    <td>{p.companyId?.name}</td>
                    <td className="tabular-nums">{formatCurrency(p.requestedAmount)}</td>
                    <td className="tabular-nums">{p.approvedAmount ? formatCurrency(p.approvedAmount) : '—'}</td>
                    <td><Badge label={p.status} status={PREAUTH_BADGE[p.status]} /></td>
                    <td className="text-right">
                      {p.status === 'PENDING' && (
                        <div className="flex justify-end gap-1">
                          <button className="btn-icon btn-success" title="Approve" onClick={() => decidePreauth.mutate({ id: p._id, decision: 'APPROVED', approvedAmount: p.requestedAmount })}><CheckCircle2 className="h-4 w-4" /></button>
                          <button className="btn-icon btn-danger" title="Reject" onClick={() => decidePreauth.mutate({ id: p._id, decision: 'REJECTED' })}><XCircle className="h-4 w-4" /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'claims' && (
        <div className="card overflow-hidden">
          <table className="table">
            <thead><tr><th>Claim</th><th>Patient</th><th>Company</th><th>Claimed</th><th>Ins. resp.</th><th>Pt. resp.</th><th>Status</th><th className="text-right">Action</th></tr></thead>
            <tbody>
              {claims.isLoading ? <tr><td colSpan={8}><LoadingState /></td></tr>
                : claimList.length === 0 ? <tr><td colSpan={8} className="p-6 text-center text-sm text-ink-500">No claims.</td></tr>
                : claimList.map((c) => (
                  <tr key={c._id}>
                    <td className="font-mono text-xs font-semibold text-brand-700">{c.claimNumber}</td>
                    <td>{c.patientId?.firstName} {c.patientId?.lastName || ''}</td>
                    <td>{c.companyId?.name}</td>
                    <td className="tabular-nums">{formatCurrency(c.claimedAmount)}</td>
                    <td className="tabular-nums">{formatCurrency(c.insuranceResponsibility || 0)}</td>
                    <td className="tabular-nums">{formatCurrency(c.patientResponsibility || 0)}</td>
                    <td><Badge label={c.status} status={CLAIM_BADGE[c.status]} /></td>
                    <td className="text-right">
                      <div className="flex justify-end gap-1">
                        {c.status === 'DRAFT' && <button className="btn-icon btn-primary" title="Submit" onClick={() => submitClaim.mutate(c._id)}><Send className="h-4 w-4" /></button>}
                        {['SUBMITTED'].includes(c.status) && (
                          <>
                            <button className="btn-icon btn-success" title="Approve" onClick={() => decideClaim.mutate({ id: c._id, decision: 'APPROVED', approvedAmount: c.claimedAmount })}><CheckCircle2 className="h-4 w-4" /></button>
                            <button className="btn-icon btn-danger" title="Reject" onClick={() => decideClaim.mutate({ id: c._id, decision: 'REJECTED' })}><XCircle className="h-4 w-4" /></button>
                          </>
                        )}
                        {['APPROVED', 'PARTIALLY_APPROVED'].includes(c.status) && (
                          <button className="btn-icon btn-success" title="Mark settled" onClick={() => settleClaim.mutate(c._id)}><HandCoins className="h-4 w-4" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/60 p-4 backdrop-blur-sm" onClick={() => !busy && setModal(null)}>
          <div className="card my-8 w-full max-w-lg space-y-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                {modal === 'companies' && <><Building2 className="h-5 w-5" /> New insurance company</>}
                {modal === 'policy' && <><FileText className="h-5 w-5" /> Enroll policy</>}
                {modal === 'preauth' && <><ClipboardCheck className="h-5 w-5" /> Pre-authorization request</>}
                {modal === 'claim' && <><HandCoins className="h-5 w-5" /> New claim</>}
              </h2>
              <button onClick={() => !busy && setModal(null)} className="text-ink-400 hover:text-ink-700"><X className="h-5 w-5" /></button>
            </div>

            {modal === 'companies' && (
              <>
                <div><label className="label">Name *</label><input className="input" value={form.name || ''} onChange={set('name')} placeholder="Star Health" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Code</label><input className="input" value={form.code || ''} onChange={set('code')} placeholder="STAR" /></div>
                  <div><label className="label">TPA</label><input className="input" value={form.tpaName || ''} onChange={set('tpaName')} placeholder="MediAssist" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Contact phone</label><input className="input" value={form.contactPhone || ''} onChange={set('contactPhone')} /></div>
                  <div><label className="label">Contact email</label><input className="input" type="email" value={form.contactEmail || ''} onChange={set('contactEmail')} /></div>
                </div>
              </>
            )}

            {(modal === 'policy' || modal === 'preauth' || modal === 'claim') && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Patient *</label>
                    <select className="input" value={form.patientId || ''} onChange={set('patientId')}>
                      <option value="">Select patient</option>
                      {(patients.data?.data || []).map((p) => (
                        <option key={p._id} value={p._id}>{p.firstName} {p.lastName || ''} · {p.uhid}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Policy *</label>
                    <select className="input" value={form.policyId || ''} onChange={set('policyId')}>
                      <option value="">Select policy</option>
                      {policyList.map((p) => (
                        <option key={p._id} value={p._id}>{p.policyNumber} · {p.companyId?.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {modal === 'policy' && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="label">Policy number *</label><input className="input" value={form.policyNumber || ''} onChange={set('policyNumber')} /></div>
                      <div><label className="label">Company *</label>
                        <select className="input" value={form.companyId || ''} onChange={set('companyId')}>
                          <option value="">Select company</option>
                          {companyList.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div><label className="label">Sum insured (₹)</label><input className="input" type="number" min="0" value={form.sumInsured || ''} onChange={set('sumInsured')} /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="label">Start date</label><input className="input" type="date" value={form.startDate || ''} onChange={set('startDate')} /></div>
                      <div><label className="label">End date</label><input className="input" type="date" value={form.endDate || ''} onChange={set('endDate')} /></div>
                    </div>
                  </>
                )}

                {modal === 'preauth' && (
                  <>
                    <div><label className="label">Requested amount (₹) *</label><input className="input" type="number" min="0" value={form.requestedAmount || ''} onChange={set('requestedAmount')} /></div>
                    <div><label className="label">Diagnosis</label><input className="input" value={form.diagnosis || ''} onChange={set('diagnosis')} /></div>
                    <div><label className="label">Treatment plan</label><textarea className="input" rows={2} value={form.treatmentPlan || ''} onChange={set('treatmentPlan')} /></div>
                  </>
                )}

                {modal === 'claim' && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="label">Claimed amount (₹) *</label><input className="input" type="number" min="0" value={form.claimedAmount || ''} onChange={set('claimedAmount')} /></div>
                      <div><label className="label">Pre-auth number</label><input className="input" value={form.preAuthorizationNumber || ''} onChange={set('preAuthorizationNumber')} /></div>
                    </div>
                    <div><label className="label">Diagnosis</label><input className="input" value={form.diagnosis || ''} onChange={set('diagnosis')} /></div>
                    <div><label className="label">Treatment summary</label><textarea className="input" rows={2} value={form.treatmentSummary || ''} onChange={set('treatmentSummary')} /></div>
                  </>
                )}
              </>
            )}

            <button className="btn-primary w-full" disabled={busy} onClick={() => cat[modal].mutate()}>
              {cat[modal].isPending ? <Spinner className="h-4 w-4 text-white" /> : <IndianRupee className="h-4 w-4" />} Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}