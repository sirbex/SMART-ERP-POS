// API Client for SamplePOS Frontend
// Centralized API communication with error handling and interceptors

import axios, { AxiosError } from 'axios';
import type { AxiosInstance, AxiosRequestConfig, InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import type {
  CreateProductInput, UpdateProductInput,
  CreateCustomerInput, UpdateCustomerInput,
  CreateSupplierInput, UpdateSupplierInput,
  CreateSaleInput,
  CreatePurchaseOrderInput, CreatePOInvoiceInput, RecordPOPaymentInput,
  CreateGoodsReceiptInput, UpdateGoodsReceiptItemInput,
  RecordStockMovementInput,
  CreateInvoiceInput,
  SplitPaymentInput, RecordCustomerPaymentInput,
  CreateHoldOrderInput, InvoiceSettingsInput,
} from '../types/inputs';

// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const API_TIMEOUT = 30000; // 30 seconds

// API Response Types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  summary?: Record<string, unknown>;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  alerts?: Array<{
    type: string;
    severity: string;
    message: string;
    details: Record<string, unknown>;
  }>;
  alertSummary?: string;
}

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor - Add auth token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('auth_token');

    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Log request in development
    if (import.meta.env.DEV) {
      console.log(`[API Request] ${config.method?.toUpperCase()} ${config.url}`, {
        params: config.params,
        data: config.data,
      });
    }

    return config;
  },
  (error: AxiosError) => {
    console.error('[API Request Error]', error);
    return Promise.reject(error);
  }
);

// Response Interceptor - Handle errors
apiClient.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => {
    // Log response in development
    if (import.meta.env.DEV) {
      console.log(`[API Response] ${response.config.method?.toUpperCase()} ${response.config.url}`, {
        status: response.status,
        data: response.data,
      });
    }

    return response;
  },
  (error: AxiosError<ApiResponse>) => {
    // Log error
    console.error('[API Response Error]', {
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
      data: error.response?.data,
    });

    // Handle specific error cases
    if (error.response?.status === 401) {
      // Unauthorized - clear token and redirect to login
      // Only redirect if we actually have auth data (prevents loops on initial page load)
      const hasAuthData = localStorage.getItem('auth_token') || localStorage.getItem('user');

      if (hasAuthData) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');

        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
    }

    if (error.response?.status === 403) {
      // Forbidden - show access denied message
      console.error('Access denied:', error.response.data.error);
    }

    return Promise.reject(error);
  }
);

