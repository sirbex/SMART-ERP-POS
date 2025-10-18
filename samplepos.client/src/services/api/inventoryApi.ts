/**
 * Inventory API
 * 
 * Handles stock management, batch tracking, stock adjustments, and inventory operations.
 * Aligned with backend endpoints in SamplePOS.Server/src/modules/inventory.ts
 * 
 * @module services/api/inventoryApi
 */

import api from '@/config/api.config';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  StockBatch,
  ApiResponse,
  PaginatedResponse
} from '@/types/backend';

// ===================================================================
// TYPE DEFINITIONS
// ===================================================================

/**
 * Query parameters for fetching stock batches
 */
export interface GetStockBatchesParams {
  productId?: string;
  page?: number;
  limit?: number;
  inStock?: boolean;
}

/**
 * Stock batch with product details
 */
export interface StockBatchWithProduct extends StockBatch {
  product: {
    id: number;
    name: string;
    sku?: string;
    unit?: string;
  };
}

/**
 * Request to create stock adjustment
 */
export interface StockAdjustmentRequest {
  productId: string;
  quantity: number;
  reason: string;
  notes?: string;
  adjustmentType: 'INCREASE' | 'DECREASE';
}

/**
 * Request to receive inventory (new stock batch)
 */
export interface ReceiveInventoryRequest {
  productId: string;
  quantity: number;
  costPrice: number;
  purchaseId?: string;
  batchNumber?: string;
  expiryDate?: string;
  purchaseDate?: string;
  notes?: string;
}

/**
 * Stock level summary by product
 */
export interface StockLevelSummary {
  productId: string;
  productName: string;
  sku?: string;
  totalStock: number;
  reservedStock: number;
  availableStock: number;
  reorderLevel?: number;
  needsReorder: boolean;
  batchCount: number;
}

/**
 * Stock movement record
 */
export interface StockMovement {
  id: number;
  productId: string;
  productName: string;
  movementType: 'IN' | 'OUT' | 'ADJUSTMENT';
  quantity: number;
  balanceAfter: number;
  reference?: string;
  reason?: string;
  createdAt: Date;
  createdBy?: number;
}

/**
 * Query parameters for stock movements
 */
export interface GetStockMovementsParams {
  productId?: string;
  startDate?: string;
  endDate?: string;
  movementType?: 'IN' | 'OUT' | 'ADJUSTMENT';
  page?: number;
  limit?: number;
}

/**
 * Stock valuation summary
 */
export interface StockValuationReport {
  totalValue: number;
  itemCount: number;
  products: Array<{
    productId: string;
    productName: string;
    quantity: number;
    costPrice: number;
    totalValue: number;
  }>;
}

// ===================================================================
// API FUNCTIONS
// ===================================================================

/**
 * Get all stock batches with pagination and filters
 * GET /api/inventory/batches
 */
export const getStockBatches = async (
  params?: GetStockBatchesParams
): Promise<PaginatedResponse<StockBatchWithProduct>> => {
  const { data } = await api.get<PaginatedResponse<StockBatchWithProduct>>('/inventory/batches', {
    params,
  });
  return data;
};

/**
 * Get single stock batch by ID
 * GET /api/inventory/batches/:id
 */
export const getStockBatch = async (id: string): Promise<StockBatchWithProduct> => {
  const { data } = await api.get<ApiResponse<StockBatchWithProduct>>(`/inventory/batches/${id}`);
  return data.data;
};

/**
 * Update stock batch (adjust quantity)
 * PUT /api/inventory/batches/:id
 */
export const updateStockBatch = async (
  id: string,
  quantity: number
): Promise<StockBatch> => {
  const { data } = await api.put<ApiResponse<StockBatch>>(`/inventory/batches/${id}`, {
    quantity,
  });
  return data.data;
};

/**
 * Delete stock batch
 * DELETE /api/inventory/batches/:id
 */
export const deleteStockBatch = async (id: string): Promise<void> => {
  await api.delete(`/inventory/batches/${id}`);
};

