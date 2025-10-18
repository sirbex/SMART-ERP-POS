/**
 * Sales API
 * 
 * Handles POS sales operations, transaction recording, returns, and sales queries.
 * Aligned with backend endpoints in SamplePOS.Server/src/modules/sales.ts
 * 
 * @module services/api/salesApi
 */

import api from '@/config/api.config';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Sale,
  SaleItem,
  ApiResponse,
  PaginatedResponse,
  PaymentMethod
} from '@/types/backend';

// ===================================================================
// TYPE DEFINITIONS
// ===================================================================

/**
 * Query parameters for fetching sales
 */
export interface GetSalesParams {
  page?: number;
  limit?: number;
  customerId?: string;
  startDate?: string;
  endDate?: string;
  status?: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  paymentStatus?: 'PAID' | 'PARTIAL' | 'UNPAID';
}

/**
 * Sale with related data
 */
export interface SaleWithDetails extends Sale {
  items: SaleItem[];
  customer?: {
    id: number;
    name: string;
    email?: string;
    phone?: string;
  };
  createdBy?: {
    id: number;
    username: string;
    fullName?: string;
  };
}

/**
 * Request to create a new sale
 */
export interface CreateSaleRequest {
  customerId?: string;
  items: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
    discount?: number;
    taxRate?: number;
  }>;
  discount?: number;
  taxAmount?: number;
  notes?: string;
  paymentMethod?: PaymentMethod;
  amountPaid?: number;
  paymentReference?: string;
}

/**
 * Request to update a sale
 */
export interface UpdateSaleRequest {
  customerId?: string;
  discount?: number;
  taxAmount?: number;
  notes?: string;
  status?: 'PENDING' | 'COMPLETED' | 'CANCELLED';
}

/**
 * Request to process a return
 */
export interface ProcessReturnRequest {
  saleId: string;
  items: Array<{
    saleItemId: string;
    quantityReturned: number;
    reason: string;
  }>;
  refundMethod?: PaymentMethod;
  notes?: string;
}

/**
 * Sales summary statistics
 */
export interface SalesSummary {
  totalSales: number;
  totalRevenue: number;
  averageSaleValue: number;
  totalItems: number;
  paidSales: number;
  unpaidSales: number;
  completedSales: number;
  cancelledSales: number;
}

/**
 * Sales by period report
 */
export interface SalesByPeriod {
  period: string;
  totalSales: number;
  revenue: number;
  itemsSold: number;
}

/**
 * Query parameters for sales summary
 */
export interface GetSalesSummaryParams {
  startDate?: string;
  endDate?: string;
  customerId?: string;
}

// ===================================================================
// API FUNCTIONS
// ===================================================================

/**
 * Get all sales with pagination and filters
 * GET /api/sales
 */
export const getSales = async (params?: GetSalesParams): Promise<PaginatedResponse<Sale>> => {
  const { data } = await api.get<PaginatedResponse<Sale>>('/sales', { params });
  return data;
};

/**
 * Get single sale by ID with full details
 * GET /api/sales/:id
 */
export const getSale = async (id: string): Promise<SaleWithDetails> => {
  const { data } = await api.get<ApiResponse<SaleWithDetails>>(`/sales/${id}`);
  return data.data;
};

/**
 * Create a new sale (POS transaction)
 * POST /api/sales
 */
export const createSale = async (request: CreateSaleRequest): Promise<SaleWithDetails> => {
  const { data } = await api.post<ApiResponse<SaleWithDetails>>('/sales', request);
  return data.data;
};

/**
 * Update an existing sale
 * PUT /api/sales/:id
 */
export const updateSale = async (id: string, request: UpdateSaleRequest): Promise<Sale> => {
  const { data } = await api.put<ApiResponse<Sale>>(`/sales/${id}`, request);
  return data.data;
};

/**
 * Process a sale return
 * POST /api/sales/return
 */
export const processReturn = async (request: ProcessReturnRequest): Promise<Sale> => {
  const { data } = await api.post<ApiResponse<Sale>>('/sales/return', request);
  return data.data;
};

/**
 * Get sales summary statistics
 * GET /api/sales/summary
 */
export const getSalesSummary = async (params?: GetSalesSummaryParams): Promise<SalesSummary> => {
  const { data } = await api.get<ApiResponse<SalesSummary>>('/sales/summary', { params });
  return data.data;
};

/**
 * Get sales by period (daily, weekly, monthly)
 * GET /api/sales/by-period
 */
export const getSalesByPeriod = async (
  startDate: string,
  endDate: string,
  period: 'DAILY' | 'WEEKLY' | 'MONTHLY' = 'DAILY'
): Promise<SalesByPeriod[]> => {
  const { data } = await api.get<ApiResponse<SalesByPeriod[]>>('/sales/by-period', {
    params: { startDate, endDate, period },
  });
  return data.data;
};

// ===================================================================
// REACT QUERY HOOKS
// ===================================================================

/**
 * Hook to get all sales with pagination and filters
 * @example
 * const { data: sales } = useSales({ 
 *   customerId: 'customer-123',
 *   startDate: '2024-01-01',
 *   status: 'COMPLETED'
 * });
 */
