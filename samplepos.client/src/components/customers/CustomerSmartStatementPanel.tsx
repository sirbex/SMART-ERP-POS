import { useMemo } from 'react';
import { useCustomerSmartStatement } from '../../hooks/useApi';
import { formatCurrency } from '../../utils/currency';
import { getBusinessDate } from '../../utils/businessDate';
import { CUSTOMER_PAYMENT_METHODS } from '../../constants/paymentMethods';

function paymentMethodLabel(method?: string): string {
  if (!method) return '-';
  const found = CUSTOMER_PAYMENT_METHODS.find((m) => m.value === method.toUpperCase());
  return found?.label ?? method.replace(/_/g, ' ');
}

export interface SmartStatementEntry {
  date: string;
  particulars: string;
  vchType: string;
  vchNo: string;
  debit: number;
  credit: number;
  balanceAfter: number;
  itemStatus: string;
  paymentMethod?: string;
}

export interface CustomerSmartStatementData {
  customerId: string;
  customerName: string;
  periodStart: string;
  periodEnd: string;
  openingBalance: number;
  closingBalance: number;
  entries: SmartStatementEntry[];
  openItemEntries: SmartStatementEntry[];
  unallocatedReceiptsTotal: number;
  unallocatedReceipts: Array<{
    paymentId: string;
    paymentNumber: string;
    paymentDate: string;
    unallocatedAmount: number;
  }>;
}

interface Props {
  customerId: string;
  startDate: string;
  endDate: string;
}

function defaultPeriod(): { start: string; end: string } {
  const end = getBusinessDate();
  const d = new Date(`${end}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 30);
  const start = d.toISOString().slice(0, 10);
  return { start, end };
}

export function CustomerSmartStatementPanel({ customerId, startDate, endDate }: Props) {
  const period = useMemo(() => {
    const fallback = defaultPeriod();
    return {
      startDate: startDate?.slice(0, 10) || fallback.start,
      endDate: endDate?.slice(0, 10) || fallback.end,
    };
  }, [startDate, endDate]);

  const { data, isLoading, error } = useCustomerSmartStatement(customerId, period);

  const stmt = data as CustomerSmartStatementData | undefined;

  if (isLoading) {
    return <div className="text-center py-10 text-gray-500">Loading GL statement…</div>;
  }
  if (error) {
    const axiosErr = error as { response?: { data?: { error?: string } } };
    const msg = axiosErr.response?.data?.error || (error instanceof Error ? error.message : 'Unknown error');
    return (
      <div className="text-center py-10 text-red-600 space-y-2">
        <p>Failed to load smart statement</p>
        <p className="text-xs text-red-500 font-mono max-w-xl mx-auto break-words">{msg}</p>
      </div>
    );
  }
  if (!stmt) {
    return <div className="text-center py-10 text-gray-500">No statement data</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-50 border border-gray-200 rounded p-3">
          <div className="text-xs text-gray-600">Opening (GL 1200)</div>
          <div className={`text-lg font-semibold ${stmt.openingBalance > 0 ? 'text-red-600' : stmt.openingBalance < 0 ? 'text-green-600' : ''}`}>
            {formatCurrency(Math.abs(stmt.openingBalance))}
            {stmt.openingBalance < 0 && <span className="text-xs ml-1">(CR)</span>}
          </div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded p-3">
          <div className="text-xs text-gray-600">Closing (GL 1200)</div>
          <div className={`text-lg font-semibold ${stmt.closingBalance > 0 ? 'text-red-600' : stmt.closingBalance < 0 ? 'text-green-600' : ''}`}>
            {formatCurrency(Math.abs(stmt.closingBalance))}
            {stmt.closingBalance < 0 && <span className="text-xs ml-1">(CR)</span>}
          </div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded p-3">
          <div className="text-xs text-gray-600">Period</div>
          <div className="text-sm">{stmt.periodStart} → {stmt.periodEnd}</div>
        </div>
      </div>

      {stmt.unallocatedReceiptsTotal > 0.009 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <strong>Unallocated receipts:</strong> {formatCurrency(stmt.unallocatedReceiptsTotal)} on{' '}
          {stmt.unallocatedReceipts.length} payment(s). These are on GL; allocate to invoices in AR payments.
          <ul className="mt-2 list-disc pl-5">
            {stmt.unallocatedReceipts.map((r) => (
              <li key={r.paymentId}>
                {r.paymentNumber} ({r.paymentDate}): {formatCurrency(r.unallocatedAmount)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Particulars</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Vch No</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Debit</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Credit</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            <tr className="bg-gray-50/80">
              <td className="px-3 py-2">{stmt.periodStart}</td>
              <td className="px-3 py-2" colSpan={4}>Opening balance</td>
              <td className="px-3 py-2">-</td>
              <td className="px-3 py-2 text-right">-</td>
              <td className="px-3 py-2 text-right">-</td>
              <td className="px-3 py-2 text-right font-semibold">{formatCurrency(stmt.openingBalance)}</td>
              <td className="px-3 py-2">-</td>
            </tr>
            {stmt.entries.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-gray-500">No GL activity in this period</td>
              </tr>
            ) : (
              stmt.entries.map((e, idx) => (
                <tr key={`gl-${idx}`} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-600">{String(e.date).slice(0, 10)}</td>
                  <td className="px-3 py-2">{e.particulars}</td>
                  <td className="px-3 py-2">{e.vchType}</td>
                  <td className="px-3 py-2 font-mono text-xs">{e.vchNo}</td>
                  <td className="px-3 py-2 text-gray-600">{paymentMethodLabel(e.paymentMethod)}</td>
                  <td className="px-3 py-2 text-right text-red-600">{e.debit ? formatCurrency(e.debit) : '-'}</td>
                  <td className="px-3 py-2 text-right text-green-600">{e.credit ? formatCurrency(e.credit) : '-'}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatCurrency(e.balanceAfter)}</td>
                  <td className="px-3 py-2">
                    <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100">{e.itemStatus}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {stmt.openItemEntries.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-800">Open-item adjustments (no GL impact)</h4>
          <div className="overflow-x-auto border border-amber-200 rounded-lg">
            <table className="min-w-full divide-y divide-amber-100 text-sm">
              <thead className="bg-amber-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-amber-800 uppercase">Date</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-amber-800 uppercase">Particulars</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-amber-800 uppercase">Amount</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-amber-50">
                {stmt.openItemEntries.map((e, idx) => (
                  <tr key={`oi-${idx}`}>
                    <td className="px-3 py-2">{String(e.date).slice(0, 10)}</td>
                    <td className="px-3 py-2">{e.particulars}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(e.debit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
