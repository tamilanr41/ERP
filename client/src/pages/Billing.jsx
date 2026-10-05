import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, X, Receipt, ArrowUpRight, User, Wallet, Printer, Ban, RotateCcw, Search, FileText, Hospital } from 'lucide-react';
import api, { apiError } from '../lib/api';
import PageHeader from '../components/ui/PageHeader';
import Pagination from '../components/ui/Pagination';
import { LoadingState, ErrorState, EmptyState, Spinner } from '../components/ui/Feedback';
import { formatDate, formatDateTime, formatCurrency, cn } from '../lib/utils';
import { badge } from '../components/ui/Badge.jsx';
import PaymentReceipt, { useHospital } from '../components/ui/PaymentReceipt.jsx';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const SERVICE_TYPES = [
  { label: 'Registration Fee', code: 'REG', itemType: 'SERVICE' },
  { label: 'Consultation Fee', code: 'CON', itemType: 'CONSULTATION' },
  { label: 'Procedure', code: 'PROC', itemType: 'PROCEDURE' },
  { label: 'Injection', code: 'INJ', itemType: 'SERVICE' },
  { label: 'Dressing', code: 'DRS', itemType: 'PROCEDURE' },
  { label: 'ECG', code: 'ECG', itemType: 'SERVICE' },
  { label: 'Investigation', code: 'INV', itemType: 'TEST' },
  { label: 'Other Services', code: 'OTH', itemType: 'MISCELLANEOUS' },
  { label: 'Additional Services', code: 'ADD', itemType: 'SERVICE' },
];

