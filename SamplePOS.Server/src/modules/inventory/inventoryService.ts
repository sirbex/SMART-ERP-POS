import { Pool } from 'pg';
import Decimal from 'decimal.js';
import { inventoryRepository } from './inventoryRepository.js';
import { InventoryBusinessRules } from '../../middleware/businessRules.js';
import { StockMovementHandler, StockMovementType } from './stockMovementHandler.js';
import { ValidationError } from '../../middleware/errorHandler.js';
import type { AdjustmentReason, AdjustmentDirection } from '../../../../shared/zod/inventory.js';
import logger from '../../utils/logger.js';
import { getBusinessDate, getBusinessYear } from '../../utils/dateRange.js';

export const inventoryService = {
  /**
   * Get all batches for product with FEFO ordering (First Expiry First Out)
   * @param pool - Database connection pool
   * @param productId - Product UUID
   * @returns Batches sorted by expiry date (earliest first)
   * 
   * FEFO Strategy:
   * - Orders batches by expiry_date ASC
   * - Prioritizes near-expiry inventory for sale
   * - Reduces waste from expired products
   * 
   * Use Cases:
   * - POS batch selection during sale
   * - Goods receipt batch display
   * - Expiry management reports
   * - Stock rotation planning
   * 
   * Includes:
   * - batch_number, expiry_date
   * - quantity, remaining_quantity
   * - received_date, goods_receipt_id
   * - Active batches only (remaining_quantity > 0)
   */
  async getBatchesByProduct(pool: Pool, productId: string) {
    return inventoryRepository.getBatchesByProduct(pool, productId);
  },

  /**
   * Get all active batches across all products (for offline pre-warm)
   */
  async getAllActiveBatches(pool: Pool) {
    return inventoryRepository.getAllActiveBatches(pool);
  },

  /**
   * Get batches expiring soon with urgency classification
   * @param pool - Database connection pool
   * @param daysThreshold - Days until expiry threshold (default: 30)
   * @returns Batches with daysUntilExpiry and urgency level
   * 
   * Urgency Levels:
   * - **CRITICAL**: <= 7 days (immediate action required)
   * - **WARNING**: 8-30 days (plan promotions/discounts)
   * - **NORMAL**: > 30 days (routine monitoring)
   * 
   * Use Cases:
   * - Daily expiry alerts dashboard
   * - Discount/promotion planning
   * - Waste prevention strategies
   * - Inventory manager notifications
   * 
   * Business Rules:
   * - BR-INV-006: Alert on near-expiry inventory
   * - Perishable products prioritized
   * - Automated email alerts for CRITICAL items
   * 
   * Returns:
   * - Original batch data
   * - daysUntilExpiry: Calculated days remaining
   * - urgency: Risk classification
   */
  async getBatchesExpiringSoon(pool: Pool, daysThreshold: number = 30) {
    const batches = await inventoryRepository.getBatchesExpiringSoon(pool, daysThreshold);

    return batches.map((batch) => ({
      ...batch,
      daysUntilExpiry: Math.ceil(
        (new Date(batch.expiryDate + 'T12:00:00Z').getTime() - new Date(getBusinessDate() + 'T12:00:00Z').getTime()) / (1000 * 60 * 60 * 24)
      ),
      urgency: this.calculateExpiryUrgency(batch.expiryDate!),
    }));
  },

  /**
   * Calculate expiry urgency level
   */
  calculateExpiryUrgency(expiryDate: Date | string): 'CRITICAL' | 'WARNING' | 'NORMAL' {
    const daysUntilExpiry = Math.ceil(
      (new Date(String(expiryDate) + 'T12:00:00Z').getTime() - new Date(getBusinessDate() + 'T12:00:00Z').getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysUntilExpiry <= 7) return 'CRITICAL';
    if (daysUntilExpiry <= 30) return 'WARNING';
    return 'NORMAL';
  },

  /**
   * Get stock levels for all products
   */
  async getStockLevels(pool: Pool) {
    return inventoryRepository.getStockLevels(pool);
  },

  /**
   * Get stock level for specific product
   */
  async getStockLevelByProduct(pool: Pool, productId: string) {
    const stockLevel = await inventoryRepository.getStockLevelByProduct(pool, productId);

    if (!stockLevel) {
      throw new Error(`Product ${productId} not found or inactive`);
    }

    return stockLevel;
  },

  /**
   * Get products that need reordering
   */
  async getProductsNeedingReorder(pool: Pool) {
    const stockLevels = await inventoryRepository.getStockLevels(pool);
    return stockLevels.filter((item) => item.needsReorder);
  },

  /**
   * Adjust inventory quantity with audit trail
   * REFACTORED: Now uses unified StockMovementHandler with transaction management
   * @param pool Database connection pool
   * @param productId Product UUID (not batch ID)
   * @param adjustment Quantity change (positive for increase, negative for decrease)
   * @param reason Reason for adjustment (min 5 characters)
   * @param userId User performing the adjustment
   */
  async adjustInventory(
    pool: Pool,
    productId: string,
    adjustment: number,
    reason: string,
    userId: string
  ) {
    // Validate adjustment is not zero
    if (adjustment === 0) {
      throw new Error('Adjustment amount cannot be zero');
    }

    if (!reason || reason.trim().length < 5) {
      throw new Error('Adjustment reason must be at least 5 characters');
    }

    // Determine movement type based on adjustment sign
    const movementType = adjustment > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';
    const absoluteQuantity = Math.abs(adjustment);

    // Delegate directly to StockMovementHandler which manages its own transaction.
    // No outer transaction wrapper — the handler's BEGIN/COMMIT is the real boundary.
    const handler = new StockMovementHandler(pool);
    const result = await handler.processMovement({
      productId,
      movementType,
      quantity: absoluteQuantity,
      reason,
      userId,
      referenceType: 'ADJUSTMENT',
    });

    logger.info('Inventory adjusted successfully', {
      productId,
      adjustment,
      reason,
      userId,
      movementId: result.movementId,
      movementNumber: result.movementNumber,
    });

    return result;
  },

  /**
   * Enterprise-grade batch adjustment.
   *
   * Reason drives the movement type — direction is explicit, quantity is always
   * positive. No sign inference. No negative numbers.
   *
   * Creates an inventory_adjustment_document as the audit header, then
   * delegates to StockMovementHandler which is the single authoritative handler
   * for all stock changes.
   *
   * Mapping: reason + direction → StockMovementType
   *   DAMAGE          (OUT) → DAMAGE
   *   EXPIRY          (OUT) → EXPIRY
   *   PHYSICAL_COUNT  (IN)  → ADJUSTMENT_IN  + referenceType=PHYSICAL_COUNT
   *   PHYSICAL_COUNT  (OUT) → ADJUSTMENT_OUT + referenceType=PHYSICAL_COUNT
   *   WRITE_OFF       (OUT) → ADJUSTMENT_OUT + referenceType=WRITE_OFF
   *   ADJUSTMENT      (IN)  → ADJUSTMENT_IN
   *   ADJUSTMENT      (OUT) → ADJUSTMENT_OUT
   */
  async adjustBatch(
    pool: Pool,
    params: {
      batchId?: string; // Optional: StockMovementHandler auto-selects via FEFO when omitted
      productId: string;
      quantity: number; // Always positive
      direction: AdjustmentDirection;
      reason: AdjustmentReason;
      notes: string;
      userId: string;
      documentId?: string; // If provided, links to an existing document
    }
  ) {
    if (params.quantity <= 0) {
      throw new ValidationError('Adjustment quantity must be positive');
    }

    // Map reason + direction to StockMovementHandler's movement type
    let movementType: StockMovementType;
    let referenceType: string = 'ADJ_DOC';

    switch (params.reason) {
      case 'DAMAGE':
        movementType = 'DAMAGE';
        break;
      case 'EXPIRY':
        movementType = 'EXPIRY';
        break;
      case 'PHYSICAL_COUNT':
        movementType = params.direction === 'IN' ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';
        referenceType = 'PHYSICAL_COUNT';
        break;
      case 'WRITE_OFF':
        movementType = 'ADJUSTMENT_OUT';
        referenceType = 'WRITE_OFF';
        break;
      case 'ADJUSTMENT':
      default:
        movementType = params.direction === 'IN' ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';
        break;
    }

    // Create adjustment document (or reuse provided one)
    let documentId = params.documentId;
    if (!documentId) {
      const year = getBusinessYear();
      // Sequential document number
      const seqResult = await pool.query(`SELECT nextval('adj_doc_seq') AS seq`);
      const seq = String(seqResult.rows[0].seq).padStart(5, '0');
      const documentNumber = `ADJ-${year}-${seq}`;

      const docResult = await pool.query(
        `INSERT INTO inventory_adjustment_documents (document_number, reason, notes, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [documentNumber, params.reason, params.notes, params.userId]
      );
      documentId = docResult.rows[0].id as string;
    }

    const handler = new StockMovementHandler(pool);
    const result = await handler.processMovement({
      productId: params.productId,
      batchId: params.batchId,
      movementType,
      quantity: params.quantity,
      reason: `${params.reason}: ${params.notes}`,
      referenceType,
      referenceId: documentId,
      userId: params.userId,
    });

    logger.info('Batch adjusted via enterprise contract', {
      documentId,
      batchId: params.batchId,
      productId: params.productId,
      quantity: params.quantity,
      direction: params.direction,
      reason: params.reason,
      movementType,
      movementId: result.movementId,
    });

    return { documentId, ...result };
  },

  /**
   * Select batches for allocation (FEFO)
   */
  async selectBatchesForAllocation(pool: Pool, productId: string, quantity: number) {
    return inventoryRepository.selectFEFOBatches(pool, productId, quantity);
  },

  /**
   * Get inventory value by product
   */
  async getInventoryValue(pool: Pool, productId?: string) {
    let query = `
      SELECT 
        p.id as product_id,
        p.name as product_name,
        SUM(b.remaining_quantity * b.cost_price) as inventory_value,
        SUM(b.remaining_quantity) as total_quantity
      FROM products p
      LEFT JOIN inventory_batches b ON p.id = b.product_id
      WHERE p.is_active = true
    `;

    const params: unknown[] = [];
    if (productId) {
      query += ' AND p.id = $1';
      params.push(productId);
    }

    query += ' GROUP BY p.id, p.name ORDER BY inventory_value DESC';

    const result = await pool.query(query, params);
    return result.rows;
  },
};
