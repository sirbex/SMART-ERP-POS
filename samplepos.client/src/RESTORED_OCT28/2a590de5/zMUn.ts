/**
 * Suppliers API
 *
 * Handles supplier CRUD operations, payments, and supplier management.
 * Aligned with backend endpoints in SamplePOS.Server/src/modules/suppliers.ts
 *
 * @module services/api/suppliersApi
 */

import api from '@/config/api.config';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Supplier, SupplierStats, ApiResponse, PaginatedResponse } from '@/types/backend';

// ===================================================================
// TYPE DEFINITIONS
// ===================================================================

/**
 * Query parameters for fetching suppliers
 */
export interface GetSuppliersParams {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
}

/**
 * Request to create a new supplier
 */
export interface CreateSupplierRequest {
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  taxId?: string;
  paymentTerms?: string;
  creditLimit?: number;
  notes?: string;
  isActive?: boolean;
}

/**
 * Request to update an existing supplier
 */
export interface UpdateSupplierRequest {
  name?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  taxId?: string;
  paymentTerms?: string;
  creditLimit?: number;
  notes?: string;
  isActive?: boolean;
}

/**
 * Supplier list summary item (with counts/aggregates)
 */
export interface SupplierListSummary {
  id: string;
  name: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  paymentTerms?: string | null;
  isActive: boolean;
  currentBalance: string; // decimal strings from server
  totalPaid: string;
  totalPurchased: string;
  lastPurchaseDate?: string | null;
  lastPaymentDate?: string | null;
  orderCount: number;
  paymentCount: number;
}

/**
 * Supplier with purchase history
 */
export interface SupplierWithHistory extends Omit<Supplier, 'totalPurchases'> {
  totalPurchases: number;
  purchaseCount: number;
  lastPurchaseDate?: Date | null;
}

// ===================================================================
// API FUNCTIONS
// ===================================================================

/**
 * Get all suppliers with pagination and filters
 * GET /api/suppliers
 */
export const getSuppliers = async (
  params?: GetSuppliersParams
): Promise<PaginatedResponse<Supplier>> => {
  const { data } = await api.get<PaginatedResponse<Supplier>>('/suppliers', { params });
  return data;
};

/**
 * Get single supplier by ID
 * GET /api/suppliers/:id
 */
export const getSupplier = async (id: string): Promise<SupplierWithHistory> => {
  const { data } = await api.get<SupplierWithHistory>(`/suppliers/${id}`);
  return data;
};

/**
 * Create a new supplier
 * POST /api/suppliers
 */
export const createSupplier = async (request: CreateSupplierRequest): Promise<Supplier> => {
  const { data } = await api.post<Supplier>('/suppliers', request);
  return data;
};

/**
 * Update an existing supplier
 * PUT /api/suppliers/:id
 */
export const updateSupplier = async (
  id: string,
  request: UpdateSupplierRequest
): Promise<Supplier> => {
  const { data } = await api.put<Supplier>(`/suppliers/${id}`, request);
  return data;
};

/**
 * Delete a supplier (soft delete - sets isActive to false)
 * DELETE /api/suppliers/:id
 */
export const deleteSupplier = async (id: string): Promise<void> => {
  await api.delete(`/suppliers/${id}`);
};

/**
 * Get active suppliers only
 * GET /api/suppliers/active
 */
export const getActiveSuppliers = async (): Promise<Supplier[]> => {
  const { data } = await api.get<Supplier[]>('/suppliers/active');
  return data;
};

/**
 * Get supplier statistics
 * GET /api/suppliers/stats
 */
export const getSupplierStats = async (): Promise<SupplierStats> => {
  const { data } = await api.get<ApiResponse<SupplierStats>>('/suppliers/stats');
  return data.data;
};

/**
 * Get supplier list with counts/aggregates to avoid N-requests in UI grids
 * GET /api/suppliers/summary-list
 */
export const getSupplierSummaries = async (
  params?: GetSuppliersParams
): Promise<PaginatedResponse<SupplierListSummary>> => {
  const { data } = await api.get<PaginatedResponse<SupplierListSummary>>(
    '/suppliers/summary-list',
    { params }
  );
  return data;
};

