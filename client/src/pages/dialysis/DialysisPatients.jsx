import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, UserPlus, ChevronRight } from 'lucide-react';
import api, { apiError } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/Feedback';
import { MotionPage } from '../../components/ui/Motion';
import { formatDate, cn } from '../../lib/utils';
import { POLL } from '../../lib/polling';

const STATUS_STYLE = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  SUSPENDED: 'bg-amber-50 text-amber-700 ring-amber-200',
  INACTIVE: 'bg-ink-100 text-ink-600 ring-ink-200',
  TRANSFERRED: 'bg-blue-50 text-blue-700 ring-blue-200',
  DECEASED: 'bg-rose-50 text-rose-700 ring-rose-200',
};

export default function DialysisPatients() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');

  const list = useQuery({
    queryKey: ['dialysis-patients', q, status],
    queryFn: async () => (await api.get('/dialysis/patients', { params: { q, status, limit: 100 } })).data.data,
    refetchInterval: POLL.SLOW,
  });

  return (
    <MotionPage className="p-5">
      <PageHeader
        title="Dialysis Register"
        subtitle="Every patient enrolled in the dialysis programme"
        actions={<Link to="/dialysis/register" className="btn-primary text-xs"><UserPlus className="h-3.5 w-3.5" /> Register patient</Link>}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input className="input h-9 w-64 pl-9 text-xs" placeholder="Dialysis ID, UHID, name or mobile" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="select w-40 py-1.5 text-xs" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {['ACTIVE', 'SUSPENDED', 'INACTIVE', 'TRANSFERRED', 'DECEASED'].map((x) => <option key={x}>{x}</option>)}
        </select>
        <span className="ml-auto text-xs text-ink-500">{(list.data || []).length} patient(s)</span>
      </div>

      {list.isLoading ? <LoadingState label="Loading dialysis register…" /> : list.error ? <ErrorState message={apiError(list.error)} /> : !(
        list.data || []
      ).length ? <EmptyState title="No dialysis patients" hint="Register a patient to start the programme" /> : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Dialysis ID</th><th>Patient</th><th>Age / Sex</th><th>Blood group</th><th>Diagnosis</th>
                <th>CKD</th><th>Nephrologist</th><th>Type / Access</th><th>Schedule</th><th>Last session</th>
                <th>Sessions</th><th>Status</th><th />
              </tr>
            </thead>
            <tbody>
              {(list.data || []).map((p) => (
                <tr key={p._id} className="cursor-pointer" onClick={() => navigate(`/dialysis/patient/${p._id}`)}>
                  <td className="font-mono text-[11px] font-semibold text-brand-700">{p.dialysisNumber}</td>
                  <td>
                    <div className="text-xs font-semibold text-ink-900">{p.patientId?.firstName} {p.patientId?.lastName}</div>
                    <div className="text-[10px] text-ink-500">{p.patientId?.uhid}</div>
                  </td>
                  <td className="text-[11px]">{p.patientId?.age?.years ?? p.patientId?.age ?? '—'} / {p.patientId?.gender?.slice(0, 1)}</td>
                  <td className="text-[11px]">{p.patientId?.bloodGroup || p.bloodGroup || '—'}</td>
                  <td className="max-w-[180px] truncate text-[11px]">{p.primaryDiagnosis || '—'}</td>
                  <td className="text-[11px]">{String(p.ckdStage || '').replace('STAGE_', 'CKD ')}</td>
                  <td className="text-[11px]">{p.nephrologistId?.name || '—'}</td>
                  <td className="text-[11px]">{p.dialysisType?.replace('HEMODIALYSIS', 'HD')}<div className="text-[10px] text-ink-500">{String(p.accessType || '').replace(/_/g, ' ')}</div></td>
                  <td className="text-[11px]">{p.sessionsPerWeek}/wk<div className="text-[10px] text-ink-500">{(p.scheduleDays || []).join(' ')}</div></td>
                  <td className="text-[11px]">{p.lastSessionAt ? formatDate(p.lastSessionAt) : '—'}</td>
                  <td className="text-[11px] tabular-nums">{p.completedSessions || 0}/{p.totalSessions || 0}</td>
                  <td><span className={cn('badge ring-1 ring-inset', STATUS_STYLE[p.status])}>{p.status}</span></td>
                  <td><ChevronRight className="h-3.5 w-3.5 text-ink-400" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </MotionPage>
  );
}
