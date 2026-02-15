/**
 * React Query hooks for Purchase Orders API
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../utils/api';

/**
 * Query key factory for purchase orders
 */
export const purchaseOrderKeys = {
  all: ['purchase-orders'] as const,
  lists: () => [...purchaseOrderKeys.all, 'list'] as const,
  list: (filters: Record<string, any>) => [...purchaseOrderKeys.lists(), filters] as const,
  detail: (id: string) => [...purchaseOrderKeys.all, 'detail', id] as const,
};

/**
 * Fetch all purchase orders with optional filters
 */
export function usePurchaseOrders(params?: {
  page?: number;
  limit?: number;
  status?: string;
  supplierId?: string;
}) {
  return useQuery({
    queryKey: purchaseOrderKeys.list(params || {}),
    queryFn: async () => {
      const response = await api.purchaseOrders.list(params);
      return response.data;
    },
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Fetch single purchase order by ID
 */
export function usePurchaseOrder(id: string) {
  return useQuery({
    queryKey: purchaseOrderKeys.detail(id),
    queryFn: async () => {
      const response = await api.purchaseOrders.getById(id);
      return response.data;
    },
    enabled: !!id,
    staleTime: 30000,
  });
}

/**
 * Create new purchase order
 */
export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: any) => {
      const response = await api.purchaseOrders.create(data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.lists() });
    },
  });
}

/**
 * Update purchase order status
 */
export function useUpdatePOStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await api.purchaseOrders.updateStatus(id, status);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.lists() });
      queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.detail(variables.id) });
    },
  });
}

/**
 * Submit purchase order (DRAFT → PENDING)
 */
export function useSubmitPurchaseOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await api.purchaseOrders.submit(id);
      return response.data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.lists() });
      queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.detail(id) });
    },
  });
}

/**
 * Cancel purchase order
 */
export function useCancelPurchaseOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await api.purchaseOrders.cancel(id);
      return response.data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.lists() });
      queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.detail(id) });
    },
  });
}

/**
 * Delete purchase order (DRAFT only)
 */
export function useDeletePurchaseOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await api.purchaseOrders.delete(id);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.lists() });
    },
  });
}

/**
 * Send PO to supplier (auto-creates goods receipt draft)
 */
export function useSendPOToSupplier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await api.purchaseOrders.sendToSupplier(id);
      return response.data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.lists() });
      queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.detail(id) });
    },
  });
}

/**
 * Create supplier invoice
 */
export function useCreateInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: any) => {
      const response = await api.purchaseOrders.createInvoice(data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.lists() });
    },
  });
}

/**
 * Record payment
 */
export function useRecordPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: any) => {
      const response = await api.purchaseOrders.recordPayment(data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.lists() });
    },
  });
}