/**
 * Get stock levels for all products
 * GET /api/inventory/stock-levels
 */
export const getStockLevels = async (): Promise<StockLevelSummary[]> => {
  const { data } = await api.get<ApiResponse<StockLevelSummary[]>>('/inventory/stock-levels');
  return data.data;
};

/**
 * Receive inventory (create new stock batch)
 * POST /api/inventory/receive
 */
export const receiveInventory = async (request: ReceiveInventoryRequest): Promise<StockBatch> => {
  const { data } = await api.post<ApiResponse<StockBatch>>('/inventory/receive', request);
  return data.data;
};

/**
 * Get stock movements with filters
 * GET /api/inventory/movements
 */
export const getStockMovements = async (
  params?: GetStockMovementsParams
): Promise<PaginatedResponse<StockMovement>> => {
  const { data } = await api.get<PaginatedResponse<StockMovement>>('/inventory/movements', {
    params,
  });
  return data;
};

/**
 * Get stock summary for specific product
 * GET /api/inventory/product/:productId/summary
 */
export const getProductStockSummary = async (productId: string): Promise<StockLevelSummary> => {
  const { data } = await api.get<ApiResponse<StockLevelSummary>>(
    `/inventory/product/${productId}/summary`
  );
  return data.data;
};

/**
 * Get stock valuation report
 * GET /api/inventory/valuation
 */
export const getStockValuation = async (): Promise<StockValuationReport> => {
  const { data } = await api.get<ApiResponse<StockValuationReport>>('/inventory/valuation');
  return data.data;
};

/**
 * Get expiring stock batches
 * GET /api/inventory/expiring
 */
export const getExpiringStock = async (days: number = 30): Promise<StockBatchWithProduct[]> => {
  const { data } = await api.get<ApiResponse<StockBatchWithProduct[]>>('/inventory/expiring', {
    params: { days },
  });
  return data.data;
};

// ===================================================================
// REACT QUERY HOOKS
// ===================================================================

/**
 * Hook to get all stock batches with pagination and filters
 * @example
 * const { data: batches } = useStockBatches({ productId: 'product-123', inStock: true });
 */
export function useStockBatches(params?: GetStockBatchesParams) {
  return useQuery({
    queryKey: ['stockBatches', params],
    queryFn: () => getStockBatches(params),
    staleTime: 60000, // 1 minute
  });
}

/**
 * Hook to get single stock batch by ID
 * @example
 * const { data: batch } = useStockBatch('batch-123');
 */
export function useStockBatch(id: string | null | undefined) {
  return useQuery({
    queryKey: ['stockBatch', id],
    queryFn: () => getStockBatch(id!),
    enabled: !!id,
    staleTime: 60000,
  });
}

/**
 * Hook to get stock levels for all products
 * @example
 * const { data: stockLevels } = useStockLevels();
 */
export function useStockLevels() {
  return useQuery({
    queryKey: ['stockLevels'],
    queryFn: () => getStockLevels(),
    staleTime: 60000,
  });
}

/**
 * Hook to get stock movements with filters
 * @example
 * const { data: movements } = useStockMovements({ 
 *   productId: 'product-123',
 *   movementType: 'OUT' 
 * });
 */
