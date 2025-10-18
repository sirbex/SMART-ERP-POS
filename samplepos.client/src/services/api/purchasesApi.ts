/**
 * Purchases API
 * 
 * Handles purchase orders, receiving inventory, and supplier purchases.
 * Aligned with backend endpoints in SamplePOS.Server/src/modules/purchases.ts
 * 
 * @module services/api/purchasesApi
 */

import api from '@/config/api.config';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Purchase,
  ApiResponse,
  PaginatedResponse
} from '@/types/backend';

// ===================================================================
// TYPE DEFINITIONS
// ===================================================================

/**
 * Query parameters for fetching purchases
 */
export interface GetPurchasesParams {
  page?: number;
  limit?: number;
  supplierId?: string;
  startDate?: string;
  endDate?: string;
  status?: 'PENDING' | 'RECEIVED' | 'PARTIAL' | 'CANCELLED';
}

/**
 * Purchase with related data
 */
export interface PurchaseWithDetails extends Purchase {
  items: Array<{
    id: number;
    productId: number;
    productName: string;
    quantity: number;
    unitCost: number;
    totalCost: number;
    receivedQuantity: number;
  }>;
  supplier?: {
    id: number;
    name: string;
    email?: string;
    phone?: string;
  };
}

/**
 * Request to create a new purchase order
 */
export interface CreatePurchaseRequest {
  supplierId: string;
  items: Array<{
    productId: string;
    quantity: number;
    unitCost: number;
  }>;
  orderDate?: string;
  expectedDeliveryDate?: string;
  notes?: string;
  reference?: string;
}

/**
 * Request to update a purchase order
 */
export interface UpdatePurchaseRequest {
  supplierId?: string;
  orderDate?: string;
  expectedDeliveryDate?: string;
  notes?: string;
  reference?: string;
  status?: 'PENDING' | 'RECEIVED' | 'PARTIAL' | 'CANCELLED';
}

/**
 * Request to receive purchase order items
 */
export interface ReceivePurchaseRequest {
  purchaseId: string;
  items: Array<{
    purchaseItemId: string;
    quantityReceived: number;
    batchNumber?: string;
    expiryDate?: string;
  }>;
  receivedDate?: string;
  notes?: string;
}

/**
 * Request to cancel purchase order
 */
export interface CancelPurchaseRequest {
  reason: string;
  notes?: string;
}

/**
 * Purchase summary statistics
 */
export interface PurchaseSummary {
  totalPurchases: number;
  totalAmount: number;
  pendingOrders: number;
  receivedOrders: number;
  partialOrders: number;
  cancelledOrders: number;
}

/**
 * Query parameters for purchase summary
 */
export interface GetPurchaseSummaryParams {
  startDate?: string;
  endDate?: string;
  supplierId?: string;
}

// ===================================================================
// API FUNCTIONS
// ===================================================================

/**
 * Get all purchases with pagination and filters
 * GET /api/purchases
 */
export const getPurchases = async (
  params?: GetPurchasesParams
): Promise<PaginatedResponse<Purchase>> => {
  const { data } = await api.get<PaginatedResponse<Purchase>>('/purchases', { params });
  return data;
};

/**
 * Get single purchase by ID with full details
 * GET /api/purchases/:id
 */
export const getPurchase = async (id: string): Promise<PurchaseWithDetails> => {
  const { data } = await api.get<ApiResponse<PurchaseWithDetails>>(`/purchases/${id}`);
  return data.data;
};

/**
 * Create a new purchase order
 * POST /api/purchases
 */
export const createPurchase = async (
  request: CreatePurchaseRequest
): Promise<PurchaseWithDetails> => {
  const { data } = await api.post<ApiResponse<PurchaseWithDetails>>('/purchases', request);
  return data.data;
};

/**
 * Update an existing purchase order
 * PUT /api/purchases/:id
 */
export const updatePurchase = async (
  id: string,
  request: UpdatePurchaseRequest
): Promise<Purchase> => {
  const { data } = await api.put<ApiResponse<Purchase>>(`/purchases/${id}`, request);
  return data.data;
};

/**
 * Receive purchase order items (mark as received)
 * POST /api/purchases/:id/receive
 */
export const receivePurchase = async (request: ReceivePurchaseRequest): Promise<Purchase> => {
  const { purchaseId, ...receiveData } = request;
  const { data } = await api.post<ApiResponse<Purchase>>(
    `/purchases/${purchaseId}/receive`,
    receiveData
  );
  return data.data;
};

/**
 * Cancel purchase order
 * POST /api/purchases/:id/cancel
 */
export const cancelPurchase = async (
  id: string,
  request: CancelPurchaseRequest
): Promise<Purchase> => {
  const { data } = await api.post<ApiResponse<Purchase>>(`/purchases/${id}/cancel`, request);
  return data.data;
};

/**
 * Get purchase summary statistics
 * GET /api/purchases/summary
 */
export const getPurchaseSummary = async (
  params?: GetPurchaseSummaryParams
): Promise<PurchaseSummary> => {
  const { data } = await api.get<ApiResponse<PurchaseSummary>>('/purchases/summary', { params });
  return data.data;
};

/**
 * Get pending purchases (not yet fully received)
 * GET /api/purchases/pending
 */
export const getPendingPurchases = async (): Promise<Purchase[]> => {
  const { data } = await api.get<ApiResponse<Purchase[]>>('/purchases/pending');
  return data.data;
};

// ===================================================================
// REACT QUERY HOOKS
// ===================================================================

/**
 * Hook to get all purchases with pagination and filters
 * @example
 * const { data: purchases } = usePurchases({ 
 *   supplierId: 'supplier-123',
 *   status: 'PENDING'
 * });
 */