export function useSales(params?: GetSalesParams) {
  return useQuery({
    queryKey: ['sales', params],
    queryFn: () => getSales(params),
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Hook to get single sale by ID
 * @example
 * const { data: sale } = useSale('sale-123');
 */
export function useSale(id: string | null | undefined) {
  return useQuery({
    queryKey: ['sale', id],
    queryFn: () => getSale(id!),
    enabled: !!id,
    staleTime: 30000,
  });
}

/**
 * Hook to get sales summary statistics
 * @example
 * const { data: summary } = useSalesSummary({ 
 *   startDate: '2024-01-01',
 *   endDate: '2024-01-31' 
 * });
 */
export function useSalesSummary(params?: GetSalesSummaryParams) {
  return useQuery({
    queryKey: ['salesSummary', params],
    queryFn: () => getSalesSummary(params),
    staleTime: 60000, // 1 minute
  });
}

/**
 * Hook to get sales by period
 * @example
 * const { data: periodSales } = useSalesByPeriod('2024-01-01', '2024-01-31', 'DAILY');
 */
export function useSalesByPeriod(
  startDate: string,
  endDate: string,
  period: 'DAILY' | 'WEEKLY' | 'MONTHLY' = 'DAILY'
) {
  return useQuery({
    queryKey: ['salesByPeriod', startDate, endDate, period],
    queryFn: () => getSalesByPeriod(startDate, endDate, period),
    enabled: !!startDate && !!endDate,
    staleTime: 60000,
  });
}

/**
 * Hook to create a sale (POS transaction)
 * @example
 * const createSaleMutation = useCreateSale();
 * await createSaleMutation.mutateAsync({
 *   customerId: 'customer-123',
 *   items: [
 *     { productId: 'prod-1', quantity: 2, unitPrice: 1000 }
 *   ],
 *   paymentMethod: 'CASH',
 *   amountPaid: 2000
 * });
 */
export function useCreateSale() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createSale,
    onSuccess: (newSale: SaleWithDetails) => {
      // Invalidate sales list
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      // Invalidate customer-specific sales
      if (newSale.customerId) {
        queryClient.invalidateQueries({ queryKey: ['sales', { customerId: newSale.customerId }] });
        queryClient.invalidateQueries({ queryKey: ['customerBalance', newSale.customerId] });
        queryClient.invalidateQueries({ queryKey: ['customerTransactions', newSale.customerId] });
      }
      // Invalidate product stock (items were sold)
      newSale.items?.forEach((item) => {
        queryClient.invalidateQueries({ queryKey: ['product', item.productId] });
        queryClient.invalidateQueries({ queryKey: ['productStockSummary', item.productId] });
      });
      // Invalidate summaries
      queryClient.invalidateQueries({ queryKey: ['salesSummary'] });
      queryClient.invalidateQueries({ queryKey: ['salesByPeriod'] });
      // Invalidate inventory
      queryClient.invalidateQueries({ queryKey: ['stockLevels'] });
      queryClient.invalidateQueries({ queryKey: ['stockMovements'] });
    },
  });
}

/**
 * Hook to update a sale
 * @example
 * const updateSaleMutation = useUpdateSale();
 * await updateSaleMutation.mutateAsync({
 *   id: 'sale-123',
 *   request: { status: 'CANCELLED', notes: 'Customer requested cancellation' }
 * });
 */
export function useUpdateSale() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, request }: { id: string; request: UpdateSaleRequest }) =>
      updateSale(id, request),
    onSuccess: (updatedSale: Sale, variables) => {
      // Invalidate specific sale
      queryClient.invalidateQueries({ queryKey: ['sale', variables.id] });
      // Invalidate sales list
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      // Invalidate customer data if applicable
      if (updatedSale.customerId) {
        queryClient.invalidateQueries({ queryKey: ['customerBalance', updatedSale.customerId] });
        queryClient.invalidateQueries({ queryKey: ['customerTransactions', updatedSale.customerId] });
      }
      // Invalidate summaries
      queryClient.invalidateQueries({ queryKey: ['salesSummary'] });
      queryClient.invalidateQueries({ queryKey: ['salesByPeriod'] });
    },
  });
}

/**
 * Hook to process a sale return
 * @example
 * const returnMutation = useProcessReturn();
 * await returnMutation.mutateAsync({
 *   saleId: 'sale-123',
 *   items: [
 *     { saleItemId: 'item-1', quantityReturned: 1, reason: 'Defective' }
 *   ],
 *   refundMethod: 'CASH'
 * });
 */
export function useProcessReturn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: processReturn,
    onSuccess: (returnedSale: Sale) => {
      // Invalidate specific sale
      queryClient.invalidateQueries({ queryKey: ['sale', returnedSale.id] });
      // Invalidate sales list
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      // Invalidate customer data
      if (returnedSale.customerId) {
        queryClient.invalidateQueries({ queryKey: ['customerBalance', returnedSale.customerId] });
        queryClient.invalidateQueries({ queryKey: ['customerTransactions', returnedSale.customerId] });
        queryClient.invalidateQueries({ queryKey: ['customerPayments', returnedSale.customerId] });
      }
      // Invalidate summaries
      queryClient.invalidateQueries({ queryKey: ['salesSummary'] });
      queryClient.invalidateQueries({ queryKey: ['salesByPeriod'] });
      // Invalidate inventory (returned items back to stock)
      queryClient.invalidateQueries({ queryKey: ['stockLevels'] });
      queryClient.invalidateQueries({ queryKey: ['stockMovements'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

// Export everything as a namespace for convenience
export const salesApi = {
  getSales,
  getSale,
  createSale,
  updateSale,
  processReturn,
  getSalesSummary,
  getSalesByPeriod,
};
