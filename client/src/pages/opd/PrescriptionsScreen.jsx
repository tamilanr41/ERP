import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pill, FileText, Printer, CalendarClock, Stethoscope } from 'lucide-react';
import api from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import Pagination from '../../components/ui/Pagination';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/Feedback';
import Badge from '../../components/ui/Badge';
import { cn, formatDate, formatDateTime } from '../../lib/utils';

const TIMING_LABEL = { BEFORE_FOOD: 'Before food', AFTER_FOOD: 'After food', WITH_FOOD: 'With food', ANY_TIME: 'Anytime' };

export default function PrescriptionsScreen() {
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState(null);

  const list = useQuery({
    queryKey: ['opd-prescriptions', page],
    queryFn: async () => (await api.get('/opd/prescriptions', { params: { page, limit: 10 } })).data,
  });

  const detail = useQuery({
    queryKey: ['opd-prescription', selectedId],
    enabled: !!selectedId,
    queryFn: async () => (await api.get(`/opd/prescriptions/${selectedId}`)).data.data,
  });

  const items = list.data?.data || [];
  const pg = list.data?.pagination || {};

  return (
    <div className="p-6">
      <PageHeader
        title="Prescriptions"
        subtitle="All prescriptions issued in the OPD — open any record to view the full medication plan."
        actions={<Badge label={`${pg.total ?? 0} total`} status="COMPLETED" />}
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="card overflow-hidden">
          <div className="border-b border-ink-100 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-bold text-ink-900"><Pill className="h-4 w-4 text-brand-600" /> Prescription log</div>
          </div>
          {list.isLoading ? (
            <LoadingState label="Loading prescriptions…" />
          ) : list.isError ? (
            <ErrorState message={list.error?.message} />
          ) : items.length === 0 ? (
            <EmptyState title="No prescriptions yet" hint="Prescriptions issued during consultations will appear here." />
          ) : (
            <>
              <table className="table w-full">
                <thead>
                  <tr>
                    <th className="text-[10px] uppercase tracking-wider">Rx No</th>
                    <th className="text-[10px] uppercase tracking-wider">Date</th>
                    <th className="text-[10px] uppercase tracking-wider">Patient</th>
                    <th className="text-[10px] uppercase tracking-wider">Doctor</th>
                    <th className="text-[10px] uppercase tracking-wider">Items</th>
                    <th className="text-[10px] uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((rx) => {
                    const p = rx.patientId || {};
                    return (
                      <tr
                        key={rx._id}
                        onClick={() => setSelectedId(rx._id)}
                        className={cn('cursor-pointer transition-colors hover:bg-ink-50', selectedId === rx._id && 'bg-brand-50')}
                      >
                        <td className="font-mono text-xs font-semibold text-brand-700">{rx.rxNumber || '—'}</td>
                        <td className="whitespace-nowrap text-xs text-ink-600">{formatDate(rx.prescriptionDate)}</td>
                        <td>
                          <div className="text-[13px] font-semibold text-ink-900">{`${p.firstName || ''} ${p.lastName || ''}`.trim() || '—'}</div>
                          <div className="font-mono text-[10px] text-ink-400">{p.uhid || ''}</div>
                        </td>
                        <td className="text-xs text-ink-600">Dr. {rx.doctorId?.name || '—'}</td>
                        <td className="text-xs font-semibold text-ink-700">{rx.items?.length || 0}</td>
                        <td>
                          {rx.isDispensed ? (
                            <Badge label="DISPENSED" status="COMPLETED" />
                          ) : rx.status === 'CANCELLED' ? (
                            <Badge label="CANCELLED" status="CANCELLED" />
                          ) : (
                            <Badge label="ACTIVE" status="ACTIVE" />
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

        <aside className="min-w-0">
          {detail.isLoading && selectedId ? (
            <LoadingState label="Loading prescription…" />
          ) : detail.data ? (
            <div className="card">
              <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-bold text-ink-900"><FileText className="h-4 w-4 text-brand-600" /> {detail.data.rxNumber}</div>
                {detail.data.isDispensed ? <Badge label="DISPENSED" status="COMPLETED" /> : <Badge label="ACTIVE" status="ACTIVE" />}
              </div>
              <div className="space-y-3 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ink-50 px-3 py-2.5">
                  <div>
                    <div className="text-[13px] font-bold text-ink-900">{`${detail.data.patientId?.firstName || ''} ${detail.data.patientId?.lastName || ''}`.trim()}</div>
                    <div className="font-mono text-[10px] text-ink-400">{detail.data.patientId?.uhid || ''}</div>
                  </div>
                  <div className="text-right text-[11px] text-ink-500">
                    <div className="flex items-center gap-1"><CalendarClock className="h-3 w-3" /> {formatDateTime(detail.data.prescriptionDate)}</div>
                    <div className="mt-0.5 flex items-center gap-1"><Stethoscope className="h-3 w-3" /> Dr. {detail.data.doctorId?.name || '—'}</div>
                  </div>
                </div>

                {detail.data.diagnosis ? (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Diagnosis</div>
                    <div className="mt-0.5 text-[13px] text-ink-800">{detail.data.diagnosis}</div>
                  </div>
                ) : null}

                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Medications</div>
                  <div className="mt-1.5 space-y-1.5">
                    {(detail.data.items || []).map((it, i) => (
                      <div key={i} className="rounded-lg border border-ink-100 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[13px] font-bold text-ink-900">{it.medicineName}</span>
                          <span className="text-[11px] text-ink-500">{it.quantity} dispensed</span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-ink-600">
                          {it.dosage || ''} · {it.route || 'ORAL'}
                          {it.frequency ? ` · ${it.frequency}` : ''}
                          {it.duration ? ` · ${it.duration}` : ''}
                          {it.timing ? ` · ${TIMING_LABEL[it.timing] || it.timing}` : ''}
                        </div>
                        {it.instructions ? <div className="mt-1 text-[11px] italic text-ink-500">{it.instructions}</div> : null}
                      </div>
                    ))}
                  </div>
                </div>

                {detail.data.advice ? (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Advice</div>
                    <div className="mt-0.5 text-[13px] text-ink-800">{detail.data.advice}</div>
                  </div>
                ) : null}

                {detail.data.followUpDate ? (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Follow-up</div>
                    <div className="mt-0.5 flex items-center gap-1 text-[13px] font-semibold text-ink-800"><CalendarClock className="h-3.5 w-3.5 text-brand-600" /> {formatDate(detail.data.followUpDate)}</div>
                  </div>
                ) : null}

                <button className="btn-primary w-full">
                  <Printer className="h-4 w-4" /> Print prescription
                </button>
              </div>
            </div>
          ) : (
            <div className="card flex h-full min-h-[24rem] flex-col items-center justify-center gap-3 p-10 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><Pill className="h-7 w-7" /></span>
              <div className="text-lg font-bold text-ink-900">Select a prescription</div>
              <p className="max-w-xs text-sm text-ink-500">Choose a row to view the full medication plan, dosage and instructions.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}