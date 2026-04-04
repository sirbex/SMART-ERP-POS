// Custom React Hook for API Calls with React Query
// Provides consistent data fetching, caching, and state management

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseQueryOptions, UseMutationOptions } from '@tanstack/react-query';
import type { AxiosResponse, AxiosError } from 'axios';
import { api, getErrorMessage, getSuccessMessage, hasAlerts, type ApiResponse } from '../utils/api';
import type {
  CreateProductInput, UpdateProductInput,
  CreateCustomerInput, UpdateCustomerInput,
  CreateSaleInput,
  CreatePurchaseOrderInput,
  CreateGoodsReceiptInput,
} from '../types/inputs';

// Query Keys for React Query
export const queryKeys = {
  health: ['health'] as const,
  auth: {
    profile: ['auth', 'profile'] as const,
  },
  products: {
    all: ['products'] as const,
    list: (page?: number, limit?: number) => ['products', 'list', page, limit] as const,
    detail: (id: string) => ['products', 'detail', id] as const,
  },
  customers: {
    all: ['customers'] as const,
    list: (page?: number, limit?: number) => ['customers', 'list', page, limit] as const,
    detail: (id: string) => ['customers', 'detail', id] as const,
    statement: (id: string, start?: string, end?: string, page?: number, limit?: number) => ['customers', 'statement', id, start, end, page, limit] as const,
  },
  suppliers: {
    all: ['suppliers'] as const,
    list: (page?: number, limit?: number) => ['suppliers', 'list', page, limit] as const,
    detail: (id: string) => ['suppliers', 'detail', id] as const,
  },
  sales: {
    all: ['sales'] as const,
    list: (page?: number, limit?: number) => ['sales', 'list', page, limit] as const,
    detail: (id: string) => ['sales', 'detail', id] as const,
    summary: (startDate?: string, endDate?: string, groupBy?: string) =>
      ['sales', 'summary', startDate, endDate, groupBy] as const,
    productSummary: (startDate?: string, endDate?: string, productId?: string, customerId?: string) =>
      ['sales', 'reports', 'product-summary', startDate, endDate, productId, customerId] as const,
    topSelling: (limit?: number, startDate?: string, endDate?: string) =>
      ['sales', 'reports', 'top-selling', limit, startDate, endDate] as const,
    summaryByDate: (groupBy?: string, startDate?: string, endDate?: string) =>
      ['sales', 'reports', 'summary-by-date', groupBy, startDate, endDate] as const,
    byCashier: (startDate?: string, endDate?: string) =>
      ['sales', 'reports', 'by-cashier', startDate, endDate] as const,
  },
  inventory: {
    stockLevels: ['inventory', 'stock-levels'] as const,
    stockLevel: (productId: string) => ['inventory', 'stock-level', productId] as const,
    batches: (productId: string) => ['inventory', 'batches', productId] as const,
    expiring: (days?: number) => ['inventory', 'expiring', days] as const,
    reorder: ['inventory', 'reorder'] as const,
  },
  purchaseOrders: {
    all: ['purchase-orders'] as const,
    list: (page?: number, limit?: number, status?: string) =>
      ['purchase-orders', 'list', page, limit, status] as const,
    detail: (id: string) => ['purchase-orders', 'detail', id] as const,
  },
  goodsReceipts: {
    all: ['goods-receipts'] as const,
    list: (page?: number, limit?: number, status?: string) =>
      ['goods-receipts', 'list', page, limit, status] as const,
    detail: (id: string) => ['goods-receipts', 'detail', id] as const,
  },
  stockMovements: {
    all: ['stock-movements'] as const,
    list: (page?: number, limit?: number) => ['stock-movements', 'list', page, limit] as const,
    byProduct: (productId: string) => ['stock-movements', 'product', productId] as const,
    byBatch: (batchId: string) => ['stock-movements', 'batch', batchId] as const,
  },
  invoices: {
    all: ['invoices'] as const,
    list: (page?: number, limit?: number, customerId?: string) => ['invoices', 'list', page, limit, customerId] as const,
    detail: (id: string) => ['invoices', 'detail', id] as const,
    payments: (id: string) => ['invoices', 'payments', id] as const,
  },
  import: {
    all: ['import'] as const,
    jobs: (page?: number, limit?: number, entityType?: string, status?: string) =>
      ['import', 'jobs', page, limit, entityType, status] as const,
    job: (id: string) => ['import', 'job', id] as const,
    errors: (jobId: string, page?: number, limit?: number) =>
      ['import', 'errors', jobId, page, limit] as const,
  },
};

