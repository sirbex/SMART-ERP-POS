# Audit Trail Implementation Plan
**Date**: November 23, 2025  
**Priority**: 🔴 HIGH RISK - CRITICAL  
**Estimated Time**: 2-3 weeks  
**Status**: 📋 PLANNING

---

## Overview

Comprehensive audit logging system to track WHO did WHAT and WHEN across all POS operations, following strict COPILOT instructions and architectural patterns.

---

## Architecture Compliance

### ✅ COPILOT RULES ADHERENCE

1. **NO ORM** - Use raw SQL with parameterized queries only
2. **Strict Layering** - Controller → Service → Repository
3. **Timezone Strategy** - TIMESTAMPTZ (UTC) for all audit timestamps
4. **Field Naming** - `snake_case` in DB, `camelCase` in TypeScript
5. **Dual-ID Architecture** - UUID for internal, business IDs for display
6. **Zod Validation** - All audit entries validated before storage
7. **Error Handling** - Graceful degradation if audit fails

---

## Phase 1: Database Schema (Week 1, Days 1-2)

### 1.1 Core Audit Table

**File**: `shared/sql/migrations/027_create_audit_log.sql`

```sql
-- ============================================================================
-- AUDIT TRAIL SYSTEM
-- Tracks all user actions across the system for compliance and security
-- ============================================================================

-- Main audit log table
CREATE TABLE audit_log (
  -- Primary identification
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- What was affected (entity tracking)
  entity_type VARCHAR(50) NOT NULL, -- 'SALE', 'INVOICE', 'PAYMENT', 'PRODUCT', etc.
  entity_id UUID, -- ID of the affected record
  entity_number VARCHAR(100), -- Business ID (SALE-2025-0001, INV-00123, etc.)
  
  -- What happened (action tracking)
  action VARCHAR(50) NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE', 'VOID', 'REFUND', 'LOGIN', 'LOGOUT'
  action_details TEXT, -- Human-readable description
  
  -- Who did it (user tracking)
  user_id UUID NOT NULL REFERENCES users(id),
  user_name VARCHAR(255), -- Denormalized for historical record
  user_role VARCHAR(50), -- Denormalized user role at time of action
  
  -- When and where (context tracking)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address INET, -- Client IP address
  user_agent TEXT, -- Browser/device info
  session_id VARCHAR(255), -- Session identifier
  
  -- What changed (change tracking)
  old_values JSONB, -- Previous state (for UPDATE/DELETE)
  new_values JSONB, -- New state (for CREATE/UPDATE)
  changes JSONB, -- Diff of what changed (for UPDATE)
  
  -- Additional context
  metadata JSONB, -- Extra context (device_id, pos_terminal, etc.)
  severity VARCHAR(20) DEFAULT 'INFO', -- 'DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'
  
  -- Status tracking
  success BOOLEAN DEFAULT TRUE, -- Was action successful?
  error_message TEXT, -- Error details if failed
  
  -- Performance tracking
  duration_ms INTEGER, -- How long action took
  
  CONSTRAINT chk_audit_severity CHECK (severity IN ('DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'))
);

-- Indexes for fast querying
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_entity_number ON audit_log(entity_number);
CREATE INDEX idx_audit_user ON audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_action ON audit_log(action, created_at DESC);
CREATE INDEX idx_audit_created_at ON audit_log(created_at DESC);
CREATE INDEX idx_audit_session ON audit_log(session_id);
CREATE INDEX idx_audit_severity ON audit_log(severity, created_at DESC);
CREATE INDEX idx_audit_entity_user ON audit_log(entity_type, user_id, created_at DESC);

-- Partial index for failed actions (faster troubleshooting)
CREATE INDEX idx_audit_failures ON audit_log(created_at DESC) WHERE success = FALSE;

COMMENT ON TABLE audit_log IS 'Comprehensive audit trail for all system actions';
COMMENT ON COLUMN audit_log.entity_type IS 'Type of entity affected (SALE, INVOICE, etc.)';
COMMENT ON COLUMN audit_log.entity_number IS 'Human-readable business ID for display';
COMMENT ON COLUMN audit_log.action IS 'Type of action performed (CREATE, UPDATE, etc.)';
COMMENT ON COLUMN audit_log.changes IS 'JSON diff showing what changed in UPDATE operations';
COMMENT ON COLUMN audit_log.severity IS 'Log severity level for filtering';
```

