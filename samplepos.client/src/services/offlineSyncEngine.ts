/**
 * Offline Sync Engine
 *
 * App-level sync logic that runs independently of page components.
 * Reads the offline sales queue from localStorage, attempts to POST
 * each pending sale to the server, and updates the queue.
 *
 * Uses a module-level lock (`syncing`) to prevent concurrent syncs
 * across all callers in the same tab.
 *
 * Dispatches a `offline-queue-updated` CustomEvent after every run
 * so that page-level hooks (useOfflineMode) can refresh their state.
 */

import apiClient from '../utils/api';
import type { OfflineSale } from '../hooks/useOfflineMode';
import type { AxiosError } from 'axios';

const OFFLINE_SALES_KEY = 'pos_offline_sales';

/** Module-level lock — only one sync at a time per tab */
let syncing = false;

// ── Queue helpers ─────────────────────────────────────────────

function loadQueue(): OfflineSale[] {
    try {
        const raw = localStorage.getItem(OFFLINE_SALES_KEY);
        return raw ? (JSON.parse(raw) as OfflineSale[]) : [];
    } catch {
        return [];
    }
}

function persistQueue(queue: OfflineSale[]): void {
    localStorage.setItem(OFFLINE_SALES_KEY, JSON.stringify(queue));
}

// ── Public API ────────────────────────────────────────────────

export interface SyncResult {
    synced: number;
    failed: number;
    review: number;
}

/**
 * Returns true if there are PENDING_SYNC sales in the queue.
 */
export function hasPendingSales(): boolean {
    try {
        const queue = loadQueue();
        return queue.some((s) => s.status === 'PENDING_SYNC');
    } catch {
        return false;
    }
}

/**
 * Attempt to sync all PENDING_SYNC sales to the server.
 *
 * - Safe to call from multiple places (module lock prevents overlapping runs)
 * - Idempotency keys on the backend prevent duplicate sales even if
 *   two callers race
 * - Dispatches `offline-queue-updated` event when done
 */
export async function syncOfflineSales(): Promise<SyncResult> {
    if (syncing || !navigator.onLine) return { synced: 0, failed: 0, review: 0 };
    syncing = true;

    let syncedCount = 0;
    let failedCount = 0;
    let reviewCount = 0;

    try {
        const queue = loadQueue();
        const pending = queue.filter((s) => s.status === 'PENDING_SYNC');
        if (pending.length === 0) return { synced: 0, failed: 0, review: 0 };

        for (const sale of pending) {
            try {
                let response;
                try {
                    response = await apiClient.post('/pos/sync-offline-sales', {
                        idempotencyKey: sale.idempotencyKey,
                        offlineId: sale.offlineId,
                        saleData: sale.data,
                        offlineTimestamp: sale.timestamp,
                    });
                } catch (syncErr: unknown) {
                    const axErr = syncErr as AxiosError;
                    // Fallback to regular sales endpoint if sync route doesn't exist
                    if (axErr.response?.status === 404) {
                        response = await apiClient.post('/sales', sale.data);
                    } else {
                        throw syncErr;
                    }
                }

                if (response.data?.success) {
                    sale.status = 'SYNCED';
                    syncedCount++;
                } else if (response.data?.requiresReview) {
                    sale.status = 'REQUIRES_REVIEW';
                    sale.syncError = (response.data.error as string) || 'Stock conflict';
                    reviewCount++;
                } else {
                    sale.status = 'FAILED';
                    sale.syncError = (response.data?.error as string) || 'Unknown error';
                    failedCount++;
                }
            } catch (err: unknown) {
                const axErr = err as AxiosError;
                // Network still down — stop processing remainder
                if (axErr.code === 'ERR_NETWORK' || !navigator.onLine) {
                    break;
                }
                sale.status = 'FAILED';
                sale.syncError = axErr.message || 'Sync error';
                failedCount++;
            }
        }

        // Persist updated statuses, remove SYNCED entries
        const updatedQueue = queue.filter((s) => s.status !== 'SYNCED');
        persistQueue(updatedQueue);

        // Notify page-level hooks to re-read from localStorage
        window.dispatchEvent(new CustomEvent('offline-queue-updated'));

        return { synced: syncedCount, failed: failedCount, review: reviewCount };
    } finally {
        syncing = false;
    }
}

/**
 * Register a Background Sync tag so the browser can retry sync
 * even after the tab is closed (Progressive Enhancement — no-op
 * in browsers that don't support SyncManager).
 */
export async function registerBackgroundSync(): Promise<void> {
    if (!('serviceWorker' in navigator)) return;
    try {
        const reg = await navigator.serviceWorker.ready;
        // SyncManager may not exist on all browsers
        if ('sync' in reg) {
            await (reg.sync as { register: (tag: string) => Promise<void> }).register('sync-offline-sales');
        }
    } catch {
        // Background Sync not available — app-level retry is the fallback
    }
}
