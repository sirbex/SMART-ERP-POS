/**
 * Journal Entry Approval Workflow Service
 * 
 * SAP-style document parking and approval workflow.
 * 
 * Flow:
 *   1. JE created as DRAFT (parked) instead of directly POSTED
 *   2. Approval rules evaluated based on amount thresholds
 *   3. If auto-approve: immediately posted
 *   4. If requires approval: PENDING status, awaits reviewer
 *   5. Reviewer approves → POSTED; rejects → REJECTED
 *   6. Full audit trail of all actions
 */

import { pool as globalPool } from '../../db/pool.js';
import type pg from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { UnitOfWork } from '../../db/unitOfWork.js';
import { ValidationError, NotFoundError } from '../../middleware/errorHandler.js';
import logger from '../../utils/logger.js';

// =============================================================================
// TYPES
// =============================================================================

export interface ApprovalRule {
  id: string;
  name: string;
  minAmount: number;
  maxAmount: number | null;
  requiredRole: string;
  autoApprove: boolean;
  isActive: boolean;
}

export interface ApprovalRequest {
  id: string;
  transactionId: string;
  requestedBy: string;
  requestedAt: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  totalAmount: number;
  approvalRuleId: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
}

export interface ApprovalDecision {
  action: 'APPROVE' | 'REJECT';
  notes?: string;
}

// =============================================================================
// APPROVAL RULES
// =============================================================================

export const getApprovalRules = async (pool?: pg.Pool): Promise<ApprovalRule[]> => {
  const dbPool = pool || globalPool;
  const result = await dbPool.query(
    `SELECT * FROM je_approval_rules WHERE is_active = true ORDER BY min_amount ASC`
  );
  return result.rows.map(normalizeRule);
};

export const createApprovalRule = async (
  data: { name: string; minAmount: number; maxAmount?: number; requiredRole: string; autoApprove?: boolean },
  pool?: pg.Pool
): Promise<ApprovalRule> => {
  const dbPool = pool || globalPool;
  const result = await dbPool.query(
    `INSERT INTO je_approval_rules (id, name, min_amount, max_amount, required_role, auto_approve)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [uuidv4(), data.name, data.minAmount, data.maxAmount || null, data.requiredRole, data.autoApprove || false]
  );
  return normalizeRule(result.rows[0]);
};

export const updateApprovalRule = async (
  id: string,
  data: Partial<Omit<ApprovalRule, 'id'>>,
  pool?: pg.Pool
): Promise<ApprovalRule> => {
  const dbPool = pool || globalPool;
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (data.name !== undefined) { sets.push(`name = $${idx++}`); params.push(data.name); }
  if (data.minAmount !== undefined) { sets.push(`min_amount = $${idx++}`); params.push(data.minAmount); }
  if (data.maxAmount !== undefined) { sets.push(`max_amount = $${idx++}`); params.push(data.maxAmount); }
  if (data.requiredRole !== undefined) { sets.push(`required_role = $${idx++}`); params.push(data.requiredRole); }
  if (data.autoApprove !== undefined) { sets.push(`auto_approve = $${idx++}`); params.push(data.autoApprove); }
  if (data.isActive !== undefined) { sets.push(`is_active = $${idx++}`); params.push(data.isActive); }

  if (sets.length === 0) {
    const existing = await dbPool.query(`SELECT * FROM je_approval_rules WHERE id = $1`, [id]);
    if (existing.rows.length === 0) throw new NotFoundError('Approval rule');
    return normalizeRule(existing.rows[0]);
  }

  params.push(id);
  const result = await dbPool.query(
    `UPDATE je_approval_rules SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    params
  );
  if (result.rows.length === 0) throw new NotFoundError('Approval rule');
  return normalizeRule(result.rows[0]);
};

// =============================================================================
// APPROVAL WORKFLOW
// =============================================================================

/**
 * Determine which approval rule applies to a given amount.
 * Returns null if no rule applies (auto-post).
 */
export const findApplicableRule = async (
  amount: number,
  pool?: pg.Pool
): Promise<ApprovalRule | null> => {
  const dbPool = pool || globalPool;
  const result = await dbPool.query(
    `SELECT * FROM je_approval_rules
     WHERE is_active = true
       AND min_amount <= $1
       AND (max_amount IS NULL OR max_amount >= $1)
     ORDER BY min_amount DESC
     LIMIT 1`,
    [amount]
  );
  return result.rows[0] ? normalizeRule(result.rows[0]) : null;
};

/**
 * Submit a journal entry for approval.
 * If the matching rule is auto-approve, immediately posts.
 */
