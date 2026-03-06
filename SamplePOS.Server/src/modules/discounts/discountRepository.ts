// Discount Repository - Database operations for discount system

import { Pool } from 'pg';
import { Discount, DiscountAuthorization } from '@shared/zod/discount';

export interface DiscountDbRow {
  id: string;
  name: string;
  type: string;
  scope: string;
  value: string;
  max_discount_amount: string | null;
  min_purchase_amount: string | null;
  requires_approval: boolean;
  approval_roles: string[] | null;
  is_active: boolean;
  valid_from: string | null;
  valid_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface DiscountAuthorizationDbRow {
  id: string;
  sale_id: string;
  discount_id: string | null;
  discount_amount: string;
  discount_type: string;
  discount_percentage: string | null;
  original_amount: string;
  final_amount: string;
  reason: string;
  requested_by: string;
  requested_by_name: string;
  approved_by: string | null;
  approved_by_name: string | null;
  status: string;
  created_at: string;
  approved_at: string | null;
}

/**
 * Get all active discounts
 */
export async function findActiveDiscounts(pool: Pool): Promise<DiscountDbRow[]> {
  const result = await pool.query(
    `SELECT * FROM discounts 
     WHERE is_active = true 
     AND (valid_from IS NULL OR valid_from <= NOW())
     AND (valid_until IS NULL OR valid_until >= NOW())
     ORDER BY name`
  );
  return result.rows;
}

/**
 * Get discount by ID
 */
export async function findDiscountById(pool: Pool, id: string): Promise<DiscountDbRow | null> {
  const result = await pool.query(
    'SELECT * FROM discounts WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Create new discount rule
 */
export async function createDiscount(
  pool: Pool,
  discount: Omit<Discount, 'id' | 'createdAt' | 'updatedAt'>
): Promise<DiscountDbRow> {
  const result = await pool.query(
    `INSERT INTO discounts (
      name, type, scope, value, max_discount_amount, min_purchase_amount,
      requires_approval, approval_roles, is_active, valid_from, valid_until
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *`,
    [
      discount.name,
      discount.type,
      discount.scope,
      discount.value,
      discount.maxDiscountAmount,
      discount.minPurchaseAmount,
      discount.requiresApproval,
      discount.approvalRoles ? JSON.stringify(discount.approvalRoles) : null,
      discount.isActive,
      discount.validFrom,
      discount.validUntil,
    ]
  );
  return result.rows[0];
}

/**
 * Update discount
 */
export async function updateDiscount(
  pool: Pool,
  id: string,
  updates: Partial<Discount>
): Promise<DiscountDbRow | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (updates.name !== undefined) {
    fields.push(`name = $${paramIndex++}`);
    values.push(updates.name);
  }
  if (updates.value !== undefined) {
    fields.push(`value = $${paramIndex++}`);
    values.push(updates.value);
  }
  if (updates.isActive !== undefined) {
    fields.push(`is_active = $${paramIndex++}`);
    values.push(updates.isActive);
  }
  if (updates.requiresApproval !== undefined) {
    fields.push(`requires_approval = $${paramIndex++}`);
    values.push(updates.requiresApproval);
  }

  if (fields.length === 0) {
    return findDiscountById(pool, id);
  }

  values.push(id);
  const result = await pool.query(
    `UPDATE discounts SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

/**
 * Delete (deactivate) discount
 */
export async function deleteDiscount(pool: Pool, id: string): Promise<boolean> {
  const result = await pool.query(
    'UPDATE discounts SET is_active = false WHERE id = $1',
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Create discount authorization record
 */
export async function createDiscountAuthorization(
  pool: Pool,
  auth: {
    saleId: string;
    discountId?: string;
    discountAmount: number;
    discountType: string;
    discountPercentage?: number;
    originalAmount: number;
    finalAmount: number;
    reason: string;
    requestedBy: string;
    requestedByName: string;
  }
): Promise<DiscountAuthorizationDbRow> {
  const result = await pool.query(
    `INSERT INTO discount_authorizations (
      sale_id, discount_id, discount_amount, discount_type, discount_percentage,
      original_amount, final_amount, reason, requested_by, requested_by_name, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PENDING')
    RETURNING *`,
    [
      auth.saleId,
      auth.discountId || null,
      auth.discountAmount,
      auth.discountType,
      auth.discountPercentage || null,
      auth.originalAmount,
      auth.finalAmount,
      auth.reason,
      auth.requestedBy,
      auth.requestedByName,
    ]
  );
  return result.rows[0];
}

/**
 * Approve discount authorization
 */
export async function approveDiscountAuthorization(
  pool: Pool,
  authId: string,
  approvedBy: string,
  approvedByName: string
): Promise<DiscountAuthorizationDbRow | null> {
  const result = await pool.query(
    `UPDATE discount_authorizations 
     SET status = 'APPROVED', approved_by = $2, approved_by_name = $3, approved_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [authId, approvedBy, approvedByName]
  );
  return result.rows[0] || null;
}

/**
 * Reject discount authorization
 */
export async function rejectDiscountAuthorization(
  pool: Pool,
  authId: string,
  rejectedBy: string
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE discount_authorizations 
     SET status = 'REJECTED', approved_by = $2, approved_at = NOW()
     WHERE id = $1`,
    [authId, rejectedBy]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Get pending discount authorizations for a user
 */
export async function findPendingAuthorizations(pool: Pool): Promise<DiscountAuthorizationDbRow[]> {
  const result = await pool.query(
    `SELECT * FROM discount_authorizations 
     WHERE status = 'PENDING'
     ORDER BY created_at DESC`
  );
  return result.rows;
}

/**
 * Find discount authorization by ID
 */
export async function findAuthorizationById(pool: Pool, id: string): Promise<DiscountAuthorizationDbRow | null> {
  const result = await pool.query(
    `SELECT * FROM discount_authorizations WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Create sale discount record
 */
export async function createSaleDiscount(
  pool: Pool,
  saleDiscount: {
    saleId: string;
    saleItemId?: string;
    discountId?: string;
    discountType: string;
    discountValue: number;
    discountAmount: number;
    originalAmount: number;
    finalAmount: number;
    authorizationId?: string;
  }
): Promise<void> {
  await pool.query(
    `INSERT INTO sale_discounts (
      sale_id, sale_item_id, discount_id, discount_type, discount_value,
      discount_amount, original_amount, final_amount, authorization_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      saleDiscount.saleId,
      saleDiscount.saleItemId || null,
      saleDiscount.discountId || null,
      saleDiscount.discountType,
      saleDiscount.discountValue,
      saleDiscount.discountAmount,
      saleDiscount.originalAmount,
      saleDiscount.finalAmount,
      saleDiscount.authorizationId || null,
    ]
  );
}

/**
 * Get discounts applied to a sale
 */
export async function findSaleDiscounts(pool: Pool, saleId: string): Promise<Record<string, unknown>[]> {
  const result = await pool.query(
    `SELECT sd.*, d.name as discount_name
     FROM sale_discounts sd
     LEFT JOIN discounts d ON sd.discount_id = d.id
     WHERE sd.sale_id = $1
     ORDER BY sd.created_at`,
    [saleId]
  );
  return result.rows;
}
