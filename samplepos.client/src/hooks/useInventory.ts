/**
 * React Query hooks for Inventory/Batches API
 * Provides data fetching and caching for inventory batches
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getErrorMessage } from '../utils/api';

/**
 * Query key factory for inventory batches
 * Provides organized cache keys for targeted invalidation
 */
export const inventoryKeys = {
  all: ['inventory'] as const,
  stockLevels: () => [...inventoryKeys.all, 'stock-levels'] as const,
  stockLevelByProduct: (productId: string) => [...inventoryKeys.all, 'stock-level', productId] as const,
  batches: () => [...inventoryKeys.all, 'batches'] as const,
  batchesByProduct: (productId: string) => [...inventoryKeys.batches(), productId] as const,
  expiringSoon: (days?: number) => [...inventoryKeys.all, 'expiring-soon', days || 7] as const,
  needingReorder: () => [...inventoryKeys.all, 'needing-reorder'] as const,
};

/**
 * Fetch all stock levels (aggregated by product)
 */
export function useStockLevels() {
  return useQuery({
    queryKey: inventoryKeys.stockLevels(),
    queryFn: async () => {
      const response = await api.inventory.stockLevels();
      return response.data;
    },
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Fetch stock level for a specific product
 */
export function useStockLevelByProduct(productId: string) {
  return useQuery({
    queryKey: inventoryKeys.stockLevelByProduct(productId),
    queryFn: async () => {
      const response = await api.inventory.stockLevelByProduct(productId);
      return response.data;
    },
    enabled: !!productId,
    staleTime: 30000,
  });
}

/**
 * Fetch batches for a specific product
 */
export function useBatchesByProduct(productId: string) {
  return useQuery({
    queryKey: inventoryKeys.batchesByProduct(productId),
    queryFn: async () => {
      const response = await api.inventory.batchesByProduct(productId);
      return response.data;
    },
    enabled: !!productId,
    staleTime: 30000,
  });
}

/**
 * Fetch batches expiring soon
 */
export function useExpiringSoon(days: number = 7) {
  return useQuery({
    queryKey: inventoryKeys.expiringSoon(days),
    queryFn: async () => {
      const response = await api.inventory.expiringSoon(days);
      return response.data;
    },
    staleTime: 300000, // 5 minutes
  });
}

/**
 * Fetch products needing reorder
 */
export function useNeedingReorder() {
  return useQuery({
    queryKey: inventoryKeys.needingReorder(),
    queryFn: async () => {
      const response = await api.inventory.needingReorder();
      return response.data;
    },
    staleTime: 300000, // 5 minutes
  });
}

/**
 * Adjust inventory quantity for a product
 * Backend handles batch selection automatically
 */
export function useAdjustInventory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      productId: string;
      adjustment: number;
      reason: string;
      userId: string;
    }) => {
      const response = await api.inventory.adjustInventory(data);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate all inventory-related queries (both standard and offline-aware)
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      queryClient.invalidateQueries({ queryKey: ['stockMovements'] });
      queryClient.invalidateQueries({ queryKey: ['offline', 'stock-levels'] });
    },
    onError: (error) => {
      console.error('Failed to adjust inventory:', getErrorMessage(error));
    },
  });
}

/**
 * Get inventory value
 */
export function useInventoryValue(productId?: string) {
  return useQuery({
    queryKey: [...inventoryKeys.all, 'value', productId || 'all'],
    queryFn: async () => {
      const response = await api.inventory.inventoryValue(productId);
      return response.data;
    },
    staleTime: 60000, // 1 minute
  });
}
