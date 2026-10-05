import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api, { apiError } from '../lib/api';
import PageHeader from '../components/ui/PageHeader';
import Pagination from '../components/ui/Pagination';
import { LoadingState, ErrorState, EmptyState } from '../components/ui/Feedback';
import { formatDateTime } from '../lib/utils';

export default function AuditLogs() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useQuery({
    queryKey: ['audit-logs', { page }],
    queryFn: async ({ queryKey }) => (await api.get('/audit', { params: queryKey[1] })).data,
  });

  return (
    <div className="p-6">
      <PageHeader title="Audit Logs" subtitle="Immutable trail of system actions" />
      <div className="card overflow-hidden">
        {isLoading ? <LoadingState /> : error ? <ErrorState message={apiError(error)} /> : !data?.data?.length ? (
          <EmptyState title="No audit records" />
        ) : (
          <table className="table">
            <thead>
              <tr><th>Timestamp</th><th>User</th><th>Role</th><th>Module</th><th>Action</th><th>Entity</th></tr>
            </thead>
            <tbody>
              {data.data.map((l) => (
                <tr key={l._id}>
                  <td className="whitespace-nowrap text-ink-400">{formatDateTime(l.timestamp || l.createdAt)}</td>
                  <td className="font-medium text-ink-900">{l.userName || l.userId || 'System'}</td>
                  <td><span className="badge bg-ink-100 text-ink-600">{l.roleCode || '—'}</span></td>
                  <td>{l.module}</td>
                  <td className="font-medium text-brand-700">{l.action}</td>
                  <td className="text-xs text-ink-400">{l.entityType ? `${l.entityType}${l.entityId ? ` · ${l.entityId}` : ''}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data?.pagination && <Pagination {...data.pagination} page={data.pagination.page} onChange={setPage} />}
      </div>
    </div>
  );
}