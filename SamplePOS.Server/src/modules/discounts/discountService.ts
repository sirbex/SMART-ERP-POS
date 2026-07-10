// Discount Service - Business logic for discount system

import { Pool } from 'pg';
import Decimal from 'decimal.js';
import { Money } from '../../utils/money.js';
import * as discountRepo from './discountRepository.js';
import * as auditService from '../audit/auditService.js';
import { calculateDiscountAmount } from '../../../../shared/zod/discount.js';
import {
  isDiscountWithinLimit,
  resolveDiscountLimitPercent,
} from '@shared/authorization/discountPolicy.js';
import type { Discount, ApplyDiscount } from '../../../../shared/zod/discount.js';
import type { AuditContext } from '../../../../shared/types/audit.js';
import { userHasPermission, assertUserPermission } from '../../authorization/serviceAuth.js';

/**
 * Get all active discounts
 */
export async function getActiveDiscounts(pool: Pool): Promise<Discount[]> {
  const rows = await discountRepo.findActiveDiscounts(pool);
  return rows.map(normalizeDiscount);
}

/**
 * Get discount by ID
 */
export async function getDiscountById(pool: Pool, id: string): Promise<Discount | null> {
  const row = await discountRepo.findDiscountById(pool, id);
  return row ? normalizeDiscount(row) : null;
}

/**
 * Create new discount rule.
 * Authorization enforced at route via requirePermission('admin.create').
 */
