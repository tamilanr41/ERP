import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, X } from 'lucide-react';
import api, { apiError } from '../lib/api';
import PageHeader from '../components/ui/PageHeader';
import { LoadingState, ErrorState, EmptyState, Spinner } from '../components/ui/Feedback';
import { formatDateTime } from '../lib/utils';
import { badge } from '../components/ui/Badge.jsx';

const fetchUsers = async () => (await api.get('/users')).data.data;

export default function Users() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });
  const { data: roles } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => (await api.get('/users/roles')).data.data,
  });

  return (
    <div className="p-6">
      <PageHeader
        title="Users & Access"
        subtitle="Manage system users and roles"
        actions={<button className="btn-primary" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Add User</button>}
      />

      {showCreate && <CreateUserModal roles={roles || []} onClose={() => setShowCreate(false)} onDone={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ['users'] }); }} />}

      <div className="card overflow-hidden">
        {isLoading ? <LoadingState /> : error ? <ErrorState message={apiError(error)} /> : !data?.length ? (
          <EmptyState title="No users" />
        ) : (
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th></tr>
            </thead>
            <tbody>
              {data.map((u) => (
                <tr key={u._id}>
                  <td className="font-medium text-ink-900">{u.firstName} {u.lastName || ''}</td>
                  <td>{u.username}</td>
                  <td>{u.email}</td>
                  <td><span className="badge bg-ink-100 text-ink-700">{u.roleCode || u.role}</span></td>
                  <td>{badge(u.status, u.status)}</td>
                  <td>{formatDateTime(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function CreateUserModal({ roles, onClose, onDone }) {
  const { register, handleSubmit } = useFormish();
  const mutation = useMutation({
    mutationFn: async (v) => (await api.post('/users', v)).data.data,
    onSuccess: (u) => { toast.success(`User ${u.username} created`); onDone(); },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink-950/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <form className="card my-24 w-full max-w-md space-y-4 p-6" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit((v) => mutation.mutate(v))}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Add User</h2>
          <button type="button" onClick={onClose} className="text-ink-400 hover:text-ink-700"><X className="h-5 w-5" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">First Name *</label><input className="input" {...register('firstName')} /></div>
          <div><label className="label">Last Name</label><input className="input" {...register('lastName')} /></div>
        </div>
        <div>
          <label className="label">Email *</label>
          <input className="input" type="email" {...register('email')} />
        </div>
        <div>
          <label className="label">Username</label>
          <input className="input" {...register('username')} placeholder="auto-generated if blank" />
        </div>
        <div>
          <label className="label">Password *</label>
          <input className="input" type="password" {...register('password')} placeholder="Min 8 characters" />
        </div>
        <div>
          <label className="label">Role *</label>
          <select className="input" {...register('roleId')} defaultValue="">
            <option value="">Select role…</option>
            {roles.map((r) => <option key={r._id} value={r._id}>{r.displayName || r.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Phone</label>
          <input className="input" {...register('phone')} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? <Spinner className="h-4 w-4 text-white" /> : 'Create User'}
          </button>
        </div>
      </form>
    </div>
  );
}

function useFormish() {
  const [values, setValues] = useState({});
  const register = (name) => ({
    name,
    value: values[name] || '',
    onChange: (e) => setValues((p) => ({ ...p, [name]: e.target.value })),
  });
  const handleSubmit = (fn) => (e) => {
    e.preventDefault();
    fn({
      ...values,
      firstName: values.firstName || '',
      email: values.email || '',
      password: values.password || '',
      roleId: values.roleId || '',
    });
  };
  return { register, handleSubmit };
}