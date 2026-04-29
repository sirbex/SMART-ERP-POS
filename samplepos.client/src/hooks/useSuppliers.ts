/**
 * React Query hooks for Suppliers API
 */

import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '../utils/api';
import type { CreateSupplierInput, UpdateSupplierInput } from '../types/inputs';

/**
 * Query key factory for suppliers
 */
export const supplierKeys = {
  all: ['suppliers'] as const,
  lists: () => [...supplierKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...supplierKeys.lists(), filters] as const,
  detail: (id: string) => [...supplierKeys.all, 'detail', id] as const,
  performance: (id: string) => [...supplierKeys.detail(id), 'performance'] as const,
  orders: (id: string, filters: Record<string, unknown>) => [...supplierKeys.detail(id), 'orders', filters] as const,
  products: (id: string) => [...supplierKeys.detail(id), 'products'] as const,
};

/**
 * Fetch all suppliers with optional filters
 */
export function useSuppliers(params?: {
  page?: number;
  limit?: number;
  search?: string;
}) {
  return useQuery({
    queryKey: supplierKeys.list(params || {}),
    queryFn: async () => {
      const response = await api.suppliers.list(params);
      return response.data;
    },
    staleTime: 60000, // 1 minute
    placeholderData: keepPreviousData, // keep previous results visible during search/pagination
  });
}

/**
 * Fetch single supplier by ID
 */
export function useSupplier(id: string) {
  return useQuery({
    queryKey: supplierKeys.detail(id),
    queryFn: async () => {
      const response = await api.suppliers.getById(id);
      return response.data;
    },
    enabled: !!id,
    staleTime: 60000,
  });
}

/**
 * Create new supplier
 */
export function useCreateSupplier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateSupplierInput) => {
      const response = await api.suppliers.create(data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: supplierKeys.lists() });
    },
  });
}

/**
 * Update existing supplier
 */
export function useUpdateSupplier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateSupplierInput }) => {
      const response = await api.suppliers.update(id, data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: supplierKeys.lists() });
      queryClient.invalidateQueries({ queryKey: supplierKeys.detail(variables.id) });
    },
  });
}

/**
 * Delete supplier
 */
export function useDeleteSupplier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await api.suppliers.delete(id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: supplierKeys.lists() });
    },
  });
}

/**
 * Fetch supplier performance metrics
 */
export function useSupplierPerformance(id: string) {
  return useQuery({
    queryKey: supplierKeys.performance(id),
    queryFn: async () => {
      const response = await api.suppliers.getPerformance(id);
      return response.data;
    },
    enabled: !!id,
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Fetch supplier purchase orders
 */
export function useSupplierOrders(id: string, params?: {
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: supplierKeys.orders(id, params || {}),
    queryFn: async () => {
      const response = await api.suppliers.getOrders(id, params);
      return response.data;
    },
    enabled: !!id,
    staleTime: 30000,
  });
}

/**
 * Fetch supplier products (items supplied)
 */
export function useSupplierProducts(id: string) {
  return useQuery({
    queryKey: supplierKeys.products(id),
    queryFn: async () => {
      const response = await api.suppliers.getProducts(id);
      return response.data;
    },
    enabled: !!id,
    staleTime: 60000,
  });
}
