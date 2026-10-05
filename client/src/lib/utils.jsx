import { clsx } from 'clsx';

export const cn = (...inputs) => clsx(inputs);

export const formatCurrency = (value) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value) || 0);

export const formatDate = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const formatDateTime = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const durationLabel = (from, to = new Date()) => {
  const ms = Math.max(0, new Date(to) - new Date(from));
  const mins = Math.floor(ms / 60000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  return `${mins}m`;
};

export const initials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join('');

export const STATUS_COLORS = {
  PENDING: 'bg-amber-100 text-amber-800',
  CONFIRMED: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-emerald-100 text-emerald-800',
  CHECKED_IN: 'bg-cyan-100 text-cyan-800',
  IN_CONSULTATION: 'bg-violet-100 text-violet-800',
  CANCELLED: 'bg-red-100 text-red-700',
  NO_SHOW: 'bg-ink-200 text-ink-700',
  RESCHEDULED: 'bg-orange-100 text-orange-800',
  PAID: 'bg-emerald-100 text-emerald-800',
  PARTIALLY_PAID: 'bg-amber-100 text-amber-800',
  FINAL: 'bg-blue-100 text-blue-800',
  WAITING: 'bg-amber-100 text-amber-800',
  AVAILABLE: 'bg-emerald-100 text-emerald-800',
  OCCUPIED: 'bg-red-100 text-red-700',
  RESERVED: 'bg-amber-100 text-amber-800',
  CLEANING: 'bg-ink-200 text-ink-700',
  ADMITTED: 'bg-blue-100 text-blue-800',
  TRANSFERRED: 'bg-orange-100 text-orange-800',
  DISCHARGED: 'bg-ink-200 text-ink-700',
  ORDERED: 'bg-blue-100 text-blue-800',
  SAMPLE_COLLECTED: 'bg-violet-100 text-violet-800',
  IN_PROGRESS: 'bg-cyan-100 text-cyan-800',
  VERIFIED: 'bg-emerald-100 text-emerald-800',
  LOW: 'bg-red-100 text-red-700',
  OUT_OF_STOCK: 'bg-ink-200 text-ink-700',
};

export const statusColor = (status) => STATUS_COLORS[status] || 'bg-ink-100 text-ink-700';