/**
 * @module StockMovementHandler
 * @description Centralized, authoritative handler for ALL stock modifications
 * @architecture Single point of entry for inventory changes
 * @rules
 *   - ALL stock changes must go through this handler
 *   - Enforces business rules consistently
 *   - Creates complete audit trail
 *   - Handles batch selection (FEFO)
 *   - Validates quantities and prevents negative stock
 *   - Recalculates inventory values
 */

import { Pool, PoolClient } from 'pg';
import Decimal from 'decimal.js';
import { InventoryBusinessRules } from '../../middleware/businessRules.js';
import { ValidationError } from '../../middleware/errorHandler.js';
import * as glEntryService from '../../services/glEntryService.js';
import logger from '../../utils/logger.js';

export type StockMovementType =
  | 'GOODS_RECEIPT'
  | 'SALE'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'RETURN'
  | 'DAMAGE'
  | 'EXPIRY'
  | 'PHYSICAL_COUNT';

/** Movement types that require GL journal entries (SAP/Odoo pattern) */
const GL_MOVEMENT_TYPES: ReadonlySet<StockMovementType> = new Set([
  'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGE', 'EXPIRY',
]);

export interface StockMovementParams {
  productId: string;
  batchId?: string | null;
  movementType: StockMovementType;
  quantity: number; // Always positive - direction determined by movementType
  unitCost?: number;
  referenceType?: string | null;
  referenceId?: string | null;
  reason?: string | null;
  notes?: string | null;
  userId: string;
  // Optional: for multi-warehouse support (future)
  warehouseId?: string | null;
  // Optional: for UOM conversions (future)
  uomId?: string | null;
  conversionFactor?: number;
}

export interface StockMovementResult {
  movementId: string;
  movementNumber: string;
  batchId: string;
  previousQuantity: number;
  newQuantity: number;
  actualQuantityChanged: number;
  valueBefore: number;
  valueAfter: number;
}

/**
 * Unified Stock Movement Handler
 * All inventory changes MUST go through this service
 */
export class StockMovementHandler {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Process a stock movement transaction
   * This is the SINGLE authoritative entry point for stock changes
   */
  async processMovement(params: StockMovementParams): Promise<StockMovementResult> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Suppress the inventory_batches trigger that auto-creates SM- stock_movements
      // This handler already creates proper MOV- movements in Step 9
      await client.query("SET LOCAL app.skip_stock_movement_trigger = 'true'");

      // Step 1: Validate parameters
      this.validateMovementParams(params);

      // Step 2: Determine if this is an IN or OUT movement
      const isInbound = this.isInboundMovement(params.movementType);
      const quantityChange = isInbound ? params.quantity : -params.quantity;

      // Step 3: Get or select batch
      const batch = await this.resolveBatch(client, params);

      // Step 4: Calculate new quantity
      const previousQty = new Decimal(batch.remaining_quantity);
      const changeQty = new Decimal(quantityChange);
      const newQty = previousQty.plus(changeQty);

      // Step 5: Validate resulting quantity
      await this.validateResultingQuantity(client, newQty, batch.product_id);

      // Step 6: Update batch quantity
      await client.query(
        `UPDATE inventory_batches 
         SET remaining_quantity = $1, 
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = $2`,
        [newQty.toNumber(), batch.id]
      );

      // Step 7: Calculate inventory value changes
      const unitCost = params.unitCost ?? batch.cost_price ?? 0;
      const valueBefore = previousQty.times(batch.cost_price ?? 0).toNumber();
      const valueAfter = newQty.times(batch.cost_price ?? 0).toNumber();

      // Step 8: Generate movement number
      const movementNumber = await this.generateMovementNumber(client);

      // Step 9: Record stock movement in audit trail
      const movementResult = await client.query(
        `INSERT INTO stock_movements (
          movement_number, product_id, batch_id, movement_type, quantity,
          unit_cost, reference_type, reference_id, notes, created_by_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, movement_number`,
        [
          movementNumber,
          params.productId,
          batch.id,
          params.movementType,
          Math.abs(quantityChange),
          unitCost,
          params.referenceType || null,
          params.referenceId || null,
          params.reason || params.notes || null,
          params.userId,
        ]
      );

