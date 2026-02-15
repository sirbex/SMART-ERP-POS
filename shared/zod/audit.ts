/**
 * Zod Validation Schemas for Audit Trail System
 * Created: November 23, 2025
 * Purpose: Type-safe validation for audit log entries
 */

import { z } from 'zod';

// =====================================================
// ENUMS
// =====================================================

export const EntityTypeEnum = z.enum([
  'SALE',
  'INVOICE',
  'PAYMENT',
  'PRODUCT',
  'CUSTOMER',
  'SUPPLIER',
  'USER',
  'PURCHASE_ORDER',
  'GOODS_RECEIPT',
  'INVENTORY_ADJUSTMENT',
  'BATCH',
  'PRICING',
  'SETTINGS',
  'REPORT',
  'SYSTEM',
]);

export const ActionEnum = z.enum([
  'CREATE',
  'UPDATE',
  'DELETE',
  'VOID',
  'CANCEL',
  'REFUND',
  'EXCHANGE',
  'LOGIN',
  'LOGOUT',
  'LOGIN_FAILED',
  'PASSWORD_CHANGE',
  'PERMISSION_CHANGE',
  'APPROVE',
  'REJECT',
  'RESTORE',
  'ARCHIVE',
  'EXPORT',
  'IMPORT',
  'OPEN_DRAWER',
  'CLOSE_SHIFT',
  'ADJUST_INVENTORY',
  'PRICE_CHANGE',
]);

export const SeverityEnum = z.enum(['INFO', 'WARNING', 'ERROR', 'CRITICAL']);

export const CategoryEnum = z.enum([
  'FINANCIAL',
  'INVENTORY',
  'ACCESS',
  'CONFIGURATION',
  'SYSTEM',
  'SECURITY',
  'COMPLIANCE',
]);

export const LogoutReasonEnum = z.enum(['MANUAL', 'TIMEOUT', 'FORCED', 'ERROR']);

export const DeviceTypeEnum = z.enum(['DESKTOP', 'MOBILE', 'TABLET', 'POS_TERMINAL', 'UNKNOWN']);

// =====================================================
// AUDIT LOG SCHEMAS
// =====================================================

/**
 * Complete audit log entry (database record)
 */
export const AuditLogSchema = z.object({
  id: z.string().uuid(),

  // Entity information
  entityType: EntityTypeEnum,
  entityId: z.string().uuid().nullable(),
  entityNumber: z.string().max(100).nullable(),

  // Action details
  action: ActionEnum,
  actionDetails: z.string().nullable(),

  // User information
  userId: z.string().uuid(),
  userName: z.string().max(255).nullable(),
  userRole: z.string().max(50).nullable(),

  // Change tracking
  oldValues: z.record(z.any()).nullable(),
  newValues: z.record(z.any()).nullable(),
  changes: z.record(z.any()).nullable(),

  // Context
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  sessionId: z.string().uuid().nullable(),
  requestId: z.string().uuid().nullable(),

  // Metadata
  severity: SeverityEnum,
  category: CategoryEnum.nullable(),
  tags: z.array(z.string()).nullable(),

  // Timestamps
  createdAt: z.string(), // ISO 8601 timestamp

  // Additional
  notes: z.string().nullable(),
  referenceNumber: z.string().max(100).nullable(),
}).strict();

/**
 * Schema for creating a new audit entry (input validation)
 */
export const CreateAuditEntrySchema = z.object({
  // Required fields
  entityType: EntityTypeEnum,
  action: ActionEnum,
  userId: z.string().uuid(),

  // Entity identification (at least one required)
  entityId: z.string().uuid().optional(),
  entityNumber: z.string().max(100).optional(),

  // Action details
  actionDetails: z.string().max(1000).optional(),

  // User information (for denormalization)
  userName: z.string().max(255).optional(),
  userRole: z.string().max(50).optional(),

  // Change tracking
  oldValues: z.record(z.any()).optional(),
  newValues: z.record(z.any()).optional(),
  changes: z.record(z.any()).optional(),

  // Context
  ipAddress: z.string().ip().optional(),
  userAgent: z.string().max(500).optional(),
  sessionId: z.string().uuid().optional(),
  requestId: z.string().uuid().optional(),

  // Metadata
  severity: SeverityEnum.optional().default('INFO'),
  category: CategoryEnum.optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),

  // Additional
  notes: z.string().max(2000).optional(),
  referenceNumber: z.string().max(100).optional(),
})
  .strict()
  .refine(
    (data) => data.entityId || data.entityNumber,
    {
      message: 'Either entityId or entityNumber must be provided',
      path: ['entityId'],
    }
  );

/**
 * Schema for querying audit logs (filter parameters)
 */
export const AuditLogQuerySchema = z.object({
  // Filters
  entityType: EntityTypeEnum.optional(),
  entityId: z.string().uuid().optional(),
  entityNumber: z.string().max(100).optional(),
  action: ActionEnum.optional(),
  userId: z.string().uuid().optional(),
  severity: SeverityEnum.optional(),
  category: CategoryEnum.optional(),
  sessionId: z.string().uuid().optional(),

  // Date range
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),

  // Search
  searchTerm: z.string().max(255).optional(),
  tags: z.array(z.string()).optional(),

  // Pagination
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),

  // Sorting
  sortBy: z.enum(['createdAt', 'entityType', 'action', 'severity']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
}).strict();

