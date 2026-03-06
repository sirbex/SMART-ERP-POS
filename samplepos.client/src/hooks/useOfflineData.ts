/**
 * Offline-Aware Data Hooks
 *
 * Wraps existing React Query hooks with IndexedDB fallbacks.
 * When online: normal API fetch → responses also persisted to IndexedDB.
 * When offline: returns data from IndexedDB instead of failing.
 *
 * These hooks mirror the API shapes of useStockLevels, useProducts, etc.
 * so page components can swap in with minimal changes.
 */

import { useQuery } from '@tanstack/react-query';
import { useOfflineContext } from '../contexts/OfflineContext';
import { api } from '../utils/api';
import {
  getAllProducts,
  putProducts,
  getAllStockLevels,
  putStockLevels,
  getAllCustomers,
  putCustomers,
} from '../lib/offlineDb';
import { mapApiProduct, mapApiStockLevel, mapApiCustomer } from '../lib/offlineMappers';

// ── Products (offline-aware) ──────────────────────────────────

/**
 * Fetch products with automatic IndexedDB caching and offline fallback.
 * Returns the same shape as useProducts() from useProducts.ts so callers
 * can be swapped with minimal changes.
 */
export function useOfflineProducts(params?: { page?: number; limit?: number; includeUoms?: boolean }) {
  const { isOnline } = useOfflineContext();

  const query = useQuery({
    queryKey: ['offline', 'products', params],
    queryFn: async () => {
      if (!isOnline) {
        // Offline: return from IndexedDB
        const cached = await getAllProducts();
        if (cached.length > 0) {
          return { success: true, data: cached, _offline: true };
        }
        throw new Error('No cached product data available offline');
      }

      // Online: fetch from API
      const response = await api.products.list(params);
      const apiData = response.data;

      // Persist to IndexedDB in background
      if (apiData?.data && Array.isArray(apiData.data)) {
        putProducts(apiData.data.map(mapApiProduct)).catch(() => { /* silent */ });
      }

      return apiData;
    },
    staleTime: 30_000,
    gcTime: 24 * 60 * 60 * 1000, // Keep in memory cache for 24h
    retry: isOnline ? 1 : 0,
    networkMode: 'offlineFirst',
  });

  return query;
}

// ── Stock Levels (offline-aware) ──────────────────────────────

/**
 * Fetch stock levels with IndexedDB fallback.
 */
export function useOfflineStockLevels() {
  const { isOnline } = useOfflineContext();

  return useQuery({
    queryKey: ['offline', 'stock-levels'],
    queryFn: async () => {
      if (!isOnline) {
        const cached = await getAllStockLevels();
        if (cached.length > 0) {
          return { success: true, data: cached, _offline: true };
        }
        throw new Error('No cached stock level data available offline');
      }

      const response = await api.inventory.stockLevels();
      const apiData = response.data;

      // Persist to IndexedDB
      if (apiData?.data && Array.isArray(apiData.data)) {
        putStockLevels(apiData.data.map(mapApiStockLevel)).catch(() => { /* silent */ });
      }

      return apiData;
    },
    staleTime: 30_000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: isOnline ? 1 : 0,
    networkMode: 'offlineFirst',
  });
}

// ── Customers (offline-aware) ─────────────────────────────────

/**
 * Fetch customers with IndexedDB fallback.
 */
export function useOfflineCustomers(page = 1, limit = 500) {
  const { isOnline } = useOfflineContext();

  return useQuery({
    queryKey: ['offline', 'customers', page, limit],
    queryFn: async () => {
      if (!isOnline) {
        const cached = await getAllCustomers();
        if (cached.length > 0) {
          return { success: true, data: cached, _offline: true };
        }
        throw new Error('No cached customer data available offline');
      }

      const response = await api.customers.list({ page, limit });
      const apiData = response.data;

      // Persist to IndexedDB
      if (apiData?.data && Array.isArray(apiData.data)) {
        putCustomers(apiData.data.map(mapApiCustomer)).catch(() => { /* silent */ });
      }

      return apiData;
    },
    staleTime: 60_000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: isOnline ? 1 : 0,
    networkMode: 'offlineFirst',
  });
}
