import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import api from '../../lib/api';
import { formatDateTime } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';

export const MODE_LABEL = {
  CASH: 'Cash',
  CARD: 'Card',
  UPI: 'UPI',
  BANK_TRANSFER: 'Bank Transfer',
  WALLET: 'Wallet',
  CHEQUE: 'Cheque',
  INSURANCE: 'Insurance',
  CREDIT: 'Credit',
  SPONSOR: 'Sponsor',
};

export function useHospital() {
  return useQuery({
    queryKey: ['hospital'],
    queryFn: async () => (await api.get('/masters/hospital')).data?.data || null,
    retry: 1,
  });
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const twoDigits = (n) => {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`;
};

const threeDigits = (n) => {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return `${hundreds ? ONES[hundreds] + ' Hundred' + (rest ? ' ' : '') : ''}${rest ? twoDigits(rest) : ''}`;
};

export function amountInWords(amount) {
  const value = Math.round(Number(amount) * 100) / 100;
  if (!value || isNaN(value)) return 'Zero Rupees Only';
  const rupees = Math.floor(value);
  const paise = Math.round((value - rupees) * 100);

  const parts = [];
  let n = rupees;
  if (n >= 10000000) { parts.push(threeDigits(Math.floor(n / 10000000)) + ' Crore'); n %= 10000000; }
  if (n >= 100000) { parts.push(threeDigits(Math.floor(n / 100000)) + ' Lakh'); n %= 100000; }
  if (n >= 1000) { parts.push(threeDigits(Math.floor(n / 1000)) + ' Thousand'); n %= 1000; }
  if (n > 0) parts.push(threeDigits(n));

  let out = parts.length ? parts.join(' ') + ' Rupees' : '';
  if (paise) out += ` and ${twoDigits(paise)} Paise`;
  return `${out || 'Zero Rupees'} Only`;
}

export default function PaymentReceipt({ payment, bill, className = '' }) {
  const { data: hospital } = useHospital();
  const { user } = useAuth();

  if (!payment || !bill) return null;

  const hosp = hospital || {};
  const address = [hosp.address?.line1, hosp.address?.line2, hosp.address?.city, hosp.address?.state, hosp.address?.pincode].filter(Boolean).join(', ');
  const receivedBy = payment.receivedBy?.firstName ? `${payment.receivedBy.firstName} ${payment.receivedBy.lastName || ''}` : user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : '—';

  return (
    <div id="print-receipt" className={className}>
      <div className="overflow-hidden rounded-xl border border-ink-200 bg-white">
        <div className="flex items-center gap-3 border-b-2 border-dashed border-ink-200 bg-brand-50 px-5 py-4">
          {hosp.logo ? (
            <img src={hosp.logo} alt={hosp.name} className="h-12 w-12 rounded-lg object-contain" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-700 text-sm font-black text-white">{hosp.name?.slice(0, 2).toUpperCase() || 'H'}</div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold text-ink-900">{hosp.name || 'Hospital'}</div>
            <div className="text-xs text-ink-500">{address || '—'}</div>
            <div className="text-xs text-ink-500">{[hosp.phone, hosp.email].filter(Boolean).join(' · ')}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-600">Payment Receipt</div>
            <div className="mt-1 font-mono text-sm font-bold text-ink-900">{payment.receiptNumber || payment.transactionId}</div>
            <div className="text-[10px] text-ink-400">{formatDateTime(payment.paidAt)}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-2 border-b border-dashed border-ink-200 px-5 py-3 text-sm">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Patient</div>
            <div className="font-semibold text-ink-900">{bill.patientId?.firstName} {bill.patientId?.lastName || ''}</div>
            <div className="text-xs text-ink-500">UHID {bill.patientId?.uhid || bill.patientUHID || '—'}{bill.opdVisitId?.opdNumber ? ` · OP ${bill.opdVisitId.opdNumber}` : ''}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Bill</div>
            <div className="font-semibold text-ink-900">{bill.billNumber}</div>
            <div className="text-xs text-ink-500">{bill.doctorId?.name && `Dr. ${bill.doctorId.name}${bill.departmentId?.name ? ` · ${bill.departmentId.name}` : ''}`}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Payment Mode</div>
            <div className="font-semibold text-ink-900">{MODE_LABEL[payment.mode] || payment.mode}</div>
            <div className="text-xs text-ink-500">{payment.referenceNumber ? `Ref ${payment.referenceNumber}` : '—'}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Received By</div>
            <div className="font-semibold text-ink-900">{receivedBy}</div>
            <div className="text-xs text-ink-500">{bill.createdBy?.firstName && `Cashier · ${bill.createdBy.firstName} ${bill.createdBy.lastName || ''}`}</div>
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-5">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Amount in words</div>
            <div className="max-w-[320px] text-sm font-medium text-ink-700">{amountInWords(payment.amount)}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Amount paid</div>
            <div className="text-2xl font-black tabular-nums text-brand-700">₹{Number(payment.amount).toFixed(2)}</div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t-2 border-dashed border-ink-200 bg-ink-50 px-5 py-2.5 text-[11px] text-ink-500">
          <span className="font-semibold uppercase tracking-widest text-emerald-600">Status · PAID</span>
          <span>This is a computer generated receipt.</span>
        </div>
      </div>
      <div className="mt-3 flex justify-end print:hidden">
        <button className="btn-secondary px-4 py-1.5 text-sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print / Download PDF
        </button>
      </div>
    </div>
  );
}