// =====================================================
// USER SESSION SCHEMAS
// =====================================================

/**
 * User session record (database)
 */
export const UserSessionSchema = z.object({
  id: z.string().uuid(),

  // User information
  userId: z.string().uuid(),
  userName: z.string().max(255),
  userRole: z.string().max(50),

  // Session timing
  loginAt: z.string(), // ISO 8601
  logoutAt: z.string().nullable(),
  sessionDurationSeconds: z.number().int().nonnegative().nullable(),

  // Device/location
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  deviceType: DeviceTypeEnum,
  terminalId: z.string().max(50).nullable(),

  // Session state
  isActive: z.boolean(),
  logoutReason: LogoutReasonEnum.nullable(),

  // Activity tracking
  lastActivityAt: z.string(), // ISO 8601
  actionsCount: z.number().int().nonnegative(),

  // Timestamps
  createdAt: z.string(),
  updatedAt: z.string(),
}).strict();

/**
 * Schema for creating a new session (login)
 */
export const CreateSessionSchema = z.object({
  userId: z.string().uuid(),
  userName: z.string().max(255),
  userRole: z.string().max(50),

  // Optional context
  ipAddress: z.string().ip().optional(),
  userAgent: z.string().max(500).optional(),
  deviceType: DeviceTypeEnum.optional().default('UNKNOWN'),
  terminalId: z.string().max(50).optional(),
}).strict();

/**
 * Schema for ending a session (logout)
 */
export const EndSessionSchema = z.object({
  sessionId: z.string().uuid(),
  logoutReason: LogoutReasonEnum.optional().default('MANUAL'),
}).strict();

// =====================================================
// FAILED TRANSACTION SCHEMAS
// =====================================================

export const TransactionTypeEnum = z.enum([
  'SALE',
  'PAYMENT',
  'REFUND',
  'RETURN',
  'EXCHANGE',
  'INVOICE_CREATION',
  'INVOICE_PAYMENT',
  'VOID',
  'INVENTORY_ADJUSTMENT',
  'PURCHASE_ORDER',
  'GOODS_RECEIPT',
]);

/**
 * Failed transaction record (database)
 */
export const FailedTransactionSchema = z.object({
  id: z.string().uuid(),

  // Transaction details
  transactionType: TransactionTypeEnum,
  attemptedData: z.record(z.any()),

  // Error information
  errorType: z.string().max(100),
  errorMessage: z.string(),
  errorStack: z.string().nullable(),

  // User context
  userId: z.string().uuid().nullable(),
  userName: z.string().max(255).nullable(),
  sessionId: z.string().uuid().nullable(),

  // Request context
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  requestId: z.string().uuid().nullable(),

  // Metadata
  createdAt: z.string(), // ISO 8601
  severity: SeverityEnum,

  // Resolution
  notes: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  resolvedById: z.string().uuid().nullable(),
  resolutionNotes: z.string().nullable(),
}).strict();

/**
 * Schema for recording a failed transaction
 */
export const RecordFailedTransactionSchema = z.object({
  transactionType: TransactionTypeEnum,
  attemptedData: z.record(z.any()),

  // Error details
  errorType: z.string().max(100),
  errorMessage: z.string().max(2000),
  errorStack: z.string().optional(),

  // User context
  userId: z.string().uuid().optional(),
  userName: z.string().max(255).optional(),
  sessionId: z.string().uuid().optional(),

  // Request context
  ipAddress: z.string().ip().optional(),
  userAgent: z.string().max(500).optional(),
  requestId: z.string().uuid().optional(),

  // Metadata
  severity: SeverityEnum.optional().default('ERROR'),
  notes: z.string().max(2000).optional(),
}).strict();

// =====================================================
// TYPE EXPORTS (for TypeScript inference)
// =====================================================

export type EntityType = z.infer<typeof EntityTypeEnum>;
export type Action = z.infer<typeof ActionEnum>;
export type Severity = z.infer<typeof SeverityEnum>;
export type Category = z.infer<typeof CategoryEnum>;
export type LogoutReason = z.infer<typeof LogoutReasonEnum>;
export type DeviceType = z.infer<typeof DeviceTypeEnum>;
export type TransactionType = z.infer<typeof TransactionTypeEnum>;

export type AuditLog = z.infer<typeof AuditLogSchema>;
export type CreateAuditEntry = z.infer<typeof CreateAuditEntrySchema>;
export type AuditLogQuery = z.infer<typeof AuditLogQuerySchema>;

export type UserSession = z.infer<typeof UserSessionSchema>;
export type CreateSession = z.infer<typeof CreateSessionSchema>;
export type EndSession = z.infer<typeof EndSessionSchema>;

export type FailedTransaction = z.infer<typeof FailedTransactionSchema>;
export type RecordFailedTransaction = z.infer<typeof RecordFailedTransactionSchema>;
