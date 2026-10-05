import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FlaskConical, Layers, Pencil, Plus, Trash2, X } from 'lucide-react';
import api, { apiError } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/Feedback';
import { badge } from '../../components/ui/Badge.jsx';
import { Modal, Field, SearchBox, Submit, ConfirmDialog, IconButton } from './parts';
import { formatCurrency } from '../../lib/utils';

const BLANK = { name: '', code: '', category: '', sampleType: '', container: '', price: '', turnaroundHours: '', parameters: [] };

const toForm = (t) => ({
  ...BLANK,
  ...t,
  price: t?.price ?? '',
  turnaroundHours: t?.turnaroundHours ?? '',
  category: t?.category?._id || t?.category || '',
  parameters: Array.isArray(t?.parameters) ? t.parameters : [],
});

const emptyParam = () => ({ name: '', unit: '', normalRange: '', genderSpecific: 'ALL' });

export default function LabTestSettings() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [showRetired, setShowRetired] = useState(false);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['settings-lab-tests', q.trim(), showRetired],
    queryFn: async () => (await api.get('/lab/tests', {
      params: { search: q.trim() || undefined, isActive: showRetired ? 'false' : 'true' },
    })).data.data,
  });
  const { data: categories } = useQuery({
    queryKey: ['lab-test-categories'],
    queryFn: async () => (await api.get('/lab/test-categories')).data.data,
  });

  const inval = () => {
    qc.invalidateQueries({ queryKey: ['settings-lab-tests'] });
    qc.invalidateQueries({ queryKey: ['lab-tests'] });
    qc.invalidateQueries({ queryKey: ['lab-test-categories'] });
  };

  const remove = useMutation({
    mutationFn: async (id) => (await api.delete(`/lab/tests/${id}`)).data.data,
    onSuccess: () => { toast.success('Test retired'); setRemoving(null); inval(); },
    onError: (e) => { setRemoving(null); toast.error(apiError(e)); },
  });

  const restore = useMutation({
    mutationFn: async (id) => (await api.put(`/lab/tests/${id}`, { active: true })).data.data,
    onSuccess: () => { toast.success('Test reactivated'); inval(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const rows = data || [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Test names"
        subtitle="The lab catalogue. A test carries its own normal ranges, so retiring one never rewrites a report that has already been released."
        actions={<button className="btn-primary" onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> Add test</button>}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="card overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 p-3">
              <div className="min-w-[200px] flex-1">
                <SearchBox value={q} onChange={setQ} placeholder="Search test name or code…" />
              </div>
              <label className="flex items-center gap-1.5 text-[11px] text-ink-600">
                <input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} />
                Show retired only
              </label>
            </div>

            {isLoading ? <LoadingState /> : error ? <ErrorState message={apiError(error)} /> : !rows.length ? (
              <EmptyState title="No lab tests" hint={q ? 'Nothing matches that search.' : 'Add the first test to the catalogue.'} />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Test</th><th>Code</th><th>Category</th><th>Sample</th>
                      <th>Parameters</th><th>Price</th><th>TAT</th><th>Status</th><th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((t) => (
                      <tr key={t._id} className={t.active === false ? 'opacity-60' : undefined}>
                        <td className="font-medium text-ink-900">{t.name}</td>
                        <td className="text-xs">{t.code || <span className="text-ink-400">—</span>}</td>
                        <td className="text-xs">{t.category?.name || <span className="text-ink-400">Uncategorised</span>}</td>
                        <td className="text-xs">{t.sampleType || <span className="text-ink-400">—</span>}</td>
                        <td className="text-xs">{t.parameters?.length || 0}</td>
                        <td className="text-xs">{formatCurrency(t.price || 0)}</td>
                        <td className="text-xs">{t.turnaroundHours ? `${t.turnaroundHours}h` : '—'}</td>
                        <td>{badge(t.active === false ? 'RETIRED' : 'ACTIVE', t.active === false ? 'INACTIVE' : 'ACTIVE')}</td>
                        <td className="text-right">
                          <div className="flex justify-end gap-1">
                            <IconButton label="Edit test" icon={Pencil} tone="primary" onClick={() => setEditing(t)} />
                            {t.active === false ? (
                              <IconButton label="Reactivate" icon={FlaskConical} tone="primary" onClick={() => restore.mutate(t._id)} />
                            ) : (
                              <IconButton label="Retire test" icon={Trash2} tone="danger" onClick={() => setRemoving(t)} />
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

        <LabCategoryPanel categories={categories || []} onMutate={inval} />
      </div>

      {editing && (
        <LabTestFormModal
          test={editing === 'new' ? null : editing}
          categories={categories || []}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); inval(); }}
        />
      )}

      {removing && (
        <ConfirmDialog
          title={`Retire ${removing.name}?`}
          icon={Trash2}
          body="It disappears from the ordering catalogue straight away."
          consequence="Released reports keep the name, price and normal ranges exactly as they were on the day. Reactivate at any time."
          confirmLabel="Retire test"
          pending={remove.isPending}
          onCancel={() => setRemoving(null)}
          onConfirm={() => remove.mutate(removing._id)}
        />
      )}
    </div>
  );
}

function LabTestFormModal({ test, categories, onClose, onDone }) {
  const isNew = !test;
  const [form, setForm] = useState(() => toForm(test));

  const mutation = useMutation({
    mutationFn: async (v) => {
      const body = {
        ...v,
        price: v.price === '' ? 0 : Number(v.price),
        turnaroundHours: v.turnaroundHours === '' ? undefined : Number(v.turnaroundHours),
        category: v.category || undefined,
        // Empty strings in a parameter row would be stored as literal blanks.
        parameters: v.parameters.filter((p) => p.name?.trim()),
      };
      return isNew
        ? (await api.post('/lab/tests', body)).data.data
        : (await api.put(`/lab/tests/${test._id}`, body)).data.data;
    },
    onSuccess: () => { toast.success(isNew ? 'Test added' : 'Test updated'); onDone(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const setParam = (i, k) => (e) => setForm((p) => ({
    ...p,
    parameters: p.parameters.map((row, idx) => (idx === i ? { ...row, [k]: e.target.value } : row)),
  }));

  const addParam = () => setForm((p) => ({ ...p, parameters: [...p.parameters, emptyParam()] }));
  const dropParam = (i) => setForm((p) => ({ ...p, parameters: p.parameters.filter((_, idx) => idx !== i) }));

  const doSave = () => {
    if (!form.name.trim()) return toast.error('Test name is required');
    mutation.mutate(form);
  };

  return (
    <Modal
      title={isNew ? 'Add lab test' : `Edit ${test.name}`}
      icon={isNew ? Plus : Pencil}
      onClose={onClose}
      wide
      footer={(
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <Submit pending={mutation.isPending} onClick={doSave}>{isNew ? 'Add test' : 'Save changes'}</Submit>
        </>
      )}
    >
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); doSave(); }}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Test name" required><input className="input" value={form.name} onChange={set('name')} /></Field>
          <Field label="Code"><input className="input" value={form.code} onChange={set('code')} placeholder="e.g. CBC" /></Field>
          <Field label="Category">
            <select className="select" value={form.category} onChange={set('category')}>
              <option value="">Uncategorised</option>
              {categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label="Sample type"><input className="input" value={form.sampleType} onChange={set('sampleType')} placeholder="e.g. Whole blood" /></Field>
          <Field label="Container"><input className="input" value={form.container} onChange={set('container')} placeholder="e.g. EDTA" /></Field>
          <Field label="Price"><input className="input" type="number" min="0" step="0.01" value={form.price} onChange={set('price')} /></Field>
          <Field label="Turnaround (hours)"><input className="input" type="number" min="0" value={form.turnaroundHours} onChange={set('turnaroundHours')} /></Field>
        </div>

        <div className="divider" />

        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs font-bold text-ink-900">Parameters &amp; normal ranges</h4>
            <p className="mt-0.5 text-[11px] text-ink-500">
              Flagging a value out of range is what makes a result useful, so each row carries its own limits.
            </p>
          </div>
          <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={addParam}>
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>

        {!form.parameters.length ? (
          <p className="rounded-lg border border-dashed border-ink-200 py-3 text-center text-[11px] text-ink-400">
            No parameters yet — the result will be recorded as a single free-text value.
          </p>
        ) : (
          <div className="space-y-2">
            {form.parameters.map((p, i) => (
              <div key={i} className="grid grid-cols-12 items-end gap-2">
                <div className="col-span-3">
                  <label className="label text-[10px]">Parameter</label>
                  <input className="input" value={p.name || ''} onChange={setParam(i, 'name')} placeholder="e.g. Haemoglobin" />
                </div>
                <div className="col-span-2">
                  <label className="label text-[10px]">Unit</label>
                  <input className="input" value={p.unit || ''} onChange={setParam(i, 'unit')} placeholder="g/dL" />
                </div>
                <div className="col-span-3">
                  <label className="label text-[10px]">Normal range</label>
                  <input className="input" value={p.normalRange || ''} onChange={setParam(i, 'normalRange')} placeholder="12.0 - 15.0" />
                </div>
                <div className="col-span-3">
                  <label className="label text-[10px]">Applies to</label>
                  <select className="select" value={p.genderSpecific || 'ALL'} onChange={setParam(i, 'genderSpecific')}>
                    <option value="ALL">All</option>
                    <option value="MALE">Male only</option>
                    <option value="FEMALE">Female only</option>
                  </select>
                </div>
                <div className="col-span-1">
                  <IconButton label={`Remove ${p.name || 'parameter'}`} icon={X} tone="danger" onClick={() => dropParam(i)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </form>
    </Modal>
  );
}

function LabCategoryPanel({ categories, onMutate }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');
  const [removing, setRemoving] = useState(null);

  const inval = () => { qc.invalidateQueries({ queryKey: ['lab-test-categories'] }); onMutate?.(); };

  const create = useMutation({
    mutationFn: async () => (await api.post('/lab/test-categories', { name: name.trim() })).data.data,
    onSuccess: () => { toast.success('Category added'); setName(''); inval(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const update = useMutation({
    mutationFn: async () => (await api.put(`/lab/test-categories/${editing._id}`, { name: draft.trim() })).data.data,
    onSuccess: () => { toast.success('Renamed'); setEditing(null); inval(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const remove = useMutation({
    mutationFn: async (id) => (await api.delete(`/lab/test-categories/${id}`)).data.data,
    onSuccess: () => { toast.success('Category deleted'); setRemoving(null); inval(); },
    onError: (e) => { setRemoving(null); toast.error(apiError(e)); },
  });

  return (
    <div className="card p-4">
      <h3 className="mb-2.5 flex items-center gap-1.5 text-sm font-bold text-ink-900">
        <Layers className="h-4 w-4 text-brand-600" /> Categories
      </h3>

      <div className="mb-3 flex gap-2">
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (name.trim()) create.mutate(); } }}
          placeholder="New category…"
        />
        <button className="btn-secondary shrink-0" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {!categories.length ? (
        <p className="py-2 text-center text-[11px] text-ink-400">None yet</p>
      ) : (
        <ul className="space-y-1">
          {categories.map((c) => (
            <li key={c._id} className="flex items-center gap-1.5 rounded-lg border border-ink-100 px-2 py-1.5">
              {editing?._id === c._id ? (
                <>
                  <input className="input py-1 text-xs" value={draft} autoFocus onChange={(e) => setDraft(e.target.value)} />
                  <Submit pending={update.isPending} disabled={!draft.trim()} className="btn-primary px-2 py-1 text-xs" onClick={() => update.mutate()}>Save</Submit>
                  <button className="btn-icon" onClick={() => setEditing(null)}>✕</button>
                </>
              ) : (
                <>
                  <span className="flex-1 truncate text-xs text-ink-700">{c.name}</span>
                  <IconButton label={`Rename ${c.name}`} icon={Pencil} onClick={() => { setEditing(c); setDraft(c.name); }} />
                  <IconButton label={`Delete ${c.name}`} icon={Trash2} tone="danger" onClick={() => setRemoving(c)} />
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
          body="This is a permanent deletion, unlike retiring a test."
          consequence="It is refused while any active test still uses it, so nothing can be orphaned."
          confirmLabel="Delete"
          pending={remove.isPending}
          onCancel={() => setRemoving(null)}
          onConfirm={() => remove.mutate(removing._id)}
        />
      )}
    </div>
  );
}