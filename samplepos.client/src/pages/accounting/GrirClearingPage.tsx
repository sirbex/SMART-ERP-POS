import { useState } from 'react';
import { useGrirOpenItems, useGrirBalance } from '../../hooks/useAccountingModules';
import { FileCheck, ArrowRightLeft } from 'lucide-react';

interface GrirOpenItem {
  id: string;
  poNumber?: string;
  supplierName?: string;
  supplierId?: string;
  grDate?: string;
  grAmount?: number;
  invoiceDate?: string;
  invoiceAmount?: number;
  status: string;
  daysDifference?: number;
}

interface GrirBalance {
  clearingBalance?: number;
  outstandingItems?: number;
  oldestItemDays?: number;
}

export default function GrirClearingPage() {
  const [supplierId, setSupplierId] = useState('');
  const { data: openItems, isLoading } = useGrirOpenItems(supplierId || undefined);
  const { data: balanceData } = useGrirBalance();

  const items = (Array.isArray(openItems) ? openItems : []) as GrirOpenItem[];
  const balance = (balanceData || {}) as GrirBalance;

  const fmt = (val?: number) =>
    typeof val === 'number' ? val.toLocaleString('en-US', { minimumFractionDigits: 0 }) : '—';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">GR/IR Clearing</h1>
          <p className="text-sm text-gray-500 mt-1">Match goods receipts with supplier invoices</p>
        </div>
      </div>

      {/* Balance Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Clearing Balance', value: fmt(balance.clearingBalance), color: 'text-orange-600' },
          { label: 'Outstanding Items', value: balance.outstandingItems ?? '—', color: 'text-blue-600' },
          { label: 'Oldest Item (Days)', value: balance.oldestItemDays ?? '—', color: 'text-red-600' },
        ].map((card) => (
          <div key={card.label} className="bg-white border rounded-lg p-4 shadow-sm">
            <div className="text-xs text-gray-500 uppercase mb-1">{card.label}</div>
            <div className={`text-xl font-bold ${card.color}`}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="bg-white border rounded-lg p-4 shadow-sm">
        <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Supplier</label>
        <input
          type="text"
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          className="w-full max-w-xs px-3 py-2 border rounded-lg text-sm"
          placeholder="Enter supplier ID to filter..."
        />
      </div>

      {/* Open Items Table */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Loading open items...</div>
      ) : (
        <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">PO Number</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">GR Date</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">GR Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice Date</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Invoice Amount</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Days Diff</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                    <FileCheck className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                    No open GR/IR items
                  </td>
                </tr>
              ) : items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{item.poNumber || '—'}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{item.supplierName || '—'}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{item.grDate || '—'}</td>
                  <td className="px-6 py-4 text-sm text-right font-medium">{fmt(item.grAmount)}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{item.invoiceDate || '—'}</td>
                  <td className="px-6 py-4 text-sm text-right font-medium">{fmt(item.invoiceAmount)}</td>
                  <td className="px-6 py-4 text-sm text-center">
                    <span className="inline-flex items-center gap-1 text-xs">
                      <ArrowRightLeft className="h-3 w-3" />
                      {item.daysDifference ?? '—'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                      item.status === 'MATCHED' ? 'bg-green-100 text-green-700' :
                      item.status === 'VARIANCE' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>{item.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
