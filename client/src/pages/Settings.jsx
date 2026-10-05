import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { apiError } from '../lib/api';
import PageHeader from '../components/ui/PageHeader';
import { LoadingState, ErrorState, Spinner } from '../components/ui/Feedback';

export default function Settings() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', code: '', email: '', phone: '', address: { city: '', state: '' } });

  const { data, isLoading, error } = useQuery({
    queryKey: ['masters-hospital'],
    queryFn: async () => (await api.get('/masters/hospital')).data.data,
  });

  useEffect(() => {
    if (data) {
      setForm({
        name: data.name || '',
        code: data.code || '',
        email: data.email || '',
        phone: data.phone || '',
        address: { ...(data.address || {}), city: data.address?.city || '', state: data.address?.state || '' },
      });
    }
  }, [data]);

  const save = useMutation({
    mutationFn: async (v) => (await api.put('/masters/hospital', v)).data.data,
    onSuccess: () => { toast.success('Hospital settings saved'); qc.invalidateQueries({ queryKey: ['masters-hospital'] }); },
    onError: (e) => toast.error(apiError(e)),
  });

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={apiError(error)} />;

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="p-6">
      <PageHeader title="Settings" subtitle="Hospital information and preferences" />
      <div className="card max-w-2xl space-y-4 p-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className="label">Hospital Name *</label><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
          <div><label className="label">Code</label><input className="input" value={form.code} disabled /></div>
          <div><label className="label">Email</label><input className="input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
          <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
          <div><label className="label">City</label><input className="input" value={form.address.city} onChange={(e) => setForm((p) => ({ ...p, address: { ...p.address, city: e.target.value } }))} /></div>
          <div><label className="label">State</label><input className="input" value={form.address.state} onChange={(e) => setForm((p) => ({ ...p, address: { ...p.address, state: e.target.value } }))} /></div>
        </div>
        <p className="text-xs text-ink-400">
          Code is used for number prefixes and is not editable. Additional modules (pharmacy settings, lab config, SMTP) can be added to this screen.
        </p>
        <div className="flex justify-end">
          <button className="btn-primary" disabled={save.isPending || !form.name} onClick={() => save.mutate(form)}>
            {save.isPending ? <Spinner className="h-4 w-4 text-white" /> : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}