export const submitForApproval = async (
  transactionId: string,
  totalAmount: number,
  requestedBy: string,
  pool?: pg.Pool
): Promise<ApprovalRequest> => {
  const dbPool = pool || globalPool;

  const rule = await findApplicableRule(totalAmount, dbPool);

  // No rule or auto-approve → immediately approve
  if (!rule || rule.autoApprove) {
    // Post the transaction
    await dbPool.query(
      `UPDATE ledger_transactions SET "Status" = 'POSTED', "UpdatedAt" = NOW() WHERE "Id" = $1`,
      [transactionId]
    );

    const result = await dbPool.query(
      `INSERT INTO je_approval_requests (id, transaction_id, requested_by, status, total_amount, approval_rule_id, reviewed_by, reviewed_at, review_notes)
       VALUES ($1, $2, $3, 'APPROVED', $4, $5, $3, NOW(), 'Auto-approved per rule: ${rule?.name || 'No rule applies'}')
       RETURNING *`,
      [uuidv4(), transactionId, requestedBy, totalAmount, rule?.id || null]
    );

    logger.info('Journal entry auto-approved', { transactionId, amount: totalAmount, rule: rule?.name || 'none' });
    return normalizeRequest(result.rows[0]);
  }

  // Requires approval → park as DRAFT
  await dbPool.query(
    `UPDATE ledger_transactions SET "Status" = 'DRAFT', "UpdatedAt" = NOW() WHERE "Id" = $1`,
    [transactionId]
  );

  const result = await dbPool.query(
    `INSERT INTO je_approval_requests (id, transaction_id, requested_by, status, total_amount, approval_rule_id)
     VALUES ($1, $2, $3, 'PENDING', $4, $5)
     RETURNING *`,
    [uuidv4(), transactionId, requestedBy, totalAmount, rule.id]
  );

  logger.info('Journal entry submitted for approval', { transactionId, amount: totalAmount, rule: rule.name, requiredRole: rule.requiredRole });
  return normalizeRequest(result.rows[0]);
};

/**
 * Review (approve/reject) a pending approval request.
 */
export const reviewApproval = async (
  requestId: string,
  decision: ApprovalDecision,
  reviewedBy: string,
  pool?: pg.Pool
): Promise<ApprovalRequest> => {
  const dbPool = pool || globalPool;

  return UnitOfWork.run(dbPool, async (client) => {
    // Lock the request
    const reqResult = await client.query(
      `SELECT * FROM je_approval_requests WHERE id = $1 FOR UPDATE`,
      [requestId]
    );
    if (reqResult.rows.length === 0) throw new NotFoundError('Approval request');

    const request = normalizeRequest(reqResult.rows[0]);
    if (request.status !== 'PENDING') {
      throw new ValidationError(`Request already ${request.status}`);
    }

    const newStatus = decision.action === 'APPROVE' ? 'APPROVED' : 'REJECTED';

    // Update request
    const updateResult = await client.query(
      `UPDATE je_approval_requests
       SET status = $1, reviewed_by = $2, reviewed_at = NOW(), review_notes = $3
       WHERE id = $4 RETURNING *`,
      [newStatus, reviewedBy, decision.notes || null, requestId]
    );

    // Update transaction status based on decision
    if (decision.action === 'APPROVE') {
      await client.query(
        `UPDATE ledger_transactions SET "Status" = 'POSTED', "UpdatedAt" = NOW() WHERE "Id" = $1`,
        [request.transactionId]
      );
    }
    // REJECTED transactions remain as DRAFT — can be modified and resubmitted

    logger.info('Approval request reviewed', { requestId, decision: decision.action, reviewedBy });
    return normalizeRequest(updateResult.rows[0]);
  });
};

/**
 * Get pending approval requests (for reviewers/managers).
 */
export const getPendingApprovals = async (
  pool?: pg.Pool
): Promise<(ApprovalRequest & { description?: string; referenceNumber?: string })[]> => {
  const dbPool = pool || globalPool;
  const result = await dbPool.query(
    `SELECT ar.*, lt."Description" as description, lt."ReferenceNumber" as reference_number
     FROM je_approval_requests ar
     JOIN ledger_transactions lt ON ar.transaction_id = lt."Id"
     WHERE ar.status = 'PENDING'
     ORDER BY ar.requested_at ASC`
  );
  return result.rows.map(r => ({
    ...normalizeRequest(r),
    description: r.description,
    referenceNumber: r.reference_number,
  }));
};

/**
 * Get approval history for a transaction.
 */
export const getApprovalHistory = async (
  transactionId: string,
  pool?: pg.Pool
): Promise<ApprovalRequest[]> => {
  const dbPool = pool || globalPool;
  const result = await dbPool.query(
    `SELECT * FROM je_approval_requests WHERE transaction_id = $1 ORDER BY requested_at DESC`,
    [transactionId]
  );
  return result.rows.map(normalizeRequest);
};

// =============================================================================
// NORMALIZERS
// =============================================================================

function normalizeRule(row: Record<string, unknown>): ApprovalRule {
  return {
    id: row.id as string,
    name: row.name as string,
    minAmount: Number(row.min_amount),
    maxAmount: row.max_amount != null ? Number(row.max_amount) : null,
    requiredRole: row.required_role as string,
    autoApprove: row.auto_approve as boolean,
    isActive: row.is_active as boolean,
  };
}

function normalizeRequest(row: Record<string, unknown>): ApprovalRequest {
  return {
    id: row.id as string,
    transactionId: row.transaction_id as string,
    requestedBy: row.requested_by as string,
    requestedAt: row.requested_at as string,
    status: row.status as ApprovalRequest['status'],
    totalAmount: Number(row.total_amount),
    approvalRuleId: row.approval_rule_id as string | null,
    reviewedBy: row.reviewed_by as string | null,
    reviewedAt: row.reviewed_at as string | null,
    reviewNotes: row.review_notes as string | null,
  };
}
