/**
 * Inventory Query Hooks
 * React Query hooks for inventory data fetching and mutations
 */

import { useQuery, useMutation } from '@tanstack/react-query';
import type { UseQueryOptions, UseMutationOptions } from '@tanstack/react-query';
import { queryKeys, invalidateQueries } from '../config/queryClient';
import axios from 'axios';

const API_BASE = '/api/inventory';

/**
 * Types
 */
export interface InventoryItem {
  id: number;
  sku: string;
  name: string;
  description?: string;
  category?: string;
  base_price: number;
  tax_rate: number;
  reorder_level: number;
  is_active: boolean;
  total_quantity?: number;
  batch_count?: number;
  nearest_expiry?: string;
  created_at: string;
  updated_at: string;
}

export interface InventoryListParams {
  page?: number;
  limit?: number;
  sort?: string;
  search?: string;
  filter?: Record<string, any>;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
    nextPage: number | null;
    prevPage: number | null;
  };
}

/**
 * Fetch paginated inventory list
 */
export function useInventoryList(
  params: InventoryListParams = {},
  options?: Omit<UseQueryOptions<PaginatedResponse<InventoryItem>>, 'queryKey' | 'queryFn'>
) {
  return useQuery<PaginatedResponse<InventoryItem>>({
    queryKey: queryKeys.inventory.list(params),
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      
      if (params.page) queryParams.append('page', params.page.toString());
      if (params.limit) queryParams.append('limit', params.limit.toString());
      if (params.sort) queryParams.append('sort', params.sort);
      if (params.search) queryParams.append('search', params.search);
      
      // Add filters
      if (params.filter) {
        Object.entries(params.filter).forEach(([key, value]) => {
          queryParams.append(`filter[${key}]`, String(value));
        });
      }
      
      const response = await axios.get(`${API_BASE}?${queryParams.toString()}`);
      return response.data;
    },
    ...options,
  });
}

/**
 * Fetch single inventory item by ID
 */
export function useInventoryItem(
  id: string | number,
  options?: Omit<UseQueryOptions<InventoryItem>, 'queryKey' | 'queryFn'>
) {
  return useQuery<InventoryItem>({
    queryKey: queryKeys.inventory.detail(id),
    queryFn: async () => {
      const response = await axios.get(`${API_BASE}/${id}`);
      return response.data;
    },
    enabled: !!id, // Only run query if ID exists
    ...options,
  });
}

/**
 * Fetch low stock items
 */
export function useLowStockItems(
  options?: Omit<UseQueryOptions<InventoryItem[]>, 'queryKey' | 'queryFn'>
) {
  return useQuery<InventoryItem[]>({
    queryKey: queryKeys.inventory.lowStock(),
    queryFn: async () => {
      const response = await axios.get(`${API_BASE}/low-stock`);
      return response.data;
    },
    staleTime: 60 * 1000, // 1 minute (alerts should be fresh)
    ...options,
  });
}

/**
 * Fetch expiring items
 */
export function useExpiringItems(
  days: number = 90,
  options?: Omit<UseQueryOptions<any[]>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.inventory.expiring(days),
    queryFn: async () => {
      const response = await axios.get(`${API_BASE}/expiring?days=${days}`);
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  });
}

/**
 * Fetch inventory statistics
 */
export function useInventoryStats(
  options?: Omit<UseQueryOptions<any>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.inventory.stats(),
    queryFn: async () => {
      const response = await axios.get(`${API_BASE}/stats`);
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  });
}

/**
 * Create new inventory item
 */
export function useCreateInventoryItem(
  options?: UseMutationOptions<InventoryItem, Error, Partial<InventoryItem>>
) {
  return useMutation<InventoryItem, Error, Partial<InventoryItem>>({
    mutationFn: async (data) => {
      const response = await axios.post(API_BASE, data);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate inventory queries to refetch
      invalidateQueries.inventory();
    },
    ...options,
  });
}

/**
 * Update inventory item
 */
export function useUpdateInventoryItem(
  options?: UseMutationOptions<InventoryItem, Error, { id: number | string; data: Partial<InventoryItem> }>
) {
  return useMutation<InventoryItem, Error, { id: number | string; data: Partial<InventoryItem> }>({
    mutationFn: async ({ id, data }) => {
      const response = await axios.put(`${API_BASE}/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate specific item and list queries
      invalidateQueries.inventory();
    },
    ...options,
  });
}

/**
 * Delete inventory item
 */
export function useDeleteInventoryItem(
  options?: UseMutationOptions<void, Error, number | string>
) {
  return useMutation<void, Error, number | string>({
    mutationFn: async (id) => {
      await axios.delete(`${API_BASE}/${id}`);
    },
    onSuccess: () => {
      // Invalidate inventory queries
      invalidateQueries.inventory();
    },
    ...options,
  });
}

/**
 * Bulk operations helper
 */
export function useBulkUpdateInventory(
  options?: UseMutationOptions<any, Error, { ids: number[]; data: Partial<InventoryItem> }>
) {
  return useMutation({
    mutationFn: async ({ ids, data }) => {
      const response = await axios.post(`${API_BASE}/bulk-update`, { ids, data });
      return response.data;
    },
    onSuccess: () => {
      invalidateQueries.inventory();
    },
    ...options,
  });
}
