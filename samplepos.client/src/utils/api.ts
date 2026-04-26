// API Client for SamplePOS Frontend
// Centralized API communication with error handling and interceptors

import axios, { AxiosError } from 'axios';
import type {
  AxiosInstance,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
  AxiosResponse,
} from 'axios';
import {
  isTokenExpired,
  getRefreshToken,
  getAccessToken,
  clearTokens,
  storeTokens,
} from '../hooks/useTokenRefresh';
import type {
  CreateProductInput,
  UpdateProductInput,
  CreateCustomerInput,
  UpdateCustomerInput,
  CreateSupplierInput,
  UpdateSupplierInput,
  CreateSaleInput,
  CreatePurchaseOrderInput,
  CreatePOInvoiceInput,
  RecordPOPaymentInput,
  CreateGoodsReceiptInput,
  UpdateGoodsReceiptItemInput,
  RecordStockMovementInput,
  CreateInvoiceInput,
  SplitPaymentInput,
  RecordCustomerPaymentInput,
  CreateHoldOrderInput,
  InvoiceSettingsInput,
} from '../types/inputs';

// API Configuration
// Use relative URL in dev so requests go through Vite proxy (handles HTTPS)
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
const API_TIMEOUT = 30000; // 30 seconds

// API Response Types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  error_code?: string;
  details?: Record<string, unknown>;
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

// Create axios instance (exported for direct URL-based calls with full auth/refresh)
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Token refresh state (shared across interceptors on this instance)
let _isRefreshing = false;
let _refreshPromise: Promise<void> | null = null;

async function _doRefresh(): Promise<void> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new Error('No refresh token');
  const res = await axios.post(`${API_BASE_URL.replace(/\/api$/, '/api')}/auth/token/refresh`, { refreshToken });
  const data = res.data.data;
  storeTokens(data.accessToken, data.refreshToken, data.expiresIn);
}