      // Step 10: Update product quantity_on_hand (aggregate from batches)
      await this.updateProductQuantity(client, params.productId);

      await client.query('COMMIT');

      // Step 11: Post GL journal entry for adjustment/damage/expiry movements
      // Done AFTER commit so inventory state is persisted first (same pattern as GRN).
      // GL failure is fatal — consistency with sales/GR error handling.
      if (GL_MOVEMENT_TYPES.has(params.movementType)) {
        const movementValue = Math.abs(valueAfter - valueBefore);
        if (movementValue > 0) {
          // Get product name for GL description
          const prodRes = await this.pool.query('SELECT name FROM products WHERE id = $1', [params.productId]);
          const productName = prodRes.rows[0]?.name || 'Unknown';

          await glEntryService.recordStockMovementToGL({
            movementId: movementResult.rows[0].id,
            movementNumber: movementResult.rows[0].movement_number,
            movementDate: new Date().toLocaleDateString('en-CA'),
            movementType: params.movementType as 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'DAMAGE' | 'EXPIRY',
            movementValue,
            productName,
          }, this.pool);
        }
      }

      logger.info('Stock movement processed successfully', {
        movementId: movementResult.rows[0].id,
        movementNumber: movementResult.rows[0].movement_number,
        productId: params.productId,
        batchId: batch.id,
        movementType: params.movementType,
        quantityChange: changeQty.toString(),
        previousQty: previousQty.toString(),
        newQty: newQty.toString(),
      });

