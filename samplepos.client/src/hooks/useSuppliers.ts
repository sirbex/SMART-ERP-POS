/**
 * React Query Hooks for Supplier and Purchase Order Management
 * Provides optimized data fetching, caching, and mutations for suppliers and POs
 */

import { useQuery, useMutation, useQueryClient, type UseQueryOptions, type UseMutationOptions } from '@tanstack/react-query';
import { queryKeys } from '@/config/queryClient';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// ============================================================
// TYPES
// ============================================================

export interface Supplier {
  id: number;
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  metadata?: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderItem {
  id?: number;
  purchase_order_id?: number;
  inventory_item_id: number;
  product_name?: string;
  quantity: number;
  unit_price: number;
  total: number;
  received_quantity?: number;
  metadata?: Record<string, unknown>;
}

export interface PurchaseOrder {
  id: number;
  supplier_id: number;
  supplier_name?: string;
  order_number: string;
  order_date: string;
  expected_delivery_date?: string;
  received_date?: string;
  status: 'draft' | 'pending' | 'received' | 'partial' | 'cancelled';
  subtotal: number;
  tax: number;
  total: number;
  notes?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  items?: PurchaseOrderItem[];
}

export interface SupplierListParams {
  page?: number;
  limit?: number;
  search?: string;
  filter?: {
    is_active?: boolean;
  };
  sort?: string;
}

export interface PurchaseOrderListParams {
  page?: number;
  limit?: number;
  search?: string;
  filter?: {
    status?: 'draft' | 'pending' | 'received' | 'partial' | 'cancelled';
    supplier_id?: number;
    start_date?: string;
    end_date?: string;
  };
  sort?: string;
}

export interface SupplierListResponse {
  data: Supplier[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface PurchaseOrderListResponse {
  data: PurchaseOrder[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateSupplierData {
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  metadata?: Record<string, unknown>;
  is_active?: boolean;
}

export interface UpdateSupplierData extends Partial<CreateSupplierData> {
  id: number;
}

export interface CreatePurchaseOrderData {
  supplier_id: number;
  order_number: string;
  order_date: string;
  expected_delivery_date?: string;
  items: PurchaseOrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdatePurchaseOrderData {
  id: number;
  status?: 'draft' | 'pending' | 'received' | 'partial' | 'cancelled';
  received_date?: string;
  notes?: string;
  items?: PurchaseOrderItem[];
}

// ============================================================
// SUPPLIER QUERY HOOKS
// ============================================================

/**
 * Fetch paginated list of suppliers
 */
export function useSupplierList(
  params: SupplierListParams = {},
  options?: Omit<UseQueryOptions<SupplierListResponse>, 'queryKey' | 'queryFn'>
) {
  const queryParams = new URLSearchParams();
  
  if (params.page) queryParams.set('page', params.page.toString());
  if (params.limit) queryParams.set('limit', params.limit.toString());
  if (params.search) queryParams.set('search', params.search);
  if (params.sort) queryParams.set('sort', params.sort);
  if (params.filter?.is_active !== undefined) {
    queryParams.set('filter[is_active]', params.filter.is_active.toString());
  }

  return useQuery<SupplierListResponse>({
    queryKey: queryKeys.suppliers.list(params),
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/suppliers?${queryParams.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch suppliers');
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  });
}

/**
 * Fetch a single supplier by ID
 */
export function useSupplier(
  id: number | undefined,
  options?: Omit<UseQueryOptions<Supplier>, 'queryKey' | 'queryFn'>
) {
  return useQuery<Supplier>({
    queryKey: queryKeys.suppliers.detail(id?.toString() || ''),
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/suppliers/${id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch supplier');
      }
      return response.json();
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  });
}

// ============================================================
// PURCHASE ORDER QUERY HOOKS
// ============================================================

/**
 * Fetch paginated list of purchase orders
 */
export function usePurchaseOrderList(
  params: PurchaseOrderListParams = {},
  options?: Omit<UseQueryOptions<PurchaseOrderListResponse>, 'queryKey' | 'queryFn'>
) {
  const queryParams = new URLSearchParams();
  
  if (params.page) queryParams.set('page', params.page.toString());
  if (params.limit) queryParams.set('limit', params.limit.toString());
  if (params.search) queryParams.set('search', params.search);
  if (params.sort) queryParams.set('sort', params.sort);
  
  if (params.filter?.status) {
    queryParams.set('filter[status]', params.filter.status);
  }
  if (params.filter?.supplier_id) {
    queryParams.set('filter[supplier_id]', params.filter.supplier_id.toString());
  }
  if (params.filter?.start_date) {
    queryParams.set('filter[start_date]', params.filter.start_date);
  }
  if (params.filter?.end_date) {
    queryParams.set('filter[end_date]', params.filter.end_date);
  }

  return useQuery<PurchaseOrderListResponse>({
    queryKey: queryKeys.purchaseOrders.list(params),
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/purchase-orders?${queryParams.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch purchase orders');
      }
      return response.json();
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    ...options,
  });
}

/**
 * Fetch a single purchase order with items
 */
export function usePurchaseOrder(
  id: number | undefined,
  options?: Omit<UseQueryOptions<PurchaseOrder>, 'queryKey' | 'queryFn'>
) {
  return useQuery<PurchaseOrder>({
    queryKey: queryKeys.purchaseOrders.detail(id?.toString() || ''),
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/purchase-orders/${id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch purchase order');
      }
      return response.json();
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  });
}

/**
 * Fetch purchase orders by supplier
 */
export function useSupplierPurchaseOrders(
  supplierId: number | undefined,
  params: { page?: number; limit?: number } = {},
  options?: Omit<UseQueryOptions<PurchaseOrderListResponse>, 'queryKey' | 'queryFn'>
) {
  const queryParams = new URLSearchParams();
  if (params.page) queryParams.set('page', params.page.toString());
  if (params.limit) queryParams.set('limit', params.limit.toString());
  if (supplierId) queryParams.set('filter[supplier_id]', supplierId.toString());

  return useQuery<PurchaseOrderListResponse>({
    queryKey: [...queryKeys.suppliers.detail(supplierId?.toString() || ''), 'purchase-orders', params],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/purchase-orders?${queryParams.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch supplier purchase orders');
      }
      return response.json();
    },
    enabled: !!supplierId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    ...options,
  });
}

// ============================================================
// SUPPLIER MUTATION HOOKS
// ============================================================

/**
 * Create a new supplier
 */
export function useCreateSupplier(
  options?: Omit<UseMutationOptions<Supplier, Error, CreateSupplierData>, 'mutationFn'>
) {
  const queryClient = useQueryClient();

  return useMutation<Supplier, Error, CreateSupplierData>({
    mutationFn: async (data) => {
      const response = await fetch(`${API_BASE}/suppliers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create supplier');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.lists() });
    },
    ...options,
  });
}

/**
 * Update an existing supplier
 */
export function useUpdateSupplier(
  options?: Omit<UseMutationOptions<Supplier, Error, UpdateSupplierData>, 'mutationFn'>
) {
  const queryClient = useQueryClient();

  return useMutation<Supplier, Error, UpdateSupplierData>({
    mutationFn: async (data) => {
      const { id, ...updateData } = data;
      const response = await fetch(`${API_BASE}/suppliers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update supplier');
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.detail(data.id.toString()) });
      queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.lists() });
    },
    ...options,
  });
}

/**
 * Delete a supplier
 */
export function useDeleteSupplier(
  options?: Omit<UseMutationOptions<void, Error, number>, 'mutationFn'>
) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      const response = await fetch(`${API_BASE}/suppliers/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete supplier');
      }
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.detail(id.toString()) });
      queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.lists() });
    },
    ...options,
  });
}

// ============================================================
// PURCHASE ORDER MUTATION HOOKS
// ============================================================

/**
 * Create a new purchase order
 */
export function useCreatePurchaseOrder(
  options?: Omit<UseMutationOptions<PurchaseOrder, Error, CreatePurchaseOrderData>, 'mutationFn'>
) {
  const queryClient = useQueryClient();

  return useMutation<PurchaseOrder, Error, CreatePurchaseOrderData>({
    mutationFn: async (data) => {
      const response = await fetch(`${API_BASE}/purchase-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create purchase order');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.all });
    },
    ...options,
  });
}

/**
 * Update purchase order status or details
 */
export function useUpdatePurchaseOrder(
  options?: Omit<UseMutationOptions<PurchaseOrder, Error, UpdatePurchaseOrderData>, 'mutationFn'>
) {
  const queryClient = useQueryClient();

  return useMutation<PurchaseOrder, Error, UpdatePurchaseOrderData>({
    mutationFn: async (data) => {
      const { id, ...updateData } = data;
      const response = await fetch(`${API_BASE}/purchase-orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update purchase order');
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(data.id.toString()) });
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.lists() });
      if (data.status === 'received') {
        // Also invalidate inventory when PO is received
        queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
      }
    },
    ...options,
  });
}

/**
 * Delete a purchase order
 */
export function useDeletePurchaseOrder(
  options?: Omit<UseMutationOptions<void, Error, number>, 'mutationFn'>
) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      const response = await fetch(`${API_BASE}/purchase-orders/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete purchase order');
      }
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(id.toString()) });
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.lists() });
    },
    ...options,
  });
}
