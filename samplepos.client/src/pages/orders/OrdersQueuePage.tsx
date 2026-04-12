import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import { api } from '../../utils/api';
import { formatCurrency } from '../../utils/currency';
import { useAuth } from '../../hooks/useAuth';
import { BUSINESS_TIMEZONE } from '../../utils/businessDate';
import { toast } from 'react-hot-toast';

// ── Types ────────────────────────────────────────────────────────────

interface PendingOrder {
  id: string;
  orderNumber: string;
  customerId: string | null;
  customerName: string | null;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  status: string;
  createdBy: string;
  createdByName: string | null;
  assignedCashierId: string | null;
  assignedCashierName: string | null;
  orderDate: string;
  notes: string | null;
  createdAt: string;
  itemCount?: string | number;
}

// ── Component ────────────────────────────────────────────────────────

export default function OrdersQueuePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, permissions } = useAuth();
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // Fetch pending orders with 5s auto-refresh
  const { data: ordersData, isLoading, error, refetch } = useQuery({
    queryKey: ['orders', 'pending'],
    queryFn: async () => {
      const resp = await api.orders.listPending();
      return (resp.data.data ?? []) as PendingOrder[];
    },
    refetchInterval: 5000, // Auto-refresh every 5s
    staleTime: 3000,
  });

  // Fetch pending count for badge
  const { data: countData } = useQuery({
    queryKey: ['orders', 'pending-count'],
    queryFn: async () => {
      const resp = await api.orders.pendingCount();
      return (resp.data.data as { count: number })?.count ?? 0;
    },
    refetchInterval: 5000,
  });

  const cancelMutation = useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason: string }) =>
      api.orders.cancel(orderId, { reason }),
    onSuccess: () => {
      toast.success('Order cancelled');
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setCancelOrderId(null);
      setCancelReason('');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to cancel order');
    },
  });

  const orders = ordersData ?? [];

  const handlePayOrder = useCallback((order: PendingOrder) => {
    navigate(`/orders/${order.id}/pay`);
  }, [navigate]);

  const handleCancelConfirm = () => {
    if (!cancelOrderId || !cancelReason.trim()) return;
    cancelMutation.mutate({ orderId: cancelOrderId, reason: cancelReason });
  };

  const formatTime = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return '';
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: BUSINESS_TIMEZONE });
    } catch {
      return '';
    }
  };

  const getTimeSinceCreated = (timestamp: string) => {
    try {
      const created = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - created.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return 'Just now';
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHr = Math.floor(diffMin / 60);
      return `${diffHr}h ${diffMin % 60}m ago`;
    } catch {
      return '';
    }
  };

  // Check if current user can pay (legacy roles OR RBAC permission)
  const canPay = user?.role === 'ADMIN' || user?.role === 'MANAGER' || user?.role === 'CASHIER' || permissions.has('orders.pay');

  return (
    <Layout>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Orders Queue</h1>
            <p className="text-sm text-gray-500 mt-1">
              {orders.length} pending order{orders.length !== 1 ? 's' : ''} awaiting payment
            </p>
          </div>
          <div className="flex items-center gap-3">
            {countData !== undefined && countData > 0 && (
              <span className="inline-flex items-center justify-center px-3 py-1 rounded-full text-sm font-bold bg-red-100 text-red-700">
                {countData} pending
              </span>
            )}
            <button
              onClick={() => refetch()}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Refresh
            </button>
            <button
              onClick={() => navigate('/pos')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              + New Order
            </button>
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            Failed to load orders. <button onClick={() => refetch()} className="underline">Retry</button>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && orders.length === 0 && (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <div className="text-5xl mb-4">📋</div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No Pending Orders</h3>
            <p className="text-gray-500 text-sm">All orders have been processed. New orders will appear here automatically.</p>
          </div>
        )}

        {/* Orders Grid */}
        {orders.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {orders.map((order) => (
              <div
                key={order.id}
                className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => canPay ? handlePayOrder(order) : undefined}
              >
                {/* Card Header */}
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{order.orderNumber}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{formatTime(order.createdAt)}</p>
                  </div>
                  <span className="text-xs font-medium px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                    {getTimeSinceCreated(order.createdAt)}
                  </span>
                </div>

                {/* Card Body */}
                <div className="px-5 py-4 space-y-3">
                  {/* Customer */}
                  {order.customerName && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-400">👤</span>
                      <span className="text-gray-700 font-medium">{order.customerName}</span>
                    </div>
                  )}

                  {/* Dispenser */}
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-400">🏷️</span>
                    <span className="text-gray-600">By: {order.createdByName || 'Unknown'}</span>
                  </div>

                  {/* Item count */}
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-400">📦</span>
                    <span className="text-gray-600">
                      {order.itemCount ?? '?'} item{Number(order.itemCount) !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* Notes */}
                  {order.notes && (
                    <div className="text-xs text-gray-500 bg-gray-50 rounded px-2 py-1.5 truncate">
                      {order.notes}
                    </div>
                  )}
                </div>

                {/* Card Footer */}
                <div className="px-5 py-3 bg-gray-50 rounded-b-xl flex items-center justify-between">
                  <span className="text-xl font-bold text-gray-900">
                    {formatCurrency(parseFloat(order.totalAmount))}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setCancelOrderId(order.id);
                      }}
                      className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                    >
                      Cancel
                    </button>
                    {canPay && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePayOrder(order);
                        }}
                        className="px-4 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
                      >
                        Take Payment
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cancel Confirmation Modal */}
      {cancelOrderId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setCancelOrderId(null)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-4">Cancel Order</h3>
            <p className="text-sm text-gray-600 mb-4">Are you sure you want to cancel this order? This action cannot be undone.</p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Enter cancellation reason..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-red-500"
              rows={3}
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setCancelOrderId(null); setCancelReason(''); }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Keep Order
              </button>
              <button
                onClick={handleCancelConfirm}
                disabled={!cancelReason.trim() || cancelMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {cancelMutation.isPending ? 'Cancelling...' : 'Cancel Order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