// Generic Hooks
export function useApiQuery<TData = unknown>(
  queryKey: readonly unknown[],
  queryFn: () => Promise<AxiosResponse<ApiResponse<TData>>>,
  options?: Omit<UseQueryOptions<AxiosResponse<ApiResponse<TData>>, AxiosError<ApiResponse>, TData>, 'queryKey' | 'queryFn'>
) {
  // Allow callers to override select; default selects response.data.data
  const defaultSelect = (data: AxiosResponse<ApiResponse<TData>>) => data.data.data as TData;

  return useQuery<AxiosResponse<ApiResponse<TData>>, AxiosError<ApiResponse>, TData>({
    queryKey,
    queryFn,
    select: defaultSelect,
    ...options,
  });
}

export function useApiMutation<TData = unknown, TVariables = unknown>(
  mutationFn: (variables: TVariables) => Promise<AxiosResponse<ApiResponse<TData>>>,
  options?: UseMutationOptions<AxiosResponse<ApiResponse<TData>>, AxiosError<ApiResponse>, TVariables>
) {
  return useMutation({
    mutationFn,
    ...options,
  });
}

// Auth Hooks
export function useProfile() {
  return useApiQuery(queryKeys.auth.profile, api.auth.profile, {
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  });
}

// Product Hooks
export function useProducts(page = 1, limit = 50) {
  return useApiQuery(
    queryKeys.products.list(page, limit),
    () => api.products.list({ page, limit }),
    { staleTime: 30000 } // 30 seconds
  );
}

export function useProduct(id: string) {
  return useApiQuery(
    queryKeys.products.detail(id),
    () => api.products.getById(id),
    { enabled: !!id }
  );
}

export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useApiMutation(
    (data: CreateProductInput) => api.products.create(data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
        queryClient.invalidateQueries({ queryKey: ['offline', 'products'] });
      },
    }
  );
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();

  return useApiMutation(
    ({ id, data }: { id: string; data: UpdateProductInput }) => api.products.update(id, data),
    {
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries({ queryKey: queryKeys.products.detail(variables.id) });
        queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
        queryClient.invalidateQueries({ queryKey: ['offline', 'products'] });
      },
    }
  );
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();

  return useApiMutation(
    (id: string) => api.products.delete(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
        queryClient.invalidateQueries({ queryKey: ['offline', 'products'] });
      },
    }
  );
}

// Customer Hooks
export function useCustomers(page = 1, limit = 50) {
  // Custom select to include pagination alongside data
  return useQuery({
    queryKey: queryKeys.customers.list(page, limit),
    queryFn: () => api.customers.list({ page, limit }),
    select: (resp) => ({
      data: (resp.data.data ?? []) as unknown[],
      pagination: resp.data.pagination,
    }),
    staleTime: 30000,
  });
}

export function useCustomer(id: string) {
  return useApiQuery(
    queryKeys.customers.detail(id),
    () => api.customers.getById(id),
    { enabled: !!id }
  );
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();

  return useApiMutation(
    (data: CreateCustomerInput) => api.customers.create(data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
        queryClient.invalidateQueries({ queryKey: ['offline', 'customers'] });
      },
    }
  );
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient();
  return useApiMutation(
    ({ id, data }: { id: string; data: UpdateCustomerInput }) => api.customers.update(id, data),
    {
      onSuccess: (_resp, variables) => {
        queryClient.invalidateQueries({ queryKey: queryKeys.customers.detail(variables.id) });
        queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
        queryClient.invalidateQueries({ queryKey: ['offline', 'customers'] });
      },
    }
  );
}

export function useToggleCustomerActive() {
  const queryClient = useQueryClient();
  return useApiMutation(
    ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.customers.toggleActive(id, isActive),
    {
      onSuccess: (_resp, variables) => {
        queryClient.invalidateQueries({ queryKey: queryKeys.customers.detail(variables.id) });
        queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
        queryClient.invalidateQueries({ queryKey: ['offline', 'customers'] });
      },
    }
  );
}

export function useDeleteCustomer() {
  const queryClient = useQueryClient();
  return useApiMutation(
    (id: string) => api.customers.delete(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
        queryClient.invalidateQueries({ queryKey: ['offline', 'customers'] });
      },
    }
  );
}

export function useCustomerSales(customerId: string, page = 1, limit = 50) {
  return useApiQuery(
    ['customers', 'sales', customerId, page, limit],
    () => api.customers.getSales(customerId, { page, limit }),
    { enabled: !!customerId, staleTime: 10000 }
  );
}

export function useCustomerTransactions(customerId: string, page = 1, limit = 50) {
  return useApiQuery(
    ['customers', 'transactions', customerId, page, limit],
    () => api.customers.getTransactions(customerId, { page, limit }),
    { enabled: !!customerId, staleTime: 10000 }
  );
}

