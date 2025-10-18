/**
 * React Query Hooks for Customer Management
 * Provides optimized data fetching, caching, and mutations for customers
 */

import { useQuery, useMutation, useQueryClient, type UseQueryOptions, type UseMutationOptions } from '@tanstack/react-query';
import { queryKeys } from '@/config/queryClient';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// ============================================================
// TYPES
// ============================================================

export interface Customer {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  metadata?: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Aggregated fields from repository
  total_transactions?: number;
  total_spent?: number;
  last_purchase_date?: string;
}

export interface CustomerListParams {
  page?: number;
  limit?: number;
  search?: string;
  filter?: {
    is_active?: boolean;
  };
  sort?: string; // Format: "field:asc" or "field:desc"
}

export interface CustomerListResponse {
  data: Customer[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface Transaction {
  id: number;
  customer_id: number;
  total: number;
  payment_status: 'paid' | 'unpaid' | 'partial';
  created_at: string;
}

export interface CustomerTransactionHistory {
  data: Transaction[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CustomerStats {
  total_customers: number;
  active_customers: number;
  inactive_customers: number;
  total_transactions: number;
  total_revenue: number;
  average_transaction: number;
}

export interface TopCustomer {
  customer_id: number;
  name: string;
  total_spent: number;
  transaction_count: number;
  last_purchase_date: string;
}

export interface CreateCustomerData {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  metadata?: Record<string, unknown>;
  is_active?: boolean;
}

export interface UpdateCustomerData extends Partial<CreateCustomerData> {
  id: number;
}

// ============================================================
// QUERY HOOKS
// ============================================================

/**
 * Fetch paginated list of customers with filters and search
 */
export function useCustomerList(
  params: CustomerListParams = {},
  options?: Omit<UseQueryOptions<CustomerListResponse>, 'queryKey' | 'queryFn'>
) {
  const queryParams = new URLSearchParams();
  
  if (params.page) queryParams.set('page', params.page.toString());
  if (params.limit) queryParams.set('limit', params.limit.toString());
  if (params.search) queryParams.set('search', params.search);
  if (params.sort) queryParams.set('sort', params.sort);
  if (params.filter?.is_active !== undefined) {
    queryParams.set('filter[is_active]', params.filter.is_active.toString());
  }

  return useQuery<CustomerListResponse>({
    queryKey: queryKeys.customers.list(params),
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/customers?${queryParams.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch customers');
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  });
}

/**
 * Fetch a single customer by ID with aggregated data
 */
export function useCustomer(
  id: number | undefined,
  options?: Omit<UseQueryOptions<Customer>, 'queryKey' | 'queryFn'>
) {
  return useQuery<Customer>({
    queryKey: queryKeys.customers.detail(id?.toString() || ''),
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/customers/${id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch customer');
      }
      return response.json();
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  });
}

/**
 * Fetch customer transaction history
 */
export function useCustomerTransactionHistory(
  customerId: number | undefined,
  params: { page?: number; limit?: number } = {},
  options?: Omit<UseQueryOptions<CustomerTransactionHistory>, 'queryKey' | 'queryFn'>
) {
  const queryParams = new URLSearchParams();
  if (params.page) queryParams.set('page', params.page.toString());
  if (params.limit) queryParams.set('limit', params.limit.toString());

  return useQuery<CustomerTransactionHistory>({
    queryKey: queryKeys.customers.transactions(customerId?.toString() || '', params.page || 1),
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE}/customers/${customerId}/transactions?${queryParams.toString()}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch customer transactions');
      }
      return response.json();
    },
    enabled: !!customerId,
    staleTime: 1 * 60 * 1000, // 1 minute (fresher data for transactions)
    ...options,
  });
}

/**
 * Fetch customer statistics
 */
export function useCustomerStats(
  options?: Omit<UseQueryOptions<CustomerStats>, 'queryKey' | 'queryFn'>
) {
  return useQuery<CustomerStats>({
    queryKey: queryKeys.customers.stats(),
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/customers/stats`);
      if (!response.ok) {
        throw new Error('Failed to fetch customer stats');
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  });
}

/**
 * Fetch top customers by spending
 */
export function useTopCustomers(
  limit: number = 10,
  options?: Omit<UseQueryOptions<TopCustomer[]>, 'queryKey' | 'queryFn'>
) {
  return useQuery<TopCustomer[]>({
    queryKey: queryKeys.customers.top(limit),
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/customers/top?limit=${limit}`);
      if (!response.ok) {
        throw new Error('Failed to fetch top customers');
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
 * Create a new customer
 */
export function useCreateCustomer(
  options?: Omit<UseMutationOptions<Customer, Error, CreateCustomerData>, 'mutationFn'>
) {
  const queryClient = useQueryClient();

  return useMutation<Customer, Error, CreateCustomerData>({
    mutationFn: async (data) => {
      const response = await fetch(`${API_BASE}/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create customer');
      }
      return response.json();
    },
    onSuccess: () => {
      // Invalidate customer list and stats
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.stats() });
    },
    ...options,
  });
}

/**
 * Update an existing customer
 */
export function useUpdateCustomer(
  options?: Omit<UseMutationOptions<Customer, Error, UpdateCustomerData>, 'mutationFn'>
) {
  const queryClient = useQueryClient();

  return useMutation<Customer, Error, UpdateCustomerData>({
    mutationFn: async (data) => {
      const { id, ...updateData } = data;
      const response = await fetch(`${API_BASE}/customers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update customer');
      }
      return response.json();
    },
    onSuccess: (data) => {
      // Invalidate specific customer, list, and stats
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.detail(data.id.toString()) });
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.stats() });
    },
    ...options,
  });
}

/**
 * Delete a customer
 */
export function useDeleteCustomer(
  options?: Omit<UseMutationOptions<void, Error, number>, 'mutationFn'>
) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      const response = await fetch(`${API_BASE}/customers/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete customer');
      }
    },
    onSuccess: (_data, id) => {
      // Invalidate customer detail, list, and stats
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.detail(id.toString()) });
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.stats() });
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
    },
    ...options,
  });
}
