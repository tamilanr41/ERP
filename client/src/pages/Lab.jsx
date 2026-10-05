import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Plus,
  Search,
  X,
  FlaskConical,
  TestTubes,
  ClipboardCheck,
  AlertTriangle,
  Flame,
  Stethoscope,
  ArrowUpRight,
} from 'lucide-react';
import api, { apiError } from '../lib/api';
import PageHeader from '../components/ui/PageHeader';
import Pagination from '../components/ui/Pagination';
import { LoadingState, ErrorState, EmptyState, Spinner } from '../components/ui/Feedback';
import Badge, { badge } from '../components/ui/Badge';
import { useAuth } from '../context/AuthContext';
import { formatDate, formatDateTime, cn } from '../lib/utils';

const STATUS_FLOW = ['ORDERED', 'BILLED', 'SAMPLE_COLLECTED', 'PROCESSING', 'RESULT_ENTERED', 'VERIFIED'];
const PRIORITY_BADGE = { ROUTINE: <Badge label="ROUTINE" status="ROUTINE" />, URGENT: <Badge label="URGENT" status="URGENT" />, STAT: <Badge label="STAT" status="STAT" /> };

export default function Lab() {
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState('orders');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [openOrder, setOpenOrder] = useState(null);
  const [showNew, setShowNew] = useState(false);

  const orders = useQuery({
    queryKey: ['lab-orders', { page, status }],
    queryFn: async ({ queryKey }) => (await api.get('/lab/orders', { params: queryKey[1] })).data,
  });
  const results = useQuery({ queryKey: ['lab-results'], queryFn: async () => (await api.get('/lab/results')).data?.data });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['lab-orders'] });
    qc.invalidateQueries({ queryKey: ['lab-results'] });
  };

  return (
    <div className="p-6">
      <PageHeader
        title="Laboratory"
        subtitle="Orders, sample collection, result entry and verification"
        actions={
          hasPermission('LAB_ORDER_CREATE') || hasPermission('DOCTOR_ORDER_CREATE') ? (
            <button className="btn-primary" onClick={() => setShowNew(true)}>
              <Plus className="h-4 w-4" /> New Order
            </button>
          ) : undefined
        }
      />

      <div className="mb-5 flex items-center gap-2 border-b border-ink-100">
        <TabButton active={tab === 'orders'} onClick={() => setTab('orders')} icon={TestTubes} label="Orders queue" />
        <TabButton active={tab === 'results'} onClick={() => setTab('results')} icon={ClipboardCheck} label="Results & reports" />
      </div>

      {tab === 'orders' && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
              <input
                className="input pl-9"
                placeholder="Order no, patient…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  const t = setTimeout(() => setDebounced(e.target.value), 400);
                  return () => clearTimeout(t);
                }}
              />
            </div>
            <select className="select max-w-[220px]" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">All statuses</option>
              {STATUS_FLOW.map((s) => <option key={s}>{s}</option>)}
            </select>
            <span className="text-xs text-ink-400">Drag a queue — {orders.data?.pagination?.total ?? 0} orders</span>
          </div>

          {openOrder && <OrderWorkbench orderId={openOrder} onClose={() => setOpenOrder(null)} onChanged={invalidateAll} />}

          <div className="card overflow-hidden">
            {orders.isLoading ? <LoadingState label="Loading lab orders…" /> : orders.error ? (
              <ErrorState message={apiError(orders.error)} />
            ) : !orders.data?.data?.length ? (
              <EmptyState title="No lab orders" hint="Orders placed by doctors appear here" />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Order No</th>
                    <th>Patient</th>
                    <th>Tests</th>
                    <th>Priority</th>
                    <th>Ordered</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {orders.data.data.map((o) => (
                    <tr key={o._id} className="cursor-pointer" onClick={() => setOpenOrder(o._id)}>
                      <td className="font-medium text-brand-700">{o.labOrderNumber}</td>
                      <td>
                        <div className="font-medium text-ink-900">
                          {o.patientId?.firstName} {o.patientId?.lastName}
                          {o.isCritical && <Flame className="ml-1.5 inline h-3.5 w-3.5 text-red-500" />}
                        </div>
                        <div className="text-xs text-ink-400">{o.patientId?.uhid}</div>
                      </td>
                      <td>
                        <div className="font-medium text-ink-700">{o.items?.length} tests</div>
                        <div className="max-w-[220px] truncate text-xs text-ink-400">{o.items?.map((i) => i.testName).join(', ')}</div>
                      </td>
                      <td>{PRIORITY_BADGE[o.priority] || badge(o.priority)}</td>
                      <td title={formatDateTime(o.orderedAt)}>
                        {formatDate(o.orderedAt)}
                        <div className="text-xs text-ink-400">by {o.orderedBy?.firstName} {o.orderedBy?.lastName}</div>
                      </td>
                      <td>{badge(o.status)}</td>
                      <td className="text-right">
                        <button className="btn-icon-primary" onClick={(e) => { e.stopPropagation(); setOpenOrder(o._id); }}>
                          <ArrowUpRight className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {orders.data?.pagination && <Pagination {...orders.data.pagination} onChange={(p) => setPage(p)} />}
          </div>
        </>
      )}

      {tab === 'results' && (
        <div className="card overflow-hidden">
          {results.isLoading ? <LoadingState /> : results.error ? (
            <ErrorState message={apiError(results.error)} />
          ) : !results?.length ? (
            <EmptyState title="No results recorded" hint="Entered and verified results appear here" />
          ) : (
            <ResultsTable rows={results} onVerify={invalidateAll} />
          )}
        </div>
      )}

      {showNew && <NewOrderModal onClose={() => setShowNew(false)} onDone={() => { setShowNew(false); invalidateAll(); }} />}
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors',
        active ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-800',
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function ResultFlag({ flag }) {
  const map = {
    NORMAL: <span className="text-emerald-600">N</span>,
    LOW: <span className="text-amber-600">L</span>,
    HIGH: <span className="text-amber-600">H</span>,
    CRITICAL_LOW: <span className="font-bold text-red-600">CL</span>,
    CRITICAL_HIGH: <span className="font-bold text-red-600">CH</span>,
  };
  return <span className="font-mono text-[11px] tracking-wide">{map[flag] || '—'}</span>;
}

function ResultsTable({ rows, onVerify }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Test</th>
          <th>Patient</th>
          <th>Values</th>
          <th>Status</th>
          <th>Entered</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r._id} className={cn(r.isCritical && 'bg-red-50/50')}>
            <td>
              <div className="font-medium text-ink-900">{r.testName}</div>
              <div className="text-xs text-ink-400">{r.labOrderId?.labOrderNumber}</div>
            </td>
            <td>
              <div className="font-medium">{r.patientId?.firstName} {r.patientId?.lastName}</div>
              <div className="text-xs text-ink-400">{r.patientId?.uhid}</div>
            </td>
            <td>
              {r.isCritical && <span className="mr-2 inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-600"><Flame className="h-3 w-3" /> CRITICAL</span>}
              <div className="flex max-w-md flex-wrap gap-x-3 gap-y-0.5">
                {r.values?.slice(0, 6).map((v) => (
                  <span key={v.parameter} className="text-xs text-ink-600">
                    {v.parameter} <span className="font-semibold text-ink-900">{v.value}</span> ({v.unit}) <ResultFlag flag={v.flag} />
                  </span>
                ))}
              </div>
            </td>
            <td>{badge(r.status)}</td>
            <td>{formatDate(r.enteredAt)}</td>
            <td>
              {r.status === 'ENTERED' && (
                <VerifyButton id={r._id} onVerify={onVerify} />
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function VerifyButton({ id, onVerify }) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: async () => (await api.post(`/lab/results/${id}/verify`)).data,
    onSuccess: () => { toast.success('Result verified'); onVerify(); },
    onError: (e) => toast.error(apiError(e)),
  });
  return (
    <button className="btn-success px-2.5 py-1 text-xs" onClick={() => mutation.mutate()}>
      {mutation.isPending ? <Spinner className="h-3.5 w-3.5 text-white" /> : 'Verify'}
    </button>
  );
}

function OrderWorkbench({ orderId, onClose, onChanged }) {
  const {
    data: order,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['lab-order', orderId],
    queryFn: async () => (await api.get(`/lab/orders/${orderId}`)).data.data,
  });

  return (
    <Modal onClose={onClose} wide>
      {isLoading ? <LoadingState label="Loading order…" /> : error ? (
        <ErrorState message={apiError(error)} />
      ) : (
        <div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-ink-900">{order.labOrderNumber}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-400">
                <Stethoscope className="h-4 w-4 text-brand-600" />
                <span className="font-semibold text-ink-900">{order.patientId?.firstName} {order.patientId?.lastName}</span>
                <span className="text-xs">UHID {order.patientId?.uhid}</span>
                <span className="text-xs">Ordered {formatDateTime(order.orderedAt)} by {order.orderedBy?.firstName}</span>
                {order.isCritical && <Badge label="CRITICAL" status="STAT" />}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {badge(order.status)}
              {order.priority && PRIORITY_BADGE[order.priority]}
            </div>
          </div>

          {order.clinicalNotes && (
            <div className="mt-4 rounded-lg bg-amber-50 p-3 text-[13px] text-amber-600 ring-1 ring-inset ring-amber-200">
              <span className="font-semibold">Clinical notes: </span>{order.clinicalNotes}
            </div>
          )}

          <div className="mt-4 space-y-2.5">
            {order.items?.map((it, idx) => (
              <div key={idx} className="rounded-xl border border-ink-100 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-semibold text-ink-900">
                      <TestTubes className="h-4 w-4 text-brand-600" /> {it.testName}
                    </div>
                    <div className="mt-0.5 text-xs text-ink-400">
                      ₹{it.price} · {badge(it.status)}
                    </div>
                  </div>
                  <ItemActions order={order} index={idx} test={it} onChanged={onChanged} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

function ItemActions({ order, index, test, onChanged }) {
  const qc = useQueryClient();
  const [enterOpen, setEnterOpen] = useState(false);

  const collect = useMutation({
    mutationFn: async () => (await api.post(`/lab/orders/${order._id}/items/${index}/collect`, {})).data,
    onSuccess: () => { toast.success('Sample collected'); onChanged(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const afterVerify = () => {
    setEnterOpen(false);
    onChanged();
  };

  return (
    <div className="flex items-center gap-2">
      {['ORDERED', 'BILLED'].includes(test.status) && (
        <button className="btn-secondary px-2.5 py-1 text-xs" disabled={collect.isPending} onClick={() => collect.mutate()}>
          {collect.isPending ? <Spinner className="h-3.5 w-3.5" /> : <TestTubes className="h-3.5 w-3.5" />} Collect
        </button>
      )}
      {['SAMPLE_COLLECTED', 'PROCESSING', 'RESULT_ENTERED'].includes(test.status) && (
        <button className="btn-primary px-2.5 py-1 text-xs" onClick={() => setEnterOpen(true)}>
          <ClipboardCheck className="h-3.5 w-3.5" /> {test.resultId ? 'Edit results' : 'Enter results'}
        </button>
      )}
      {test.resultId && ['SAMPLE_COLLECTED', 'PROCESSING', 'RESULT_ENTERED'].includes(test.status) && (
        <VerifyResult id={test.resultId} onDone={afterVerify} />
      )}
      {enterOpen && (
        <ResultEntryModal order={order} index={index} test={test} onClose={() => setEnterOpen(false)} onDone={afterVerify} />
      )}
    </div>
  );
}

function VerifyResult({ id, onDone }) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: async () => (await api.post(`/lab/results/${id}/verify`)).data,
    onSuccess: () => { toast.success('Result verified & reported'); onDone(); },
    onError: (e) => toast.error(apiError(e)),
  });
  return (
    <button className="btn-success px-2.5 py-1 text-xs" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
      {mutation.isPending ? <Spinner className="h-3.5 w-3.5 text-white" /> : 'Verify'}
    </button>
  );
}

function ResultEntryModal({ order, index, test, onClose, onDone }) {
  const params = test.labTestId?.parameters || [];
  const [values, setValues] = useState({});
  const [comments, setComments] = useState('');
  const [processing, setProcessing] = useState(false);

  const mutation = useMutation({
    mutationFn: async () =>
      (await api.post(`/lab/orders/${order._id}/items/${index}/results`, {
        values: params.map((p) => ({ parameter: p.name, value: values[p.name] || '' })),
        comments,
      })).data,
    onSuccess: () => { toast.success('Results entered'); onDone(); },
    onError: (e) => toast.error(apiError(e)),
  });

  if (!params.length) {
    return (
      <Modal onClose={onClose}>
        <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
        <p className="py-4 text-center text-sm text-ink-400">
          No result parameters configured for <span className="font-semibold text-ink-800">{test.testName}</span>.<br />
          Add parameters in the test catalogue first.
        </p>
        <button className="btn-primary w-full" onClick={onClose}>Close</button>
      </Modal>
    );
  }

  const missing = params.some((p) => !values[p.name]);
  const isCriticalSeverity = false;

  return (
    <Modal onClose={onClose} wide>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-ink-900">Enter results — {test.testName}</h3>
          <p className="text-xs text-ink-400">
            {order.patientId?.firstName} {order.patientId?.lastName} · {order.labOrderNumber}
          </p>
        </div>
        <FlaskConical className="h-6 w-6 text-brand-600" />
      </div>

      <div className="space-y-2">
        {params.map((p) => {
          const num = parseFloat(values[p.name]);
          const low = Number.isFinite(num) && Number.isFinite(p.normalRangeLow) && num < p.normalRangeLow;
          const high = Number.isFinite(num) && Number.isFinite(p.normalRangeHigh) && num > p.normalRangeHigh;
          return (
            <div key={p.name} className="rounded-lg border border-ink-100 px-3 py-2">
              <div className="mb-1 flex items-center justify-between">
                <label className="text-[13px] font-medium text-ink-700">{p.name}</label>
                <span className="text-[11px] text-ink-400">
                  {p.normalRange ? `Ref ${p.normalRange}` : 'No reference range'}{p.unit ? ` · ${p.unit}` : ''}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  className={cn('input !py-1.5 font-mono', low || high ? '!border-amber-400 !ring-2 !ring-amber-400/30' : '')}
                  placeholder="Value"
                  value={values[p.name] || ''}
                  onChange={(e) => setValues((v) => ({ ...v, [p.name]: e.target.value }))}
                />
                {(low || high) && (
                  <span className="text-[11px] font-semibold text-amber-600">
                    {low ? 'Below reference' : 'Above reference'}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3">
        <label className="label">Comments / remarks</label>
        <textarea className="input min-h-[64px]" placeholder="Hemolysis, dilution, notes…" value={comments} onChange={(e) => setComments(e.target.value)} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-3">
        <div className="flex items-center gap-1.5 text-xs text-ink-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          Out-of-range values are auto-flagged; critical values page the doctor and raise a critical notification.
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className={cn('btn-primary')}
            disabled={mutation.isPending || missing}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? <Spinner className="h-4 w-4 text-white" /> : 'Save results'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function NewOrderModal({ onClose, onDone }) {
  const [patientId, setPatientId] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [priority, setPriority] = useState('ROUTINE');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [selected, setSelected] = useState([]);
  const [payment, setPayment] = useState(null);
  const [processing, setProcessing] = useState(false);

  const { data: patients } = useQuery({
    queryKey: ['lab-patients'],
    queryFn: async () => (await api.get('/patients', { params: { limit: 100 } })).data.data,
  });
  const { data: doctors } = useQuery({
    queryKey: ['lab-doctors'],
    queryFn: async () => (await api.get('/doctors', { params: { limit: 100 } })).data.data,
  });
  const { data: tests } = useQuery({
    queryKey: ['lab-tests'],
    queryFn: async () => (await api.get('/lab/tests', { params: { limit: 100 } })).data?.data,
  });

  const submit = async () => {
    if (!patientId) return toast.error('Select a patient');
    if (!selected.length) return toast.error('Select at least one test');
    setProcessing(true);
    try {
      const payload = {
        patientId,
        doctorId: doctorId || undefined,
        priority,
        clinicalNotes: clinicalNotes || undefined,
        items: selected.map((id) => ({ labTestId: id })),
      };
      if (payment) payload.payment = payment;
      if (payment?.skipBilling) payload.skipBilling = true;
      const res = await api.post('/lab/orders', payload);
      toast.success(`Lab order ${res.data.data.labOrderNumber} created`);
      onDone();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Modal onClose={onClose} wide>
      <h2 className="text-lg font-bold text-ink-900">New Lab Order</h2>
      <p className="mb-4 text-xs text-ink-400">
        Auto-generates a LAB bill for the tests selected. Payment collection can be deferred to the Billing desk.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Patient *</label>
          <select className="select" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
            <option value="">Select patient…</option>
            {patients?.map((p) => <option key={p._id} value={p._id}>{p.uhid} · {p.firstName} {p.lastName}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Referring doctor</label>
          <select className="select" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
            <option value="">— Not specified —</option>
            {doctors?.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Priority</label>
          <select className="select" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="ROUTINE">ROUTINE</option>
            <option value="URGENT">URGENT</option>
            <option value="STAT">STAT</option>
          </select>
        </div>
        <div>
          <label className="label">Clinical notes</label>
          <input className="input" placeholder="Chief complaint, fasting…" value={clinicalNotes} onChange={(e) => setClinicalNotes(e.target.value)} />
        </div>
      </div>

      <div className="mt-4">
        <label className="label">Select tests *</label>
        <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-ink-100 p-1.5">
          {tests?.length ? tests.map((t) => (
            <label key={t._id} className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-ink-50">
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                  checked={selected.includes(t._id)}
                  onChange={(e) => setSelected((s) => (e.target.checked ? [...s, t._id] : s.filter((x) => x !== t._id)))}
                />
                <span className="font-medium text-ink-700">{t.name}</span>
              </span>
              <span className="text-xs text-ink-400">{t.code} · ₹{t.price}</span>
            </label>
          )) : <div className="px-2 py-4 text-center text-xs text-ink-400">No tests configured — add tests in the catalogue.</div>}
        </div>
        <div className="mt-2 text-xs text-ink-400">
          {selected.length} selected · <span className="font-semibold text-ink-800">₹{tests?.filter((t) => selected.includes(t._id)).reduce((s, t) => s + (t.price || 0), 0)}</span>
        </div>
      </div>

      <div className="mt-4 space-y-2 rounded-lg bg-ink-50 p-3">
        <label className="flex items-center gap-2 text-sm text-ink-600">
          <input type="checkbox" className="h-4 w-4 rounded border-ink-300 text-brand-600" checked={!!payment} onChange={(e) => setPayment(e.target.checked ? { mode: 'CASH' } : null)} />
          Collect payment now
        </label>
        {payment && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-ink-400">Mode</label>
            <select className="select !w-auto" value={payment.mode} onChange={(e) => setPayment((p) => ({ ...p, mode: e.target.value }))}>
              {['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'WALLET', 'CHEQUE', 'INSURANCE'].map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="mt-4 flex justify-end gap-2 border-t border-ink-100 pt-3">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={processing || !patientId || !selected.length} onClick={submit}>
          {processing ? <Spinner className="h-4 w-4 text-white" /> : 'Create Lab Order'}
        </button>
      </div>
    </Modal>
  );
}

function Modal({ children, onClose, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/60 p-4 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className={cn('card my-8 w-full animate-slide-up p-6', wide ? 'max-w-2xl' : 'max-w-sm')}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="btn-icon float-right -mr-1 -mt-1">
          <X className="h-5 w-5" />
        </button>
        {children}
      </div>
    </div>
  );
}