export function useCustomerSummary(customerId: string) {
  return useApiQuery(
    ['customers', 'summary', customerId],
    () => api.customers.getSummary(customerId),
    { enabled: !!customerId, staleTime: 30000 }
  );
}

export function useCustomerStatement(customerId: string, options?: { start?: string; end?: string; page?: number; limit?: number }) {
  const { start, end, page = 1, limit = 100 } = options || {};
  return useApiQuery(
    queryKeys.customers.statement(customerId, start, end, page, limit),
    () => api.customers.getStatement(customerId, { start, end, page, limit }),
    { enabled: !!customerId, staleTime: 30000 }
  );
}

// Sales Hooks
export function useSales(page = 1, limit = 50, filters?: { startDate?: string; endDate?: string; cashierId?: string }) {
  // Custom select to include pagination alongside data
  // CRITICAL: Include filters in queryKey so React Query refetches when dates change
  return useQuery({
    queryKey: [...queryKeys.sales.list(page, limit), filters?.startDate, filters?.endDate, filters?.cashierId],
    queryFn: () => api.sales.list({ page, limit, ...filters }),
    select: (resp) => ({
      data: (resp.data.data ?? []) as unknown[],
      pagination: resp.data.pagination,
    }),
    staleTime: 10000, // 10 seconds
  });
}

export function useSale(id: string) {
  return useApiQuery(
    queryKeys.sales.detail(id),
    () => api.sales.getById(id),
    { enabled: !!id }
  );
}

export function useCreateSale() {
  const queryClient = useQueryClient();

  return useApiMutation(
    (data: CreateSaleInput) => api.sales.create(data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.sales.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.inventory.stockLevels });
        queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
        queryClient.invalidateQueries({ queryKey: ['offline', 'stock-levels'] });
        queryClient.invalidateQueries({ queryKey: ['offline', 'products'] });
        queryClient.invalidateQueries({ queryKey: ['offline', 'customers'] });
      },
    }
  );
}

export function useSalesSummary(startDate?: string, endDate?: string, groupBy?: string) {
  return useApiQuery(
    queryKeys.sales.summary(startDate, endDate, groupBy),
    () => api.sales.summary({ startDate, endDate, groupBy }),
    { staleTime: 60000 } // 1 minute
  );
}

// Sales Reports Hooks
export function useProductSalesSummary(filters?: { startDate?: string; endDate?: string; productId?: string; customerId?: string }) {
  const { startDate, endDate, productId, customerId } = filters || {};
  return useApiQuery(
    queryKeys.sales.productSummary(startDate, endDate, productId, customerId),
    () => api.sales.productSummary({ startDate, endDate, productId, customerId }),
    { staleTime: 60000 } // 1 minute
  );
}

export function useTopSellingProducts(limit = 10, filters?: { startDate?: string; endDate?: string }) {
  const { startDate, endDate } = filters || {};
  return useApiQuery(
    queryKeys.sales.topSelling(limit, startDate, endDate),
    () => api.sales.topSelling({ limit, startDate, endDate }),
    { staleTime: 60000 } // 1 minute
  );
}

export function useSalesSummaryByDate(groupBy: 'day' | 'week' | 'month' = 'day', filters?: { startDate?: string; endDate?: string }) {
  const { startDate, endDate } = filters || {};
  return useApiQuery(
    queryKeys.sales.summaryByDate(groupBy, startDate, endDate),
    () => api.sales.summaryByDate({ groupBy, startDate, endDate }),
    { staleTime: 60000 } // 1 minute
  );
}

export function useSalesByCashier(filters?: { startDate?: string; endDate?: string }) {
  const { startDate, endDate } = filters || {};
  return useApiQuery(
    queryKeys.sales.byCashier(startDate, endDate),
    () => api.sales.byCashier({ startDate, endDate }),
    { staleTime: 60000 }
  );
}

// Inventory Hooks
export function useStockLevels() {
  return useApiQuery(
    queryKeys.inventory.stockLevels,
    api.inventory.stockLevels,
    { staleTime: 15000 } // 15 seconds
  );
}

export function useStockLevel(productId: string) {
  return useApiQuery(
    queryKeys.inventory.stockLevel(productId),
    () => api.inventory.stockLevelByProduct(productId),
    { enabled: !!productId }
  );
}

export function useExpiringSoonBatches(days = 30) {
  return useApiQuery(
    queryKeys.inventory.expiring(days),
    () => api.inventory.expiringSoon(days),
    { staleTime: 60000 } // 1 minute
  );
}

export function useProductsNeedingReorder() {
  return useApiQuery(
    queryKeys.inventory.reorder,
    api.inventory.needingReorder,
    { staleTime: 60000 } // 1 minute
  );
}

