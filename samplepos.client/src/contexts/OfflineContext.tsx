/**
 * Offline Context
 *
 * Provides app-wide awareness of network status and offline capabilities.
 * Wraps the entire app and exposes:
 *   - `isOnline`  – current connectivity state
 *   - `isServiceWorkerReady` – whether the SW is installed & active
 *   - `lastOnlineAt` – timestamp of last known online moment
 *   - `prewarmCache()` – trigger background cache population
 *
 * Children can use the `useOfflineContext()` hook to consume.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import apiClient from '../utils/api';
import {
  putProducts,
  putStockLevels,
  putCustomers,
  putBatches,
  getLastSync,
  STORES,
} from '../lib/offlineDb';
import { mapApiProduct, mapApiStockLevel, mapApiCustomer, mapApiBatch, type ApiRow } from '../lib/offlineMappers';
import {
  getLastSyncTime,
  CATALOG_STALE_MS,
  canSyncPosCatalogFromCache,
} from '../services/offlineCatalogService';

// ── Types ─────────────────────────────────────────────────────

interface OfflineContextValue {
  /** True when navigator.onLine is true */
  isOnline: boolean;
  /** True when the service worker is installed and controlling */
  isServiceWorkerReady: boolean;
  /** Timestamp (ms) when we last had a network connection */
  lastOnlineAt: number | null;
  /** Manually trigger pre-warming of IndexedDB caches */
  prewarmCache: () => Promise<void>;
  /** Whether prewarm is currently running */
  isCacheWarming: boolean;
}

const OfflineContext = createContext<OfflineContextValue>({
  isOnline: true,
  isServiceWorkerReady: false,
  lastOnlineAt: null,
  prewarmCache: async () => { },
  isCacheWarming: false,
});

// ── Staleness threshold: re-sync if data older than 10 minutes ─
const STALE_THRESHOLD = 10 * 60 * 1000;

// ── Provider ──────────────────────────────────────────────────

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isServiceWorkerReady, setIsServiceWorkerReady] = useState(false);
  const [lastOnlineAt, setLastOnlineAt] = useState<number | null>(navigator.onLine ? Date.now() : null);
  const [isCacheWarming, setIsCacheWarming] = useState(false);
  const warmingRef = useRef(false);

  // ── Network events ────────────────────────────────────────
  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      setLastOnlineAt(Date.now());
    };
    const goOffline = () => setIsOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // ── Service Worker readiness ──────────────────────────────
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(() => {
        setIsServiceWorkerReady(true);
      });
    }
  }, []);

  // ── Cache pre-warming ─────────────────────────────────────
  const prewarmCache = useCallback(async () => {
    if (warmingRef.current || !navigator.onLine) return;
    // Don't prewarm if user is not authenticated
    if (!localStorage.getItem('auth_token')) return;
    warmingRef.current = true;
    setIsCacheWarming(true);

    try {
      await Promise.allSettled([
        prewarmProducts(),
        prewarmStockLevels(),
        prewarmCustomers(),
        prewarmBatches(),
      ]);
    } finally {
      warmingRef.current = false;
      setIsCacheWarming(false);
    }
  }, []);

  // ── Auto-prewarm on first online + when stale ─────────────
  useEffect(() => {
    if (!isOnline) return;

    // Check if caches are stale and prewarm in background
    const checkAndWarm = async () => {
      const productSync = await getLastSync(STORES.PRODUCTS);
      const stockSync = await getLastSync(STORES.STOCK_LEVELS);
      const now = Date.now();

      if (
        now - productSync > STALE_THRESHOLD ||
        now - stockSync > STALE_THRESHOLD
      ) {
        prewarmCache();
      }
    };

    // Small delay so the app finishes rendering first
    const timer = setTimeout(checkAndWarm, 3000);
    return () => clearTimeout(timer);
  }, [isOnline, prewarmCache]);

  return (
    <OfflineContext.Provider
      value={{
        isOnline,
        isServiceWorkerReady,
        lastOnlineAt,
        prewarmCache,
        isCacheWarming,
      }}
    >
      {children}
    </OfflineContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────

export function useOfflineContext(): OfflineContextValue {
  return useContext(OfflineContext);
}

// ── Pre-warming helpers ───────────────────────────────────────

async function prewarmProducts(): Promise<void> {
  try {
    // GET /products requires inventory.read — waiters/FOH use pos catalog instead.
    if (!canSyncInventoryReadFromCache()) return;
    const res = await apiClient.get('/products?page=1&limit=5000&includeUoms=true', {
      silentForbidden: true,
    });
    const raw: ApiRow[] = res.data?.data || [];
    await putProducts(raw.map(mapApiProduct));
  } catch {
    // Silently fail — offline data remains stale but usable
  }
}

async function prewarmStockLevels(): Promise<void> {
  try {
    // POS catalog sync already replicates stock-levels — skip duplicate download (Odoo/SAP pattern).
    if (Date.now() - getLastSyncTime() < CATALOG_STALE_MS) return;
    if (!canSyncPosCatalogFromCache()) return;

    const res = await apiClient.get('/inventory/pos/catalog', { silentForbidden: true });
    const raw: ApiRow[] = res.data?.data || [];
    await putStockLevels(raw.map(mapApiStockLevel));
  } catch {
    // Silent
  }
}

async function prewarmCustomers(): Promise<void> {
  try {
    if (!canSyncCustomersReadFromCache()) return;
    const res = await apiClient.get('/customers?page=1&limit=5000', { silentForbidden: true });
    const raw: ApiRow[] = res.data?.data || [];
    await putCustomers(raw.map(mapApiCustomer));
  } catch {
    // Silent
  }
}

async function prewarmBatches(): Promise<void> {
  try {
    // inventory.read required — skip to avoid Access denied toast for waiters / guests.
    if (!canSyncInventoryReadFromCache()) return;
    const res = await apiClient.get('/inventory/batches-all', { silentForbidden: true });
    const raw: ApiRow[] = res.data?.data || [];
    await putBatches(raw.map(mapApiBatch));
  } catch {
    // Silent — batch endpoint may not exist, that's fine
  }
}

function readCachedPermissionKeys(): string[] | null {
  try {
    const raw = localStorage.getItem('rbac_permissions');
    if (!raw) return null;
    const perms = JSON.parse(raw) as unknown;
    if (!Array.isArray(perms) || perms.length === 0) return null;
    return perms.filter((p): p is string => typeof p === 'string');
  } catch {
    return null;
  }
}

/**
 * Matches GET /products and /inventory/batches-all (inventory.read).
 * Fail closed when RBAC cache is missing — avoids 403 toasts for waiters before perms load.
 */
export function canSyncInventoryReadFromCache(): boolean {
  const perms = readCachedPermissionKeys();
  if (!perms) return false;
  return perms.includes('inventory.read');
}

/** Matches GET /customers (customers.read). */
export function canSyncCustomersReadFromCache(): boolean {
  const perms = readCachedPermissionKeys();
  if (!perms) return false;
  return perms.includes('customers.read');
}
