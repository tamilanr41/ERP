import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Wallet, Play, Square, X, IndianRupee, Timer, Receipt, ArrowLeftRight, CheckCircle2 } from 'lucide-react';
import api, { apiError } from '../lib/api';
import PageHeader from '../components/ui/PageHeader';
import Pagination from '../components/ui/Pagination';
import { LoadingState, ErrorState, Spinner } from '../components/ui/Feedback';
import { formatCurrency, formatDateTime, cn } from '../lib/utils';
import Badge from '../components/ui/Badge.jsx';

const MODES = ['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'WALLET', 'CHEQUE', 'INSURANCE'];

export default function CashierClosing() {
  const qc = useQueryClient();
  const [showClose, setShowClose] = useState(false);
  const [openCash, setOpenCash] = useState('');
  const [countedCash, setCountedCash] = useState('');

  const current = useQuery({ queryKey: ['cashier-current'], queryFn: async () => (await api.get('/cashier/current')).data });
  const shifts = useQuery({ queryKey: ['cashier-shifts'], queryFn: async () => (await api.get('/cashier')).data });

  const past = (shifts.data?.data || []).filter((s) => s.status === 'CLOSED');

  const openShift = useMutation({
    mutationFn: async () => (await api.post('/cashier/open', { openingCash: Number(openCash) || 0 })).data.data,
    onSuccess: () => { toast.success('Shift opened'); setOpenCash(''); qc.invalidateQueries({ queryKey: ['cashier-'] }); },
    onError: (e) => toast.error(apiError(e)),
  });

  const closeShift = useMutation({
    mutationFn: async () => (await api.patch(`/cashier/${current.data?.data?._id}/close`, { countedCash: Number(countedCash) || 0 })).data.data,
    onSuccess: () => { toast.success('Shift closed'); setShowClose(false); setCountedCash(''); qc.invalidateQueries({ queryKey: ['cashier-'] }); },
    onError: (e) => toast.error(apiError(e)),
  });

  const shift = current.data?.data;

  return (
    <div className="p-6">
      <PageHeader
        title="Cashier Closing"
        subtitle="Shift open/close, collection review and variance"
        actions={
          !shift ? (
            <button className="btn-primary" onClick={() => openShift.mutate()} disabled={openShift.isPending}>
              {openShift.isPending ? <Spinner className="h-4 w-4" /> : <Play className="h-4 w-4" />} Open Shift
            </button>
          ) : (
            <button className="btn-secondary" onClick={() => setShowClose(true)}>
              <Square className="h-4 w-4" /> Close Shift
            </button>
          )
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className={cn('card p-5 lg:row-span-2', shift ? 'border-amber-200 bg-amber-50/50' : '')}>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 font-medium text-ink-900">
              <Wallet className={cn('h-5 w-5', shift ? 'text-amber-600' : 'text-ink-500')} />
              Current Shift
            </div>
            {shift ? <Badge label="OPEN" status="CHECKED_IN" /> : <Badge label="NO SHIFT" status="NO_SHOW" />}
          </div>

          {!shift ? (
            <div className="py-8 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-ink-100">
                <IndianRupee className="h-6 w-6 text-ink-500" />
              </div>
              <p className="text-sm text-ink-400">No active shift. Open a shift to start collecting.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-400">Shift</span>
                <span className="font-mono text-xs font-semibold text-ink-900">{shift.shiftNumber}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-400">Opened</span>
                <span className="font-medium text-ink-900">{formatDateTime(shift.openedAt)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-400">Opening cash</span>
                <span className="font-semibold text-ink-900">{formatCurrency(shift.openingCash)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-400">Transactions</span>
                <span className="font-semibold text-ink-900">{shift.live?.transactions ?? 0}</span>
              </div>
              <div className="border-t border-ink-100 pt-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink-400">Net cash collected</span>
                  <span className="font-semibold text-emerald-600">{formatCurrency(shift.live?.cashCollected ?? 0)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="card p-5">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-ink-900">
            <Receipt className="h-4 w-4 text-ink-500" /> Collections by mode (live)
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {MODES.map((m) => (
              <div key={m} className="flex items-center justify-between text-sm">
                <span className="text-ink-400">{m}</span>
                <span className="font-semibold tabular-nums text-ink-900">{formatCurrency(shift?.live?.byMode?.[m] ?? 0)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-ink-900">
            <Timer className="h-4 w-4 text-ink-500" /> Expected vs counted
          </div>
          {shift ? (
            <div className="space-y-2">
              <div className="flex justify-between text-sm"><span className="text-ink-400">Expected cash</span><span className="font-semibold">{formatCurrency(shift.live.expectedCash)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-ink-400">Counted at close</span><span className="font-semibold">—</span></div>
            </div>
          ) : (
            <p className="text-sm text-ink-400">Close the shift to record counted cash and variance.</p>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-ink-100 px-4 py-3 text-sm font-semibold text-ink-800">Shift history</div>
        {shifts.isLoading ? <LoadingState /> : shifts.error ? <ErrorState message={apiError(shifts.error)} /> : past.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-400">No closed shifts yet.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Shift</th>
                <th>Cashier</th>
                <th>Opened</th>
                <th>Closed</th>
                <th>Collected</th>
                <th>Refunded</th>
                <th>Expected</th>
                <th>Counted</th>
                <th>Variance</th>
              </tr>
            </thead>
            <tbody>
              {past.map((s) => (
                <tr key={s._id}>
                  <td className="font-mono text-xs font-semibold text-brand-700">{s.shiftNumber}</td>
                  <td>{s.cashierId?.firstName} {s.cashierId?.lastName || ''}</td>
                  <td className="text-xs">{formatDateTime(s.openedAt)}</td>
                  <td className="text-xs">{formatDateTime(s.closedAt)}</td>
                  <td className="tabular-nums">{formatCurrency(s.paymentsTotal)}</td>
                  <td className="tabular-nums">{formatCurrency(s.refundsTotal)}</td>
                  <td className="tabular-nums">{formatCurrency(s.expectedCash)}</td>
                  <td className="tabular-nums">{formatCurrency(s.countedCash)}</td>
                  <td className={cn('tabular-nums font-medium', s.variance === 0 ? 'text-emerald-600' : Math.abs(s.variance) < 0.01 ? 'text-emerald-600' : 'text-rose-600')}>
                    {formatCurrency(s.variance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {shifts.data?.pagination && <Pagination {...shifts.data.pagination} page={shifts.data.pagination.page} onChange={() => {}} />}
      </div>

      {showClose && shift && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/60 p-4 backdrop-blur-sm" onClick={() => setShowClose(false)}>
          <div className="card my-8 w-full max-w-md space-y-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Close Shift {shift.shiftNumber}</h2>
              <button onClick={() => setShowClose(false)} className="text-ink-400 hover:text-ink-700"><X className="h-5 w-5" /></button>
            </div>
            <div className="rounded-md bg-ink-50 p-3 text-sm">
              <div className="flex justify-between py-0.5"><span className="text-ink-400">Expected cash</span><span className="font-semibold">{formatCurrency(shift.live.expectedCash)}</span></div>
              <div className="flex justify-between border-t border-ink-100 py-0.5"><span className="text-ink-400">Payments</span><span className="tabular-nums">{formatCurrency(shift.live.paymentsTotal)}</span></div>
              <div className="flex justify-between py-0.5"><span className="text-ink-400">Refunds</span><span className="tabular-nums">{formatCurrency(shift.live.refundsTotal)}</span></div>
            </div>
            <div>
              <label className="label">Counted cash (till) *</label>
              <input className="input" type="number" min="0" value={countedCash} onChange={(e) => setCountedCash(e.target.value)} placeholder="0.00" />
              {countedCash !== '' && (
                <div className={cn('mt-2 flex items-center gap-1 text-sm', shift.live.expectedCash === Number(countedCash) ? 'text-emerald-600' : 'text-rose-600')}>
                  <ArrowLeftRight className="h-4 w-4" />
                  Variance {formatCurrency(Number(countedCash) - shift.live.expectedCash)}
                </div>
              )}
            </div>
            <button className="btn-primary w-full" disabled={countedCash === '' || closeShift.isPending} onClick={() => closeShift.mutate()}>
              {closeShift.isPending ? <Spinner className="h-4 w-4 text-white" /> : <CheckCircle2 className="h-4 w-4" />} Confirm Closing
            </button>
          </div>
        </div>
      )}
    </div>
  );
}