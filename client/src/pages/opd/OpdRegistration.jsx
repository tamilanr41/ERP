import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
AlertTriangle, UserPlus, UserCheck, Search, ArrowRight, CalendarDays, Eye, PartyPopper,
Printer, Stethoscope, HeartPulse, User, Camera,
} from 'lucide-react';
import api, { apiError } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import { Spinner, LoadingState, EmptyState } from '../../components/ui/Feedback';
import { useAuth } from '../../context/AuthContext';
import PatientCard from '../../components/ui/PatientCard';

const splitList = (v) => (v || '').split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);

const EMPTY = {
  firstName: '',
  middleName: '',
  lastName: '',
  photo: '',
  gender: 'MALE',
  dateOfBirth: '',
  ageManual: '',
  bloodGroup: 'UNKNOWN',
  mobile: '',
  alternatePhone: '',
  email: '',
  address: { line1: '', area: '', city: '', district: '', state: '', country: 'India', pincode: '' },
  idProof: { type: 'AADHAAR', number: '' },
  abhaId: '',
  emergencyContact: { name: '', relation: '', phone: '' },
  allergies: '',
  medicalHistory: '',
  currentMedications: '',
  specialAlerts: '',
};

function Field({ label, required, children, className, hint }) {
  return (
    <div className={className}>
      <label className="label">{label}{required && ' *'}</label>
      {children}
      {hint && <p className="mt-0.5 text-[10px] text-ink-400">{hint}</p>}
    </div>
  );
}

