import { cn } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';

export function nowStamp() {
  const d = new Date();
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function PatientCard({ patient, className }) {
  const { user } = useAuth();
  const fullName = [patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(' ');
  const age = patient.age?.years != null
    ? `${patient.age.years}y`
    : patient.dateOfBirth
      ? `${Math.floor((Date.now() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000))}y`
      : '—';
  const address = [patient.address?.line1, patient.address?.city, patient.address?.state, patient.address?.pincode].filter(Boolean).join(', ');

  return (
    <div id="print-patient-card" className={cn('print:block', className)}>
      <div className="mx-auto w-[340px] overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-lg">
        <div className="flex items-center justify-between bg-gradient-to-r from-brand-700 to-brand-500 px-5 py-3 text-white">
          <div>
            <div className="text-sm font-bold leading-tight">{user?.hospitalName || 'ZhanX Medical Centre'}</div>
            <div className="text-[10px] text-brand-100">Main Branch · Patient Card</div>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/20 text-white ring-1 ring-white/30">
            <span className="text-xs font-black">{fullName.split(' ').map((w) => w[0]).slice(0, 2).join('') || 'P'}</span>
          </div>
        </div>

        <div className="flex items-start gap-4 px-5 py-4">
          {patient.photo ? (
            <img src={patient.photo} alt={fullName} className="h-16 w-16 shrink-0 rounded-xl object-cover ring-2 ring-brand-100" />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-lg font-bold text-brand-700 ring-2 ring-brand-100">
              {fullName.split(' ').map((w) => w[0]).slice(0, 2).join('') || 'P'}
            </div>
          )}
          <div className="min-w-0">
            <div className="text-base font-bold text-ink-900">{fullName}</div>
            <div className="mt-0.5 font-mono text-xs font-semibold text-brand-700">{patient.uhid}</div>
            <div className="mt-1 text-[11px] text-ink-500">
              {patient.gender} · {age} · {patient.mobile || '—'}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 border-t border-ink-100 bg-ink-50 px-5 py-3 text-center">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-ink-500">Blood</div>
            <div className="text-sm font-bold text-ink-900">{patient.bloodGroup === 'UNKNOWN' ? '—' : patient.bloodGroup}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-ink-500">DOB</div>
            <div className="text-sm font-bold text-ink-900">{patient.dateOfBirth ? new Date(patient.dateOfBirth).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-ink-500">ABHA</div>
            <div className="text-sm font-bold text-ink-900">{patient.abhaId || '—'}</div>
          </div>
        </div>

        <div className="px-5 py-3">
          <div className="text-[11px] text-ink-600">{address || 'No address on file'}</div>
          {patient.allergies?.length > 0 && (
            <div className="mt-1.5 inline-flex items-center gap-1 rounded bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-600">
              ⚠ Allergies: {patient.allergies.join(', ')}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-ink-100 px-5 py-2.5">
          <span className="text-[9px] uppercase tracking-[0.15em] text-ink-400">Valid at Main Branch</span>
          <span className="font-mono text-[9px] text-ink-400">Issued {nowStamp()}</span>
        </div>
      </div>
    </div>
  );
}

export default PatientCard;