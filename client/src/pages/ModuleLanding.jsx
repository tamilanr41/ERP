import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft, Plus, Search, Trash2, X, ExternalLink, Check, Pencil, CalendarDays,
  CircleDot, Circle, CircleCheck, Ban, Layers3, Zap, Inbox, SlidersHorizontal,
} from 'lucide-react';
import { getModule } from '../data/modules';
import { getStudio, columnEligible, toForm, collectData } from '../data/moduleStudio';
import { useAuth } from '../context/AuthContext';
import api, { apiError } from '../lib/api';
import PageHeader from '../components/ui/PageHeader';
import { LoadingState, ErrorState, Spinner } from '../components/ui/Feedback';
import { formatCurrency, formatDate, cn } from '../lib/utils';

const STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const NEXT_STATUS = { PENDING: 'IN_PROGRESS', IN_PROGRESS: 'COMPLETED' };
const NEXT_LABEL = { PENDING: 'Start', IN_PROGRESS: 'Mark done' };

const STATUS_META = {
  PENDING: { label: 'Pending', icon: Circle, cls: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-500' },
  IN_PROGRESS: { label: 'In progress', icon: CircleDot, cls: 'bg-cyan-50 text-cyan-700 ring-cyan-200', dot: 'bg-cyan-500' },
  COMPLETED: { label: 'Completed', icon: CircleCheck, cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
  CANCELLED: { label: 'Cancelled', icon: Ban, cls: 'bg-ink-100 text-ink-500 ring-ink-200', dot: 'bg-ink-400' },
};

const PRIORITY_META = {
  LOW: 'bg-ink-100 text-ink-600',
  MEDIUM: 'bg-amber-50 text-amber-700',
  HIGH: 'bg-violet-50 text-violet-700',
  URGENT: 'bg-rose-50 text-rose-700',
};

const PRIORITY_WEIGHT = { LOW: 0, MEDIUM: 1, HIGH: 2, URGENT: 3 };

function FieldInput({ field, value, onChange }) {
  const set = (e) => onChange(e.target.value);
  if (field.type === 'select')
    return (
      <select className="input" value={value || ''} onChange={set}>
        <option value="">{field.placeholder || `Select ${field.label.toLowerCase()}`}</option>
        {(field.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  if (field.type === 'number')
    return <input className="input" type="number" min="0" value={value || ''} onChange={set} placeholder={field.placeholder || '0'} />;
  if (field.type === 'date')
    return <input className="input" type="date" value={value || ''} onChange={set} />;
  if (field.type === 'textarea')
    return <textarea className="input" rows={2} value={value || ''} onChange={set} placeholder={field.placeholder} />;
  return <input className="input" value={value || ''} onChange={set} placeholder={field.placeholder || field.label} />;
}

export default function ModuleLanding() {
  const { key } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();

  const [searchParams, setSearchParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('ALL');
  const [drawer, setDrawer] = useState(null); // { mode: 'create' } | { mode: 'edit', record }
  const [form, setForm] = useState({});
  const [busyId, setBusyId] = useState('');

  const mod = useMemo(() => getModule(key), [key]);
  const studio = getStudio(key);

  const workflows = useMemo(() => {
    if (!mod) return [];
    const seen = new Set();
    return (mod.tiles || []).filter((t) => (!seen.has(t.label) ? (seen.add(t.label), true) : false));
  }, [mod]);

  const tabParam = searchParams.get('tab');
  const workflow = useMemo(() => {
    if (workflows.length && workflows.some((t) => t.label === tabParam)) return tabParam;
    return workflows[0]?.label || '';
  }, [workflows, tabParam]);

  const fields = studio.fields || [];

  useEffect(() => {
    if (!workflows.length) return;
    const current = searchParams.get('tab');
    if (!current || !workflows.some((t) => t.label === current)) setSearchParams({ tab: workflows[0].label }, { replace: true });
  }, [workflows, searchParams]);

  if (!mod) {
    return (
      <div className="p-6">
        <PageHeader
          title="Module not found"
          subtitle="The module you are looking for does not exist."
          actions={<button className="btn-secondary" onClick={() => navigate('/')}><ArrowLeft className="h-4 w-4" /> Back to command center</button>}
        />
      </div>
    );
  }

  const setTab = (label) => setSearchParams({ tab: label }, { replace: true });
  const noPerm = mod.perm && !hasPermission(mod.perm);
  const Icon = mod.icon;

  const { data: recData, isLoading, error } = useQuery({
    queryKey: ['module-records', key, workflow, status, q.trim()],
    queryFn: async () => {
      const params = new URLSearchParams({ module: key, limit: '200' });
      if (workflow) params.set('workflow', workflow);
      if (status !== 'ALL') params.set('status', status);
      if (q.trim()) params.set('q', q.trim());
      return (await api.get(`/modules/workspaces?${params.toString()}`)).data;
    },
    enabled: Boolean(workflow),
  });

  const { data: summaryData } = useQuery({
    queryKey: ['module-summary', key, workflow],
    queryFn: async () => {
      const params = new URLSearchParams({ module: key });
      if (workflow) params.set('workflow', workflow);
      return (await api.get(`/modules/workspaces/summary?${params.toString()}`)).data;
    },
    enabled: Boolean(workflow),
  });

  const inval = () => {
    qc.invalidateQueries({ queryKey: ['module-records'] });
    qc.invalidateQueries({ queryKey: ['module-summary'] });
  };

  const save = useMutation({
    mutationFn: async (payload) =>
      payload.id
        ? (await api.patch(`/modules/workspaces/${payload.id}`, payload.body)).data
        : (await api.post('/modules/workspaces', payload.body)).data,
    onSuccess: () => { toast.success('Saved'); setDrawer(null); setForm({}); inval(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const advance = useMutation({
    mutationFn: async ({ id, next }) => (await api.patch(`/modules/workspaces/${id}/status`, { status: next })).data,
    onSuccess: () => { toast.success('Status updated'); inval(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const cancel = useMutation({
    mutationFn: async (id) => (await api.patch(`/modules/workspaces/${id}/status`, { status: 'CANCELLED' })).data,
    onSuccess: () => { toast.success('Record cancelled'); inval(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const remove = useMutation({
    mutationFn: async (id) => (await api.delete(`/modules/workspaces/${id}`)).data,
    onSuccess: () => { toast.success('Record removed'); inval(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const records = useMemo(
    () => [...(recData?.data || [])].sort((a, b) => (PRIORITY_WEIGHT[b.priority] || 0) - (PRIORITY_WEIGHT[a.priority] || 0)),
    [recData],
  );
  const summary = summaryData?.data;
  const busy = save.isPending || advance.isPending || cancel.isPending || remove.isPending;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const openCreate = () => { setForm({}); setDrawer({ mode: 'create' }); };
  const openEdit = (record) => { setForm({ title: record.title, ...toForm(record, fields) }); setDrawer({ mode: 'edit', record }); };

  const submitSave = () => {
    if (!form.title?.trim()) return toast.error('Title is required');
    const required = fields.filter((f) => f.required);
    for (const f of required) if (String(form[f.name] || '').trim() === '') return toast.error(`${f.label} is required`);
    const body = {
      title: form.title.trim(),
      reference: form.reference || undefined,
      assignee: form.assignee || undefined,
      priority: form.priority || 'MEDIUM',
      status: form.status || 'PENDING',
      scheduledDate: form.scheduledDate || undefined,
      notes: form.notes || undefined,
      data: collectData(form, fields),
    };
    if (drawer.mode === 'edit') {
      body.module = key; body.workflow = workflow;
      save.mutate({ id: drawer.record._id, body });
    } else {
      save.mutate({ body: { module: key, workflow, ...body } });
    }
  };

  const cellValue = (record, field) => {
    const v = record.data?.[field.name] ?? record[field.name] ?? '';
    if (v === '' || v == null) return '—';
    if (field.type === 'number') return formatCurrency(Number(v));
    if (field.type === 'date') return formatDate(v);
    if (field.type === 'boolean') return v ? 'Yes' : 'No';
    return v;
  };

  const colFields = fields.filter(columnEligible).slice(0, 3);

  const sumChips = [
    { label: 'Total', value: summary?.total ?? '—', icon: Layers3, tone: 'text-ink-900' },
    ...STATUSES.map((s) => ({ label: STATUS_META[s].label, value: summary?.statusBreakdown?.[s] ?? 0, icon: STATUS_META[s].icon, tone: s === 'COMPLETED' ? 'text-emerald-600' : s === 'IN_PROGRESS' ? 'text-cyan-600' : s === 'PENDING' ? 'text-amber-600' : 'text-ink-400' })),
  ];

  return (
    <div className="p-6">
      <PageHeader
        title={mod.label}
        subtitle={`${mod.tagline || 'Module'} · ${workflows.length} workflows · live workspace`}
        actions={
          <div className="flex gap-2">
            {mod.to && mod.to !== `/modules/${key}` && (
              <button className="btn-secondary" onClick={() => navigate(mod.to)}><ExternalLink className="h-4 w-4" /> Open live module</button>
            )}
            <button className="btn-secondary" onClick={() => navigate('/')}><ArrowLeft className="h-4 w-4" /> Command center</button>
          </div>
        }
      />

      {/* Hero */}
      <div className={cn('relative mb-5 overflow-hidden rounded-2xl bg-gradient-to-br p-5 ring-1 ring-ink-100', noPerm ? 'from-ink-100 to-ink-50' : mod.accent)}>
        <div className="relative flex items-start gap-4">
          <div className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/60 ring-1 backdrop-blur', noPerm ? 'ring-ink-200 text-ink-400' : 'ring-white/60 text-brand-700')}>
            <Icon className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-ink-900">{mod.label}</h1>
              <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1', noPerm ? 'bg-white/60 text-ink-500 ring-ink-200' : 'bg-white/70 text-ink-700 ring-white/60')}>{mod.tagline || 'Module'}</span>
            </div>
            <p className="mt-1 max-w-2xl text-[13px] text-ink-600">{mod.description}</p>
          </div>
        </div>
      </div>

      {/* Workflow tabs */}
      <div className="scrollbar-none mb-4 flex gap-1.5 overflow-x-auto rounded-xl bg-ink-100 p-1">
        {workflows.map((t) => (
          <button
            key={t.label}
            onClick={() => setTab(t.label)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium transition',
              workflow === t.label ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:bg-white/60 hover:text-ink-800',
            )}
          >
            <Layers3 className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {sumChips.map((c) => (
          <div key={c.label} className="card flex items-center gap-3 p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink-50 text-ink-500 ring-1 ring-ink-100"><c.icon className="h-4 w-4" /></div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">{c.label}</div>
              <div className={cn('text-lg font-bold tabular-nums leading-tight', c.tone)}>{c.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="card mb-4 flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input className="input pl-9" placeholder={`Search ${studio.referenceLabel || 'records'}…`} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-ink-400" />
          <select className="input w-44" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="ALL">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select>
        </div>
        <button className="btn-primary" onClick={openCreate}><Plus className="h-4 w-4" /> {studio.verb || 'New record'}</button>
      </div>

      {/* Table */}
      {isLoading ? (
        <LoadingState label="Loading workspace…" />
      ) : error ? (
        <ErrorState message={apiError(error)} />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Record</th>
                  {colFields.map((f) => <th key={f.name}>{f.label}</th>)}
                  <th>Scheduled</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr><td colSpan={6 + colFields.length}>
                    <div className="flex flex-col items-center gap-2 py-16 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-100"><Inbox className="h-6 w-6 text-ink-400" /></div>
                      <div className="text-sm font-semibold text-ink-700">No records in this workflow</div>
                      <div className="text-xs text-ink-400">Use “{studio.verb || 'New record'}” to create the first entry.</div>
                    </div>
                  </td></tr>
                ) : records.map((r) => {
                  const sm = STATUS_META[r.status] || STATUS_META.PENDING;
                  return (
                    <tr key={r._id} className={cn('group', r.status === 'CANCELLED' && 'opacity-60')}>
                      <td className="cursor-pointer" onClick={() => openEdit(r)}>
                        <div className="font-mono text-[11px] font-semibold text-brand-700/80">{r.recordNumber || '—'}</div>
                        <div className="text-[13px] font-semibold text-ink-900 group-hover:text-brand-700">{r.title}</div>
                        {r.notes && <div className="mt-0.5 max-w-56 truncate text-xs text-ink-400">{r.notes}</div>}
                      </td>
                      {colFields.map((f) => (
                        <td key={f.name} className="text-[13px] text-ink-700">{cellValue(r, f)}</td>
                      ))}
                      <td className="text-xs text-ink-600">
                        <span className="inline-flex items-center gap-1 whitespace-nowrap"><CalendarDays className="h-3.5 w-3.5" />{formatDate(r.scheduledDate)}</span>
                      </td>
                      <td><span className={cn('badge', PRIORITY_META[r.priority] || 'bg-ink-100 text-ink-600')}>{r.priority || 'MEDIUM'}</span></td>
                      <td><span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset', sm.cls)}><sm.icon className="h-3 w-3" />{sm.label}</span></td>
                      <td className="text-right">
                        <div className="flex justify-end gap-1">
                          {NEXT_STATUS[r.status] && (
                            <button
                              className="btn-icon btn-primary"
                              title={NEXT_LABEL[r.status]}
                              disabled={busy && busyId === r._id}
                              onClick={() => { setBusyId(r._id); advance.mutate({ id: r._id, next: NEXT_STATUS[r.status] }, { onSettled: () => setBusyId('') }); }}
                            >
                              {busy && busyId === r._id ? <Spinner className="h-4 w-4 text-white" /> : <Check className="h-4 w-4" />}
                            </button>
                          )}
                          {!['COMPLETED', 'CANCELLED'].includes(r.status) && (
                            <button className="btn-icon btn-secondary" title="Cancel" disabled={busy && busyId === r._id} onClick={() => { setBusyId(r._id); cancel.mutate(r._id, { onSettled: () => setBusyId('') }); }}>
                              <Ban className="h-4 w-4" />
                            </button>
                          )}
                          <button className="btn-icon btn-secondary" title="Edit" disabled={busy && busyId === r._id} onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></button>
                          <button className="btn-icon btn-danger" title="Remove" disabled={busy && busyId === r._id} onClick={() => { setBusyId(r._id); remove.mutate(r._id, { onSettled: () => setBusyId('') }); }}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 bg-ink-950/50 backdrop-blur-sm" onClick={() => !busy && setDrawer(null)}>
          <div className="absolute inset-y-0 right-0 flex w-full max-w-lg flex-col bg-white shadow-overlay animate-slide-left" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
              <div>
                <h2 className="text-base font-bold text-ink-900">
                  {drawer.mode === 'edit' ? <span className="flex items-center gap-2"><Pencil className="h-4 w-4 text-brand-600" /> Edit record</span> : <span className="flex items-center gap-2"><Zap className="h-4 w-4 text-brand-600" /> {studio.verb || 'New record'}</span>}
                </h2>
                <p className="text-xs text-ink-400">{mod.label} · {workflow}</p>
              </div>
              <button onClick={() => !busy && setDrawer(null)} className="text-ink-400 hover:text-ink-700"><X className="h-5 w-5" /></button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <div><label className="label">Title *</label><input className="input" value={form.title || ''} onChange={set('title')} placeholder={studio.newPlaceholder || 'Describe the work item'} /></div>

              {fields.map((f) => (
                <div key={f.name} className={f.width === 'full' ? '' : ''}>
                  <label className="label">{f.label}{f.required ? ' *' : ''}</label>
                  <FieldInput field={f} value={form[f.name]} onChange={(v) => setForm((s) => ({ ...s, [f.name]: v }))} />
                </div>
              ))}

              <div className="divider" />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Priority</label>
                  <select className="input" value={form.priority || 'MEDIUM'} onChange={set('priority')}>
                    {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Status</label>
                  <select className="input" value={form.status || 'PENDING'} onChange={set('status')}>
                    {STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                  </select>
                </div>
              </div>

              <div><label className="label">Scheduled date</label><input className="input" type="date" value={form.scheduledDate || ''} onChange={set('scheduledDate')} /></div>
              <div>
                <label className="label">Assignee</label>
                <input className="input" value={form.assignee || ''} onChange={set('assignee')} placeholder="Owner" />
              </div>
              <div><label className="label">Notes</label><textarea className="input" rows={3} value={form.notes || ''} onChange={set('notes')} placeholder="Add context" /></div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-ink-100 px-5 py-4">
              <button className="btn-secondary" onClick={() => !busy && setDrawer(null)}>Cancel</button>
              <button className="btn-primary min-w-36" disabled={busy} onClick={submitSave}>
                {save.isPending ? <Spinner className="h-4 w-4 text-white" /> : <Check className="h-4 w-4" />}
                {drawer.mode === 'edit' ? 'Save changes' : studio.verb || 'Create record'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}