import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarClock, CheckCircle2, Stethoscope, User } from 'lucide-react';
import api, { apiError } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import Pagination from '../../components/ui/Pagination';
import { LoadingState, ErrorState, EmptyState, Spinner } from '../../components/ui/Feedback';
import Badge from '../../components/ui/Badge';
import { cn, formatDate } from '../../lib/utils';

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'MISSED', label: 'Missed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export default function FollowUpScreen() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const list = useQuery({
    queryKey: ['opd-followups', status, from, to, page],
    queryFn: async () => (await api.get('/opd/followups', { params: { status: status || undefined, from: from || undefined, to: to || undefined, page, limit: 10 } })).data,
  });

  const complete = useMutation({
    mutationFn: async (id) => (await api.put(`/opd/followups/${id}/complete`, {})).data.data,
    onSuccess: () => {
      toast.success('Follow-up marked as completed');
      qc.invalidateQueries({ queryKey: ['opd-followups'] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const items = list.data?.data || [];
  const pg = list.data?.pagination || {};

  return (
    <div className="p-6">
      <PageHeader
        title="Follow-up"
        subtitle="Scheduled re-visits from OPD consultations — filter by period and status, and mark follow-ups attended."
        actions={<Badge label={`${pg.total ?? 0} total`} status="COMPLETED" />}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-xl bg-ink-100/60 p-1">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value || 'all'}
              onClick={() => { setStatus(t.value); setPage(1); }}
              className={cn('rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors', status === t.value ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800')}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input type="date" className="input w-40" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} title="From date" />
          <span className="text-xs text-ink-400">to</span>
          <input type="date" className="input w-40" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} title="To date" />
        </div>
      </div>

      <div className="card overflow-hidden">
        {list.isLoading ? (
          <LoadingState label="Loading follow-ups…" />
        ) : list.isError ? (
          <ErrorState message={list.error?.message} />
        ) : items.length === 0 ? (
          <EmptyState title="No follow-ups found" hint="Follow-ups scheduled at the end of consultations appear here." />
        ) : (
          <>
            <table className="table w-full">
              <thead>
                <tr>
                  <th className="text-[10px] uppercase tracking-wider">Follow-up No</th>
                  <th className="text-[10px] uppercase tracking-wider">Date</th>
                  <th className="text-[10px] uppercase tracking-wider">Patient</th>
                  <th className="text-[10px] uppercase tracking-wider">Doctor</th>
                  <th className="text-[10px] uppercase tracking-wider">Reason</th>
                  <th className="text-[10px] uppercase tracking-wider">Status</th>
                  <th className="text-[10px] uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((f) => {
                  const p = f.patientId || {};
                  return (
                    <tr key={f._id}>
                      <td className="font-mono text-xs font-semibold text-brand-700">{f.followUpNumber || '—'}</td>
                      <td className="whitespace-nowrap text-xs font-semibold text-ink-800">{formatDate(f.date)}</td>
                      <td>
                        <div className="flex items-center gap-2 text-[13px] font-semibold text-ink-900">
                          <User className="h-3.5 w-3.5 text-ink-300" />
                          {`${p.firstName || ''} ${p.lastName || ''}`.trim() || '—'}
                          <span className="font-mono text-[10px] font-normal text-ink-400">{p.uhid || ''}</span>
                        </div>
                        <div className="text-[10px] text-ink-400">{f.visitId?.opdNumber ? `OP ${f.visitId.opdNumber}` : ''}</div>
                      </td>
                      <td className="text-xs text-ink-600">{f.doctorId ? `Dr. ${f.doctorId.name}` : '—'}</td>
                      <td className="max-w-[220px] truncate text-xs text-ink-600">{f.reason || '—'}</td>
                      <td><Badge label={f.status} status={f.status} /></td>
                      <td>
                        {f.status === 'SCHEDULED' ? (
                          <button
                            className="btn-secondary inline-flex h-7 gap-1 px-2.5 text-[11px]"
                            disabled={complete.isPending}
                            onClick={() => complete.mutate(f._id)}
                          >
                            {complete.isPending ? <Spinner className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />} Mark completed
                          </button>
                        ) : (
                          <span className="text-[10px] text-ink-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {pg.totalPages > 1 && (
              <div className="border-t border-ink-100 px-4 py-2.5">
                <Pagination page={page} totalPages={pg.totalPages} total={pg.total} limit={pg.limit} onChange={setPage} />
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-4 flex items-center gap-1.5 text-[11px] text-ink-400">
        <CalendarClock className="h-3.5 w-3.5" /> Scheduled follow-ups that are attended can be marked completed; missed ones remain in the list for follow-up calls.
      </div>
    </div>
  );
}