      return {
        movementId: movementResult.rows[0].id,
        movementNumber: movementResult.rows[0].movement_number,
        batchId: batch.id,
        previousQuantity: previousQty.toNumber(),
        newQuantity: newQty.toNumber(),
        actualQuantityChanged: changeQty.toNumber(),
        valueBefore,
        valueAfter,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Stock movement failed - transaction rolled back', {
        productId: params.productId,
        movementType: params.movementType,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Validate movement parameters
   */
  private validateMovementParams(params: StockMovementParams): void {
    // Quantity must be positive (direction is determined by movementType)
    if (params.quantity <= 0) {
      throw new Error('Quantity must be greater than zero');
    }

    // Reason required for adjustments and corrections
    if (
      ['ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGE', 'EXPIRY', 'PHYSICAL_COUNT'].includes(
        params.movementType
      )
    ) {
      if (!params.reason || params.reason.trim().length < 5) {
        throw new Error('Reason must be at least 5 characters for this movement type');
      }
    }

    // User ID required for audit trail
    if (!params.userId) {
      throw new Error('User ID is required for stock movements');
    }
  }

  /**
   * Determine if movement type is inbound (increases stock)
   */
  private isInboundMovement(type: StockMovementType): boolean {
    return ['GOODS_RECEIPT', 'ADJUSTMENT_IN', 'TRANSFER_IN', 'RETURN'].includes(type);
  }

  /**
   * Resolve batch for the movement
   * - If batchId provided, validate and use it
   * - If not provided, find or create default MAIN batch
   * - For FEFO movements (sales), select appropriate batch
   */
  private async resolveBatch(
    client: PoolClient,
    params: StockMovementParams
  ): Promise<{
    id: string;
    product_id: string;
    batch_number: string;
    remaining_quantity: number;
    cost_price: number | null;
  }> {
    if (params.batchId) {
      // Validate provided batch exists — lock row to prevent concurrent modification
      const result = await client.query(
        `SELECT id, product_id, batch_number, remaining_quantity, cost_price 
         FROM inventory_batches 
         WHERE id = $1 AND status = 'ACTIVE'
         FOR UPDATE`,
        [params.batchId]
      );

      if (result.rows.length === 0) {
        throw new Error(`Batch ${params.batchId} not found or inactive`);
      }

      // Verify batch belongs to the product
      if (result.rows[0].product_id !== params.productId) {
        throw new Error(`Batch ${params.batchId} does not belong to product ${params.productId}`);
      }

      return result.rows[0];
    }

    // No batchId provided - find or create MAIN batch (with row lock)
    let result = await client.query(
      `SELECT id, product_id, batch_number, remaining_quantity, cost_price 
       FROM inventory_batches 
       WHERE product_id = $1 AND batch_number = 'MAIN' AND status = 'ACTIVE' 
       ORDER BY received_date DESC 
       LIMIT 1
       FOR UPDATE`,
      [params.productId]
    );

    if (result.rows.length > 0) {
      return result.rows[0];
    }

    // MAIN batch doesn't exist - create it atomically with ON CONFLICT
    const product = await client.query(
      'SELECT p.name, pv.cost_price FROM products p LEFT JOIN product_valuation pv ON pv.product_id = p.id WHERE p.id = $1',
      [params.productId]
    );

    if (product.rows.length === 0) {
      throw new Error(`Product ${params.productId} not found`);
    }

    const costPrice = product.rows[0].cost_price || 0;

    result = await client.query(
      `INSERT INTO inventory_batches 
       (product_id, batch_number, quantity, remaining_quantity, cost_price, received_date, status)
       VALUES ($1, 'MAIN', 0, 0, $2, CURRENT_TIMESTAMP, 'ACTIVE')
       ON CONFLICT (product_id, batch_number) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
       RETURNING id, product_id, batch_number, remaining_quantity, cost_price`,
      [params.productId, costPrice]
    );

    logger.info('Created MAIN batch for product', {
      productId: params.productId,
      batchId: result.rows[0].id,
    });

    return result.rows[0];
  }

  /**
   * Validate resulting quantity after movement
   * Prevents negative stock unless system config allows it
   */
  private async validateResultingQuantity(
    client: PoolClient,
    newQuantity: Decimal,
    productId: string
  ): Promise<void> {
    if (newQuantity.lessThan(0)) {
      // Negative stock is not allowed — system_settings is a flat single-row table
      // with no key/value pairs. Default to rejecting negative stock.
      throw new ValidationError(
        `Insufficient stock for product ${productId}. Resulting quantity would be ${newQuantity.toString()}`
      );
    }

    // BR-INV-002: Log positive quantity validation
    if (newQuantity.greaterThanOrEqualTo(0)) {
      logger.info('BR-INV-002: Positive quantity validation passed', {
        productId,
        resultingQuantity: newQuantity.toString(),
      });
    }
  }

  /**
   * Generate sequential movement number
   * Format: MOV-YYYY-####
   */
  private async generateMovementNumber(client: PoolClient): Promise<string> {
    // Advisory lock prevents concurrent duplicate movement number generation (held until COMMIT)
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('movement_number_seq'))`);
    const result = await client.query(
      `SELECT 'MOV-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || 
       LPAD((COALESCE(MAX(CAST(SUBSTRING(movement_number FROM 10) AS INTEGER)), 0) + 1)::TEXT, 4, '0') 
       AS movement_number
       FROM stock_movements 
       WHERE movement_number LIKE 'MOV-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-%'`
    );

    return result.rows[0]?.movement_number || `MOV-${new Date().getFullYear()}-0001`;
  }

  /**
   * Update product quantity_on_hand from batch aggregation
   */
  private async updateProductQuantity(client: PoolClient, productId: string): Promise<void> {
    // App-layer sync: update BOTH product_inventory and products.quantity_on_hand
    await client.query(
      `WITH new_qty AS (
         SELECT COALESCE(SUM(remaining_quantity), 0) AS qty
         FROM inventory_batches
         WHERE product_id = $1 AND status = 'ACTIVE'
       ), upd_pi AS (
         UPDATE product_inventory
         SET quantity_on_hand = (SELECT qty FROM new_qty),
             updated_at = CURRENT_TIMESTAMP
         WHERE product_id = $1
       )
       UPDATE products
       SET quantity_on_hand = (SELECT qty FROM new_qty),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [productId]
    );
  }
}