// Purchase Order Hooks
export function usePurchaseOrders(page = 1, limit = 50, status?: string) {
  return useApiQuery(
    queryKeys.purchaseOrders.list(page, limit, status),
    () => api.purchaseOrders.list({ page, limit, status }),
    { staleTime: 30000 }
  );
}

export function usePurchaseOrder(id: string) {
  return useApiQuery(
    queryKeys.purchaseOrders.detail(id),
    () => api.purchaseOrders.getById(id),
    { enabled: !!id }
  );
}

export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient();

  return useApiMutation(
    (data: CreatePurchaseOrderInput) => api.purchaseOrders.create(data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
      },
    }
  );
}

export function useSubmitPurchaseOrder() {
  const queryClient = useQueryClient();

  return useApiMutation(
    (id: string) => api.purchaseOrders.submit(id),
    {
      onSuccess: (_, id) => {
        queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(id) });
        queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
      },
    }
  );
}

// Goods Receipt Hooks
export function useGoodsReceipts(page = 1, limit = 50, status?: string) {
  return useApiQuery(
    queryKeys.goodsReceipts.list(page, limit, status),
    () => api.goodsReceipts.list({ page, limit, status }),
    { staleTime: 30000 }
  );
}

export function useGoodsReceipt(id: string) {
  return useApiQuery(
    queryKeys.goodsReceipts.detail(id),
    () => api.goodsReceipts.getById(id),
    { enabled: !!id }
  );
}

export function useCreateGoodsReceipt() {
  const queryClient = useQueryClient();

  return useApiMutation(
    (data: CreateGoodsReceiptInput) => api.goodsReceipts.create(data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.goodsReceipts.all });
      },
    }
  );
}

export function useFinalizeGoodsReceipt() {
  const queryClient = useQueryClient();

  return useApiMutation(
    (id: string) => api.goodsReceipts.finalize(id),
    {
      onSuccess: (_, id) => {
        queryClient.invalidateQueries({ queryKey: queryKeys.goodsReceipts.detail(id) });
        queryClient.invalidateQueries({ queryKey: queryKeys.goodsReceipts.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.inventory.stockLevels });
        queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
        queryClient.invalidateQueries({ queryKey: ['offline', 'stock-levels'] });
        queryClient.invalidateQueries({ queryKey: ['offline', 'products'] });
      },
    }
  );
}

// Stock Movement Hooks
export function useStockMovements(page = 1, limit = 100) {
  return useApiQuery(
    queryKeys.stockMovements.list(page, limit),
    () => api.stockMovements.list({ page, limit }),
    { staleTime: 30000 }
  );
}

export function useStockMovementsByProduct(productId: string, page = 1, limit = 100) {
  return useApiQuery(
    queryKeys.stockMovements.byProduct(productId),
    () => api.stockMovements.byProduct(productId, { page, limit }),
    { enabled: !!productId }
  );
}

// Export helper functions
export { getErrorMessage, getSuccessMessage, hasAlerts };

// Invoice Hooks
export function useInvoices(page = 1, limit = 50, customerId?: string) {
  return useApiQuery(
    queryKeys.invoices.list(page, limit, customerId),
    () => api.invoices.list({ page, limit, customerId }),
    { staleTime: 15000 }
  );
}

export function useInvoice(id: string) {
  return useApiQuery(
    queryKeys.invoices.detail(id),
    () => api.invoices.getById(id),
    { enabled: !!id }
  );
}

export function useInvoicePayments(id: string) {
  return useApiQuery(
    queryKeys.invoices.payments(id),
    () => api.invoices.getPayments(id),
    { enabled: !!id, staleTime: 10000 }
  );
}

export function useRecordInvoicePayment() {
  const queryClient = useQueryClient();
  return useApiMutation(
    ({ invoiceId, data }: { invoiceId: string; data: { amount: number; paymentMethod: string; paymentDate?: string; referenceNumber?: string; notes?: string } }) =>
      api.invoices.addPayment(invoiceId, data),
    {
      onSuccess: (_resp, variables) => {
        // Invalidate invoice details and listings
        queryClient.invalidateQueries({ queryKey: queryKeys.invoices.detail(variables.invoiceId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.invoices.payments(variables.invoiceId) });
        // Also refresh customer summaries if needed
        queryClient.invalidateQueries({ queryKey: ['customers'] });
      },
    }
  );
}

export function useCreateInvoice() {
  const queryClient = useQueryClient();
  return useApiMutation(
    (data: { customerId: string; saleId?: string; issueDate?: string; dueDate?: string; notes?: string; initialPaymentAmount?: number }) => api.invoices.create(data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
        queryClient.invalidateQueries({ queryKey: ['customers'] });
      },
    }
  );
}
