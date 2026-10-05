import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function Pagination({ page, totalPages, total, limit, onChange }) {
  if (!total) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 bg-ink-50/40 px-4 py-2.5 text-sm text-ink-500">
      <span className="text-xs">
        Showing <span className="font-semibold text-ink-700">{from}–{to}</span> of <span className="font-semibold text-ink-700">{total}</span>
      </span>
      <div className="flex items-center gap-1">
        <button
          className={cn('btn-icon h-7 w-7', page <= 1 && 'cursor-not-allowed opacity-40')}
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="px-1.5 text-xs font-medium text-ink-500">
          Page {page} of {totalPages}
        </span>
        <button
          className={cn('btn-icon h-7 w-7', page >= totalPages && 'cursor-not-allowed opacity-40')}
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}