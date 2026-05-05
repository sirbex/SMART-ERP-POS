import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSupplier, useSupplierPerformance, useSupplierOrders, useSupplierProducts } from '../../hooks/useSuppliers';
import { formatCurrency } from '../../utils/currency';
import Decimal from 'decimal.js';
import type { Supplier } from '../../types/business';
import SupplierPOItemsInline from '../../components/suppliers/SupplierPOItemsInline';

/** Performance metrics returned by GET /suppliers/:id/performance */
interface SupplierPerformanceData {
  totalOrders: number;
  completedOrders: number;
  draftOrders: number;
  pendingOrders: number;
  totalValue: number | string;
  outstandingAmount: number | string;
  uniqueProducts: number;
  lastOrderDate: string | null;
}

/** Order row returned by GET /suppliers/:id/orders */
interface SupplierOrderRow {
  id: string;
  poNumber: string;
  orderDate: string;
  expectedDelivery?: string;
  status: 'DRAFT' | 'PENDING' | 'COMPLETED' | 'CANCELLED';
  totalAmount: number;
  notes?: string;
}

// TIMEZONE STRATEGY: Display dates without conversion
// Backend returns DATE as YYYY-MM-DD string (no timezone)
// Frontend displays as-is without parsing to Date object
const formatDisplayDate = (dateString: string | null | undefined): string => {
  if (!dateString) return 'N/A';

  // If it's an ISO string, extract the date part
  if (dateString.includes('T')) {
    return dateString.split('T')[0];
  }

  return dateString;
};

type TabType = 'information' | 'performance' | 'orders' | 'products';

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('information');

  // Fetch supplier data
  const { data: supplierData, isLoading: supplierLoading } = useSupplier(id!);
  const { data: performanceData, isLoading: performanceLoading } = useSupplierPerformance(id!);
  const { data: ordersData, isLoading: ordersLoading } = useSupplierOrders(id!, { page: 1, limit: 20 });
  const { data: productsData, isLoading: productsLoading } = useSupplierProducts(id!);

  const supplier = supplierData?.data as Supplier | undefined;
  const performance = performanceData?.data as SupplierPerformanceData | undefined;
  const orders = ordersData?.data as SupplierOrderRow[] | undefined;
  const products = productsData?.data;

  if (supplierLoading) {
    return (
      <div className="p-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-blue-800">Loading supplier details...</p>
        </div>
      </div>
    );
  }

  if (!supplier) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Supplier not found</p>
        </div>
      </div>
    );
  }

  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'information', label: 'Information', icon: 'ℹ️' },
    { id: 'performance', label: 'Performance', icon: '📊' },
    { id: 'orders', label: 'Purchase Orders', icon: '📦' },
    { id: 'products', label: 'Items Supplied', icon: '🏷️' },
  ];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <button
            onClick={() => navigate('/suppliers')}
            className="text-blue-600 hover:text-blue-800 mb-2 flex items-center gap-2"
          >
            ← Back to Suppliers
          </button>
          <h2 className="text-2xl font-bold text-gray-900">{supplier.name}</h2>
          <p className="text-gray-600 mt-1">Complete supplier information and analytics</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate(`/suppliers/${id}/edit`)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            ✏️ Edit
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6 overflow-x-auto">
        <nav className="-mb-px flex space-x-4 sm:space-x-8 min-w-max">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                py-3 sm:py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap
                ${activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'information' && <InformationTab supplier={supplier} />}
        {activeTab === 'performance' && (
          <PerformanceTab
            performance={performance}
            loading={performanceLoading}
          />
        )}
        {activeTab === 'orders' && (
          <OrdersTab
            orders={orders}
            loading={ordersLoading}
          />
        )}
        {activeTab === 'products' && (
          <ProductsTab
            supplierId={id!}
            products={products}
            loading={productsLoading}
          />
        )}
      </div>
    </div>
  );
}

