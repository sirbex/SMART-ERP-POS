/**
 * @module StockCountRepository
 * @description Data access layer for stock counting operations
 * @architecture Repository pattern - contains ONLY SQL queries, no business logic
 */

import { Pool, PoolClient } from 'pg';
import { StockCountDbRow, StockCountLineDbRow } from '../../../../shared/zod/stockCount.js';

export const stockCountRepository = {
  /**
   * Create a new stock count
   */
  async createStockCount(
    pool: Pool | PoolClient,
    data: {
      name: string;
      locationId?: string | null;
      notes?: string | null;
      createdById: string;
    }
  ): Promise<StockCountDbRow> {
    const result = await pool.query(
      `INSERT INTO stock_counts (name, location_id, state, created_by_id, notes, snapshot_timestamp)
       VALUES ($1, $2, 'draft', $3, $4, CURRENT_TIMESTAMP)
       RETURNING *`,
      [data.name, data.locationId || null, data.createdById, data.notes || null]
    );
    return result.rows[0];
  },

  /**
   * Get stock count by ID
   */
  async getStockCountById(pool: Pool | PoolClient, id: string): Promise<StockCountDbRow | null> {
    const result = await pool.query('SELECT * FROM stock_counts WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  /**
   * Get stock count by ID with lock (FOR UPDATE)
   */
  async getStockCountByIdForUpdate(
    client: PoolClient,
    id: string
  ): Promise<StockCountDbRow | null> {
    const result = await client.query(
      'SELECT * FROM stock_counts WHERE id = $1 FOR UPDATE',
      [id]
    );
    return result.rows[0] || null;
  },

  /**
   * List stock counts with filters
   */
  async listStockCounts(
    pool: Pool,
    filters: {
      state?: string;
      createdById?: string;
      page?: number;
      limit?: number;
    }
  ): Promise<{ counts: StockCountDbRow[]; total: number }> {
    const { state, createdById, page = 1, limit = 50 } = filters;
    const offset = (page - 1) * limit;

    const whereClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (state) {
      whereClauses.push(`state = $${paramIndex++}::stock_count_state`);
      values.push(state);
    }

    if (createdById) {
      whereClauses.push(`created_by_id = $${paramIndex++}`);
      values.push(createdById);
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM stock_counts ${whereClause}`,
      values
    );

    const result = await pool.query(
      `SELECT * FROM stock_counts ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, limit, offset]
    );

    return {
      counts: result.rows,
      total: parseInt(countResult.rows[0].count),
    };
  },

  /**
   * Update stock count state
   */
  async updateStockCountState(
    client: PoolClient,
    id: string,
    state: string,
    validatedById?: string | null
  ): Promise<StockCountDbRow> {
    const result = await client.query(
      `UPDATE stock_counts 
       SET state = $1::stock_count_state, 
           validated_by_id = $2,
           validated_at = CASE WHEN $1::stock_count_state = 'done' THEN CURRENT_TIMESTAMP ELSE validated_at END
       WHERE id = $3
       RETURNING *`,
      [state, validatedById || null, id]
    );
    return result.rows[0];
  },

  /**
   * Create stock count line
   */
  async createStockCountLine(
    client: PoolClient,
    data: {
      stockCountId: string;
      productId: string;
      batchId?: string | null;
      expectedQtyBase: number;
      countedQtyBase?: number | null;
      uomRecorded?: string | null;
      notes?: string | null;
      createdById: string;
    }
  ): Promise<StockCountLineDbRow> {
    const result = await client.query(
      `INSERT INTO stock_count_lines 
       (stock_count_id, product_id, batch_id, expected_qty_base, counted_qty_base, uom_recorded, notes, created_by_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        data.stockCountId,
        data.productId,
        data.batchId || null,
        data.expectedQtyBase,
        data.countedQtyBase ?? null,
        data.uomRecorded || null,
        data.notes || null,
        data.createdById,
      ]
    );
    return result.rows[0];
  },

  /**
   * Update stock count line (counted quantity)
   */
  async updateStockCountLine(
    client: PoolClient,
    lineId: string,
    data: {
      countedQtyBase?: number | null;
      uomRecorded?: string | null;
      notes?: string | null;
    }
  ): Promise<StockCountLineDbRow> {
    const result = await client.query(
      `UPDATE stock_count_lines 
       SET counted_qty_base = COALESCE($1, counted_qty_base),
           uom_recorded = COALESCE($2, uom_recorded),
           notes = COALESCE($3, notes)
       WHERE id = $4
       RETURNING *`,
      [data.countedQtyBase ?? null, data.uomRecorded || null, data.notes || null, lineId]
    );
    return result.rows[0];
  },

  /**
   * Get all lines for a stock count
   */
  async getStockCountLines(
    pool: Pool,
    stockCountId: string,
    page: number = 1,
    limit: number = 100
  ): Promise<{ lines: StockCountLineDbRow[]; total: number }> {
    const offset = (page - 1) * limit;

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM stock_count_lines WHERE stock_count_id = $1',
      [stockCountId]
    );

    const result = await pool.query(
      `SELECT * FROM stock_count_lines 
       WHERE stock_count_id = $1
       ORDER BY created_at ASC
       LIMIT $2 OFFSET $3`,
      [stockCountId, limit, offset]
    );

    return {
      lines: result.rows,
      total: parseInt(countResult.rows[0].count),
    };
  },

  /**
   * Get stock count lines with product/batch details
   */
  async getStockCountLinesWithDetails(
    pool: Pool,
    stockCountId: string,
    page: number = 1,
    limit: number = 100
  ): Promise<{ lines: Record<string, unknown>[]; total: number }> {
    const offset = (page - 1) * limit;

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM stock_count_lines WHERE stock_count_id = $1',
      [stockCountId]
    );

    const result = await pool.query(
      `SELECT 
         scl.*,
         p.name as product_name,
         p.sku as product_sku,
         ib.batch_number,
         ib.expiry_date,
         ib.remaining_quantity as current_batch_qty
       FROM stock_count_lines scl
       JOIN products p ON scl.product_id = p.id
       LEFT JOIN inventory_batches ib ON scl.batch_id = ib.id
       WHERE scl.stock_count_id = $1
       ORDER BY p.name ASC, ib.expiry_date ASC NULLS LAST
       LIMIT $2 OFFSET $3`,
      [stockCountId, limit, offset]
    );

    return {
      lines: result.rows,
      total: parseInt(countResult.rows[0].count),
    };
  },

  /**
   * Find stock count line by product and batch
   */
  async findStockCountLine(
    client: PoolClient,
    stockCountId: string,
    productId: string,
    batchId?: string | null
  ): Promise<StockCountLineDbRow | null> {
    const result = await client.query(
      `SELECT * FROM stock_count_lines 
       WHERE stock_count_id = $1 AND product_id = $2 AND (batch_id = $3 OR ($3 IS NULL AND batch_id IS NULL))`,
      [stockCountId, productId, batchId || null]
    );
    return result.rows[0] || null;
  },

  /**
   * Delete stock count (cascade will delete lines)
   */
  async deleteStockCount(pool: Pool | PoolClient, id: string): Promise<void> {
    await pool.query('DELETE FROM stock_counts WHERE id = $1', [id]);
  },
};
