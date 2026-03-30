import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../utils/api';
import { GOODS_RECEIPTS_KEYS } from './useGoodsReceipts';

// Types
export interface ReturnGrnLine {
  productId: string;
  batchId?: string;
  uomId: string;
  quantity: number;
  unitCost: number;
}

export interface CreateReturnGrnInput {
  grnId: string;
  returnDate?: string;
  reason: string;
  lines: ReturnGrnLine[];
}

export interface ReturnableItem {
  productId: string;
  productName: string;
  batchId: string | null;
  batchNumber: string | null;
  uomId: string;
  uomName: string;
  conversionFactor: number;
  receivedQuantity: number;
  returnedQuantity: number;
  returnableQuantity: number;
  unitCost: number;
  expiryDate: string | null;
}

export interface ReturnGrnRecord {
  id: string;
  returnGrnNumber: string;
  grnId: string;
  grnNumber: string;
  supplierId: string;
  supplierName: string;
  returnDate: string;
  status: 'DRAFT' | 'POSTED';
  reason: string;
  totalAmount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// Query keys
export const RETURN_GRN_KEYS = {
  all: ['return-grn'] as const,
  lists: () => [...RETURN_GRN_KEYS.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...RETURN_GRN_KEYS.lists(), filters] as const,
  details: () => [...RETURN_GRN_KEYS.all, 'detail'] as const,
  detail: (id: string) => [...RETURN_GRN_KEYS.details(), id] as const,
  returnable: (grnId: string) => [...RETURN_GRN_KEYS.all, 'returnable', grnId] as const,
  byGrn: (grnId: string) => [...RETURN_GRN_KEYS.all, 'by-grn', grnId] as const,
};

// List return GRNs
export function useReturnGrns(params?: {
  page?: number;
  limit?: number;
  grnId?: string;
  supplierId?: string;
  status?: string;
}) {
  return useQuery({
    queryKey: RETURN_GRN_KEYS.list(params || {}),
    queryFn: () => api.returnGrn.list(params),
  });
}

// Get return GRN by ID
export function useReturnGrn(id: string) {
  return useQuery({
    queryKey: RETURN_GRN_KEYS.detail(id),
    queryFn: () => api.returnGrn.getById(id),
    enabled: !!id,
  });
}

// Get returnable items for a GRN
export function useReturnableItems(grnId: string) {
  return useQuery({
    queryKey: RETURN_GRN_KEYS.returnable(grnId),
    queryFn: () => api.returnGrn.getReturnableItems(grnId),
    enabled: !!grnId,
  });
}

// Get return GRNs linked to a specific GRN
export function useReturnGrnsByGrn(grnId: string) {
  return useQuery({
    queryKey: RETURN_GRN_KEYS.byGrn(grnId),
    queryFn: () => api.returnGrn.getByGrnId(grnId),
    enabled: !!grnId,
  });
}

// Create return GRN
export function useCreateReturnGrn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateReturnGrnInput) => api.returnGrn.create(data),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: RETURN_GRN_KEYS.lists() });
      queryClient.invalidateQueries({ queryKey: RETURN_GRN_KEYS.byGrn(vars.grnId) });
      queryClient.invalidateQueries({ queryKey: RETURN_GRN_KEYS.returnable(vars.grnId) });
    },
  });
}

// Post (finalize) return GRN
export function usePostReturnGrn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.returnGrn.post(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RETURN_GRN_KEYS.all });
      queryClient.invalidateQueries({ queryKey: GOODS_RECEIPTS_KEYS.all });
      // Inventory changed, invalidate stock
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
