/**
 * @module ExpiryAlertsWidget
 * @description Dashboard widget for critical batch expiry alerts
 * @requires Batch tracking enabled in system
 * @created 2025-11-04
 */

import { useMemo } from 'react';
import { useStockLevels } from '../hooks/useInventory';
import { Link } from 'react-router-dom';

// Batch interface for expiring items
interface ExpiringBatch {
  productId: string;
  productName: string;
  batchNumber: string;
  remainingQuantity: number;
  expiryDate: string;
  daysUntilExpiry: number;
  urgency: 'CRITICAL' | 'WARNING' | 'NORMAL';
  unitOfMeasure?: string;
}

type ExpiryUrgency = 'CRITICAL' | 'WARNING' | 'NORMAL';

interface ExpiryAlertsWidgetProps {
  /** Maximum number of alerts to display */
  maxAlerts?: number;
  /** Show only critical alerts (≤7 days) */
  criticalOnly?: boolean;
  /** Custom CSS class for container */
  className?: string;
}

export default function ExpiryAlertsWidget({
  maxAlerts = 5,
  criticalOnly = false,
  className = '',
}: ExpiryAlertsWidgetProps) {
  const { data: stockLevelsData, isLoading, error, refetch } = useStockLevels();

  // Calculate expiry urgency based on days until expiry
  const calculateExpiryUrgency = (daysUntilExpiry: number): ExpiryUrgency => {
    if (daysUntilExpiry < 0 || daysUntilExpiry <= 7) return 'CRITICAL';
    if (daysUntilExpiry <= 30) return 'WARNING';
    return 'NORMAL';
  };

  // Get urgency styling
  const getUrgencyStyle = (urgency: ExpiryUrgency) => {
    switch (urgency) {
      case 'CRITICAL':
        return {
          bg: 'bg-red-50',
          border: 'border-red-200',
          text: 'text-red-800',
          badge: 'bg-red-100 text-red-800',
          icon: '🔴',
        };
      case 'WARNING':
        return {
          bg: 'bg-yellow-50',
          border: 'border-yellow-200',
          text: 'text-yellow-800',
          badge: 'bg-yellow-100 text-yellow-800',
          icon: '🟡',
        };
      default:
        return {
          bg: 'bg-green-50',
          border: 'border-green-200',
          text: 'text-green-800',
          badge: 'bg-green-100 text-green-800',
          icon: '🟢',
        };
    }
  };

  // Format days until expiry
  const formatDaysUntilExpiry = (days: number): string => {
    if (days < 0) return `Expired ${Math.abs(days)} days ago`;
    if (days === 0) return 'Expires TODAY';
    if (days === 1) return 'Expires TOMORROW';
    return `${days} days left`;
  };

  // Process stock levels into expiring batches (must be called before any early returns)

  // Process stock levels into expiring batches
  const expiringBatches = useMemo((): ExpiringBatch[] => {
    if (!stockLevelsData?.data) return [];
    const levels = Array.isArray(stockLevelsData.data) ? stockLevelsData.data : [];

    const batches: ExpiringBatch[] = [];

    levels.forEach(
      (level: {
        product_id: string;
        product_name: string;
        sku?: string;
        total_stock?: number;
        total_quantity?: number;
        nearest_expiry?: string | null;
        uoms?: Array<{ symbol?: string; name?: string; isDefault?: boolean }>;
      }) => {
        // Only include items with expiry dates
        if (!level.nearest_expiry) return;

        const expiryDate = new Date(level.nearest_expiry + 'T00:00:00');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const daysUntilExpiry = Math.ceil(
          (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );

        const urgency = calculateExpiryUrgency(daysUntilExpiry);

        // Filter by criticalOnly setting
        if (criticalOnly && urgency !== 'CRITICAL') return;

        // Only show items that are WARNING or CRITICAL
        if (urgency === 'NORMAL') return;

        // Get default UOM symbol from uoms array
        const defaultUom = level.uoms?.find((u) => u.isDefault) || level.uoms?.[0];
        const uomDisplay = defaultUom?.symbol || defaultUom?.name || 'PCS';

        batches.push({
          productId: level.product_id,
          productName: level.product_name,
          batchNumber: level.sku || 'MAIN',
          remainingQuantity: Number(level.total_stock || level.total_quantity || 0),
          expiryDate: level.nearest_expiry,
          daysUntilExpiry,
          urgency,
          unitOfMeasure: uomDisplay,
        });
      }
    );

    // Sort by days until expiry (most urgent first)
    return batches.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
  }, [stockLevelsData, criticalOnly]);

  // Limit alerts displayed
  const displayedAlerts = useMemo(() => {
    return expiringBatches.slice(0, maxAlerts);
  }, [expiringBatches, maxAlerts]);

  // Summary statistics
  const stats = useMemo(() => {
    const critical = expiringBatches.filter((b) => b.urgency === 'CRITICAL').length;
    const warning = expiringBatches.filter((b) => b.urgency === 'WARNING').length;
    return { critical, warning, total: expiringBatches.length };
  }, [expiringBatches]);

  // Handle loading state
  if (isLoading) {
    return (
      <div className={`bg-white rounded-lg shadow p-4 ${className}`}>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading expiry alerts...</span>
        </div>
      </div>
    );
  }

  // Handle error state
  if (error) {
    return (
      <div className={`bg-white rounded-lg shadow p-4 ${className}`}>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800 mb-2">Failed to load expiry alerts</p>
          <button
            onClick={() => refetch()}
            className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <span className="text-lg">⚠️</span>
            <h3 className="ml-2 text-base font-semibold text-gray-900">Expiry Alerts</h3>
          </div>
          <div className="flex items-center gap-2">
            {stats.critical > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                {stats.critical} Critical
              </span>
            )}
            {stats.warning > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                {stats.warning} Warning
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Alerts List */}
      <div className="divide-y divide-gray-200">
        {displayedAlerts.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <div className="text-green-600 text-3xl mb-2">✓</div>
            <p className="text-sm text-gray-600">
              {criticalOnly ? 'No critical expiry alerts' : 'No items expiring soon'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              All inventory batches are within safe expiry ranges
            </p>
          </div>
        ) : (
          displayedAlerts.map((batch, index) => {
            const style = getUrgencyStyle(batch.urgency);

            return (
              <div
                key={`${batch.productId}-${index}`}
                className={`px-4 py-3 hover:bg-gray-50 transition-colors ${style.bg} ${style.border} border-l-4`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    {/* Product Name */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm">{style.icon}</span>
                      <h4 className="text-sm font-medium text-gray-900 truncate">
                        {batch.productName}
                      </h4>
                    </div>

                    {/* Batch Details */}
                    <div className="flex items-center gap-3 text-xs text-gray-600">
                      <span className="font-mono">{batch.batchNumber}</span>
                      <span>•</span>
                      <span className="font-semibold">
                        {batch.remainingQuantity.toFixed(2)} {batch.unitOfMeasure}
                      </span>
                    </div>

                    {/* Expiry Info */}
                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${style.badge}`}
                      >
                        {formatDaysUntilExpiry(batch.daysUntilExpiry)}
                      </span>
                      <span className="text-xs text-gray-500">
                        Expires: {new Date(batch.expiryDate).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="ml-3 flex flex-col gap-1">
                    <Link
                      to={`/inventory/stock-movements?type=ADJUSTMENT_IN,ADJUSTMENT_OUT`}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap"
                    >
                      Adjust
                    </Link>
                    <Link
                      to="/inventory/batches"
                      className="text-xs text-gray-600 hover:text-gray-800 whitespace-nowrap"
                    >
                      View Batch
                    </Link>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
        <div className="flex items-center justify-between text-xs">
          <div className="text-gray-600">
            {expiringBatches.length > maxAlerts && (
              <span>
                Showing {maxAlerts} of {expiringBatches.length} alerts
              </span>
            )}
            {expiringBatches.length <= maxAlerts && expiringBatches.length > 0 && (
              <span>
                {expiringBatches.length} alert{expiringBatches.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <Link to="/inventory/batches" className="text-blue-600 hover:text-blue-800 font-medium">
            View All Batches →
          </Link>
        </div>
      </div>

      {/* Legend */}
      <div className="px-4 py-2 bg-blue-50 border-t border-blue-200 text-xs text-blue-800">
        <div className="flex items-center gap-4">
          <span>🔴 Critical: ≤7 days</span>
          <span>🟡 Warning: ≤30 days</span>
        </div>
      </div>
    </div>
  );
}
