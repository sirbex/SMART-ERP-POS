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
  billingEmail: z.string().email().max(255),
  country: z.string().length(2).regex(/^[A-Z]{2}$/, 'Country must be a 2-letter ISO code').optional().default('UG'),
  currency: z.string().length(3).regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter ISO code').optional().default('UGX'),
  timezone: z.string().max(50).regex(/^[a-zA-Z_/]+$/, 'Invalid timezone format').optional().default('Africa/Kampala'),
  ownerEmail: z.string().email().max(255),
  ownerPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one lowercase letter, one uppercase letter, and one number'
    ),
  ownerFullName: z.string().min(2).max(255),
}).strict();

// ============================================================
// Update Tenant
// ============================================================

export const UpdateTenantSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  plan: TenantPlanSchema.optional(),
  billingEmail: z.string().email().max(255).optional(),
  country: z.string().length(2).regex(/^[A-Z]{2}$/, 'Country must be a 2-letter ISO code').optional(),
  currency: z.string().length(3).regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter ISO code').optional(),
  timezone: z.string().max(50).regex(/^[a-zA-Z_/]+$/, 'Invalid timezone format').optional(),
  customDomain: z.string().max(255).regex(/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/, 'Invalid domain format').optional().or(z.literal('')),
  edgeEnabled: z.boolean().optional(),
  maxUsers: z.number().int().min(1).max(9999).optional(),
  maxProducts: z.number().int().min(1).max(9999999).optional(),
  maxLocations: z.number().int().min(1).max(9999).optional(),
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
  email: z.string().email().max(255),
  password: z.string().min(1).max(128),
}).strict();

// ============================================================
// Super Admin Create
// ============================================================

export const CreateSuperAdminSchema = z.object({
  email: z.string().email().max(255),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one lowercase letter, one uppercase letter, and one number'
    ),
  fullName: z.string().min(2).max(255).regex(/^[a-zA-Z\s'\-]+$/, 'Full name must contain only letters, spaces, hyphens, and apostrophes'),
}).strict();

// ============================================================
// Super Admin Update
// ============================================================

export const UpdateSuperAdminSchema = z.object({
  email: z.string().email().max(255).optional(),
  fullName: z.string().min(2).max(255).regex(/^[a-zA-Z\s'\-]+$/, 'Full name must contain only letters, spaces, hyphens, and apostrophes').optional(),
  isActive: z.boolean().optional(),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one lowercase letter, one uppercase letter, and one number'
    )
    .optional(),
}).strict();

// ============================================================
// Plan Change
// ============================================================

export const ChangePlanSchema = z.object({
  plan: TenantPlanSchema,
}).strict();

// ============================================================
// Billing Period Query
// ============================================================

export const BillingPeriodSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Period must be YYYY-MM-DD format').optional(),
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
export type CreateSuperAdminInput = z.infer<typeof CreateSuperAdminSchema>;
export type UpdateSuperAdminInput = z.infer<typeof UpdateSuperAdminSchema>;
export type ChangePlanInput = z.infer<typeof ChangePlanSchema>;
