// Admin Action Validation Schema
// Schema for audit logging of administrative actions

import { z } from 'zod';

/**
 * Admin action types
 */
export const AdminActionTypeSchema = z.enum([
  'USER_CREATE',
  'USER_UPDATE',
  'USER_DELETE',
  'USER_ROLE_CHANGE',
  'USER_STATUS_CHANGE',
  'SETTINGS_UPDATE',
  'DATA_EXPORT',
  'DATA_IMPORT',
  'DATA_DELETE',
  'PERMISSION_GRANT',
  'PERMISSION_REVOKE',
  'SYSTEM_CONFIG',
  'BACKUP_CREATE',
  'BACKUP_RESTORE',
  'DATABASE_MIGRATION',
  'AUDIT_LOG_VIEW',
  'SECURITY_SETTING',
  'OTHER',
]);

export type AdminActionType = z.infer<typeof AdminActionTypeSchema>;

/**
 * Action status enum
 */
export const ActionStatusSchema = z.enum(['SUCCESS', 'FAILURE', 'PENDING', 'CANCELLED']);

export type ActionStatus = z.infer<typeof ActionStatusSchema>;

/**
 * Action severity level
 */
export const ActionSeveritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

export type ActionSeverity = z.infer<typeof ActionSeveritySchema>;

/**
 * Admin action audit log schema
 */
export const AdminActionSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    username: z.string().min(1).max(100),
    actionType: AdminActionTypeSchema,
    actionDescription: z.string().min(1).max(1000),
    targetResource: z.string().max(255).optional().nullable(), // e.g., "users", "settings", "products"
    targetResourceId: z.string().max(255).optional().nullable(), // ID of affected resource
    status: ActionStatusSchema,
    severity: ActionSeveritySchema.default('MEDIUM'),
    ipAddress: z.string().ip().optional().nullable(),
    userAgent: z.string().max(500).optional().nullable(),
    metadata: z.record(z.any()).optional().nullable(), // Additional context as JSON
    errorMessage: z.string().max(1000).optional().nullable(),
    changedFields: z.array(z.string()).optional().nullable(), // List of fields that changed
    oldValues: z.record(z.any()).optional().nullable(), // Previous values (for updates)
    newValues: z.record(z.any()).optional().nullable(), // New values (for updates)
    timestamp: z.string().datetime(),
  })
  .strict();

export type AdminAction = z.infer<typeof AdminActionSchema>;

/**
 * Create admin action schema (for logging)
 */
export const CreateAdminActionSchema = z
  .object({
    userId: z.string().uuid(),
    username: z.string().min(1).max(100),
    actionType: AdminActionTypeSchema,
    actionDescription: z.string().min(1).max(1000),
    targetResource: z.string().max(255).optional().nullable(),
    targetResourceId: z.string().max(255).optional().nullable(),
    status: ActionStatusSchema.default('SUCCESS'),
    severity: ActionSeveritySchema.default('MEDIUM'),
    ipAddress: z.string().ip().optional().nullable(),
    userAgent: z.string().max(500).optional().nullable(),
    metadata: z.record(z.any()).optional().nullable(),
    errorMessage: z.string().max(1000).optional().nullable(),
    changedFields: z.array(z.string()).optional().nullable(),
    oldValues: z.record(z.any()).optional().nullable(),
    newValues: z.record(z.any()).optional().nullable(),
  })
  .strict();

export type CreateAdminActionInput = z.infer<typeof CreateAdminActionSchema>;

/**
 * Admin action query filters
 */
export const AdminActionFiltersSchema = z.object({
  userId: z.string().uuid().optional(),
  actionType: AdminActionTypeSchema.optional(),
  status: ActionStatusSchema.optional(),
  severity: ActionSeveritySchema.optional(),
  targetResource: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  search: z.string().optional(), // Search in description
});

export type AdminActionFilters = z.infer<typeof AdminActionFiltersSchema>;

/**
 * Admin action summary (for dashboard analytics)
 */
export const AdminActionSummarySchema = z.object({
  totalActions: z.number().int().nonnegative(),
  successCount: z.number().int().nonnegative(),
  failureCount: z.number().int().nonnegative(),
  criticalActions: z.number().int().nonnegative(),
  recentActions: z.array(AdminActionSchema).max(10),
  actionsByType: z.record(AdminActionTypeSchema, z.number().int().nonnegative()),
  actionsByUser: z.array(
    z.object({
      userId: z.string().uuid(),
      username: z.string(),
      actionCount: z.number().int().nonnegative(),
    })
  ),
});

export type AdminActionSummary = z.infer<typeof AdminActionSummarySchema>;
