/**
 * @module StockCountService
 * @description Business logic for Physical Counting (Stocktake) feature
 * @architecture Service layer - orchestrates repository and stock movement handler
 * 
 * KEY FEATURES:
 * - Create counts with product scope (all/category/selected)
 * - Add/update lines with UOM conversion
 * - Reconciliation algorithm (core feature)
 * - State machine validation
 * - Concurrency detection
 * - CSV import processing
 */

import { Pool, PoolClient } from 'pg';
import Decimal from 'decimal.js';
import { stockCountRepository } from './stockCountRepository.js';
import { StockMovementHandler } from './stockMovementHandler.js';
import { inventoryRepository } from './inventoryRepository.js';
import logger from '../../utils/logger.js';
import { UnitOfWork } from '../../db/unitOfWork.js';

export const stockCountService = {
  /**
   * Create a new stock count with initial lines
   * Snapshots current inventory at creation time
   */
  async createStockCount(
    pool: Pool,
    data: {
      name: string;
      locationId?: string | null;
      notes?: string | null;
      includeAllProducts?: boolean;
      productIds?: string[];
      categoryId?: string | null;
      createdById: string;
    }
  ) {
    return UnitOfWork.run(pool, async (client) => {
      // Create stock count
      const stockCount = await stockCountRepository.createStockCount(client, {
        name: data.name,
        locationId: data.locationId,
        notes: data.notes,
        createdById: data.createdById,
      });

      logger.info('Stock count created', { stockCountId: stockCount.id, name: data.name });

      // Determine which products to include
      let productQuery = `
        SELECT 
          p.id as product_id,
          COALESCE(ib.id, NULL) as batch_id,
          COALESCE(ib.remaining_quantity, 0) as expected_qty
        FROM products p
        LEFT JOIN inventory_batches ib ON p.id = ib.product_id AND ib.status = 'ACTIVE'
        WHERE p.is_active = true
      `;

      const queryParams: unknown[] = [];
      let paramIndex = 1;

      if (data.categoryId) {
        productQuery += ` AND p.category_id = $${paramIndex++}`;
        queryParams.push(data.categoryId);
      } else if (data.productIds && data.productIds.length > 0) {
        productQuery += ` AND p.id = ANY($${paramIndex++})`;
        queryParams.push(data.productIds);
      }
      // If includeAllProducts is true, no additional filter needed

      productQuery += ' ORDER BY p.name ASC, ib.expiry_date ASC NULLS LAST';

      const productsResult = await client.query(productQuery, queryParams);

      // Create lines for each product/batch combination
      let linesCreated = 0;
      for (const row of productsResult.rows) {
        await stockCountRepository.createStockCountLine(client, {
          stockCountId: stockCount.id,
          productId: row.product_id,
          batchId: row.batch_id,
          expectedQtyBase: Number(row.expected_qty || 0),
          createdById: data.createdById,
        });
        linesCreated++;
      }

      // Update state to 'counting'
      await stockCountRepository.updateStockCountState(client, stockCount.id, 'counting');

      // Refetch to get updated state
      const updatedCount = await stockCountRepository.getStockCountById(client, stockCount.id);

      logger.info('Stock count initialized with lines', {
        stockCountId: stockCount.id,
        linesCreated,
      });

      return {
        stockCount: updatedCount || stockCount,
        linesCreated,
      };
    });
  },

  /**
   * Get stock count by ID with lines
   */
  async getStockCountWithLines(
    pool: Pool,
    stockCountId: string,
    page: number = 1,
    limit: number = 100
  ) {
    const stockCount = await stockCountRepository.getStockCountById(pool, stockCountId);

    if (!stockCount) {
      throw new Error(`Stock count ${stockCountId} not found`);
    }

    const { lines, total } = await stockCountRepository.getStockCountLinesWithDetails(
      pool,
      stockCountId,
      page,
      limit
    );

    // Calculate differences and percentages
    const linesWithDiff = lines.map((line) => {
      const expected = new Decimal(line.expected_qty_base || 0);
      const counted = line.counted_qty_base ? new Decimal(line.counted_qty_base) : null;
      const difference = counted ? counted.minus(expected).toNumber() : null;
      const differencePercentage =
        counted && !expected.isZero()
          ? counted.minus(expected).dividedBy(expected).times(100).toNumber()
          : null;

      return {
        ...line,
        difference,
        differencePercentage,
      };
    });

    return {
      stockCount,
      lines: linesWithDiff,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Add or update a count line
   * Handles UOM conversion to base units
   */
  async updateCountLine(
    pool: Pool,
    data: {
      stockCountId: string;
      productId: string;
      batchId?: string | null;
      countedQty: number;
      uom: string;
      notes?: string | null;
      userId: string;
    }
  ) {
    return UnitOfWork.run(pool, async (client) => {
      // Validate stock count is in counting state
      const stockCount = await stockCountRepository.getStockCountByIdForUpdate(
        client,
        data.stockCountId
      );

      if (!stockCount) {
        throw new Error(`Stock count ${data.stockCountId} not found`);
      }

      if (stockCount.state !== 'counting') {
        throw new Error(
          `Cannot update lines - stock count is in ${stockCount.state} state. Must be in 'counting' state.`
        );
      }

      // Convert counted quantity to base units using UOM
      const countedQtyBase = await this.convertToBaseUnits(
        client,
        data.productId,
        data.countedQty,
        data.uom
      );

      // Find existing line
      const existingLine = await stockCountRepository.findStockCountLine(
        client,
        data.stockCountId,
        data.productId,
        data.batchId
      );

      let line;
      if (existingLine) {
        // Update existing line
        line = await stockCountRepository.updateStockCountLine(client, existingLine.id, {
          countedQtyBase,
          uomRecorded: data.uom,
          notes: data.notes,
        });
      } else {
        // Create new line (ad-hoc product not in initial scope)
        // Get expected quantity from current inventory
        const batchQuery = data.batchId
          ? 'SELECT remaining_quantity FROM inventory_batches WHERE id = $1'
          : `SELECT COALESCE(SUM(remaining_quantity), 0) as remaining_quantity 
             FROM inventory_batches WHERE product_id = $1 AND status = 'ACTIVE'`;

        const batchResult = await client.query(
          batchQuery,
          data.batchId ? [data.batchId] : [data.productId]
        );

        const expectedQty = Number(batchResult.rows[0]?.remaining_quantity || 0);

        line = await stockCountRepository.createStockCountLine(client, {
          stockCountId: data.stockCountId,
          productId: data.productId,
          batchId: data.batchId,
          expectedQtyBase: expectedQty,
          countedQtyBase,
          uomRecorded: data.uom,
          notes: data.notes,
          createdById: data.userId,
        });
      }

      logger.info('Count line updated', {
        stockCountId: data.stockCountId,
        lineId: line.id,
        productId: data.productId,
      });

      return line;
    });
  },

  /**
   * Convert quantity from UOM to base units
   */
  async convertToBaseUnits(
    client: PoolClient,
    productId: string,
    quantity: number,
    uom: string
  ): Promise<number> {
    // If UOM is 'BASE' or empty, no conversion needed
    if (!uom || uom === 'BASE') {
      return quantity;
    }

    // Look up UOM conversion factor
    const uomResult = await client.query(
      `SELECT pu.conversion_factor 
       FROM product_uoms pu
       JOIN uoms u ON pu.uom_id = u.id
       WHERE pu.product_id = $1 AND u.symbol = $2`,
      [productId, uom]
    );

    if (uomResult.rows.length === 0) {
      throw new Error(`UOM ${uom} not found for product ${productId}`);
    }

    const conversionFactor = Number(uomResult.rows[0].conversion_factor);
    return new Decimal(quantity).times(conversionFactor).toNumber();
  },

  /**
   * Validate and reconcile stock count
   * CORE RECONCILIATION ALGORITHM
   */
  async validateStockCount(
    pool: Pool,
    data: {
      stockCountId: string;
      allowNegativeAdjustments?: boolean;
      createMissingBatches?: boolean;
      notes?: string | null;
      validatedById: string;
    }
  ) {
    const handler = new StockMovementHandler(pool);
    const movementIds: string[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];

    return UnitOfWork.run(pool, async (client) => {
      // Lock stock count for update
      const stockCount = await stockCountRepository.getStockCountByIdForUpdate(
        client,
        data.stockCountId
      );

      if (!stockCount) {
        throw new Error(`Stock count ${data.stockCountId} not found`);
      }

      if (stockCount.state !== 'counting') {
        throw new Error(
          `Cannot validate - stock count is in ${stockCount.state} state. Must be in 'counting' state.`
        );
      }

      // Update state to 'validating'
      await stockCountRepository.updateStockCountState(
        client,
        data.stockCountId,
        'validating',
        data.validatedById
      );

      // Get all lines
      const { lines } = await stockCountRepository.getStockCountLines(
        pool,
        data.stockCountId,
        1,
        10000 // Get all lines
      );

      logger.info('Starting stock count validation', {
        stockCountId: data.stockCountId,
        totalLines: lines.length,
      });

      let linesProcessed = 0;

      // Process each line
      for (const line of lines) {
        // Skip lines without counted quantity
        if (line.counted_qty_base === null || line.counted_qty_base === undefined) {
          warnings.push(
            `Line ${line.id}: No counted quantity entered - skipping reconciliation`
          );
          continue;
        }

        const expected = new Decimal(line.expected_qty_base || 0);
        const counted = new Decimal(line.counted_qty_base);
        const difference = counted.minus(expected);

        // No adjustment needed if difference is zero
        if (difference.isZero()) {
          linesProcessed++;
          continue;
        }

        // Determine adjustment type
        const isIncrease = difference.greaterThan(0);
        const movementType = isIncrease ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';
        const absoluteDiff = difference.abs().toNumber();

        logger.info('Processing stock count line difference', {
          lineId: line.id,
          productId: line.product_id,
          expected: expected.toString(),
          counted: counted.toString(),
          difference: difference.toString(),
          movementType,
        });

        try {
          // Check for negative resulting quantity
          if (!isIncrease && !data.allowNegativeAdjustments) {
            // Verify we have enough stock
            const currentBatch = await client.query(
              'SELECT remaining_quantity FROM inventory_batches WHERE id = $1',
              [line.batch_id]
            );

            if (currentBatch.rows.length > 0) {
              const currentQty = new Decimal(currentBatch.rows[0].remaining_quantity);
              if (currentQty.lessThan(absoluteDiff)) {
                errors.push(
                  `Line ${line.id}: Insufficient stock (current: ${currentQty}, need: ${absoluteDiff})`
                );
                continue;
              }
            }
          }

          // Use unified stock movement handler — pass txClient so movements
          // are atomic with the stock count state transition
          const result = await handler.processMovement({
            productId: line.product_id,
            batchId: line.batch_id,
            movementType: movementType as 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT',
            quantity: absoluteDiff,
            reason: `Stocktake reconciliation - ${data.notes || 'Physical count adjustment'}`,
            referenceType: 'STOCK_COUNT',
            referenceId: data.stockCountId,
            userId: data.validatedById,
          }, client);

          movementIds.push(result.movementId);
          linesProcessed++;

          logger.info('Stock movement created for count line', {
            lineId: line.id,
            movementId: result.movementId,
            movementNumber: result.movementNumber,
          });
        } catch (error) {
          const errorMsg = `Line ${line.id}: Failed to create adjustment - ${(error as Error).message
            }`;
          errors.push(errorMsg);
          logger.error(errorMsg, { error });
        }
      }

      // If there were errors and we want strict validation, rollback
      if (errors.length > 0) {
        throw new Error(
          `Validation failed with ${errors.length} errors:\n${errors.join('\n')}`
        );
      }

      // Update state to 'done'
      await stockCountRepository.updateStockCountState(
        client,
        data.stockCountId,
        'done',
        data.validatedById
      );

      logger.info('Stock count validated successfully', {
        stockCountId: data.stockCountId,
        linesProcessed,
        adjustmentsCreated: movementIds.length,
        warnings: warnings.length,
      });

      return {
        stockCountId: data.stockCountId,
        linesProcessed,
        adjustmentsCreated: movementIds.length,
        movementIds,
        warnings,
        errors,
      };
    });
  },

  /**
   * Cancel stock count
   */
  async cancelStockCount(
    pool: Pool,
    stockCountId: string,
    notes: string | null,
    userId: string
  ) {
    return UnitOfWork.run(pool, async (client) => {
      const stockCount = await stockCountRepository.getStockCountByIdForUpdate(
        client,
        stockCountId
      );

      if (!stockCount) {
        throw new Error(`Stock count ${stockCountId} not found`);
      }

      if (stockCount.state === 'done') {
        throw new Error('Cannot cancel a completed stock count');
      }

      if (stockCount.state === 'cancelled') {
        throw new Error('Stock count is already cancelled');
      }

      await stockCountRepository.updateStockCountState(client, stockCountId, 'cancelled');

      logger.info('Stock count cancelled', { stockCountId, userId });

      return { success: true, message: 'Stock count cancelled successfully' };
    });
  },

  /**
   * List stock counts
   */
  async listStockCounts(
    pool: Pool,
    filters: {
      state?: string;
      createdById?: string;
      page?: number;
      limit?: number;
    }
  ) {
    const { page = 1, limit = 20 } = filters;
    const result = await stockCountRepository.listStockCounts(pool, filters);

    return {
      counts: result.counts,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
    };
  },
};
