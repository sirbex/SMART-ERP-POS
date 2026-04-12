import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import { api } from '../../utils/api';
import { formatCurrency } from '../../utils/currency';
import { toast } from 'react-hot-toast';

// ── Types ────────────────────────────────────────────────────────────

interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  discountAmount: string;
  uomId: string | null;
}

interface OrderDetail {
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
  orderDate: string;
  notes: string | null;
  createdAt: string;
  items: OrderItem[];
}

type PaymentMethod = 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'CREDIT' | 'DEPOSIT' | 'BANK_TRANSFER';

// ── Component ────────────────────────────────────────────────────────

export default function OrderPaymentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [paymentReceived, setPaymentReceived] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch order details
  const { data: order, isLoading, error } = useQuery({
    queryKey: ['orders', id],
    queryFn: async () => {
      const resp = await api.orders.getById(id!);
      return resp.data.data as OrderDetail;
    },
    enabled: !!id,
  });

  const totalAmount = useMemo(() => {
    if (!order) return 0;
    return parseFloat(order.totalAmount);
  }, [order]);

  const receivedAmount = useMemo(() => {
    const val = parseFloat(paymentReceived);
    return isNaN(val) ? 0 : val;
  }, [paymentReceived]);

  const changeAmount = useMemo(() => {
    return Math.max(0, receivedAmount - totalAmount);
  }, [receivedAmount, totalAmount]);

  const isPaymentValid = useMemo(() => {
    if (paymentMethod === 'CREDIT') return true; // Credit doesn't need full payment
    return receivedAmount >= totalAmount;
  }, [paymentMethod, receivedAmount, totalAmount]);

  // Complete order mutation
  const completeMutation = useMutation({
    mutationFn: async () => {
      const resp = await api.orders.complete(id!, {
        paymentMethod,
        paymentReceived: receivedAmount || totalAmount,
      });
      return resp.data;
    },
    onSuccess: (data) => {
      const result = data.data as { order?: OrderDetail; sale?: { saleNumber?: string } } | undefined;
      toast.success(`Sale ${result?.sale?.saleNumber || ''} created successfully!`);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      navigate('/orders-queue');
    },
    onError: (err: Error & { response?: { data?: { error?: string } } }) => {
      const msg = err.response?.data?.error || err.message || 'Payment failed';
      toast.error(msg);
    },
  });

  const handleSubmitPayment = () => {
    if (!isPaymentValid || isSubmitting) return;
    setIsSubmitting(true);
    completeMutation.mutate(undefined, {
      onSettled: () => setIsSubmitting(false),
    });
  };

  const handleExactPayment = () => {
    setPaymentReceived(totalAmount.toString());
  };

  // Payment method options
  const paymentMethods: { value: PaymentMethod; label: string; icon: string }[] = [
    { value: 'CASH', label: 'Cash', icon: '💵' },
    { value: 'CARD', label: 'Card', icon: '💳' },
    { value: 'MOBILE_MONEY', label: 'Mobile Money', icon: '📱' },
    { value: 'DEPOSIT', label: 'Deposit', icon: '🏦' },
    { value: 'CREDIT', label: 'Credit', icon: '📝' },
  ];

  if (isLoading) {
    return (
      <Layout>
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      </Layout>
    );
  }

  if (error || !order) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto py-12 text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Order Not Found</h2>
          <p className="text-gray-500 mb-4">This order may have been completed or cancelled.</p>
          <button onClick={() => navigate('/orders-queue')} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">
            Back to Queue
          </button>
        </div>
      </Layout>
    );
  }

  if (order.status !== 'PENDING') {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto py-12 text-center">
          <div className="text-5xl mb-4">{order.status === 'COMPLETED' ? '✅' : '❌'}</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Order {order.orderNumber}</h2>
          <p className="text-gray-500 mb-4">This order is already {order.status.toLowerCase()}.</p>
          <button onClick={() => navigate('/orders-queue')} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">
            Back to Queue
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <button onClick={() => navigate('/orders-queue')} className="text-sm text-blue-600 hover:text-blue-800 mb-2 flex items-center gap-1">
              ← Back to Queue
            </button>
            <h1 className="text-2xl font-bold text-gray-900">Complete Order {order.orderNumber}</h1>
            <p className="text-sm text-gray-500 mt-1">
              Created by {order.createdByName || 'Unknown'} • {order.orderDate}
              {order.customerName && ` • Customer: ${order.customerName}`}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left: Order Items (read-only) */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">Order Items</h2>
                <p className="text-xs text-gray-500">{order.items.length} item{order.items.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="divide-y divide-gray-100">
                {order.items.map((item) => (
                  <div key={item.id} className="px-5 py-3 flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{item.productName}</p>
                      <p className="text-xs text-gray-500">
                        {parseFloat(item.quantity)} × {formatCurrency(parseFloat(item.unitPrice))}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-gray-900 ml-3">
                      {formatCurrency(parseFloat(item.lineTotal))}
                    </span>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 space-y-2">
                {parseFloat(order.discountAmount) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Discount</span>
                    <span className="text-red-600">-{formatCurrency(parseFloat(order.discountAmount))}</span>
                  </div>
                )}
                {parseFloat(order.taxAmount) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Tax</span>
                    <span className="text-gray-700">{formatCurrency(parseFloat(order.taxAmount))}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold border-t border-gray-200 pt-2">
                  <span>Total</span>
                  <span>{formatCurrency(totalAmount)}</span>
                </div>
              </div>

              {/* Notes */}
              {order.notes && (
                <div className="px-5 py-3 bg-amber-50 border-t border-amber-100">
                  <p className="text-xs text-amber-700"><strong>Note:</strong> {order.notes}</p>
                </div>
              )}
            </div>
          </div>

          {/* Right: Payment Panel */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm sticky top-4">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">Payment</h2>
              </div>
              <div className="px-5 py-4 space-y-5">
                {/* Payment Method */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                    Payment Method
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {paymentMethods.map((method) => (
                      <button
                        key={method.value}
                        onClick={() => setPaymentMethod(method.value)}
                        className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors flex items-center gap-2 ${paymentMethod === method.value
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                          }`}
                      >
                        <span>{method.icon}</span>
                        {method.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Amount Due */}
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Amount Due</p>
                  <p className="text-3xl font-bold text-gray-900">{formatCurrency(totalAmount)}</p>
                </div>

                {/* Payment Received */}
                {paymentMethod !== 'CREDIT' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                      Amount Received
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={paymentReceived}
                        onChange={(e) => setPaymentReceived(e.target.value)}
                        placeholder="0"
                        className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg font-semibold text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                        min={0}
                        step="any"
                        autoFocus
                      />
                    </div>
                    <button
                      onClick={handleExactPayment}
                      className="mt-2 w-full px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                    >
                      Exact Amount ({formatCurrency(totalAmount)})
                    </button>
                  </div>
                )}

                {/* Change */}
                {changeAmount > 0 && paymentMethod !== 'CREDIT' && (
                  <div className="bg-green-50 rounded-lg p-4 text-center">
                    <p className="text-xs text-green-600 uppercase tracking-wide mb-1">Change</p>
                    <p className="text-2xl font-bold text-green-700">{formatCurrency(changeAmount)}</p>
                  </div>
                )}

                {/* Submit */}
                <button
                  onClick={handleSubmitPayment}
                  disabled={!isPaymentValid || isSubmitting}
                  className="w-full py-4 bg-green-600 text-white rounded-xl text-lg font-bold hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Processing...' : `Complete Sale — ${formatCurrency(totalAmount)}`}
                </button>

                {!isPaymentValid && paymentMethod !== 'CREDIT' && receivedAmount > 0 && (
                  <p className="text-xs text-red-500 text-center">
                    Insufficient payment. Need {formatCurrency(totalAmount - receivedAmount)} more.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
