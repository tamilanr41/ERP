import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { KeyRound, Pencil, Plus, Power, Trash2, UserPlus } from 'lucide-react';
import api, { apiError } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/Feedback';
import { badge } from '../../components/ui/Badge.jsx';
import { Modal, Field, SearchBox, Submit, ConfirmDialog, IconButton } from './parts';
import { formatDateTime, cn } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';

const BLANK = { firstName: '', lastName: '', email: '', username: '', phone: '', password: '', roleId: '' };

export default function UserSettings() {
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null); // user object, or 'new'
  const [resetting, setResetting] = useState(null);
  const [removing, setRemoving] = useState(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['settings-users'],
    queryFn: async () => (await api.get('/users', { params: { limit: 200, search: q.trim() || undefined } })).data.data,
  });
  const { data: roles } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => (await api.get('/users/roles')).data.data,
  });

  const inval = () => qc.invalidateQueries({ queryKey: ['settings-users'] });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }) => (await api.patch(`/users/${id}/status`, { status })).data.data,
    onSuccess: (u) => { toast.success(`${u.username} → ${u.status}`); inval(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const remove = useMutation({
    mutationFn: async ({ id, reason }) => (await api.delete(`/users/${id}`, { data: { reason } })).data.data,
    onSuccess: () => { toast.success('Account deactivated'); setRemoving(null); inval(); },
    onError: (e) => { setRemoving(null); toast.error(apiError(e)); },
  });

  const rows = data || [];
  const activeCount = useMemo(() => rows.filter((u) => u.active !== false && u.status === 'ACTIVE').length, [rows]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Users"
        subtitle={`${rows.length} account${rows.length === 1 ? '' : 's'}, ${activeCount} active. Deactivating keeps every bill, report and audit entry they touched intact.`}
        actions={<button className="btn-primary" onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> Add user</button>}
      />

      <div className="card overflow-hidden">
        <div className="border-b border-ink-100 p-3">
          <SearchBox value={q} onChange={setQ} placeholder="Search name, username or email…" />
        </div>

        {isLoading ? <LoadingState /> : error ? <ErrorState message={apiError(error)} /> : !rows.length ? (
          <EmptyState title="No users found" hint={q ? 'No account matches that search.' : 'Create the first account to get started.'} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th><th>Username</th><th>Email</th><th>Phone</th><th>Role</th><th>Status</th><th>Last sign-in</th><th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => {
                  const inactive = u.active === false || u.status !== 'ACTIVE';
                  const isMe = u._id === me?.id;
                  return (
                    <tr key={u._id} className={cn(inactive && 'opacity-60')}>
                      <td className="font-medium text-ink-900">
                        {u.firstName} {u.lastName || ''}
                        {isMe && <span className="ml-1.5 text-[10px] text-brand-600">(you)</span>}
                      </td>
                      <td>{u.username}</td>
                      <td>{u.email || <span className="text-ink-400">—</span>}</td>
                      <td>{u.phone || <span className="text-ink-400">—</span>}</td>
                      <td><span className="badge bg-ink-100 text-ink-700">{u.roleCode || u.role?.name || '—'}</span></td>
                      <td>{badge(u.active === false ? 'DEACTIVATED' : u.status, u.active === false ? 'INACTIVE' : u.status)}</td>
                      <td className="text-xs text-ink-500">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never'}</td>
                      <td className="text-right">
                        <div className="flex justify-end gap-1">
                          <IconButton label="Edit user" icon={Pencil} tone="primary" onClick={() => setEditing(u)} />
                          <IconButton label="Reset password" icon={KeyRound} onClick={() => setResetting(u)} disabled={isMe} />
                          {!inactive ? (
                            <IconButton
                              label="Deactivate"
                              icon={Power}
                              onClick={() => setStatus.mutate({ id: u._id, status: 'INACTIVE' })}
                              disabled={isMe || setStatus.isPending}
                            />
                          ) : (
                            <IconButton
                              label="Reactivate"
                              icon={Power}
                              tone="primary"
                              onClick={() => setStatus.mutate({ id: u._id, status: 'ACTIVE' })}
                              disabled={setStatus.isPending}
                            />
                          )}
                          <IconButton label="Deactivate account" icon={Trash2} tone="danger" onClick={() => setRemoving(u)} disabled={isMe} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <UserFormModal
          user={editing === 'new' ? null : editing}
          roles={roles || []}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); inval(); }}
        />
      )}

      {resetting && (
        <ResetPasswordModal
          user={resetting}
          onClose={() => setResetting(null)}
          onDone={() => { setResetting(null); inval(); }}
        />
      )}

      {removing && (
        <ConfirmDialog
          title={`Deactivate ${removing.username}?`}
          icon={Trash2}
          body={`${removing.firstName} ${removing.lastName || ''} will be signed out immediately and can no longer sign in.`}
          consequence="The account is kept, not erased: past bills, lab results, prescriptions and audit entries keep their name. Reactivate at any time."
          confirmLabel="Deactivate account"
          pending={remove.isPending}
          onCancel={() => setRemoving(null)}
          onConfirm={() => remove.mutate({ id: removing._id })}
        />
      )}
    </div>
  );
}

