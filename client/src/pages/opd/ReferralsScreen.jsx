import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, Stethoscope, Share2, Search } from 'lucide-react';
import api from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/Feedback';
import Badge from '../../components/ui/Badge';
import { cn, formatDate } from '../../lib/utils';

export default function ReferralsScreen() {
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const list = useQuery({
    queryKey: ['opd-referrals'],
    queryFn: async () => (await api.get('/opd/visits', { params: { status: 'REFERRED', limit: 100 } })).data.data,
  });

  const filtered = useMemo(() => {
    const rows = list.data || [];
    const term = q.trim().toLowerCase();
    if (!term) return rows.sort((a, b) => new Date(b.visitDate) - new Date(a.visitDate));
    return rows
      .filter((v) => {
        const p = v.patientId || {};
        return `${p.firstName || ''} ${p.lastName || ''} ${p.uhid || ''} ${v.opdNumber || ''} ${v.referral?.toDoctor || ''} ${v.referral?.toDepartment || ''}`.toLowerCase().includes(term);
      })
      .sort((a, b) => new Date(b.visitDate) - new Date(a.visitDate));
  }, [list.data, q]);

  const selected = useMemo(() => filtered.find((v) => v._id === selectedId) || null, [filtered, selectedId]);

  return (
    <div className="p-6">
      <PageHeader
        title="Referrals"
        subtitle="OPD visits referred to another doctor or department — view who, when and why each patient was referred."
        actions={<Badge label={`${filtered.length} referred`} status="REFERRED" />}
      />

      <div className="mb-4 flex items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
          <input className="input pl-9" placeholder="Search by patient, UHID, OP no, doctor…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="card overflow-hidden">
          {list.isLoading ? (
            <LoadingState label="Loading referrals…" />
          ) : list.isError ? (
            <ErrorState message={list.error?.message} />
          ) : filtered.length === 0 ? (
            <EmptyState title="No referrals yet" hint="Patients referred during a consultation appear here." />
          ) : (
            <table className="table w-full">
              <thead>
                <tr>
                  <th className="text-[10px] uppercase tracking-wider">OP No</th>
                  <th className="text-[10px] uppercase tracking-wider">Date</th>
                  <th className="text-[10px] uppercase tracking-wider">Patient</th>
                  <th className="text-[10px] uppercase tracking-wider">Referred to</th>
                  <th className="text-[10px] uppercase tracking-wider">Reason</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => {
                  const p = v.patientId || {};
                  return (
                    <tr
                      key={v._id}
                      onClick={() => setSelectedId(v._id)}
                      className={cn('cursor-pointer transition-colors hover:bg-ink-50', selectedId === v._id && 'bg-brand-50')}
                    >
                      <td className="font-mono text-xs font-semibold text-brand-700">{v.opdNumber}</td>
                      <td className="whitespace-nowrap text-xs text-ink-600">{formatDate(v.visitDate)}</td>
                      <td>
                        <div className="text-[13px] font-semibold text-ink-900">{`${p.firstName || ''} ${p.lastName || ''}`.trim() || '—'}</div>
                        <div className="font-mono text-[10px] text-ink-400">{p.uhid || ''}</div>
                      </td>
                      <td className="text-xs font-semibold text-ink-700">{v.referral?.toDoctor || '—'}</td>
                      <td className="max-w-[220px] truncate text-xs text-ink-600">{v.referral?.reason || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <aside className="min-w-0">
          {selected ? (
            <div className="card">
              <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-bold text-ink-900"><ArrowLeftRight className="h-4 w-4 text-brand-600" /> Referral detail</div>
                <Badge label="REFERRED" status="REFERRED" />
              </div>
              <div className="space-y-4 px-4 py-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ink-50 px-3 py-2.5">
                  <div>
                    <div className="text-[13px] font-bold text-ink-900">{`${selected.patientId?.firstName || ''} ${selected.patientId?.lastName || ''}`.trim()}</div>
                    <div className="font-mono text-[10px] text-ink-400">{selected.patientId?.uhid || ''}</div>
                  </div>
                  <div className="text-right text-[11px] text-ink-500">
                    <div>OP {selected.opdNumber}</div>
                    <div className="mt-0.5">{formatDate(selected.visitDate)}</div>
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Referred to</div>
                  <div className="mt-1 text-ink-800">
                    <div className="flex items-center gap-1.5"><Stethoscope className="h-3.5 w-3.5 text-ink-400" /> {selected.referral?.toDoctor || '—'}</div>
                    {selected.referral?.toDepartment ? <div className="mt-0.5 pl-5 text-ink-500">{selected.referral.toDepartment}</div> : null}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Reason</div>
                  <div className="mt-0.5 text-[13px] text-ink-800">{selected.referral?.reason || '—'}</div>
                </div>

                {selected.referral?.notes ? (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Notes</div>
                    <div className="mt-0.5 text-[13px] text-ink-800">{selected.referral.notes}</div>
                  </div>
                ) : null}

                {selected.doctorId ? (
                  <div className="flex items-center gap-1.5 text-xs text-ink-500">Referred by <Stethoscope className="h-3 w-3 text-ink-400" /> Dr. {selected.doctorId.name}</div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="card flex h-full min-h-[24rem] flex-col items-center justify-center gap-3 p-10 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><Share2 className="h-7 w-7" /></span>
              <div className="text-lg font-bold text-ink-900">Select a referral</div>
              <p className="max-w-xs text-sm text-ink-500">Choose a row to view the referring doctor, destination and reason.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}