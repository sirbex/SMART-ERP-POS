import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../utils/api';

// Query keys
export const GOODS_RECEIPTS_KEYS = {
  all: ['goods-receipts'] as const,
  lists: () => [...GOODS_RECEIPTS_KEYS.all, 'list'] as const,
  list: (filters: any) => [...GOODS_RECEIPTS_KEYS.lists(), filters] as const,
  details: () => [...GOODS_RECEIPTS_KEYS.all, 'detail'] as const,
  detail: (id: string) => [...GOODS_RECEIPTS_KEYS.details(), id] as const,
};

// List goods receipts
export function useGoodsReceipts(params?: {
  page?: number;
  limit?: number;
  status?: string;
  purchaseOrderId?: string;
}) {
  return useQuery({
    queryKey: GOODS_RECEIPTS_KEYS.list(params || {}),
    queryFn: () => api.goodsReceipts.list(params),
  });
}

// Get goods receipt by ID
export function useGoodsReceipt(id: string) {
  return useQuery({
    queryKey: GOODS_RECEIPTS_KEYS.detail(id),
    queryFn: () => api.goodsReceipts.getById(id),
    enabled: !!id,
  });
}

// Create goods receipt
export function useCreateGoodsReceipt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: any) => api.goodsReceipts.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GOODS_RECEIPTS_KEYS.lists() });
      // Invalidate purchase orders list to refresh status
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
  });
}

// Finalize goods receipt
export function useFinalizeGoodsReceipt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.goodsReceipts.finalize(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: GOODS_RECEIPTS_KEYS.lists() });
      queryClient.invalidateQueries({ queryKey: GOODS_RECEIPTS_KEYS.detail(id) });
      // Also invalidate purchase orders as status may change
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
  });
}

// Update GR item (DRAFT only)
export function useUpdateGRItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ grId, itemId, data }: { grId: string; itemId: string; data: any }) =>
      api.goodsReceipts.updateItem(grId, itemId, data),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: GOODS_RECEIPTS_KEYS.detail(vars.grId) });
      queryClient.invalidateQueries({ queryKey: GOODS_RECEIPTS_KEYS.lists() });
    }
  });
}
