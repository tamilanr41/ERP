import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Plus,
  Minus,
  X,
  Pill,
  Package,
  AlertTriangle,
  CalendarClock,
  ShieldAlert,
  PackagePlus,
  Search,
} from 'lucide-react';
import api, { apiError } from '../lib/api';
import PageHeader from '../components/ui/PageHeader';
import Pagination from '../components/ui/Pagination';
import { LoadingState, ErrorState, EmptyState, Spinner } from '../components/ui/Feedback';
import Badge, { badge } from '../components/ui/Badge';
import { useAuth } from '../context/AuthContext';
import { formatDate, formatCurrency, cn } from '../lib/utils';

const TABS = [
  { key: 'stock', label: 'Stock' },
  { key: 'sales', label: 'Sales' },
  { key: 'purchases', label: 'Purchases' },
];

function Tip({ icon: Icon, value, label, tone }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', tone)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-xl font-bold leading-tight text-ink-900">{value}</div>
        <div className="truncate text-xs text-ink-500">{label}</div>
      </div>
    </div>
  );
}

export default function Pharmacy() {
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState('stock');
  const [stockPage, setStockPage] = useState(1);
  const [salePage, setSalePage] = useState(1);
  const [purchasePage, setPurchasePage] = useState(1);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [showSale, setShowSale] = useState(false);
  const [showRegister, setShowRegister] = useState(false);

  const debounce = (v) => {
    clearTimeout(debounce._t);
    debounce._t = setTimeout(() => { setDebounced(v); setStockPage(1); }, 300);
    setSearch(v);
  };

  const stock = useQuery({
    queryKey: ['pharmacy-stock', { page: stockPage, search: debounced }],
    queryFn: async ({ queryKey }) => (await api.get('/pharmacy/medicines', { params: queryKey[1] })).data,
  });

  const low = useQuery({ queryKey: ['pharmacy-low'], queryFn: async () => (await api.get('/pharmacy/stock/low')).data?.data });
  const expiring = useQuery({ queryKey: ['pharmacy-expiring'], queryFn: async () => (await api.get('/pharmacy/stock/expiring', { params: { days: 90 } })).data?.data });

  const sales = useQuery({
    queryKey: ['pharmacy-sales', { page: salePage }],
    queryFn: async ({ queryKey }) => (await api.get('/pharmacy/sales', { params: queryKey[1] })).data,
    enabled: tab === 'sales',
  });

  const purchases = useQuery({
    queryKey: ['pharmacy-purchases', { page: purchasePage }],
    queryFn: async ({ queryKey }) => (await api.get('/pharmacy/purchases', { params: queryKey[1] })).data,
    enabled: tab === 'purchases',
  });

  const refresh = (keys) => {
    setShowSale(false);
    setShowRegister(false);
    qc.invalidateQueries({ queryKey: ['pharmacy-'] });
    qc.invalidateQueries({ queryKey: ['pharmacy-stock'] });
    qc.invalidateQueries({ queryKey: ['pharmacy-low'] });
    qc.invalidateQueries({ queryKey: ['pharmacy-expiring'] });
  };

  return (
    <div className="p-6">
      <PageHeader
        title="Pharmacy"
        subtitle="Medicines, batches, stock levels, sales and purchases"
        actions={
          <div className="flex gap-2">
            {hasPermission('PHARMACY_PURCHASE') && (
              <button className="btn-secondary" onClick={() => setShowRegister(true)}>
                <PackagePlus className="h-4 w-4" /> Register
              </button>
            )}
            <button className="btn-primary" onClick={() => setShowSale(true)}>
              <Plus className="h-4 w-4" /> New Sale
            </button>
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tip icon={Pill} value={stock.data?.pagination?.total ?? 0} label="Medicines in catalogue" tone="bg-brand-50 text-brand-600" />
        <Tip icon={Package} value={low.data?.length ?? 0} label="Below reorder level" tone="bg-red-50 text-red-600" />
        <Tip icon={CalendarClock} value={expiring.data?.length ?? 0} label="Expiring within 90 days" tone="bg-amber-50 text-amber-600" />
        <Tip icon={ShieldAlert} value={stock.data?.data?.filter((m) => m.isControlled).length ?? 0} label="Controlled drugs (Rx required)" tone="bg-violet-50 text-violet-600" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-ink-200 p-0.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={cn('rounded-md px-4 py-1.5 text-sm font-medium transition', tab === t.key ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-600 hover:text-ink-900')}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'stock' && (
          <div className="relative ml-auto w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
            <input className="input pl-9" placeholder="Search by name, generic, brand, HSN…" value={search} onChange={(e) => debounce(e.target.value)} />
          </div>
        )}
      </div>

      {showSale && <SaleModal onClose={() => setShowSale(false)} onDone={refresh} />}
      {showRegister && <RegisterModal onClose={() => setShowRegister(false)} onDone={refresh} />}

      {tab === 'stock' && (
        <div className="card overflow-hidden">
          {stock.isLoading ? <LoadingState /> : stock.error ? <ErrorState message={apiError(stock.error)} /> : !stock.data?.data?.length ? (
            <EmptyState title="No medicines" hint="Register your first medicine to begin managing stock" />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Medicine</th>
                  <th>Category / Manufacturer</th>
                  <th>Unit / Pack</th>
                  <th>Stock</th>
                  <th>Reorder</th>
                  <th>GST / HSN</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {stock.data.data.map((m) => (
                  <tr key={m._id}>
                    <td>
                      <div className="flex items-center gap-1.5 font-medium text-ink-900">
                        {m.name}
                        {m.isControlled && <span title="Controlled / scheduled drug — Rx required"><ShieldAlert className="h-3.5 w-3.5 text-violet-600" /></span>}
                      </div>
                      <div className="text-xs text-ink-400">{m.genericName && <span className="italic">{m.genericName}</span>}{m.brand && <span> · {m.brand}</span>}</div>
                    </td>
                    <td>
                      <div>{m.category?.name || '—'}</div>
                      <div className="text-xs text-ink-400">{m.manufacturer?.name || ''}</div>
                    </td>
                    <td className="text-xs">
                      <div className="font-medium text-ink-700">{m.unit || 'TAB'}{m.packSize ? ` · pack ${m.packSize}` : ''}</div>
                      {m.storageConditions && <div className="text-ink-400">{m.storageConditions}</div>}
                    </td>
                    <td>
                      <span className={cn('font-bold tabular-nums', m.lowStock ? 'text-red-600' : 'text-ink-900')}>{m.totalStock}</span>
                      {m.maxStock ? <span className="ml-1 text-xs text-ink-400">/ {m.maxStock}</span> : null}
                    </td>
                    <td className="text-ink-400">{m.reorderLevel || 0}</td>
                    <td className="text-xs">
                      {m.gstPct ? <span>{m.gstPct}%</span> : <span>—</span>}
                      {m.hsnCode && <div className="font-mono text-ink-400">{m.hsnCode}</div>}
                    </td>
                    <td>{m.lowStock ? badge('LOW', 'LOW') : badge('IN STOCK', 'IN_STOCK')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {stock.data?.pagination && <Pagination {...stock.data.pagination} page={stock.data.pagination.page} onChange={setStockPage} />}
        </div>
      )}

      {tab === 'sales' && (
        <div className="card overflow-hidden">
          <SalesTable data={sales.data?.data} isLoading={sales.isLoading} error={sales.error} />
          {sales.data?.pagination && <Pagination {...sales.data.pagination} page={sales.data.pagination.page} onChange={setSalePage} />}
        </div>
      )}

      {tab === 'purchases' && (
        <div className="card overflow-hidden">
          <PurchasesTable data={purchases.data?.data} isLoading={purchases.isLoading} error={purchases.error} />
          {purchases.data?.pagination && <Pagination {...purchases.data.pagination} page={purchases.data.pagination.page} onChange={setPurchasePage} />}
        </div>
      )}
    </div>
  );
}

const SalesTable = ({ data, isLoading, error }) => {
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={apiError(error)} />;
  if (!data?.length) return <EmptyState title="No sales yet" />;
  return (
    <table className="table">
      <thead>
        <tr><th>Invoice</th><th>Patient</th><th>Date</th><th>Items</th><th>Mode</th><th>Total</th><th>Status</th></tr>
      </thead>
      <tbody>
        {data.map((s) => (
          <tr key={s._id}>
            <td className="font-medium text-brand-700">{s.saleNumber}</td>
            <td>{s.patientId?.firstName} {s.patientId?.lastName || ''}</td>
            <td>{formatDate(s.saleDate)}</td>
            <td>{s.items?.length || 0}</td>
            <td>{s.payment?.mode || '—'}</td>
            <td className="font-medium">{formatCurrency(s.netTotal)}</td>
            <td>{badge(s.status)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const PurchasesTable = ({ data, isLoading, error }) => {
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={apiError(error)} />;
  if (!data?.length) return <EmptyState title="No purchases yet" />;
  return (
    <table className="table">
      <thead>
        <tr><th>PO</th><th>Supplier</th><th>Date</th><th>Total</th><th>Paid</th><th>Due</th></tr>
      </thead>
      <tbody>
        {data.map((p) => (
          <tr key={p._id}>
            <td className="font-medium text-brand-700">{p.purchaseNumber}</td>
            <td>{p.supplierId?.name || '—'}</td>
            <td>{formatDate(p.purchaseDate)}</td>
            <td className="font-medium">{formatCurrency(p.netTotal)}</td>
            <td>{formatCurrency(p.paidAmount)}</td>
            <td className={cn(p.dueAmount > 0 ? 'text-red-600 font-medium' : 'text-emerald-600')}>{formatCurrency(p.dueAmount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

function RegisterModal({ onClose, onDone }) {
  const [form, setForm] = useState({ name: '', genericName: '', brand: '', category: '', manufacturer: '', unit: 'TAB', packSize: '', hsnCode: '', gstPct: '0', reorderLevel: '10', maxStock: '', storageConditions: '', isControlled: false });
  const { data: cats } = useQuery({ queryKey: ['pharmacy-cats'], queryFn: async () => (await api.get('/pharmacy/categories')).data?.data });
  const { data: makers } = useQuery({ queryKey: ['pharmacy-makers'], queryFn: async () => (await api.get('/pharmacy/manufacturers')).data?.data });
  const mutation = useMutation({
    mutationFn: async (p) => (await api.post('/pharmacy/medicines', p)).data.data,
    onSuccess: (m) => { toast.success(`${m.name} registered`); onDone(); },
    onError: (e) => toast.error(apiError(e)),
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = () => {
    if (!form.name.trim()) return toast.error('Medicine name is required');
    mutation.mutate({
      name: form.name.trim(),
      genericName: form.genericName || undefined,
      brand: form.brand || undefined,
      category: form.category || undefined,
      manufacturer: form.manufacturer || undefined,
      unit: form.unit,
      packSize: form.packSize || undefined,
      hsnCode: form.hsnCode || undefined,
      gstPct: Number(form.gstPct) || 0,
      reorderLevel: Number(form.reorderLevel) || 0,
      maxStock: form.maxStock ? Number(form.maxStock) : undefined,
      storageConditions: form.storageConditions || undefined,
      isControlled: form.isControlled,
    });
  };

  return (
    <Modal onClose={onClose}>
      <h2 className="mb-1 text-lg font-bold text-ink-900">Register Medicine</h2>
      <p className="mb-4 text-xs text-ink-400">Adds the medicine to the catalogue and reorder rules.</p>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Name *</label><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
          <div><label className="label">Generic name</label><input className="input" value={form.genericName} onChange={(e) => set('genericName', e.target.value)} /></div>
          <div><label className="label">Brand</label><input className="input" value={form.brand} onChange={(e) => set('brand', e.target.value)} /></div>
          <div><label className="label">Category</label>
            <select className="select" value={form.category} onChange={(e) => set('category', e.target.value)}>
              <option value="">— None —</option>
              {cats?.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
          </div>
          <div><label className="label">Manufacturer</label>
            <select className="select" value={form.manufacturer} onChange={(e) => set('manufacturer', e.target.value)}>
              <option value="">— None —</option>
              {makers?.map((m) => <option key={m._id} value={m._id}>{m.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">Unit</label>
              <select className="select" value={form.unit} onChange={(e) => set('unit', e.target.value)}>
                {['TAB', 'CAP', 'SYR', 'AMP', 'VIAL', 'SACHET', 'TUBE', 'BOTTLE', 'INJ', 'DROP'].map((u) => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div><label className="label">Pack size</label><input className="input" value={form.packSize} onChange={(e) => set('packSize', e.target.value)} /></div>
          </div>
          <div><label className="label">HSN code</label><input className="input" value={form.hsnCode} onChange={(e) => set('hsnCode', e.target.value)} /></div>
          <div><label className="label">GST (%)</label><input type="number" min="0" className="input" value={form.gstPct} onChange={(e) => set('gstPct', e.target.value)} /></div>
          <div><label className="label">Reorder level</label><input type="number" min="0" className="input" value={form.reorderLevel} onChange={(e) => set('reorderLevel', e.target.value)} /></div>
          <div><label className="label">Maximum stock</label><input type="number" min="0" className="input" value={form.maxStock} onChange={(e) => set('maxStock', e.target.value)} /></div>
          <div><label className="label">Storage conditions</label><input className="input" value={form.storageConditions} onChange={(e) => set('storageConditions', e.target.value)} /></div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-600">
          <input type="checkbox" className="h-4 w-4 rounded border-ink-300 text-violet-600" checked={form.isControlled} onChange={(e) => set('isControlled', e.target.checked)} />
          Controlled / scheduled drug (requires Rx on sale)
        </label>
        <button className="btn-primary w-full" disabled={mutation.isPending} onClick={submit}>
          {mutation.isPending ? <Spinner className="h-4 w-4 text-white" /> : 'Register medicine'}
        </button>
      </div>
    </Modal>
  );
}

function SaleModal({ onClose, onDone }) {
  const [patientId, setPatientId] = useState('');
  const [mode, setMode] = useState('CASH');
  const [items, setItems] = useState([]);

  const { data: medicines, isLoading } = useQuery({
    queryKey: ['pharmacy-medicines-brief'],
    queryFn: async () => (await api.get('/pharmacy/medicines', { params: { limit: 100 } })).data.data,
  });

  const { data: batches } = useQuery({
    queryKey: ['pharmacy-batches-brief'],
    queryFn: async () => (await api.get('/pharmacy/stock', { params: { limit: 100 } })).data.data,
  });

  const priceMap = new Map();
  (batches || []).forEach((b) => {
    const id = b.medicineId?._id?.toString();
    if (id && b.sellingRate != null && !priceMap.has(id)) priceMap.set(id, b.sellingRate);
  });

  const { data: patients } = useQuery({
    queryKey: ['pharmacy-patients'],
    queryFn: async () => (await api.get('/patients', { params: { limit: 100 } })).data.data,
  });

  const mutation = useMutation({
    mutationFn: async (payload) => (await api.post('/pharmacy/sales', payload)).data.data,
    onSuccess: (sale) => { toast.success(`Sale ${sale.saleNumber} completed`); onDone(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const addItem = () => setItems((prev) => [...prev, { medicineId: '', quantity: 1, rate: 0 }]);
  const upd = (idx, key, value) => setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [key]: value } : it)));
  const remove = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const total = items.reduce((sum, it) => sum + it.quantity * it.rate, 0);

  const submit = () => {
    if (!patientId) return toast.error('Select a patient');
    if (!items.length || items.some((i) => !i.medicineId || !i.quantity)) return toast.error('Add at least one item');
    mutation.mutate({
      patientId,
      items: items.map((i) => ({ medicineId: i.medicineId, quantity: Number(i.quantity), rate: Number(i.rate) })),
      payment: { amount: Number(total.toFixed(2)), mode },
    });
  };

  return (
    <Modal onClose={onClose} wide>
      <h2 className="mb-4 text-lg font-bold text-ink-900">New Pharmacy Sale</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Patient *</label>
          <select className="select" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
            <option value="">Select patient…</option>
            {patients?.map((p) => <option key={p._id} value={p._id}>{p.uhid} · {p.firstName} {p.lastName || ''}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Payment Mode</label>
          <select className="select" value={mode} onChange={(e) => setMode(e.target.value)}>
            {['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'WALLET', 'CHEQUE', 'INSURANCE'].map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <label className="label mb-0">Items</label>
          <button className="btn-secondary px-3 py-1 text-xs" onClick={addItem}><Plus className="h-3 w-3" /> Add</button>
        </div>
        {items.map((it, idx) => (
          <div key={idx} className="mb-2 grid grid-cols-12 items-end gap-2">
            <div className="col-span-6">
              <label className="label">Medicine</label>
              <select
                className="select"
                value={it.medicineId}
                onChange={(e) => {
                  const sel = medicines?.find((m) => m._id === e.target.value);
                  upd(idx, 'medicineId', e.target.value);
                  upd(idx, 'rate', priceMap.get(e.target.value) ?? sel?.sellingRate ?? it.rate ?? 0);
                }}
              >
                <option value="">Select… (stock)</option>
                {medicines?.map((m) => (
                  <option key={m._id} value={m._id}>
                    {m.name}{m.isControlled ? ' †' : ''} ({m.totalStock} in stock)
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2"><label className="label">Qty</label><input type="number" min="1" className="input" value={it.quantity} onChange={(e) => upd(idx, 'quantity', e.target.value)} /></div>
            <div className="col-span-3"><label className="label">Rate</label><input type="number" min="0" className="input" value={it.rate} onChange={(e) => upd(idx, 'rate', e.target.value)} /></div>
            <button className="col-span-1 mb-1 text-ink-400 hover:text-red-600" onClick={() => remove(idx)}><Minus className="h-4 w-4" /></button>
          </div>
        ))}
        {!items.length && <p className="text-xs text-ink-400">No items added. <span className="italic">† = controlled drug — prescription required.</span></p>}
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-inset ring-amber-200">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Sale adjusts batch stock (FEFO) and raises a low-stock alert when any item falls below its reorder level.
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-4">
        <div>
          <div className="text-sm text-ink-400">Total (incl. GST)</div>
          <div className="text-xl font-semibold text-ink-900">{formatCurrency(total)}</div>
        </div>
        <button className="btn-primary" onClick={submit} disabled={mutation.isPending || isLoading}>
          {mutation.isPending ? <Spinner className="h-4 w-4 text-white" /> : 'Complete Sale'}
        </button>
      </div>
    </Modal>
  );
}

function Modal({ children, onClose, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/60 p-4 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className={cn('card my-8 w-full animate-slide-up p-6', wide ? 'max-w-2xl' : 'max-w-lg')}
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