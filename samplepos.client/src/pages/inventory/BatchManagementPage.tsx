/**
 * @module BatchManagementPage
 * @description Comprehensive batch inventory management with FEFO ordering and expiry tracking
 * @requires Batch tracking enabled in system
 * @created 2025-11-04
 */

import { useState, useMemo } from 'react';
import { useStockLevels } from '../../hooks/useInventory';
import { useProducts } from '../../hooks/useProducts';
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

// Batch interface matching backend response
interface InventoryBatch {
  id: string;
  product_id: string;
  product_name: string;
  batch_number: string;
  quantity: number;
  remaining_quantity: number;
  expiry_date: string | null;
  cost_price: number;
  status: 'ACTIVE' | 'DEPLETED' | 'EXPIRED';
  created_at: string;
  updated_at: string;
}

// Expiry urgency levels matching backend calculation
type ExpiryUrgency = 'CRITICAL' | 'WARNING' | 'NORMAL' | 'NONE';

export default function BatchManagementPage() {
  const { data: stockLevelsData, isLoading, error, refetch } = useStockLevels();
  const { data: productsData } = useProducts();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'ACTIVE' | 'DEPLETED' | 'EXPIRED'>(
    'ALL'
  );
  const [filterUrgency, setFilterUrgency] = useState<'ALL' | ExpiryUrgency>('ALL');
  const [selectedBatch, setSelectedBatch] = useState<InventoryBatch | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  // Extract products for quick lookup
  const products = useMemo(() => {
    if (!productsData?.data) return [];
    return Array.isArray(productsData.data) ? productsData.data : [];
  }, [productsData]);

  const productMap = useMemo(() => {
    const map = new Map<string, unknown>();
    products.forEach((p: { id: string }) => {
      map.set(p.id, p);
    });
    return map;
  }, [products]);

  // Create batch list from stock levels
  // In production, this would come from a dedicated /api/inventory/batches endpoint
  const batches = useMemo((): InventoryBatch[] => {
    if (!stockLevelsData?.data) return [];
    const levels = Array.isArray(stockLevelsData.data) ? stockLevelsData.data : [];

    // Mock batches from stock levels (simplified for demo)
    // Filter out products with 0 stock - they have no batches
    return levels
      .filter((level: { total_stock?: number; total_quantity?: number }) => {
        const stock = Number(level.total_stock || level.total_quantity || 0);
        return stock > 0; // Only show products that have actual stock/batches
      })
      .map(
        (level: {
          product_id: string;
          product_name: string;
          sku?: string;
          total_stock?: number;
          total_quantity?: number;
          nearest_expiry?: string | null;
          average_cost?: number;
        }) => ({
          id: `batch-${level.product_id}`,
          product_id: level.product_id,
          product_name: level.product_name,
          batch_number: level.sku || 'MAIN',
          quantity: Number(level.total_stock || level.total_quantity || 0),
          remaining_quantity: Number(level.total_stock || level.total_quantity || 0),
          expiry_date: level.nearest_expiry || null,
          cost_price: Number(level.average_cost || 0),
          status:
            Number(level.total_stock || level.total_quantity || 0) === 0
              ? ('DEPLETED' as const)
              : ('ACTIVE' as const),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
      );
  }, [stockLevelsData]);

  // Calculate expiry urgency for a batch
  const calculateExpiryUrgency = (expiryDate: string | null): ExpiryUrgency => {
    if (!expiryDate) return 'NONE';

    const daysUntilExpiry = Math.ceil(
      (new Date(expiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysUntilExpiry < 0) return 'CRITICAL'; // Already expired
    if (daysUntilExpiry <= 7) return 'CRITICAL';
    if (daysUntilExpiry <= 30) return 'WARNING';
    return 'NORMAL';
  };

  // Calculate days until expiry
  const getDaysUntilExpiry = (expiryDate: string | null): number | null => {
    if (!expiryDate) return null;
    return Math.ceil(
      (new Date(expiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    );
  };

  // Filter batches
  const filteredBatches = useMemo(() => {
    let filtered = batches;

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (batch) =>
          batch.product_name.toLowerCase().includes(term) ||
          batch.batch_number.toLowerCase().includes(term)
      );
    }

    // Status filter
    if (filterStatus !== 'ALL') {
      filtered = filtered.filter((batch) => batch.status === filterStatus);
    }

    // Urgency filter
    if (filterUrgency !== 'ALL') {
      filtered = filtered.filter(
        (batch) => calculateExpiryUrgency(batch.expiry_date) === filterUrgency
      );
    }

    return filtered;
  }, [batches, searchTerm, filterStatus, filterUrgency]);

  // Sort batches by FEFO (First Expiry First Out)
  const sortedBatches = useMemo(() => {
    return [...filteredBatches].sort((a, b) => {
      // Batches with no expiry go to the end
      if (!a.expiry_date && !b.expiry_date) return 0;
      if (!a.expiry_date) return 1;
      if (!b.expiry_date) return -1;

      // Sort by expiry date ascending (earliest first)
      return (
        new Date(a.expiry_date + 'T00:00:00').getTime() -
        new Date(b.expiry_date + 'T00:00:00').getTime()
      );
    });
  }, [filteredBatches]);

  // Summary statistics
  const stats = useMemo(() => {
    const totalBatches = sortedBatches.length;
    const activeBatches = sortedBatches.filter((b) => b.status === 'ACTIVE').length;
    const criticalBatches = sortedBatches.filter(
      (b) => calculateExpiryUrgency(b.expiry_date) === 'CRITICAL'
    ).length;
    const warningBatches = sortedBatches.filter(
      (b) => calculateExpiryUrgency(b.expiry_date) === 'WARNING'
    ).length;

    const totalValue = sortedBatches.reduce((sum, batch) => {
      return sum.plus(new Decimal(batch.remaining_quantity).times(batch.cost_price));
    }, new Decimal(0));

    return {
      total: totalBatches,
      active: activeBatches,
      critical: criticalBatches,
      warning: warningBatches,
      totalValue: totalValue.toNumber(),
    };
  }, [sortedBatches]);

  // Get urgency badge color
  const getUrgencyBadge = (urgency: ExpiryUrgency) => {
    switch (urgency) {
      case 'CRITICAL':
        return { color: 'bg-red-100 text-red-800', label: '🔴 CRITICAL', icon: '⚠️' };
      case 'WARNING':
        return { color: 'bg-yellow-100 text-yellow-800', label: '🟡 WARNING', icon: '⚠️' };
      case 'NORMAL':
        return { color: 'bg-green-100 text-green-800', label: '🟢 NORMAL', icon: '✓' };
      case 'NONE':
        return { color: 'bg-gray-100 text-gray-800', label: 'No Expiry', icon: '∞' };
    }
  };

  // Handle batch details view
  const handleViewDetails = (batch: InventoryBatch) => {
    setSelectedBatch(batch);
    setShowDetailsModal(true);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="p-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-blue-800">Loading batch inventory...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Failed to load batches. Please try again.</p>
          <button
            onClick={() => refetch()}
            className="mt-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Batch Management</h2>
          <p className="text-gray-600 mt-1">FEFO inventory tracking with expiry monitoring</p>
        </div>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          🔄 Refresh
        </button>
      </div>

      {/* Summary Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Total Batches</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Active</div>
          <div className="text-2xl font-bold text-green-600 mt-1">{stats.active}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Critical (≤7 days)</div>
          <div className="text-2xl font-bold text-red-600 mt-1">{stats.critical}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Warning (≤30 days)</div>
          <div className="text-2xl font-bold text-yellow-600 mt-1">{stats.warning}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Total Value</div>
          <div className="text-xl font-bold text-gray-900 mt-1">
            UGX {stats.totalValue.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Search */}
          <div>
            <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-2">
              Search Batches
            </label>
            <input
              id="search"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Product name or batch number..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Status Filter */}
          <div>
            <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700 mb-2">
              Status
            </label>
            <select
              id="status-filter"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active</option>
              <option value="DEPLETED">Depleted</option>
              <option value="EXPIRED">Expired</option>
            </select>
          </div>

          {/* Urgency Filter */}
          <div>
            <label
              htmlFor="urgency-filter"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Expiry Urgency
            </label>
            <select
              id="urgency-filter"
              value={filterUrgency}
              onChange={(e) => setFilterUrgency(e.target.value as typeof filterUrgency)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="ALL">All Urgency Levels</option>
              <option value="CRITICAL">🔴 Critical (≤7 days)</option>
              <option value="WARNING">🟡 Warning (≤30 days)</option>
              <option value="NORMAL">🟢 Normal (&gt;30 days)</option>
              <option value="NONE">No Expiry Date</option>
            </select>
          </div>
        </div>

        {/* Filter Summary */}
        <div className="flex justify-between items-center mt-4 pt-4 border-t">
          <div className="text-sm text-gray-600">
            Showing {sortedBatches.length} of {batches.length} batches (FEFO sorted)
          </div>
          <button
            onClick={() => {
              setSearchTerm('');
              setFilterStatus('ALL');
              setFilterUrgency('ALL');
            }}
            className="text-sm text-gray-700 bg-gray-100 px-3 py-1 rounded hover:bg-gray-200"
          >
            Reset Filters
          </button>
        </div>
      </div>

      {/* Batches Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  FEFO Order
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Product
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Batch Number
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Quantity
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Expiry Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Urgency
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Value
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedBatches.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-8 text-center text-gray-500">
                    {searchTerm || filterStatus !== 'ALL' || filterUrgency !== 'ALL'
                      ? 'No batches match your filters'
                      : 'No batches found. Create products to see batch inventory.'}
                  </td>
                </tr>
              ) : (
                sortedBatches.map((batch, index) => {
                  const product = productMap.get(batch.product_id) as
                    | { unitOfMeasure?: string; category?: string }
                    | undefined;
                  const urgency = calculateExpiryUrgency(batch.expiry_date);
                  const urgencyBadge = getUrgencyBadge(urgency);
                  const daysUntilExpiry = getDaysUntilExpiry(batch.expiry_date);
                  const batchValue = new Decimal(batch.remaining_quantity).times(batch.cost_price);

                  return (
                    <tr key={batch.id} className="hover:bg-gray-50">
                      {/* FEFO Order */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-800 font-bold text-sm">
                            {index + 1}
                          </span>
                        </div>
                      </td>

                      {/* Product */}
                      <td className="px-4 py-4">
                        <div className="text-sm font-medium text-gray-900">
                          {batch.product_name}
                        </div>
                      </td>

                      {/* Category */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${product?.category
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-400'
                          }`}>
                          {product?.category || '\u2014'}
                        </span>
                      </td>

                      {/* Batch Number */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 font-mono">{batch.batch_number}</div>
                      </td>

                      {/* Quantity */}
                      <td className="px-4 py-4 whitespace-nowrap text-right">
                        <div className="text-sm font-semibold text-gray-900">
                          {batch.remaining_quantity.toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-500">
                          {product?.unitOfMeasure || 'PCS'}
                        </div>
                      </td>

                      {/* Expiry Date */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        {batch.expiry_date ? (
                          <div>
                            <div className="text-sm text-gray-900">
                              {formatDisplayDate(batch.expiry_date)}
                            </div>
                            {daysUntilExpiry !== null && (
                              <div
                                className={`text-xs ${daysUntilExpiry < 0
                                  ? 'text-red-600 font-bold'
                                  : daysUntilExpiry <= 7
                                    ? 'text-red-600'
                                    : daysUntilExpiry <= 30
                                      ? 'text-yellow-600'
                                      : 'text-green-600'
                                  }`}
                              >
                                {daysUntilExpiry < 0
                                  ? `Expired ${Math.abs(daysUntilExpiry)} days ago`
                                  : `${daysUntilExpiry} days left`}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">No expiry</span>
                        )}
                      </td>

                      {/* Urgency */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${urgencyBadge.color}`}
                        >
                          {urgencyBadge.icon} {urgencyBadge.label.replace(/🔴|🟡|🟢/, '').trim()}
                        </span>
                      </td>

                      {/* Value */}
                      <td className="px-4 py-4 whitespace-nowrap text-right">
                        <div className="text-sm font-medium text-gray-900">
                          UGX {batchValue.toFixed(0).toLocaleString()}
                        </div>
                        <div className="text-xs text-gray-500">@{batch.cost_price.toFixed(2)}</div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${batch.status === 'ACTIVE'
                            ? 'bg-green-100 text-green-800'
                            : batch.status === 'DEPLETED'
                              ? 'bg-gray-100 text-gray-800'
                              : 'bg-red-100 text-red-800'
                            }`}
                        >
                          {batch.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-4 whitespace-nowrap text-sm">
                        <button
                          onClick={() => handleViewDetails(batch)}
                          className="text-blue-600 hover:text-blue-900 font-medium"
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info Box */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-900 mb-2">📦 FEFO (First Expiry First Out)</h3>
        <ul className="text-xs text-blue-800 space-y-1">
          <li>
            • Batches are sorted by expiry date (earliest first) to ensure proper stock rotation
          </li>
          <li>• POS system automatically selects batches in FEFO order during sales</li>
          <li>
            • <strong>CRITICAL:</strong> Batches expiring in ≤7 days (red alert)
          </li>
          <li>
            • <strong>WARNING:</strong> Batches expiring in ≤30 days (yellow alert)
          </li>
          <li>
            • <strong>NORMAL:</strong> Batches expiring in &gt;30 days (green status)
          </li>
          <li>• Batches without expiry dates appear last in the queue</li>
        </ul>
      </div>

      {/* Batch Details Modal */}
      {showDetailsModal && selectedBatch && (
        <BatchDetailsModal
          batch={selectedBatch}
          product={
            productMap.get(selectedBatch.product_id) as
            | { name?: string; sku?: string; unitOfMeasure?: string }
            | undefined
          }
          onClose={() => setShowDetailsModal(false)}
        />
      )}
    </div>
  );
}

/**
 * Batch Details Modal Component
 */
function BatchDetailsModal({
  batch,
  product,
  onClose,
}: {
  batch: InventoryBatch;
  product?: { name?: string; sku?: string; unitOfMeasure?: string };
  onClose: () => void;
}) {
  const daysUntilExpiry = batch.expiry_date
    ? Math.ceil(
      (new Date(batch.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    )
    : null;

  const batchValue = new Decimal(batch.remaining_quantity).times(batch.cost_price);
  const utilizationPercent =
    batch.quantity > 0
      ? new Decimal(batch.remaining_quantity).dividedBy(batch.quantity).times(100).toNumber()
      : 0;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-[95vw] sm:max-w-2xl w-full mx-2 sm:mx-4 max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Batch Details</h3>
          <p className="text-sm text-gray-600 mt-1">
            {batch.product_name} - {batch.batch_number}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-4">
            {/* Product Info */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Product Information</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-600">Product:</span>
                  <span className="ml-2 font-medium text-gray-900">{batch.product_name}</span>
                </div>
                <div>
                  <span className="text-gray-600">SKU:</span>
                  <span className="ml-2 font-medium text-gray-900">{product?.sku || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-gray-600">Batch Number:</span>
                  <span className="ml-2 font-mono font-medium text-gray-900">
                    {batch.batch_number}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Unit:</span>
                  <span className="ml-2 font-medium text-gray-900">
                    {product?.unitOfMeasure || 'PCS'}
                  </span>
                </div>
              </div>
            </div>

            {/* Quantity Info */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Quantity Information</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-600">Original Quantity:</span>
                  <span className="ml-2 font-medium text-gray-900">
                    {batch.quantity.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Remaining:</span>
                  <span className="ml-2 font-semibold text-green-600">
                    {batch.remaining_quantity.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Utilization:</span>
                  <span className="ml-2 font-medium text-gray-900">
                    {utilizationPercent.toFixed(1)}%
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Status:</span>
                  <span
                    className={`ml-2 font-semibold ${batch.status === 'ACTIVE' ? 'text-green-600' : 'text-gray-600'
                      }`}
                  >
                    {batch.status}
                  </span>
                </div>
              </div>
            </div>

            {/* Expiry Info */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Expiry Information</h4>
              {batch.expiry_date ? (
                <div className="space-y-2">
                  <div className="text-sm">
                    <span className="text-gray-600">Expiry Date:</span>
                    <span className="ml-2 font-medium text-gray-900">
                      {formatDisplayDate(batch.expiry_date)}
                    </span>
                  </div>
                  {daysUntilExpiry !== null && (
                    <div
                      className={`text-sm font-semibold ${daysUntilExpiry < 0
                        ? 'text-red-600'
                        : daysUntilExpiry <= 7
                          ? 'text-red-600'
                          : daysUntilExpiry <= 30
                            ? 'text-yellow-600'
                            : 'text-green-600'
                        }`}
                    >
                      {daysUntilExpiry < 0
                        ? `⚠️ EXPIRED ${Math.abs(daysUntilExpiry)} days ago`
                        : daysUntilExpiry === 0
                          ? '⚠️ EXPIRES TODAY'
                          : `${daysUntilExpiry} days until expiry`}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No expiry date set for this batch</p>
              )}
            </div>

            {/* Cost Info */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Cost & Value</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-600">Unit Cost:</span>
                  <span className="ml-2 font-medium text-gray-900">
                    UGX {batch.cost_price.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Total Value:</span>
                  <span className="ml-2 font-semibold text-gray-900">
                    UGX {batchValue.toFixed(0).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Timestamps */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Timestamps</h4>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-gray-600">Created:</span>
                  <span className="ml-2 text-gray-900">
                    {batch.created_at?.includes('T')
                      ? `${formatDisplayDate(batch.created_at)} ${batch.created_at.split('T')[1].substring(0, 8)}`
                      : formatDisplayDate(batch.created_at)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Last Updated:</span>
                  <span className="ml-2 text-gray-900">
                    {batch.updated_at?.includes('T')
                      ? `${formatDisplayDate(batch.updated_at)} ${batch.updated_at.split('T')[1].substring(0, 8)}`
                      : formatDisplayDate(batch.updated_at)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
