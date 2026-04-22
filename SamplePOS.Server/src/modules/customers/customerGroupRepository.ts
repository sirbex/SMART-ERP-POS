/**
 * Customer Group Repository — Data Access Layer
 *
 * Raw SQL queries for customer_groups CRUD and customer assignment.
 * ARCHITECTURE: Repository layer — SQL only, no business logic
 */

import type { Pool, PoolClient } from 'pg';
import { Money } from '../../utils/money.js';

// ============================================================================
// Types
// ============================================================================

export interface CustomerGroupDbRow {
  id: string;
  name: string;
  description: string | null;
  discount_percentage: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomerGroupWithStatsDbRow extends CustomerGroupDbRow {
  customer_count: number;
  rule_count: number;
}

export interface GroupCustomerDbRow {
  id: string;
  customer_number: string;
  name: string;
  email: string | null;
  phone: string | null;
  balance: string;
  is_active: boolean;
}

// ============================================================================
// Normalise
// ============================================================================

export function normaliseCustomerGroup(r: CustomerGroupDbRow) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    discountPercentage: Money.parseDb(r.discount_percentage).toNumber(),
    isActive: r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function normaliseCustomerGroupWithStats(r: CustomerGroupWithStatsDbRow) {
  return {
    ...normaliseCustomerGroup(r),
    customerCount: r.customer_count,
    ruleCount: r.rule_count,
  };
}

function normaliseGroupCustomer(r: GroupCustomerDbRow) {
  return {
    id: r.id,
    customerNumber: r.customer_number,
    name: r.name,
    email: r.email,
    phone: r.phone,
    balance: Money.toNumber(Money.parseDb(r.balance)),
    isActive: r.is_active,
  };
}

// ============================================================================
// Queries
// ============================================================================

export async function findAll(
  pool: Pool | PoolClient,
  filters?: { isActive?: boolean; search?: string },
) {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters?.isActive !== undefined) {
    params.push(filters.isActive);
    conditions.push(`cg.is_active = $${params.length}`);
  }
  if (filters?.search) {
    params.push(`%${filters.search}%`);
    conditions.push(`(cg.name ILIKE $${params.length} OR cg.description ILIKE $${params.length})`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const res = await pool.query(
    `SELECT
       cg.id, cg.name, cg.description, cg.discount_percentage,
       cg.is_active, cg.created_at, cg.updated_at,
       COALESCE(cc.cnt, 0)::int AS customer_count,
       COALESCE(pr.cnt, 0)::int AS rule_count
     FROM customer_groups cg
     LEFT JOIN (
       SELECT customer_group_id, COUNT(*) AS cnt
       FROM customers WHERE customer_group_id IS NOT NULL
       GROUP BY customer_group_id
     ) cc ON cc.customer_group_id = cg.id
     LEFT JOIN (
       SELECT customer_group_id, COUNT(*) AS cnt
       FROM price_rules WHERE is_active = true
       GROUP BY customer_group_id
     ) pr ON pr.customer_group_id = cg.id
     ${where}
     ORDER BY cg.name`,
    params,
  );

  return res.rows.map(normaliseCustomerGroupWithStats);
}

export async function findById(pool: Pool | PoolClient, id: string) {
  const res = await pool.query(
    `SELECT
       cg.id, cg.name, cg.description, cg.discount_percentage,
       cg.is_active, cg.created_at, cg.updated_at,
       COALESCE(cc.cnt, 0)::int AS customer_count,
       COALESCE(pr.cnt, 0)::int AS rule_count
     FROM customer_groups cg
     LEFT JOIN (
       SELECT customer_group_id, COUNT(*) AS cnt
       FROM customers WHERE customer_group_id = $1
       GROUP BY customer_group_id
     ) cc ON cc.customer_group_id = cg.id
     LEFT JOIN (
       SELECT customer_group_id, COUNT(*) AS cnt
       FROM price_rules WHERE customer_group_id = $1 AND is_active = true
       GROUP BY customer_group_id
     ) pr ON pr.customer_group_id = cg.id
     WHERE cg.id = $1`,
    [id],
  );

  return res.rows.length > 0 ? normaliseCustomerGroupWithStats(res.rows[0]) : null;
}

export async function findByName(pool: Pool | PoolClient, name: string) {
  const res = await pool.query(
    `SELECT id FROM customer_groups WHERE LOWER(name) = LOWER($1)`,
    [name],
  );
  return res.rows[0]?.id ?? null;
}

export async function create(
  pool: Pool | PoolClient,
  data: { name: string; description?: string | null; discountPercentage: number; isActive?: boolean },
) {
  const res = await pool.query(
    `INSERT INTO customer_groups (name, description, discount_percentage, is_active)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [data.name, data.description ?? null, data.discountPercentage, data.isActive ?? true],
  );
  return normaliseCustomerGroup(res.rows[0]);
}

export async function update(
  pool: Pool | PoolClient,
  id: string,
  data: { name?: string; description?: string | null; discountPercentage?: number; isActive?: boolean },
) {
  const fields: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (data.name !== undefined) {
    fields.push(`name = $${idx++}`);
    params.push(data.name);
  }
  if (data.description !== undefined) {
    fields.push(`description = $${idx++}`);
    params.push(data.description);
  }
  if (data.discountPercentage !== undefined) {
    fields.push(`discount_percentage = $${idx++}`);
    params.push(data.discountPercentage);
  }
  if (data.isActive !== undefined) {
    fields.push(`is_active = $${idx++}`);
    params.push(data.isActive);
  }

  if (fields.length === 0) return findById(pool, id);

  fields.push(`updated_at = NOW()`);
  params.push(id);

  await pool.query(
    `UPDATE customer_groups SET ${fields.join(', ')} WHERE id = $${idx}`,
    params,
  );

  return findById(pool, id);
}

export async function remove(pool: Pool | PoolClient, id: string) {
  // Unassign customers first
  await pool.query(
    `UPDATE customers SET customer_group_id = NULL WHERE customer_group_id = $1`,
    [id],
  );
  const res = await pool.query(
    `DELETE FROM customer_groups WHERE id = $1 RETURNING id`,
    [id],
  );
  return res.rowCount !== null && res.rowCount > 0;
}

export async function getGroupCustomers(pool: Pool | PoolClient, groupId: string) {
  const res = await pool.query(
    `SELECT id, customer_number, name, email, phone, balance, is_active
     FROM customers
     WHERE customer_group_id = $1
     ORDER BY name`,
    [groupId],
  );
  return res.rows.map(normaliseGroupCustomer);
}

export async function assignCustomer(
  pool: Pool | PoolClient,
  customerId: string,
  groupId: string,
) {
  await pool.query(
    `UPDATE customers SET customer_group_id = $1, updated_at = NOW() WHERE id = $2`,
    [groupId, customerId],
  );
}

export async function unassignCustomer(pool: Pool | PoolClient, customerId: string) {
  await pool.query(
    `UPDATE customers SET customer_group_id = NULL, updated_at = NOW() WHERE id = $1`,
    [customerId],
  );
}

export async function bulkAssign(
  pool: Pool | PoolClient,
  customerIds: string[],
  groupId: string,
) {
  await pool.query(
    `UPDATE customers SET customer_group_id = $1, updated_at = NOW()
     WHERE id = ANY($2::uuid[])`,
    [groupId, customerIds],
  );
}