const PAYMENT_MODES = ['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'WALLET', 'CHEQUE', 'INSURANCE', 'CREDIT', 'SPONSOR'];
const REFUND_MODES = ['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'WALLET', 'CHEQUE'];
const MODE_LABEL = {
  CASH: 'Cash', CARD: 'Card', UPI: 'UPI', BANK_TRANSFER: 'Bank Transfer', WALLET: 'Wallet',
  CHEQUE: 'Cheque', INSURANCE: 'Insurance', CREDIT: 'Credit', SPONSOR: 'Sponsor',
};
const BILL_STATUSES = ['DRAFT', 'PENDING', 'FINAL', 'PARTIALLY_PAID', 'PAID', 'OVERPAID', 'REFUNDED', 'CANCELLED'];

const computeItem = (it) => {
  const qty = Math.max(Number(it.quantity) || 0, 0);
  const rate = Number(it.rate) || 0;
  const lineGross = qty * rate;
  const discountAmount = round2((lineGross * (Number(it.discountPct) || 0)) / 100);
  const taxable = lineGross - discountAmount;
  const gstAmount = round2((taxable * (Number(it.gstPct) || 0)) / 100);
  return { ...it, qty, lineGross, discountAmount, taxable, gstAmount, total: round2(taxable + gstAmount) };
};

const sumItems = (items) =>
  items.reduce(
    (acc, it) => ({ gross: acc.gross + it.lineGross, discount: acc.discount + it.discountAmount, tax: acc.tax + it.gstAmount, net: acc.net + it.total }),
    { gross: 0, discount: 0, tax: 0, net: 0 },
  );

export default function Billing() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [payBill, setPayBill] = useState(null);
  const [openBill, setOpenBill] = useState(null);

  const bills = useQuery({
    queryKey: ['bills', { page, status }],
    queryFn: async ({ queryKey }) => (await api.get('/billing', { params: queryKey[1] })).data,
  });

  const outstanding = useQuery({
    queryKey: ['outstanding'],
    queryFn: async () => (await api.get('/billing/outstanding')).data,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['bills'] });
    qc.invalidateQueries({ queryKey: ['outstanding'] });
    qc.invalidateQueries({ queryKey: ['collection'] });
  };

  return (
    <div className="p-6">
      <PageHeader
        title="OP Billing"
        subtitle="Bill entry, collection, receipts, refunds and outstanding tracking"
        actions={
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> New OP Bill
          </button>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600"><Wallet className="h-5 w-5" /></div>
          <div><div className="text-sm text-ink-500">Total Outstanding</div><div className="text-xl font-bold text-red-600">{formatCurrency(outstanding.data?.totalOutstanding)}</div></div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><Receipt className="h-5 w-5" /></div>
          <div><div className="text-sm text-ink-500">Bills with outstanding</div><div className="text-xl font-bold text-ink-900">{outstanding.data?.count ?? 0}</div></div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><FileText className="h-5 w-5" /></div>
          <div><div className="text-sm text-ink-500">Bills in view</div><div className="text-xl font-bold text-ink-900">{bills.data?.pagination?.total ?? 0}</div></div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select className="select max-w-[220px]" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          {BILL_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <span className="text-xs text-ink-400">Click a bill to open breakdown, payments, receipts, cancel or refund.</span>
      </div>

      {showCreate && <CreateBillModal onClose={() => setShowCreate(false)} onDone={(billId) => { setShowCreate(false); invalidate(); setOpenBill(billId); }} />}
      {payBill && <PayModal bill={payBill} onClose={() => setPayBill(null)} onDone={() => { setPayBill(null); invalidate(); qc.invalidateQueries({ queryKey: ['bill-detail'] }); }} />}
      {openBill && <BillDetail billId={openBill} onClose={() => setOpenBill(null)} onPaid={() => { invalidate(); }} />}

      <div className="card overflow-hidden">
        {bills.isLoading ? <LoadingState /> : bills.error ? <ErrorState message={apiError(bills.error)} /> : !bills.data?.data?.length ? (
          <EmptyState title="No bills yet" hint="Create an OP bill to start recording charges and collection" />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Bill No</th>
                <th>Patient</th>
                <th>OP No</th>
                <th>Date</th>
                <th className="text-right">Net</th>
                <th className="text-right">Paid</th>
                <th className="text-right">Due</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {bills.data.data.map((b) => (
                <tr key={b._id} className="cursor-pointer" onClick={() => setOpenBill(b._id)}>
                  <td className="font-medium text-brand-700">{b.billNumber}</td>
                  <td>
                    <div className="font-medium text-ink-900">{b.patientName || (b.patientId?.firstName + ' ' + (b.patientId?.lastName || ''))}</div>
                    <div className="text-xs text-ink-400">{b.patientUHID || b.patientId?.uhid}</div>
                  </td>
                  <td className="text-xs text-ink-500">{b.opdVisitId ? (typeof b.opdVisitId === 'object' ? b.opdVisitId.opdNumber : '') : '—'}</td>
                  <td>{formatDate(b.billDate)}</td>
                  <td className="text-right font-medium tabular-nums">{formatCurrency(b.netTotal)}</td>
                  <td className="text-right tabular-nums">{formatCurrency(b.paidAmount)}</td>
                  <td className={cn('text-right font-medium tabular-nums', b.dueAmount > 0 ? 'text-red-600' : 'text-emerald-600')}>{formatCurrency(b.dueAmount)}</td>
                  <td>{badge(b.status)}</td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      {['FINAL', 'PENDING', 'PARTIALLY_PAID'].includes(b.status) && b.dueAmount > 0 && (
                        <button className="btn-secondary px-2 py-1 text-xs" onClick={(e) => { e.stopPropagation(); setPayBill(b); }}>
                          <Receipt className="h-3 w-3" /> Collect
                        </button>
                      )}
                      <button className="btn-icon-primary" onClick={(e) => { e.stopPropagation(); setOpenBill(b._id); }}>
                        <ArrowUpRight className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {bills.data?.pagination && <Pagination {...bills.data.pagination} page={bills.data.pagination.page} onChange={setPage} />}
      </div>
    </div>
  );
}

function CreateBillModal({ onClose, onDone }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [patientId, setPatientId] = useState('');
  const [opdVisitId, setOpdVisitId] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [deptId, setDeptId] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [deptName, setDeptName] = useState('');
  const [items, setItems] = useState([
    { type: SERVICE_TYPES[0], name: SERVICE_TYPES[0].label, quantity: 1, rate: 0, discountPct: 0, gstPct: 0 },
  ]);
  const [collectMode, setCollectMode] = useState('NONE');
  const [mode, setMode] = useState('CASH');
  const [refNumber, setRefNumber] = useState('');
  const [payAmountOpen, setPayAmountOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQ(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const patients = useQuery({
    queryKey: ['billing-patients', q],
    queryFn: async () => (await api.get('/patients', { params: q ? { search: q, limit: 20 } : { limit: 100 } })).data.data,
    keepPreviousData: true,
  });

  const visits = useQuery({
    queryKey: ['billing-visits', patientId],
    queryFn: async () => (await api.get('/opd/visits', { params: { patientId, limit: 15 } })).data.data,
    enabled: !!patientId,
  });

  const mutation = useMutation({
    mutationFn: async (payload) => (await api.post('/billing', payload)).data.data,
    onSuccess: (bill) => {
      toast.success(`Bill ${bill.billNumber} created`);
      qc.invalidateQueries({ queryKey: ['bills'] });
      qc.invalidateQueries({ queryKey: ['outstanding'] });
      onDone(bill._id);
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const setItem = (idx, key, val) => setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [key]: val } : it)));

  const setType = (idx, type) =>
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, type, name: type.label } : it)),
    );

  const rows = items.map(computeItem);
  const totals = sumItems(rows);
  const cleanItems = rows.filter((it) => it.name && it.lineGross > 0);
  const dueCap = totals.net;

  const submit = (collecting) => {
    if (!patientId) return toast.error('Select a patient');
    if (!cleanItems.length) return toast.error('Add at least one line item with a valid qty × rate');
    let payment;
    if (collecting && collectMode !== 'NONE') {
      const amount = Number((document.getElementById('collect-amount') || {}).value);
      if (!amount || amount <= 0) return toast.error('Enter a valid payment amount');
      if (amount > dueCap + 0.01) return toast.error(`Payment cannot exceed the net total of ${formatCurrency(dueCap)}`);
      payment = { amount: round2(amount), mode, referenceNumber: refNumber };
    }
    const payload = {
      patientId,
      billType: 'OPD',
      opdVisitId: opdVisitId || undefined,
      doctorId: doctorId || undefined,
      departmentId: deptId || undefined,
      status: payment ? undefined : 'PENDING',
      items: cleanItems.map((it) => ({
        itemType: it.type.itemType,
        name: it.name,
        code: it.type.code,
        description: it.type.label,
        quantity: it.qty,
        rate: it.rate,
        discountPct: Number(it.discountPct) || 0,
        gstPct: Number(it.gstPct) || 0,
      })),
    };
    if (payment) payload.payment = payment;
    mutation.mutate(payload);
  };

  return (
    <Modal onClose={onClose} wide>
      <h2 className="mb-1 text-lg font-bold text-ink-900">New OP Bill</h2>
      <p className="mb-4 text-xs text-ink-400">Bill header, itemized charges and optional collection. Bills saved without payment stay PENDING.</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className="label">Patient *</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input className="input pl-8" placeholder="Search name or UHID…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="select mt-2" value={patientId} onChange={(e) => { setPatientId(e.target.value); setOpdVisitId(''); setDoctorName(''); setDeptName(''); }}>
            <option value="">Select…</option>
            {(patients.data || []).map((p) => <option key={p._id} value={p._id}>{p.uhid} · {p.firstName} {p.lastName || ''}</option>)}
          </select>
        </div>
        <div>
          <label className="label">OP Visit</label>
          <select className="select" value={opdVisitId} disabled={!patientId} onChange={(e) => {
            const v = e.target.value;
            setOpdVisitId(v);
            const visit = (visits.data || []).find((x) => x._id === v);
            setDoctorId(visit?.doctorId?._id || '');
            setDoctorName(visit?.doctorId?.name || '');
            setDeptId(visit?.departmentId?._id || '');
            setDeptName(visit?.departmentId?.name || '');
          }}>
            <option value="">— Walk-in / none —</option>
            {(visits.data || []).map((v) => (
              <option key={v._id} value={v._id}>{v.opdNumber}{v.doctorId?.name ? ` · Dr. ${v.doctorId.name}` : ''}</option>
            ))}
          </select>
          <div className="mt-2 text-xs text-ink-500">
            {doctorName && <div className="mb-0.5 flex items-center gap-1"><User className="h-3 w-3 text-ink-400" /> Doctor: {doctorName}</div>}
            {deptName && <div className="flex items-center gap-1"><Hospital className="h-3 w-3 text-ink-400" /> Department: {deptName}</div>}
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-ink-100">
        <table className="table">
          <thead>
            <tr>
              <th>Service</th>
              <th className="w-[70px]">Code</th>
              <th className="w-[64px] text-right">Qty</th>
              <th className="w-[96px] text-right">Rate ₹</th>
              <th className="w-[84px] text-right">Disc %</th>
              <th className="w-[80px] text-right">GST %</th>
              <th className="w-[100px] text-right">Net</th>
              <th className="w-[36px]" />
            </tr>
          </thead>
          <tbody>
            {rows.map((it, idx) => (
              <tr key={idx} className="align-middle">
                <td>
                  <select className="input h-8 py-0 text-xs" value={it.type.code} onChange={(e) => setType(idx, SERVICE_TYPES.find((t) => t.code === e.target.value))}>
                    {SERVICE_TYPES.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
                  </select>
                </td>
                <td className="font-mono text-xs text-ink-500">{it.type.code}</td>
                <td><input type="number" min="1" className="input h-8 py-0 text-right text-xs" value={it.quantity} onChange={(e) => setItem(idx, 'quantity', e.target.value)} /></td>
                <td><input type="number" min="0" className="input h-8 py-0 text-right text-xs" value={it.rate} onChange={(e) => setItem(idx, 'rate', e.target.value)} /></td>
                <td><input type="number" min="0" max="100" className="input h-8 py-0 text-right text-xs" value={it.discountPct} onChange={(e) => setItem(idx, 'discountPct', e.target.value)} /></td>
                <td><input type="number" min="0" max="100" className="input h-8 py-0 text-right text-xs" value={it.gstPct} onChange={(e) => setItem(idx, 'gstPct', e.target.value)} /></td>
                <td className="text-right font-medium tabular-nums text-sm">{formatCurrency(it.total)}</td>
                <td>
                  <button className="text-ink-300 hover:text-red-600" onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}>
                    <X className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t border-ink-100 px-3 py-2">
          <button className="text-xs font-semibold text-brand-600 hover:underline" onClick={() => setItems((p) => [...p, { type: SERVICE_TYPES[0], name: SERVICE_TYPES[0].label, quantity: 1, rate: 0, discountPct: 0, gstPct: 0 }])}>
            <Plus className="mr-1 inline h-3 w-3" /> Add service
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg border border-ink-100 px-3 py-2 text-center">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Gross</div>
          <div className="text-sm font-semibold tabular-nums">{formatCurrency(totals.gross)}</div>
        </div>
        <div className="rounded-lg border border-ink-100 px-3 py-2 text-center">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Discount</div>
          <div className="text-sm font-semibold tabular-nums text-red-600">−{formatCurrency(totals.discount)}</div>
        </div>
        <div className="rounded-lg border border-ink-100 px-3 py-2 text-center">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Tax</div>
          <div className="text-sm font-semibold tabular-nums text-amber-600">+{formatCurrency(totals.tax)}</div>
        </div>
        <div className="rounded-lg bg-brand-50 px-3 py-2 text-center ring-1 ring-brand-100">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-600">Net</div>
          <div className="text-sm font-bold tabular-nums text-brand-800">{formatCurrency(totals.net)}</div>
        </div>
      </div>

      <div className="mt-4 space-y-3 border-t border-ink-100 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-ink-700">Collect payment?</span>
          {['NONE', 'NOW'].map((c) => (
            <button
              key={c}
              className={cn('rounded-full px-3 py-1 text-xs font-semibold', collectMode === c ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200')}
              onClick={() => setCollectMode(c)}
            >
              {c === 'NONE' ? 'Save without payment' : 'Collect now'}
            </button>
          ))}
        </div>
        {collectMode === 'NOW' && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div>
              <label className="label">Mode</label>
              <select className="select" value={mode} onChange={(e) => setMode(e.target.value)}>
                {PAYMENT_MODES.map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Amount (max {formatCurrency(dueCap)})</label>
              <input id="collect-amount" type="number" min="0" step="0.01" className="input" defaultValue={dueCap.toFixed(2)} />
            </div>
            <div>
              <label className="label">Reference</label>
              <input className="input" placeholder="Txn / cheque no." value={refNumber} onChange={(e) => setRefNumber(e.target.value)} />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-xs text-ink-500">
                <input type="checkbox" checked={payAmountOpen} onChange={(e) => setPayAmountOpen(e.target.checked)} className="h-4 w-4 rounded border-ink-300 text-brand-600" />
                Overpay
              </label>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-ink-100 pt-4">
        <span className="mr-auto text-sm text-ink-500">Net payable: <b className="text-ink-900">{formatCurrency(totals.net)}</b></span>
        <button className="btn-secondary" disabled={mutation.isPending} onClick={() => submit(false)}>
          {mutation.isPending ? <Spinner className="h-4 w-4" /> : <FileText className="h-4 w-4" />} Save Bill
        </button>
        <button className="btn-primary" disabled={mutation.isPending} onClick={() => submit(true)}>
          {mutation.isPending ? <Spinner className="h-4 w-4 text-white" /> : <Receipt className="h-4 w-4" />} Create {collectMode === 'NOW' ? '& Collect' : 'Bill'}
        </button>
      </div>
    </Modal>
  );
}

function BillDetail({ billId, onClose, onPaid }) {
  const qc = useQueryClient();
  const [payOpen, setPayOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [showDoc, setShowDoc] = useState(false);
  const [receiptPayment, setReceiptPayment] = useState(null);

  const detail = useQuery({
    queryKey: ['bill-detail', billId],
    queryFn: async () => (await api.get(`/billing/${billId}`)).data.data,
  });

  if (detail.isLoading) return <Modal onClose={onClose} wide><LoadingState label="Loading bill…" /></Modal>;
  if (detail.error) return <Modal onClose={onClose} wide><ErrorState message={apiError(detail.error)} /></Modal>;

  const b = detail.data;
  const hasPayments = (b.payments || []).length > 0;
  const canCancel = ['DRAFT', 'PENDING', 'FINAL', 'PARTIALLY_PAID'].includes(b.status) && (b.paidAmount || 0) <= 0.01;
  const canRefund = (b.paidAmount || 0) > 0.01 && b.status !== 'CANCELLED' && b.status !== 'REFUNDED';
  const dueOk = ['FINAL', 'PENDING', 'PARTIALLY_PAID'].includes(b.status) && b.dueAmount > 0;

  const refresh = () => qc.invalidateQueries({ queryKey: ['bill-detail', billId] });

  return (
    <Modal onClose={onClose} wide>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-ink-900">{b.billNumber}</h2>
            {badge(b.status)}
            {badge(b.billType)}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-500">
            <span>{formatDateTime(b.billDate)}</span>
            {b.opdVisitId?.opdNumber && <span>OP {b.opdVisitId.opdNumber}</span>}
            {b.doctorId?.name && <span>Dr. {b.doctorId.name}</span>}
            {b.departmentId?.name && <span>{b.departmentId.name}</span>}
            {b.createdBy?.firstName && <span>By {b.createdBy.firstName} {b.createdBy.lastName || ''}</span>}
            {b.cancelledReason && <span className="text-red-600">Cancelled: {b.cancelledReason}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {dueOk && (
            <button className="btn-primary text-xs" onClick={() => setPayOpen(true)}>
              <Receipt className="h-4 w-4" /> Collect {formatCurrency(b.dueAmount)}
            </button>
          )}
          <button className="btn-secondary text-xs" onClick={() => { setShowDoc(true); setTimeout(() => window.print(), 150); }}>
            <Printer className="h-4 w-4" /> Print Bill
          </button>
          {canRefund && (
            <button className="btn-secondary text-xs" onClick={() => setRefundOpen(true)}>
              <RotateCcw className="h-4 w-4" /> Refund
            </button>
          )}
          {canCancel && (
            <button className="btn-danger px-3 py-1.5 text-xs" onClick={() => setCancelOpen(true)}>
              <Ban className="h-4 w-4" /> Cancel Bill
            </button>
          )}
        </div>
      </div>

      {b.cancelledReason && (
        <div className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          Bill cancelled{b.cancelledBy?.firstName ? ` by ${b.cancelledBy.firstName}` : ''}: {b.cancelledReason || 'no reason given'}
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-ink-100 px-3 py-2">
          <div className="text-[11px] font-medium uppercase tracking-wide text-ink-400">Patient</div>
          <div className="truncate text-sm font-semibold text-ink-800">{b.patientId?.firstName} {b.patientId?.lastName || ''}</div>
          <div className="font-mono text-xs text-ink-400">UHID {b.patientId?.uhid}</div>
        </div>
        <div className="rounded-lg border border-ink-100 px-3 py-2">
          <div className="text-[11px] font-medium uppercase tracking-wide text-ink-400">Gross total</div>
          <div className="text-sm font-semibold text-ink-800">{formatCurrency(b.grossTotal)}</div>
        </div>
        <div className="rounded-lg border border-ink-100 px-3 py-2">
          <div className="text-[11px] font-medium uppercase tracking-wide text-ink-400">Discount / Tax</div>
          <div className="text-sm font-semibold text-ink-800">{formatCurrency(b.discount)} / {formatCurrency(b.tax)}</div>
        </div>
        <div className="rounded-lg bg-ink-50 px-3 py-2">
          <div className="text-[11px] font-medium uppercase tracking-wide text-ink-400">Net · Paid · Due</div>
          <div className="text-sm font-semibold text-ink-800">{formatCurrency(b.netTotal)} · {formatCurrency(b.paidAmount)} · <span className={b.dueAmount > 0 ? 'text-red-600' : 'text-emerald-600'}>{formatCurrency(b.dueAmount)}</span></div>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-ink-100">
        <table className="table">
          <thead>
            <tr>
              <th>Service</th>
              <th className="w-[70px]">Code</th>
              <th className="w-[64px] text-right">Qty</th>
              <th className="w-[96px] text-right">Rate</th>
              <th className="w-[84px] text-right">Disc.</th>
              <th className="w-[80px] text-right">GST</th>
              <th className="w-[100px] text-right">Net Amt</th>
            </tr>
          </thead>
          <tbody>
            {(b.items || []).map((it, i) => (
              <tr key={i}>
                <td className="font-medium text-ink-900">
                  {it.name}
                  {it.description && it.description !== it.name && <div className="text-xs font-normal text-ink-400">{it.description}</div>}
                </td>
                <td className="font-mono text-xs text-ink-500">{it.code || '—'}</td>
                <td className="text-right tabular-nums">{it.quantity}</td>
                <td className="text-right tabular-nums">{formatCurrency(it.rate)}</td>
                <td className="text-right tabular-nums">{it.discountAmount ? formatCurrency(it.discountAmount) : '—'}</td>
                <td className="text-right tabular-nums">{it.gstPct ? `${it.gstPct}%` : '—'}</td>
                <td className="text-right font-medium tabular-nums">{formatCurrency(it.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap justify-between gap-3">
        <div className="space-y-1 text-sm">
          <div className="flex gap-4"><span className="w-24 text-ink-400">Gross</span><b>{formatCurrency(b.grossTotal)}</b></div>
          <div className="flex gap-4"><span className="w-24 text-ink-400">Discount</span><b>−{formatCurrency(b.discount)}</b></div>
          <div className="flex gap-4"><span className="w-24 text-ink-400">Tax</span><b>+{formatCurrency(b.tax)}</b></div>
          <div className="flex gap-4"><span className="w-24 text-ink-400">Net total</span><b className="text-ink-900">{formatCurrency(b.netTotal)}</b></div>
          <div className="flex gap-4"><span className="w-24 text-ink-400">Paid</span><b className="text-emerald-600">{formatCurrency(b.paidAmount)}</b></div>
          <div className="flex gap-4"><span className="w-24 text-ink-400">Due</span><b className={b.dueAmount > 0 ? 'text-red-600' : 'text-emerald-600'}>{formatCurrency(b.dueAmount)}</b></div>
        </div>
        {hasPayments && (
          <div className="min-w-[280px]">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-ink-400">Payment history</span>
              {canRefund && <button className="text-[11px] font-semibold text-brand-600 hover:underline" onClick={() => setRefundOpen(true)}>Refund a payment</button>}
            </div>
            <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
              {b.payments.map((p) => (
                <div key={p._id} className="flex items-center justify-between rounded-lg border border-ink-100 px-3 py-1.5 text-sm">
                  <div>
                    <span className="font-medium text-ink-800">{formatCurrency(p.amount)}</span>
                    <span className="ml-2 text-xs text-ink-400">{MODE_LABEL[p.mode] || p.mode}</span>
                  </div>
                  <div className="flex items-center gap-2 text-right">
                    <button
                      className="text-[10px] font-semibold text-brand-600 hover:underline print:hidden"
                      onClick={() => setReceiptPayment({ payment: p, bill: b })}
                    >
                      Receipt
                    </button>
                    <div>
                      <div className="text-xs text-ink-400">{formatDate(p.paidAt)}</div>
                      <div className="font-mono text-[10px] text-ink-400">{p.receiptNumber || p.transactionId}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {payOpen && (
        <PayModal
          bill={b}
          onClose={() => setPayOpen(false)}
          onDone={() => { setPayOpen(false); refresh(); onPaid(); }}
        />
      )}
      {refundOpen && (
        <RefundModal
          bill={b}
          onClose={() => setRefundOpen(false)}
          onDone={() => { setRefundOpen(false); refresh(); onPaid(); }}
        />
      )}
      {cancelOpen && (
        <CancelModal
          bill={b}
          onClose={() => setCancelOpen(false)}
          onDone={() => { setCancelOpen(false); refresh(); onPaid(); }}
        />
      )}
      {receiptPayment && (
        <Modal onClose={() => setReceiptPayment(null)}>
          <PaymentReceipt {...receiptPayment} />
        </Modal>
      )}
      {showDoc && <BillDoc bill={b} />}
    </Modal>
  );
}

function PayModal({ bill, onClose, onDone }) {
  const [amount, setAmount] = useState(bill.dueAmount || 0);
  const [mode, setMode] = useState('CASH');
  const [refNumber, setRefNumber] = useState('');
  const mutation = useMutation({
    mutationFn: async () => (await api.post('/billing/payments', { billId: bill._id, amount: Number(amount), mode, referenceNumber: refNumber })).data.data,
    onSuccess: () => { toast.success(`Payment of ${formatCurrency(Number(amount))} recorded`); onDone(); },
    onError: (e) => toast.error(apiError(e)),
  });
  return (
    <Modal onClose={onClose}>
      <h2 className="mb-1 text-lg font-bold text-ink-900">Collect Payment</h2>
      <p className="mb-4 text-sm text-ink-400">
        Bill <span className="font-medium text-ink-800">{bill.billNumber}</span> · due {formatCurrency(bill.dueAmount)}
      </p>
      <div className="space-y-4">
        <div>
          <label className="label">Amount (max {formatCurrency(bill.dueAmount)})</label>
          <input type="number" min="0" step="0.01" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
          {Number(amount) > bill.dueAmount + 0.01 && <p className="mt-1 text-xs text-red-600">Payment cannot exceed the due amount.</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Mode</label>
            <select className="select" value={mode} onChange={(e) => setMode(e.target.value)}>
              {PAYMENT_MODES.map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Reference</label>
            <input className="input" placeholder="Txn / cheque / UPI id" value={refNumber} onChange={(e) => setRefNumber(e.target.value)} />
          </div>
        </div>
        <button
          className="btn-primary w-full"
          disabled={mutation.isPending || !amount || Number(amount) <= 0 || Number(amount) > bill.dueAmount + 0.01}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? <Spinner className="h-4 w-4 text-white" /> : 'Confirm & Print Receipt'}
        </button>
      </div>
    </Modal>
  );
}

function RefundModal({ bill, onClose, onDone }) {
  const [paymentId, setPaymentId] = useState('');
  const [amount, setAmount] = useState((bill.paidAmount || 0).toFixed(2));
  const [refundedVia, setRefundedVia] = useState('CASH');
  const [reason, setReason] = useState('');

  const payments = (bill.payments || []).filter((p) => p.status !== 'CANCELLED');
  const maxRefund = Number(bill.paidAmount || 0);

  const mutation = useMutation({
    mutationFn: async () => (await api.post('/billing/refunds', { billId: bill._id, paymentId: paymentId || undefined, amount: Number(amount), reason, refundedVia })).data.data,
    onSuccess: (res) => {
      toast.success(`Refund of ${formatCurrency(Number(amount))} processed`);
      onDone(res.bill);
    },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <Modal onClose={onClose}>
      <h2 className="mb-1 text-lg font-bold text-ink-900">Process Refund</h2>
      <p className="mb-4 text-sm text-ink-400">
        Bill <span className="font-medium text-ink-800">{bill.billNumber}</span> · amount collected {formatCurrency(bill.paidAmount)}
      </p>
      <div className="space-y-4">
        <div>
          <label className="label">Refund against payment</label>
          <select className="select" value={paymentId} onChange={(e) => setPaymentId(e.target.value)}>
            <option value="">Bill (any payment)</option>
            {payments.map((p) => <option key={p._id} value={p._id}>{p.receiptNumber || p.transactionId} · {formatCurrency(p.amount)} · {MODE_LABEL[p.mode] || p.mode}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Refund amount (max {formatCurrency(maxRefund)})</label>
            <input type="number" min="0" step="0.01" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="label">Refunded via</label>
            <select className="select" value={refundedVia} onChange={(e) => setRefundedVia(e.target.value)}>
              {REFUND_MODES.map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="label">Reason *</label>
          <textarea className="input" rows={2} placeholder="Reason for refund" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <button
          className="btn-primary w-full"
          disabled={mutation.isPending || !reason || !amount || Number(amount) <= 0 || Number(amount) > maxRefund + 0.01}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? <Spinner className="h-4 w-4 text-white" /> : 'Confirm Refund'}
        </button>
      </div>
    </Modal>
  );
}

function CancelModal({ bill, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const mutation = useMutation({
    mutationFn: async () => (await api.patch(`/billing/${bill._id}/cancel`, { reason })).data.data,
    onSuccess: () => { toast.success(`Bill ${bill.billNumber} cancelled`); onDone(); },
    onError: (e) => toast.error(apiError(e)),
  });
  return (
    <Modal onClose={onClose}>
      <h2 className="mb-1 text-lg font-bold text-ink-900">Cancel Bill</h2>
      <p className="mb-4 text-sm text-ink-400">Bill <span className="font-medium text-ink-800">{bill.billNumber}</span> will be marked CANCELLED and kept in audit history.</p>
      <div className="space-y-4">
        <div>
          <label className="label">Reason</label>
          <textarea className="input" rows={2} placeholder="Why is this bill being cancelled?" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <button className="btn-danger w-full" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? <Spinner className="h-4 w-4" /> : <Ban className="h-4 w-4" />} Confirm Cancellation
        </button>
      </div>
    </Modal>
  );
}

function BillDoc({ bill }) {
  const { data: hospital } = useHospital();
  const hosp = hospital || {};
  const address = [hosp.address?.line1, hosp.address?.line2, hosp.address?.city, hosp.address?.state, hosp.address?.pincode].filter(Boolean).join(', ');
  return (
    <div id="print-bill" className="mt-4">
      <div className="overflow-hidden rounded-xl border border-ink-200 bg-white">
        <div className="flex items-center gap-3 border-b-2 border-dashed border-ink-200 bg-brand-50 px-6 py-4">
          {hosp.logo ? (
            <img src={hosp.logo} alt={hosp.name} className="h-12 w-12 rounded-lg object-contain" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-700 text-sm font-black text-white">{hosp.name?.slice(0, 2).toUpperCase() || 'H'}</div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold text-ink-900">{hosp.name || 'Hospital'}</div>
            <div className="text-xs text-ink-500">{address || '—'}</div>
            <div className="text-xs text-ink-500">{[hosp.phone, hosp.email].filter(Boolean).join(' · ')}{hosp.gstNumber ? ` · GST ${hosp.gstNumber}` : ''}</div>
          </div>
          <div className="text-right">
            <div className="text-xl font-black tracking-tight text-ink-900">{bill.billNumber}</div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-600">Original Bill</div>
            <div className="text-[10px] text-ink-400">{formatDateTime(bill.billDate)}</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-x-6 gap-y-2 border-b border-dashed border-ink-200 px-6 py-3 text-sm">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Patient</div>
            <div className="font-semibold text-ink-900">{bill.patientId?.firstName} {bill.patientId?.lastName || ''}</div>
            <div className="text-xs text-ink-500">UHID {bill.patientId?.uhid || '—'}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">OP Number</div>
            <div className="font-semibold text-ink-900">{bill.opdVisitId?.opdNumber || '—'}</div>
            {bill.doctorId?.name && <div className="text-xs text-ink-500">OP No · {bill.opdVisitId?.opdNumber}</div>}
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Doctor / Department</div>
            <div className="font-semibold text-ink-900">{bill.doctorId?.name ? `Dr. ${bill.doctorId.name}` : '—'}</div>
            <div className="text-xs text-ink-500">{bill.departmentId?.name || '—'}</div>
          </div>
        </div>

        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-ink-200 bg-ink-50 text-[10px] uppercase tracking-wider text-ink-500">
              <th className="px-6 py-2">Service</th>
              <th className="px-2 py-2">Code</th>
              <th className="px-2 py-2 text-right">Qty</th>
              <th className="px-2 py-2 text-right">Rate</th>
              <th className="px-2 py-2 text-right">Disc.</th>
              <th className="px-2 py-2 text-right">GST</th>
              <th className="px-6 py-2 text-right">Net Amt</th>
            </tr>
          </thead>
          <tbody>
            {(bill.items || []).map((it, i) => (
              <tr key={i} className="border-b border-ink-100">
                <td className="px-6 py-2 font-medium text-ink-900">{it.name}{it.description && it.description !== it.name && <div className="text-xs font-normal text-ink-400">{it.description}</div>}</td>
                <td className="px-2 py-2 font-mono text-xs text-ink-500">{it.code || '—'}</td>
                <td className="px-2 py-2 text-right tabular-nums">{it.quantity}</td>
                <td className="px-2 py-2 text-right tabular-nums">{formatCurrency(it.rate)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{it.discountAmount ? formatCurrency(it.discountAmount) : '—'}</td>
                <td className="px-2 py-2 text-right tabular-nums">{it.gstPct ? `${it.gstPct}%` : '—'}</td>
                <td className="px-6 py-2 text-right font-medium tabular-nums">{formatCurrency(it.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-between gap-6 px-6 py-4">
          <div className="w-1/2">
            {(bill.payments || []).length > 0 && (
              <div className="text-xs text-ink-600">
                <div className="mb-1 font-bold uppercase tracking-wider text-ink-400">Payment history</div>
                {bill.payments.map((p) => (
                  <div key={p._id} className="flex justify-between py-0.5">
                    <span>{MODE_LABEL[p.mode] || p.mode}{p.receiptNumber ? ` · ${p.receiptNumber}` : ''}</span>
                    <span>{formatCurrency(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 text-xs text-ink-400">
              <div className="mb-1 font-bold uppercase tracking-wider">Amount in words</div>
              <div className="font-medium text-ink-700">Rupees {bill.netTotal.toLocaleString('en-IN')}</div>
            </div>
          </div>
          <div className="w-1/2 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-ink-400">Gross</span><b>{formatCurrency(bill.grossTotal)}</b></div>
            <div className="flex justify-between"><span className="text-ink-400">Discount</span><b>−{formatCurrency(bill.discount)}</b></div>
            <div className="flex justify-between"><span className="text-ink-400">Tax</span><b>+{formatCurrency(bill.tax)}</b></div>
            <div className="flex justify-between border-t border-ink-200 pt-1 text-base"><span className="font-semibold text-ink-900">Net total</span><b className="text-ink-900">{formatCurrency(bill.netTotal)}</b></div>
            <div className="flex justify-between"><span className="text-ink-400">Paid</span><b className="text-emerald-600">{formatCurrency(bill.paidAmount)}</b></div>
            <div className="flex justify-between"><span className="text-ink-400">Balance due</span><b className={bill.dueAmount > 0 ? 'text-red-600' : 'text-emerald-600'}>{formatCurrency(bill.dueAmount)}</b></div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t-2 border-dashed border-ink-200 bg-ink-50 px-6 py-3 text-[10px] uppercase tracking-widest text-ink-500">
          <span>Status · {bill.status}</span>
          <span>This is a computer generated bill.</span>
        </div>
      </div>
    </div>
  );
}

function Modal({ children, onClose, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/60 p-4 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className={cn('card my-8 w-full animate-slide-up p-6', wide ? 'max-w-4xl' : 'max-w-lg')}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="btn-icon float-right -mr-1 -mt-1 print:hidden">
          <X className="h-5 w-5" />
        </button>
        {children}
      </div>
    </div>
  );
}