function UserFormModal({ user, roles, onClose, onDone }) {
  const isNew = !user;
  const [form, setForm] = useState(() => ({
    ...BLANK,
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
    username: user?.username || '',
    phone: user?.phone || '',
    roleId: user?.roleId?._id || user?.roleId || '',
  }));

  const mutation = useMutation({
    mutationFn: async (v) => {
      const body = { ...v };
      if (body.username === (user?.username || '')) delete body.username;
      if (isNew) return (await api.post('/users', body)).data.data;
      delete body.password;
      return (await api.put(`/users/${user._id}`, body)).data.data;
    },
    onSuccess: () => { toast.success(isNew ? 'User created' : 'User updated'); onDone(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  // Shared by the footer button and the form's own onSubmit so Enter in any
  // field saves too, and validation lives in one place.
  const doSave = () => {
    if (!form.firstName.trim()) return toast.error('First name is required');
    if (isNew && !/^\S+@\S+\.\S+$/.test(form.email)) return toast.error('A valid email is required');
    if (isNew && form.password.length < 8) return toast.error('Password must be at least 8 characters');
    if (!form.roleId) return toast.error('Select a role');
    mutation.mutate(form);
  };

  return (
    <Modal
      title={isNew ? 'Add user' : `Edit ${user.username}`}
      icon={isNew ? UserPlus : Pencil}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <Submit pending={mutation.isPending} onClick={doSave}>{isNew ? 'Create user' : 'Save changes'}</Submit>
        </>
      )}
    >
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); doSave(); }}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" required><input className="input" value={form.firstName} onChange={set('firstName')} /></Field>
          <Field label="Last name"><input className="input" value={form.lastName} onChange={set('lastName')} /></Field>
        </div>
        <Field label="Email" required={isNew} hint={isNew ? 'Also used to derive the username when one is not given.' : undefined}>
          <input className="input" type="email" value={form.email} onChange={set('email')} />
        </Field>
        <Field label="Username" hint={isNew ? 'Leave blank to derive from the email.' : 'Usernames cannot be changed after creation.'}>
          <input className="input" value={form.username} onChange={set('username')} disabled={!isNew} />
        </Field>
        <Field label="Phone"><input className="input" value={form.phone} onChange={set('phone')} /></Field>
        <Field label="Role" required>
          <select className="select" value={form.roleId} onChange={set('roleId')}>
            <option value="">Select role…</option>
            {roles.map((r) => <option key={r._id} value={r._id}>{r.displayName || r.name}</option>)}
          </select>
        </Field>
        {isNew && (
          <Field label="Password" required hint="At least 8 characters. Share it with the user and ask them to change it after the first sign-in.">
            <input className="input" type="password" value={form.password} onChange={set('password')} />
          </Field>
        )}
      </form>
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose, onDone }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const mutation = useMutation({
    mutationFn: async () => (await api.patch(`/users/${user._id}/password`, { newPassword: password })).data.data,
    onSuccess: () => { toast.success(`Password reset for ${user.username}`); onDone(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const mismatch = confirm.length > 0 && password !== confirm;

  return (
    <Modal
      title={`Reset password for ${user.username}`}
      icon={KeyRound}
      onClose={onClose}
      subtitle="They are signed out of every device and must sign in again with the new password."
      footer={(
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <Submit
            pending={mutation.isPending}
            disabled={password.length < 8 || mismatch || !confirm}
          >
            Reset password
          </Submit>
        </>
      )}
    >
      <Field label="New password" required hint="At least 8 characters.">
        <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label="Confirm password" required>
        <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      {mismatch && <p className="text-[11px] text-rose-600">The two passwords do not match.</p>}
    </Modal>
  );
}