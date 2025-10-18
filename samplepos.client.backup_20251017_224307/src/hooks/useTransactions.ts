/**
 * React Query Hooks for Transaction Management
 * Provides optimized data fetching, caching, and mutations for transactions
 */

import { useQuery, useMutation, useQueryClient, type UseQueryOptions, type UseMutationOptions } from '@tanstack/react-query';
import { queryKeys } from '@/config/queryClient';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// ============================================================
// TYPES
// ============================================================

export interface TransactionItem {
  id?: number;
  transaction_id?: number;
  inventory_item_id: number;
  product_name?: string;
  quantity: number;
  price: number;
  total: number;
  discount?: number;
  metadata?: Record<string, unknown>;
}

export interface Transaction {
  id: number;
  customer_id: number;
  customer_name?: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  payment_status: 'paid' | 'unpaid' | 'partial';
  payment_method?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  items?: TransactionItem[];
}

export interface TransactionListParams {
  page?: number;
  limit?: number;
  search?: string;
  filter?: {
    payment_status?: 'paid' | 'unpaid' | 'partial';
    customer_id?: number;
    start_date?: string;
    end_date?: string;
  };
  sort?: string; // Format: "field:asc" or "field:desc"
}

export interface TransactionListResponse {
  data: Transaction[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface TransactionStats {
  total_transactions: number;
  total_sales: number;
  total_tax: number;
  total_discount: number;
  average_transaction: number;
  paid_count: number;
  unpaid_count: number;
  partial_count: number;
}

export interface PaymentMethodStats {
  payment_method: string;
  count: number;
  total: number;
  percentage: number;
}

export interface HourlySales {
  hour: number;
  transaction_count: number;
  total_sales: number;
}

export interface TopProduct {
  inventory_item_id: number;
  product_name: string;
  quantity_sold: number;
  total_revenue: number;
  transaction_count: number;
}

export interface CreateTransactionData {
  customer_id: number;
  items: TransactionItem[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  payment_status: 'paid' | 'unpaid' | 'partial';
  payment_method?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateTransactionStatusData {
  id: number;
  payment_status: 'paid' | 'unpaid' | 'partial';
  payment_method?: string;
}

// ============================================================
// QUERY HOOKS
// ============================================================

/**
 * Fetch paginated list of transactions with filters
 */
export function useTransactionList(
  params: TransactionListParams = {},
  options?: Omit<UseQueryOptions<TransactionListResponse>, 'queryKey' | 'queryFn'>
) {
  const queryParams = new URLSearchParams();
  
  if (params.page) queryParams.set('page', params.page.toString());
  if (params.limit) queryParams.set('limit', params.limit.toString());
  if (params.search) queryParams.set('search', params.search);
  if (params.sort) queryParams.set('sort', params.sort);
  
  if (params.filter?.payment_status) {
    queryParams.set('filter[payment_status]', params.filter.payment_status);
  }
  if (params.filter?.customer_id) {
    queryParams.set('filter[customer_id]', params.filter.customer_id.toString());
  }
  if (params.filter?.start_date) {
    queryParams.set('filter[start_date]', params.filter.start_date);
  }
  if (params.filter?.end_date) {
    queryParams.set('filter[end_date]', params.filter.end_date);
  }

  return useQuery<TransactionListResponse>({
    queryKey: queryKeys.transactions.list(params),
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/transactions?${queryParams.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch transactions');
      }
      return response.json();
    },
    staleTime: 1 * 60 * 1000, // 1 minute (fresher data for transactions)
    ...options,
  });
}

/**
 * Fetch a single transaction with all items
 */
export function useTransaction(
  id: number | undefined,
  options?: Omit<UseQueryOptions<Transaction>, 'queryKey' | 'queryFn'>
) {
  return useQuery<Transaction>({
    queryKey: queryKeys.transactions.detail(id?.toString() || ''),
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/transactions/${id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch transaction');
      }
      return response.json();
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  });
}

/**
 * Fetch transaction statistics for a date range
 */
export function useTransactionStats(
  startDate: string,
  endDate: string,
  options?: Omit<UseQueryOptions<TransactionStats>, 'queryKey' | 'queryFn'>
) {
  return useQuery<TransactionStats>({
    queryKey: queryKeys.transactions.stats(startDate, endDate),
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE}/transactions/stats?start_date=${startDate}&end_date=${endDate}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch transaction stats');
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  });
}

/**
 * Fetch payment method breakdown for a date range
 */
export function usePaymentMethodStats(
  startDate: string,
  endDate: string,
  options?: Omit<UseQueryOptions<PaymentMethodStats[]>, 'queryKey' | 'queryFn'>
) {
  return useQuery<PaymentMethodStats[]>({
    queryKey: queryKeys.transactions.paymentMethods(startDate, endDate),
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE}/transactions/payment-methods?start_date=${startDate}&end_date=${endDate}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch payment method stats');
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  });
}

/**
 * Fetch hourly sales data
 */
export function useHourlySales(
  date: string,
  options?: Omit<UseQueryOptions<HourlySales[]>, 'queryKey' | 'queryFn'>
) {
  return useQuery<HourlySales[]>({
    queryKey: [...queryKeys.transactions.all, 'hourly-sales', date],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/transactions/hourly-sales?date=${date}`);
      if (!response.ok) {
        throw new Error('Failed to fetch hourly sales');
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  });
}

/**
 * Fetch top selling products for a date range
 */
export function useTopProducts(
  startDate: string,
  endDate: string,
  limit: number = 10,
  options?: Omit<UseQueryOptions<TopProduct[]>, 'queryKey' | 'queryFn'>
) {
  return useQuery<TopProduct[]>({
    queryKey: [...queryKeys.transactions.all, 'top-products', startDate, endDate, limit],
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE}/transactions/top-products?start_date=${startDate}&end_date=${endDate}&limit=${limit}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch top products');
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  });
}

// ============================================================
// MUTATION HOOKS
// ============================================================

/**
 * Create a new transaction with items
 */
export function useCreateTransaction(
  options?: Omit<UseMutationOptions<Transaction, Error, CreateTransactionData>, 'mutationFn'>
) {
  const queryClient = useQueryClient();

  return useMutation<Transaction, Error, CreateTransactionData>({
    mutationFn: async (data) => {
      const response = await fetch(`${API_BASE}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create transaction');
      }
      return response.json();
    },
    onSuccess: () => {
      // Invalidate transaction lists, stats, and related data
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
    },
    ...options,
  });
}

/**
 * Update transaction payment status
 */
export function useUpdateTransactionStatus(
  options?: Omit<UseMutationOptions<Transaction, Error, UpdateTransactionStatusData>, 'mutationFn'>
) {
  const queryClient = useQueryClient();

  return useMutation<Transaction, Error, UpdateTransactionStatusData>({
    mutationFn: async (data) => {
      const { id, ...updateData } = data;
      const response = await fetch(`${API_BASE}/transactions/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update transaction status');
      }
      return response.json();
    },
    onSuccess: (data) => {
      // Invalidate specific transaction and lists
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.detail(data.id.toString()) });
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
    },
    ...options,
  });
}

/**
 * Delete a transaction (admin only)
 */
export function useDeleteTransaction(
  options?: Omit<UseMutationOptions<void, Error, number>, 'mutationFn'>
) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      const response = await fetch(`${API_BASE}/transactions/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete transaction');
      }
    },
    onSuccess: (_data, id) => {
      // Invalidate transaction detail, lists, and stats
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.detail(id.toString()) });
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
    },
    ...options,
  });
}
