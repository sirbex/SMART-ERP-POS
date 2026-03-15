/**
 * Offline Mode Hook (v2)
 *
 * Manages network detection, offline sales queue with idempotency keys,
 * local stock tracking, and auto-sync on reconnect.
 *
 * Storage key: 'pos_offline_sales'
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useOfflineContext } from '../contexts/OfflineContext';
import { decrementLocalStock, restoreLocalStock } from '../services/offlineCatalogService';
import { syncOfflineCustomers } from '../services/offlineSyncEngine';
import type { AxiosInstance, AxiosError } from 'axios';

// ── Storage ───────────────────────────────────────────────────
const OFFLINE_SALES_KEY = 'pos_offline_sales';

// ── Types ─────────────────────────────────────────────────────
export interface OfflineSaleLineItem {
  productId: string;
  productName: string;
  sku: string;
  uom: string;
  uomId?: string;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  subtotal: number;
  taxAmount: number;
}

export interface OfflineSalePaymentLine {
  paymentMethod: 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'CREDIT';
  amount: number;
  reference?: string;
}

export interface OfflineSaleData {
  customerId?: string;
  cashRegisterSessionId?: string | null;
  lineItems: OfflineSaleLineItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  paymentLines: OfflineSalePaymentLine[];
  saleDate?: string;
}

export interface OfflineSale {
  /** Unique idempotency key – prevents double-posting on sync */
  idempotencyKey: string;
  /** Human-readable offline ID shown in UI */
  offlineId: string;
  timestamp: number;
  data: OfflineSaleData;
  status: 'PENDING_SYNC' | 'SYNCED' | 'REQUIRES_REVIEW' | 'FAILED';
  syncError?: string;
  /** Tracks which products/quantities to restore if sale is cancelled */
  stockDeductions: Array<{ productId: string; quantity: number }>;
}

// ── Helpers ───────────────────────────────────────────────────
function generateIdempotencyKey(): string {
  return `ofl_${Date.now()}_${Math.random().toString(36).substr(2, 12)}`;
}

