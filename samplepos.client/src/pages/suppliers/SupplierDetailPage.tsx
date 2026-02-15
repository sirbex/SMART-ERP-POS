import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSupplier, useSupplierPerformance, useSupplierOrders, useSupplierProducts } from '../../hooks/useSuppliers';
import { formatCurrency } from '../../utils/currency';
import Decimal from 'decimal.js';

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

  const supplier = supplierData?.data;
  const performance = performanceData?.data;
  const orders = ordersData?.data;
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
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap
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
function InformationTab({ supplier }: { supplier: any }) {
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
function PerformanceTab({ performance, loading }: { performance: any; loading: boolean }) {
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

// Orders Tab Component
function OrdersTab({ orders, loading }: { orders: any; loading: boolean }) {
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
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Notes
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {orders.map((order: any) => (
              <tr key={order.id} className="hover:bg-gray-50">
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
                    {order.expectedDelivery
                      ? formatDisplayDate(order.expectedDelivery)
                      : '-'}
                  </div>
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                  <span
                    className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${statusColors[order.status as keyof typeof statusColors] ||
                      'bg-gray-100 text-gray-800'
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
                <td className="px-4 py-4">
                  <div className="text-sm text-gray-600 max-w-xs truncate">
                    {order.notes || '-'}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Products Tab Component - Shows Purchase Orders with View Items
function ProductsTab({ supplierId, loading }: { supplierId: string; products: any; loading: boolean }) {
  const [selectedPO, setSelectedPO] = useState<any>(null);
  const [poItems, setPOItems] = useState<any[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  // Fetch orders data instead
  const { data: ordersData, isLoading: ordersLoading } = useSupplierOrders(supplierId, { page: 1, limit: 100 });
  const orders = ordersData?.data;

  const loadPOItems = async (poId: string) => {
    setLoadingItems(true);
    try {
      const response = await fetch(`http://localhost:3001/api/purchase-orders/${poId}/items`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
        },
      });
      const data = await response.json();
      if (data.success) {
        setPOItems(data.data);
        const po = orders?.find((o: any) => o.id === poId);
        setSelectedPO(po);
      }
    } catch (error) {
      console.error('Failed to load PO items:', error);
    } finally {
      setLoadingItems(false);
    }
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
    <div className="space-y-6">
      {/* Purchase Orders Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Purchase Orders</h3>
          <p className="text-sm text-gray-600 mt-1">View items and costs for each purchase order</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
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
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {orders.map((order: any) => (
                <tr key={order.id} className="hover:bg-gray-50">
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-blue-600">{order.poNumber}</div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {formatDisplayDate(order.orderDate)}
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${statusColors[order.status as keyof typeof statusColors] ||
                        'bg-gray-100 text-gray-800'
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
                  <td className="px-4 py-4 whitespace-nowrap text-center">
                    <button
                      onClick={() => loadPOItems(order.id)}
                      className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                    >
                      View Items
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Items Modal/Panel */}
      {selectedPO && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Items for {selectedPO.poNumber}
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Order Date: {formatDisplayDate(selectedPO.orderDate)} •
                Total: {formatCurrency(selectedPO.totalAmount)}
              </p>
            </div>
            <button
              onClick={() => {
                setSelectedPO(null);
                setPOItems([]);
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>

          {loadingItems ? (
            <div className="p-6 text-center">
              <p className="text-gray-600">Loading items...</p>
            </div>
          ) : poItems.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-gray-600">No items found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Product
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ordered Qty
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Received Qty
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Unit Price
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Price
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {poItems.map((item: any) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4">
                        <div className="text-sm font-medium text-gray-900">{item.productName}</div>
                        <div className="text-xs text-gray-500">{item.sku}</div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-right">
                        <div className="text-sm text-gray-900">
                          {new Decimal(item.orderedQuantity || 0).toFixed(2)}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-right">
                        <div className="text-sm text-gray-900">
                          {new Decimal(item.receivedQuantity || 0).toFixed(2)}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-right">
                        <div className="text-sm text-gray-900">
                          {formatCurrency(item.unitPrice)}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-right">
                        <div className="text-sm font-medium text-gray-900">
                          {formatCurrency(item.totalPrice)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td colSpan={4} className="px-4 py-4 text-right text-sm font-semibold text-gray-900">
                      Total Cost:
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-right">
                      <div className="text-sm font-bold text-gray-900">
                        {formatCurrency(
                          poItems.reduce((sum, item) =>
                            sum + parseFloat(item.totalPrice || 0), 0
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
