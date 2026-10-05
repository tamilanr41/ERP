import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { UserSearch, UserPlus, CalendarDays, ArrowRight, Eye, History, Search, X } from 'lucide-react';
import api, { apiError } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import Pagination from '../../components/ui/Pagination';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/Feedback';
import { formatDate, cn } from '../../lib/utils';

export default function OpdPatientSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('');
  const [page, setPage] = useState(1);
  const [debounced, setDebounced] = useState('');

  const patients = useQuery({
    queryKey: ['opd-patient-search', debounced, dob, gender, page],
    queryFn: async () =>
      (
        await api.get('/patients', {
          params: {
            page,
            limit: 10,
            search: debounced || undefined,
            dob: dob || undefined,
            gender: gender || undefined,
          },
        })
      ).data,
    enabled: debounced.length >= 2 || dob !== '' || gender !== '',
  });

  const rows = patients.data?.data || [];
  const ids = useMemo(() => rows.map((r) => r._id).join(','), [rows]);

  const lastVisits = useQuery({
    queryKey: ['opd-patient-lastvisits', ids],
    queryFn: async () => {
      const out = {};
      await Promise.all(
        rows.map(async (p) => {
          try {
            const v = await api.get('/opd/visits', { params: { patientId: p._id, limit: 1 } });
            out[p._id] = v.data?.data?.[0] || null;
          } catch {
            out[p._id] = null;
          }
        }),
      );
      return out;
    },
    enabled: rows.length > 0,
  });

  const clear = () => {
    setQ('');
    setDebounced('');
    setDob('');
    setGender('');
    setPage(1);
  };

  const onSearch = (e) => {
    setQ(e.target.value);
    setPage(1);
    const t = setTimeout(() => setDebounced(e.target.value.trim()), 400);
    return () => clearTimeout(t);
  };

  return (
    <div className="p-6">
      <PageHeader
        title="Patient Search"
        subtitle="Find patients by UHID, name, mobile, OP number, date of birth or ID proof — prevent duplicate registration"
        actions={
          <button className="btn-primary" onClick={() => navigate('/opd/registration')}>
            <UserPlus className="h-4 w-4" /> Register New
          </button>
        }
      />

      <div className="card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative w-full max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
            <input
              className="input !pl-9"
              placeholder="Search UHID / name / mobile / OP no / ID proof…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
                clearTimeout(window.__opdSrch);
                window.__opdSrch = setTimeout(() => setDebounced(e.target.value.trim()), 400);
              }}
            />
          </div>
          <div>
            <label className="label">Date of birth</label>
            <input type="date" className="input" value={dob} onChange={(e) => { setDob(e.target.value); setPage(1); }} />
          </div>
          <div>
            <label className="label">Gender</label>
            <select className="select" value={gender} onChange={(e) => { setGender(e.target.value); setPage(1); }}>
              <option value="">All</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <button className="btn-secondary" onClick={clear}>
            <X className="h-4 w-4" /> Clear
          </button>
        </div>
        <p className="mt-2 text-[11px] text-ink-500">
          Tip: typing at least 2 characters enables search. The OP number is the patient's registration number (REG-XXXX).
        </p>
      </div>

      <div className="card mt-4 overflow-hidden">
        {!debounced && !dob && !gender ? (
          <EmptyState title="Start a search" hint="Enter a UHID, name, mobile number, OP number or date of birth to find patients" />
        ) : patients.isLoading ? (
          <LoadingState label="Searching patients…" />
        ) : patients.error ? (
          <ErrorState message={apiError(patients.error)} />
        ) : !rows.length ? (
          <EmptyState title="No patients found" hint="Register the patient as new from Patient Registration — a duplicate check runs automatically" />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>UHID</th>
                <th>Patient</th>
                <th>Age</th>
                <th>Gender</th>
                <th>Mobile</th>
                <th>Last Visit</th>
                <th>Last Department</th>
                <th>Last Doctor</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const lv = lastVisits.data?.[p._id];
                return (
                  <tr key={p._id} className="hover:bg-ink-50">
                    <td className="font-mono text-xs font-semibold text-brand-700">{p.uhid}</td>
                    <td>
                      <div className="font-medium text-ink-900">{p.firstName} {p.lastName || ''}</div>
                      <div className="text-xs text-ink-400">{p.registrationNumber}</div>
                    </td>
                    <td className="text-[13px]">{p.age?.years ?? '—'}</td>
                    <td className="text-[13px] capitalize">{p.gender?.toLowerCase() || '—'}</td>
                    <td className="font-mono text-[13px]">{p.mobile || '—'}</td>
                    <td className="text-[13px] text-ink-500">{lv ? formatDate(lv.visitDate) : '—'}</td>
                    <td className="text-[13px] text-ink-500">{lv?.departmentId?.name || '—'}</td>
                    <td className="text-[13px] text-ink-500">{lv?.doctorId?.name || '—'}</td>
                    <td>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <button className="btn-secondary px-2.5 py-1 text-xs" onClick={() => navigate(`/patients/${p._id}`)}>
                          <Eye className="h-3.5 w-3.5" /> View
                        </button>
                        <button className="btn-secondary px-2.5 py-1 text-xs" onClick={() => navigate('/opd/walkin')}>
                          <ArrowRight className="h-3.5 w-3.5" /> OP Visit
                        </button>
                        <button className="btn-secondary px-2.5 py-1 text-xs" onClick={() => navigate('/opd/appointments')}>
                          <CalendarDays className="h-3.5 w-3.5" /> Book
                        </button>
                        <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => navigate(`/patients/${p._id}?tab=timeline`)}>
                          <History className="h-3.5 w-3.5" /> History
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {patients.data?.pagination && <Pagination {...patients.data.pagination} onChange={(p) => setPage(p)} />}
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3 text-xs text-brand-700">
        <UserSearch className="h-4 w-4 shrink-0" />
        Prefer searching before registering — the system prevents duplicate registrations by showing matching records first.
      </div>
    </div>
  );
}