// ===================================================================
// REACT QUERY HOOKS
// ===================================================================

/**
 * Hook to get all suppliers with pagination and filters
 * @example
 * const { data: suppliers } = useSuppliers({ search: 'ABC Corp', isActive: true });
 */
export function useSuppliers(params?: GetSuppliersParams) {
  return useQuery({
    queryKey: ['suppliers', params],
    queryFn: () => getSuppliers(params),
    staleTime: 60000, // 1 minute
  });
}

/**
 * Hook to get single supplier by ID
 * @example
 * const { data: supplier } = useSupplier('supplier-123');
 */
export function useSupplier(id: string | null | undefined) {
  return useQuery({
    queryKey: ['supplier', id],
    queryFn: () => getSupplier(id!),
    enabled: !!id,
    staleTime: 60000,
  });
}

/**
 * Hook to get active suppliers only
 * @example
 * const { data: activeSuppliers } = useActiveSuppliers();
 */
export function useActiveSuppliers() {
  return useQuery({
    queryKey: ['activeSuppliers'],
    queryFn: () => getActiveSuppliers(),
    staleTime: 60000,
  });
}

/**
 * Hook to get supplier statistics
 * @example
 * const { data: stats } = useSupplierStats();
 */
export function useSupplierStats() {
  return useQuery({
    queryKey: ['supplierStats'],
    queryFn: () => getSupplierStats(),
    staleTime: 120000, // 2 minutes
  });
}

/**
 * Hook to get supplier summaries with counts/aggregates
 */
export function useSupplierSummaries(params?: GetSuppliersParams) {
  return useQuery({
    queryKey: ['supplierSummaries', params],
    queryFn: () => getSupplierSummaries(params),
    staleTime: 60000,
  });
}

/**
 * Hook to create a supplier
 * @example
 * const createSupplierMutation = useCreateSupplier();
 * await createSupplierMutation.mutateAsync({
 *   name: 'ABC Corporation',
 *   email: 'contact@abc.com',
 *   phone: '+1234567890'
 * });
 */
export function useCreateSupplier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createSupplier,
    onSuccess: () => {
      // Invalidate suppliers list
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      // Invalidate active suppliers
      queryClient.invalidateQueries({ queryKey: ['activeSuppliers'] });
      // Invalidate stats
      queryClient.invalidateQueries({ queryKey: ['supplierStats'] });
    },
  });
}

/**
 * Hook to update a supplier
 * @example
 * const updateSupplierMutation = useUpdateSupplier();
 * await updateSupplierMutation.mutateAsync({
 *   id: 'supplier-123',
 *   request: { email: 'newemail@abc.com', isActive: true }
 * });
 */
export function useUpdateSupplier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, request }: { id: string; request: UpdateSupplierRequest }) =>
      updateSupplier(id, request),
    onSuccess: (_, variables) => {
      // Invalidate specific supplier
      queryClient.invalidateQueries({ queryKey: ['supplier', variables.id] });
      // Invalidate suppliers list
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      // Invalidate active suppliers
      queryClient.invalidateQueries({ queryKey: ['activeSuppliers'] });
      // Invalidate stats
      queryClient.invalidateQueries({ queryKey: ['supplierStats'] });
    },
  });
}

/**
 * Hook to delete a supplier
 * @example
 * const deleteSupplierMutation = useDeleteSupplier();
 * await deleteSupplierMutation.mutateAsync('supplier-123');
 */
export function useDeleteSupplier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteSupplier,
    onSuccess: (_, supplierId) => {
      // Invalidate specific supplier
      queryClient.invalidateQueries({ queryKey: ['supplier', supplierId] });
      // Invalidate suppliers list
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      // Invalidate active suppliers
      queryClient.invalidateQueries({ queryKey: ['activeSuppliers'] });
      // Invalidate stats
      queryClient.invalidateQueries({ queryKey: ['supplierStats'] });
    },
  });
}

// Export everything as a namespace for convenience
export const suppliersApi = {
  getSuppliers,
  getSupplier,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  getActiveSuppliers,
  getSupplierStats,
  getSupplierSummaries,
};
