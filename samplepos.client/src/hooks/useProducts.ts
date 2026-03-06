/**
 * React Query hooks for Products API
 * 
 * Provides type-safe hooks for CRUD operations on products
 * with automatic caching and refetching.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getErrorMessage } from '../utils/api';
import type { CreateProductInput, UpdateProductInput } from '../types/inputs';

// Query Keys
export const productKeys = {
  all: ['products'] as const,
  lists: () => [...productKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...productKeys.lists(), filters] as const,
  details: () => [...productKeys.all, 'detail'] as const,
  detail: (id: string) => [...productKeys.details(), id] as const,
};

/**
 * Fetch all products
 */
export function useProducts(params?: { page?: number; limit?: number; includeUoms?: boolean }) {
  return useQuery({
    queryKey: productKeys.list(params || {}),
    queryFn: async () => {
      const response = await api.products.list(params);
      return response.data;
    },
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Fetch single product by ID
 * @param includeUoms - If true, fetches product with embedded UoM details and conversion methods
 */
export function useProduct(id: string, includeUoms: boolean = false) {
  return useQuery({
    queryKey: productKeys.detail(id),
    queryFn: async () => {
      const response = await api.products.getById(id, includeUoms);
      return response.data;
    },
    enabled: !!id,
    staleTime: 60000, // 1 minute
  });
}

/**
 * Create new product
 */
export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateProductInput) => {
      const response = await api.products.create(data);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate and refetch products list
      queryClient.invalidateQueries({ queryKey: productKeys.lists() });
    },
    onError: (error) => {
      console.error('Failed to create product:', getErrorMessage(error));
    },
  });
}

/**
 * Update existing product
 */
export function useUpdateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateProductInput }) => {
      const response = await api.products.update(id, data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      // Invalidate specific product and lists
      queryClient.invalidateQueries({ queryKey: productKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: productKeys.lists() });
    },
    onError: (error) => {
      console.error('Failed to update product:', getErrorMessage(error));
    },
  });
}

/**
 * Delete product
 */
export function useDeleteProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await api.products.delete(id);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate products list
      queryClient.invalidateQueries({ queryKey: productKeys.lists() });
    },
    onError: (error) => {
      console.error('Failed to delete product:', getErrorMessage(error));
    },
  });
}