// Request Interceptor - Add auth token + refresh if expired
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // Skip auth for public routes
    if (config.url?.includes('/login') || config.url?.includes('/register') || config.url?.includes('/token/refresh')) {
      return config;
    }

    // Refresh expired token (skip when offline)
    if (isTokenExpired() && getRefreshToken() && navigator.onLine) {
      if (!_isRefreshing) {
        _isRefreshing = true;
        _refreshPromise = _doRefresh().finally(() => { _isRefreshing = false; _refreshPromise = null; });
      }
      try {
        await _refreshPromise;
      } catch {
        // Refresh failed while online — don't clear tokens here, response interceptor handles it
      }
    }

    const token = getAccessToken() || localStorage.getItem('auth_token');
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
      console.log(
        `[API Response] ${response.config.method?.toUpperCase()} ${response.config.url}`,
        {
          status: response.status,
          data: response.data,
        }
      );
    }

    return response;
  },
  async (error: AxiosError<ApiResponse>) => {
    // Log error
    console.error('[API Response Error]', {
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
      data: error.response?.data,
    });

    // Handle specific error cases
    if (error.response?.status === 401) {
      // Don't clear tokens or redirect when offline — the 401 is expected
      if (!navigator.onLine) {
        return Promise.reject(error);
      }

      // Try to refresh once on 401 (if we haven't already retried this request)
      const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
      if (originalRequest && !originalRequest._retry && getRefreshToken()) {
        originalRequest._retry = true;
        try {
          await _doRefresh();
          const token = getAccessToken();
          if (token && originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${token}`;
          }
          return apiClient(originalRequest);
        } catch (refreshErr) {
          // If refresh failed due to network (no server response), keep tokens —
          // user may still work offline with cached session data.
          const isNetworkError = refreshErr instanceof Error &&
            (!('response' in refreshErr) || (refreshErr as AxiosError).response == null);
          if (isNetworkError) {
            return Promise.reject(error);
          }
          // Genuine auth rejection — fall through to logout
        }
      }

      // Unauthorized - clear token and redirect to login
      const hasAuthData = localStorage.getItem('auth_token') || localStorage.getItem('user');

      if (hasAuthData) {
        clearTokens();
        localStorage.removeItem('user');

        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
    }

    if (error.response?.status === 403) {
      // Forbidden - show access denied notification
      const msg = error.response.data?.error || 'You do not have permission to perform this action';
      console.error('Access denied:', msg);
      // Dispatch custom event so any toast system can pick it up
      window.dispatchEvent(new CustomEvent('app:forbidden', { detail: msg }));
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
    list: (params?: { page?: number; limit?: number; includeUoms?: boolean; search?: string }) =>
      apiClient.get<ApiResponse>('products', { params }),
    getById: (id: string, includeUoms: boolean = false) =>
      apiClient.get<ApiResponse>(`products/${id}`, { params: { includeUoms } }),
    procurementSearch: (params: { q: string; supplierId?: string; limit?: number }) =>
      apiClient.get<ApiResponse>('products/procurement-search', { params }),
    create: (data: CreateProductInput) => apiClient.post<ApiResponse>('products', data),
    update: (id: string, data: UpdateProductInput) =>
      apiClient.put<ApiResponse>(`products/${id}`, data),
    delete: (id: string) => apiClient.delete<ApiResponse>(`products/${id}`),
    convertQuantity: (id: string, data: { quantity: number; fromUomId: string; toUomId: string }) =>
      apiClient.post<ApiResponse>(`products/${id}/convert-quantity`, data),
    history: (
      id: string,
      params?: {
        page?: number;
        limit?: number;
        startDate?: string;
        endDate?: string;
        type?: string;
      }
    ) => apiClient.get<ApiResponse>(`products/${id}/history`, { params }),

    // Master UoM management
    getMasterUoms: () => apiClient.get<ApiResponse>('products/uoms/master'),

    // Product-specific UoM management
    getProductUoms: (id: string) => apiClient.get<ApiResponse>(`products/${id}/uoms`),
    addProductUom: (
      id: string,
      data: {
        uomId: string;
        conversionFactor: number;
        isDefault?: boolean;
        overrideCost?: number;
        overridePrice?: number;
      }
    ) => apiClient.post<ApiResponse>(`products/${id}/uoms`, data),
    updateProductUom: (
      productId: string,
      productUomId: string,
      data: {
        conversionFactor?: number;
        isDefault?: boolean;
        overrideCost?: number;
        overridePrice?: number;
      }
    ) => apiClient.patch<ApiResponse>(`products/${productId}/uoms/${productUomId}`, data),
    deleteProductUom: (productId: string, productUomId: string) =>
      apiClient.delete<ApiResponse>(`products/${productId}/uoms/${productUomId}`),
  },

  // Customers
  customers: {
    list: (params?: { page?: number; limit?: number }) =>
      apiClient.get<ApiResponse>('customers', { params }),
    getById: (id: string) => apiClient.get<ApiResponse>(`customers/${id}`),
    create: (data: CreateCustomerInput) => apiClient.post<ApiResponse>('customers', data),
    update: (id: string, data: UpdateCustomerInput) =>
      apiClient.put<ApiResponse>(`customers/${id}`, data),
    toggleActive: (id: string, isActive: boolean) =>
      apiClient.patch<ApiResponse>(`customers/${id}/active`, { isActive }),
    delete: (id: string) => apiClient.delete<ApiResponse>(`customers/${id}`),
    adjustBalance: (id: string, amount: number, reason: string) =>
      apiClient.post<ApiResponse>(`customers/${id}/balance`, { amount, reason }),
    getSales: (id: string, params?: { page?: number; limit?: number }) =>
      apiClient.get<ApiResponse>(`customers/${id}/sales`, { params }),
    getTransactions: (id: string, params?: { page?: number; limit?: number }) =>
      apiClient.get<ApiResponse>(`customers/${id}/transactions`, { params }),
    getSummary: (id: string) => apiClient.get<ApiResponse>(`customers/${id}/summary`),
    getStatement: (
      id: string,
      params?: { start?: string; end?: string; page?: number; limit?: number }
    ) => apiClient.get<ApiResponse>(`customers/${id}/statement`, { params }),
  },

  // Suppliers
  suppliers: {
    list: (params?: { page?: number; limit?: number }) =>
      apiClient.get<ApiResponse>('suppliers', { params }),
    getById: (id: string) => apiClient.get<ApiResponse>(`suppliers/${id}`),
    create: (data: CreateSupplierInput) => apiClient.post<ApiResponse>('suppliers', data),
    update: (id: string, data: UpdateSupplierInput) =>
      apiClient.put<ApiResponse>(`suppliers/${id}`, data),
    delete: (id: string) => apiClient.delete<ApiResponse>(`suppliers/${id}`),
    getPerformance: (id: string) => apiClient.get<ApiResponse>(`suppliers/${id}/performance`),
    getOrders: (id: string, params?: { page?: number; limit?: number }) =>
      apiClient.get<ApiResponse>(`suppliers/${id}/orders`, { params }),
    getProducts: (id: string) => apiClient.get<ApiResponse>(`suppliers/${id}/products`),
  },

  // Sales
  sales: {
    list: (params?: {
      page?: number;
      limit?: number;
      startDate?: string;
      endDate?: string;
      cashierId?: string;
      paymentMethod?: string;
    }) => apiClient.get<ApiResponse>('sales', { params }),
    getById: (id: string) => apiClient.get<ApiResponse>(`sales/${id}`),
    create: (data: CreateSaleInput) => apiClient.post<ApiResponse>('sales', data),
    summary: (params?: { startDate?: string; endDate?: string; groupBy?: string }) =>
      apiClient.get<ApiResponse>('sales/summary', { params }),
    // Sales Reports
    productSummary: (params?: {
      startDate?: string;
      endDate?: string;
      productId?: string;
      customerId?: string;
    }) => apiClient.get<ApiResponse>('sales/reports/product-summary', { params }),
    topSelling: (params?: { limit?: number; startDate?: string; endDate?: string }) =>
      apiClient.get<ApiResponse>('sales/reports/top-selling', { params }),
    summaryByDate: (params?: {
      groupBy?: 'day' | 'week' | 'month';
      startDate?: string;
      endDate?: string;
    }) => apiClient.get<ApiResponse>('sales/reports/summary-by-date', { params }),
    byCashier: (params?: { startDate?: string; endDate?: string }) =>
      apiClient.get<ApiResponse>('sales/reports/by-cashier', { params }),
    voidSale: (id: string, data: { reason: string; approvedById?: string }) =>
      apiClient.post<ApiResponse>(`sales/${id}/void`, data),
    refundSale: (id: string, data: { items: { saleItemId: string; quantity: number }[]; reason: string; approvedById?: string; refundDate?: string }) =>
      apiClient.post<ApiResponse>(`sales/${id}/refund`, data),
    getRefunds: (id: string) =>
      apiClient.get<ApiResponse>(`sales/${id}/refunds`),
  },

  // POS Orders (Order→Payment workflow)
  orders: {
    listPending: (params?: { orderDate?: string }) =>
      apiClient.get<ApiResponse>('orders/pending', { params }),
    pendingCount: () =>
      apiClient.get<ApiResponse>('orders/pending-count'),
    list: (params?: { page?: number; limit?: number; status?: string; startDate?: string; endDate?: string }) =>
      apiClient.get<ApiResponse>('orders', { params }),
    getById: (id: string) =>
      apiClient.get<ApiResponse>(`orders/${id}`),
    create: (data: {
      customerId?: string | null;
      items: { productId: string; productName: string; quantity: number; unitPrice: number; discountAmount?: number; uomId?: string | null; baseQty?: number | null; baseUomId?: string | null; conversionFactor?: number | null }[];
      subtotal?: number;
      discountAmount?: number;
      taxAmount?: number;
      totalAmount?: number;
      assignedCashierId?: string | null;
      orderDate?: string;
      notes?: string | null;
    }) => apiClient.post<ApiResponse>('orders', data),
    complete: (id: string, data: {
      paymentMethod: string;
      paymentReceived: number;
      paymentLines?: { paymentMethod: string; amount: number; reference?: string }[];
      customerId?: string | null;
      cashRegisterSessionId?: string;
    }) => apiClient.post<ApiResponse>(`orders/${id}/complete`, data),
    cancel: (id: string, data: { reason: string }) =>
      apiClient.post<ApiResponse>(`orders/${id}/cancel`, data),
  },

  // Invoices
  invoices: {
    list: (params?: { page?: number; limit?: number; customerId?: string }) =>
      apiClient.get<ApiResponse>('invoices', { params }),
    getById: (id: string) => apiClient.get<ApiResponse>(`invoices/${id}`),
    create: (data: CreateInvoiceInput) => apiClient.post<ApiResponse>('invoices', data),
    addPayment: (
      invoiceId: string,
      data: {
        amount: number;
        paymentMethod: string;
        paymentDate?: string;
        referenceNumber?: string;
        notes?: string;
      }
    ) => apiClient.post<ApiResponse>(`invoices/${invoiceId}/payments`, data),
    getPayments: (invoiceId: string) =>
      apiClient.get<ApiResponse>(`invoices/${invoiceId}/payments`),
  },

  // Inventory
  inventory: {
    stockLevels: () => apiClient.get<ApiResponse>('inventory/stock-levels'),
    stockLevelByProduct: (productId: string) =>
      apiClient.get<ApiResponse>(`inventory/stock-levels/${productId}`),
    batchesByProduct: (productId: string) =>
      apiClient.get<ApiResponse>('inventory/batches', { params: { productId } }),
    expiringSoon: (days?: number) =>
      apiClient.get<ApiResponse>('inventory/batches/expiring', { params: { daysThreshold: days } }),
    batchesAll: () => apiClient.get<ApiResponse>('inventory/batches-all'),
    needingReorder: () => apiClient.get<ApiResponse>('inventory/reorder'),
    inventoryValue: (productId?: string) =>
      apiClient.get<ApiResponse>('inventory/value', { params: productId ? { productId } : {} }),
    adjustInventory: (data: {
      productId: string;
      adjustment: number;
      reason: string;
      userId: string;
    }) => apiClient.post<ApiResponse>('inventory/adjust', data),
    adjustBatch: (data: {
      batchId?: string;
      productId: string;
      quantity: number;
      direction: 'IN' | 'OUT';
      reason: 'ADJUSTMENT' | 'DAMAGE' | 'EXPIRY' | 'PHYSICAL_COUNT' | 'WRITE_OFF';
      notes: string;
      userId: string;
      documentId?: string;
    }) => apiClient.post<ApiResponse>('inventory/adjust-batch', data),
  },

  // Purchase Orders
  purchaseOrders: {
    list: (params?: { page?: number; limit?: number; status?: string; supplierId?: string }) =>
      apiClient.get<ApiResponse>('purchase-orders', { params }),
    getById: (id: string) => apiClient.get<ApiResponse>(`purchase-orders/${id}`),
    create: (data: CreatePurchaseOrderInput) =>
      apiClient.post<ApiResponse>('purchase-orders', data),
    updateStatus: (id: string, status: string) =>
      apiClient.put<ApiResponse>(`purchase-orders/${id}/status`, { status }),
    submit: (id: string) => apiClient.post<ApiResponse>(`purchase-orders/${id}/submit`),
    sendToSupplier: (id: string) =>
      apiClient.post<ApiResponse>(`purchase-orders/${id}/send-to-supplier`),
    cancel: (id: string) => apiClient.post<ApiResponse>(`purchase-orders/${id}/cancel`),
    delete: (id: string) => apiClient.delete<ApiResponse>(`purchase-orders/${id}`),
    update: (id: string, data: { supplierId?: string; expectedDate?: string | null; notes?: string | null; items?: Array<{ productId: string; productName: string; quantity: number; unitCost: number; lineTotal?: number; uomId?: string | null }> }) =>
      apiClient.put<ApiResponse>(`purchase-orders/${id}`, data),
    createInvoice: (data: CreatePOInvoiceInput) =>
      apiClient.post<ApiResponse>('purchase-orders/invoices', data),
    recordPayment: (data: RecordPOPaymentInput) =>
      apiClient.post<ApiResponse>('purchase-orders/payments', data),
    resolveUnitCost: (params: { productId: string; supplierId: string }) =>
      apiClient.get<ApiResponse>('purchase-orders/resolve-unit-cost', { params }),
  },

  // Goods Receipts
  goodsReceipts: {
    list: (params?: { page?: number; limit?: number; status?: string; purchaseOrderId?: string }) =>
      apiClient.get<ApiResponse>('goods-receipts', { params }),
    getById: (id: string) => apiClient.get<ApiResponse>(`goods-receipts/${id}`),
    create: (data: CreateGoodsReceiptInput) => apiClient.post<ApiResponse>('goods-receipts', data),
    finalize: (id: string) => apiClient.post<ApiResponse>(`goods-receipts/${id}/finalize`),
    updateItem: (grId: string, itemId: string, data: UpdateGoodsReceiptItemInput) =>
      apiClient.put<ApiResponse>(`goods-receipts/${grId}/items/${itemId}`, data),
    batchUpdateItems: (grId: string, items: Array<{ itemId: string; receivedQuantity?: number; unitCost?: number; batchNumber?: string | null; isBonus?: boolean; expiryDate?: string | null }>) =>
      apiClient.put<ApiResponse>(`goods-receipts/${grId}/items`, { items }),
    addItem: (grId: string, data: { productId: string; productName: string; receivedQuantity: number; unitCost: number; batchNumber?: string | null; expiryDate?: string | null }) =>
      apiClient.post<ApiResponse>(`goods-receipts/${grId}/items`, data),
    removeItem: (grId: string, itemId: string) =>
      apiClient.delete<ApiResponse>(`goods-receipts/${grId}/items/${itemId}`),
    hydrateFromPO: (id: string) =>
      apiClient.post<ApiResponse>(`goods-receipts/${id}/hydrate-from-po`),
  },

  // Return GRN (Goods Return to Supplier)
  returnGrn: {
    list: (params?: { page?: number; limit?: number; grnId?: string; supplierId?: string; status?: string }) =>
      apiClient.get<ApiResponse>('return-grn', { params }),
    getById: (id: string) => apiClient.get<ApiResponse>(`return-grn/${id}`),
    create: (data: { grnId: string; returnDate?: string; reason: string; lines: Array<{ productId: string; batchId?: string; uomId?: string; quantity: number; unitCost: number }> }) =>
      apiClient.post<ApiResponse>('return-grn', data),
    post: (id: string) => apiClient.post<ApiResponse>(`return-grn/${id}/post`),
    getReturnableItems: (grnId: string) =>
      apiClient.get<ApiResponse>(`return-grn/grn/${grnId}/returnable`),
    getByGrnId: (grnId: string) =>
      apiClient.get<ApiResponse>(`return-grn/grn/${grnId}`),
  },

  // Stock Movements
  stockMovements: {
    list: (params?: {
      page?: number;
      limit?: number;
      movementType?: string;
      startDate?: string;
      endDate?: string;
      search?: string;
    }) => apiClient.get<ApiResponse>('stock-movements', { params }),
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
    getMethods: () => apiClient.get<ApiResponse>('payments/methods'),
    getSalePayments: (saleId: string) => apiClient.get<ApiResponse>(`payments/sale/${saleId}`),
    getCustomerBalance: (customerId: string) =>
      apiClient.get<ApiResponse>(`payments/customer/${customerId}/balance`),
    getCustomerHistory: (customerId: string, params?: { limit?: number }) =>
      apiClient.get<ApiResponse>(`payments/customer/${customerId}/history`, { params }),
    recordCustomerPayment: (customerId: string, data: RecordCustomerPaymentInput) =>
      apiClient.post<ApiResponse>(`payments/customer/${customerId}/payment`, data),
  },

  // POS Hold Orders
  hold: {
    create: (data: CreateHoldOrderInput) => apiClient.post<ApiResponse>('pos/hold', data),
    list: (params?: { terminalId?: string }) => apiClient.get<ApiResponse>('pos/hold', { params }),
    getById: (holdId: string) => apiClient.get<ApiResponse>(`pos/hold/${holdId}`),
    delete: (holdId: string) => apiClient.delete<ApiResponse>(`pos/hold/${holdId}`),
  },

  // Customer Deposits
  deposits: {
    getCustomerBalance: (customerId: string) =>
      apiClient.get<ApiResponse>(`deposits/customer/${customerId}/balance`),
    list: (customerId?: string, params?: { page?: number; limit?: number; status?: string }) =>
      apiClient.get<ApiResponse>(customerId ? `deposits/customer/${customerId}` : 'deposits', {
        params,
      }),
    create: (data: {
      customerId: string;
      amount: number;
      paymentMethod: string;
      reference?: string;
      notes?: string;
    }) => apiClient.post<ApiResponse>('deposits', data),
    apply: (data: { customerId: string; saleId: string; amount: number }) =>
      apiClient.post<ApiResponse>('deposits/apply', data),
    getHistory: (customerId: string, params?: { page?: number; limit?: number }) =>
      apiClient.get<ApiResponse>(`deposits/customer/${customerId}/history`, { params }),
  },

  // Invoice Settings
  settings: {
    getInvoiceSettings: () => apiClient.get<ApiResponse>('settings/invoice'),
    updateInvoiceSettings: (data: InvoiceSettingsInput) =>
      apiClient.put<ApiResponse>('settings/invoice', data),
  },

  // Tenant Config (public — no auth required)
  tenant: {
    getConfig: () => apiClient.get<ApiResponse>('tenant/config'),
  },

  // Business Reports
  reports: {
    businessPerformance: (params?: {
      start_date?: string;
      end_date?: string;
      payment_method?: string;
      transaction_type?: string;
      include_stock_adjustments?: string;
      include_expenses?: string;
    }) =>
      apiClient.get<ApiResponse>('reports/business-performance', { params }),
  },

  // Advanced Accounting Modules
  costCenters: {
    list: (params?: { parent_id?: string }) =>
      apiClient.get<ApiResponse>('cost-centers', { params }),
    getById: (id: string) => apiClient.get<ApiResponse>(`cost-centers/${id}`),
    create: (data: { code: string; name: string; description?: string; parentId?: string; managerId?: string }) =>
      apiClient.post<ApiResponse>('cost-centers', data),
    update: (id: string, data: { name?: string; description?: string; isActive?: boolean }) =>
      apiClient.put<ApiResponse>(`cost-centers/${id}`, data),
    getHierarchy: () => apiClient.get<ApiResponse>('cost-centers/hierarchy'),
    getReport: (id: string, params?: { startDate?: string; endDate?: string }) =>
      apiClient.get<ApiResponse>(`cost-centers/${id}/report`, { params }),
    setBudget: (id: string, data: { periodId: string; budgetAmount: number }) =>
      apiClient.post<ApiResponse>(`cost-centers/${id}/budget`, data),
  },

  periodControl: {
    getByYear: (year: number) => apiClient.get<ApiResponse>(`period-control/${year}`),
    openPeriod: (periodId: string) =>
      apiClient.post<ApiResponse>(`period-control/${periodId}/open`),
    closePeriod: (periodId: string) =>
      apiClient.post<ApiResponse>(`period-control/${periodId}/close`),
    createSpecial: (year: number, data: { name: string; startDate: string; endDate: string; periodType?: string }) =>
      apiClient.post<ApiResponse>(`period-control/special/${year}`, data),
    getStatus: (periodId: string) =>
      apiClient.get<ApiResponse>(`period-control/${periodId}/status`),
  },

  grirClearing: {
    getOpenItems: (params?: { supplierId?: string; poNumber?: string; grNumber?: string; status?: string; dateFrom?: string; dateTo?: string; page?: number; limit?: number }) =>
      apiClient.get<ApiResponse>('grir-clearing/open', { params }),
    search: (q: string) =>
      apiClient.get<ApiResponse>('grir-clearing/search', { params: { q } }),
    getBalance: () => apiClient.get<ApiResponse>('grir-clearing/balance'),
    getMatchCandidates: (params?: { supplierId?: string }) =>
      apiClient.get<ApiResponse>('grir-clearing/match-candidates', { params }),
    getGrItems: (grId: string) =>
      apiClient.get<ApiResponse>(`grir-clearing/gr/${grId}/items`),
    getHistory: (poId: string) =>
      apiClient.get<ApiResponse>(`grir-clearing/history/${poId}`),
    getStatus: (poId: string) =>
      apiClient.get<ApiResponse>(`grir-clearing/${poId}`),
    clearItem: (data: { grId: string; invoiceId: string; date?: string }) =>
      apiClient.post<ApiResponse>('grir-clearing/clear', data),
    autoMatch: (data?: { supplierId?: string; tolerancePercent?: number }) =>
      apiClient.post<ApiResponse>('grir-clearing/auto-match', data),
  },

  dunning: {
    getLevels: () => apiClient.get<ApiResponse>('dunning/levels'),
    createLevel: (data: { levelNumber: number; daysOverdue: number; feeAmount: number; letterTemplate: string; blockDelivery?: boolean }) =>
      apiClient.post<ApiResponse>('dunning/levels', data),
    analyze: (data: { asOfDate: string; customerId?: string }) =>
      apiClient.post<ApiResponse>('dunning/analyze', data),
    createRun: (data: { asOfDate: string; levelId: string; customerIds?: string[] }) =>
      apiClient.post<ApiResponse>('dunning/runs', data),
    getHistory: (customerId: string) =>
      apiClient.get<ApiResponse>(`dunning/history/${customerId}`),
  },

  wht: {
    getTypes: () => apiClient.get<ApiResponse>('withholding-tax/types'),
    createType: (data: { code: string; name: string; rate: number; appliesToSuppliers?: boolean; appliesToCustomers?: boolean }) =>
      apiClient.post<ApiResponse>('withholding-tax/types', data),
    getBalance: (params?: { startDate?: string; endDate?: string }) =>
      apiClient.get<ApiResponse>('withholding-tax/balance', { params }),
    getCertificates: (params?: { supplierId?: string; startDate?: string; endDate?: string }) =>
      apiClient.get<ApiResponse>('withholding-tax/certificates', { params }),
  },

  assets: {
    getCategories: () => apiClient.get<ApiResponse>('assets/categories'),
    createCategory: (data: {
      code: string; name: string; usefulLifeMonths: number; depreciationMethod: string;
      depreciationRate?: number; assetAccountCode?: string; depreciationAccountCode?: string; accumDepreciationAccountCode?: string;
    }) =>
      apiClient.post<ApiResponse>('assets/categories', data),
    list: (params?: { categoryId?: string; status?: string }) =>
      apiClient.get<ApiResponse>('assets', { params }),
    getById: (id: string) => apiClient.get<ApiResponse>(`assets/${id}`),
    create: (data: {
      name: string; categoryId: string; acquisitionDate: string; acquisitionCost: number;
      description?: string; salvageValue?: number; usefulLifeMonths?: number;
      depreciationMethod?: string; depreciationStartDate?: string; paymentMethod?: string;
      location?: string; serialNumber?: string;
    }) =>
      apiClient.post<ApiResponse>('assets', data),
    runDepreciation: (data: { year: number; month: number }) =>
      apiClient.post<ApiResponse>('assets/depreciation/run', data),
    getSchedule: (assetId: string) =>
      apiClient.get<ApiResponse>(`assets/${assetId}/schedule`),
    dispose: (assetId: string, data: { disposalDate: string; disposalAmount: number }) =>
      apiClient.post<ApiResponse>(`assets/${assetId}/dispose`, data),
  },

  jeApproval: {
    getRules: () => apiClient.get<ApiResponse>('je-approval/rules'),
    createRule: (data: { minAmount: number; requiredRole: string; description?: string }) =>
      apiClient.post<ApiResponse>('je-approval/rules', data),
    getPending: () => apiClient.get<ApiResponse>('je-approval/pending'),
    approve: (entryId: string, data: { notes?: string }) =>
      apiClient.post<ApiResponse>(`je-approval/${entryId}/approve`, data),
    reject: (entryId: string, data: { reason: string }) =>
      apiClient.post<ApiResponse>(`je-approval/${entryId}/reject`, data),
  },

  paymentProgram: {
    list: () => apiClient.get<ApiResponse>('payment-program'),
    create: (data: { runDate: string; paymentMethod?: string; supplierId?: string }) =>
      apiClient.post<ApiResponse>('payment-program', data),
    getById: (id: string) => apiClient.get<ApiResponse>(`payment-program/${id}`),
    execute: (id: string) =>
      apiClient.post<ApiResponse>(`payment-program/${id}/execute`),
    getProposal: (id: string) =>
      apiClient.get<ApiResponse>(`payment-program/${id}/proposal`),
  },

  currency: {
    list: () => apiClient.get<ApiResponse>('currency/currencies'),
    getConfig: () => apiClient.get<ApiResponse>('currency/config'),
    updateConfig: (data: { functionalCurrency: string; reportingCurrency?: string; exchangeRateType?: string }) =>
      apiClient.put<ApiResponse>('currency/config', data),
    getRates: (params?: { fromCurrency?: string; date?: string }) =>
      apiClient.get<ApiResponse>('currency/rates', { params }),
    setRate: (data: { fromCurrency: string; toCurrency: string; rate: number; effectiveDate: string }) =>
      apiClient.post<ApiResponse>('currency/rates', data),
    convert: (params: { from: string; to: string; amount: number; date?: string }) =>
      apiClient.get<ApiResponse>('currency/convert', { params }),
  },

  // ── Enterprise Accounting ─────────────────────────────────────────
  enterprise: {
    // Fiscal Year Close
    fiscalYearStatus: (year: number) =>
      apiClient.get<ApiResponse>(`enterprise-accounting/fiscal-year/status`, { params: { year } }),
    closeFiscalYear: (data: { year: number; closingDate?: string }) =>
      apiClient.post<ApiResponse>('enterprise-accounting/fiscal-year/close', data),

    // Tax Engine
    listTaxes: (scope?: string) =>
      apiClient.get<ApiResponse>('enterprise-accounting/taxes', { params: scope ? { scope } : undefined }),
    computeTaxes: (data: { unitPrice: number; quantity: number; taxIds: string[] }) =>
      apiClient.post<ApiResponse>('enterprise-accounting/taxes/compute', data),
    productTaxes: (productId: string, params?: { customerId?: string; scope?: string }) =>
      apiClient.get<ApiResponse>(`enterprise-accounting/taxes/product/${productId}`, { params }),

    // GL Reconciliation
    unreconciledItems: (accountCode: string, params?: { startDate?: string; endDate?: string; limit?: number }) =>
      apiClient.get<ApiResponse>('enterprise-accounting/reconciliation/unreconciled', { params: { accountCode, ...params } }),
    reconcileEntries: (data: { entryIds: string[]; writeOffAmount?: number; writeOffAccountCode?: string }) =>
      apiClient.post<ApiResponse>('enterprise-accounting/reconciliation/reconcile', data),
    reconciliationSuggestions: (accountCode: string) =>
      apiClient.get<ApiResponse>('enterprise-accounting/reconciliation/suggestions', { params: { accountCode } }),
    getLockDates: () =>
      apiClient.get<ApiResponse>('enterprise-accounting/lock-dates'),
    setLockDates: (data: { advisorLockDate?: string | null; hardLockDate?: string | null }) =>
      apiClient.put<ApiResponse>('enterprise-accounting/lock-dates', data),

    // Currency Revaluation
    revaluationPreview: (date: string) =>
      apiClient.get<ApiResponse>('enterprise-accounting/revaluation/preview', { params: { date } }),
    executeRevaluation: (data: { revaluationDate: string; autoReverse?: boolean }) =>
      apiClient.post<ApiResponse>('enterprise-accounting/revaluation/execute', data),

    // GL Integrity Audit
    fullAudit: () =>
      apiClient.get<ApiResponse>('enterprise-accounting/integrity/full-audit'),

    // Aged Balances
    agedReceivables: (asOfDate?: string) =>
      apiClient.get<ApiResponse>('enterprise-accounting/aging/receivables', { params: asOfDate ? { asOfDate } : undefined }),
    agedPayables: (asOfDate?: string) =>
      apiClient.get<ApiResponse>('enterprise-accounting/aging/payables', { params: asOfDate ? { asOfDate } : undefined }),
  },

  // Generic HTTP methods for backward compatibility
  get: <T = ApiResponse>(url: string, config?: AxiosRequestConfig) => apiClient.get<T>(url, config),
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

/**
 * Extract structured error info from an Axios error.
 * Returns error_code and details if the backend sent a BusinessError.
 */
export function getStructuredError(error: unknown): {
  message: string;
  errorCode?: string;
  details?: Record<string, unknown>;
  status?: number;
} {
  if (axios.isAxiosError(error)) {
    const axErr = error as AxiosError<ApiResponse>;
    const data = axErr.response?.data;
    return {
      message: data?.error || axErr.message || 'An unknown error occurred',
      errorCode: data?.error_code,
      details: data?.details,
      status: axErr.response?.status,
    };
  }
  return { message: error instanceof Error ? error.message : 'An unknown error occurred' };
}

// Success Helper
export const getSuccessMessage = (response: AxiosResponse<ApiResponse>): string => {
  return response.data.message || 'Operation completed successfully';
};

// Alert Helper
export const hasAlerts = (response: AxiosResponse<ApiResponse>): boolean => {
  return !!(response.data.alerts && response.data.alerts.length > 0);
};

export default apiClient;
