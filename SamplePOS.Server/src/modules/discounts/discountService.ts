// Discount Service - Business logic for discount system

import { Pool } from 'pg';
import Decimal from 'decimal.js';
import { Money } from '../../utils/money.js';
import * as discountRepo from './discountRepository.js';
import * as auditService from '../audit/auditService.js';
import { calculateDiscountAmount, isDiscountAllowed, RoleDiscountLimits } from '@shared/zod/discount';
import type { Discount, ApplyDiscount } from '@shared/zod/discount';
import type { AuditContext } from '@shared/types/audit';

const ROLE_LIMITS: RoleDiscountLimits = {
  ADMIN: 100,
  MANAGER: 50,
  CASHIER: 10,
  STAFF: 5,
};

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
 * Create new discount rule (ADMIN only)
 */
export async function createDiscount(
  pool: Pool,
  discount: Omit<Discount, 'id' | 'createdAt' | 'updatedAt'>,
  userRole: string
): Promise<Discount> {
  if (userRole !== 'ADMIN') {
    throw new Error('Only ADMIN can create discount rules');
  }

  const row = await discountRepo.createDiscount(pool, discount);
  return normalizeDiscount(row);
}

/**
 * Update discount
 */
export async function updateDiscount(
  pool: Pool,
  id: string,
  updates: Partial<Discount>,
  userRole: string
): Promise<Discount | null> {
  if (userRole !== 'ADMIN') {
    throw new Error('Only ADMIN can update discount rules');
  }

  const row = await discountRepo.updateDiscount(pool, id, updates);
  return row ? normalizeDiscount(row) : null;
}

/**
 * Delete (deactivate) discount
 */
export async function deleteDiscount(pool: Pool, id: string, userRole: string): Promise<boolean> {
  if (userRole !== 'ADMIN') {
    throw new Error('Only ADMIN can delete discount rules');
  }

  return discountRepo.deleteDiscount(pool, id);
}

/**
 * Validate discount application
 * Checks role limits and approval requirements
 */
export async function validateDiscountApplication(
  pool: Pool,
  discountData: ApplyDiscount,
  userRole: string,
  originalAmount: number
): Promise<{
  valid: boolean;
  requiresApproval: boolean;
  discountAmount: number;
  errors: string[];
}> {
  const errors: string[] = [];

  // Calculate discount percentage if fixed amount
  let discountPercentage = discountData.value;
  if (discountData.type === 'FIXED_AMOUNT') {
    discountPercentage = new Decimal(discountData.value).dividedBy(originalAmount).times(100).toNumber();
  }

  // Check role limits
  const allowed = isDiscountAllowed(userRole, discountPercentage, ROLE_LIMITS);
  const requiresApproval = !allowed;

  if (!allowed && !discountData.managerPin) {
    errors.push(`Discount exceeds your limit. Manager approval required.`);
  }

  // Calculate discount amount
  const discountAmount = calculateDiscountAmount(
    originalAmount,
    discountData.type,
    discountData.value
  );

  // Validate discount doesn't exceed original amount
  if (discountAmount > originalAmount) {
    errors.push('Discount cannot exceed original amount');
  }

  // Validate reason provided
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
 * Creates authorization record if needed
 */
export async function applyDiscount(
  pool: Pool,
  saleId: string,
  discountData: ApplyDiscount,
  originalAmount: number,
  userId: string,
  userName: string,
  userRole: string,
  auditContext?: AuditContext,
  saleNumber?: string
): Promise<{
  success: boolean;
  discountAmount: number;
  finalAmount: number;
  authorizationId?: string;
  requiresApproval: boolean;
}> {
  // Validate discount
  const validation = await validateDiscountApplication(
    pool,
    discountData,
    userRole,
    originalAmount
  );

  if (!validation.valid) {
    throw new Error(validation.errors.join(', '));
  }

  const discountAmount = validation.discountAmount;
  const finalAmount = new Decimal(originalAmount).minus(discountAmount).toNumber();

  // Calculate percentage for audit
  const discountPercentage = new Decimal(discountAmount).dividedBy(originalAmount).times(100).toNumber();

  // Create authorization record
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

  // If no approval required, auto-approve
  if (!validation.requiresApproval) {
    await discountRepo.approveDiscountAuthorization(pool, auth.id, userId, userName);
  }

  // Log discount application to audit trail
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
 * Approve discount with manager PIN
 */
export async function approveDiscount(
  pool: Pool,
  authorizationId: string,
  managerPin: string,
  managerId: string,
  managerName: string,
  managerRole: string,
  auditContext?: AuditContext
): Promise<boolean> {
  // Verify manager role
  if (managerRole !== 'MANAGER' && managerRole !== 'ADMIN') {
    throw new Error('Only MANAGER or ADMIN can approve discounts');
  }

  // TODO: Verify PIN against user record (bcrypt compare)
  // For now, we'll skip PIN verification in this implementation
  // In production, add: await verifyUserPin(pool, managerId, managerPin)

  const result = await discountRepo.approveDiscountAuthorization(
    pool,
    authorizationId,
    managerId,
    managerName
  );

  // Log approval to audit trail
  if (result && auditContext) {
    try {
      // Get authorization details for logging
      const auth = await discountRepo.findAuthorizationById(pool, authorizationId);
      if (auth) {
        await auditService.logDiscountApproved(
          pool,
          authorizationId,
          {
            saleId: auth.sale_id,
            saleNumber: auth.sale_id, // TODO: Fetch actual sale number if needed
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

/**
 * Normalize database row to Discount type
 */
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
