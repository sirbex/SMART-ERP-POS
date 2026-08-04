/**
 * Offline Sync Status Panel
 *
 * Smart single-line status for connectivity + offline queue + cache.
 * Expands only when there is work (pending / review / failed sales).
 */

import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useOfflineContext } from '../../contexts/OfflineContext';
import { useOfflineMode } from '../../hooks/useOfflineMode';
import type { DerivedSale } from '../../hooks/useOfflineMode';
import apiClient from '../../utils/api';
import { formatTimestampTime } from '../../utils/businessDate';

interface OfflineSyncStatusPanelProps {
  /** Compact mode hides the cache detail section */
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
    } catch {
      toast.error('Sync failed');
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, pendingCount, syncPendingSales]);

  const formatRelativeTime = (ts: number | null): string => {
    if (!ts) return 'Never';
    const diff = Date.now() - ts;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  const totalQueueItems = pendingCount + reviewCount + failedCount;
  const catalogSyncTime = parseInt(localStorage.getItem('pos_catalog_last_sync') || '0', 10);
  const catalogAgeMin =
    catalogSyncTime > 0 ? Math.floor((Date.now() - catalogSyncTime) / 60000) : null;
  const catalogStale = catalogSyncTime > 0 && Date.now() - catalogSyncTime > 10 * 60 * 1000;

  const queueLabel =
    totalQueueItems === 0
      ? 'Queue clear'
      : [
          pendingCount > 0 ? `${pendingCount} pending` : null,
          reviewCount > 0 ? `${reviewCount} review` : null,
          failedCount > 0 ? `${failedCount} failed` : null,
        ]
          .filter(Boolean)
          .join(' · ');

  const cacheLabel =
    catalogAgeMin == null
      ? 'Cache not synced'
      : catalogAgeMin < 1
        ? 'Cache fresh'
        : catalogStale
          ? `Cache ${catalogAgeMin}m (stale)`
          : `Cache ${catalogAgeMin}m ago`;

  const linkMeta =
    isOnline
      ? lastOnlineAt && Date.now() - lastOnlineAt > 60_000
        ? `Last online ${formatRelativeTime(lastOnlineAt)}`
        : 'Live'
      : `Last online ${formatRelativeTime(lastOnlineAt)}`;

  return (
    <div className="bg-white rounded-lg shadow divide-y divide-gray-200">
      {/* Smart status strip — connectivity · queue · cache on one line */}
      <div className="px-3 py-2.5 sm:px-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span
            className={`inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${
              isOnline ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'
            }`}
            aria-hidden
          />
          <span className={`text-sm font-medium ${isOnline ? 'text-emerald-800' : 'text-red-800'}`}>
            {isOnline ? 'Online' : 'Offline'}
          </span>
          <span className="text-gray-300 select-none" aria-hidden>
            ·
          </span>
          <span className="text-xs text-gray-500">{linkMeta}</span>
          <span className="text-gray-300 select-none" aria-hidden>
            ·
          </span>
          <span
            className={`text-xs ${
              totalQueueItems === 0
                ? 'text-gray-500'
                : failedCount > 0 || reviewCount > 0
                  ? 'text-orange-700 font-medium'
                  : 'text-amber-700 font-medium'
            }`}
          >
            {queueLabel}
          </span>
          {!compact && (
            <>
              <span className="text-gray-300 select-none" aria-hidden>
                ·
              </span>
              <span className={`text-xs ${catalogStale ? 'text-amber-700' : 'text-gray-500'}`}>
                {cacheLabel}
              </span>
            </>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {totalQueueItems > 0 && (
              <button
                type="button"
                onClick={() => setShowQueue(!showQueue)}
                className="text-xs px-2 py-1 text-blue-700 hover:bg-blue-50 rounded-md transition-colors"
              >
                {showQueue ? 'Hide' : 'Details'}
              </button>
            )}
            {pendingCount > 0 && isOnline && (
              <button
                type="button"
                onClick={handleSync}
                disabled={isSyncing}
                className="text-xs px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md disabled:opacity-50 transition-colors"
              >
                {isSyncing ? 'Syncing…' : `Sync ${pendingCount}`}
              </button>
            )}
            {(failedCount > 0 || reviewCount > 0) && isOnline && (
              <button
                type="button"
                onClick={() => {
                  retryAllFailed();
                  toast.success(`Moved ${failedCount + reviewCount} sale(s) back to pending`);
                }}
                className="text-xs px-2.5 py-1 bg-orange-600 hover:bg-orange-700 text-white rounded-md transition-colors"
              >
                Retry {failedCount + reviewCount}
              </button>
            )}
            {isOnline && (
              <button
                type="button"
                onClick={() => prewarmCache()}
                disabled={isCacheWarming}
                className="text-xs px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md disabled:opacity-50 transition-colors"
              >
                {isCacheWarming ? 'Refreshing…' : 'Refresh cache'}
              </button>
            )}
          </div>
        </div>

        {!isOnline && pendingCount > 0 && (
          <p className="mt-1.5 text-xs text-amber-700">
            {pendingCount} sale(s) will auto-sync when back online
          </p>
        )}
      </div>

      {/* Queue details — only when expanded and there is work */}
      {showQueue && totalQueueItems > 0 && (
        <div className="px-3 py-3 sm:px-4">
          <div className="grid grid-cols-3 gap-2 mb-3">
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

          {syncQueue.length > 0 && (
            <div className="max-h-60 overflow-y-auto border rounded-lg divide-y divide-gray-100">
              {syncQueue.map((sale: DerivedSale) => (
                <div key={sale.key} className="px-3 py-2 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{sale.offlineId}</p>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{sale.lineCount} items</span>
                      <span>•</span>
                      <span>{formatTimestampTime(String(sale.ts))}</span>
                    </div>
                    {sale.syncError && (
                      <p className="text-xs text-red-500 mt-0.5 break-words whitespace-normal">
                        {sale.syncError}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        sale.syncStatus === 'PENDING'
                          ? 'bg-yellow-100 text-yellow-700'
                          : sale.syncStatus === 'SYNCED'
                            ? 'bg-green-100 text-green-700'
                            : sale.syncStatus === 'REVIEW'
                              ? 'bg-orange-100 text-orange-700'
                              : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {sale.syncStatus}
                    </span>
                    {sale.syncStatus !== 'SYNCED' && (
                      <>
                        {(sale.syncStatus === 'FAILED' || sale.syncStatus === 'REVIEW') && (
                          <button
                            type="button"
                            onClick={() => {
                              retryFailedSale(sale.key);
                              toast.success(`${sale.offlineId} moved back to pending`);
                            }}
                            className="text-blue-500 hover:text-blue-700 text-xs font-medium"
                            title="Retry this sale"
                          >
                            ↻ Retry
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              confirm(
                                `Cancel offline sale ${sale.offlineId}? Stock will be restored.`,
                              )
                            ) {
                              cancelOfflineSale(sale.key);
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
      )}

      {/* Extra cache breakdown (settings / non-compact only) */}
      {!compact && (
        <div className="px-3 py-3 sm:px-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
            Offline storage
          </h3>
          <CacheStatusRows />
        </div>
      )}
    </div>
  );
}

/** Show staleness of each IndexedDB store */
function CacheStatusRows() {
  const catalogSyncTime = parseInt(localStorage.getItem('pos_catalog_last_sync') || '0', 10);
  const now = Date.now();
  const STALE_MS = 10 * 60 * 1000;

  const isStale = catalogSyncTime > 0 && now - catalogSyncTime > STALE_MS;
  const syncAgeMin = catalogSyncTime > 0 ? Math.floor((now - catalogSyncTime) / 60000) : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-600">Product Catalog</span>
        <span className={`text-xs font-medium ${isStale ? 'text-amber-600' : 'text-green-600'}`}>
          {syncAgeMin != null
            ? syncAgeMin < 1
              ? 'Just synced'
              : `${syncAgeMin}m ago`
            : 'Not synced'}
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
