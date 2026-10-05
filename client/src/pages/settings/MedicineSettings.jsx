import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Boxes, Building, Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import api, { apiError } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/Feedback';
import { badge } from '../../components/ui/Badge.jsx';
import { Modal, Field, SearchBox, Submit, ConfirmDialog, IconButton } from './parts';

const UNITS = ['TAB', 'CAP', 'ML', 'VIAL', 'AMP', 'BOTTLE', 'TUBE', 'SACHET', 'DROPS', 'INJ'];
const BLANK = {
  name: '', genericName: '', brand: '', unit: 'TAB', packSize: '',
  hsnCode: '', gstPct: '', reorderLevel: '', maxStock: '',
  category: '', manufacturer: '', storageConditions: '', isControlled: false,
};

const toForm = (m) => ({
  ...BLANK,
  ...m,
  packSize: m?.packSize ?? '',
  gstPct: m?.gstPct ?? '',
  reorderLevel: m?.reorderLevel ?? '',
  maxStock: m?.maxStock ?? '',
  category: m?.category?._id || m?.category || '',
  manufacturer: m?.manufacturer?._id || m?.manufacturer || '',
});

export default function MedicineSettings() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [showRetired, setShowRetired] = useState(false);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['settings-medicines', q.trim(), showRetired],
    queryFn: async () => (await api.get('/pharmacy/medicines', {
      params: { limit: 200, search: q.trim() || undefined, isActive: showRetired ? 'false' : 'true' },
    })).data.data,
  });
  const { data: categories } = useQuery({
    queryKey: ['pharmacy-cats'],
    queryFn: async () => (await api.get('/pharmacy/categories')).data.data,
  });
  const { data: manufacturers } = useQuery({
    queryKey: ['pharmacy-manufacturers'],
    queryFn: async () => (await api.get('/pharmacy/manufacturers')).data.data,
  });

  const inval = () => {
    qc.invalidateQueries({ queryKey: ['settings-medicines'] });
    qc.invalidateQueries({ queryKey: ['pharmacy-'] });
  };

  const remove = useMutation({
    mutationFn: async (id) => (await api.delete(`/pharmacy/medicines/${id}`)).data.data,
    onSuccess: () => { toast.success('Medicine deactivated'); setRemoving(null); inval(); },
    onError: (e) => { setRemoving(null); toast.error(apiError(e)); },
  });

  const restore = useMutation({
    mutationFn: async (id) => (await api.put(`/pharmacy/medicines/${id}`, { isActive: true })).data.data,
    onSuccess: () => { toast.success('Medicine reactivated'); inval(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const rows = data || [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Medicines"
        subtitle="The pharmacy catalogue. Retiring a medicine hides it from ordering but keeps it attached to bills already dispensed."
        actions={<button className="btn-primary" onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> Add medicine</button>}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="card overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 p-3">
              <div className="min-w-[200px] flex-1">
                <SearchBox value={q} onChange={setQ} placeholder="Search name, generic or brand…" />
              </div>
              <label className="flex items-center gap-1.5 text-[11px] text-ink-600">
                <input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} />
                Show retired only
              </label>
            </div>

            {isLoading ? <LoadingState /> : error ? <ErrorState message={apiError(error)} /> : !rows.length ? (
              <EmptyState title="No medicines" hint={q ? 'Nothing matches that search.' : 'Add the first medicine to the catalogue.'} />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th><th>Generic</th><th>Pack</th><th>GST</th>
                      <th>Reorder at</th><th>Stock</th><th>Status</th><th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((m) => (
                      <tr key={m._id} className={m.isActive === false ? 'opacity-60' : undefined}>
                        <td className="font-medium text-ink-900">
                          {m.name}
                          {m.brand ? <span className="block text-[10px] font-normal text-ink-400">{m.brand}</span> : null}
                        </td>
                        <td className="text-xs">{m.genericName || <span className="text-ink-400">—</span>}</td>
                        <td className="text-xs">{m.packSize ? `${m.packSize} ${m.unit || ''}`.trim() : (m.unit || '—')}</td>
                        <td className="text-xs">{m.gstPct ? `${m.gstPct}%` : '—'}</td>
                        <td className="text-xs">{m.reorderLevel ?? 0}</td>
                        <td className="text-xs font-medium">{m.totalStock ?? 0}</td>
                        <td>{badge(m.isActive === false ? 'RETIRED' : 'ACTIVE', m.isActive === false ? 'INACTIVE' : 'ACTIVE')}</td>
                        <td className="text-right">
                          <div className="flex justify-end gap-1">
                            <IconButton label="Edit medicine" icon={Pencil} tone="primary" onClick={() => setEditing(m)} />
                            {m.isActive === false ? (
                              <IconButton label="Reactivate" icon={Boxes} tone="primary" onClick={() => restore.mutate(m._id)} />
                            ) : (
                              <IconButton label="Retire medicine" icon={Trash2} tone="danger" onClick={() => setRemoving(m)} />
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <LookupPanel
            title="Categories"
            icon={Layers}
            rows={categories || []}
            base="/pharmacy/categories"
            queryKey="pharmacy-cats"
            onMutate={inval}
          />
          <LookupPanel
            title="Manufacturers"
            icon={Building}
            rows={manufacturers || []}
            base="/pharmacy/manufacturers"
            queryKey="pharmacy-manufacturers"
            onMutate={inval}
          />
        </div>
      </div>

      {editing && (
        <MedicineFormModal
          medicine={editing === 'new' ? null : editing}
          categories={categories || []}
          manufacturers={manufacturers || []}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); inval(); }}
        />
      )}

      {removing && (
        <ConfirmDialog
          title={`Retire ${removing.name}?`}
          icon={Trash2}
          body="It disappears from prescribing and ordering screens straight away."
          consequence="Bills and prescriptions that already reference it keep the name and are unaffected. Reactivate at any time."
          confirmLabel="Retire medicine"
          pending={remove.isPending}
          onCancel={() => setRemoving(null)}
          onConfirm={() => remove.mutate(removing._id)}
        />
      )}
    </div>
  );
}

function MedicineFormModal({ medicine, categories, manufacturers, onClose, onDone }) {
  const isNew = !medicine;
  const [form, setForm] = useState(() => toForm(medicine));

  const mutation = useMutation({
    mutationFn: async (v) => {
      const body = {
        ...v,
        packSize: v.packSize === '' ? undefined : Number(v.packSize),
        gstPct: v.gstPct === '' ? 0 : Number(v.gstPct),
        reorderLevel: v.reorderLevel === '' ? 0 : Number(v.reorderLevel),
        maxStock: v.maxStock === '' ? undefined : Number(v.maxStock),
        category: v.category || undefined,
        manufacturer: v.manufacturer || undefined,
      };
      return isNew
        ? (await api.post('/pharmacy/medicines', body)).data.data
        : (await api.put(`/pharmacy/medicines/${medicine._id}`, body)).data.data;
    },
    onSuccess: () => { toast.success(isNew ? 'Medicine added' : 'Medicine updated'); onDone(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const doSave = () => {
    if (!form.name.trim()) return toast.error('Medicine name is required');
    mutation.mutate(form);
  };

  return (
    <Modal
      title={isNew ? 'Add medicine' : `Edit ${medicine.name}`}
      icon={isNew ? Plus : Pencil}
      onClose={onClose}
      wide
      footer={(
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <Submit pending={mutation.isPending} onClick={doSave}>{isNew ? 'Add medicine' : 'Save changes'}</Submit>
        </>
      )}
    >
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); doSave(); }}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Name" required><input className="input" value={form.name} onChange={set('name')} /></Field>
          <Field label="Generic name"><input className="input" value={form.genericName} onChange={set('genericName')} /></Field>
          <Field label="Brand"><input className="input" value={form.brand} onChange={set('brand')} /></Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label="Unit">
            <select className="select" value={form.unit} onChange={set('unit')}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </Field>
          <Field label="Pack size"><input className="input" type="number" min="1" value={form.packSize} onChange={set('packSize')} /></Field>
          <Field label="HSN code"><input className="input" value={form.hsnCode} onChange={set('hsnCode')} /></Field>
          <Field label="GST %"><input className="input" type="number" min="0" step="0.01" value={form.gstPct} onChange={set('gstPct')} /></Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Category">
            <select className="select" value={form.category} onChange={set('category')}>
              <option value="">Uncategorised</option>
              {categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Manufacturer">
            <select className="select" value={form.manufacturer} onChange={set('manufacturer')}>
              <option value="">Unspecified</option>
              {manufacturers.map((m) => <option key={m._id} value={m._id}>{m.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Reorder level" hint="Warn when stock falls to this.">
            <input className="input" type="number" min="0" value={form.reorderLevel} onChange={set('reorderLevel')} />
          </Field>
          <Field label="Maximum stock"><input className="input" type="number" min="0" value={form.maxStock} onChange={set('maxStock')} /></Field>
          <Field label="Storage"><input className="input" value={form.storageConditions} onChange={set('storageConditions')} placeholder="e.g. Below 25 °C" /></Field>
        </div>
        <label className="flex items-center gap-2 text-[11px] text-ink-700">
          <input
            type="checkbox"
            checked={form.isControlled}
            onChange={(e) => setForm((p) => ({ ...p, isControlled: e.target.checked }))}
          />
          Controlled drug — requires a valid prescription and is reported separately
        </label>
      </form>
    </Modal>
  );
}

/**
 * Categories and manufacturers are plain named lookups, so they share one
 * inline add/rename/remove panel instead of each getting their own screen.
 */
function LookupPanel({ title, icon: Icon, rows, base, queryKey, onMutate }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');
  const [removing, setRemoving] = useState(null);

  const inval = () => { qc.invalidateQueries({ queryKey }); onMutate?.(); };

  const create = useMutation({
    mutationFn: async () => (await api.post(base, { name: name.trim() })).data.data,
    onSuccess: () => { toast.success(`${title.replace(/s$/, '')} added`); setName(''); inval(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const update = useMutation({
    mutationFn: async () => (await api.put(`${base}/${editing._id}`, { name: draft.trim() })).data.data,
    onSuccess: () => { toast.success('Renamed'); setEditing(null); inval(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const remove = useMutation({
    mutationFn: async (id) => (await api.delete(`${base}/${id}`)).data.data,
    onSuccess: () => { toast.success('Removed'); setRemoving(null); inval(); },
    onError: (e) => { setRemoving(null); toast.error(apiError(e)); },
  });

  return (
    <div className="card p-4">
      <h3 className="mb-2.5 flex items-center gap-1.5 text-sm font-bold text-ink-900">
        <Icon className="h-4 w-4 text-brand-600" /> {title}
      </h3>

      <div className="mb-3 flex gap-2">
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (name.trim()) create.mutate(); } }}
          placeholder={`New ${title.replace(/s$/, '').toLowerCase()}…`}
        />
        <button className="btn-secondary shrink-0" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {!rows.length ? (
        <p className="py-2 text-center text-[11px] text-ink-400">None yet</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r._id} className="flex items-center gap-1.5 rounded-lg border border-ink-100 px-2 py-1.5">
              {editing?._id === r._id ? (
                <>
                  <input className="input py-1 text-xs" value={draft} autoFocus onChange={(e) => setDraft(e.target.value)} />
                  <Submit pending={update.isPending} disabled={!draft.trim()} className="btn-primary px-2 py-1 text-xs" onClick={() => update.mutate()}>Save</Submit>
                  <button className="btn-icon" onClick={() => setEditing(null)}>✕</button>
                </>
              ) : (
                <>
                  <span className="flex-1 truncate text-xs text-ink-700">{r.name}</span>
                  <IconButton
                    label={`Rename ${r.name}`}
                    icon={Pencil}
                    onClick={() => { setEditing(r); setDraft(r.name); }}
                  />
                  <IconButton label={`Delete ${r.name}`} icon={Trash2} tone="danger" onClick={() => setRemoving(r)} />
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {removing && (
        <ConfirmDialog
          title={`Delete ${removing.name}?`}
          icon={Trash2}
          body="This is a permanent deletion, unlike retiring a medicine."
          consequence="It is refused while any active medicine still uses it, so nothing can be orphaned."
          confirmLabel="Delete"
          pending={remove.isPending}
          onCancel={() => setRemoving(null)}
          onConfirm={() => remove.mutate(removing._id)}
        />
      )}
    </div>
  );
}