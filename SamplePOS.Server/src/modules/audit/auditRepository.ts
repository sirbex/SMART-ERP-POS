/**
 * Audit Repository Layer
 * Created: November 23, 2025
 * Purpose: Database access for audit trail system using raw SQL
 * 
 * CRITICAL RULES:
 * - NO ORM - Raw SQL with parameterized queries only
 * - Database returns snake_case, normalize to camelCase before returning
 * - All queries must use $1, $2, ... parameterization
 * - Follow Controller → Service → Repository layering
 */

import { Pool } from 'pg';
import { pool as globalPool } from '../../db/pool.js';
import {
  AuditLog,
  AuditLogDbRow,
  CreateAuditEntry,
  AuditLogQuery,
  UserSession,
  UserSessionDbRow,
  CreateSession,
  EndSession,
  FailedTransaction,
  FailedTransactionDbRow,
  RecordFailedTransaction,
  FailedTransactionSummary,
  ActiveSession,
} from '../../../../shared/types/audit.js';

// =====================================================
// NORMALIZATION UTILITIES
// =====================================================

/**
 * Normalize database row (snake_case) to camelCase interface
 */
function normalizeAuditLog(row: AuditLogDbRow): AuditLog {
  return {
    id: row.id,
    entityType: row.entity_type as AuditLog['entityType'],
    entityId: row.entity_id,
    entityNumber: row.entity_number,
    action: row.action as AuditLog['action'],
    actionDetails: row.action_details,
    userId: row.user_id,
    userName: row.user_name,
    userRole: row.user_role,
    oldValues: row.old_values,
    newValues: row.new_values,
    changes: row.changes,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    sessionId: row.session_id,
    requestId: row.request_id,
    severity: row.severity as AuditLog['severity'],
    category: row.category as AuditLog['category'],
    tags: row.tags,
    createdAt: row.created_at,
    notes: row.notes,
    referenceNumber: row.reference_number,
  };
}

