// Multi-Tenant Zod Validation Schemas
// File: shared/zod/tenant.ts

import { z } from 'zod';

// ============================================================
// Enums
// ============================================================

export const TenantStatusSchema = z.enum(['ACTIVE', 'SUSPENDED', 'PROVISIONING', 'DEACTIVATED']);
export const TenantPlanSchema = z.enum(['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE']);

// ============================================================
// Create Tenant
// ============================================================

export const CreateTenantSchema = z.object({
  slug: z.string()
    .min(3, 'Slug must be at least 3 characters')
    .max(63, 'Slug must not exceed 63 characters')
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, 'Slug must be lowercase alphanumeric with hyphens, cannot start/end with hyphen'),
  name: z.string().min(2).max(255),
  plan: TenantPlanSchema.optional().default('FREE'),
  billingEmail: z.string().email(),
  country: z.string().length(2).optional().default('UG'),
  currency: z.string().length(3).optional().default('UGX'),
  timezone: z.string().optional().default('Africa/Kampala'),
  ownerEmail: z.string().email(),
  ownerPassword: z.string().min(8, 'Password must be at least 8 characters'),
  ownerFullName: z.string().min(2),
}).strict();

// ============================================================
// Update Tenant
// ============================================================

export const UpdateTenantSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  plan: TenantPlanSchema.optional(),
  billingEmail: z.string().email().optional(),
  country: z.string().length(2).optional(),
  currency: z.string().length(3).optional(),
  timezone: z.string().optional(),
  customDomain: z.string().max(255).optional(),
  edgeEnabled: z.boolean().optional(),
  maxUsers: z.number().int().min(1).optional(),
  maxProducts: z.number().int().min(1).optional(),
  maxLocations: z.number().int().min(1).optional(),
}).strict();

// ============================================================
// Sync Batch
// ============================================================

export const SyncItemSchema = z.object({
  entityType: z.string().min(1).max(50),
  entityId: z.string().uuid(),
  action: z.enum(['CREATE', 'UPDATE', 'DELETE']),
  data: z.record(z.unknown()),
  version: z.number().int().min(1),
  localTimestamp: z.string(),
});

export const SyncBatchSchema = z.object({
  edgeNodeId: z.string().min(1).max(100),
  tenantId: z.string().uuid(),
  items: z.array(SyncItemSchema).min(1).max(1000),
  batchId: z.string().uuid(),
  timestamp: z.string(),
}).strict();

// ============================================================
// Super Admin Login
// ============================================================

export const SuperAdminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
}).strict();

// ============================================================
// Tenant Status Update
// ============================================================

export const TenantStatusUpdateSchema = z.object({
  status: TenantStatusSchema,
  reason: z.string().max(500).optional(),
}).strict();

// ============================================================
// Query Params
// ============================================================

export const TenantListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  status: TenantStatusSchema.optional(),
  plan: TenantPlanSchema.optional(),
  search: z.string().max(100).optional(),
});

export type CreateTenantInput = z.infer<typeof CreateTenantSchema>;
export type UpdateTenantInput = z.infer<typeof UpdateTenantSchema>;
export type SyncBatchInput = z.infer<typeof SyncBatchSchema>;
export type TenantListQuery = z.infer<typeof TenantListQuerySchema>;
