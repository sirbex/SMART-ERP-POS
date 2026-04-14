// Multi-Tenant SaaS Types
// File: shared/types/tenant.ts
// Used across backend, frontend, and edge nodes

export type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'PROVISIONING' | 'DEACTIVATED';
export type TenantPlan = 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
export type SyncDirection = 'UP' | 'DOWN';
export type SyncStatus = 'PENDING' | 'SYNCED' | 'CONFLICT' | 'FAILED';
export type SyncEntityStatus = 'IDLE' | 'SYNCING' | 'ERROR' | 'OFFLINE';

// ============================================================
// Tenant Core
// ============================================================

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  databaseName: string;
  databaseHost: string;
  databasePort: number;
  status: TenantStatus;
  plan: TenantPlan;

  // Billing
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  billingEmail?: string;

  // Limits
  maxUsers: number;
  maxProducts: number;
  maxLocations: number;
  storageLimitMb: number;

  // Metadata
  ownerUserId?: string;
  country: string;
  currency: string;
  timezone: string;
  customDomain?: string;

  // PWA Branding
  pwaName?: string;
  pwaShortName?: string;
  pwaThemeColor?: string;
  pwaBackgroundColor?: string;
  pwaIcon192Path?: string;
  pwaIcon512Path?: string;

  // Edge sync
  edgeEnabled: boolean;
  lastSyncAt?: string;
  syncStatus: SyncEntityStatus;

  // Audit
  createdAt: string;
  updatedAt: string;
  deactivatedAt?: string;
}

export interface TenantDbRow {
  id: string;
  slug: string;
  name: string;
  database_name: string;
  database_host: string;
  database_port: number;
  status: string;
  plan: string;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  billing_email?: string;
  max_users: number;
  max_products: number;
  max_locations: number;
  storage_limit_mb: number;
  owner_user_id?: string;
  country: string;
  currency: string;
  timezone: string;
  custom_domain?: string;
  pwa_name?: string;
  pwa_short_name?: string;
  pwa_theme_color?: string;
  pwa_background_color?: string;
  pwa_icon_192_path?: string;
  pwa_icon_512_path?: string;
  edge_enabled: boolean;
  last_sync_at?: string;
  sync_status: string;
  created_at: string;
  updated_at: string;
  deactivated_at?: string;
}

export function normalizeTenant(row: TenantDbRow): Tenant {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    databaseName: row.database_name,
    databaseHost: row.database_host,
    databasePort: row.database_port,
    status: row.status as TenantStatus,
    plan: row.plan as TenantPlan,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    billingEmail: row.billing_email,
    maxUsers: row.max_users,
    maxProducts: row.max_products,
    maxLocations: row.max_locations,
    storageLimitMb: row.storage_limit_mb,
    ownerUserId: row.owner_user_id,
    country: row.country,
    currency: row.currency,
    timezone: row.timezone,
    customDomain: row.custom_domain,
    pwaName: row.pwa_name,
    pwaShortName: row.pwa_short_name,
    pwaThemeColor: row.pwa_theme_color,
    pwaBackgroundColor: row.pwa_background_color,
    pwaIcon192Path: row.pwa_icon_192_path,
    pwaIcon512Path: row.pwa_icon_512_path,
    edgeEnabled: row.edge_enabled,
    lastSyncAt: row.last_sync_at,
    syncStatus: row.sync_status as SyncEntityStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deactivatedAt: row.deactivated_at,
  };
}

// ============================================================
// Plan Limits
// ============================================================

export const PLAN_LIMITS: Record<TenantPlan, {
  maxUsers: number;
  maxProducts: number;
  maxLocations: number;
  storageLimitMb: number;
  features: string[];
}> = {
  FREE: {
    maxUsers: 2,
    maxProducts: 100,
    maxLocations: 1,
    storageLimitMb: 100,
    features: ['pos', 'customers', 'basic_reports'],
  },
  STARTER: {
    maxUsers: 5,
    maxProducts: 1000,
    maxLocations: 2,
    storageLimitMb: 500,
    features: ['pos', 'inventory', 'customers', 'basic_reports', 'reports', 'invoices', 'expenses', 'hr'],
  },
  PROFESSIONAL: {
    maxUsers: 20,
    maxProducts: 10000,
    maxLocations: 5,
    storageLimitMb: 2000,
    features: ['pos', 'inventory', 'customers', 'basic_reports', 'reports', 'invoices', 'expenses', 'hr', 'accounting', 'purchase_orders', 'edge_sync'],
  },
  ENTERPRISE: {
    maxUsers: 999,
    maxProducts: 999999,
    maxLocations: 999,
    storageLimitMb: 50000,
    features: ['pos', 'inventory', 'customers', 'basic_reports', 'reports', 'invoices', 'expenses', 'hr', 'accounting', 'purchase_orders', 'edge_sync', 'api_access', 'custom_domain', 'priority_support'],
  },
};

// ============================================================
// API Request/Response Types
// ============================================================

export interface CreateTenantRequest {
  slug: string;
  name: string;
  plan?: TenantPlan;
  billingEmail: string;
  country?: string;
  currency?: string;
  timezone?: string;
  ownerEmail: string;
  ownerPassword: string;
  ownerFullName: string;
}

export interface UpdateTenantRequest {
  name?: string;
  plan?: TenantPlan;
  billingEmail?: string;
  country?: string;
  currency?: string;
  timezone?: string;
  customDomain?: string;
  edgeEnabled?: boolean;
  maxUsers?: number;
  maxProducts?: number;
  maxLocations?: number;
}

export interface TenantUsage {
  tenantId: string;
  userCount: number;
  productCount: number;
  locationCount: number;
  storageUsedMb: number;
  salesThisMonth: number;
  lastActivityAt?: string;
}

// ============================================================
// Sync Types
// ============================================================

export interface SyncBatch {
  edgeNodeId: string;
  tenantId: string;
  items: SyncItem[];
  batchId: string;
  timestamp: string;
}

export interface SyncItem {
  entityType: string;
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  data: Record<string, unknown>;
  version: number;
  localTimestamp: string;
}

export interface SyncResult {
  batchId: string;
  processed: number;
  succeeded: number;
  conflicts: number;
  failed: number;
  items: SyncItemResult[];
}

export interface SyncItemResult {
  entityType: string;
  entityId: string;
  status: 'SYNCED' | 'CONFLICT' | 'FAILED';
  serverVersion?: number;
  error?: string;
}

export interface SyncConflict {
  entityType: string;
  entityId: string;
  localData: Record<string, unknown>;
  serverData: Record<string, unknown>;
  localTimestamp: string;
  serverTimestamp: string;
  resolution?: 'LOCAL_WINS' | 'SERVER_WINS' | 'MERGED' | 'MANUAL';
}

// ============================================================
// Billing Types
// ============================================================

export interface BillingInfo {
  tenantId: string;
  plan: TenantPlan;
  status: 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'TRIALING';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  amount: number;
  currency: string;
  nextBillingDate?: string;
  cancelAtPeriodEnd: boolean;
}

export interface BillingEvent {
  id: string;
  tenantId: string;
  eventType: string;
  quantity: number;
  metadata?: Record<string, unknown>;
  billingPeriod: string;
  createdAt: string;
}

// ============================================================
// Super Admin Types
// ============================================================

export interface SuperAdmin {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

export interface SuperAdminLoginRequest {
  email: string;
  password: string;
}

export interface SuperAdminLoginResponse {
  token: string;
  admin: SuperAdmin;
}
