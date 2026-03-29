/**
 * Delivery Management Page
 * Full CRUD for delivery orders, routes, tracking, and analytics.
 * Uses tabs: Orders | Routes | Analytics | Track
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Layout from '../../components/Layout';
import deliveryApi from '../../api/delivery';
import type { DeliveryAnalytics, DeliverableSale } from '../../api/delivery';
import { formatCurrency } from '../../utils/currency';
import apiClient from '../../utils/api';
import type {
  DeliveryOrder,
  DeliveryStatus,
  RouteStatus,
  CreateDeliveryOrderRequest,
  UpdateDeliveryStatusRequest,
  CreateDeliveryRouteRequest,
} from '@shared/types/delivery';

// ── Status helpers ────────────────────────────────────────────

const STATUS_COLORS: Record<DeliveryStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  ASSIGNED: 'bg-blue-100 text-blue-800',
  IN_TRANSIT: 'bg-indigo-100 text-indigo-800',
  DELIVERED: 'bg-green-100 text-green-800',
  FAILED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-gray-100 text-gray-800',
};

const ROUTE_STATUS_COLORS: Record<RouteStatus, string> = {
  PLANNED: 'bg-yellow-100 text-yellow-800',
  IN_PROGRESS: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-gray-100 text-gray-800',
};

const STATUS_ICONS: Record<DeliveryStatus, string> = {
  PENDING: '⏳',
  ASSIGNED: '👤',
  IN_TRANSIT: '🚚',
  DELIVERED: '✅',
  FAILED: '❌',
  CANCELLED: '🚫',
};

type TabType = 'orders' | 'routes' | 'analytics' | 'track';

// ── Main Page ─────────────────────────────────────────────────

export default function DeliveryPage() {
  const [activeTab, setActiveTab] = useState<TabType>('orders');

  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'orders', label: 'Delivery Orders', icon: '📦' },
    { id: 'routes', label: 'Routes', icon: '🗺️' },
    { id: 'analytics', label: 'Analytics', icon: '📊' },
    { id: 'track', label: 'Track', icon: '🔍' },
  ];

  return (
    <Layout>
      <div className="p-6 lg:p-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Delivery Management</h1>
          <p className="text-gray-600 mt-1">Manage delivery orders, routes, drivers, and tracking</p>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="flex gap-1" aria-label="Delivery tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium rounded-t-lg transition-colors ${activeTab === tab.id
                  ? 'bg-white text-blue-700 border border-gray-200 border-b-white -mb-px'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                aria-selected={activeTab === tab.id}
                role="tab"
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'orders' && <DeliveryOrdersTab />}
        {activeTab === 'routes' && <RoutesTab />}
        {activeTab === 'analytics' && <AnalyticsTab />}
        {activeTab === 'track' && <TrackingTab />}
      </div>
    </Layout>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB: DELIVERY ORDERS
// ═══════════════════════════════════════════════════════════════

function DeliveryOrdersTab() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<DeliveryStatus | 'ALL'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showFromSaleModal, setShowFromSaleModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<DeliveryOrder | null>(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showDriverModal, setShowDriverModal] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['delivery-orders', page, statusFilter, searchTerm],
    queryFn: () =>
      deliveryApi.searchOrders({
        page,
        limit: 20,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        search: searchTerm || undefined,
      }),
  });

  const orders = data?.orders || [];
  const pagination = data?.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 };

  // Stats from current data
  const stats = useMemo(() => {
    const all = orders;
    return {
      total: pagination.total,
      pending: all.filter((o) => o.status === 'PENDING').length,
      inTransit: all.filter((o) => o.status === 'IN_TRANSIT').length,
      delivered: all.filter((o) => o.status === 'DELIVERED').length,
      failed: all.filter((o) => o.status === 'FAILED').length,
    };
  }, [orders, pagination.total]);

  return (
    <div>
      {/* Stats Cards */}
      <div className="mb-6 grid grid-cols-2 sm:grid-cols-5 gap-4">
        <StatCard label="Total" value={stats.total} borderColor="border-blue-500" />
        <StatCard label="Pending" value={stats.pending} borderColor="border-yellow-500" />
        <StatCard label="In Transit" value={stats.inTransit} borderColor="border-indigo-500" />
        <StatCard label="Delivered" value={stats.delivered} borderColor="border-green-500" />
        <StatCard label="Failed" value={stats.failed} borderColor="border-red-500" />
      </div>

      {/* Controls */}
      <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 w-full sm:w-auto">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
            placeholder="Search by delivery number, customer, address..."
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as DeliveryStatus | 'ALL'); setPage(1); }}
            className="px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="ALL">All Status</option>
            <option value="PENDING">Pending</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="IN_TRANSIT">In Transit</option>
            <option value="DELIVERED">Delivered</option>
            <option value="FAILED">Failed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFromSaleModal(true)}
            className="px-5 py-2.5 bg-white hover:bg-gray-50 text-blue-700 border border-blue-300 rounded-lg font-semibold shadow-sm transition-all whitespace-nowrap"
          >
            📋 From Sale
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow transition-all whitespace-nowrap"
          >
            + New Delivery
          </button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : error ? (
        <div className="text-center py-12 text-red-600">
          Failed to load delivery orders. {(error as Error).message}
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-xl mb-2">📦</p>
          <p>No delivery orders found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Delivery #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Address</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Driver</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fee</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-blue-700">{order.deliveryNumber}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{order.customerName || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-[200px] truncate">{order.deliveryAddress}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{order.deliveryDate}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{order.assignedDriverName || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[order.status]}`}>
                        {STATUS_ICONS[order.status]} {order.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">{formatCurrency(order.deliveryFee)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setSelectedOrder(order)}
                          className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                          title="View details"
                        >
                          👁️
                        </button>
                        {order.status !== 'DELIVERED' && order.status !== 'CANCELLED' && (
                          <>
                            <button
                              onClick={() => { setSelectedOrder(order); setShowStatusModal(true); }}
                              className="px-2 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 rounded transition-colors"
                              title="Update status"
                            >
                              📍
                            </button>
                            {!order.assignedDriverId && (
                              <button
                                onClick={() => { setSelectedOrder(order); setShowDriverModal(true); }}
                                className="px-2 py-1 text-xs bg-green-50 hover:bg-green-100 text-green-700 rounded transition-colors"
                                title="Assign driver"
                              >
                                🚗
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
              <p className="text-sm text-gray-600">
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
              </p>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Detail Modal */}
      {selectedOrder && !showStatusModal && !showDriverModal && (
        <DeliveryDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
        />
      )}

      {/* Status Update Modal */}
      {showStatusModal && selectedOrder && (
        <StatusUpdateModal
          order={selectedOrder}
          onClose={() => { setShowStatusModal(false); setSelectedOrder(null); }}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['delivery-orders'] });
            setShowStatusModal(false);
            setSelectedOrder(null);
          }}
        />
      )}

      {/* Driver Assign Modal */}
      {showDriverModal && selectedOrder && (
        <DriverAssignModal
          order={selectedOrder}
          onClose={() => { setShowDriverModal(false); setSelectedOrder(null); }}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['delivery-orders'] });
            setShowDriverModal(false);
            setSelectedOrder(null);
          }}
        />
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreateDeliveryModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['delivery-orders'] });
            setShowCreateModal(false);
          }}
        />
      )}

      {/* Create from Sale Modal (Tally-style) */}
      {showFromSaleModal && (
        <CreateFromSaleModal
          onClose={() => setShowFromSaleModal(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['delivery-orders'] });
            setShowFromSaleModal(false);
          }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB: ROUTES
// ═══════════════════════════════════════════════════════════════

function RoutesTab() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [showCreateRoute, setShowCreateRoute] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['delivery-routes', page],
    queryFn: () => deliveryApi.searchRoutes({ page, limit: 20 }),
  });

  const routes = data?.routes || [];
  const pagination = data?.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Delivery Routes</h2>
        <button
          onClick={() => setShowCreateRoute(true)}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow transition-all"
        >
          + Plan Route
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : error ? (
        <div className="text-center py-12 text-red-600">
          Failed to load routes. {(error as Error).message}
        </div>
      ) : routes.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-xl mb-2">🗺️</p>
          <p>No delivery routes planned.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {routes.map((route) => (
            <div key={route.id} className="bg-white rounded-lg shadow p-5 border-l-4 border-blue-500">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900">{route.routeName}</h3>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${ROUTE_STATUS_COLORS[route.status]}`}>
                  {route.status.replace('_', ' ')}
                </span>
              </div>
              <div className="space-y-1.5 text-sm text-gray-600">
                <p>📅 Date: {route.routeDate}</p>
                <p>👤 Driver: {route.driverName || 'Unassigned'}</p>
                <p>🚗 Vehicle: {route.vehiclePlateNumber || '—'}</p>
                <p>📦 Deliveries: {route.completedDeliveries ?? 0}/{route.totalDeliveries ?? 0}</p>
                {route.totalDistanceKm != null && (
                  <p>📏 Distance: {route.totalDistanceKm.toFixed(1)} km</p>
                )}
                {route.routeEfficiencyScore != null && (
                  <p>⭐ Efficiency: {route.routeEfficiencyScore.toFixed(0)}%</p>
                )}
              </div>
              {route.plannedStartTime && (
                <div className="mt-3 pt-3 border-t text-xs text-gray-500">
                  Start: {route.plannedStartTime} → End: {route.plannedEndTime || '—'}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {pagination.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-gray-600">Page {pagination.page} of {pagination.totalPages}</p>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-50">Previous</button>
            <button disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-50">Next</button>
          </div>
        </div>
      )}

      {showCreateRoute && (
        <CreateRouteModal
          onClose={() => setShowCreateRoute(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['delivery-routes'] });
            setShowCreateRoute(false);
          }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB: ANALYTICS
// ═══════════════════════════════════════════════════════════════

function AnalyticsTab() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['delivery-analytics'],
    queryFn: () => deliveryApi.getAnalytics(),
  });

  const analytics: DeliveryAnalytics | null = data ?? null;

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Delivery Performance Dashboard</h2>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : error ? (
        <div className="text-center py-12 text-red-600">
          Failed to load analytics. {(error as Error).message}
        </div>
      ) : !analytics ? (
        <div className="text-center py-12 text-gray-500">No analytics data available</div>
      ) : (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow p-5">
              <p className="text-sm text-gray-600">Total Deliveries</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{analytics.totalDeliveries}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-5">
              <p className="text-sm text-gray-600">Success Rate</p>
              <p className="text-3xl font-bold text-green-600 mt-1">
                {analytics.deliverySuccessRate.toFixed(1)}%
              </p>
            </div>
            <div className="bg-white rounded-lg shadow p-5">
              <p className="text-sm text-gray-600">In Transit</p>
              <p className="text-3xl font-bold text-indigo-600 mt-1">{analytics.inTransitDeliveries}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-5">
              <p className="text-sm text-gray-600">Pending</p>
              <p className="text-3xl font-bold text-yellow-600 mt-1">{analytics.pendingDeliveries}</p>
            </div>
          </div>

          {/* Financial Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg shadow p-5 border-l-4 border-green-500">
              <p className="text-sm text-gray-600">Total Fee Revenue</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(analytics.totalRevenue)}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-5 border-l-4 border-red-500">
              <p className="text-sm text-gray-600">Total Delivery Cost</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(analytics.totalCost)}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-5 border-l-4 border-blue-500">
              <p className="text-sm text-gray-600">Net Delivery Profit</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {formatCurrency(analytics.totalRevenue - analytics.totalCost)}
              </p>
            </div>
          </div>

          {/* Status Breakdown */}
          <div className="bg-white rounded-lg shadow p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Status Breakdown</h3>
            <div className="space-y-3">
              {[
                { label: 'Completed', value: analytics.completedDeliveries, color: 'bg-green-500' },
                { label: 'In Transit', value: analytics.inTransitDeliveries, color: 'bg-indigo-500' },
                { label: 'Pending', value: analytics.pendingDeliveries, color: 'bg-yellow-500' },
                { label: 'Failed', value: analytics.failedDeliveries, color: 'bg-red-500' },
              ].map((item) => {
                const pct = analytics.totalDeliveries > 0 ? (item.value / analytics.totalDeliveries) * 100 : 0;
                return (
                  <div key={item.label} className="flex items-center gap-3">
                    <span className="w-24 text-sm text-gray-600">{item.label}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                      <div className={`h-full rounded-full ${item.color}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-12 text-sm text-gray-900 text-right">{item.value}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB: TRACKING
// ═══════════════════════════════════════════════════════════════

function TrackingTab() {
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackedOrder, setTrackedOrder] = useState<DeliveryOrder | null>(null);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [isTracking, setIsTracking] = useState(false);

  const handleTrack = async () => {
    if (!trackingNumber.trim()) return;
    setIsTracking(true);
    setTrackError(null);
    setTrackedOrder(null);

    try {
      const result = await deliveryApi.trackDelivery(trackingNumber.trim());
      setTrackedOrder(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Delivery not found';
      setTrackError(message);
    } finally {
      setIsTracking(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Track Delivery</h2>
      <p className="text-gray-600 mb-6">Enter a tracking number (TRK-...) or delivery number (DEL-...) to check status.</p>

      <div className="flex gap-3">
        <input
          type="text"
          value={trackingNumber}
          onChange={(e) => setTrackingNumber(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleTrack()}
          placeholder="e.g. TRK-2025-059-00001 or DEL-2025-0001"
          className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
        />
        <button
          onClick={handleTrack}
          disabled={isTracking || !trackingNumber.trim()}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {isTracking ? 'Tracking...' : '🔍 Track'}
        </button>
      </div>

      {trackError && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {trackError}
        </div>
      )}

      {trackedOrder && (
        <div className="mt-6 bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-gray-900">{trackedOrder.deliveryNumber}</h3>
            <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${STATUS_COLORS[trackedOrder.status]}`}>
              {STATUS_ICONS[trackedOrder.status]} {trackedOrder.status.replace('_', ' ')}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Customer</p>
              <p className="font-medium">{trackedOrder.customerName || '—'}</p>
            </div>
            <div>
              <p className="text-gray-500">Delivery Date</p>
              <p className="font-medium">{trackedOrder.deliveryDate}</p>
            </div>
            <div className="md:col-span-2">
              <p className="text-gray-500">Delivery Address</p>
              <p className="font-medium">{trackedOrder.deliveryAddress}</p>
            </div>
            <div>
              <p className="text-gray-500">Driver</p>
              <p className="font-medium">{trackedOrder.assignedDriverName || 'Not assigned'}</p>
            </div>
            <div>
              <p className="text-gray-500">Tracking Number</p>
              <p className="font-medium font-mono">{trackedOrder.trackingNumber || '—'}</p>
            </div>
            {trackedOrder.specialInstructions && (
              <div className="md:col-span-2">
                <p className="text-gray-500">Special Instructions</p>
                <p className="font-medium">{trackedOrder.specialInstructions}</p>
              </div>
            )}
          </div>

          {/* Progress Timeline */}
          <div className="mt-6 pt-4 border-t">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">Delivery Progress</h4>
            <DeliveryTimeline status={trackedOrder.status} />
          </div>

          {/* Status History Log */}
          {trackedOrder.statusHistory && trackedOrder.statusHistory.length > 0 && (
            <div className="mt-6 pt-4 border-t">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Status History</h4>
              <div className="space-y-2">
                {trackedOrder.statusHistory.map((h, idx) => (
                  <div key={h.id || idx} className="flex items-start gap-3 text-sm">
                    <div className="w-2 h-2 mt-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[h.newStatus]}`}>
                          {h.newStatus.replace('_', ' ')}
                        </span>
                        {h.locationName && <span className="text-gray-500 text-xs">{h.locationName}</span>}
                      </div>
                      {h.notes && <p className="text-gray-600 text-xs mt-0.5">{h.notes}</p>}
                      <p className="text-gray-400 text-xs mt-0.5">
                        {new Date(h.statusDate).toLocaleString()}
                        {h.changedByName && ` — ${h.changedByName}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════════

function StatCard({ label, value, borderColor }: { label: string; value: number; borderColor: string }) {
  return (
    <div className={`bg-white rounded-lg shadow p-4 border-l-4 ${borderColor}`}>
      <p className="text-sm text-gray-600">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function DeliveryTimeline({ status }: { status: DeliveryStatus }) {
  const steps: { status: DeliveryStatus; label: string; icon: string }[] = [
    { status: 'PENDING', label: 'Created', icon: '📋' },
    { status: 'ASSIGNED', label: 'Driver Assigned', icon: '👤' },
    { status: 'IN_TRANSIT', label: 'In Transit', icon: '🚚' },
    { status: 'DELIVERED', label: 'Delivered', icon: '✅' },
  ];

  const statusOrder: DeliveryStatus[] = ['PENDING', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED'];
  const currentIdx = statusOrder.indexOf(status);
  const isFailed = status === 'FAILED';
  const isCancelled = status === 'CANCELLED';

  return (
    <div className="flex items-center">
      {steps.map((step, idx) => {
        const isComplete = currentIdx >= idx;
        const isCurrent = currentIdx === idx;
        return (
          <div key={step.status} className="flex items-center flex-1">
            <div className={`flex flex-col items-center ${idx > 0 ? 'flex-1' : ''}`}>
              {idx > 0 && (
                <div className={`h-0.5 w-full mb-2 ${isComplete ? 'bg-green-500' : 'bg-gray-200'}`} />
              )}
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${isFailed || isCancelled
                  ? 'bg-gray-100 text-gray-400'
                  : isComplete
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-400'
                  } ${isCurrent ? 'ring-2 ring-green-400 ring-offset-2' : ''}`}
              >
                {step.icon}
              </div>
              <span className={`text-xs mt-1 ${isComplete ? 'text-green-700 font-medium' : 'text-gray-400'}`}>
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
      {(isFailed || isCancelled) && (
        <div className="flex flex-col items-center ml-4">
          <div className="w-10 h-10 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-lg ring-2 ring-red-400 ring-offset-2">
            {isFailed ? '❌' : '🚫'}
          </div>
          <span className="text-xs mt-1 text-red-700 font-medium">{isFailed ? 'Failed' : 'Cancelled'}</span>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MODALS
// ═══════════════════════════════════════════════════════════════

function DeliveryDetailModal({ order: initialOrder, onClose }: { order: DeliveryOrder; onClose: () => void }) {
  const [downloading, setDownloading] = useState(false);

  // Fetch full order details (includes items and status history)
  const { data: fullOrder } = useQuery({
    queryKey: ['delivery-order-detail', initialOrder.deliveryNumber],
    queryFn: () => deliveryApi.getOrder(initialOrder.deliveryNumber),
    initialData: initialOrder,
  });

  const order = fullOrder || initialOrder;

  const handlePrintPdf = async () => {
    setDownloading(true);
    try {
      const response = await apiClient.get(
        deliveryApi.getDeliveryNotePdfUrl(order.deliveryNumber),
        { responseType: 'blob' }
      );
      const blob: Blob = response.data as Blob;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `delivery-note-${order.deliveryNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Delivery note downloaded');
    } catch {
      toast.error('Failed to download delivery note');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-[95vw] sm:max-w-2xl w-full max-h-[80vh] overflow-y-auto p-4 sm:p-6" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Delivery order details">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">{order.deliveryNumber}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Close">✕</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mb-6">
          <div>
            <p className="text-gray-500">Status</p>
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[order.status]}`}>
              {STATUS_ICONS[order.status]} {order.status.replace('_', ' ')}
            </span>
          </div>
          <div>
            <p className="text-gray-500">Tracking Number</p>
            <p className="font-medium font-mono">{order.trackingNumber || '—'}</p>
          </div>
          <div>
            <p className="text-gray-500">Customer</p>
            <p className="font-medium">{order.customerName || '—'}</p>
          </div>
          <div>
            <p className="text-gray-500">Contact</p>
            <p className="font-medium">{order.deliveryContactName || '—'} {order.deliveryContactPhone ? `(${order.deliveryContactPhone})` : ''}</p>
          </div>
          <div className="md:col-span-2">
            <p className="text-gray-500">Address</p>
            <p className="font-medium">{order.deliveryAddress}</p>
          </div>
          <div>
            <p className="text-gray-500">Delivery Date</p>
            <p className="font-medium">{order.deliveryDate}</p>
          </div>
          <div>
            <p className="text-gray-500">Driver</p>
            <p className="font-medium">{order.assignedDriverName || 'Unassigned'}</p>
          </div>
          <div>
            <p className="text-gray-500">Delivery Fee</p>
            <p className="font-medium">{formatCurrency(order.deliveryFee)}</p>
          </div>
          <div>
            <p className="text-gray-500">Total Cost</p>
            <p className="font-medium">{order.totalCost != null ? formatCurrency(order.totalCost) : '—'}</p>
          </div>
          {order.specialInstructions && (
            <div className="md:col-span-2">
              <p className="text-gray-500">Special Instructions</p>
              <p className="font-medium">{order.specialInstructions}</p>
            </div>
          )}
        </div>

        {/* Items */}
        {order.items && order.items.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Delivery Items</h3>
            <div className="bg-gray-50 rounded-lg divide-y divide-gray-200">
              {order.items.map((item) => (
                <div key={item.id} className="px-4 py-3 flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium text-gray-900">{item.productName}</p>
                    {item.batchNumber && <p className="text-xs text-gray-500">Batch: {item.batchNumber}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-gray-900">{item.quantityDelivered}/{item.quantityRequested} {item.unitOfMeasure || ''}</p>
                    <span className={`text-xs font-medium ${item.conditionOnDelivery === 'GOOD' ? 'text-green-600' : 'text-red-600'}`}>
                      {item.conditionOnDelivery}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <DeliveryTimeline status={order.status} />

        {/* Status History Log */}
        {order.statusHistory && order.statusHistory.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Status History</h3>
            <div className="space-y-2">
              {order.statusHistory.map((h, idx) => (
                <div key={h.id || idx} className="flex items-start gap-3 text-sm">
                  <div className="w-2 h-2 mt-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[h.newStatus]}`}>
                        {h.newStatus.replace('_', ' ')}
                      </span>
                      {h.locationName && <span className="text-gray-500 text-xs">{h.locationName}</span>}
                    </div>
                    {h.notes && <p className="text-gray-600 text-xs mt-0.5">{h.notes}</p>}
                    <p className="text-gray-400 text-xs mt-0.5">
                      {new Date(h.statusDate).toLocaleString()}
                      {h.changedByName && ` — ${h.changedByName}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-between">
          <button
            onClick={handlePrintPdf}
            disabled={downloading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-sm font-medium flex items-center gap-2"
          >
            {downloading ? '⏳ Generating...' : '🖨️ Print Delivery Note'}
          </button>
          <button onClick={onClose} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium">Close</button>
        </div>
      </div>
    </div>
  );
}

function StatusUpdateModal({ order, onClose, onSuccess }: { order: DeliveryOrder; onClose: () => void; onSuccess: () => void }) {
  const [newStatus, setNewStatus] = useState<DeliveryStatus>(order.status);
  const [notes, setNotes] = useState('');
  const [locationName, setLocationName] = useState('');

  const mutation = useMutation({
    mutationFn: (data: UpdateDeliveryStatusRequest) => deliveryApi.updateStatus(order.deliveryNumber, data),
    onSuccess: () => {
      toast.success(`Status updated to ${newStatus}`);
      onSuccess();
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update status');
    },
  });

  const handleSubmit = () => {
    mutation.mutate({ status: newStatus, notes: notes || undefined, locationName: locationName || undefined });
  };

  const availableStatuses: DeliveryStatus[] = (() => {
    switch (order.status) {
      case 'PENDING': return ['ASSIGNED', 'CANCELLED'];
      case 'ASSIGNED': return ['IN_TRANSIT', 'CANCELLED'];
      case 'IN_TRANSIT': return ['DELIVERED', 'FAILED'];
      case 'FAILED': return ['IN_TRANSIT', 'CANCELLED'];
      default: return [];
    }
  })();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Update Status — {order.deliveryNumber}</h2>
        <p className="text-sm text-gray-600 mb-4">
          Current: <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[order.status]}`}>{order.status}</span>
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Status</label>
            <select value={newStatus} onChange={(e) => setNewStatus(e.target.value as DeliveryStatus)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500">
              <option value={order.status} disabled>Select new status</option>
              {availableStatuses.map((s) => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <input type="text" value={locationName} onChange={(e) => setLocationName(e.target.value)} placeholder="e.g. Kampala Central" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Optional notes..." className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={mutation.isPending || newStatus === order.status}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {mutation.isPending ? 'Updating...' : 'Update Status'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DriverAssignModal({ order, onClose, onSuccess }: { order: DeliveryOrder; onClose: () => void; onSuccess: () => void }) {
  const [driverId, setDriverId] = useState('');

  // Fetch users who can be drivers (STAFF role)
  const { data: usersData } = useQuery({
    queryKey: ['users-staff'],
    queryFn: async () => {
      const res = await apiClient.get('/users');
      return (res.data?.data || []) as Array<{ id: string; full_name: string; role: string }>;
    },
  });

  const staffUsers = (usersData || []).filter((u) => u.role === 'STAFF' || u.role === 'ADMIN' || u.role === 'MANAGER');

  const mutation = useMutation({
    mutationFn: () => deliveryApi.assignDriver(order.id, driverId),
    onSuccess: () => {
      toast.success('Driver assigned successfully');
      onSuccess();
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to assign driver');
    },
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Assign Driver — {order.deliveryNumber}</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Select Driver</label>
            <select value={driverId} onChange={(e) => setDriverId(e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500">
              <option value="">Select a driver...</option>
              {staffUsers.map((user) => (
                <option key={user.id} value={user.id}>{user.full_name} ({user.role})</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium">Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={!driverId || mutation.isPending} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
            {mutation.isPending ? 'Assigning...' : 'Assign Driver'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateDeliveryModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    customerId: '',
    deliveryDate: new Date().toLocaleDateString('en-CA'),
    deliveryAddress: '',
    deliveryContactName: undefined as string | undefined,
    deliveryContactPhone: undefined as string | undefined,
    specialInstructions: undefined as string | undefined,
    deliveryFee: 0,
    items: [{ productName: '', quantityRequested: 1 }] as CreateDeliveryOrderRequest['items'],
  });
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [selectedCustomerName, setSelectedCustomerName] = useState('');

  // Fetch customers for selector
  const { data: customersData } = useQuery({
    queryKey: ['customers-for-delivery', customerSearch],
    queryFn: async () => {
      const res = await apiClient.get('/customers', { params: { limit: 100 } });
      const all = (res.data?.data || []) as Array<{ id: string; name: string; phone?: string; email?: string }>;
      if (!customerSearch) return all;
      const term = customerSearch.toLowerCase();
      return all.filter((c) =>
        c.name.toLowerCase().includes(term) ||
        (c.phone && c.phone.includes(term)) ||
        (c.email && c.email.toLowerCase().includes(term))
      );
    },
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: (data: CreateDeliveryOrderRequest) => deliveryApi.createOrder(data),
    onSuccess: () => {
      toast.success('Delivery order created');
      onSuccess();
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to create delivery');
    },
  });

  const updateItem = (idx: number, field: string, value: string | number) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => (i === idx ? { ...item, [field]: value } : item)),
    }));
  };

  const addItem = () => {
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, { productName: '', quantityRequested: 1 }],
    }));
  };

  const removeItem = (idx: number) => {
    if (form.items.length <= 1) return;
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== idx),
    }));
  };

  const handleSelectCustomer = (customer: { id: string; name: string }) => {
    setForm((prev) => ({ ...prev, customerId: customer.id }));
    setSelectedCustomerName(customer.name);
    setCustomerSearch('');
    setShowCustomerDropdown(false);
  };

  const handleClearCustomer = () => {
    setForm((prev) => ({ ...prev, customerId: '' }));
    setSelectedCustomerName('');
    setCustomerSearch('');
  };

  const handleSubmit = () => {
    if (!form.customerId) {
      toast.error('Please select a customer');
      return;
    }
    if (!form.deliveryAddress.trim()) {
      toast.error('Delivery address is required');
      return;
    }
    if (form.items.some((i) => !i.productName.trim())) {
      toast.error('All items must have a product name');
      return;
    }
    mutation.mutate({
      customerId: form.customerId,
      deliveryDate: form.deliveryDate,
      deliveryAddress: form.deliveryAddress,
      deliveryContactName: form.deliveryContactName,
      deliveryContactPhone: form.deliveryContactPhone,
      specialInstructions: form.specialInstructions,
      deliveryFee: form.deliveryFee || 0,
      items: form.items,
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-xl w-full max-h-[85vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-gray-900">New Delivery Order</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">✕</button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">Customer *</label>
              {selectedCustomerName ? (
                <div className="flex items-center gap-2 px-3 py-2 border border-green-300 bg-green-50 rounded-lg">
                  <span className="flex-1 text-sm font-medium text-gray-900">{selectedCustomerName}</span>
                  <button onClick={handleClearCustomer} className="text-gray-400 hover:text-red-500 text-lg leading-none">&times;</button>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); }}
                    onFocus={() => setShowCustomerDropdown(true)}
                    placeholder="Search customers..."
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  {showCustomerDropdown && (customersData || []).length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {(customersData || []).map((c) => (
                        <button
                          key={c.id}
                          onClick={() => handleSelectCustomer(c)}
                          className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm border-b last:border-b-0"
                        >
                          <span className="font-medium text-gray-900">{c.name}</span>
                          {c.phone && <span className="text-gray-500 ml-2">{c.phone}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Date *</label>
              <input type="date" value={form.deliveryDate} onChange={(e) => setForm({ ...form, deliveryDate: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Address *</label>
            <textarea value={form.deliveryAddress} onChange={(e) => setForm({ ...form, deliveryAddress: e.target.value })} rows={2} placeholder="Full delivery address..." className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name</label>
              <input type="text" value={form.deliveryContactName || ''} onChange={(e) => setForm({ ...form, deliveryContactName: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact Phone</label>
              <input type="text" value={form.deliveryContactPhone || ''} onChange={(e) => setForm({ ...form, deliveryContactPhone: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Fee</label>
            <input type="number" min="0" step="100" value={form.deliveryFee || ''} onChange={(e) => setForm({ ...form, deliveryFee: parseFloat(e.target.value) || 0 })} placeholder="0" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Special Instructions</label>
            <textarea value={form.specialInstructions || ''} onChange={(e) => setForm({ ...form, specialInstructions: e.target.value })} rows={2} placeholder="Any special delivery instructions..." className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Delivery Items</label>
              <button onClick={addItem} className="text-xs px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded">+ Add Item</button>
            </div>
            <div className="space-y-2">
              {form.items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={item.productName}
                    onChange={(e) => updateItem(idx, 'productName', e.target.value)}
                    placeholder="Product name"
                    className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                  <input
                    type="number"
                    min="1"
                    value={item.quantityRequested}
                    onChange={(e) => updateItem(idx, 'quantityRequested', parseInt(e.target.value) || 1)}
                    className="w-20 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                  {form.items.length > 1 && (
                    <button onClick={() => removeItem(idx)} className="px-2 py-2 text-red-500 hover:bg-red-50 rounded">✕</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={mutation.isPending}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {mutation.isPending ? 'Creating...' : 'Create Delivery'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MODAL: CREATE FROM SALE (Tally-style)
// ═══════════════════════════════════════════════════════════════

function CreateFromSaleModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  // ── State ──────────────────────────────────────────────────
  const [saleSearch, setSaleSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedSale, setSelectedSale] = useState<DeliverableSale | null>(null);
  const [form, setForm] = useState({
    deliveryAddress: '',
    deliveryDate: new Date().toLocaleDateString('en-CA'),
    deliveryContactName: '',
    deliveryContactPhone: '',
    deliveryFee: 0,
    specialInstructions: '',
  });

  // ── Debounced search (300ms) ───────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(saleSearch), 300);
    return () => clearTimeout(timer);
  }, [saleSearch]);

  // ── Keyboard: Escape to close ──────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // ── Fetch deliverable sales ────────────────────────────────
  const { data: deliverableSales, isLoading: loadingSales } = useQuery({
    queryKey: ['deliverable-sales', debouncedSearch],
    queryFn: () => deliveryApi.getDeliverableSales(debouncedSearch || undefined),
    staleTime: 15_000,
  });

  const salesList = deliverableSales || [];
  const currentStep = selectedSale ? 2 : 1;

  // ── Handlers ───────────────────────────────────────────────
  const handleSelectSale = useCallback((sale: DeliverableSale) => {
    setSelectedSale(sale);
    setForm((prev) => ({
      ...prev,
      deliveryAddress: sale.customer_address || '',
      deliveryContactName: sale.customer_name || '',
      deliveryContactPhone: sale.customer_phone || '',
    }));
  }, []);

  const handleClearSale = useCallback(() => {
    setSelectedSale(null);
    setForm({
      deliveryAddress: '',
      deliveryDate: new Date().toLocaleDateString('en-CA'),
      deliveryContactName: '',
      deliveryContactPhone: '',
      deliveryFee: 0,
      specialInstructions: '',
    });
  }, []);

  const updateField = useCallback(<K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const mutation = useMutation({
    mutationFn: () => {
      if (!selectedSale) throw new Error('No sale selected');
      return deliveryApi.createOrderFromSale(selectedSale.id, {
        deliveryAddress: form.deliveryAddress,
        deliveryContactName: form.deliveryContactName || undefined,
        deliveryContactPhone: form.deliveryContactPhone || undefined,
        specialInstructions: form.specialInstructions || undefined,
        deliveryFee: form.deliveryFee || 0,
        deliveryDate: form.deliveryDate,
      });
    },
    onSuccess: () => {
      toast.success('Delivery order created from sale');
      onSuccess();
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to create delivery from sale');
    },
  });

  const handleSubmit = () => {
    if (!selectedSale) {
      toast.error('Please select a sale');
      return;
    }
    if (!form.deliveryAddress.trim()) {
      toast.error('Delivery address is required');
      return;
    }
    if (!form.deliveryDate) {
      toast.error('Delivery date is required');
      return;
    }
    mutation.mutate();
  };

  // ── Render ─────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-[95vw] sm:max-w-2xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Create delivery from sale"
      >
        {/* ── Header ─────────────────────────────────────────── */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Create Delivery from Sale</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Step Indicator */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold transition-colors ${currentStep >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                }`}>1</span>
              <span className={`text-sm font-medium transition-colors ${currentStep >= 1 ? 'text-gray-900' : 'text-gray-400'}`}>
                Select Sale
              </span>
            </div>
            <div className={`flex-1 h-px transition-colors ${currentStep >= 2 ? 'bg-blue-600' : 'bg-gray-200'}`} />
            <div className="flex items-center gap-2">
              <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold transition-colors ${currentStep >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                }`}>2</span>
              <span className={`text-sm font-medium transition-colors ${currentStep >= 2 ? 'text-gray-900' : 'text-gray-400'}`}>
                Delivery Details
              </span>
            </div>
          </div>
        </div>

        {/* ── Body (scrollable) ──────────────────────────────── */}
        <div className="px-6 py-5 overflow-y-auto flex-1">
          {currentStep === 1 ? (
            <div className="space-y-3">
              {/* Search Input */}
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">🔍</span>
                <input
                  type="text"
                  value={saleSearch}
                  onChange={(e) => setSaleSearch(e.target.value)}
                  placeholder="Search by sale number or customer name..."
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  autoFocus
                />
              </div>

              {/* Sales List */}
              {loadingSales ? (
                <div className="flex flex-col items-center justify-center py-10">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-3" />
                  <p className="text-sm text-gray-400">Loading sales...</p>
                </div>
              ) : salesList.length === 0 ? (
                <div className="text-center py-10 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                  <div className="text-3xl mb-3">📭</div>
                  <p className="text-sm font-medium text-gray-600">No deliverable sales found</p>
                  <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
                    Only completed sales without an active delivery order will appear here.
                  </p>
                </div>
              ) : (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="max-h-72 overflow-y-auto divide-y divide-gray-100">
                    {salesList.map((sale) => {
                      const amount = parseFloat(sale.total_amount);
                      const items = parseInt(sale.item_count);
                      return (
                        <button
                          key={sale.id}
                          onClick={() => handleSelectSale(sale)}
                          className="w-full text-left px-4 py-3.5 hover:bg-blue-50/60 transition-colors group"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-blue-700 text-sm group-hover:text-blue-800">
                                {sale.sale_number}
                              </span>
                              <span className="text-xs text-gray-400">{sale.sale_date}</span>
                            </div>
                            <span className="text-sm font-semibold text-gray-900 tabular-nums">
                              {formatCurrency(amount)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2.5 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <span className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center text-[10px]">👤</span>
                              {sale.customer_name}
                            </span>
                            <span className="text-gray-300">|</span>
                            <span>{items} item{items !== 1 ? 's' : ''}</span>
                            <span className="text-gray-300">|</span>
                            <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-medium uppercase tracking-wider">
                              {sale.payment_method.replace('_', ' ')}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Result count */}
              {salesList.length > 0 && (
                <p className="text-xs text-gray-400 text-right">
                  {salesList.length} sale{salesList.length !== 1 ? 's' : ''} available for delivery
                </p>
              )}
            </div>
          ) : selectedSale && (
            <div className="space-y-5">
              {/* Sale Summary Card */}
              <div className="bg-blue-50/70 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="font-bold text-blue-800 text-sm">{selectedSale.sale_number}</span>
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-semibold uppercase tracking-wider">
                        Completed
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
                      <span>👤 {selectedSale.customer_name}</span>
                      <span className="tabular-nums">💰 {formatCurrency(parseFloat(selectedSale.total_amount))}</span>
                      <span>📦 {selectedSale.item_count} item{parseInt(selectedSale.item_count) !== 1 ? 's' : ''}</span>
                      <span className="text-xs text-gray-400">{selectedSale.sale_date}</span>
                    </div>
                  </div>
                  <button
                    onClick={handleClearSale}
                    className="text-xs px-2.5 py-1.5 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg text-gray-600 hover:text-gray-800 transition-colors whitespace-nowrap"
                  >
                    Change
                  </button>
                </div>
                <p className="text-xs text-blue-600 mt-3 flex items-center gap-1.5">
                  <span className="inline-block w-3.5 h-3.5 bg-blue-100 rounded-full text-center text-[9px] leading-[14px] font-bold text-blue-600">i</span>
                  Items auto-populate from this sale. Stock was already deducted at sale time.
                </p>
              </div>

              {/* Delivery Form */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Delivery Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={form.deliveryDate}
                    onChange={(e) => updateField('deliveryDate', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Fee</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">UGX</span>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={form.deliveryFee || ''}
                      onChange={(e) => updateField('deliveryFee', parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="w-full pl-12 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Delivery Address <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={form.deliveryAddress}
                  onChange={(e) => updateField('deliveryAddress', e.target.value)}
                  rows={2}
                  placeholder="Full delivery address..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm resize-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name</label>
                  <input
                    type="text"
                    value={form.deliveryContactName}
                    onChange={(e) => updateField('deliveryContactName', e.target.value)}
                    placeholder="Recipient name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contact Phone</label>
                  <input
                    type="text"
                    value={form.deliveryContactPhone}
                    onChange={(e) => updateField('deliveryContactPhone', e.target.value)}
                    placeholder="+256 7XX XXX XXX"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Special Instructions</label>
                <textarea
                  value={form.specialInstructions}
                  onChange={(e) => updateField('specialInstructions', e.target.value)}
                  rows={2}
                  placeholder="Fragile items, preferred delivery window, gate code..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm resize-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────── */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          <p className="text-xs text-gray-400">
            {currentStep === 1 ? 'Select a completed sale to begin' : 'Review details and create delivery'}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={mutation.isPending || !selectedSale || !form.deliveryAddress.trim()}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {mutation.isPending ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" />
                  Creating...
                </span>
              ) : (
                'Create Delivery'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateRouteModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [routeName, setRouteName] = useState('');
  const [routeDate, setRouteDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [vehiclePlateNumber, setVehiclePlateNumber] = useState('');

  // Fetch pending delivery orders to add to route
  const { data: pendingOrders } = useQuery({
    queryKey: ['delivery-orders-pending'],
    queryFn: () => deliveryApi.searchOrders({ status: 'PENDING', limit: 100 }),
  });

  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);

  const toggleOrder = (orderId: string) => {
    setSelectedOrderIds((prev) =>
      prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId]
    );
  };

  const mutation = useMutation({
    mutationFn: (data: CreateDeliveryRouteRequest) => deliveryApi.createRoute(data),
    onSuccess: () => {
      toast.success('Route created');
      onSuccess();
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to create route');
    },
  });

  const handleSubmit = () => {
    if (!routeName.trim()) { toast.error('Route name required'); return; }
    if (selectedOrderIds.length === 0) { toast.error('Select at least one delivery'); return; }
    mutation.mutate({
      routeName,
      routeDate,
      vehiclePlateNumber: vehiclePlateNumber || undefined,
      deliveryOrderIds: selectedOrderIds,
    });
  };

  const availableOrders = pendingOrders?.orders || [];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-xl w-full max-h-[85vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-gray-900">Plan Delivery Route</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">✕</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Route Name *</label>
            <input type="text" value={routeName} onChange={(e) => setRouteName(e.target.value)} placeholder="e.g. Kampala North AM" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Route Date *</label>
              <input type="date" value={routeDate} onChange={(e) => setRouteDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle Plate</label>
              <input type="text" value={vehiclePlateNumber} onChange={(e) => setVehiclePlateNumber(e.target.value)} placeholder="UAX 123A" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* Pending Orders Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Deliveries ({selectedOrderIds.length} selected)
            </label>
            {availableOrders.length === 0 ? (
              <p className="text-sm text-gray-500 p-3 bg-gray-50 rounded-lg">No pending deliveries available</p>
            ) : (
              <div className="max-h-60 overflow-y-auto border rounded-lg divide-y">
                {availableOrders.map((o) => (
                  <label key={o.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedOrderIds.includes(o.id)}
                      onChange={() => toggleOrder(o.id)}
                      className="rounded text-blue-600"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{o.deliveryNumber}</p>
                      <p className="text-xs text-gray-500 truncate">{o.customerName || 'No customer'} — {o.deliveryAddress}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={mutation.isPending}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {mutation.isPending ? 'Creating...' : 'Create Route'}
          </button>
        </div>
      </div>
    </div>
  );
}
