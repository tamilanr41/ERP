import { useState } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, Edit, Phone, Mail, CreditCard, Calendar, Tag, Layers, FileText, Pill,
  BedDouble, FlaskConical, IndianRupee, Activity, AlertTriangle, Printer, Stethoscope,
  UserPlus, CalendarDays, BadgeCheck, Receipt, UserSearch, HeartPulse, Plus, Pencil,
} from 'lucide-react';
import api, { apiError } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import Badge from '../../components/ui/Badge';
import { badge } from '../../components/ui/Badge.jsx';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/Feedback';
import { formatDate, formatDateTime, formatCurrency, initials, statusColor, cn } from '../../lib/utils';
import PatientCard from '../../components/ui/PatientCard';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'opVisits', label: 'OP Visits' },
  { key: 'appointments', label: 'Appointments' },
  { key: 'diagnoses', label: 'Diagnoses' },
  { key: 'prescriptions', label: 'Prescriptions' },
  { key: 'lab', label: 'Lab' },
  { key: 'radiology', label: 'Radiology' },
  { key: 'bills', label: 'Bills' },
  { key: 'payments', label: 'Payments' },
  { key: 'documents', label: 'Documents' },
  { key: 'referrals', label: 'Referrals' },
  { key: 'timeline', label: 'Timeline' },
];

const TAB_ICONS = {
  overview: UserSearch, opVisits: Stethoscope, appointments: CalendarDays, diagnoses: Activity,
  prescriptions: Pill, lab: FlaskConical, radiology: Layers, bills: Receipt, payments: IndianRupee,
  documents: FileText, referrals: ArrowLeftRight, timeline: HeartPulse,
};

const TIMELINE_MODULE_ICONS = {
  REGISTRATION: Calendar, APPOINTMENT: Calendar, OPD_VISIT: Stethoscope, ADMISSION: BedDouble,
  PRESCRIPTION: Pill, LAB_ORDER: FlaskConical, RADIOLOGY_ORDER: Layers, SURGERY: Activity,
  BILL: IndianRupee, PHARMACY: Pill, EMERGENCY: AlertTriangle, DISCHARGE: FileText,
  MEDICATION: Pill, NURSING: Activity,
};

const TIMELINE_MODULE_COLORS = {
  REGISTRATION: 'bg-emerald-100 text-emerald-700', APPOINTMENT: 'bg-blue-100 text-blue-700',
  OPD_VISIT: 'bg-cyan-100 text-cyan-700', ADMISSION: 'bg-violet-100 text-violet-700',
  PRESCRIPTION: 'bg-amber-100 text-amber-700', LAB_ORDER: 'bg-indigo-100 text-indigo-700',
  RADIOLOGY_ORDER: 'bg-purple-100 text-purple-700', SURGERY: 'bg-red-100 text-red-700',
  BILL: 'bg-pink-100 text-pink-700', PHARMACY: 'bg-teal-100 text-teal-700',
  EMERGENCY: 'bg-rose-100 text-rose-700', DISCHARGE: 'bg-ink-100 text-ink-700',
  MEDICATION: 'bg-orange-100 text-orange-700', NURSING: 'bg-sky-100 text-sky-700',
};

function StethoscopeIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M11 2v2" /><path d="M5 2v2" /><path d="M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1" /><path d="M8 15a6 6 0 0 0 12 0v-3" /><circle cx="20" cy="10" r="2" />
    </svg>
  );
}

function ArrowLeftRight(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M8 3 4 7l4 4" /><path d="M4 7h16" /><path d="m16 21 4-4-4-4" /><path d="M20 17H4" />
    </svg>
  );
}

const useTabQuery = (key, url) =>
  useQuery({
    queryKey: [key],
    queryFn: async () => (await api.get(url)).data.data,
  });

