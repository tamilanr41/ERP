import { useState } from 'react';
import { X, Search } from 'lucide-react';
import { Spinner } from '../../components/ui/Feedback';
import { cn } from '../../lib/utils';

/**
 * Local building blocks for the settings screens.
 *
 * The app has no shared form primitives - every page hand-rolls its own modal
 * and fields - so rather than repeat that a fifth time these hold the three
 * shapes all four admin tabs need.
 */

export function Modal({ title, subtitle, icon: Icon, onClose, children, footer, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-8">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <div className={cn('relative z-10 card my-auto w-full p-5', wide ? 'max-w-3xl' : 'max-w-lg')}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-ink-900">
              {Icon && <Icon className="h-4 w-4 text-brand-600" />} {title}
            </h3>
            {subtitle && <p className="mt-1 text-[11px] leading-relaxed text-ink-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="shrink-0 text-ink-400 hover:text-ink-700" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">{children}</div>
        {footer && <div className="mt-5 flex justify-end gap-2 border-t border-ink-100 pt-4">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, required, children }) {
  return (
    <div>
      <label className="label">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-ink-400">{hint}</p>}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Search…' }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
      <input className="input pl-8" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

/**
 * `Submit` is used both inside a form and as a modal footer button sitting
 * outside it, so it falls back to type="button" when there is no onClick and
 * would otherwise post a form it is not a descendant of.
 */
export function Submit({ pending, children, className = 'btn-primary', disabled, onClick }) {
  return (
    <button type={onClick ? 'button' : 'submit'} className={className} disabled={pending || disabled} onClick={onClick}>
      {pending ? <Spinner className="h-4 w-4 text-white" /> : null} {children}
    </button>
  );
}

/**
 * Destructive actions spell out what they will do to history before asking,
 * because "delete" on a medicine or a lab test here only retires the record -
 * it never erases past bills or released reports that quote it.
 */
export function ConfirmDialog({ title, icon, body, consequence, confirmLabel = 'Confirm', pending, onCancel, onConfirm, requireReason = false }) {
  const [reason, setReason] = useState('');
  const ok = !requireReason || reason.trim().length >= 3;

  return (
    <Modal
      title={title}
      icon={icon}
      onClose={onCancel}
      footer={(
        <>
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={pending}>Cancel</button>
          <button type="button" className="btn-danger" disabled={!ok || pending} onClick={() => onConfirm(reason.trim())}>
            {pending ? <Spinner className="h-4 w-4 text-white" /> : null} {confirmLabel}
          </button>
        </>
      )}
    >
      {body && <p className="text-xs leading-relaxed text-ink-600">{body}</p>}
      {consequence && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">{consequence}</p>
      )}
      {requireReason && (
        <div className="mt-3">
          <label className="label">Reason <span className="ml-0.5 text-rose-500">*</span></label>
          <textarea
            className="input mt-1"
            rows={2}
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Recorded against this entry"
          />
        </div>
      )}
    </Modal>
  );
}

export const IconButton = ({ label, icon: Icon, onClick, tone = 'ghost', disabled }) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    disabled={disabled}
    onClick={onClick}
    className={cn(
      'btn-icon',
      tone === 'danger' && 'btn-icon-danger',
      tone === 'primary' && 'btn-icon-primary',
    )}
  >
    <Icon className="h-4 w-4" />
  </button>
);

/** Turns "Dr. Priya Nair" or "Cardiology" into a de-duplicated filter list. */
export const uniq = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));