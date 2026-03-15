/**
 * Offline Sync Status Panel
 *
 * Displays the status of offline operations:
 * - Current network status
 * - IndexedDB cache staleness
 * - Pending sales in the sync queue
 * - Failed/requires review items
 * - Manual sync and cache refresh buttons
 *
 * Can be used standalone or embedded in POS/Settings.
 */

import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useOfflineContext } from '../../contexts/OfflineContext';
import { useOfflineMode } from '../../hooks/useOfflineMode';
import type { OfflineSale } from '../../hooks/useOfflineMode';
import apiClient from '../../utils/api';

interface OfflineSyncStatusPanelProps {
  /** Compact mode hides the cache section */
  compact?: boolean;
}

export default function OfflineSyncStatusPanel({ compact = false }: OfflineSyncStatusPanelProps) {
  const { isOnline, isCacheWarming, prewarmCache, lastOnlineAt } = useOfflineContext();
  const {
    syncQueue,
    pendingCount,
    reviewCount,
    failedCount,
    syncPendingSales,
    cancelOfflineSale,
    retryFailedSale,
    retryAllFailed,
  } = useOfflineMode();

  const [isSyncing, setIsSyncing] = useState(false);
  const [showQueue, setShowQueue] = useState(false);

  // Attempt to sync all pending sales
  const handleSync = useCallback(async () => {
    if (!isOnline || pendingCount === 0) return;
    setIsSyncing(true);
    try {
      const results = await syncPendingSales(apiClient);
      const synced = results.filter((r) => r.success).length;
      const failedResults = results.filter((r) => !r.success);
      if (synced > 0) toast.success(`Synced ${synced} offline sale(s)`);
      if (failedResults.length > 0) {
        const firstError = failedResults[0]?.error || 'Unknown error';
        toast.error(`${failedResults.length} sale(s) failed: ${firstError}`, { duration: 6000 });
      }
      if (synced === 0 && failedResults.length === 0) toast.success('Nothing to sync');
    } catch (err) {
      toast.error('Sync failed');
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, pendingCount, syncPendingSales]);

  // Format relative time
  const formatRelativeTime = (ts: number | null): string => {
    if (!ts) return 'Never';
    const diff = Date.now() - ts;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  const totalQueueItems = pendingCount + reviewCount + failedCount;

  return (
    <div className="bg-white rounded-lg shadow divide-y divide-gray-200">
      {/* Network Status */}
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'} ${!isOnline ? 'animate-pulse' : ''}`} />
            <div>
              <p className="font-medium text-gray-900">{isOnline ? 'Online' : 'Offline'}</p>
              <p className="text-xs text-gray-500">Last online: {formatRelativeTime(lastOnlineAt)}</p>
            </div>
          </div>
          {isOnline && (
            <button
              onClick={() => prewarmCache()}
              disabled={isCacheWarming}
              className="text-xs px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg disabled:opacity-50 transition-colors"
            >
              {isCacheWarming ? 'Refreshing...' : '🔄 Refresh Cache'}
            </button>
          )}
        </div>
      </div>

      {/* Sync Queue Summary */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">Offline Sales Queue</h3>
          {totalQueueItems > 0 && (
            <button
              onClick={() => setShowQueue(!showQueue)}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              {showQueue ? 'Hide details' : 'Show details'}
            </button>
          )}
        </div>

        {totalQueueItems === 0 ? (
          <p className="text-sm text-gray-500">No offline sales queued</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="text-center p-2 bg-yellow-50 rounded-lg">
                <p className="text-lg font-bold text-yellow-700">{pendingCount}</p>
                <p className="text-xs text-yellow-600">Pending</p>
              </div>
              <div className="text-center p-2 bg-orange-50 rounded-lg">
                <p className="text-lg font-bold text-orange-700">{reviewCount}</p>
                <p className="text-xs text-orange-600">Review</p>
              </div>
              <div className="text-center p-2 bg-red-50 rounded-lg">
                <p className="text-lg font-bold text-red-700">{failedCount}</p>
                <p className="text-xs text-red-600">Failed</p>
              </div>
            </div>

            {/* Sync Button */}
            {pendingCount > 0 && isOnline && (
              <button
                onClick={handleSync}
                disabled={isSyncing}
                className="w-full px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {isSyncing ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    Syncing...
                  </span>
                ) : (
                  `⬆️ Sync ${pendingCount} Pending Sale(s)`
                )}
              </button>
            )}

            {!isOnline && pendingCount > 0 && (
              <div className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2 text-center">
                Sales will auto-sync when back online
              </div>
            )}

            {/* Retry All Failed Button */}
            {(failedCount > 0 || reviewCount > 0) && isOnline && (
              <button
                onClick={() => {
                  retryAllFailed();
                  toast.success(`Moved ${failedCount + reviewCount} sale(s) back to pending`);
                }}
                className="w-full px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium transition-colors mt-2"
              >
                🔄 Retry {failedCount + reviewCount} Failed Sale(s)
              </button>
            )}
          </>
        )}

        {/* Queue Details */}
        {showQueue && syncQueue.length > 0 && (
          <div className="mt-3 max-h-60 overflow-y-auto border rounded-lg divide-y divide-gray-100">
            {syncQueue.map((sale: OfflineSale) => (
              <div key={sale.idempotencyKey} className="px-3 py-2 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{sale.offlineId}</p>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>{sale.data.lineItems.length} items</span>
                    <span>•</span>
                    <span>{new Date(sale.timestamp).toLocaleTimeString()}</span>
                  </div>
                  {sale.syncError && (
                    <p className="text-xs text-red-500 mt-0.5 break-words whitespace-normal">{sale.syncError}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${sale.status === 'PENDING_SYNC' ? 'bg-yellow-100 text-yellow-700' :
                      sale.status === 'SYNCED' ? 'bg-green-100 text-green-700' :
                        sale.status === 'REQUIRES_REVIEW' ? 'bg-orange-100 text-orange-700' :
                          'bg-red-100 text-red-700'
                    }`}>
                    {sale.status.replace('_', ' ')}
                  </span>
                  {sale.status !== 'SYNCED' && (
                    <>
                      {(sale.status === 'FAILED' || sale.status === 'REQUIRES_REVIEW') && (
                        <button
                          onClick={() => {
                            retryFailedSale(sale.idempotencyKey);
                            toast.success(`${sale.offlineId} moved back to pending`);
                          }}
                          className="text-blue-500 hover:text-blue-700 text-xs font-medium"
                          title="Retry this sale"
                        >
                          ↻ Retry
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (confirm(`Cancel offline sale ${sale.offlineId}? Stock will be restored.`)) {
                            cancelOfflineSale(sale.idempotencyKey);
                            toast.success(`Cancelled ${sale.offlineId}`);
                          }
                        }}
                        className="text-red-400 hover:text-red-600 text-xs"
                          title="Cancel and restore stock"
                        >
                          ✕
                        </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cache Status (non-compact) */}
      {!compact && (
        <div className="p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Cache Status</h3>
          <CacheStatusRows />
        </div>
      )}
    </div>
  );
}

/** Show staleness of each IndexedDB store */
function CacheStatusRows() {
  // We read sync timestamps from the offlineCatalogService cached timestamp
  const catalogSyncTime = parseInt(localStorage.getItem('pos_catalog_last_sync') || '0', 10);
  const now = Date.now();
  const STALE_MS = 10 * 60 * 1000; // 10 minutes

  const isStale = catalogSyncTime > 0 && (now - catalogSyncTime) > STALE_MS;
  const syncAgeMin = catalogSyncTime > 0 ? Math.floor((now - catalogSyncTime) / 60000) : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-600">Product Catalog</span>
        <span className={`text-xs font-medium ${isStale ? 'text-amber-600' : 'text-green-600'}`}>
          {syncAgeMin != null ? (syncAgeMin < 1 ? 'Just synced' : `${syncAgeMin}m ago`) : 'Not synced'}
          {isStale && ' (stale)'}
        </span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-600">IndexedDB Stores</span>
        <span className="text-xs text-gray-500">products, stock, customers, batches</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-600">Offline Sales Storage</span>
        <span className="text-xs text-gray-500">localStorage</span>
      </div>
    </div>
  );
}