### 1.2 Session Tracking Table

```sql
-- User session tracking
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR(255) UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id),
  user_name VARCHAR(255) NOT NULL,
  
  -- Session lifecycle
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  
  -- Context
  ip_address INET,
  user_agent TEXT,
  device_type VARCHAR(50), -- 'POS_TERMINAL', 'WEB', 'MOBILE'
  terminal_id VARCHAR(100), -- POS terminal identifier
  
  -- Status
  status VARCHAR(20) DEFAULT 'ACTIVE', -- 'ACTIVE', 'IDLE', 'EXPIRED', 'LOGGED_OUT'
  
  CONSTRAINT chk_session_status CHECK (status IN ('ACTIVE', 'IDLE', 'EXPIRED', 'LOGGED_OUT'))
);

CREATE INDEX idx_sessions_user ON user_sessions(user_id, started_at DESC);
CREATE INDEX idx_sessions_session_id ON user_sessions(session_id);
CREATE INDEX idx_sessions_status ON user_sessions(status, last_activity_at);

COMMENT ON TABLE user_sessions IS 'Active and historical user sessions for audit and security';
```

### 1.3 Failed Transaction Log

```sql
-- Failed transaction attempts
CREATE TABLE failed_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Attempt context
  user_id UUID REFERENCES users(id),
  session_id VARCHAR(255),
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- What was attempted
  transaction_type VARCHAR(50) NOT NULL, -- 'SALE', 'REFUND', 'VOID', etc.
  transaction_data JSONB, -- Data that was submitted
  
  -- Why it failed
  error_code VARCHAR(50),
  error_message TEXT NOT NULL,
  error_details JSONB,
  
  -- Context
  ip_address INET,
  user_agent TEXT,
  
  -- Security tracking
  is_suspicious BOOLEAN DEFAULT FALSE, -- Flagged by security rules
  
  CONSTRAINT chk_failed_tx_type CHECK (transaction_type IN ('SALE', 'REFUND', 'VOID', 'PAYMENT', 'LOGIN', 'DISCOUNT'))
);

CREATE INDEX idx_failed_tx_user ON failed_transactions(user_id, attempted_at DESC);
CREATE INDEX idx_failed_tx_type ON failed_transactions(transaction_type, attempted_at DESC);
CREATE INDEX idx_failed_tx_suspicious ON failed_transactions(attempted_at DESC) WHERE is_suspicious = TRUE;

COMMENT ON TABLE failed_transactions IS 'Log of failed transaction attempts for security analysis';
```

---

## Phase 2: Shared Types & Validation (Week 1, Days 3-4)

### 2.1 Zod Schemas

**File**: `shared/zod/audit.ts`