function normalizeUserSession(row: UserSessionDbRow): UserSession {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    userRole: row.user_role,
    loginAt: row.login_at,
    logoutAt: row.logout_at,
    sessionDurationSeconds: row.session_duration_seconds,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    deviceType: row.device_type as UserSession['deviceType'],
    terminalId: row.terminal_id,
    isActive: row.is_active,
    logoutReason: row.logout_reason as UserSession['logoutReason'],
    lastActivityAt: row.last_activity_at,
    actionsCount: row.actions_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeFailedTransaction(row: FailedTransactionDbRow): FailedTransaction {
  return {
    id: row.id,
    transactionType: row.transaction_type as FailedTransaction['transactionType'],
    attemptedData: row.attempted_data,
    errorType: row.error_type,
    errorMessage: row.error_message,
    errorStack: row.error_stack,
    userId: row.user_id,
    userName: row.user_name,
    sessionId: row.session_id,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    requestId: row.request_id,
    createdAt: row.created_at,
    severity: row.severity as FailedTransaction['severity'],
    notes: row.notes,
    resolvedAt: row.resolved_at,
    resolvedById: row.resolved_by_id,
    resolutionNotes: row.resolution_notes,
  };
}

// =====================================================
// AUDIT LOG REPOSITORY
// =====================================================

/**
 * Create a new audit log entry
 */
export async function createAuditEntry(
  pool: Pool,
  data: CreateAuditEntry
): Promise<AuditLog> {
  const query = `
    INSERT INTO audit_log (
      entity_type, entity_id, entity_number, action, action_details,
      user_id, user_name, user_role,
      old_values, new_values, changes,
      ip_address, user_agent, session_id, request_id,
      severity, category, tags,
      notes, reference_number
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8,
      $9, $10, $11,
      $12, $13, $14, $15,
      $16, $17, $18,
      $19, $20
    )
    RETURNING *
  `;

  const values = [
    data.entityType,
    data.entityId || null,
    data.entityNumber || null,
    data.action,
    data.actionDetails || null,
    data.userId,
    data.userName || null,
    data.userRole || null,
    data.oldValues ? JSON.stringify(data.oldValues) : null,
    data.newValues ? JSON.stringify(data.newValues) : null,
    data.changes ? JSON.stringify(data.changes) : null,
    data.ipAddress || null,
    data.userAgent || null,
    data.sessionId || null,
    data.requestId || null,
    data.severity || 'INFO',
    data.category || null,
    data.tags || null,
    data.notes || null,
    data.referenceNumber || null,
  ];

  const result = await pool.query<AuditLogDbRow>(query, values);
  return normalizeAuditLog(result.rows[0]);
}

/**
 * Get audit logs with filters and pagination
 */
export async function getAuditLogs(
  pool: Pool,
  filters: AuditLogQuery
): Promise<{ data: AuditLog[]; total: number }> {
  const conditions: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  // Build WHERE clause dynamically
  if (filters.entityType) {
    conditions.push(`entity_type = $${paramCount++}`);
    values.push(filters.entityType);
  }

  if (filters.entityId) {
    conditions.push(`entity_id = $${paramCount++}`);
    values.push(filters.entityId);
  }

  if (filters.entityNumber) {
    conditions.push(`entity_number = $${paramCount++}`);
    values.push(filters.entityNumber);
  }

  if (filters.action) {
    conditions.push(`action = $${paramCount++}`);
    values.push(filters.action);
  }

  if (filters.userId) {
    conditions.push(`user_id = $${paramCount++}`);
    values.push(filters.userId);
  }

  if (filters.severity) {
    conditions.push(`severity = $${paramCount++}`);
    values.push(filters.severity);
  }

  if (filters.category) {
    conditions.push(`category = $${paramCount++}`);
    values.push(filters.category);
  }

  if (filters.sessionId) {
    conditions.push(`session_id = $${paramCount++}`);
    values.push(filters.sessionId);
  }

  if (filters.startDate) {
    conditions.push(`created_at >= $${paramCount++}`);
    values.push(filters.startDate);
  }

  if (filters.endDate) {
    conditions.push(`created_at <= $${paramCount++}`);
    values.push(filters.endDate);
  }

  if (filters.searchTerm) {
    conditions.push(`(
      action_details ILIKE $${paramCount} OR
      notes ILIKE $${paramCount} OR
      user_name ILIKE $${paramCount}
    )`);
    values.push(`%${filters.searchTerm}%`);
    paramCount++;
  }

  if (filters.tags && filters.tags.length > 0) {
    conditions.push(`tags && $${paramCount++}`);
    values.push(filters.tags);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get total count
  const countQuery = `SELECT COUNT(*) FROM audit_log ${whereClause}`;
  const countResult = await pool.query(countQuery, values);
  const total = parseInt(countResult.rows[0].count, 10);

  // Get paginated data
  const page = filters.page || 1;
  const limit = filters.limit || 50;
  const offset = (page - 1) * limit;
  const sortBy = filters.sortBy || 'createdAt';
  const sortOrder = filters.sortOrder || 'desc';

  // Map camelCase to snake_case for SQL
  const sortColumnMap: Record<string, string> = {
    createdAt: 'created_at',
    entityType: 'entity_type',
    action: 'action',
    severity: 'severity',
  };
  const sortColumn = sortColumnMap[sortBy] || 'created_at';

  const dataQuery = `
    SELECT * FROM audit_log
    ${whereClause}
    ORDER BY ${sortColumn} ${sortOrder.toUpperCase()}
    LIMIT $${paramCount++}
    OFFSET $${paramCount++}
  `;

  values.push(limit, offset);

  const dataResult = await pool.query<AuditLogDbRow>(dataQuery, values);
  const data = dataResult.rows.map(normalizeAuditLog);

  return { data, total };
}

/**
 * Get audit trail for a specific entity
 */
export async function getEntityAuditTrail(
  pool: Pool,
  entityType: string,
  entityId: string
): Promise<AuditLog[]> {
  const query = `
    SELECT * FROM audit_log
    WHERE entity_type = $1 AND entity_id = $2
    ORDER BY created_at DESC
  `;

  const result = await pool.query<AuditLogDbRow>(query, [entityType, entityId]);
  return result.rows.map(normalizeAuditLog);
}

/**
 * Get audit trail by entity number (business identifier)
 */
export async function getEntityAuditTrailByNumber(
  pool: Pool,
  entityNumber: string
): Promise<AuditLog[]> {
  const query = `
    SELECT * FROM audit_log
    WHERE entity_number = $1
    ORDER BY created_at DESC
  `;

  const result = await pool.query<AuditLogDbRow>(query, [entityNumber]);
  return result.rows.map(normalizeAuditLog);
}

// =====================================================
// USER SESSION REPOSITORY
// =====================================================

/**
 * Create a new user session (login)
 */
export async function createUserSession(
  pool: Pool,
  data: CreateSession
): Promise<UserSession> {
  const query = `
    INSERT INTO user_sessions (
      user_id, user_name, user_role,
      ip_address, user_agent, device_type, terminal_id,
      is_active
    ) VALUES (
      $1, $2, $3,
      $4, $5, $6, $7,
      true
    )
    RETURNING *
  `;

  const values = [
    data.userId,
    data.userName,
    data.userRole,
    data.ipAddress || null,
    data.userAgent || null,
    data.deviceType || 'UNKNOWN',
    data.terminalId || null,
  ];

  const result = await pool.query<UserSessionDbRow>(query, values);
  return normalizeUserSession(result.rows[0]);
}

/**
 * End a user session (logout)
 */
export async function endUserSession(
  pool: Pool,
  data: EndSession
): Promise<UserSession> {
  const query = `
    UPDATE user_sessions
    SET 
      logout_at = NOW(),
      is_active = false,
      logout_reason = $2,
      updated_at = NOW()
    WHERE id = $1 AND is_active = true
    RETURNING *
  `;

  const values = [data.sessionId, data.logoutReason || 'MANUAL'];

  const result = await pool.query<UserSessionDbRow>(query, values);
  if (result.rows.length === 0) {
    throw new Error(`Session ${data.sessionId} not found or already ended`);
  }

  return normalizeUserSession(result.rows[0]);
}

/**
 * Get active user sessions
 */
export async function getActiveSessions(pool: Pool): Promise<UserSession[]> {
  const query = `
    SELECT * FROM user_sessions
    WHERE is_active = true
    ORDER BY last_activity_at DESC
  `;

  const result = await pool.query<UserSessionDbRow>(query);
  return result.rows.map(normalizeUserSession);
}

/**
 * Get user's session history
 */
export async function getUserSessions(
  pool: Pool,
  userId: string,
  limit: number = 10
): Promise<UserSession[]> {
  const query = `
    SELECT * FROM user_sessions
    WHERE user_id = $1
    ORDER BY login_at DESC
    LIMIT $2
  `;

  const result = await pool.query<UserSessionDbRow>(query, [userId, limit]);
  return result.rows.map(normalizeUserSession);
}

/**
 * Get session by ID
 */
export async function getSessionById(pool: Pool, sessionId: string): Promise<UserSession | null> {
  const query = `SELECT * FROM user_sessions WHERE id = $1`;
  const result = await pool.query<UserSessionDbRow>(query, [sessionId]);
  return result.rows.length > 0 ? normalizeUserSession(result.rows[0]) : null;
}

/**
 * Force logout idle sessions (for security timeout)
 */
export async function forceLogoutIdleSessions(
  pool: Pool,
  idleMinutes: number = 15
): Promise<number> {
  const query = `
    UPDATE user_sessions
    SET 
      logout_at = NOW(),
      is_active = false,
      logout_reason = 'TIMEOUT',
      updated_at = NOW()
    WHERE is_active = true
      AND last_activity_at < NOW() - INTERVAL '${idleMinutes} minutes'
    RETURNING id
  `;

  const result = await pool.query(query);
  return result.rowCount || 0;
}

// =====================================================
// FAILED TRANSACTION REPOSITORY
// =====================================================

/**
 * Record a failed transaction
 */
export async function recordFailedTransaction(
  pool: Pool,
  data: RecordFailedTransaction
): Promise<FailedTransaction> {
  const query = `
    INSERT INTO failed_transactions (
      transaction_type, attempted_data,
      error_type, error_message, error_stack,
      user_id, user_name, session_id,
      ip_address, user_agent, request_id,
      severity, notes
    ) VALUES (
      $1, $2,
      $3, $4, $5,
      $6, $7, $8,
      $9, $10, $11,
      $12, $13
    )
    RETURNING *
  `;

  const values = [
    data.transactionType,
    JSON.stringify(data.attemptedData),
    data.errorType,
    data.errorMessage,
    data.errorStack || null,
    data.userId || null,
    data.userName || null,
    data.sessionId || null,
    data.ipAddress || null,
    data.userAgent || null,
    data.requestId || null,
    data.severity || 'ERROR',
    data.notes || null,
  ];

  const result = await pool.query<FailedTransactionDbRow>(query, values);
  return normalizeFailedTransaction(result.rows[0]);
}

/**
 * Get recent failed transactions
 */
export async function getRecentFailedTransactions(
  pool: Pool,
  limit: number = 50
): Promise<FailedTransaction[]> {
  const query = `
    SELECT * FROM failed_transactions
    ORDER BY created_at DESC
    LIMIT $1
  `;

  const result = await pool.query<FailedTransactionDbRow>(query, [limit]);
  return result.rows.map(normalizeFailedTransaction);
}

/**
 * Get failed transaction summary (for dashboard)
 */
export async function getFailedTransactionSummary(
  pool: Pool,
  days: number = 30
): Promise<FailedTransactionSummary[]> {
  const query = `
    SELECT 
      transaction_type,
      error_type,
      COUNT(*) AS failure_count,
      MAX(created_at) AS last_occurrence,
      COUNT(*) FILTER (WHERE resolved_at IS NULL) AS unresolved_count
    FROM failed_transactions
    WHERE created_at >= NOW() - INTERVAL '${days} days'
    GROUP BY transaction_type, error_type
    ORDER BY failure_count DESC
  `;

  const result = await pool.query(query);
  return result.rows.map((row) => ({
    transactionType: row.transaction_type,
    errorType: row.error_type,
    failureCount: parseInt(row.failure_count, 10),
    lastOccurrence: row.last_occurrence,
    unresolvedCount: parseInt(row.unresolved_count, 10),
  }));
}

/**
 * Mark failed transaction as resolved
 */
export async function resolveFailedTransaction(
  pool: Pool,
  transactionId: string,
  resolvedById: string,
  resolutionNotes: string
): Promise<FailedTransaction> {
  const query = `
    UPDATE failed_transactions
    SET 
      resolved_at = NOW(),
      resolved_by_id = $2,
      resolution_notes = $3
    WHERE id = $1
    RETURNING *
  `;

  const result = await pool.query<FailedTransactionDbRow>(query, [
    transactionId,
    resolvedById,
    resolutionNotes,
  ]);

  if (result.rows.length === 0) {
    throw new Error(`Failed transaction ${transactionId} not found`);
  }

  return normalizeFailedTransaction(result.rows[0]);
}