export function usePurchases(params?: GetPurchasesParams) {
  return useQuery({
    queryKey: ['purchases', params],
    queryFn: () => getPurchases(params),
    staleTime: 60000, // 1 minute
  });
}

/**
 * Hook to get single purchase by ID
 * @example
 * const { data: purchase } = usePurchase('purchase-123');
 */
export function usePurchase(id: string | null | undefined) {
  return useQuery({
    queryKey: ['purchase', id],
    queryFn: () => getPurchase(id!),
    enabled: !!id,
    staleTime: 60000,
  });
}

/**
 * Hook to get purchase summary statistics
 * @example
 * const { data: summary } = usePurchaseSummary({ 
 *   startDate: '2024-01-01',
 *   endDate: '2024-01-31' 
 * });
 */
export function usePurchaseSummary(params?: GetPurchaseSummaryParams) {
  return useQuery({
    queryKey: ['purchaseSummary', params],
    queryFn: () => getPurchaseSummary(params),
    staleTime: 120000, // 2 minutes
  });
}

/**
 * Hook to get pending purchases
 * @example
 * const { data: pending } = usePendingPurchases();
 */
export function usePendingPurchases() {
  return useQuery({
    queryKey: ['pendingPurchases'],
    queryFn: () => getPendingPurchases(),
    staleTime: 60000,
  });
}

/**
 * Hook to create a purchase order
 * @example
 * const createPurchaseMutation = useCreatePurchase();
 * await createPurchaseMutation.mutateAsync({
 *   supplierId: 'supplier-123',
 *   items: [
 *     { productId: 'prod-1', quantity: 100, unitCost: 500 }
 *   ],
 *   orderDate: '2024-01-01'
 * });
 */
export function useCreatePurchase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createPurchase,
    onSuccess: (newPurchase: PurchaseWithDetails) => {
      // Invalidate purchases list
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      // Invalidate pending purchases
      queryClient.invalidateQueries({ queryKey: ['pendingPurchases'] });
      // Invalidate supplier-specific purchases
      if (newPurchase.supplier?.id) {
        queryClient.invalidateQueries({
          queryKey: ['purchases', { supplierId: String(newPurchase.supplier.id) }],
        });
      }
      // Invalidate summary
      queryClient.invalidateQueries({ queryKey: ['purchaseSummary'] });
    },
  });
}

/**
 * Hook to update a purchase order
 * @example
 * const updatePurchaseMutation = useUpdatePurchase();
 * await updatePurchaseMutation.mutateAsync({
 *   id: 'purchase-123',
 *   request: { status: 'CANCELLED', notes: 'Supplier cancelled' }
 * });
 */
export function useUpdatePurchase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, request }: { id: string; request: UpdatePurchaseRequest }) =>
      updatePurchase(id, request),
    onSuccess: (_, variables) => {
      // Invalidate specific purchase
      queryClient.invalidateQueries({ queryKey: ['purchase', variables.id] });
      // Invalidate purchases list
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      // Invalidate pending purchases
      queryClient.invalidateQueries({ queryKey: ['pendingPurchases'] });
      // Invalidate summary
      queryClient.invalidateQueries({ queryKey: ['purchaseSummary'] });
    },
  });
}

/**
 * Hook to receive purchase order items
 * @example
 * const receiveMutation = useReceivePurchase();
 * await receiveMutation.mutateAsync({
 *   purchaseId: 'purchase-123',
 *   items: [
 *     { purchaseItemId: 'item-1', quantityReceived: 100, batchNumber: 'BATCH-001' }
 *   ]
 * });
 */
export function useReceivePurchase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: receivePurchase,
    onSuccess: (_receivedPurchase, variables) => {
      // Invalidate specific purchase
      queryClient.invalidateQueries({ queryKey: ['purchase', variables.purchaseId] });
      // Invalidate purchases list
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      // Invalidate pending purchases
      queryClient.invalidateQueries({ queryKey: ['pendingPurchases'] });
      // Invalidate summary
      queryClient.invalidateQueries({ queryKey: ['purchaseSummary'] });
      // Invalidate inventory (stock received)
      queryClient.invalidateQueries({ queryKey: ['stockBatches'] });
      queryClient.invalidateQueries({ queryKey: ['stockLevels'] });
      queryClient.invalidateQueries({ queryKey: ['stockMovements'] });
      queryClient.invalidateQueries({ queryKey: ['stockValuation'] });
      // Invalidate products (stock levels changed)
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['lowStockProducts'] });
    },
  });
}

/**
 * Hook to cancel a purchase order
 * @example
 * const cancelMutation = useCancelPurchase();
 * await cancelMutation.mutateAsync({
 *   id: 'purchase-123',
 *   request: { reason: 'Supplier unavailable', notes: 'Will reorder later' }
 * });
 */
export function useCancelPurchase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, request }: { id: string; request: CancelPurchaseRequest }) =>
      cancelPurchase(id, request),
    onSuccess: (_, variables) => {
      // Invalidate specific purchase
      queryClient.invalidateQueries({ queryKey: ['purchase', variables.id] });
      // Invalidate purchases list
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      // Invalidate pending purchases
      queryClient.invalidateQueries({ queryKey: ['pendingPurchases'] });
      // Invalidate summary
      queryClient.invalidateQueries({ queryKey: ['purchaseSummary'] });
    },
  });
}

// Export everything as a namespace for convenience
export const purchasesApi = {
  getPurchases,
  getPurchase,
  createPurchase,
  updatePurchase,
  receivePurchase,
  cancelPurchase,
  getPurchaseSummary,
  getPendingPurchases,
};
