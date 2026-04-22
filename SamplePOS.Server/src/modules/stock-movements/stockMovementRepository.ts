// Stock Movement Repository - Raw SQL queries only
// No business logic, pure data access

import { Pool, PoolClient } from 'pg';
import {
  StockMovement,
  StockMovementWithDetails,
  RecordMovementData,
  MovementFilters,
} from './types.js';
import { getBusinessYear } from '../../utils/dateRange.js';

/**
 * Record stock movement
 * Accepts Pool or PoolClient to participate in caller's transaction.
 * Generates movement_number atomically with advisory lock.
 */
export async function recordMovement(pool: Pool | PoolClient, data: RecordMovementData): Promise<StockMovement> {
  // Generate movement number with advisory lock to prevent duplicates
  await pool.query(`SELECT pg_advisory_xact_lock(hashtext('movement_number_seq'))`);
  const movNumRes = await pool.query(
    `SELECT 'MOV-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || 
     LPAD((COALESCE(MAX(CAST(SUBSTRING(movement_number FROM 10) AS INTEGER)), 0) + 1)::TEXT, 4, '0') 
     AS movement_number
     FROM stock_movements 
     WHERE movement_number LIKE 'MOV-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-%'`
  );
  const movementNumber = movNumRes.rows[0]?.movement_number || `MOV-${getBusinessYear()}-0001`;

  const result = await pool.query(
    `INSERT INTO stock_movements (
      movement_number, product_id, batch_id, movement_type, quantity, unit_cost,
      reference_type, reference_id, notes, created_by_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING 
      id,
      movement_number as "movementNumber",
      product_id as "productId",
      batch_id as "batchId",
      movement_type as "movementType",
      quantity,
      unit_cost as "unitCost",
      reference_type as "referenceType",
      reference_id as "referenceId",
      notes,
      created_by_id as "createdById",
      created_at as "createdAt"`,
    [
      movementNumber,
      data.productId,
      data.batchId || null,
      data.movementType,
      data.quantity,
      data.unitCost || null,
      data.referenceType || null,
      data.referenceId || null,
      data.notes || null,
      data.createdBy || null,
    ]
  );
  return result.rows[0];
}

/**
 * Get movement history for a product
 */
export async function getMovementsByProduct(
  pool: Pool,
  productId: string,
  page: number = 1,
  limit: number = 100
): Promise<{ movements: StockMovementWithDetails[]; total: number }> {
  const offset = (page - 1) * limit;

  const countResult = await pool.query('SELECT COUNT(*) FROM stock_movements WHERE product_id = $1', [
    productId,
  ]);

  const result = await pool.query(
    `SELECT 
       sm.id,
       sm.movement_number AS "movementNumber",
       sm.product_id AS "productId",
       sm.batch_id AS "batchId",
       sm.movement_type AS "movementType",
       sm.quantity,
       sm.unit_cost AS "unitCost",
       sm.reference_type AS "referenceType",
       sm.reference_id AS "referenceId",
       sm.notes,
       sm.created_by_id AS "createdById",
       sm.created_at AS "createdAt",
       p.name AS "productName",
       b.batch_number AS "batchNumber"
     FROM stock_movements sm
     JOIN products p ON sm.product_id = p.id
     LEFT JOIN inventory_batches b ON sm.batch_id = b.id
     WHERE sm.product_id = $1
     ORDER BY sm.created_at DESC
     LIMIT $2 OFFSET $3`,
    [productId, limit, offset]
  );

  return {
    movements: result.rows,
    total: parseInt(countResult.rows[0].count),
  };
}

/**
 * Get movement history for a batch
 */
export async function getMovementsByBatch(
  pool: Pool,
  batchId: string,
  page: number = 1,
  limit: number = 100
): Promise<{ movements: StockMovementWithDetails[]; total: number }> {
  const offset = (page - 1) * limit;

  const countResult = await pool.query('SELECT COUNT(*) FROM stock_movements WHERE batch_id = $1', [
    batchId,
  ]);

  const result = await pool.query(
    `SELECT 
       sm.id,
       sm.movement_number AS "movementNumber",
       sm.product_id AS "productId",
       sm.batch_id AS "batchId",
       sm.movement_type AS "movementType",
       sm.quantity,
       sm.unit_cost AS "unitCost",
       sm.reference_type AS "referenceType",
       sm.reference_id AS "referenceId",
       sm.notes,
       sm.created_by_id AS "createdById",
       sm.created_at AS "createdAt",
       p.name AS "productName",
       b.batch_number AS "batchNumber"
     FROM stock_movements sm
     JOIN products p ON sm.product_id = p.id
     LEFT JOIN inventory_batches b ON sm.batch_id = b.id
     WHERE sm.batch_id = $1
     ORDER BY sm.created_at DESC
     LIMIT $2 OFFSET $3`,
    [batchId, limit, offset]
  );

  return {
    movements: result.rows,
    total: parseInt(countResult.rows[0].count),
  };
}

