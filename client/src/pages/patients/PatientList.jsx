import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import api, { apiError } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import Pagination from '../../components/ui/Pagination';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/Feedback';
import { formatDate } from '../../lib/utils';

const fetchPatients = async ({ queryKey }) => {
  const [, params] = queryKey;
  return (await api.get('/patients', { params })).data;
};

export default function PatientList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['patients', { page, search: debounced }],
    queryFn: fetchPatients,
  });

  const setPageAndReset = (p) => setPage(p);

  return (
    <div className="p-6">
      <PageHeader
        title="Patients"
        subtitle="Search, register and manage patient records"
        actions={
          <Link to="/patients/new" className="btn-primary">
            <Plus className="h-4 w-4" /> Register Patient
          </Link>
        }
      />

      <div className="mb-4 flex gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
          <input
            className="input pl-9"
            placeholder="Search by UHID, name, mobile…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {isFetching && <span className="self-center text-xs text-ink-500">Updating…</span>}
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={apiError(error)} />
        ) : !data?.data?.length ? (
          <EmptyState title="No patients yet" hint="Register the first patient to get started" />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>UHID</th>
                <th>Name</th>
                <th>Gender</th>
                <th>DOB</th>
                <th>Mobile</th>
                <th>Email</th>
                <th>Registered</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.data.map((p) => (
                <tr key={p._id} className="cursor-pointer transition-colors hover:bg-ink-50" onClick={() => navigate(`/patients/${p._id}`)}>
                  <td className="font-medium text-brand-700">{p.uhid}</td>
                  <td>
                    {p.firstName} {p.lastName}
                    {p.duplicateCount > 0 && <span className="badge ml-2 bg-amber-100 text-amber-800">dup</span>}
                  </td>
                  <td>{p.gender}</td>
                  <td>{formatDate(p.dateOfBirth)}</td>
                  <td>{p.mobile}</td>
                  <td>{p.email || '—'}</td>
                  <td>{formatDate(p.registrationDate)}</td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data?.pagination && (
          <Pagination
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            total={data.pagination.total}
            limit={data.pagination.limit}
            onChange={setPageAndReset}
          />
        )}
      </div>
    </div>
  );
}