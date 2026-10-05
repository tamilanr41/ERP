import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Building2, ImageOff, Save, Upload, Trash2 } from 'lucide-react';
import api, { apiError } from '../../lib/api';
import { LoadingState, ErrorState } from '../../components/ui/Feedback';
import { Field, Submit, ConfirmDialog, IconButton } from './parts';

const BLANK = {
  name: '', email: '', phone: '', website: '',
  gstNumber: '', panNumber: '', registrationNumber: '', nabhAccreditation: '', emergencyContact: '',
  address: { line1: '', line2: '', city: '', state: '', pincode: '', country: 'India' },
  tax: { currency: 'INR', currencySymbol: '₹', defaultGstPct: 0 },
};

/**
 * Folds the stored hospital document into a flat form shape, defaulting every
 * nested group so the inputs are controlled instead of undefined-on-first-render.
 */
const toForm = (h) => ({
  ...BLANK,
  ...h,
  address: { ...BLANK.address, ...(h?.address || {}) },
  tax: { ...BLANK.tax, ...(h?.tax || {}) },
});

export default function HospitalSettings() {
  const qc = useQueryClient();
  const [form, setForm] = useState(BLANK);
  const [code, setCode] = useState('');
  const [logo, setLogo] = useState('');
  const [confirmRemoveLogo, setConfirmRemoveLogo] = useState(false);
  const fileRef = useRef(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['masters-hospital'],
    queryFn: async () => (await api.get('/masters/hospital')).data.data,
  });

  useEffect(() => {
    if (data) {
      setForm(toForm(data));
      setCode(data?.code || '');
      setLogo(data?.logo || '');
    }
  }, [data]);

  const save = useMutation({
    mutationFn: async (v) => (await api.put('/masters/hospital', v)).data.data,
    onSuccess: () => { toast.success('Hospital profile saved'); qc.invalidateQueries({ queryKey: ['masters-hospital'] }); },
    onError: (e) => toast.error(apiError(e)),
  });

  const uploadLogo = useMutation({
    mutationFn: async (file) => {
      const fd = new FormData();
      fd.append('file', file);
      return (await api.post('/masters/hospital/logo?dir=hospital', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })).data.data;
    },
    onSuccess: (h) => {
      toast.success('Logo uploaded');
      setLogo(h?.logo || '');
      qc.invalidateQueries({ queryKey: ['masters-hospital'] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const removeLogo = useMutation({
    mutationFn: async () => (await api.delete('/masters/hospital/logo')).data.data,
    onSuccess: () => {
      toast.success('Logo removed');
      setConfirmRemoveLogo(false);
      qc.invalidateQueries({ queryKey: ['masters-hospital'] });
    },
    onError: (e) => { setConfirmRemoveLogo(false); toast.error(apiError(e)); },
  });

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const setIn = (group, k) => (e) => setForm((p) => ({ ...p, [group]: { ...p[group], [k]: e.target.value } }));

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={apiError(error)} />;

  const pickFile = (e) => {
    const file = e.target.files?.[0];
    // Clearing the input lets the same file be re-selected after a failure.
    e.target.value = '';
    if (!file) return;
    if (!/^image\//.test(file.type)) return toast.error('The logo must be an image file');
    uploadLogo.mutate(file);
  };

  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Hospital name is required');
    save.mutate(form);
  };

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-brand-600" />
          <h2 className="text-sm font-bold text-ink-900">Identity &amp; contact</h2>
        </div>
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Hospital name" required>
              <input className="input" value={form.name} onChange={set('name')} />
            </Field>
            <Field label="Hospital code" hint="Used for every number prefix. Set once, not editable here.">
              <input className="input" value={code} disabled />
            </Field>
            <Field label="Email"><input className="input" type="email" value={form.email} onChange={set('email')} /></Field>
            <Field label="Phone"><input className="input" value={form.phone} onChange={set('phone')} /></Field>
            <Field label="Website"><input className="input" value={form.website} onChange={set('website')} /></Field>
            <Field label="Emergency contact"><input className="input" value={form.emergencyContact} onChange={set('emergencyContact')} /></Field>
            <Field label="GST number"><input className="input" value={form.gstNumber} onChange={set('gstNumber')} /></Field>
            <Field label="PAN number"><input className="input" value={form.panNumber} onChange={set('panNumber')} /></Field>
            <Field label="Hospital registration no."><input className="input" value={form.registrationNumber} onChange={set('registrationNumber')} /></Field>
            <Field label="NABH accreditation"><input className="input" value={form.nabhAccreditation} onChange={set('nabhAccreditation')} /></Field>
          </div>

          <div className="divider" />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Address line 1"><input className="input" value={form.address.line1} onChange={setIn('address', 'line1')} /></Field>
            <Field label="Address line 2"><input className="input" value={form.address.line2} onChange={setIn('address', 'line2')} /></Field>
            <Field label="City"><input className="input" value={form.address.city} onChange={setIn('address', 'city')} /></Field>
            <Field label="State"><input className="input" value={form.address.state} onChange={setIn('address', 'state')} /></Field>
            <Field label="Pincode"><input className="input" value={form.address.pincode} onChange={setIn('address', 'pincode')} /></Field>
            <Field label="Country"><input className="input" value={form.address.country} onChange={setIn('address', 'country')} /></Field>
          </div>

          <div className="divider" />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Currency code"><input className="input" value={form.tax.currency} onChange={setIn('tax', 'currency')} /></Field>
            <Field label="Currency symbol"><input className="input" value={form.tax.currencySymbol} onChange={setIn('tax', 'currencySymbol')} /></Field>
            <Field label="Default GST %"><input className="input" type="number" min="0" step="0.01" value={form.tax.defaultGstPct} onChange={setIn('tax', 'defaultGstPct')} /></Field>
          </div>

          <div className="flex justify-end pt-1">
            <Submit pending={save.isPending} disabled={!form.name.trim()}>
              <Save className="h-4 w-4" /> Save hospital profile
            </Submit>
          </div>
        </form>
      </section>

      <section className="card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Upload className="h-4 w-4 text-brand-600" />
          <h2 className="text-sm font-bold text-ink-900">Hospital logo</h2>
        </div>
        <p className="mb-3 text-[11px] leading-relaxed text-ink-500">
          Printed on prescriptions, bills and lab reports whenever &ldquo;show hospital header&rdquo; is enabled.
          PNG or JPEG works best; keep it square and under 1&nbsp;MB so it stays crisp on A4.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          {logo ? (
            <img src={logo} alt="Hospital logo" className="h-20 w-20 rounded-xl border border-ink-200 bg-white object-contain p-1" />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-xl border border-dashed border-ink-300 text-ink-300">
              <ImageOff className="h-6 w-6" />
            </div>
          )}
          <div className="flex gap-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickFile} />
            <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()} disabled={uploadLogo.isPending}>
              {uploadLogo.isPending ? 'Uploading…' : logo ? 'Replace logo' : 'Upload logo'}
            </button>
            {logo && (
              <IconButton label="Remove logo" icon={Trash2} tone="danger" onClick={() => setConfirmRemoveLogo(true)} />
            )}
          </div>
        </div>
      </section>

      {confirmRemoveLogo && (
        <ConfirmDialog
          title="Remove the hospital logo?"
          icon={ImageOff}
          body="Reports and prescriptions will fall back to the text header."
          confirmLabel="Remove logo"
          pending={removeLogo.isPending}
          onCancel={() => setConfirmRemoveLogo(false)}
          onConfirm={() => removeLogo.mutate()}
        />
      )}
    </div>
  );
}