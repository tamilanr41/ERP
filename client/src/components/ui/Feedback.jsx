import { Loader2, Inbox, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';

export function Spinner({ className }) {
  return <Loader2 className={cn('h-6 w-6 animate-spin text-brand-600', className)} />;
}

export function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-sm text-ink-500 animate-fade-in">
      <Spinner />
      {label}
    </div>
  );
}

export function EmptyState({ title = 'No records found', hint }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-20 text-center animate-fade-in">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-100">
        <Inbox className="h-6 w-6 text-ink-400" />
      </div>
      <div className="text-sm font-semibold text-ink-700">{title}</div>
      {hint && <div className="text-xs text-ink-400">{hint}</div>}
    </div>
  );
}

export function ErrorState({ message = 'Failed to load data' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-20 text-center animate-fade-in">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50">
        <AlertTriangle className="h-6 w-6 text-red-500" />
      </div>
      <div className="text-sm font-medium text-red-600">{message}</div>
    </div>
  );
}