// API Methods
export const api = {
  // Health Check
  health: () => apiClient.get<ApiResponse>('/health'),

  // Auth
  auth: {
    register: (data: { name: string; email: string; password: string; role?: string }) =>
      apiClient.post<ApiResponse>('auth/register', data),
    login: (data: { email: string; password: string }) =>
      apiClient.post<ApiResponse>('auth/login', data),
    profile: () => apiClient.get<ApiResponse>('auth/profile'),
  },

  // Products
  products: {
    list: (params?: { page?: number; limit?: number; includeUoms?: boolean }) =>
      apiClient.get<ApiResponse>('products', { params }),
    getById: (id: string, includeUoms: boolean = false) =>
      apiClient.get<ApiResponse>(`products/${id}`, { params: { includeUoms } }),
    create: (data: CreateProductInput) =>
      apiClient.post<ApiResponse>('products', data),
    update: (id: string, data: UpdateProductInput) =>
      apiClient.put<ApiResponse>(`products/${id}`, data),
    delete: (id: string) =>
      apiClient.delete<ApiResponse>(`products/${id}`),
    convertQuantity: (id: string, data: { quantity: number; fromUomId: string; toUomId: string }) =>
      apiClient.post<ApiResponse>(`products/${id}/convert-quantity`, data),
    history: (id: string, params?: {
      page?: number;
      limit?: number;
      startDate?: string;
      endDate?: string;
      type?: string
    }) =>
      apiClient.get<ApiResponse>(`products/${id}/history`, { params }),

    // Master UoM management
    getMasterUoms: () =>
      apiClient.get<ApiResponse>('products/uoms/master'),

    // Product-specific UoM management
    getProductUoms: (id: string) =>
      apiClient.get<ApiResponse>(`products/${id}/uoms`),
    addProductUom: (id: string, data: { uomId: string; conversionFactor: number; isDefault?: boolean; overrideCost?: number; overridePrice?: number }) =>
      apiClient.post<ApiResponse>(`products/${id}/uoms`, data),
    updateProductUom: (productId: string, productUomId: string, data: { conversionFactor?: number; isDefault?: boolean; overrideCost?: number; overridePrice?: number }) =>
      apiClient.patch<ApiResponse>(`products/${productId}/uoms/${productUomId}`, data),
    deleteProductUom: (productId: string, productUomId: string) =>
      apiClient.delete<ApiResponse>(`products/${productId}/uoms/${productUomId}`),
  },

  // Customers
  customers: {
    list: (params?: { page?: number; limit?: number }) =>
      apiClient.get<ApiResponse>('customers', { params }),
    getById: (id: string) =>
      apiClient.get<ApiResponse>(`customers/${id}`),
    create: (data: CreateCustomerInput) =>
      apiClient.post<ApiResponse>('customers', data),
    update: (id: string, data: UpdateCustomerInput) =>
      apiClient.put<ApiResponse>(`customers/${id}`, data),
    toggleActive: (id: string, isActive: boolean) =>
      apiClient.patch<ApiResponse>(`customers/${id}/active`, { isActive }),
    delete: (id: string) =>
      apiClient.delete<ApiResponse>(`customers/${id}`),
    adjustBalance: (id: string, amount: number, reason: string) =>
      apiClient.post<ApiResponse>(`customers/${id}/balance`, { amount, reason }),
    getSales: (id: string, params?: { page?: number; limit?: number }) =>
      apiClient.get<ApiResponse>(`customers/${id}/sales`, { params }),
    getTransactions: (id: string, params?: { page?: number; limit?: number }) =>
      apiClient.get<ApiResponse>(`customers/${id}/transactions`, { params }),
    getSummary: (id: string) =>
      apiClient.get<ApiResponse>(`customers/${id}/summary`),
    getStatement: (id: string, params?: { start?: string; end?: string; page?: number; limit?: number }) =>
      apiClient.get<ApiResponse>(`customers/${id}/statement`, { params }),
  },

  // Suppliers
  suppliers: {
    list: (params?: { page?: number; limit?: number }) =>
      apiClient.get<ApiResponse>('suppliers', { params }),
    getById: (id: string) =>
      apiClient.get<ApiResponse>(`suppliers/${id}`),
    create: (data: CreateSupplierInput) =>
      apiClient.post<ApiResponse>('suppliers', data),
    update: (id: string, data: UpdateSupplierInput) =>
      apiClient.put<ApiResponse>(`suppliers/${id}`, data),
    delete: (id: string) =>
      apiClient.delete<ApiResponse>(`suppliers/${id}`),
    getPerformance: (id: string) =>
      apiClient.get<ApiResponse>(`suppliers/${id}/performance`),
    getOrders: (id: string, params?: { page?: number; limit?: number }) =>
      apiClient.get<ApiResponse>(`suppliers/${id}/orders`, { params }),
    getProducts: (id: string) =>
      apiClient.get<ApiResponse>(`suppliers/${id}/products`),
  },

  // Sales
  sales: {
    list: (params?: { page?: number; limit?: number; startDate?: string; endDate?: string; cashierId?: string }) =>
      apiClient.get<ApiResponse>('sales', { params }),
    getById: (id: string) =>
      apiClient.get<ApiResponse>(`sales/${id}`),
    create: (data: CreateSaleInput) =>
      apiClient.post<ApiResponse>('sales', data),
    summary: (params?: { startDate?: string; endDate?: string; groupBy?: string }) =>
      apiClient.get<ApiResponse>('sales/summary', { params }),
    // Sales Reports
    productSummary: (params?: { startDate?: string; endDate?: string; productId?: string; customerId?: string }) =>
      apiClient.get<ApiResponse>('sales/reports/product-summary', { params }),
    topSelling: (params?: { limit?: number; startDate?: string; endDate?: string }) =>
      apiClient.get<ApiResponse>('sales/reports/top-selling', { params }),
    summaryByDate: (params?: { groupBy?: 'day' | 'week' | 'month'; startDate?: string; endDate?: string }) =>
      apiClient.get<ApiResponse>('sales/reports/summary-by-date', { params }),
  },

  // Invoices
  invoices: {
    list: (params?: { page?: number; limit?: number; customerId?: string }) =>
      apiClient.get<ApiResponse>('invoices', { params }),
    getById: (id: string) =>
      apiClient.get<ApiResponse>(`invoices/${id}`),
    create: (data: CreateInvoiceInput) =>
      apiClient.post<ApiResponse>('invoices', data),
    addPayment: (invoiceId: string, data: { amount: number; paymentMethod: string; paymentDate?: string; referenceNumber?: string; notes?: string }) =>
      apiClient.post<ApiResponse>(`invoices/${invoiceId}/payments`, data),
    getPayments: (invoiceId: string) =>
      apiClient.get<ApiResponse>(`invoices/${invoiceId}/payments`),
  },

  // Inventory
  inventory: {
    stockLevels: () =>
      apiClient.get<ApiResponse>('inventory/stock-levels'),
    stockLevelByProduct: (productId: string) =>
      apiClient.get<ApiResponse>(`inventory/stock-levels/${productId}`),
    batchesByProduct: (productId: string) =>
      apiClient.get<ApiResponse>('inventory/batches', { params: { productId } }),
    expiringSoon: (days?: number) =>
      apiClient.get<ApiResponse>('inventory/batches/expiring', { params: { daysThreshold: days } }),
    needingReorder: () =>
      apiClient.get<ApiResponse>('inventory/reorder'),
    inventoryValue: (productId?: string) =>
      apiClient.get<ApiResponse>('inventory/value', { params: productId ? { productId } : {} }),
    adjustInventory: (data: { productId: string; adjustment: number; reason: string; userId: string }) =>
      apiClient.post<ApiResponse>('inventory/adjust', data),
  },

  // Purchase Orders
  purchaseOrders: {
    list: (params?: { page?: number; limit?: number; status?: string; supplierId?: string }) =>
      apiClient.get<ApiResponse>('purchase-orders', { params }),
    getById: (id: string) =>
      apiClient.get<ApiResponse>(`purchase-orders/${id}`),
    create: (data: CreatePurchaseOrderInput) =>
      apiClient.post<ApiResponse>('purchase-orders', data),
    updateStatus: (id: string, status: string) =>
      apiClient.put<ApiResponse>(`purchase-orders/${id}/status`, { status }),
    submit: (id: string) =>
      apiClient.post<ApiResponse>(`purchase-orders/${id}/submit`),
    sendToSupplier: (id: string) =>
      apiClient.post<ApiResponse>(`purchase-orders/${id}/send-to-supplier`),
    cancel: (id: string) =>
      apiClient.post<ApiResponse>(`purchase-orders/${id}/cancel`),
    delete: (id: string) =>
      apiClient.delete<ApiResponse>(`purchase-orders/${id}`),
    createInvoice: (data: CreatePOInvoiceInput) =>
      apiClient.post<ApiResponse>('purchase-orders/invoices', data),
    recordPayment: (data: RecordPOPaymentInput) =>
      apiClient.post<ApiResponse>('purchase-orders/payments', data),
  },

  // Goods Receipts
  goodsReceipts: {
    list: (params?: { page?: number; limit?: number; status?: string; purchaseOrderId?: string }) =>
      apiClient.get<ApiResponse>('goods-receipts', { params }),
    getById: (id: string) =>
      apiClient.get<ApiResponse>(`goods-receipts/${id}`),
    create: (data: CreateGoodsReceiptInput) =>
      apiClient.post<ApiResponse>('goods-receipts', data),
    finalize: (id: string) =>
      apiClient.post<ApiResponse>(`goods-receipts/${id}/finalize`),
    updateItem: (grId: string, itemId: string, data: UpdateGoodsReceiptItemInput) =>
      apiClient.put<ApiResponse>(`goods-receipts/${grId}/items/${itemId}`, data),
    hydrateFromPO: (id: string) =>
      apiClient.post<ApiResponse>(`goods-receipts/${id}/hydrate-from-po`),
  },

  // Stock Movements
  stockMovements: {
    list: (params?: { page?: number; limit?: number; movementType?: string; startDate?: string; endDate?: string }) =>
      apiClient.get<ApiResponse>('stock-movements', { params }),
    byProduct: (productId: string, params?: { page?: number; limit?: number }) =>
      apiClient.get<ApiResponse>(`stock-movements/product/${productId}`, { params }),
    byBatch: (batchId: string, params?: { page?: number; limit?: number }) =>
      apiClient.get<ApiResponse>(`stock-movements/batch/${batchId}`, { params }),
    record: (data: RecordStockMovementInput) =>
      apiClient.post<ApiResponse>('stock-movements', data),
  },

  // Payments
  payments: {
    processSplit: (data: SplitPaymentInput) =>
      apiClient.post<ApiResponse>('payments/process-split', data),
    getMethods: () =>
      apiClient.get<ApiResponse>('payments/methods'),
    getSalePayments: (saleId: string) =>
      apiClient.get<ApiResponse>(`payments/sale/${saleId}`),
    getCustomerBalance: (customerId: string) =>
      apiClient.get<ApiResponse>(`payments/customer/${customerId}/balance`),
    getCustomerHistory: (customerId: string, params?: { limit?: number }) =>
      apiClient.get<ApiResponse>(`payments/customer/${customerId}/history`, { params }),
    recordCustomerPayment: (customerId: string, data: RecordCustomerPaymentInput) =>
      apiClient.post<ApiResponse>(`payments/customer/${customerId}/payment`, data),
  },

  // POS Hold Orders
  hold: {
    create: (data: CreateHoldOrderInput) =>
      apiClient.post<ApiResponse>('pos/hold', data),
    list: (params?: { terminalId?: string }) =>
      apiClient.get<ApiResponse>('pos/hold', { params }),
    getById: (holdId: string) =>
      apiClient.get<ApiResponse>(`pos/hold/${holdId}`),
    delete: (holdId: string) =>
      apiClient.delete<ApiResponse>(`pos/hold/${holdId}`),
  },

  // Customer Deposits
  deposits: {
    getCustomerBalance: (customerId: string) =>
      apiClient.get<ApiResponse>(`deposits/customer/${customerId}/balance`),
    list: (customerId?: string, params?: { page?: number; limit?: number; status?: string }) =>
      apiClient.get<ApiResponse>(customerId ? `deposits/customer/${customerId}` : 'deposits', { params }),
    create: (data: { customerId: string; amount: number; paymentMethod: string; reference?: string; notes?: string }) =>
      apiClient.post<ApiResponse>('deposits', data),
    apply: (data: { customerId: string; saleId: string; amount: number }) =>
      apiClient.post<ApiResponse>('deposits/apply', data),
    getHistory: (customerId: string, params?: { page?: number; limit?: number }) =>
      apiClient.get<ApiResponse>(`deposits/customer/${customerId}/history`, { params }),
  },

  // Invoice Settings
  settings: {
    getInvoiceSettings: () =>
      apiClient.get<ApiResponse>('settings/invoice'),
    updateInvoiceSettings: (data: InvoiceSettingsInput) =>
      apiClient.put<ApiResponse>('settings/invoice', data),
  },

  // Generic HTTP methods for backward compatibility
  get: <T = ApiResponse>(url: string, config?: AxiosRequestConfig) =>
    apiClient.get<T>(url, config),
  post: <T = ApiResponse>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    apiClient.post<T>(url, data, config),
  put: <T = ApiResponse>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    apiClient.put<T>(url, data, config),
  patch: <T = ApiResponse>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    apiClient.patch<T>(url, data, config),
  delete: <T = ApiResponse>(url: string, config?: AxiosRequestConfig) =>
    apiClient.delete<T>(url, config),
};

// Error Helper
export const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<ApiResponse>;
    return axiosError.response?.data?.error || axiosError.message || 'An unknown error occurred';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'An unknown error occurred';
};

// Success Helper
export const getSuccessMessage = (response: AxiosResponse<ApiResponse>): string => {
  return response.data.message || 'Operation completed successfully';
};

// Alert Helper
export const hasAlerts = (response: AxiosResponse<ApiResponse>): boolean => {
  return !!(response.data.alerts && response.data.alerts.length > 0);
};

export default apiClient;
