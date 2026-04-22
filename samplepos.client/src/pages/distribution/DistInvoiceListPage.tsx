/**
 * Distribution Module — Invoice List Page
 *
 * Lists all distribution invoices with status filters and clearing navigation.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import distributionApi, { type DistInvoice } from '../../api/distribution';
import { formatCurrency } from '../../utils/currency';

const STATUS_OPTIONS = ['ALL', 'OPEN', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'] as const;
const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-red-100 text-red-800',
  PARTIALLY_PAID: 'bg-yellow-100 text-yellow-800',
  PAID: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-gray-100 text-gray-600',
};

export default function DistInvoiceListPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>('ALL');
  const limit = 25;

  const { data, isLoading } = useQuery({
    queryKey: ['dist-invoices', page, status],
    queryFn: () => distributionApi.listInvoices({
      page, limit,
      status: status === 'ALL' ? undefined : status,
    }),
  });

  const invoices = data?.data ?? [];
  const pagination = data?.pagination ?? { page: 1, limit, total: 0, totalPages: 0 };

  return (
    <Layout>
      <div className="p-4 lg:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Distribution Invoices</h1>
            <p className="text-sm text-gray-500 mt-1">Auto-generated from deliveries</p>
          </div>
          <button
            onClick={() => navigate('/distribution/clearing')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium"
          >
            Process Clearing
          </button>
        </div>

        {/* Status filter */}
        <div className="flex flex-wrap gap-1 border-b border-gray-200 pb-1">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => { setStatus(s); setPage(1); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-t transition ${status === s ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
            >
              {s.replace(/_/g, ' ')}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-gray-400">Loading…</div>
        ) : invoices.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No invoices found</div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Invoice #</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Order</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Customer</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Issue Date</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">Total</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">Paid</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">Due</th>
                    <th className="px-3 py-2 text-center font-medium text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {invoices.map((inv: DistInvoice) => (
                    <tr key={inv.id} className="hover:bg-blue-50 cursor-pointer" onClick={() => navigate(`/distribution/clearing?customerId=${inv.customerId}`)}>
                      <td className="px-3 py-2 font-mono font-medium text-blue-700">{inv.invoiceNumber}</td>
                      <td className="px-3 py-2 text-gray-500 font-mono text-xs">{inv.orderNumber}</td>
                      <td className="px-3 py-2">{inv.customerName}</td>
                      <td className="px-3 py-2 text-gray-500">{inv.issueDate}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatCurrency(inv.totalAmount)}</td>
                      <td className="px-3 py-2 text-right text-green-600">{formatCurrency(inv.amountPaid)}</td>
                      <td className="px-3 py-2 text-right font-bold text-red-600">{formatCurrency(inv.amountDue)}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[inv.status] ?? 'bg-gray-100'}`}>
                          {inv.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {invoices.map((inv: DistInvoice) => (
                <div key={inv.id} className="bg-white border rounded-lg p-4 shadow-sm" onClick={() => navigate(`/distribution/clearing?customerId=${inv.customerId}`)}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-mono font-bold text-blue-700">{inv.invoiceNumber}</p>
                      <p className="text-sm text-gray-600">{inv.customerName}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[inv.status] ?? 'bg-gray-100'}`}>
                      {inv.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                    <div><p className="text-xs text-gray-400">Total</p><p className="font-medium">{formatCurrency(inv.totalAmount)}</p></div>
                    <div><p className="text-xs text-gray-400">Paid</p><p className="text-green-600">{formatCurrency(inv.amountPaid)}</p></div>
                    <div><p className="text-xs text-gray-400">Due</p><p className="font-bold text-red-600">{formatCurrency(inv.amountDue)}</p></div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between border-t pt-3 text-sm">
                <span className="text-gray-500">Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)</span>
                <div className="flex gap-2">
                  <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50">Previous</button>
                  <button disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50">Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
