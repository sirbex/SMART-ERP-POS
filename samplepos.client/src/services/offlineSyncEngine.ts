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
const OFFLINE_CUSTOMERS_KEY = 'pos_offline_customers';

/** Module-level lock — only one sync at a time per tab */
let syncing = false;

// ── Queue helpers ─────────────────────────────────────────────

function loadQueue(): OfflineSale[] {
    try {
        const raw = localStorage.getItem(OFFLINE_SALES_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
            (s: unknown): s is OfflineSale =>
                typeof s === 'object' && s !== null &&
                'idempotencyKey' in s && 'offlineId' in s &&
                'data' in s && 'status' in s
        );
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
        // Sync offline customers first so we can resolve temp IDs
        let customerIdMap = new Map<string, string>();
        try {
            customerIdMap = await syncOfflineCustomers();
        } catch {
            // Customer sync failure is non-fatal
        }

        const queue = loadQueue();
        const pending = queue.filter((s) => s.status === 'PENDING_SYNC');
        if (pending.length === 0) return { synced: 0, failed: 0, review: 0 };

        for (const sale of pending) {
            try {
                // Resolve offline customer IDs to real UUIDs
                if (sale.data.customerId && sale.data.customerId.startsWith('offline_cust_')) {
                    const realId = customerIdMap.get(sale.data.customerId);
                    if (!realId) {
                        // Customer not yet synced — skip this sale, retry next cycle
                        continue;
                    }
                    sale.data.customerId = realId;
                }

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
                const serverMsg = (axErr.response?.data as Record<string, unknown>)?.error;
                sale.syncError = (typeof serverMsg === 'string' ? serverMsg : '') || axErr.message || 'Sync error';
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
 * Sync offline-created customers to the server.
 * Returns a map of temp offline IDs → real server UUIDs so that
 * pending sales can update their customerId before syncing.
 */
export async function syncOfflineCustomers(): Promise<Map<string, string>> {
    const idMap = new Map<string, string>();
    if (!navigator.onLine) return idMap;

    try {
        const raw = localStorage.getItem(OFFLINE_CUSTOMERS_KEY);
        if (!raw) return idMap;
        const queue: Array<{ id: string; name: string; email?: string; phone?: string; address?: string; creditLimit?: number }> = JSON.parse(raw);
        if (queue.length === 0) return idMap;

        const remaining: typeof queue = [];

        for (const cust of queue) {
            try {
                // Send undefined (omitted) for empty optional fields – NOT null.
                // Backend CreateCustomerSchema uses .optional() which rejects null.
                const payload: Record<string, unknown> = {
                    name: cust.name,
                    creditLimit: cust.creditLimit ?? 0,
                };
                if (cust.email) payload.email = cust.email;
                if (cust.phone) payload.phone = cust.phone;
                if (cust.address) payload.address = cust.address;

                const response = await apiClient.post('customers', payload);
                if (response.data?.success && response.data?.data?.id) {
                    idMap.set(cust.id, response.data.data.id as string);
                } else {
                    remaining.push(cust);
                }
            } catch (err: unknown) {
                const axErr = err as AxiosError;
                if (axErr.code === 'ERR_NETWORK' || !navigator.onLine) break;
                remaining.push(cust);
            }
        }

        localStorage.setItem(OFFLINE_CUSTOMERS_KEY, JSON.stringify(remaining));
        return idMap;
    } catch {
        return idMap;
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
