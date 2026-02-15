/**
 * React Query hooks for Stock Movements API
 * Provides data fetching and caching for complete audit trail
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getErrorMessage } from '../utils/api';

/**
 * Query key factory for stock movements
 * Provides organized cache keys for targeted invalidation
 */
export const stockMovementKeys = {
  all: ['stock-movements'] as const,
  lists: () => [...stockMovementKeys.all, 'list'] as const,
  list: (filters: Record<string, any>) => [...stockMovementKeys.lists(), filters] as const,
  byProduct: (productId: string) => [...stockMovementKeys.all, 'product', productId] as const,
  byBatch: (batchId: string) => [...stockMovementKeys.all, 'batch', batchId] as const,
  byUser: (userId: string) => [...stockMovementKeys.all, 'user', userId] as const,
};

/**
 * Fetch all stock movements with filters
 * Supports pagination, date range, product, type, and user filters
 */
export function useStockMovements(params?: {
  page?: number;
  limit?: number;
  movementType?: string;
  startDate?: string;
  endDate?: string;
  productId?: string;
  userId?: string;
}) {
  return useQuery({
    queryKey: stockMovementKeys.list(params || {}),
    queryFn: async () => {
      const response = await api.stockMovements.list(params);
      return response.data;
    },
    staleTime: 30000, // 30 seconds - audit data should be fresh
  });
}

/**
 * Fetch stock movements for a specific product
 */
export function useStockMovementsByProduct(productId: string, params?: {
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: stockMovementKeys.byProduct(productId),
    queryFn: async () => {
      const response = await api.stockMovements.byProduct(productId, params);
      return response.data;
    },
    enabled: !!productId,
    staleTime: 30000,
  });
}

/**
 * Fetch stock movements for a specific batch
 */
export function useStockMovementsByBatch(batchId: string, params?: {
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: stockMovementKeys.byBatch(batchId),
    queryFn: async () => {
      const response = await api.stockMovements.byBatch(batchId, params);
      return response.data;
    },
    enabled: !!batchId,
    staleTime: 30000,
  });
}

/**
 * Record a new stock movement
 * This creates an immutable audit trail entry
 */
export function useRecordStockMovement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      productId: string;
      batchId?: string;
      movementType: 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'RETURN' | 'DAMAGE' | 'EXPIRY';
      quantity: number;
      notes?: string;
      createdBy: string;
    }) => {
      const response = await api.stockMovements.record(data);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate all stock movement queries to reflect the new entry
      queryClient.invalidateQueries({ queryKey: stockMovementKeys.all });
      // Also invalidate inventory queries since stock levels changed
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (error) => {
      console.error('Failed to record stock movement:', getErrorMessage(error));
    },
  });
}

/**
 * Export stock movements to CSV
 * Returns a blob URL for download
 */
export async function exportStockMovementsCSV(params?: {
  movementType?: string;
  startDate?: string;
  endDate?: string;
  productId?: string;
}): Promise<string> {
  try {
    // This would call a backend endpoint that returns CSV data
    const response = await api.stockMovements.list(params);
    const movementsData = response.data;
    const movements = Array.isArray(movementsData) ? movementsData : [];

    // Convert to CSV format
    const headers = [
      'Date',
      'Product',
      'Batch',
      'Type',
      'Quantity',
      'Unit Cost',
      'Total Value',
      'Balance After',
      'Reference',
      'User',
      'Notes'
    ];

    const csvRows = [
      headers.join(','),
      ...movements.map((m: any) => [
        m.createdAt,
        `"${m.productName || ''}"`,
        m.batchNumber || '',
        m.movementType,
        m.quantity,
        m.unitCost || 0,
        m.totalValue || 0,
        m.balanceAfter || 0,
        m.referenceType ? `${m.referenceType}-${m.referenceId}` : '',
        m.userName || '',
        `"${m.notes || ''}"`
      ].join(','))
    ];

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error('Failed to export CSV:', getErrorMessage(error));
    throw error;
  }
}