function TabShell({ title, sub, children }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white shadow-sm">
      <div className="border-b border-ink-100 px-4 py-3">
        <h3 className="text-sm font-bold text-ink-900">{title}</h3>
        {sub && <p className="text-[11px] text-ink-500">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

function InfoRow({ icon: Icon, label, children, className }) {
  return (
    <div className={cn('flex items-start gap-2.5 py-1.5', className)}>
      {Icon && <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-500" />}
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-wide text-ink-500">{label}</div>
        <div className="text-sm text-ink-700">{children || '—'}</div>
      </div>
    </div>
  );
}

/* ----------------------------- Tab panels ------------------------------ */

function OverviewTab({ patient }) {
  const age = patient.age?.years != null ? `${patient.age.years}y` : patient.dateOfBirth ? `${Math.floor((Date.now() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000))}y` : '—';
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="card p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">Demographics</h3>
        <div className="space-y-0.5">
          <InfoRow icon={Calendar} label="Date of Birth">{formatDate(patient.dateOfBirth)}{patient.age?.years != null ? ` (${age})` : ''}</InfoRow>
          <InfoRow icon={Tag} label="Blood Group">{patient.bloodGroup === 'UNKNOWN' ? 'Not recorded' : patient.bloodGroup}</InfoRow>
          <InfoRow icon={CreditCard} label="ID Proof">{patient.idProof?.type && `${patient.idProof.type}: `}{patient.idProof?.number || '—'}</InfoRow>
          <InfoRow icon={BadgeCheck} label="ABHA ID">{patient.abhaId || '—'}</InfoRow>
          <InfoRow icon={Calendar} label="Registered">{formatDate(patient.registrationDate)}{patient.registeredBy ? ` by ${patient.registeredBy.firstName || ''}` : ''}</InfoRow>
          <InfoRow label="OP Number">{patient.registrationNumber || '—'}</InfoRow>
        </div>
      </div>
      <div className="card p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">Contact & Address</h3>
        <div className="space-y-0.5">
          <InfoRow icon={Phone} label="Mobile">{patient.mobile || '—'}</InfoRow>
          <InfoRow icon={Phone} label="Alternate">{patient.alternatePhone || '—'}</InfoRow>
          <InfoRow icon={Mail} label="Email">{patient.email || '—'}</InfoRow>
          <InfoRow label="Address">
            {[patient.address?.line1, patient.address?.area, patient.address?.city, patient.address?.district, patient.address?.state, patient.address?.pincode, patient.address?.country].filter(Boolean).join(', ') || '—'}
          </InfoRow>
          {patient.emergencyContact?.name && <InfoRow icon={AlertTriangle} label="Emergency Contact">{patient.emergencyContact.name} · {patient.emergencyContact.relation} · {patient.emergencyContact.phone}</InfoRow>}
        </div>
      </div>
      <div className="card p-4 lg:col-span-2">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">Clinical Summary</h3>
        <div className="grid gap-4 text-sm sm:grid-cols-4">
          <div>
            <div className="text-[11px] font-medium text-ink-500">Allergies</div>
            <div>{patient.allergies?.length ? patient.allergies.map((a) => <span key={a} className="mt-1 inline-block rounded bg-rose-50 px-1.5 py-0.5 text-[11px] font-medium text-rose-600">{a}</span>).reduce((acc, e, i) => [acc, ' ', e]) : 'None recorded'}</div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-ink-500">Existing Conditions</div>
            <div className="text-ink-700">{patient.medicalHistory?.length ? patient.medicalHistory.join(', ') : 'None recorded'}</div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-ink-500">Current Medications</div>
            <div className="text-ink-700">{patient.currentMedications?.length ? patient.currentMedications.join(', ') : 'None recorded'}</div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-ink-500">Special Alerts</div>
            <div className="text-ink-700">{patient.specialAlerts?.length ? patient.specialAlerts.join(', ') : 'None recorded'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function VisitsTab({ id }) {
  const q = useTabQuery(['p360-visits', id], `/opd/visits?patientId=${id}&limit=50`);
  return (
    <TabShell title="OP Visits" sub="All outpatient visits for this patient">
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={apiError(q.error)} /> : !q.data?.length ? <EmptyState title="No OP visits yet" /> : (
        <table className="table">
          <thead>
            <tr><th>OP Number</th><th>Date</th><th>Department</th><th>Doctor</th><th>Type</th><th>Status</th></tr>
          </thead>
          <tbody>
            {q.data.map((v) => (
              <tr key={v._id}>
                <td className="font-mono text-xs font-semibold text-brand-700">{v.opdNumber}</td>
                <td>{formatDateTime(v.visitDate)}</td>
                <td>{v.departmentId?.name || '—'}</td>
                <td>{v.doctorId?.name || '—'}</td>
                <td>{String(v.visitType || 'NEW').replace('_', ' ')}</td>
                <td>{badge(v.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </TabShell>
  );
}

function AppointmentsTab({ id }) {
  const q = useTabQuery(['p360-appts', id], `/appointments?patientId=${id}&limit=50`);
  return (
    <TabShell title="Appointments" sub="Booked appointments">
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={apiError(q.error)} /> : !q.data?.length ? <EmptyState title="No appointments" /> : (
        <table className="table">
          <thead>
            <tr><th>ID</th><th>Date / Time</th><th>Doctor</th><th>Department</th><th>Type</th><th>Status</th></tr>
          </thead>
          <tbody>
            {q.data.map((a) => (
              <tr key={a._id}>
                <td className="font-mono text-xs">{a.appointmentNumber || '—'}</td>
                <td>{formatDate(a.date)} · {a.time}</td>
                <td>{a.doctorId?.name || '—'}</td>
                <td>{a.departmentId?.name || '—'}</td>
                <td>{a.type || 'OPD'}</td>
                <td>{badge(a.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </TabShell>
  );
}

function DiagnosesTab({ id }) {
  const q = useTabQuery(['p360-diagnoses', id], `/opd/visits?patientId=${id}&limit=50`);
  const rows = (q.data || []).filter((v) => v.diagnosis?.provisional || v.diagnosis?.final);
  return (
    <TabShell title="Diagnoses" sub="Diagnoses recorded during each visit">
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={apiError(q.error)} /> : !rows.length ? <EmptyState title="No diagnoses recorded" /> : (
        <table className="table">
          <thead>
            <tr><th>OP Number</th><th>Date</th><th>Provisional</th><th>Final</th><th>ICD Code</th></tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v._id}>
                <td className="font-mono text-xs font-semibold text-brand-700">{v.opdNumber}</td>
                <td>{formatDate(v.visitDate)}</td>
                <td>{v.diagnosis?.provisional || '—'}</td>
                <td className="font-medium">{v.diagnosis?.final || '—'}</td>
                <td className="font-mono text-xs">{v.diagnosis?.icdCode || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </TabShell>
  );
}

function PrescriptionsTab({ id }) {
  const q = useTabQuery(['p360-rx', id], `/opd/prescriptions?patientId=${id}&limit=50`);
  return (
    <TabShell title="Prescriptions" sub="All prescriptions issued">
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={apiError(q.error)} /> : !q.data?.length ? <EmptyState title="No prescriptions" /> : (
        <div className="divide-y divide-ink-100">
          {q.data.map((rx) => (
            <div key={rx._id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div>
                <div className="font-mono text-xs font-semibold text-brand-700">{rx.rxNumber || '—'}</div>
                <div className="text-[13px] text-ink-700">{formatDateTime(rx.prescriptionDate)} · Dr. {rx.doctorId?.name || '—'}</div>
                <div className="mt-0.5 text-xs text-ink-500">
                  {rx.items?.length ? rx.items.map((i) => i.medicineName || i.name).join(', ') : 'No items'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {rx.isDispensed && <Badge className="text-[10px] bg-emerald-100 text-emerald-700">Dispensed</Badge>}
                {badge(rx.status)}
              </div>
            </div>
          ))}
        </div>
      )}
    </TabShell>
  );
}

function LabTab({ id }) {
  const q = useTabQuery(['p360-lab', id], `/lab/orders?patientId=${id}&limit=50`);
  return (
    <TabShell title="Lab Orders" sub="Investigation orders with results">
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={apiError(q.error)} /> : !q.data?.length ? <EmptyState title="No lab orders" /> : (
        <table className="table">
          <thead>
            <tr><th>Order Number</th><th>Ordered At</th><th>Tests</th><th>Priority</th><th>Status</th></tr>
          </thead>
          <tbody>
            {q.data.map((o) => (
              <tr key={o._id}>
                <td className="font-mono text-xs font-semibold text-brand-700">{o.orderNumber}</td>
                <td>{formatDateTime(o.orderedAt)}</td>
                <td>{o.items?.length ?? o.tests?.length ?? 0} tests</td>
                <td>{o.priority || '—'}</td>
                <td>{badge(o.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </TabShell>
  );
}

function RadiologyTab({ id }) {
  const q = useTabQuery(['p360-rad', id], `/radiology/orders?patientId=${id}&limit=50`);
  return (
    <TabShell title="Radiology" sub="Imaging orders">
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={apiError(q.error)} /> : !q.data?.length ? <EmptyState title="No radiology orders" /> : (
        <table className="table">
          <thead>
            <tr><th>Order Number</th><th>Ordered At</th><th>Tests</th><th>Priority</th><th>Status</th></tr>
          </thead>
          <tbody>
            {q.data.map((o) => (
              <tr key={o._id}>
                <td className="font-mono text-xs font-semibold text-brand-700">{o.orderNumber}</td>
                <td>{formatDateTime(o.orderedAt)}</td>
                <td>{o.items?.length ?? 0} studies</td>
                <td>{o.priority || '—'}</td>
                <td>{badge(o.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </TabShell>
  );
}

function BillsTab({ id }) {
  const q = useTabQuery(['p360-bills', id], `/billing?patientId=${id}&limit=50`);
  return (
    <TabShell title="Bills" sub="Billing history">
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={apiError(q.error)} /> : !q.data?.length ? <EmptyState title="No bills" /> : (
        <table className="table">
          <thead>
            <tr><th>Bill Number</th><th>Date</th><th>Type</th><th>Total</th><th>Due</th><th>Status</th></tr>
          </thead>
          <tbody>
            {q.data.map((b) => (
              <tr key={b._id}>
                <td className="font-mono text-xs font-semibold text-brand-700">{b.billNumber}</td>
                <td>{formatDate(b.billDate)}</td>
                <td>{b.billType || 'OPD'}</td>
                <td>{formatCurrency(b.total ?? b.netTotal ?? 0)}</td>
                <td className="font-medium text-ink-700">{formatCurrency(b.dueAmount ?? 0)}</td>
                <td>{badge(b.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </TabShell>
  );
}

function PaymentsTab({ id }) {
  const q = useTabQuery(['p360-payments', id], `/billing/payments/list?patientId=${id}&limit=50`);
  return (
    <TabShell title="Payments" sub="Payment transactions">
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={apiError(q.error)} /> : !q.data?.length ? <EmptyState title="No payments" /> : (
        <table className="table">
          <thead>
            <tr><th>Transaction</th><th>Date</th><th>Mode</th><th>Amount</th><th>Status</th></tr>
          </thead>
          <tbody>
            {q.data.map((p) => (
              <tr key={p._id}>
                <td className="font-mono text-xs font-semibold text-brand-700">{p.transactionId || p.paymentNumber || '—'}</td>
                <td>{formatDateTime(p.paidAt)}</td>
                <td>{p.mode || '—'}</td>
                <td className="font-medium">{formatCurrency(p.amount ?? 0)}</td>
                <td>{badge(p.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </TabShell>
  );
}

function DocumentsTab({ id }) {
  const q = useTabQuery(['p360-docs', id], `/patients/${id}/documents`);
  return (
    <TabShell title="Documents" sub="Uploaded patient documents">
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={apiError(q.error)} /> : !q.data?.length ? <EmptyState title="No documents uploaded" /> : (
        <div className="divide-y divide-ink-100">
          {q.data.map((d) => (
            <div key={d._id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><FileText className="h-4 w-4" /></span>
                <div>
                  <div className="text-[13px] font-semibold text-ink-800">{d.title || d.category || 'Document'}</div>
                  <div className="text-[11px] text-ink-500">{d.category || 'GENERAL'} · {formatDateTime(d.uploadedAt || d.createdAt)}</div>
                </div>
              </div>
              {d.fileUrl && <a className="btn-secondary px-2.5 py-1 text-xs" href={d.fileUrl} target="_blank" rel="noreferrer">Open</a>}
            </div>
          ))}
        </div>
      )}
    </TabShell>
  );
}

function ReferralsTab({ id }) {
  const q = useTabQuery(['p360-referrals', id], `/opd/visits?patientId=${id}&status=REFERRED&limit=50`);
  return (
    <TabShell title="Referrals" sub="Visits referred to another doctor or department">
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={apiError(q.error)} /> : !q.data?.length ? <EmptyState title="No referrals" /> : (
        <table className="table">
          <thead>
            <tr><th>OP Number</th><th>Date</th><th>Referred To</th><th>Reason</th><th>Notes</th></tr>
          </thead>
          <tbody>
            {q.data.map((v) => (
              <tr key={v._id}>
                <td className="font-mono text-xs font-semibold text-brand-700">{v.opdNumber}</td>
                <td>{formatDate(v.visitDate)}</td>
                <td>{[v.referral?.toDoctor, v.referral?.toDepartment].filter(Boolean).join(' · ') || '—'}</td>
                <td>{v.referral?.reason || '—'}</td>
                <td className="text-xs text-ink-500">{v.referral?.notes || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </TabShell>
  );
}

function TimelineTab({ id }) {
  const { data: timeline, isLoading, error } = useTabQuery(['patientTimeline', id], `/patients/${id}/timeline`);
  return (
    <TabShell title="Patient Timeline" sub="Every event timestamped">
      {isLoading ? <LoadingState label="Loading timeline…" /> : error ? <ErrorState message={apiError(error)} /> : !timeline?.length ? <EmptyState title="No events recorded yet" /> : (
        <div className="divide-y divide-ink-100">
          {timeline.map((evt, idx) => {
            const Icon = TIMELINE_MODULE_ICONS[evt.module] || FileText;
            const colorClass = TIMELINE_MODULE_COLORS[evt.module] || 'bg-ink-100 text-ink-700';
            return (
              <div key={`${evt.entityId}-${idx}`} className="flex items-start gap-3 px-4 py-3 transition hover:bg-ink-50">
                <div className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full', colorClass)}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium text-ink-800">{evt.type?.replace(/_/g, ' ')}</span>
                    {evt.number && <span className="font-mono text-[11px] text-ink-500">{String(evt.number)}</span>}
                    {evt.status && <Badge className={cn('text-[10px]', statusColor(evt.status))}>{evt.status}</Badge>}
                  </div>
                  <div className="mt-0.5 text-[11px] text-ink-500">{formatDateTime(evt.at)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </TabShell>
  );
}

/* ------------------------------ Main page ------------------------------ */

export default function PatientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(() => {
    const t = searchParams.get('tab');
    return TABS.some((x) => x.key === t) ? t : 'overview';
  });

  const { data: patient, isLoading: patientLoading, error: patientError } = useQuery({
    queryKey: ['patient', id],
    queryFn: async () => (await api.get(`/patients/${id}`)).data.data,
  });

  const { data: refs } = useQuery({
    queryKey: ['patientRefs', id],
    queryFn: async () => (await api.get(`/patients/${id}/references`)).data.data,
  });

  if (patientLoading) return <LoadingState label="Loading patient…" />;
  if (patientError) return <ErrorState message={apiError(patientError)} />;
  if (!patient) return <ErrorState message="Patient not found" />;

  const fullName = [patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(' ');
  const age = patient.age?.years != null ? `${patient.age.years}y` : patient.dateOfBirth ? `${Math.floor((Date.now() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000))}y` : '—';

  const quickActions = [
    { label: 'New OP Visit', to: '/opd/walkin', icon: StethoscopeIcon },
    { label: 'Appointment', to: '/opd/appointments', icon: CalendarDays },
    { label: 'Consultation', to: '/opd/consultation', icon: UserSearch },
    { label: 'Billing', to: '/opd/billing', icon: IndianRupee },
    { label: 'Prescription', to: '/opd/prescriptions', icon: Pill },
    { label: 'Investigation', to: '/opd/orders', icon: FlaskConical },
  ];

  return (
    <div className="p-6">
      <PageHeader
        title={null}
        subtitle={null}
        actions={
          <div className="flex gap-2">
            <Link to="/patients" className="btn-secondary inline-flex items-center gap-1.5 text-xs"><ArrowLeft className="h-3.5 w-3.5" /> Back</Link>
            <Link to={`/patients/${id}/edit`} className="btn-primary inline-flex items-center gap-1.5 text-xs"><Edit className="h-3.5 w-3.5" /> Edit</Link>
          </div>
        }
      />

      {/* Patient 360 header */}
      <div className="relative overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">
        <div className="h-20 bg-gradient-to-r from-brand-700 via-brand-600 to-mint-600" />
        <div className="px-6 pb-4">
          <div className="-mt-10 flex flex-wrap items-end gap-4">
            {patient.photo ? (
              <img src={patient.photo} alt={fullName} className="h-20 w-20 rounded-2xl object-cover ring-4 ring-white" />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-100 text-2xl font-bold text-brand-700 ring-4 ring-white">
                {fullName.split(' ').map((w) => w[0]).slice(0, 2).join('') || 'P'}
              </div>
            )}
            <div className="min-w-0 pb-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <h2 className="text-xl font-bold text-ink-900">{fullName}</h2>
                <span className="font-mono text-sm font-semibold text-brand-700">{patient.uhid}</span>
                <Badge className={cn('text-[10px] font-semibold', statusColor(patient.status))}>{patient.status}</Badge>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
                <span>{patient.gender}</span>
                <span>{age}</span>
                {patient.mobile && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{patient.mobile}</span>}
                {patient.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{patient.email}</span>}
                {patient.bloodGroup && patient.bloodGroup !== 'UNKNOWN' && <span className="font-semibold text-red-600">{patient.bloodGroup}</span>}
                {patient.abhaId && <span className="font-mono">ABHA {patient.abhaId}</span>}
              </div>
            </div>
          </div>

          {patient.allergies?.length > 0 && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Allergy Alert: {patient.allergies.join(', ')}
            </div>
          )}
          {patient.specialAlerts?.length > 0 && (
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Special Alerts: {patient.specialAlerts.join(', ')}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3">
            {quickActions.map(({ label, to, icon: Icon }) => (
              <button key={label} onClick={() => navigate(to)} className="btn-secondary px-3 py-1.5 text-xs">
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
            <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5" /> Print
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 mt-4 flex flex-wrap gap-1 rounded-lg bg-ink-100 p-0.5">
        {TABS.map(({ key, label }) => {
          const Icon = TAB_ICONS[key] || FileText;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition',
                tab === key ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700',
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === 'overview' && <OverviewTab patient={patient} />}
      {tab === 'opVisits' && <VisitsTab id={id} />}
      {tab === 'appointments' && <AppointmentsTab id={id} />}
      {tab === 'diagnoses' && <DiagnosesTab id={id} />}
      {tab === 'prescriptions' && <PrescriptionsTab id={id} />}
      {tab === 'lab' && <LabTab id={id} />}
      {tab === 'radiology' && <RadiologyTab id={id} />}
      {tab === 'bills' && <BillsTab id={id} />}
      {tab === 'payments' && <PaymentsTab id={id} />}
      {tab === 'documents' && <DocumentsTab id={id} />}
      {tab === 'referrals' && <ReferralsTab id={id} />}
      {tab === 'timeline' && <TimelineTab id={id} />}

      {/* Print zone */}
      <div style={{ visibility: 'hidden', height: 0, overflow: 'hidden' }} aria-hidden="true">
        <PatientCard patient={patient} />
      </div>
    </div>
  );
}