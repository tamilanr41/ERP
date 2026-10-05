import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Save, SlidersHorizontal } from 'lucide-react';
import api, { apiError } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import { LoadingState, ErrorState } from '../../components/ui/Feedback';
import { Submit } from './parts';

/**
 * The original hospital-level key/value store, kept so the Administration
 * module's "configuration parameters" tiles still have somewhere to land.
 *
 * Values arrive as mixed types from a flat collection, so each one is edited
 * through its native input rather than being stringified on save.
 */
const GROUPS = ['general', 'billing', 'tax', 'pharmacy', 'lab', 'radiology', 'notifications', 'numbering', 'print'];

const typed = (value) => {
  if (typeof value === 'boolean') return { kind: 'boolean', text: String(value) };
  if (typeof value === 'number') return { kind: 'number', text: String(value) };
  if (typeof value === 'object' && value !== null) return { kind: 'json', text: JSON.stringify(value) };
  return { kind: 'text', text: value == null ? '' : String(value) };
};

const untyped = (kind, text) => {
  const t = String(text ?? '').trim();
  if (kind === 'boolean') return t === 'true';
  if (kind === 'number') return t === '' ? 0 : Number(t);
  if (kind === 'json') {
    if (t === '') return null;
    try { return JSON.parse(t); } catch { throw new Error('That is not valid JSON'); }
  }
  return t;
};

export default function GeneralSettings() {
  const qc = useQueryClient();
  const [group, setGroup] = useState('general');
  const [draft, setDraft] = useState({});

  const { data, isLoading, error } = useQuery({
    queryKey: ['settings', group],
    queryFn: async () => (await api.get('/settings', { params: { group } })).data.data,
  });

  useEffect(() => {
    if (!data) return;
    setDraft(Object.fromEntries(data.map((row) => [row.key, typed(row.value)])));
  }, [data]);

  const save = useMutation({
    mutationFn: async (v) => (await api.put('/settings', { group, entries: v })).data.data,
    onSuccess: () => { toast.success(`${group} settings saved`); qc.invalidateQueries({ queryKey: ['settings'] }); },
    onError: (e) => toast.error(apiError(e)),
  });

  const doSave = () => {
    let entries;
    try {
      entries = Object.fromEntries(
        Object.entries(draft).map(([k, v]) => [k, untyped(v.kind, v.text)]),
      );
    } catch (e) {
      return toast.error(`${e.message} - fix the JSON value before saving`);
    }
    save.mutate(entries);
  };

  const rows = data || [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Configuration parameters"
        subtitle="Free-form settings grouped by area. Anything stored here is readable by the modules that need it."
      />

      <div className="card overflow-hidden">
        <div className="flex flex-wrap gap-1 border-b border-ink-100 p-2">
          {GROUPS.map((g) => (
            <button
              key={g}
              className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium capitalize transition ${
                group === g ? 'bg-brand-600 text-white' : 'text-ink-600 hover:bg-ink-50'
              }`}
              onClick={() => setGroup(g)}
            >
              {g}
            </button>
          ))}
        </div>

        <div className="p-4">
          {isLoading ? <LoadingState /> : error ? <ErrorState message={apiError(error)} /> : !rows.length ? (
            <div className="py-8 text-center">
              <SlidersHorizontal className="mx-auto mb-2 h-6 w-6 text-ink-300" />
              <p className="text-xs text-ink-500">Nothing stored in <span className="font-semibold">{group}</span> yet.</p>
              <p className="mt-1 text-[11px] text-ink-400">
                Keys are created by saving them from a module that reads them, so there is nothing free to type here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map((row) => {
                const field = draft[row.key] || { kind: 'text', text: '' };
                return (
                  <div key={row.key} className="grid grid-cols-1 items-start gap-2 sm:grid-cols-[180px_1fr]">
                    <div>
                      <div className="text-xs font-medium text-ink-900">{row.key}</div>
                      {row.description && <div className="text-[10px] text-ink-400">{row.description}</div>}
                    </div>
                    <div className="flex gap-2">
                      <select
                        className="select w-28 shrink-0"
                        value={field.kind}
                        onChange={(e) => setDraft((p) => ({ ...p, [row.key]: { kind: e.target.value, text: field.text } }))}
                      >
                        <option value="text">Text</option>
                        <option value="number">Number</option>
                        <option value="boolean">Yes / no</option>
                        <option value="json">JSON</option>
                      </select>
                      {field.kind === 'boolean' ? (
                        <select
                          className="select"
                          value={field.text}
                          onChange={(e) => setDraft((p) => ({ ...p, [row.key]: { kind: field.kind, text: e.target.value } }))}
                        >
                          <option value="true">true</option>
                          <option value="false">false</option>
                        </select>
                      ) : (
                        <input
                          className={`input ${field.kind === 'json' ? 'font-mono text-xs' : ''}`}
                          value={field.text}
                          onChange={(e) => setDraft((p) => ({ ...p, [row.key]: { ...field, text: e.target.value } }))}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="flex justify-end pt-2">
                <Submit pending={save.isPending} onClick={doSave}><Save className="h-4 w-4" /> Save {group}</Submit>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}