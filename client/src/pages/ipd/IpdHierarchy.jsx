import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, X, Building2, Sparkles } from 'lucide-react';
import api, { apiError } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import { LoadingState, ErrorState, EmptyState, Spinner } from '../../components/ui/Feedback';
import { formatDate } from '../../lib/utils';

const WARD_TYPES = ['GENERAL', 'SEMI_PRIVATE', 'PRIVATE', 'ICU', 'NICU', 'PICU', 'EMERGENCY', 'OT', 'DELIVERY'];

export default function IpdHierarchy() {
  const qc = useQueryClient();
  const [show, setShow] = useState(false);

  const wards = useQuery({
    queryKey: ['ipd-wards'],
    queryFn: async () => (await api.get('/ipd/wards')).data.data,
  });

  return (
    <div className="p-6">
      <PageHeader
        title="Ward Management"
        subtitle="Create wards, floors, rooms and beds in one go"
        actions={
          <button className="btn-primary" onClick={() => setShow(true)}><Plus className="h-4 w-4" /> New ward + beds</button>
        }
      />

      {show && <HierarchyForm onClose={() => setShow(false)} onDone={() => { setShow(false); qc.invalidateQueries({ queryKey: ['ipd-wards'] }); qc.invalidateQueries({ queryKey: ['ipd-command-center'] }); }} />}

      <div className="card overflow-hidden">
        {wards.isLoading ? <LoadingState /> : wards.error ? <ErrorState message={apiError(wards.error)} /> : !wards.data?.length ? (
          <EmptyState title="No wards yet" hint="Create your first ward with beds using “New ward + beds”" />
        ) : (
          <table className="table">
            <thead>
              <tr><th>Ward</th><th>Type</th><th>Code</th><th>Beds</th><th>Charge / day</th><th>Status</th><th>Created</th></tr>
            </thead>
            <tbody>
              {wards.data.map((w) => (
                <tr key={w._id}>
                  <td className="font-medium text-ink-900">{w.name}{w.floorId?.name ? <span className="ml-1 text-xs text-ink-400">· {w.floorId.name}</span> : ''}</td>
                  <td>{w.wardType}</td>
                  <td className="font-mono text-xs">{w.code || '—'}</td>
                  <td>{w.bedCount ?? '—'}</td>
                  <td className="tabular-nums">₹{(w.chargePerDay || 0).toLocaleString('en-IN')}</td>
                  <td>
                    <span className={w.active === false ? 'badge bg-ink-100 text-ink-600' : 'badge bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200'}>
                      {w.active === false ? 'Inactive' : 'Active'}
                    </span>
                  </td>
                  <td className="text-xs text-ink-500">{formatDate(w.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function HierarchyForm({ onClose, onDone }) {
  const [form, setForm] = useState({
    name: '',
    code: '',
    wardType: 'GENERAL',
    chargePerDay: '',
    floors: '1',
    roomsPerFloor: '2',
    bedsPerRoom: '2',
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const mutation = useMutation({
    mutationFn: async (payload) => (await api.post('/ipd/hierarchy', payload)).data.data,
    onSuccess: () => { toast.success('Ward hierarchy created'); onDone(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const submit = () => {
    if (!form.name.trim()) return toast.error('Ward name is required');
    const beds = [];
    const floors = Math.max(1, parseInt(form.floors, 10) || 1);
    const rooms = Math.max(1, parseInt(form.roomsPerFloor, 10) || 1);
    const per = Math.max(1, parseInt(form.bedsPerRoom, 10) || 1);
    for (let f = 1; f <= floors; f++) {
      for (let r = 1; r <= rooms; r++) {
        for (let b = 1; b <= per; b++) {
          beds.push({ bedNumber: `F${f}R${r}B${b}`, bedType: form.wardType === 'ICU' ? 'ICU' : 'GENERAL', status: 'AVAILABLE' });
        }
      }
    }
    mutation.mutate({
      ward: {
        name: form.name.trim(),
        code: form.code.trim() || undefined,
        wardType: form.wardType,
        chargePerDay: form.chargePerDay ? Number(form.chargePerDay) : undefined,
        bedCount: beds.length,
      },
      beds,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/60 p-4 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="card my-8 w-full max-w-lg animate-slide-up p-6" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="btn-icon float-right -mr-1 -mt-1"><X className="h-5 w-5" /></button>
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Building2 className="h-5 w-5" /></div>
          <div>
            <h2 className="text-lg font-bold text-ink-900">New ward + beds</h2>
            <p className="text-xs text-ink-500">Creates a ward and auto-generates its bed grid</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className="label">Ward name *</label><input className="input" value={form.name} onChange={set('name')} placeholder="e.g. Private Ward 1" /></div>
          <div><label className="label">Code</label><input className="input" value={form.code} onChange={set('code')} placeholder="e.g. PW-1" /></div>
          <div><label className="label">Ward type</label>
            <select className="select" value={form.wardType} onChange={set('wardType')}>
              {WARD_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div><label className="label">Charge per day (₹)</label><input className="input" type="number" value={form.chargePerDay} onChange={set('chargePerDay')} /></div>
          <div><label className="label">Rooms per floor</label><input className="input" type="number" min="1" value={form.roomsPerFloor} onChange={set('roomsPerFloor')} /></div>
          <div><label className="label">Beds per room</label><input className="input" type="number" min="1" value={form.bedsPerRoom} onChange={set('bedsPerRoom')} /></div>
          <div><label className="label">Floors</label><input className="input" type="number" min="1" value={form.floors} onChange={set('floors')} /></div>
        </div>

        <div className="mt-3 rounded-xl bg-ink-50 px-3 py-2 text-[11px] text-ink-500">
        <Sparkles className="mr-1 inline h-3.5 w-3.5 text-brand-500" />
          Generates <b>{Math.max(1, parseInt(form.floors, 10) || 1) * Math.max(1, parseInt(form.roomsPerFloor, 10) || 1) * Math.max(1, parseInt(form.bedsPerRoom, 10) || 1)} beds</b> (F#R#B# numbering).
        </div>

        <button className="btn-primary mt-4 w-full" disabled={mutation.isPending} onClick={submit}>
          {mutation.isPending ? <Spinner className="h-4 w-4 text-white" /> : 'Create ward'}
        </button>
      </div>
    </div>
  );
}