```typescript
import { z } from 'zod';

// Entity types that can be audited
export const AuditEntityType = z.enum([
  'SALE',
  'INVOICE',
  'PAYMENT',
  'PRODUCT',
  'CUSTOMER',
  'USER',
  'INVENTORY',
  'PURCHASE_ORDER',
  'GOODS_RECEIPT',
  'STOCK_ADJUSTMENT',
  'DISCOUNT',
  'REFUND',
  'VOID',
  'SESSION',
]);

// Actions that can be audited
export const AuditAction = z.enum([
  'CREATE',
  'UPDATE',
  'DELETE',
  'VOID',
  'REFUND',
  'LOGIN',
  'LOGOUT',
  'APPROVE',
  'REJECT',
  'VIEW',
  'EXPORT',
  'PRINT',
]);

// Severity levels
export const AuditSeverity = z.enum([
  'DEBUG',
  'INFO',
  'WARNING',
  'ERROR',
  'CRITICAL',
]);

// Core audit entry schema (database row)
export const AuditLogDbSchema = z.object({
  id: z.string().uuid(),
  entity_type: AuditEntityType,
  entity_id: z.string().uuid().optional(),
  entity_number: z.string().optional(),
  action: AuditAction,
  action_details: z.string().optional(),
  user_id: z.string().uuid(),
  user_name: z.string(),
  user_role: z.string(),
  created_at: z.string(), // ISO timestamp
  ip_address: z.string().optional(),
  user_agent: z.string().optional(),
  session_id: z.string().optional(),
  old_values: z.record(z.any()).optional(),
  new_values: z.record(z.any()).optional(),
  changes: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
  severity: AuditSeverity,
  success: z.boolean(),
  error_message: z.string().optional(),
  duration_ms: z.number().int().optional(),
});

// Audit entry creation input (what services provide)
export const CreateAuditEntrySchema = z.object({
  entityType: AuditEntityType,
  entityId: z.string().uuid().optional(),
  entityNumber: z.string().optional(),
  action: AuditAction,
  actionDetails: z.string().optional(),
  userId: z.string().uuid(),
  oldValues: z.record(z.any()).optional(),
  newValues: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
  severity: AuditSeverity.default('INFO'),
  success: z.boolean().default(true),
  errorMessage: z.string().optional(),
  durationMs: z.number().int().optional(),
});

// Frontend audit entry (camelCase)
export const AuditLogSchema = z.object({
  id: z.string().uuid(),
  entityType: AuditEntityType,
  entityId: z.string().uuid().optional(),
  entityNumber: z.string().optional(),
  action: AuditAction,
  actionDetails: z.string().optional(),
  userId: z.string().uuid(),
  userName: z.string(),
  userRole: z.string(),
  createdAt: z.string(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  sessionId: z.string().optional(),
  oldValues: z.record(z.any()).optional(),
  newValues: z.record(z.any()).optional(),
  changes: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
  severity: AuditSeverity,
  success: z.boolean(),
  errorMessage: z.string().optional(),
  durationMs: z.number().int().optional(),
});

export type AuditLogDb = z.infer<typeof AuditLogDbSchema>;
export type AuditLog = z.infer<typeof AuditLogSchema>;
export type CreateAuditEntry = z.infer<typeof CreateAuditEntrySchema>;
export type AuditEntityTypeEnum = z.infer<typeof AuditEntityType>;
export type AuditActionEnum = z.infer<typeof AuditAction>;
export type AuditSeverityEnum = z.infer<typeof AuditSeverity>;
```

### 2.2 TypeScript Interfaces

**File**: `shared/types/audit.ts`

```typescript
export interface AuditContext {
  userId: string;
  userName?: string;
  userRole?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  terminalId?: string;
}

export interface AuditOptions {
  includeOldValues?: boolean;
  includeNewValues?: boolean;
  calculateDiff?: boolean;
  severity?: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  metadata?: Record<string, any>;
}

export interface AuditSearchParams {
  entityType?: string;
  entityId?: string;
  userId?: string;
  action?: string;
  startDate?: string;
  endDate?: string;
  severity?: string;
  success?: boolean;
  page?: number;
  limit?: number;
}
```

---

## Phase 3: Backend Repository Layer (Week 1, Days 5-7)

### 3.1 Audit Repository

**File**: `SamplePOS.Server/src/modules/audit/auditRepository.ts`

