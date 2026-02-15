import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5173/api';

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
    if (error.response?.status === 401) {
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
    if (error.response?.status === 401) {
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
  message?: string;
}

// Auth API
export const authApi = {
  login: async (email: string, password: string) => {
    const response = await api.post<ApiResponse<{ user: any; token: string }>>('/auth/login', {
      email,
      password,
    });
    return response.data;
  },

  register: async (data: { email: string; password: string; fullName: string; role: string }) => {
    const response = await api.post<ApiResponse<{ user: any; token: string }>>('/auth/register', data);
    return response.data;
  },

  getProfile: async () => {
    const response = await api.get<ApiResponse<any>>('/auth/profile');
    return response.data;
  },
};

// Products API
export const productsApi = {
  list: async (page = 1, limit = 50) => {
    const response = await api.get<ApiResponse<any[]>>(`/products?page=${page}&limit=${limit}`);
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get<ApiResponse<any>>(`/products/${id}`);
    return response.data;
  },

  create: async (data: any) => {
    const response = await api.post<ApiResponse<any>>('/products', data);
    return response.data;
  },

  update: async (id: string, data: any) => {
    const response = await api.put<ApiResponse<any>>(`/products/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    const response = await api.delete<ApiResponse<void>>(`/products/${id}`);
    return response.data;
  },
};

// Sales API
export const salesApi = {
  create: async (data: any) => {
    const response = await api.post<ApiResponse<any>>('/sales', data);
    return response.data;
  },

  list: async (page = 1, limit = 50, filters?: any) => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit), ...filters });
    const response = await api.get<ApiResponse<any[]>>(`/sales?${params}`);
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get<ApiResponse<any>>(`/sales/${id}`);
    return response.data;
  },
};

// Inventory API
export const inventoryApi = {
  getBatches: async (productId: string) => {
    const response = await api.get<ApiResponse<any[]>>(`/inventory/batches?productId=${productId}`);
    return response.data;
  },

  getExpiringSoon: async (daysThreshold = 30) => {
    const response = await api.get<ApiResponse<any[]>>(`/inventory/batches/expiring?daysThreshold=${daysThreshold}`);
    return response.data;
  },

  getStockLevels: async () => {
    const response = await api.get<ApiResponse<any[]>>('/inventory/stock-levels');
    return response.data;
  },

  getReorderList: async () => {
    const response = await api.get<ApiResponse<any[]>>('/inventory/reorder');
    return response.data;
  },

  adjustInventory: async (data: any) => {
    const response = await api.post<ApiResponse<any>>('/inventory/adjust', data);
    return response.data;
  },
};

// Customers API
export const customersApi = {
  list: async (page = 1, limit = 50) => {
    const response = await api.get<ApiResponse<any[]>>(`/customers?page=${page}&limit=${limit}`);
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get<ApiResponse<any>>(`/customers/${id}`);
    return response.data;
  },

  create: async (data: any) => {
    const response = await api.post<ApiResponse<any>>('/customers', data);
    return response.data;
  },

  update: async (id: string, data: any) => {
    const response = await api.put<ApiResponse<any>>(`/customers/${id}`, data);
    return response.data;
  },
};

// Purchase Orders API
export const purchaseOrdersApi = {
  list: async (page = 1, limit = 50, filters?: any) => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit), ...filters });
    const response = await api.get<ApiResponse<any[]>>(`/purchase-orders?${params}`);
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get<ApiResponse<any>>(`/purchase-orders/${id}`);
    return response.data;
  },

  create: async (data: any) => {
    const response = await api.post<ApiResponse<any>>('/purchase-orders', data);
    return response.data;
  },

  submit: async (id: string) => {
    const response = await api.post<ApiResponse<any>>(`/purchase-orders/${id}/submit`);
    return response.data;
  },

  cancel: async (id: string) => {
    const response = await api.post<ApiResponse<any>>(`/purchase-orders/${id}/cancel`);
    return response.data;
  },
};

// Goods Receipts API
export const goodsReceiptsApi = {
  list: async (page = 1, limit = 50, filters?: any) => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit), ...filters });
    const response = await api.get<ApiResponse<any[]>>(`/goods-receipts?${params}`);
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get<ApiResponse<any>>(`/goods-receipts/${id}`);
    return response.data;
  },

  create: async (data: any) => {
    const response = await api.post<ApiResponse<any>>('/goods-receipts', data);
    return response.data;
  },

  finalize: async (id: string) => {
    const response = await api.post<ApiResponse<any>>(`/goods-receipts/${id}/finalize`);
    return response.data;
  },
};