// Information Tab Component
function InformationTab({ supplier }: { supplier: Supplier }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Supplier Information</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Name</label>
          <p className="text-gray-900">{supplier.name}</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Contact Person</label>
          <p className="text-gray-900">{supplier.contactPerson || '-'}</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Email</label>
          <p className="text-gray-900">{supplier.email || '-'}</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Phone</label>
          <p className="text-gray-900">{supplier.phone || '-'}</p>
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-600 mb-1">Address</label>
          <p className="text-gray-900">{supplier.address || '-'}</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Payment Terms</label>
          <p className="text-gray-900">{supplier.paymentTerms || '-'}</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Status</label>
          <span
            className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${supplier.isActive
              ? 'bg-green-100 text-green-800'
              : 'bg-gray-100 text-gray-800'
              }`}
          >
            {supplier.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Created</label>
          <p className="text-gray-900">
            {formatDisplayDate(supplier.createdAt)}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Last Updated</label>
          <p className="text-gray-900">
            {formatDisplayDate(supplier.updatedAt)}
          </p>
        </div>
      </div>
    </div>
  );
}

// Performance Tab Component
function PerformanceTab({ performance, loading }: { performance: SupplierPerformanceData | undefined; loading: boolean }) {
  if (loading) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-blue-800">Loading performance metrics...</p>
      </div>
    );
  }

  if (!performance) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <p className="text-gray-600">No performance data available</p>
      </div>
    );
  }

  // Use Decimal.js for bank-grade precision
  const totalValue = new Decimal(performance.totalValue || 0);
  const outstandingAmount = new Decimal(performance.outstandingAmount || 0);
  const avgOrderValue = performance.totalOrders > 0
    ? totalValue.dividedBy(performance.totalOrders)
    : new Decimal(0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Total Orders</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{performance.totalOrders}</div>
          <div className="text-xs text-gray-500 mt-1">
            {performance.completedOrders} completed
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Total Value</div>
          <div className="text-2xl font-bold text-green-600 mt-1">
            {formatCurrency(totalValue.toNumber())}
          </div>
          <div className="text-xs text-gray-500 mt-1">All orders</div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Outstanding</div>
          <div className="text-2xl font-bold text-orange-600 mt-1">
            {formatCurrency(outstandingAmount.toNumber())}
          </div>
          <div className="text-xs text-gray-500 mt-1">Pending/Completed</div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Avg Order Value</div>
          <div className="text-2xl font-bold text-blue-600 mt-1">
            {formatCurrency(avgOrderValue.toNumber())}
          </div>
          <div className="text-xs text-gray-500 mt-1">Per order</div>
        </div>
      </div>

      {/* Detailed Metrics */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Order Status Breakdown</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border rounded-lg p-4">
            <div className="text-sm text-gray-600">Draft Orders</div>
            <div className="text-xl font-bold text-gray-700 mt-1">{performance.draftOrders}</div>
          </div>

          <div className="border rounded-lg p-4">
            <div className="text-sm text-gray-600">Pending Orders</div>
            <div className="text-xl font-bold text-yellow-600 mt-1">{performance.pendingOrders}</div>
          </div>

          <div className="border rounded-lg p-4">
            <div className="text-sm text-gray-600">Completed Orders</div>
            <div className="text-xl font-bold text-green-600 mt-1">{performance.completedOrders}</div>
          </div>
        </div>
      </div>

      {/* Additional Insights */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Supply Insights</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-gray-600 mb-1">Unique Products Supplied</div>
            <div className="text-2xl font-bold text-gray-900">{performance.uniqueProducts}</div>
          </div>

          <div>
            <div className="text-sm text-gray-600 mb-1">Last Order Date</div>
            <div className="text-lg font-medium text-gray-900">
              {performance.lastOrderDate
                ? formatDisplayDate(performance.lastOrderDate)
                : 'No orders yet'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Orders Tab Component — inline expandable master–detail grid
function OrdersTab({ orders, loading }: { orders: SupplierOrderRow[] | undefined; loading: boolean }) {
  const [expandedPOId, setExpandedPOId] = useState<string | null>(null);

  const togglePO = (id: string) => {
    setExpandedPOId((prev) => (prev === id ? null : id));
  };

  if (loading) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-blue-800">Loading purchase orders...</p>
      </div>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <p className="text-gray-600">No purchase orders found</p>
      </div>
    );
  }

  const statusColors = {
    DRAFT: 'bg-gray-100 text-gray-800',
    PENDING: 'bg-yellow-100 text-yellow-800',
    COMPLETED: 'bg-green-100 text-green-800',
    CANCELLED: 'bg-red-100 text-red-800',
  };

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8" />
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                PO Number
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Order Date
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Expected Delivery
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Total Amount
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {orders.map((order) => (
              <>
                {/* Master row — clickable */}
                <tr
                  key={order.id}
                  onClick={() => togglePO(order.id)}
                  className="cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-4 whitespace-nowrap text-gray-400 text-xs select-none">
                    {expandedPOId === order.id ? '▼' : '▶'}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-blue-600">{order.poNumber}</div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {formatDisplayDate(order.orderDate)}
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {order.expectedDelivery ? formatDisplayDate(order.expectedDelivery) : '—'}
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${statusColors[order.status as keyof typeof statusColors] ?? 'bg-gray-100 text-gray-800'
                        }`}
                    >
                      {order.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-right">
                    <div className="text-sm font-medium text-gray-900">
                      {formatCurrency(order.totalAmount)}
                    </div>
                  </td>
                </tr>

                {/* Inline detail row */}
                {expandedPOId === order.id && (
                  <tr key={`${order.id}-detail`}>
                    <td colSpan={6} className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                      <div className="mb-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Items — {order.poNumber}
                      </div>
                      <SupplierPOItemsInline poId={order.id} />
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Products Tab Component — inline expandable view of items supplied per PO
function ProductsTab({ supplierId, loading }: { supplierId: string; products: unknown; loading: boolean }) {
  const [expandedPOId, setExpandedPOId] = useState<string | null>(null);

  const { data: ordersData, isLoading: ordersLoading } = useSupplierOrders(supplierId, { page: 1, limit: 100 });
  const orders = ordersData?.data as SupplierOrderRow[] | undefined;

  const togglePO = (id: string) => {
    setExpandedPOId((prev) => (prev === id ? null : id));
  };

  if (ordersLoading || loading) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-blue-800">Loading purchase orders...</p>
      </div>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <p className="text-gray-600">No purchase orders found</p>
      </div>
    );
  }

  const statusColors = {
    DRAFT: 'bg-gray-100 text-gray-800',
    PENDING: 'bg-yellow-100 text-yellow-800',
    COMPLETED: 'bg-green-100 text-green-800',
    CANCELLED: 'bg-red-100 text-red-800',
  };

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">Items Supplied per Purchase Order</h3>
        <p className="text-sm text-gray-600 mt-1">Click a row to see line items for that order</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 w-8" />
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                PO Number
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Order Date
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Total Amount
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {orders.map((order) => (
              <>
                <tr
                  key={order.id}
                  onClick={() => togglePO(order.id)}
                  className="cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-4 whitespace-nowrap text-gray-400 text-xs select-none">
                    {expandedPOId === order.id ? '▼' : '▶'}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-blue-600">{order.poNumber}</div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{formatDisplayDate(order.orderDate)}</div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${statusColors[order.status as keyof typeof statusColors] ?? 'bg-gray-100 text-gray-800'
                        }`}
                    >
                      {order.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-right">
                    <div className="text-sm font-medium text-gray-900">
                      {formatCurrency(order.totalAmount)}
                    </div>
                  </td>
                </tr>

                {expandedPOId === order.id && (
                  <tr key={`${order.id}-detail`}>
                    <td colSpan={5} className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                      <div className="mb-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Items — {order.poNumber}
                      </div>
                      <SupplierPOItemsInline poId={order.id} />
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}



