// Platform API Service — Super Admin Panel
// Separate from tenant API to use platform-scoped JWT tokens

import axios from 'axios';
import type { AxiosInstance } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Types
export interface PlatformAdmin {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  plan: 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
  status: 'ACTIVE' | 'SUSPENDED' | 'PROVISIONING' | 'DEACTIVATED';
  databaseName: string;
  databaseHost: string;
  databasePort: number;
  maxUsers: number;
  maxProducts: number;
  maxLocations: number;
  storageLimitMb: number;
  billingEmail?: string;
  ownerUserId?: string;
  country: string;
  currency: string;
  timezone: string;
  customDomain?: string;
  edgeEnabled: boolean;
  lastSyncAt?: string;
  syncStatus: string;
  createdAt: string;
  updatedAt: string;
  deactivatedAt?: string;
}

export interface TenantUsage {
  tenantId: string;
  userCount: number;
  productCount: number;
  locationCount: number;
  storageUsedMb: number;
  salesThisMonth: number;
}

export interface BillingInfo {
  tenantId: string;
  plan: string;
  status: 'ACTIVE' | 'TRIALING' | 'PAST_DUE' | 'CANCELLED';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  amount: number;
  currency: string;
  nextBillingDate: string;
  cancelAtPeriodEnd: boolean;
}

export interface LimitCheck {
  withinLimits: boolean;
  usage: Record<string, { current: number; max: number; exceeded: boolean }>;
}

export interface BillingEvent {
  eventType: string;
  totalQuantity: number;
}

export interface AuditLogEntry {
  id: string;
  tenantId: string;
  action: string;
  actor: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

export interface DashboardSummary {
  tenants: {
    total: number;
    byStatus: Record<string, number>;
    byPlan: Record<string, number>;
  };
  activePools: number;
  recentTenants: Array<{
    id: string;
    slug: string;
    name: string;
    plan: string;
    status: string;
    createdAt: string;
  }>;
}

export interface PoolInfo {
  tenantId: string;
  slug: string;
  lastUsed: number;
  connectionCount: number;
}

export interface PlatformHealthData {
  status: string;
  activePools: number;
  pools: PoolInfo[];
  timestamp: string;
}

export interface PlatformApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  pagination?: {
    page: number;
    totalPages: number;
    total: number;
  };
}

// Platform-scoped axios instance (separate token from tenant auth)
const platformClient: AxiosInstance = axios.create({
  baseURL: `${API_BASE_URL}/platform`,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach platform token from localStorage
platformClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('platform_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 → redirect to platform login
platformClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const hasToken = localStorage.getItem('platform_token');
      if (hasToken) {
        localStorage.removeItem('platform_token');
        localStorage.removeItem('platform_admin');
        if (!window.location.pathname.startsWith('/platform/login')) {
          window.location.href = '/platform/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

// API methods
export const platformApi = {
  // Auth
  login: (email: string, password: string) =>
    platformClient.post<PlatformApiResponse<{ token: string; admin: PlatformAdmin }>>('/auth/login', { email, password }),

  // Health
  health: () =>
    platformClient.get<PlatformApiResponse<PlatformHealthData>>('/health'),

  // Dashboard
  dashboard: () =>
    platformClient.get<PlatformApiResponse<DashboardSummary>>('/dashboard'),

  // Tenants
  tenants: {
    list: (params?: { page?: number; limit?: number; status?: string; plan?: string; search?: string }) =>
      platformClient.get<PlatformApiResponse<Tenant[]>>('/tenants', { params }),
    get: (id: string) =>
      platformClient.get<PlatformApiResponse<Tenant>>(`/tenants/${id}`),
    create: (data: {
      name: string;
      slug: string;
      plan?: string;
      billingEmail: string;
      ownerEmail: string;
      ownerPassword: string;
      ownerFullName: string;
      country?: string;
      currency?: string;
      timezone?: string;
    }) =>
      platformClient.post<PlatformApiResponse<Tenant>>('/tenants', data),
    update: (id: string, data: {
      name?: string;
      plan?: string;
      billingEmail?: string;
      country?: string;
      currency?: string;
      timezone?: string;
      customDomain?: string;
      edgeEnabled?: boolean;
      maxUsers?: number;
      maxProducts?: number;
      maxLocations?: number;
    }) =>
      platformClient.put<PlatformApiResponse<Tenant>>(`/tenants/${id}`, data),
    updateStatus: (id: string, status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED', reason?: string) =>
      platformClient.patch<PlatformApiResponse<Tenant>>(`/tenants/${id}/status`, { status, reason }),
    getUsage: (id: string) =>
      platformClient.get<PlatformApiResponse<TenantUsage>>(`/tenants/${id}/usage`),
    getAuditLog: (id: string, limit?: number) =>
      platformClient.get<PlatformApiResponse<AuditLogEntry[]>>(`/tenants/${id}/audit`, { params: { limit } }),
    getBillingEvents: (id: string, period?: string) =>
      platformClient.get<PlatformApiResponse<BillingEvent[]>>(`/tenants/${id}/billing/events`, { params: { period } }),
    getBilling: (id: string) =>
      platformClient.get<PlatformApiResponse<BillingInfo>>(`/tenants/${id}/billing`),
    changePlan: (id: string, plan: string) =>
      platformClient.put<PlatformApiResponse<void>>(`/tenants/${id}/plan`, { plan }),
    checkLimits: (id: string) =>
      platformClient.get<PlatformApiResponse<LimitCheck>>(`/tenants/${id}/limits`),
  },

  // Super Admins
  admins: {
    list: () =>
      platformClient.get<PlatformApiResponse<PlatformAdmin[]>>('/admins'),
    get: (id: string) =>
      platformClient.get<PlatformApiResponse<PlatformAdmin>>(`/admins/${id}`),
    create: (data: { email: string; password: string; fullName: string }) =>
      platformClient.post<PlatformApiResponse<PlatformAdmin>>('/admins', data),
    update: (id: string, data: { email?: string; fullName?: string; isActive?: boolean; password?: string }) =>
      platformClient.put<PlatformApiResponse<PlatformAdmin>>(`/admins/${id}`, data),
    delete: (id: string) =>
      platformClient.delete<PlatformApiResponse<void>>(`/admins/${id}`),
  },
};
