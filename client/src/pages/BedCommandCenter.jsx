import { useQuery } from '@tanstack/react-query';
import { BedDouble, RefreshCcw, Timer, Activity, User, MapPin, IndianRupee } from 'lucide-react';
import api, { apiError } from '../lib/api';
import PageHeader from '../components/ui/PageHeader';
import { LoadingState, ErrorState } from '../components/ui/Feedback';
import { cn, formatCurrency } from '../lib/utils';

const BED_STYLE = {
  AVAILABLE: 'border-emerald-300 bg-emerald-50',
  OCCUPIED: 'border-red-300 bg-red-50',
  RESERVED: 'border-amber-300 bg-amber-50',
  CLEANING: 'border-sky-300 bg-sky-50',
  MAINTENANCE: 'border-ink-300 bg-ink-100',
  BLOCKED: 'border-rose-400 bg-rose-100',
};
const BED_TEXT = {
  AVAILABLE: 'text-emerald-800',
  OCCUPIED: 'text-red-700',
  RESERVED: 'text-amber-800',
  CLEANING: 'text-sky-700',
  MAINTENANCE: 'text-ink-600',
  BLOCKED: 'text-rose-700',
};

function hoursLabel(h) {
  if (h == null) return '';
  if (h < 1) return '<1h';
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

function BedTile({ bed }) {
  const occupied = bed.status === 'OCCUPIED';
  return (
    <div className={cn('rounded-md border p-2.5', BED_STYLE[bed.status] || 'border-ink-100 bg-ink-50')}>
      <div className="flex items-center justify-between">
        <span className={cn('text-xs font-bold', BED_TEXT[bed.status] || 'text-ink-700')}>{bed.bedNumber}</span>
        <span className={cn('text-[10px] font-medium uppercase tracking-wide', BED_TEXT[bed.status] || 'text-ink-500')}>{bed.status}</span>
      </div>
      {occupied && bed.patient && (
        <div className="mt-1.5 border-t border-red-100 pt-1.5">
          <div className="flex items-center gap-1 text-xs font-semibold text-ink-900">
            <User className="h-3 w-3 text-red-500" />
            <span className="truncate">{bed.patient.firstName} {bed.patient.lastName || ''}</span>
          </div>
          <div className="text-[10px] text-ink-400">{bed.patient.uhid}</div>
          {bed.admission && (
            <div className="mt-1 flex items-center justify-between text-[10px] text-ink-600">
              <span className="truncate">{bed.admission.chiefComplaint || bed.admission.admissionNumber}</span>
              <span className="ml-1 inline-flex shrink-0 items-center gap-0.5 text-ink-500">
                <Timer className="h-2.5 w-2.5" />{hoursLabel(bed.admission.hoursAgo)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function BedCommandCenter() {
  const cc = useQuery({
    queryKey: ['bed-command-center'],
    queryFn: async () => (await api.get('/ipd/beds/command-center')).data,
    refetchInterval: 15000,
    refetchIntervalInBackground: true,
  });

  const stats = cc.data?.data || {};
  const statItems = [
    { key: 'total', label: 'Total beds', cls: 'text-ink-900' },
    { key: 'occupied', label: 'Occupied', cls: 'text-red-600' },
    { key: 'available', label: 'Available', cls: 'text-emerald-600' },
    { key: 'reserved', label: 'Reserved', cls: 'text-amber-600' },
    { key: 'cleaning', label: 'Cleaning', cls: 'text-sky-600' },
  ];

  return (
    <div className="p-6">
      <PageHeader
        title="Bed Command Center"
        subtitle={stats.updatedAt ? `Live IPD map · ${(stats.wards || []).length} ward(s) · refresh every 15s` : 'Live bed occupancy across wards'}
        actions={<span className="text-xs text-ink-400"><RefreshCcw className="mr-1 inline h-3 w-3" />auto-refresh</span>}
      />

      {cc.isLoading ? <LoadingState /> : cc.error ? <ErrorState message={apiError(cc.error)} /> : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
            {statItems.map(({ key, label, cls }) => (
              <div key={key} className="card flex items-center gap-3 p-4">
                <BedDouble className={cn('h-5 w-5', cls)} />
                <div>
                  <div className={cn('text-2xl font-semibold leading-tight', cls)}>{stats[key] ?? 0}</div>
                  <div className="text-xs text-ink-400">{label}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="mb-5 card p-4">
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium text-ink-700"><Activity className="mr-1 inline h-4 w-4 text-brand-600" />Overall occupancy</span>
              <span className="font-semibold text-ink-900">{stats.occupancyPct ?? 0}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-ink-100">
              <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${stats.occupancyPct ?? 0}%` }} />
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
            {(stats.wards || []).length === 0 && (
              <div className="card col-span-full p-10 text-center text-sm text-ink-400">No wards configured yet.</div>
            )}
            {(stats.wards || []).map((ward) => (
              <div key={ward._id} className="card overflow-hidden">
                <div className="border-b border-ink-100 bg-ink-50 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 font-medium text-ink-900">
                        {ward.name}
                        <span className="text-[10px] font-normal uppercase tracking-wide text-ink-400">{ward.wardType || 'WARD'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-ink-400">
                        {ward.floor && <span className="inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" />{ward.floor}</span>}
                        {ward.chargePerDay > 0 && <span className="inline-flex items-center gap-0.5"><IndianRupee className="h-3 w-3" />{formatCurrency(ward.chargePerDay)}/day</span>}
                      </div>
                    </div>
                    <div className="text-right text-xs">
                      <div className="font-semibold text-ink-900">{ward.counts.occupied}/{ward.total}</div>
                      <div className="text-emerald-600">{ward.total ? Math.round((ward.counts.occupied / ward.total) * 100) : 0}% full</div>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-200">
                    <div className="h-full rounded-full bg-red-500" style={{ width: `${ward.total ? (ward.counts.occupied / ward.total) * 100 : 0}%` }} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 p-3 md:grid-cols-3">
                  {ward.beds.map((bed) => <BedTile key={bed._id} bed={bed} />)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}