function loadQueue(): OfflineSale[] {
  try {
    const raw = localStorage.getItem(OFFLINE_SALES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: OfflineSale[]): void {
  localStorage.setItem(OFFLINE_SALES_KEY, JSON.stringify(queue));
}

// ── Hook ──────────────────────────────────────────────────────
export function useOfflineMode() {
  const { isOnline } = useOfflineContext();
  const [syncQueue, setSyncQueue] = useState<OfflineSale[]>(() => loadQueue());
  const isSyncingRef = useRef(false);

  // Keep localStorage in sync with state
  useEffect(() => {
    saveQueue(syncQueue);
  }, [syncQueue]);

  // Re-read queue when background or app-level sync updates localStorage
  useEffect(() => {
    const handleQueueUpdate = () => {
      setSyncQueue(loadQueue());
    };
    window.addEventListener('offline-queue-updated', handleQueueUpdate);
    return () => window.removeEventListener('offline-queue-updated', handleQueueUpdate);
  }, []);

  /**
   * Save a sale for offline sync.
   * – Assigns idempotency key
   * – Decrements local stock
   * – Tags sale as PENDING_SYNC with cashRegisterSessionId = null
   */
  const saveSaleOffline = useCallback(
    (saleData: OfflineSaleData): string => {
      const idempotencyKey = generateIdempotencyKey();
      const offlineId = `OFFLINE-${Date.now().toString(36).toUpperCase()}`;

      // Decrement local stock for each line item
      const stockDeductions: Array<{ productId: string; quantity: number }> = [];
      for (const item of saleData.lineItems) {
        // Skip custom / service items
        if (item.productId.startsWith('custom_')) continue;
        const ok = decrementLocalStock(item.productId, item.quantity);
        if (!ok) {
          // Restore any already-decremented stock and throw
          for (const d of stockDeductions) {
            restoreLocalStock(d.productId, d.quantity);
          }
          throw new Error(`Insufficient offline stock for "${item.productName}"`);
        }
        stockDeductions.push({ productId: item.productId, quantity: item.quantity });
      }

      // Strip disallowed offline payment methods (deposit requires server).
      // Keep CREDIT lines when a customer is attached — the sync engine
      // will resolve the offline customer first so the backend can create the invoice.
      const hasCustomer = !!saleData.customerId;
      const cleanedPaymentLines = saleData.paymentLines.filter(
        (pl) =>
          pl.paymentMethod === 'CASH' ||
          pl.paymentMethod === 'CARD' ||
          pl.paymentMethod === 'MOBILE_MONEY' ||
          (pl.paymentMethod === 'CREDIT' && hasCustomer)
      ) as OfflineSalePaymentLine[];

      const sale: OfflineSale = {
        idempotencyKey,
        offlineId,
        timestamp: Date.now(),
        data: {
          ...saleData,
          cashRegisterSessionId: null, // Will be assigned on sync
          paymentLines: cleanedPaymentLines,
        },
        status: 'PENDING_SYNC',
        stockDeductions,
      };

      setSyncQueue((prev) => [...prev, sale]);
      return offlineId;
    },
    []
  );

  /**
   * Sync all pending offline sales to the backend.
   * Uses the dedicated /pos/sync-offline-sales endpoint
   * which handles idempotency, stock re-validation, and accounting.
   */
  const syncPendingSales = useCallback(
    async (apiClient: AxiosInstance) => {
      if (!navigator.onLine || isSyncingRef.current) return [];

      const currentQueue = loadQueue(); // Read fresh from localStorage
      const pending = currentQueue.filter((s) => s.status === 'PENDING_SYNC');
      if (pending.length === 0) return [];

      isSyncingRef.current = true;

      // Sync offline customers first and resolve temp IDs
      const customerIdMap = await syncOfflineCustomers();

      const results: Array<{ offlineId: string; success: boolean; error?: string }> = [];

      for (const sale of pending) {
        try {
          // Resolve offline customer IDs to real UUIDs
          if (sale.data.customerId && sale.data.customerId.startsWith('offline_cust_')) {
            const realId = customerIdMap.get(sale.data.customerId);
            if (!realId) {
              // Customer not yet synced — skip, retry next cycle
              results.push({ offlineId: sale.offlineId, success: false, error: 'Customer not yet synced' });
              continue;
            }
            sale.data.customerId = realId;
          }

          // Use the dedicated offline-sync endpoint (falls back to regular create if not available)
          let response;
          try {
            response = await apiClient.post('/pos/sync-offline-sales', {
              idempotencyKey: sale.idempotencyKey,
              offlineId: sale.offlineId,
              saleData: sale.data,
              offlineTimestamp: sale.timestamp,
            });
          } catch (syncErr: unknown) {
            // If sync endpoint doesn't exist yet (404), fall back to regular sales.create
            const axiosErr = syncErr as AxiosError;
            if (axiosErr.response?.status === 404) {
              response = await apiClient.post('/sales', sale.data);
            } else {
              throw syncErr;
            }
          }

          if (response.data?.success) {
            sale.status = 'SYNCED';
            results.push({ offlineId: sale.offlineId, success: true });
          } else if (response.data?.requiresReview) {
            sale.status = 'REQUIRES_REVIEW';
            sale.syncError = response.data.error || 'Stock conflict';
            results.push({ offlineId: sale.offlineId, success: false, error: sale.syncError });
          } else {
            sale.status = 'FAILED';
            sale.syncError = response.data?.error || 'Unknown error';
            results.push({ offlineId: sale.offlineId, success: false, error: sale.syncError });
          }
        } catch (error: unknown) {
          // If server is still unreachable, leave as PENDING_SYNC
          const axiosError = error as AxiosError;
          const errMsg = axiosError.message || 'Unknown sync error';
          if (axiosError.code === 'ERR_NETWORK' || !navigator.onLine) {
            results.push({ offlineId: sale.offlineId, success: false, error: 'Still offline' });
          } else {
            sale.status = 'FAILED';
            sale.syncError = errMsg;
            results.push({ offlineId: sale.offlineId, success: false, error: errMsg });
          }
        }
      }

      // Rebuild queue: remove synced, keep everything else
      const updatedQueue = currentQueue.filter((s) => {
        const synced = pending.find((p) => p.idempotencyKey === s.idempotencyKey);
        return !synced || synced.status !== 'SYNCED';
      });
      // Update failed/review statuses
      for (const p of pending) {
        const idx = updatedQueue.findIndex((q) => q.idempotencyKey === p.idempotencyKey);
        if (idx >= 0) {
          updatedQueue[idx] = p;
        }
      }

      setSyncQueue(updatedQueue);
      isSyncingRef.current = false;
      return results;
    },
    [syncQueue]
  );

  /**
   * Cancel / remove an offline sale and restore stock.
   */
  const cancelOfflineSale = useCallback(
    (idempotencyKey: string) => {
      setSyncQueue((prev) => {
        const sale = prev.find((s) => s.idempotencyKey === idempotencyKey);
        if (sale) {
          for (const d of sale.stockDeductions) {
            restoreLocalStock(d.productId, d.quantity);
          }
        }
        return prev.filter((s) => s.idempotencyKey !== idempotencyKey);
      });
    },
    []
  );

  const clearSyncQueue = useCallback(() => {
    setSyncQueue([]);
    localStorage.removeItem(OFFLINE_SALES_KEY);
  }, []);

  /**
   * Retry a single failed/review sale by resetting it to PENDING_SYNC.
   */
  const retryFailedSale = useCallback((idempotencyKey: string) => {
    setSyncQueue((prev) =>
      prev.map((s) =>
        s.idempotencyKey === idempotencyKey &&
        (s.status === 'FAILED' || s.status === 'REQUIRES_REVIEW')
          ? { ...s, status: 'PENDING_SYNC' as const, syncError: undefined }
          : s
      )
    );
  }, []);

  /**
   * Retry all failed and requires-review sales at once.
   */
  const retryAllFailed = useCallback(() => {
    setSyncQueue((prev) =>
      prev.map((s) =>
        s.status === 'FAILED' || s.status === 'REQUIRES_REVIEW'
          ? { ...s, status: 'PENDING_SYNC' as const, syncError: undefined }
          : s
      )
    );
  }, []);

  const pendingCount = syncQueue.filter((s) => s.status === 'PENDING_SYNC').length;
  const reviewCount = syncQueue.filter((s) => s.status === 'REQUIRES_REVIEW').length;
  const failedCount = syncQueue.filter((s) => s.status === 'FAILED').length;

  return {
    isOnline,
    syncQueue,
    saveSaleOffline,
    syncPendingSales,
    cancelOfflineSale,
    clearSyncQueue,
    retryFailedSale,
    retryAllFailed,
    pendingCount,
    reviewCount,
    failedCount,
  };
}