export function useStockMovements(params?: GetStockMovementsParams) {
  return useQuery({
    queryKey: ['stockMovements', params],
    queryFn: () => getStockMovements(params),
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Hook to get product stock summary
 * @example
 * const { data: summary } = useProductStockSummary('product-123');
 */
export function useProductStockSummary(productId: string | null | undefined) {
  return useQuery({
    queryKey: ['productStockSummary', productId],
    queryFn: () => getProductStockSummary(productId!),
    enabled: !!productId,
    staleTime: 60000,
  });
}

/**
 * Hook to get stock valuation report
 * @example
 * const { data: valuation } = useStockValuation();
 */
export function useStockValuation() {
  return useQuery({
    queryKey: ['stockValuation'],
    queryFn: () => getStockValuation(),
    staleTime: 120000, // 2 minutes
  });
}

/**
 * Hook to get expiring stock batches
 * @example
 * const { data: expiring } = useExpiringStock(30); // Next 30 days
 */
export function useExpiringStock(days: number = 30) {
  return useQuery({
    queryKey: ['expiringStock', days],
    queryFn: () => getExpiringStock(days),
    staleTime: 120000,
  });
}

/**
 * Hook to receive inventory (create new stock batch)
 * @example
 * const receiveMutation = useReceiveInventory();
 * await receiveMutation.mutateAsync({
 *   productId: 'product-123',
 *   quantity: 100,
 *   costPrice: 1000,
 *   batchNumber: 'BATCH-001'
 * });
 */
export function useReceiveInventory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: receiveInventory,
    onSuccess: (newBatch: StockBatch) => {
      // Invalidate stock batches
      queryClient.invalidateQueries({ queryKey: ['stockBatches'] });
      // Invalidate product-specific queries
      queryClient.invalidateQueries({ queryKey: ['product', newBatch.productId] });
      queryClient.invalidateQueries({ queryKey: ['productStockSummary', newBatch.productId] });
      // Invalidate stock levels and movements
      queryClient.invalidateQueries({ queryKey: ['stockLevels'] });
      queryClient.invalidateQueries({ queryKey: ['stockMovements'] });
      // Invalidate valuation
      queryClient.invalidateQueries({ queryKey: ['stockValuation'] });
      // Invalidate low stock products
      queryClient.invalidateQueries({ queryKey: ['lowStockProducts'] });
    },
  });
}

/**
 * Hook to update stock batch
 * @example
 * const updateBatchMutation = useUpdateStockBatch();
 * await updateBatchMutation.mutateAsync({ id: 'batch-123', quantity: 50 });
 */
export function useUpdateStockBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) =>
      updateStockBatch(id, quantity),
    onSuccess: (updatedBatch: StockBatch, variables) => {
      // Invalidate specific batch
      queryClient.invalidateQueries({ queryKey: ['stockBatch', variables.id] });
      // Invalidate batches list
      queryClient.invalidateQueries({ queryKey: ['stockBatches'] });
      // Invalidate product-specific queries
      queryClient.invalidateQueries({ queryKey: ['product', updatedBatch.productId] });
      queryClient.invalidateQueries({ queryKey: ['productStockSummary', updatedBatch.productId] });
      // Invalidate stock levels and movements
      queryClient.invalidateQueries({ queryKey: ['stockLevels'] });
      queryClient.invalidateQueries({ queryKey: ['stockMovements'] });
      // Invalidate valuation
      queryClient.invalidateQueries({ queryKey: ['stockValuation'] });
      // Invalidate low stock products
      queryClient.invalidateQueries({ queryKey: ['lowStockProducts'] });
    },
  });
}

/**
 * Hook to delete stock batch
 * @example
 * const deleteBatchMutation = useDeleteStockBatch();
 * await deleteBatchMutation.mutateAsync('batch-123');
 */
export function useDeleteStockBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteStockBatch,
    onSuccess: (_, batchId) => {
      // Invalidate specific batch
      queryClient.invalidateQueries({ queryKey: ['stockBatch', batchId] });
      // Invalidate batches list
      queryClient.invalidateQueries({ queryKey: ['stockBatches'] });
      // Invalidate all stock-related queries
      queryClient.invalidateQueries({ queryKey: ['stockLevels'] });
      queryClient.invalidateQueries({ queryKey: ['stockMovements'] });
      queryClient.invalidateQueries({ queryKey: ['stockValuation'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['lowStockProducts'] });
    },
  });
}

// Export everything as a namespace for convenience
export const inventoryApi = {
  getStockBatches,
  getStockBatch,
  updateStockBatch,
  deleteStockBatch,
  getStockLevels,
  receiveInventory,
  getStockMovements,
  getProductStockSummary,
  getStockValuation,
  getExpiringStock,
};
