/**
 * Customers API
 * 
 * Handles basic CRUD operations for customer management.
 * Aligned with backend endpoints in SamplePOS.Server/src/modules/customers.ts
 * 
 * @module services/api/customersApi
 */

import api from '@/config/api.config';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Customer, ApiResponse, PaginatedResponse } from '@/types/backend';

// ===================================================================
// API FUNCTIONS
// ===================================================================

/**
 * Get all customers with pagination and filtering
 * GET /api/customers
 */
export interface GetCustomersParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  filter?: {
    is_active?: boolean;
    type?: string;
  };
}

export const getCustomers = async (params?: GetCustomersParams): Promise<PaginatedResponse<Customer>> => {
  const { data } = await api.get<PaginatedResponse<Customer>>('/customers', { params });
  return data;
};

/**
 * Get single customer by ID
 * GET /api/customers/:id
 */
export const getCustomer = async (id: string): Promise<Customer> => {
  const { data } = await api.get<ApiResponse<Customer>>(`/customers/${id}`);
  return data.data;
};

/**
 * Create new customer
 * POST /api/customers
 */
export interface CreateCustomerData {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  type?: 'INDIVIDUAL' | 'BUSINESS';
  creditLimit?: number;
  notes?: string;
}

export const createCustomer = async (customerData: CreateCustomerData): Promise<Customer> => {
  const { data } = await api.post<ApiResponse<Customer>>('/customers', customerData);
  return data.data;
};

/**
 * Update existing customer
 * PUT /api/customers/:id
 */
export interface UpdateCustomerData {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  type?: 'INDIVIDUAL' | 'BUSINESS';
  creditLimit?: number;
  notes?: string;
  isActive?: boolean;
}

export const updateCustomer = async (
  id: string,
  customerData: UpdateCustomerData
): Promise<Customer> => {
  const { data } = await api.put<ApiResponse<Customer>>(`/customers/${id}`, customerData);
  return data.data;
};

/**
 * Delete customer
 * DELETE /api/customers/:id
 */
export const deleteCustomer = async (id: string): Promise<void> => {
  await api.delete(`/customers/${id}`);
};

/**
 * Search customers
 * POST /api/customers/search
 */
export interface SearchCustomersParams {
  query: string;
  limit?: number;
}

export const searchCustomers = async (params: SearchCustomersParams): Promise<Customer[]> => {
  const { data } = await api.post<ApiResponse<Customer[]>>('/customers/search', params);
  return data.data;
};

/**
 * Get customers with outstanding balances
 * GET /api/customers/with-balance
 */
export interface CustomersWithBalanceParams {
  minBalance?: number;
  page?: number;
  limit?: number;
}

export const getCustomersWithBalance = async (
  params?: CustomersWithBalanceParams
): Promise<PaginatedResponse<Customer>> => {
  const { data } = await api.get<PaginatedResponse<Customer>>('/customers/with-balance', { params });
  return data;
};

/**
 * Get customers by type
 * GET /api/customers/by-type/:type
 */
export const getCustomersByType = async (
  type: 'INDIVIDUAL' | 'BUSINESS'
): Promise<Customer[]> => {
  const { data } = await api.get<ApiResponse<Customer[]>>(`/customers/by-type/${type}`);
  return data.data;
};

/**
 * Get customer statistics
 * GET /api/customers/stats
 */
export interface CustomerStats {
  totalCustomers: number;
  activeCustomers: number;
  customersWithBalance: number;
  totalOutstandingBalance: number;
  averageBalance: number;
  totalCreditLimit: number;
  totalCreditUsed: number;
}

export const getCustomerStats = async (): Promise<CustomerStats> => {
  const { data } = await api.get<ApiResponse<CustomerStats>>('/customers/stats');
  return data.data;
};

// ===================================================================
// REACT QUERY HOOKS
// ===================================================================

/**
 * Hook to get paginated customers list
 * @example
 * const { data: customers, isLoading } = useCustomers({ page: 1, limit: 20, search: 'john' });
 */
export function useCustomers(params?: GetCustomersParams) {
  return useQuery({
    queryKey: ['customers', params],
    queryFn: () => getCustomers(params),
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Hook to get single customer
 * @example
 * const { data: customer, isLoading } = useCustomer('customer-123');
 */
export function useCustomer(id: string | null | undefined) {
  return useQuery({
    queryKey: ['customer', id],
    queryFn: () => getCustomer(id!),
    enabled: !!id,
    staleTime: 60000, // 1 minute
  });
}

/**
 * Hook to search customers
 * @example
 * const { data: results } = useSearchCustomers({ query: 'john', limit: 10 });
 */
export function useSearchCustomers(params: SearchCustomersParams | null) {
  return useQuery({
    queryKey: ['searchCustomers', params],
    queryFn: () => searchCustomers(params!),
    enabled: !!params && params.query.length > 0,
    staleTime: 10000, // 10 seconds
  });
}

/**
 * Hook to get customers with balance
 * @example
 * const { data: customersWithBalance } = useCustomersWithBalance({ minBalance: 100 });
 */
export function useCustomersWithBalance(params?: CustomersWithBalanceParams) {
  return useQuery({
    queryKey: ['customersWithBalance', params],
    queryFn: () => getCustomersWithBalance(params),
    staleTime: 60000, // 1 minute
  });
}

/**
 * Hook to get customers by type
 * @example
 * const { data: businessCustomers } = useCustomersByType('BUSINESS');
 */
export function useCustomersByType(type: 'INDIVIDUAL' | 'BUSINESS' | null) {
  return useQuery({
    queryKey: ['customersByType', type],
    queryFn: () => getCustomersByType(type!),
    enabled: !!type,
    staleTime: 60000,
  });
}

/**
 * Hook to get customer statistics
 * @example
 * const { data: stats } = useCustomerStats();
 */
export function useCustomerStats() {
  return useQuery({
    queryKey: ['customerStats'],
    queryFn: getCustomerStats,
    staleTime: 300000, // 5 minutes
  });
}

/**
 * Hook to create a new customer
 * @example
 * const createMutation = useCreateCustomer();
 * await createMutation.mutateAsync({ name: 'John Doe', email: 'john@example.com' });
 */
export function useCreateCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createCustomer,
    onSuccess: () => {
      // Invalidate customers list to refetch
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customerStats'] });
    },
  });
}

/**
 * Hook to update a customer
 * @example
 * const updateMutation = useUpdateCustomer();
 * await updateMutation.mutateAsync({ id: '123', data: { name: 'Jane Doe' } });
 */
export function useUpdateCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCustomerData }) =>
      updateCustomer(id, data),
    onSuccess: (_, variables) => {
      // Invalidate specific customer and list
      queryClient.invalidateQueries({ queryKey: ['customer', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customerBalance', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['customerCreditInfo', variables.id] });
    },
  });
}

/**
 * Hook to delete a customer
 * @example
 * const deleteMutation = useDeleteCustomer();
 * await deleteMutation.mutateAsync('customer-123');
 */
export function useDeleteCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteCustomer,
    onSuccess: (_, customerId) => {
      // Invalidate customers list
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customerStats'] });
      // Remove specific customer from cache
      queryClient.removeQueries({ queryKey: ['customer', customerId] });
    },
  });
}

// Export everything as a namespace for convenience
export const customersApi = {
  getCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  searchCustomers,
  getCustomersWithBalance,
  getCustomersByType,
  getCustomerStats,
};
