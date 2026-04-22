/**
 * Distribution Module — Sales Order List Page
 *
 * SAP-style keyboard-first list with status filtering and pagination.
 */
import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import distributionApi, { type SalesOrder } from '../../api/distribution';
import { formatCurrency } from '../../utils/currency';

const STATUS_OPTIONS = ['ALL', 'OPEN', 'PARTIALLY_DELIVERED', 'FULLY_DELIVERED', 'CLOSED', 'CANCELLED'] as const;
const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-800',
  PARTIALLY_DELIVERED: 'bg-yellow-100 text-yellow-800',
  FULLY_DELIVERED: 'bg-green-100 text-green-800',
  CLOSED: 'bg-gray-100 text-gray-600',
  CANCELLED: 'bg-red-100 text-red-800',
};

export default function DistSalesOrderListPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>('ALL');
  const limit = 25;

  const { data, isLoading } = useQuery({
    queryKey: ['dist-sales-orders', page, status],
    queryFn: () => distributionApi.listSalesOrders({
      page, limit,
      status: status === 'ALL' ? undefined : status,
    }),
  });

  const orders = data?.data ?? [];
  const pagination = data?.pagination ?? { page: 1, limit, total: 0, totalPages: 0 };

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'F5' || (e.ctrlKey && e.key === 'n')) {
      e.preventDefault();
      navigate('/distribution/sales-orders/new');
    }
  }, [navigate]);

  return (
    <Layout>
      <div className="p-4 lg:p-6 space-y-4" onKeyDown={handleKeyDown} tabIndex={-1}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Sales Orders</h1>
            <p className="text-sm text-gray-500 mt-1">Manage customer orders and delivery fulfillment</p>
          </div>
          <button
            onClick={() => navigate('/distribution/sales-orders/new')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            <span>+ New Order</span>
            <kbd className="hidden sm:inline text-xs bg-blue-500 px-1.5 py-0.5 rounded">F5</kbd>
          </button>
        </div>

        {/* Status filter tabs */}
        <div className="flex flex-wrap gap-1 border-b border-gray-200 pb-1">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => { setStatus(s); setPage(1); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-t transition ${status === s
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
                }`}
            >
              {s.replace(/_/g, ' ')}
            </button>
          ))}
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="text-center py-12 text-gray-400">Loading…</div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No sales orders found</div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Order #</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Customer</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Date</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">Total</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">Confirmed</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">Delivered</th>
                    <th className="px-3 py-2 text-center font-medium text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {orders.map((o: SalesOrder) => (
                    <tr
                      key={o.id}
                      className="hover:bg-blue-50 cursor-pointer transition"
                      onClick={() => navigate(`/distribution/sales-orders/${o.id}`)}
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && navigate(`/distribution/sales-orders/${o.id}`)}
                    >
                      <td className="px-3 py-2 font-mono font-medium text-blue-700">{o.orderNumber}</td>
                      <td className="px-3 py-2">{o.customerName}</td>
                      <td className="px-3 py-2 text-gray-500">{o.orderDate}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatCurrency(o.totalAmount)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(o.totalConfirmed)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(o.totalDelivered)}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[o.status] ?? 'bg-gray-100'}`}>
                          {o.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card layout */}
            <div className="md:hidden space-y-3">
              {orders.map((o: SalesOrder) => (
                <div
                  key={o.id}
                  className="bg-white border rounded-lg p-4 shadow-sm active:bg-blue-50"
                  onClick={() => navigate(`/distribution/sales-orders/${o.id}`)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-mono font-bold text-blue-700">{o.orderNumber}</p>
                      <p className="text-sm text-gray-600">{o.customerName}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[o.status] ?? 'bg-gray-100'}`}>
                      {o.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="mt-2 flex justify-between text-sm">
                    <span className="text-gray-500">{o.orderDate}</span>
                    <span className="font-medium">{formatCurrency(o.totalAmount)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between border-t pt-3 text-sm">
                <span className="text-gray-500">
                  Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                    className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50"
                  >
                    Previous
                  </button>
                  <button
                    disabled={page >= pagination.totalPages}
                    onClick={() => setPage(p => p + 1)}
                    className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
