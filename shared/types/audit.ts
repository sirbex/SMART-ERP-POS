/**
 * TypeScript Interfaces for Audit Trail System
 * Created: November 23, 2025
 * Purpose: Type definitions for audit log entities (camelCase for frontend)
 * 
 * NOTE: Database uses snake_case, these interfaces use camelCase for frontend.
 * Backend repositories should normalize snake_case to camelCase when returning data.
 */

// =====================================================
// ENUMS (matching Zod enums)
// =====================================================

export type EntityType =
  | 'SALE'
  | 'INVOICE'
  | 'PAYMENT'
  | 'PRODUCT'
  | 'CUSTOMER'
  | 'SUPPLIER'
  | 'USER'
  | 'PURCHASE_ORDER'
  | 'GOODS_RECEIPT'
  | 'INVENTORY_ADJUSTMENT'
  | 'BATCH'
  | 'PRICING'
  | 'DISCOUNT'
  | 'SETTINGS'
  | 'REPORT'
  | 'SYSTEM'
  | 'LEAD'
  | 'OPPORTUNITY'
  | 'ACTIVITY'
  | 'OPPORTUNITY_DOCUMENT'
  | 'DEPARTMENT'
  | 'POSITION'
  | 'EMPLOYEE'
  | 'PAYROLL_PERIOD'
  | 'PAYROLL_ENTRY';

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'VOID'
  | 'CANCEL'
  | 'REFUND'
  | 'EXCHANGE'
  | 'LOGIN'
  | 'LOGOUT'
  | 'LOGIN_FAILED'
  | 'PASSWORD_CHANGE'
  | 'PERMISSION_CHANGE'
  | 'APPROVE'
  | 'REJECT'
  | 'RESTORE'
  | 'ARCHIVE'
  | 'EXPORT'
  | 'IMPORT'
  | 'OPEN_DRAWER'
  | 'CLOSE_SHIFT'
  | 'ADJUST_INVENTORY'
  | 'PRICE_CHANGE'
  | 'PRICE_OVERRIDE'
  | 'REMOVE'
  | 'STATUS_CHANGE'
  | 'FINALIZE';

export type Severity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export type Category =
  | 'FINANCIAL'
  | 'INVENTORY'
  | 'ACCESS'
  | 'CONFIGURATION'
  | 'SYSTEM'
  | 'SECURITY'
  | 'COMPLIANCE'
  | 'MASTER_DATA';

export type LogoutReason = 'MANUAL' | 'TIMEOUT' | 'FORCED' | 'ERROR';

export type DeviceType = 'DESKTOP' | 'MOBILE' | 'TABLET' | 'POS_TERMINAL' | 'UNKNOWN';

export type TransactionType =
  | 'SALE'
  | 'PAYMENT'
  | 'REFUND'
  | 'RETURN'
  | 'EXCHANGE'
  | 'INVOICE_CREATION'
  | 'INVOICE_PAYMENT'
  | 'VOID'
  | 'INVENTORY_ADJUSTMENT'
  | 'PURCHASE_ORDER'
  | 'GOODS_RECEIPT';

// =====================================================
// AUDIT LOG INTERFACES
// =====================================================

/**
 * Audit log entry (camelCase for frontend)
 */
export interface AuditLog {
  id: string; // UUID

  // Entity information
  entityType: EntityType;
  entityId?: string; // UUID
  entityNumber?: string; // Business identifier (SALE-2025-0001, etc.)

  // Action details
  action: AuditAction;
  actionDetails?: string; // Human-readable description

  // User information
  userId: string; // UUID
  userName?: string;
  userRole?: string;

  // Change tracking
  oldValues?: Record<string, any>; // State before change
  newValues?: Record<string, any>; // State after change
  changes?: Record<string, any>; // Calculated diff

  // Context
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string; // UUID
  requestId?: string; // UUID

  // Metadata
  severity: Severity;
  category?: Category;
  tags?: string[];

  // Timestamps
  createdAt: string; // ISO 8601

  // Additional
  notes?: string;
  referenceNumber?: string;
}

/**
 * Database row format (snake_case from PostgreSQL)
 * Used for normalization in repositories
 */
export interface AuditLogDbRow {
  id: string;
  entity_type: string;
  entity_id?: string;
  entity_number?: string;
  action: string;
  action_details?: string;
  user_id: string;
  user_name?: string;
  user_role?: string;
  old_values?: Record<string, any>;
  new_values?: Record<string, any>;
  changes?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  session_id?: string;
  request_id?: string;
  severity: string;
  category?: string;
  tags?: string[];
  created_at: string;
  notes?: string;
  reference_number?: string;
}

/**
 * Input for creating a new audit entry
 */
export interface CreateAuditEntry {
  // Required
  entityType: EntityType;
  action: AuditAction;
  userId: string; // UUID

  // Entity identification (at least one required)
  entityId?: string; // UUID
  entityNumber?: string; // Business identifier

  // Action details
  actionDetails?: string;

  // User information (for denormalization)
  userName?: string;
  userRole?: string;

  // Change tracking
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  changes?: Record<string, any>;

  // Context
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string; // UUID
  requestId?: string; // UUID

  // Metadata
  severity?: Severity;
  category?: Category;
  tags?: string[];

  // Additional
  notes?: string;
  referenceNumber?: string;
}

/**
 * Query parameters for filtering audit logs
 */
export interface AuditLogQuery {
  // Filters
  entityType?: EntityType;
  entityId?: string;
  entityNumber?: string;
  action?: AuditAction;
  userId?: string;
  severity?: Severity;
  category?: Category;
  sessionId?: string;