```typescript
import { Pool } from 'pg';
import type { AuditLogDb, CreateAuditEntry } from '@shared/zod/audit';
import type { AuditSearchParams } from '@shared/types/audit';

/**
 * Audit Repository
 * RAW SQL ONLY - No ORM per COPILOT rules
 * Handles all database operations for audit trail
 */

/**
 * Create audit log entry
 * CRITICAL: Must NEVER throw - audit failures should not break transactions
 */
export async function createAuditEntry(
  pool: Pool,
  entry: CreateAuditEntry,
  context: {
    userName?: string;
    userRole?: string;
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
  }
): Promise<string | null> {
  try {
    const query = `
      INSERT INTO audit_log (
        entity_type, entity_id, entity_number, action, action_details,
        user_id, user_name, user_role,
        ip_address, user_agent, session_id,
        old_values, new_values, changes,
        metadata, severity, success, error_message, duration_ms
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8,
        $9, $10, $11,
        $12, $13, $14,
        $15, $16, $17, $18, $19
      )
      RETURNING id
    `;

    // Calculate changes if both old and new values provided
    let changes = null;
    if (entry.oldValues && entry.newValues) {
      changes = calculateDiff(entry.oldValues, entry.newValues);
    }

    const values = [
      entry.entityType,
      entry.entityId || null,
      entry.entityNumber || null,
      entry.action,
      entry.actionDetails || null,
      entry.userId,
      context.userName || null,
      context.userRole || null,
      context.ipAddress || null,
      context.userAgent || null,
      context.sessionId || null,
      entry.oldValues ? JSON.stringify(entry.oldValues) : null,
      entry.newValues ? JSON.stringify(entry.newValues) : null,
      changes ? JSON.stringify(changes) : null,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
      entry.severity || 'INFO',
      entry.success !== false,
      entry.errorMessage || null,
      entry.durationMs || null,
    ];

    const result = await pool.query(query, values);
    return result.rows[0]?.id || null;
  } catch (error) {
    // CRITICAL: Log to console but do NOT throw
    // Audit failures must not break actual transactions
    console.error('❌ AUDIT LOG FAILURE (non-blocking):', error);
    console.error('Entry data:', entry);
    return null;
  }
}

/**
 * Calculate diff between old and new values
 */
function calculateDiff(oldValues: Record<string, any>, newValues: Record<string, any>): Record<string, { old: any; new: any }> {
  const diff: Record<string, { old: any; new: any }> = {};
  
  // Check all keys from both objects
  const allKeys = new Set([...Object.keys(oldValues), ...Object.keys(newValues)]);
  
  for (const key of allKeys) {
    if (oldValues[key] !== newValues[key]) {
      diff[key] = {
        old: oldValues[key],
        new: newValues[key],
      };
    }
  }
  
  return diff;
}

/**
 * Get audit logs with filtering
 */
export async function getAuditLogs(
  pool: Pool,
  params: AuditSearchParams
): Promise<{ logs: AuditLogDb[]; total: number }> {
  const conditions: string[] = [];
  const values: any[] = [];
  let paramCount = 0;

  // Build WHERE clause
  if (params.entityType) {
    paramCount++;
    conditions.push(`entity_type = $${paramCount}`);
    values.push(params.entityType);
  }

  if (params.entityId) {
    paramCount++;
    conditions.push(`entity_id = $${paramCount}`);
    values.push(params.entityId);
  }

  if (params.userId) {
    paramCount++;
    conditions.push(`user_id = $${paramCount}`);
    values.push(params.userId);
  }

  if (params.action) {
    paramCount++;
    conditions.push(`action = $${paramCount}`);
    values.push(params.action);
  }

  if (params.startDate) {
    paramCount++;
    conditions.push(`created_at >= $${paramCount}`);
    values.push(params.startDate);
  }

  if (params.endDate) {
    paramCount++;
    conditions.push(`created_at <= $${paramCount}`);
    values.push(params.endDate);
  }

  if (params.severity) {
    paramCount++;
    conditions.push(`severity = $${paramCount}`);
    values.push(params.severity);
  }

  if (params.success !== undefined) {
    paramCount++;
    conditions.push(`success = $${paramCount}`);
    values.push(params.success);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get total count
  const countQuery = `SELECT COUNT(*) FROM audit_log ${whereClause}`;
  const countResult = await pool.query(countQuery, values);
  const total = parseInt(countResult.rows[0].count);

  // Get paginated results
  const page = params.page || 1;
  const limit = params.limit || 50;
  const offset = (page - 1) * limit;

  paramCount++;
  const limitParam = paramCount;
  paramCount++;
  const offsetParam = paramCount;

  const query = `
    SELECT * FROM audit_log
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${limitParam} OFFSET $${offsetParam}
  `;

  const result = await pool.query(query, [...values, limit, offset]);
  
  return {
    logs: result.rows,
    total,
  };
}

/**
 * Get audit trail for specific entity
 */
export async function getEntityAuditTrail(
  pool: Pool,
  entityType: string,
  entityId: string
): Promise<AuditLogDb[]> {
  const query = `
    SELECT * FROM audit_log
    WHERE entity_type = $1 AND entity_id = $2
    ORDER BY created_at DESC
  `;

  const result = await pool.query(query, [entityType, entityId]);
  return result.rows;
}

/**
 * Record failed transaction attempt
 */
export async function recordFailedTransaction(
  pool: Pool,
  data: {
    userId?: string;
    sessionId?: string;
    transactionType: string;
    transactionData: any;
    errorCode?: string;
    errorMessage: string;
    errorDetails?: any;
    ipAddress?: string;
    userAgent?: string;
    isSuspicious?: boolean;
  }
): Promise<void> {
  try {
    const query = `
      INSERT INTO failed_transactions (
        user_id, session_id, transaction_type, transaction_data,
        error_code, error_message, error_details,
        ip_address, user_agent, is_suspicious
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `;

    await pool.query(query, [
      data.userId || null,
      data.sessionId || null,
      data.transactionType,
      JSON.stringify(data.transactionData),
      data.errorCode || null,
      data.errorMessage,
      data.errorDetails ? JSON.stringify(data.errorDetails) : null,
      data.ipAddress || null,
      data.userAgent || null,
      data.isSuspicious || false,
    ]);
  } catch (error) {
    console.error('Failed to record failed transaction:', error);
    // Non-blocking
  }
}
```

---

## Phase 4: Backend Service Layer (Week 2, Days 1-2)

### 4.1 Audit Service

**File**: `SamplePOS.Server/src/modules/audit/auditService.ts`

```typescript
import { Pool } from 'pg';
import * as auditRepo from './auditRepository';
import type { CreateAuditEntry } from '@shared/zod/audit';
import type { AuditContext, AuditOptions } from '@shared/types/audit';

/**
 * Audit Service
 * Business logic for audit trail
 * Provides high-level audit logging functions
 */

/**
 * Log an action to audit trail
 * This is the main entry point for all audit logging
 */
export async function logAction(
  pool: Pool,
  entry: CreateAuditEntry,
  context: AuditContext,
  options: AuditOptions = {}
): Promise<void> {
  // Apply options
  const finalEntry = {
    ...entry,
    severity: options.severity || entry.severity || 'INFO',
    metadata: {
      ...entry.metadata,
      ...options.metadata,
      terminalId: context.terminalId,
    },
  };

  // Remove old/new values if not requested
  if (!options.includeOldValues) {
    delete finalEntry.oldValues;
  }
  if (!options.includeNewValues) {
    delete finalEntry.newValues;
  }

  await auditRepo.createAuditEntry(pool, finalEntry, {
    userName: context.userName,
    userRole: context.userRole,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    sessionId: context.sessionId,
  });
}

/**
 * Specialized audit functions for common operations
 */

export async function logSaleCreated(
  pool: Pool,
  saleId: string,
  saleNumber: string,
  saleData: any,
  context: AuditContext
): Promise<void> {
  await logAction(
    pool,
    {
      entityType: 'SALE',
      entityId: saleId,
      entityNumber: saleNumber,
      action: 'CREATE',
      actionDetails: `Sale ${saleNumber} created`,
      userId: context.userId,
      newValues: saleData,
      metadata: {
        totalAmount: saleData.totalAmount,
        paymentMethod: saleData.paymentMethod,
        itemCount: saleData.items?.length || 0,
      },
    },
    context,
    { includeNewValues: true }
  );
}

export async function logSaleVoided(
  pool: Pool,
  saleId: string,
  saleNumber: string,
  reason: string,
  oldSaleData: any,
  context: AuditContext
): Promise<void> {
  await logAction(
    pool,
    {
      entityType: 'SALE',
      entityId: saleId,
      entityNumber: saleNumber,
      action: 'VOID',
      actionDetails: `Sale ${saleNumber} voided: ${reason}`,
      userId: context.userId,
      oldValues: oldSaleData,
      metadata: {
        voidReason: reason,
        originalAmount: oldSaleData.totalAmount,
      },
      severity: 'WARNING',
    },
    context,
    { includeOldValues: true }
  );
}

export async function logPaymentRecorded(
  pool: Pool,
  invoiceId: string,
  invoiceNumber: string,
  paymentData: any,
  context: AuditContext
): Promise<void> {
  await logAction(
    pool,
    {
      entityType: 'PAYMENT',
      entityId: invoiceId,
      entityNumber: invoiceNumber,
      action: 'CREATE',
      actionDetails: `Payment recorded for invoice ${invoiceNumber}`,
      userId: context.userId,
      newValues: paymentData,
      metadata: {
        amount: paymentData.amount,
        paymentMethod: paymentData.paymentMethod,
      },
    },
    context
  );
}

export async function logDiscountApplied(
  pool: Pool,
  entityType: string,
  entityId: string,
  discountData: any,
  managerApproval: boolean,
  context: AuditContext
): Promise<void> {
  await logAction(
    pool,
    {
      entityType: entityType as any,
      entityId: entityId,
      action: 'UPDATE',
      actionDetails: `Discount applied${managerApproval ? ' (Manager Approved)' : ''}`,
      userId: context.userId,
      newValues: discountData,
      metadata: {
        discountType: discountData.type,
        discountValue: discountData.value,
        discountAmount: discountData.amount,
        managerApproved: managerApproval,
      },
      severity: managerApproval ? 'WARNING' : 'INFO',
    },
    context
  );
}

export async function logUserLogin(
  pool: Pool,
  userId: string,
  userName: string,
  success: boolean,
  context: AuditContext,
  errorMessage?: string
): Promise<void> {
  await logAction(
    pool,
    {
      entityType: 'SESSION',
      action: 'LOGIN',
      actionDetails: success
        ? `User ${userName} logged in`
        : `Failed login attempt for ${userName}`,
      userId: userId || 'UNKNOWN',
      success,
      errorMessage,
      severity: success ? 'INFO' : 'WARNING',
    },
    context
  );
}

export async function logUserLogout(
  pool: Pool,
  userId: string,
  context: AuditContext
): Promise<void> {
  await logAction(
    pool,
    {
      entityType: 'SESSION',
      action: 'LOGOUT',
      actionDetails: `User logged out`,
      userId: userId,
    },
    context
  );
}

/**
 * Query audit logs
 */
export async function getAuditLogs(
  pool: Pool,
  filters: any,
  page: number = 1,
  limit: number = 50
): Promise<{ logs: any[]; total: number; page: number; totalPages: number }> {
  const result = await auditRepo.getAuditLogs(pool, {
    ...filters,
    page,
    limit,
  });

  return {
    logs: result.logs,
    total: result.total,
    page,
    totalPages: Math.ceil(result.total / limit),
  };
}

export async function getEntityHistory(
  pool: Pool,
  entityType: string,
  entityId: string
): Promise<any[]> {
  return await auditRepo.getEntityAuditTrail(pool, entityType, entityId);
}
```

---

## Phase 5: Integration with Existing Code (Week 2, Days 3-5)

### 5.1 Sales Module Integration

**File**: `SamplePOS.Server/src/modules/sales/salesService.ts`

Add audit logging to critical operations:

```typescript
import * as auditService from '../audit/auditService';

// In createSale function, after successful sale creation:
try {
  // ... existing sale creation code ...
  
  // ✅ ADD: Audit logging
  await auditService.logSaleCreated(
    pool,
    saleRecord.id,
    saleRecord.sale_number,
    {
      customerId: saleData.customerId,
      items: saleData.items,
      totalAmount: saleData.totalAmount,
      paymentMethod: saleData.paymentMethod,
    },
    {
      userId: soldBy,
      userName: req.user?.name,
      userRole: req.user?.role,
      sessionId: req.sessionID,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    }
  );
  
  return saleRecord;
} catch (error) {
  // ✅ ADD: Log failed sale attempt
  await auditRepo.recordFailedTransaction(pool, {
    userId: soldBy,
    transactionType: 'SALE',
    transactionData: saleData,
    errorMessage: error.message,
    errorDetails: error,
  });
  
  throw error;
}
```

### 5.2 Invoice Module Integration

**File**: `SamplePOS.Server/src/modules/invoices/invoiceService.ts`

```typescript
// In recordPayment function:
await auditService.logPaymentRecorded(
  pool,
  invoiceId,
  invoice.invoice_number,
  {
    amount: paymentData.amount,
    paymentMethod: paymentData.paymentMethod,
    referenceNumber: paymentData.referenceNumber,
  },
  {
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    sessionId: req.sessionID,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  }
);
```

### 5.3 Authentication Integration

**File**: `SamplePOS.Server/src/middleware/auth.ts`

```typescript
// In login handler:
await auditService.logUserLogin(
  pool,
  user.id,
  user.name,
  true, // success
  {
    userId: user.id,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    sessionId: req.sessionID,
  }
);

// In failed login:
await auditService.logUserLogin(
  pool,
  'UNKNOWN',
  loginData.username,
  false, // failed
  {
    userId: 'UNKNOWN',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  },
  'Invalid credentials'
);
```

---

## Phase 6: Frontend Integration (Week 2, Days 6-7 + Week 3, Days 1-2)

### 6.1 Audit Log Viewer Component

**File**: `samplepos.client/src/pages/admin/AuditLogPage.tsx`

```typescript
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import { formatCurrency } from '../../utils/currency';
import { api } from '../../utils/api';

export default function AuditLogPage() {
  const [filters, setFilters] = useState({
    entityType: '',
    userId: '',
    action: '',
    startDate: '',
    endDate: '',
    severity: '',
  });
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['auditLogs', filters, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        ...filters,
        page: page.toString(),
        limit: '50',
      });
      const response = await api.get(`/api/audit?${params}`);
      return response.data;
    },
  });

  return (
    <Layout>
      <div className="p-6">
        <h1 className="text-3xl font-bold mb-6">Audit Trail</h1>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Add filter inputs */}
          </div>
        </div>

        {/* Audit Log Table */}
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date/Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entity</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data?.logs?.map((log: any) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {log.userName}
                    <div className="text-xs text-gray-500">{log.userRole}</div>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2 py-1 rounded text-xs ${
                      log.action === 'CREATE' ? 'bg-green-100 text-green-800' :
                      log.action === 'UPDATE' ? 'bg-blue-100 text-blue-800' :
                      log.action === 'DELETE' ? 'bg-red-100 text-red-800' :
                      log.action === 'VOID' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {log.entityType}
                    {log.entityNumber && (
                      <div className="text-xs text-gray-500">{log.entityNumber}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm">{log.actionDetails}</td>
                  <td className="px-6 py-4 text-sm">
                    {log.success ? (
                      <span className="text-green-600">✓</span>
                    ) : (
                      <span className="text-red-600" title={log.errorMessage}>✗</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="mt-4 flex justify-between items-center">
          <div className="text-sm text-gray-600">
            Showing {data?.logs?.length || 0} of {data?.total || 0} entries
          </div>
          <div className="flex gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              className="px-4 py-2 border rounded disabled:opacity-50"
            >
              Previous
            </button>
            <button
              disabled={page >= (data?.totalPages || 1)}
              onClick={() => setPage(p => p + 1)}
              className="px-4 py-2 border rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
```

---

## Phase 7: Testing & Validation (Week 3, Days 3-5)

### 7.1 Unit Tests

```typescript
// Test audit repository
// Test audit service
// Test integration with sales/invoices
```

### 7.2 Integration Tests

```powershell
# Test audit trail creation
# Test querying audit logs
# Test performance with large datasets
```

---

## Success Criteria

- ✅ All COPILOT rules followed (no ORM, layered architecture, timezone handling)
- ✅ Zero impact on existing functionality (graceful degradation)
- ✅ Comprehensive audit coverage (sales, payments, discounts, logins)
- ✅ Fast queries with proper indexing
- ✅ User-friendly audit log viewer
- ✅ Failed transaction tracking
- ✅ Session management
- ✅ Export capabilities (CSV/PDF)

---

## Rollback Plan

If audit system causes issues:
1. Disable audit calls (commenting out `await auditService.log...` calls)
2. System continues functioning normally
3. No data loss
4. Can re-enable after fix

---

**Status**: Ready for implementation  
**Next Step**: Database migration (Phase 1)
