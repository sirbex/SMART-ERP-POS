import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../utils/api';
import type { StockCountState } from '../../../shared/zod/stockCount';

export const stockCountKeys = {
  all: ['stockCounts'] as const,
  list: (filters?: { state?: string; locationId?: string }) =>
    [...stockCountKeys.all, 'list', filters ?? {}] as const,
  detail: (id: string) => [...stockCountKeys.all, 'detail', id] as const,
};

export interface StockCountRow {
  id: string;
  name: string;
  location_id?: string | null;
  state: StockCountState;
  created_at: string;
  validated_at?: string | null;
  notes?: string | null;
}

export interface StockCountLineRow {
  id: string;
  stock_count_id: string;
  product_id: string;
  product_lot_id?: string | null;
  batch_id?: string | null;
  expected_qty_base: string | number;
  counted_qty_base?: string | number | null;
  product_name: string;
  product_sku?: string | null;
  lot_number?: string | null;
  batch_number?: string | null;
  expiry_date?: string | null;
  difference?: number | null;
  differencePercentage?: number | null;
}

export function useStockCountsList(
  filters?: { state?: string; locationId?: string },
  enabled = true,
) {
  return useQuery({
    queryKey: stockCountKeys.list(filters),
    queryFn: async () => {
      const res = await api.warehouse.stockCounts.list(filters);
      const data = res.data?.data as { counts: StockCountRow[]; pagination: unknown };
      return data?.counts ?? [];
    },
    enabled,
  });
}

export function useStockCountDetail(id: string, enabled = true) {
  return useQuery({
    queryKey: stockCountKeys.detail(id),
    queryFn: async () => {
      const res = await api.warehouse.stockCounts.getById(id, { limit: 500 });
      return res.data?.data as {
        stockCount: StockCountRow;
        lines: StockCountLineRow[];
        pagination: { total: number };
      };
    },
    enabled: enabled && !!id,
  });
}

export function useCreateStockCount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      locationId?: string | null;
      notes?: string | null;
      includeAllProducts?: boolean;
    }) => api.warehouse.stockCounts.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: stockCountKeys.all }),
  });
}

export function useUpdateStockCountLine(countId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      productId: string;
      productLotId?: string | null;
      batchId?: string | null;
      countedQty: number;
      uom?: string;
      notes?: string | null;
    }) =>
      api.warehouse.stockCounts.updateLine(countId, {
        ...data,
        uom: data.uom ?? 'BASE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: stockCountKeys.detail(countId) });
    },
  });
}

export function useValidateStockCount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      api.warehouse.stockCounts.validate(id, { notes }),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: stockCountKeys.all });
      qc.invalidateQueries({ queryKey: stockCountKeys.detail(vars.id) });
    },
  });
}

export function useCancelStockCount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      api.warehouse.stockCounts.cancel(id, notes),
    onSuccess: () => qc.invalidateQueries({ queryKey: stockCountKeys.all }),
  });
}

export function useExpiryAutomationPreview(enabled = true) {
  return useQuery({
    queryKey: ['expiryAutomation', 'preview'],
    queryFn: async () => {
      const res = await api.warehouse.expiryAutomation.preview();
      return res.data?.data as {
        quarantineMode?: 'HARD' | 'SOFT';
        candidates: Array<{
          productName: string;
          lotNumber: string;
          storeCode: string;
          availableQty: number;
          expiryDate: string;
          quarantineMode?: 'HARD' | 'SOFT';
        }>;
        totalQuantity: number;
      };
    },
    enabled,
    staleTime: 60_000,
  });
}

export function useRunExpiryAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dryRun?: boolean) =>
      api.warehouse.expiryAutomation.process({ force: true, dryRun }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expiryAutomation'] }),
  });
}