export async function createDiscount(
  pool: Pool,
  discount: Omit<Discount, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Discount> {
  const row = await discountRepo.createDiscount(pool, discount);
  return normalizeDiscount(row);
}

/**
 * Update discount rule.
 * Authorization enforced at route via requirePermission('admin.update').
 */
export async function updateDiscount(
  pool: Pool,
  id: string,
  updates: Partial<Discount>
): Promise<Discount | null> {
  const row = await discountRepo.updateDiscount(pool, id, updates);
  return row ? normalizeDiscount(row) : null;
}

/**
 * Delete (deactivate) discount.
 * Authorization enforced at route via requirePermission('admin.delete').
 */
export async function deleteDiscount(pool: Pool, id: string): Promise<boolean> {
  return discountRepo.deleteDiscount(pool, id);
}

/**
 * Validate discount application using permission-based limits.
 */
export async function validateDiscountApplication(
  pool: Pool,
  discountData: ApplyDiscount,
  userId: string,
  originalAmount: number,
  legacyRole?: string | null
): Promise<{
  valid: boolean;
  requiresApproval: boolean;
  discountAmount: number;
  errors: string[];
}> {
  const errors: string[] = [];

  let discountPercentage = discountData.value;
  if (discountData.type === 'FIXED_AMOUNT') {
    discountPercentage = new Decimal(discountData.value).dividedBy(originalAmount).times(100).toNumber();
  }

  const maxAllowed = await resolveDiscountLimitPercent((key) =>
    userHasPermission(pool, userId, key, legacyRole)
  );
  const allowed = isDiscountWithinLimit(discountPercentage, maxAllowed);
  const requiresApproval = !allowed;

  if (!allowed && !discountData.managerPin) {
    errors.push('Discount exceeds your limit. Manager approval required.');
  }

  const discountAmount = calculateDiscountAmount(
    originalAmount,
    discountData.type,
    discountData.value
  );

  if (discountAmount > originalAmount) {
    errors.push('Discount cannot exceed original amount');
  }

  if (!discountData.reason || discountData.reason.trim().length < 5) {
    errors.push('Discount reason required (minimum 5 characters)');
  }

  return {
    valid: errors.length === 0,
    requiresApproval,
    discountAmount,
    errors,
  };
}

/**
 * Apply discount to sale
 */
export async function applyDiscount(
  pool: Pool,
  saleId: string,
  discountData: ApplyDiscount,
  originalAmount: number,
  userId: string,
  userName: string,
  legacyRole: string | null | undefined,
  auditContext?: AuditContext,
  saleNumber?: string
): Promise<{
  success: boolean;
  discountAmount: number;
  finalAmount: number;
  authorizationId?: string;
  requiresApproval: boolean;
}> {
  const validation = await validateDiscountApplication(
    pool,
    discountData,
    userId,
    originalAmount,
    legacyRole
  );

  if (!validation.valid) {
    throw new Error(validation.errors.join(', '));
  }

  const discountAmount = validation.discountAmount;
  const finalAmount = new Decimal(originalAmount).minus(discountAmount).toNumber();
  const discountPercentage = new Decimal(discountAmount).dividedBy(originalAmount).times(100).toNumber();

  const auth = await discountRepo.createDiscountAuthorization(pool, {
    saleId,
    discountId: discountData.discountId,
    discountAmount,
    discountType: discountData.type,
    discountPercentage,
    originalAmount,
    finalAmount,
    reason: discountData.reason,
    requestedBy: userId,
    requestedByName: userName,
  });

  if (!validation.requiresApproval) {
    await discountRepo.approveDiscountAuthorization(pool, auth.id, userId, userName);
  }

  if (auditContext) {
    try {
      await auditService.logDiscountApplied(
        pool,
        auth.id,
        saleId,
        saleNumber || saleId,
        {
          discountType: discountData.type,
          discountAmount,
          originalAmount,
          finalAmount,
          reason: discountData.reason,
          requiresApproval: validation.requiresApproval,
        },
        auditContext
      );
    } catch (auditError) {
      console.error('⚠️ Audit logging failed for discount (non-fatal):', auditError);
    }
  }

  return {
    success: true,
    discountAmount,
    finalAmount,
    authorizationId: auth.id,
    requiresApproval: validation.requiresApproval,
  };
}

/**
 * Approve discount with manager PIN.
 * Requires sales.approve permission (enforced at route + service defense-in-depth).
 */
export async function approveDiscount(
  pool: Pool,
  authorizationId: string,
  managerPin: string,
  managerId: string,
  managerName: string,
  legacyRole: string | null | undefined,
  auditContext?: AuditContext
): Promise<boolean> {
  await assertUserPermission(pool, managerId, 'sales.approve', {
    legacyRole,
    errorCode: 'ERR_DISCOUNT_APPROVE_DENIED',
    message: 'Approver must have sales.approve permission',
  });

  // TODO: Verify PIN against user record (bcrypt compare)
  void managerPin;

  const result = await discountRepo.approveDiscountAuthorization(
    pool,
    authorizationId,
    managerId,
    managerName
  );

  if (result && auditContext) {
    try {
      const auth = await discountRepo.findAuthorizationById(pool, authorizationId);
      if (auth) {
        await auditService.logDiscountApproved(
          pool,
          authorizationId,
          {
            saleId: auth.sale_id,
            saleNumber: auth.sale_id,
            discountAmount: Money.toNumber(Money.parseDb(auth.discount_amount)),
            requestedBy: auth.requested_by_name,
            approvedBy: managerName,
          },
          auditContext
        );
      }
    } catch (auditError) {
      console.error('⚠️ Audit logging failed for discount approval (non-fatal):', auditError);
    }
  }

  return result !== null;
}

/**
 * Get pending discount authorizations
 */
export async function getPendingAuthorizations(pool: Pool): Promise<Record<string, unknown>[]> {
  const rows = await discountRepo.findPendingAuthorizations(pool);
  return rows.map((row) => ({
    id: row.id,
    saleId: row.sale_id,
    discountAmount: Money.toNumber(Money.parseDb(row.discount_amount)),
    discountType: row.discount_type,
    originalAmount: Money.toNumber(Money.parseDb(row.original_amount)),
    finalAmount: Money.toNumber(Money.parseDb(row.final_amount)),
    reason: row.reason,
    requestedBy: row.requested_by,
    requestedByName: row.requested_by_name,
    status: row.status,
    createdAt: row.created_at,
  }));
}

function normalizeDiscount(row: discountRepo.DiscountDbRow): Discount {
  return {
    id: row.id,
    name: row.name,
    type: row.type as 'PERCENTAGE' | 'FIXED_AMOUNT' | 'BUY_X_GET_Y',
    scope: row.scope as 'CUSTOMER' | 'LINE_ITEM' | 'CART',
    value: Money.toNumber(Money.parseDb(row.value)),
    maxDiscountAmount: row.max_discount_amount ? Money.toNumber(Money.parseDb(row.max_discount_amount)) : null,
    minPurchaseAmount: row.min_purchase_amount ? Money.toNumber(Money.parseDb(row.min_purchase_amount)) : null,
    requiresApproval: row.requires_approval,
    approvalRoles: row.approval_roles || undefined,
    isActive: row.is_active,
    validFrom: row.valid_from || undefined,
    validUntil: row.valid_until || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
  };
}
