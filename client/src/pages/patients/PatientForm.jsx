import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Save, Camera } from 'lucide-react';
import api, { apiError } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import { LoadingState, ErrorState } from '../../components/ui/Feedback';
import { formatDate } from '../../lib/utils';
import { Spinner } from '../../components/ui/Feedback';

const schema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  mobile: z.string().regex(/^[0-9]{10,15}$/, 'Valid mobile required'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  photo: z.string().optional(),
  dateOfBirth: z.string().optional(),
  maritalStatus: z.enum(['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'OTHER']).optional(),
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'UNKNOWN']).optional(),
  occupation: z.string().optional(),
  alternatePhone: z.string().regex(/^[0-9]{10,15}$/, 'Valid alternate mobile required').optional().or(z.literal('')),
  emergencyContact: z.object({
    name: z.string().optional(),
    relation: z.string().optional(),
    phone: z.string().regex(/^[0-9]{10,15}$/, 'Valid emergency mobile required').optional().or(z.literal('')),
  }).optional(),
  allergies: z.array(z.string()).optional(),
  medicalHistory: z.array(z.string()).optional(),
  surgicalHistory: z.array(z.string()).optional(),
  familyHistory: z.array(z.string()).optional(),
  currentMedications: z.array(z.string()).optional(),
  address: z.object({
    line1: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    pincode: z.string().optional(),
  }).optional(),
  idProof: z.object({
    type: z.enum(['AADHAAR', 'PAN', 'PASSPORT', 'DRIVING_LICENSE', 'VOTER_ID', 'OTHER']).optional(),
    number: z.string().optional(),
  }).optional(),
});

const defaultValues = {
  firstName: '',
  lastName: '',
  gender: 'MALE',
  mobile: '',
  email: '',
  dateOfBirth: '',
  photo: '',
  bloodGroup: 'UNKNOWN',
  maritalStatus: 'SINGLE',
  address: { line1: '', city: '', state: '', pincode: '' },
  idProof: { type: 'AADHAAR', number: '' },
};

const fmt = (v) => (v ? new Date(v).toISOString().slice(0, 10) : '');

export default function PatientForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: patient, isLoading, error } = useQuery({
    queryKey: ['patient', id],
    queryFn: async () => {
      const res = await api.get(`/patients/${id}`);
      return res.data.data;
    },
    enabled: isEdit,
  });

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues,
  });

  useEffect(() => {
    if (patient) {
      reset({
        firstName: patient.firstName,
        lastName: patient.lastName || '',
        gender: patient.gender,
        mobile: patient.mobile,
        email: patient.email || '',
        photo: patient.photo || '',
        dateOfBirth: fmt(patient.dateOfBirth),
        bloodGroup: patient.bloodGroup || 'UNKNOWN',
        maritalStatus: patient.maritalStatus || 'SINGLE',
        address: { ...defaultValues.address, ...(patient.address || {}) },
        idProof: patient.idProof?.number ? { ...defaultValues.idProof, ...patient.idProof } : defaultValues.idProof,
      });
    }
  }, [patient, reset]);

  const [preview, setPreview] = useState('');
  const onPhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPreview(reader.result);
      setValue('photo', reader.result);
    };
    reader.readAsDataURL(file);
  };

  const mutation = useMutation({
    mutationFn: async (values) => {
      if (isEdit) {
        const res = await api.put(`/patients/${id}`, values);
        return res.data.data;
      }
      const res = await api.post('/patients', values);
      return res.data.data;
    },
    onSuccess: (saved) => {
      toast.success(isEdit ? 'Patient updated' : 'Patient registered');
      qc.invalidateQueries({ queryKey: ['patients'] });
      navigate(`/patients/${saved._id}`);
    },
    onError: (err) => toast.error(apiError(err)),
  });

  const onSubmit = (values) => {
    const clean = (v) => (v === '' ? undefined : v);
    const payload = {
      ...values,
      email: clean(values.email),
      dateOfBirth: clean(values.dateOfBirth),
      address: values.address
        ? {
            line1: clean(values.address.line1),
            city: clean(values.address.city),
            state: clean(values.address.state),
            pincode: clean(values.address.pincode),
          }
        : undefined,
      idProof: values.idProof?.number
        ? { type: values.idProof.type, number: clean(values.idProof.number) }
        : undefined,
    };
    mutation.mutate(payload);
  };

  if (isEdit && isLoading) return <LoadingState />;
  if (isEdit && error) return <ErrorState message={apiError(error)} />;

  return (
    <div className="p-6">
      <PageHeader
        title={isEdit ? `Patient · ${patient?.uhid}` : 'Register Patient'}
        subtitle={isEdit && patient ? `${patient.firstName} ${patient.lastName || ''} · Registered ${formatDate(patient.registrationDate)}` : 'Create a new patient record'}
        actions={
          <button className="btn-secondary" onClick={() => navigate('/patients')}>
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
        }
      />

      <form onSubmit={handleSubmit(onSubmit)} className="card max-w-3xl space-y-5 p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">First Name *</label>
            <input className="input" {...register('firstName')} />
            {errors.firstName && <p className="mt-1 text-xs text-red-600">{errors.firstName.message}</p>}
          </div>
          <div>
            <label className="label">Last Name</label>
            <input className="input" {...register('lastName')} />
          </div>
          <div>
            <label className="label">Gender *</label>
            <select className="input" {...register('gender')}>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div>
            <label className="label">Mobile *</label>
            <input className="input" {...register('mobile')} placeholder="10-15 digits" />
            {errors.mobile && <p className="mt-1 text-xs text-red-600">{errors.mobile.message}</p>}
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" {...register('email')} />
          </div>
          <div>
            <label className="label">Date of Birth</label>
            <input className="input" type="date" {...register('dateOfBirth')} />
          </div>
          <div>
            <label className="label">Blood Group</label>
            <select className="input" {...register('bloodGroup')}>
              {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'UNKNOWN'].map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Marital Status</label>
            <select className="input" {...register('maritalStatus')}>
              {['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'OTHER'].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded-xl border border-ink-200 bg-ink-50/50 p-4">
          <h3 className="mb-2 text-sm font-semibold text-ink-700">Patient Photo</h3>
          <div className="flex items-center gap-4">
            {preview ? (
              <img src={preview} alt="Patient photo preview" className="h-20 w-20 rounded-full object-cover ring-2 ring-brand-200" />
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
              <input type="hidden" {...register('photo')} />
              <p className="mt-1 text-xs text-ink-500">JPG / PNG up to 2MB — shown on patient card and detail page</p>
            </div>
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink-700">Address</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Address</label>
              <input className="input" {...register('address.line1')} />
            </div>
            <div>
              <label className="label">City</label>
              <input className="input" {...register('address.city')} />
            </div>
            <div>
              <label className="label">State</label>
              <input className="input" {...register('address.state')} />
            </div>
            <div>
              <label className="label">Pincode</label>
              <input className="input" {...register('address.pincode')} />
            </div>
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink-700">ID Proof</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Type</label>
              <select className="input" {...register('idProof.type')}>
                {['AADHAAR', 'PAN', 'PASSPORT', 'DRIVING_LICENSE', 'VOTER_ID', 'OTHER'].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Number</label>
              <input className="input" {...register('idProof.number')} />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-ink-200 pt-4">
          <button type="submit" className="btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? <Spinner className="h-4 w-4 text-white" /> : <Save className="h-4 w-4" />}
            {isEdit ? 'Update Patient' : 'Register Patient'}
          </button>
        </div>
      </form>
    </div>
  );
}