  // Date range
  startDate?: string; // ISO 8601
  endDate?: string; // ISO 8601

  // Search
  searchTerm?: string;
  tags?: string[];

  // Pagination
  page?: number;
  limit?: number;

  // Sorting
  sortBy?: 'createdAt' | 'entityType' | 'action' | 'severity';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Audit log list response with pagination
 */
export interface AuditLogListResponse {
  data: AuditLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// =====================================================
// USER SESSION INTERFACES
// =====================================================

/**
 * User session (camelCase for frontend)
 */
export interface UserSession {
  id: string; // UUID

  // User information
  userId: string; // UUID
  userName: string;
  userRole: string;

  // Session timing
  loginAt: string; // ISO 8601
  logoutAt?: string; // ISO 8601
  sessionDurationSeconds?: number; // Calculated on logout

  // Device/location
  ipAddress?: string;
  userAgent?: string;
  deviceType: DeviceType;
  terminalId?: string; // Physical POS terminal identifier

  // Session state
  isActive: boolean;
  logoutReason?: LogoutReason;

  // Activity tracking
  lastActivityAt: string; // ISO 8601
  actionsCount: number; // Number of actions in this session

  // Timestamps
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/**
 * Database row format for user sessions (snake_case)
 */
export interface UserSessionDbRow {
  id: string;
  user_id: string;
  user_name: string;
  user_role: string;
  login_at: string;
  logout_at?: string;
  session_duration_seconds?: number;
  ip_address?: string;
  user_agent?: string;
  device_type: string;
  terminal_id?: string;
  is_active: boolean;
  logout_reason?: string;
  last_activity_at: string;
  actions_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * Input for creating a new session (login)
 */
export interface CreateSession {
  userId: string; // UUID
  userName: string;
  userRole: string;

  // Optional context
  ipAddress?: string;
  userAgent?: string;
  deviceType?: DeviceType;
  terminalId?: string;
}

/**
 * Input for ending a session (logout)
 */
export interface EndSession {
  sessionId: string; // UUID
  logoutReason?: LogoutReason;
}

/**
 * Active session summary
 */
export interface ActiveSession {
  id: string;
  userName: string;
  userRole: string;
  loginAt: string;
  lastActivityAt: string;
  idleDurationMinutes: number; // Calculated from lastActivityAt
  actionsCount: number;
  terminalId?: string;
  ipAddress?: string;
}

// =====================================================
// FAILED TRANSACTION INTERFACES
// =====================================================

/**
 * Failed transaction record (camelCase for frontend)
 */
export interface FailedTransaction {
  id: string; // UUID

  // Transaction details
  transactionType: TransactionType;
  attemptedData: Record<string, any>; // What the user tried to do

  // Error information
  errorType: string; // VALIDATION_ERROR, DATABASE_ERROR, etc.
  errorMessage: string;
  errorStack?: string; // Full stack trace

  // User context
  userId?: string; // UUID
  userName?: string;
  sessionId?: string; // UUID

  // Request context
  ipAddress?: string;
  userAgent?: string;
  requestId?: string; // UUID

  // Metadata
  createdAt: string; // ISO 8601
  severity: Severity;

  // Resolution
  notes?: string;
  resolvedAt?: string; // ISO 8601
  resolvedById?: string; // UUID
  resolutionNotes?: string;
}

/**
 * Database row format for failed transactions (snake_case)
 */
export interface FailedTransactionDbRow {
  id: string;
  transaction_type: string;
  attempted_data: Record<string, any>;
  error_type: string;
  error_message: string;
  error_stack?: string;
  user_id?: string;
  user_name?: string;
  session_id?: string;
  ip_address?: string;
  user_agent?: string;
  request_id?: string;
  created_at: string;
  severity: string;
  notes?: string;
  resolved_at?: string;
  resolved_by_id?: string;
  resolution_notes?: string;
}

/**
 * Input for recording a failed transaction
 */
export interface RecordFailedTransaction {
  transactionType: TransactionType;
  attemptedData: Record<string, any>;

  // Error details
  errorType: string;
  errorMessage: string;
  errorStack?: string;

  // User context
  userId?: string; // UUID
  userName?: string;
  sessionId?: string; // UUID

  // Request context
  ipAddress?: string;
  userAgent?: string;
  requestId?: string; // UUID

  // Metadata
  severity?: Severity;
  notes?: string;
}

/**
 * Failed transaction summary (for dashboard)
 */
export interface FailedTransactionSummary {
  transactionType: TransactionType;
  errorType: string;
  failureCount: number;
  lastOccurrence: string; // ISO 8601
  unresolvedCount: number;
}

// =====================================================
// AUDIT CONTEXT (for service layer)
// =====================================================

/**
 * Contextual information for audit logging
 * Passed to service layer functions
 */
export interface AuditContext {
  userId: string; // UUID
  userName?: string;
  userRole?: string;
  sessionId?: string; // UUID
  ipAddress?: string;
  userAgent?: string;
  requestId?: string; // UUID
}

// =====================================================
// UTILITY TYPES
// =====================================================

/**
 * Change diff for audit log
 * Shows what fields changed from old to new
 */
export interface ChangesDiff {
  [fieldName: string]: {
    old: any;
    new: any;
  };
}

/**
 * Audit statistics (for dashboard)
 */
export interface AuditStatistics {
  totalActions: number;
  actionsByType: Record<AuditAction, number>;
  actionsByUser: Array<{ userId: string; userName: string; count: number }>;
  criticalEvents: number;
  errorEvents: number;
  recentActivity: AuditLog[];
}
