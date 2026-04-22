import axios from 'axios';
import type {
  User,
  Product,
  Customer,
  PurchaseOrder,
  GoodsReceipt,
  Sale,
  InventoryBatch,
  StockMovement,
} from '../types/business';
import type {
  CreateProductInput,
  UpdateProductInput,
  CreateCustomerInput,
  UpdateCustomerInput,
  CreateSaleInput,
  SaleListFilters,
  CreatePurchaseOrderInput,
  CreateGoodsReceiptInput,
  InventoryAdjustmentInput,
  BatchAdjustmentInput,
} from '../types/inputs';

export const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Accounting API uses /api/accounting prefix - Vite proxy routes to C# server
export const accountingApi = axios.create({
  baseURL: API_BASE_URL + '/accounting',
  headers: {
    'Content-Type': 'application/json',
  },
});

// ── Token refresh helpers (shared with useTokenRefresh.ts storage keys) ──
const ACCESS_TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const TOKEN_EXPIRY_KEY = 'token_expiry';

function _getAccessToken(): string | null { return localStorage.getItem(ACCESS_TOKEN_KEY); }
function _getRefreshToken(): string | null { return localStorage.getItem(REFRESH_TOKEN_KEY); }
function _isTokenExpired(): boolean {
  const exp = localStorage.getItem(TOKEN_EXPIRY_KEY);
  if (!exp) return false; // no expiry recorded → trust existing token
  return Date.now() >= parseInt(exp, 10);
}
function _storeTokens(accessToken: string, refreshToken: string, expiresIn: number) {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  localStorage.setItem(TOKEN_EXPIRY_KEY, (Date.now() + (expiresIn - 60) * 1000).toString());
}
function _clearTokensAndRedirect() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
  localStorage.removeItem('user');
  localStorage.removeItem('rbac_permissions');
  sessionStorage.setItem('session_expired', '1');
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

let _refreshing = false;
let _refreshPromise: Promise<void> | null = null;

async function _doTokenRefresh(): Promise<void> {
  const rt = _getRefreshToken();
  if (!rt) throw new Error('No refresh token');
  const res = await axios.post(API_BASE_URL + '/auth/token/refresh', { refreshToken: rt });
  const d = res.data.data;
  _storeTokens(d.accessToken, d.refreshToken, d.expiresIn);
}

/**
 * Attach token-refresh-aware interceptors to an axios instance.
 * On 401 → retry once with refreshed token. Only redirect to /login
 * if refresh itself fails.
 */
function attachAuthInterceptors(instance: ReturnType<typeof axios.create>, opts?: { extraRequestHeaders?: (config: import('axios').InternalAxiosRequestConfig) => void }) {
  // ── Request: attach token, pre-emptively refresh if expired ──
  instance.interceptors.request.use(async (config) => {
    // Skip auth for login / refresh endpoints
    if (config.url?.includes('/login') || config.url?.includes('/token/refresh')) {
      return config;
    }

    // Pre-emptive refresh if token is about to expire
    if (_isTokenExpired() && _getRefreshToken() && navigator.onLine) {
      if (!_refreshing) {
        _refreshing = true;
        _refreshPromise = _doTokenRefresh().finally(() => { _refreshing = false; _refreshPromise = null; });
      }
      try { await _refreshPromise; } catch { /* handled in response interceptor */ }
    }

    const token = _getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    opts?.extraRequestHeaders?.(config);
    return config;
  });

  // ── Response: on 401, try refresh once then retry ──
  instance.interceptors.response.use(
    (response) => response,
    async (error) => {
      const original = error.config as import('axios').InternalAxiosRequestConfig & { _retry?: boolean };

      if (error.response?.status === 401 && !original?._retry) {
        if (!navigator.onLine) return Promise.reject(error);

        original._retry = true;
        const rt = _getRefreshToken();
        if (rt) {
          try {
            await _doTokenRefresh();
            const token = _getAccessToken();
            if (token && original.headers) {
              original.headers.Authorization = `Bearer ${token}`;
            }
            return instance(original);
          } catch {
            _clearTokensAndRedirect();
            return Promise.reject(error);
          }
        }
        // No refresh token at all → redirect
        _clearTokensAndRedirect();
      }

      if (error.response?.status === 403) {
        const msg = error.response.data?.error || 'You do not have permission to perform this action';
        window.dispatchEvent(new CustomEvent('app:forbidden', { detail: msg }));
      }
      return Promise.reject(error);
    }
  );
}

// Attach interceptors to both API instances
attachAuthInterceptors(api);
attachAuthInterceptors(accountingApi, {
  extraRequestHeaders: (config) => {
    config.headers['X-API-Key'] = 'your_shared_secret_key_here';
  },
});

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  error_code?: string;
  details?: Record<string, unknown>;
  message?: string;
}