export default function OpdRegistration() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { hasPermission, user } = useAuth();
  const canCreate = hasPermission('PATIENT_CREATE') || user?.roleCode === 'SUPER_ADMIN';

  const [sQ, setSQ] = useState('');
  const [searched, setSearched] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [dupesOpen, setDupesOpen] = useState(false);
  const [saved, setSaved] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setAddr = (k) => (e) => setForm((f) => ({ ...f, address: { ...f.address, [k]: e.target.value } }));
  const setEmg = (k) => (e) => setForm((f) => ({ ...f, emergencyContact: { ...f.emergencyContact, [k]: e.target.value } }));
  const setId = (k) => (e) => setForm((f) => ({ ...f, idProof: { ...f.idProof, [k]: e.target.value } }));
  const onPhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, photo: reader.result }));
    reader.readAsDataURL(file);
  };

  const preset = (first, middle, last) =>
    setForm((f) => ({ ...f, firstName: first, middleName: middle || f.middleName, lastName: last || f.lastName }));

  const search = useQuery({
    queryKey: ['opd-dupe-search', searched],
    queryFn: async ({ queryKey }) => (await api.get('/patients', { params: { search: queryKey[1], limit: 6 } })).data,
    enabled: searched.length >= 2,
  });

  const mobileMatches = useQuery({
    queryKey: ['opd-mobile-search', form.mobile],
    queryFn: async ({ queryKey }) => (await api.get('/patients', { params: { search: queryKey[1], limit: 5 } })).data,
    enabled: formOpen && form.mobile.length >= 10,
  });

  const dupes = useMemo(() => {
    const set = new Map();
    for (const p of [...(search.data?.data || []), ...(mobileMatches.data?.data || [])]) {
      if (!set.has(p._id)) set.set(p._id, p);
    }
    return Array.from(set.values());
  }, [search.data, mobileMatches.data]);

  const computedAge = useMemo(() => {
    if (!form.dateOfBirth) return '';
    const dob = new Date(form.dateOfBirth);
    if (Number.isNaN(dob.getTime())) return '';
    const now = new Date();
    let years = now.getFullYear() - dob.getFullYear();
    const m = now.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) years -= 1;
    return String(Math.max(years, 0));
  }, [form.dateOfBirth]);

  useEffect(() => {
    if (form.dateOfBirth) setForm((f) => ({ ...f, ageManual: computedAge }));
  }, [computedAge, form.dateOfBirth]);

  const register = useMutation({
    mutationFn: async (payload) => (await api.post('/patients', payload)).data.data,
    onSuccess: (p) => {
      toast.success('Patient Registered Successfully');
      qc.invalidateQueries({ queryKey: ['patients'] });
      qc.invalidateQueries({ queryKey: ['opd-patient-search'] });
      setSaved(p);
      setFormOpen(false);
      setForm(EMPTY);
      setDupesOpen(false);
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const submit = () => {
    if (!form.firstName.trim()) return toast.error('First name is required');
    if (!/^[0-9]{10,15}$/.test(form.mobile.trim())) return toast.error('Valid 10–15 digit mobile number required');
    const clean = (v) => (v === '' ? undefined : v.trim());
    register.mutate({
      firstName: form.firstName.trim(),
      middleName: clean(form.middleName),
      lastName: clean(form.lastName),
      gender: form.gender,
      mobile: form.mobile.trim(),
      alternatePhone: clean(form.alternatePhone),
      email: clean(form.email),
      dateOfBirth: clean(form.dateOfBirth),
      age: form.dateOfBirth ? undefined : form.ageManual ? { years: parseInt(form.ageManual, 10) || undefined } : undefined,
      bloodGroup: form.bloodGroup === 'UNKNOWN' ? undefined : form.bloodGroup,
      occupation: undefined,
      maritalStatus: undefined,
      address: {
        line1: clean(form.address.line1),
        area: clean(form.address.area),
        city: clean(form.address.city),
        district: clean(form.address.district),
        state: clean(form.address.state),
        country: clean(form.address.country) || 'India',
        pincode: clean(form.address.pincode),
      },
      idProof: form.idProof.number.trim() ? { type: form.idProof.type, number: form.idProof.number.trim() } : undefined,
      abhaId: clean(form.abhaId),
      emergencyContact: form.emergencyContact.name.trim()
        ? {
            name: form.emergencyContact.name.trim(),
            relation: clean(form.emergencyContact.relation),
            phone: clean(form.emergencyContact.phone),
          }
        : undefined,
      allergies: splitList(form.allergies),
      medicalHistory: splitList(form.medicalHistory),
      currentMedications: splitList(form.currentMedications),
      specialAlerts: splitList(form.specialAlerts),
      photo: form.photo || undefined,
    });
  };

  return (
    <div className="p-6">
      <PageHeader
        title="New Patient Registration"
        subtitle="Search first — the system surfaces possible existing patients before a new registration is created"
        actions={
          <button className="btn-primary" onClick={() => navigate('/opd/search')}>
            <Search className="h-4 w-4" /> Patient Search
          </button>
        }
      />

      {saved && (
        <div className="mb-4 overflow-hidden rounded-2xl border border-mint-200 bg-gradient-to-br from-mint-50 to-white">
          <div className="flex items-start gap-3 border-b border-mint-100 bg-mint-100/60 px-4 py-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-mint-600 text-white">
              <PartyPopper className="h-5 w-5" />
            </span>
            <div>
              <div className="text-base font-bold text-ink-900">Patient Registered Successfully</div>
              <div className="mt-0.5 text-xs text-ink-500">
                UHID <b className="font-mono text-brand-700">{saved.uhid}</b> generated for{' '}
                {saved.firstName} {saved.middleName || ''} {saved.lastName || ''} · {saved.mobile}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 px-4 py-3">
            <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => navigate('/opd/walkin')}>
              <Stethoscope className="h-3.5 w-3.5" /> Create OP Visit
            </button>
            <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => navigate('/opd/appointments')}>
              <CalendarDays className="h-3.5 w-3.5" /> Book Appointment
            </button>
            <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5" /> Print Patient Card
            </button>
            <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => navigate(`/patients/${saved._id}`)}>
              <Eye className="h-3.5 w-3.5" /> View Patient 360
            </button>
          </div>
        </div>
      )}

      <div className="card p-4">
        <div className="flex items-center gap-2 text-base font-bold text-ink-900">
          <Search className="h-5 w-5 text-brand-600" /> Step 1 — Search for an existing patient
        </div>
        <p className="mt-1 text-xs text-ink-500">Search by UHID (ZMC-…), name, mobile number or OP number. If the patient exists, select them instead of registering again.</p>
        <div className="mt-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
            <input
              className="input !pl-9"
              placeholder="UHID / name / mobile / OP number…"
              value={sQ}
              onChange={(e) => {
                setSQ(e.target.value);
                clearTimeout(window.__opd2);
                window.__opd2 = setTimeout(() => setSearched(e.target.value.trim()), 400);
              }}
            />
          </div>
          <button className="btn-primary whitespace-nowrap" onClick={() => setFormOpen(true)}>
            <UserPlus className="h-4 w-4" /> Register New Patient
          </button>
        </div>

        {searched.length >= 2 && search.isLoading && <LoadingState label="Checking…" />}
        {searched.length >= 2 && !search.isLoading && dupes.length > 0 && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-700">
              <AlertTriangle className="h-4 w-4" /> Possible existing patient found
            </div>
            <ul className="mt-2 divide-y divide-amber-100">
              {dupes.map((p) => (
                <li key={p._id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <div className="text-[13px] font-semibold text-ink-900">
                      {p.firstName} {p.middleName || ''} {p.lastName || ''}
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] text-amber-700">{p.uhid}</span>
                    </div>
                    <div className="text-xs text-ink-500">{p.gender} · {p.age?.years ?? '—'}y · {p.mobile || '—'}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn-secondary px-2.5 py-1 text-xs"
                      onClick={() => { preset(p.firstName, p.middleName, p.lastName); setDupesOpen(true); }}
                    >
                      <UserCheck className="h-3.5 w-3.5" /> Use existing
                    </button>
                    <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => navigate(`/patients/${p._id}`)}>
                      View
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        {searched.length >= 2 && !search.isLoading && dupes.length === 0 && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-mint-200 bg-mint-50 px-4 py-2.5 text-xs font-medium text-mint-700">
            <UserCheck className="h-4 w-4" /> No matching patient — you can register this patient as new.
          </div>
        )}
      </div>

      {formOpen && (
        <div className="card mt-4 p-4">
          <div className="flex items-center gap-2 text-base font-bold text-ink-900">
            <UserPlus className="h-5 w-5 text-brand-600" /> Step 2 — New patient registration
          </div>
          <p className="mt-1 text-xs text-ink-500">
            A unique UHID (ZMC-xxxxxxx) is generated automatically. Mobile and ID proof must be unique across the system.
          </p>

          {dupesOpen && dupes.length > 0 && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-700">
                <AlertTriangle className="h-4 w-4" /> Possible existing patient found
              </div>
              <p className="mt-1 text-[11px] text-amber-700/80">
                Click "Use existing" next to the matching record to avoid a duplicate registration, or continue below to register anyway.
              </p>
            </div>
          )}

          <div className="mt-1 space-y-5">
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 border-b border-ink-100 pb-1.5 text-xs font-bold uppercase tracking-wider text-brand-700">
                <User className="h-3.5 w-3.5" /> Personal Details
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="First Name" required><input className="input" value={form.firstName} onChange={set('firstName')} /></Field>
                <Field label="Middle Name"><input className="input" value={form.middleName} onChange={set('middleName')} /></Field>
                <Field label="Last Name"><input className="input" value={form.lastName} onChange={set('lastName')} /></Field>
                <Field label="Gender"><select className="select" value={form.gender} onChange={set('gender')}>
                  {['MALE', 'FEMALE', 'OTHER'].map((g) => <option key={g}>{g}</option>)}
                </select></Field>
                <Field label="DOB">
                  <input type="date" className="input" value={form.dateOfBirth} onChange={set('dateOfBirth')} />
                </Field>
                <Field label="Age (years)" hint={computedAge ? 'auto-filled from DOB' : 'used when DOB unknown'}>
                  <input inputMode="numeric" className="input" value={form.ageManual} onChange={set('ageManual')} placeholder="e.g. 34" />
                </Field>
                <Field label="Blood Group"><select className="select" value={form.bloodGroup} onChange={set('bloodGroup')}>
                  {['UNKNOWN', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((b) => <option key={b}>{b}</option>)}
                </select></Field>
                <Field label="Mobile" required><input className="input" value={form.mobile} onChange={set('mobile')} placeholder="10–15 digits" inputMode="numeric" /></Field>
                <Field label="Alternate Mobile"><input className="input" value={form.alternatePhone} onChange={set('alternatePhone')} inputMode="numeric" /></Field>
                <Field label="Email"><input type="email" className="input" value={form.email} onChange={set('email')} placeholder="optional" /></Field>
              </div>
            </section>

            <section>
              <h3 className="mb-2 border-b border-ink-100 pb-1.5 text-xs font-bold uppercase tracking-wider text-brand-700">Address</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Door / Street"><input className="input" value={form.address.line1} onChange={setAddr('line1')} /></Field>
                <Field label="Area"><input className="input" value={form.address.area} onChange={setAddr('area')} /></Field>
                <Field label="City"><input className="input" value={form.address.city} onChange={setAddr('city')} /></Field>
                <Field label="District"><input className="input" value={form.address.district} onChange={setAddr('district')} /></Field>
                <Field label="State"><input className="input" value={form.address.state} onChange={setAddr('state')} /></Field>
                <Field label="Country"><input className="input" value={form.address.country} onChange={setAddr('country')} /></Field>
                <Field label="Pincode"><input className="input" value={form.address.pincode} onChange={setAddr('pincode')} inputMode="numeric" /></Field>
              </div>
            </section>

            <section>
              <h3 className="mb-2 flex items-center gap-1.5 border-b border-brand-100 pb-1.5 text-xs font-bold uppercase tracking-wider text-brand-700">
                <User className="h-3.5 w-3.5" /> Patient Photo
              </h3>
              <div className="flex items-center gap-4">
                {form.photo ? (
                  <img src={form.photo} alt="Patient photo preview" className="h-20 w-20 rounded-full object-cover ring-2 ring-brand-200" />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-dashed border-ink-300 text-ink-500">
                    <Camera className="h-7 w-7" />
                  </div>
                )}
                <div className="flex-1">
                  <label className="label">Photo</label>
                  <input
                    type="file"
                    accept="image/*"
                    className="block w-full text-sm text-ink-500 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
                    onChange={onPhotoChange}
                  />
                  <input type="hidden" value={form.photo} readOnly />
                  <p className="mt-1 text-xs text-ink-500">JPG / PNG up to 2MB — shown on patient card and detail page</p>
                </div>
              </div>
            </section>

            <section>
              <h3 className="mb-2 border-b border-ink-100 pb-1.5 text-xs font-bold uppercase tracking-wider text-brand-700">Identification</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="ID Type"><select className="select" value={form.idProof.type} onChange={setId('type')}>
                  {['AADHAAR', 'PAN', 'PASSPORT', 'DRIVING_LICENSE', 'VOTER_ID', 'OTHER'].map((t) => <option key={t}>{t}</option>)}
                </select></Field>
                <Field label="ID Number"><input className="input" value={form.idProof.number} onChange={setId('number')} /></Field>
                <Field label="ABHA ID" hint="Ayushman Bharat Health Account"><input className="input" value={form.abhaId} onChange={set('abhaId')} placeholder="e.g. 91-XXXX-XXXX-XXXX" /></Field>
              </div>
            </section>

            <section>
              <h3 className="mb-2 border-b border-ink-100 pb-1.5 text-xs font-bold uppercase tracking-wider text-brand-700">Emergency Contact</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Name"><input className="input" value={form.emergencyContact.name} onChange={setEmg('name')} /></Field>
                <Field label="Relationship"><input className="input" value={form.emergencyContact.relation} onChange={setEmg('relation')} placeholder="e.g. Spouse" /></Field>
                <Field label="Mobile"><input className="input" value={form.emergencyContact.phone} onChange={setEmg('phone')} inputMode="numeric" /></Field>
              </div>
            </section>

            <section>
              <h3 className="mb-2 flex items-center gap-1.5 border-b border-ink-100 pb-1.5 text-xs font-bold uppercase tracking-wider text-brand-700">
                <HeartPulse className="h-3.5 w-3.5" /> Medical
              </h3>
              <p className="mb-2 text-[11px] text-ink-500">Enter values separated by commas or line breaks.</p>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <Field label="Allergies"><textarea className="input min-h-[72px]" value={form.allergies} onChange={set('allergies')} placeholder="e.g. Penicillin, Peanuts" /></Field>
                <Field label="Existing Conditions"><textarea className="input min-h-[72px]" value={form.medicalHistory} onChange={set('medicalHistory')} placeholder="e.g. Hypertension, Diabetes" /></Field>
                <Field label="Current Medication"><textarea className="input min-h-[72px]" value={form.currentMedications} onChange={set('currentMedications')} placeholder="e.g. Metformin 500mg BD" /></Field>
                <Field label="Special Alerts"><textarea className="input min-h-[72px]" value={form.specialAlerts} onChange={set('specialAlerts')} placeholder="e.g. Pacemaker, Fall risk" /></Field>
              </div>
            </section>
          </div>

          {form.mobile.length >= 10 && mobileMatches.data?.data?.length > 0 && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="text-xs font-bold text-amber-700">Possible existing patient found</div>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {mobileMatches.data.data.map((p) => (
                  <button
                    key={p._id}
                    onClick={() => { preset(p.firstName, p.middleName, p.lastName); setForm((f) => ({ ...f, mobile: p.mobile })); setDupesOpen(true); }}
                    className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-left text-xs transition hover:border-amber-400"
                  >
                    <span className="font-semibold text-ink-900">{p.firstName} {p.lastName || ''}</span>
                    <span className="ml-1.5 font-mono text-[10px] text-amber-700">{p.uhid}</span>
                    <div className="text-ink-500">{p.gender} · {p.age?.years ?? '—'}y</div>
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-amber-700/80">Duplicate mobile will be rejected by the server. Select the existing patient or use a different number.</p>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-ink-100 pt-3">
            <button className="btn-secondary" onClick={() => setFormOpen(false)}>Cancel</button>
            {!canCreate && <span className="text-xs text-ink-400">You need PATIENT_CREATE permission to register patients.</span>}
            <button className="btn-primary" disabled={!canCreate || register.isPending} onClick={submit}>
              {register.isPending ? <Spinner className="h-4 w-4 text-white" /> : <><UserPlus className="h-4 w-4" /> Register Patient</>}
            </button>
          </div>
        </div>
      )}

      {saved && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-mint-200 bg-gradient-to-br from-mint-50 to-white">
          <div className="flex justify-center px-4 py-4 print:hidden">
            <PatientCard patient={saved} />
          </div>
        </div>
      )}

      {!formOpen && !saved && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-ink-100 bg-ink-50 px-4 py-3 text-xs text-ink-500">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          Registration is search-first: existing patients are shown before a new record is created, preventing duplicates.
          A unique UHID (ZMC-xxxxxxx) is generated on every new registration.
        </div>
      )}
    </div>
  );
}