/**
 * Get all movements with filters
 */
export async function getAllMovements(
  pool: Pool,
  page: number = 1,
  limit: number = 100,
  filters?: MovementFilters
): Promise<{ movements: StockMovementWithDetails[]; total: number }> {
  const offset = (page - 1) * limit;
  const whereClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (filters?.movementType) {
    const types = Array.isArray(filters.movementType) ? filters.movementType : [filters.movementType];
    whereClauses.push(`sm.movement_type = ANY($${paramIndex++})`);
    values.push(types);
  }

  if (filters?.startDate) {
    whereClauses.push(`DATE(sm.created_at) >= DATE($${paramIndex++})`);
    values.push(filters.startDate);
  }

  if (filters?.endDate) {
    whereClauses.push(`DATE(sm.created_at) <= DATE($${paramIndex++})`);
    values.push(filters.endDate);
  }

  if (filters?.search) {
    const like = `%${filters.search}%`;
    whereClauses.push(
      `(p.name ILIKE $${paramIndex}
       OR COALESCE(p.sku::text, '') ILIKE $${paramIndex}
       OR COALESCE(b.batch_number, '') ILIKE $${paramIndex}
       OR COALESCE(s.sale_number, '') ILIKE $${paramIndex}
       OR COALESCE(gr.receipt_number, '') ILIKE $${paramIndex}
       OR COALESCE(sm.notes, '') ILIKE $${paramIndex}
       OR COALESCE(sm.reference_id::text, '') ILIKE $${paramIndex})`
    );
    values.push(like);
    paramIndex++;
  }

  const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // Count query (includes same JOINs so search filter works)
  const countResult = await pool.query(
    `SELECT COUNT(*)
     FROM stock_movements sm
     JOIN products p ON sm.product_id = p.id
     LEFT JOIN inventory_batches b ON sm.batch_id = b.id
     LEFT JOIN sales s ON sm.reference_type = 'SALE' AND sm.reference_id = s.id
     LEFT JOIN goods_receipts gr ON sm.reference_type = 'GOODS_RECEIPT' AND sm.reference_id = gr.id
     ${whereClause}`,
    values
  );

  // Data query: CTE computes running balance per product over ALL movements,
  // then the outer query applies date/type/search filters and paginates.
  const result = await pool.query(
    `WITH balance_cte AS (
       SELECT
         sm.id,
         SUM(
           CASE WHEN sm.movement_type IN (
             'GOODS_RECEIPT','ADJUSTMENT_IN','TRANSFER_IN','RETURN','OPENING_BALANCE'
           ) THEN sm.quantity ELSE -sm.quantity END
         ) OVER (
           PARTITION BY sm.product_id
           ORDER BY sm.created_at ASC, sm.id ASC
         ) AS balance_after
       FROM stock_movements sm
     )
     SELECT
       sm.id,
       sm.movement_number AS "movementNumber",
       sm.product_id AS "productId",
       sm.batch_id AS "batchId",
       sm.movement_type AS "movementType",
       sm.quantity,
       sm.unit_cost AS "unitCost",
       sm.reference_type AS "referenceType",
       sm.reference_id AS "referenceId",
       sm.notes,
       sm.created_by_id AS "createdById",
       sm.created_at AS "createdAt",
       p.name AS "productName",
       b.batch_number AS "batchNumber",
       s.sale_number AS "saleNumber",
       gr.receipt_number AS "grNumber",
       bc.balance_after AS "balanceAfter"
     FROM stock_movements sm
     JOIN products p ON sm.product_id = p.id
     LEFT JOIN inventory_batches b ON sm.batch_id = b.id
     LEFT JOIN sales s ON sm.reference_type = 'SALE' AND sm.reference_id = s.id
     LEFT JOIN goods_receipts gr ON sm.reference_type = 'GOODS_RECEIPT' AND sm.reference_id = gr.id
     JOIN balance_cte bc ON bc.id = sm.id
     ${whereClause}
     ORDER BY sm.created_at DESC, sm.id DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...values, limit, offset]
  );

  return {
    movements: result.rows,
    total: parseInt(countResult.rows[0].count),
  };
}