// Auth API
export const authApi = {
  login: async (email: string, password: string) => {
    const response = await api.post<ApiResponse<{ user: User; token: string }>>('/auth/login', {
      email,
      password,
    });
    return response.data;
  },

  register: async (data: {
    email: string;
    password: string;
    fullName: string;
    role: 'ADMIN' | 'MANAGER' | 'CASHIER' | 'STAFF';
  }) => {
    const response = await api.post<ApiResponse<{ user: User; token: string }>>(
      '/auth/register',
      data
    );
    return response.data;
  },

  getProfile: async () => {
    const response = await api.get<ApiResponse<User>>('/auth/profile');
    return response.data;
  },
};

// Products API
export const productsApi = {
  list: async (page = 1, limit = 50) => {
    const response = await api.get<ApiResponse<Product[]>>(`/products?page=${page}&limit=${limit}`);
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get<ApiResponse<Product>>(`/products/${id}`);
    return response.data;
  },

  create: async (data: CreateProductInput) => {
    const response = await api.post<ApiResponse<Product>>('/products', data);
    return response.data;
  },

  update: async (id: string, data: UpdateProductInput) => {
    const response = await api.put<ApiResponse<Product>>(`/products/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    const response = await api.delete<ApiResponse<void>>(`/products/${id}`);
    return response.data;
  },
};

// Sales API
export const salesApi = {
  create: async (data: CreateSaleInput) => {
    const response = await api.post<ApiResponse<Sale>>('/sales', data);
    return response.data;
  },

  list: async (page = 1, limit = 50, filters?: SaleListFilters) => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit), ...filters });
    const response = await api.get<ApiResponse<Sale[]>>(`/sales?${params}`);
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get<ApiResponse<Sale>>(`/sales/${id}`);
    return response.data;
  },
};

// Inventory API
export const inventoryApi = {
  getBatches: async (productId: string) => {
    const response = await api.get<ApiResponse<InventoryBatch[]>>(
      `/inventory/batches?productId=${productId}`
    );
    return response.data;
  },

  getExpiringSoon: async (daysThreshold = 30) => {
    const response = await api.get<ApiResponse<InventoryBatch[]>>(
      `/inventory/batches/expiring?daysThreshold=${daysThreshold}`
    );
    return response.data;
  },

  getStockLevels: async () => {
    const response =
      await api.get<ApiResponse<Record<string, unknown>[]>>('/inventory/stock-levels');
    return response.data;
  },

  getReorderList: async () => {
    const response = await api.get<ApiResponse<Record<string, unknown>[]>>('/inventory/reorder');
    return response.data;
  },

  adjustInventory: async (data: InventoryAdjustmentInput) => {
    const response = await api.post<ApiResponse<StockMovement>>('/inventory/adjust', data);
    return response.data;
  },

  adjustBatch: async (data: BatchAdjustmentInput) => {
    const response = await api.post<ApiResponse<{ documentId: string; movementId: string; movementNumber: string; previousQuantity: number; newQuantity: number }>>('/inventory/adjust-batch', data);
    return response.data;
  },
};

// Customers API
export const customersApi = {
  list: async (page = 1, limit = 50) => {
    const response = await api.get<ApiResponse<Customer[]>>(
      `/customers?page=${page}&limit=${limit}`
    );
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get<ApiResponse<Customer>>(`/customers/${id}`);
    return response.data;
  },

  create: async (data: CreateCustomerInput) => {
    const response = await api.post<ApiResponse<Customer>>('/customers', data);
    return response.data;
  },

  update: async (id: string, data: UpdateCustomerInput) => {
    const response = await api.put<ApiResponse<Customer>>(`/customers/${id}`, data);
    return response.data;
  },
};

// Purchase Orders API
export const purchaseOrdersApi = {
  list: async (page = 1, limit = 50, filters?: SaleListFilters) => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit), ...filters });
    const response = await api.get<ApiResponse<PurchaseOrder[]>>(`/purchase-orders?${params}`);
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get<ApiResponse<PurchaseOrder>>(`/purchase-orders/${id}`);
    return response.data;
  },

  create: async (data: CreatePurchaseOrderInput) => {
    const response = await api.post<ApiResponse<PurchaseOrder>>('/purchase-orders', data);
    return response.data;
  },

  submit: async (id: string) => {
    const response = await api.post<ApiResponse<PurchaseOrder>>(`/purchase-orders/${id}/submit`);
    return response.data;
  },

  cancel: async (id: string) => {
    const response = await api.post<ApiResponse<PurchaseOrder>>(`/purchase-orders/${id}/cancel`);
    return response.data;
  },
};

// Goods Receipts API
export const goodsReceiptsApi = {
  list: async (page = 1, limit = 50, filters?: SaleListFilters) => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit), ...filters });
    const response = await api.get<ApiResponse<GoodsReceipt[]>>(`/goods-receipts?${params}`);
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get<ApiResponse<GoodsReceipt>>(`/goods-receipts/${id}`);
    return response.data;
  },

  create: async (data: CreateGoodsReceiptInput) => {
    const response = await api.post<ApiResponse<GoodsReceipt>>('/goods-receipts', data);
    return response.data;
  },

  finalize: async (id: string) => {
    const response = await api.post<ApiResponse<GoodsReceipt>>(`/goods-receipts/${id}/finalize`);
    return response.data;
  },
};
