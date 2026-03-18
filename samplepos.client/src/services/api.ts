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
} from '../types/inputs';

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

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

// Add auth token to requests for main API
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Add auth token and API key to requests for accounting API
accountingApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Add API key for C# Accounting API
  config.headers['X-API-Key'] = 'your_shared_secret_key_here';

  return config;
});

// Handle auth errors for main API
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && navigator.onLine) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Handle auth errors for accounting API
accountingApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && navigator.onLine) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

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
