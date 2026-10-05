import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bell, CheckCheck } from 'lucide-react';
import api, { apiError } from '../lib/api';
import PageHeader from '../components/ui/PageHeader';
import { LoadingState, ErrorState, EmptyState } from '../components/ui/Feedback';
import { formatDateTime, cn } from '../lib/utils';

export default function Notifications() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => (await api.get('/notifications')).data,
  });

  const read = useMutation({
    mutationFn: async (id) => (await api.patch(`/notifications/${id}/read`)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
    onError: (e) => toast.error(apiError(e)),
  });

  const readAll = useMutation({
    mutationFn: async () => (await api.patch('/notifications/read-all')).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <div className="p-6">
      <PageHeader
        title="Notifications"
        subtitle="Alerts and updates"
        actions={
          <button className="btn-secondary" onClick={() => readAll.mutate()}>
            <CheckCheck className="h-4 w-4" /> Mark all read
          </button>
        }
      />

      <div className="space-y-2">
        {isLoading ? <LoadingState /> : error ? <ErrorState message={apiError(error)} /> : !data?.data?.length ? (
          <EmptyState title="No notifications" hint="New alerts will appear here" />
        ) : (
          data.data.map((n) => (
            <button
              key={n._id}
              onClick={() => !n.read && read.mutate(n._id)}
              className={cn('card flex w-full items-start gap-3 p-4 text-left transition-colors', !n.read && 'border-brand-200 bg-brand-50/50 hover:bg-brand-50')}
            >
              <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full', n.severity === 'CRITICAL' ? 'bg-red-100 text-red-600' : n.severity === 'HIGH' ? 'bg-amber-100 text-amber-600' : 'bg-brand-100 text-brand-600')}>
                <Bell className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-ink-900">{n.title}</span>
                  <span className="shrink-0 text-xs text-ink-400">{formatDateTime(n.createdAt)}</span>
                </div>
                <p className="mt-0.5 text-sm text-ink-600">{n.message}</p>
                <p className="mt-1 text-xs text-ink-400">{n.type}</p>
              </div>
              {!n.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-500" />}
            </button>
          ))
        )}
      </div>
    </div>
  );
}