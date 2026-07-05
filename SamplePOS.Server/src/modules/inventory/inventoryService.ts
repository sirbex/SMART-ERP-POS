import { Pool } from 'pg';
import Decimal from 'decimal.js';
import { inventoryRepository } from './inventoryRepository.js';
import { inventoryStockQueryService } from './warehouse/inventoryStockQueryService.js';
import { isMultistoreEnabled } from './warehouse/multistoreSettings.js';
import { warehouseAdjustmentService } from './warehouse/warehouseAdjustmentService.js';
import type { StockLevel } from './inventoryRepository.js';
import { posProductSearchService } from './warehouse/posProductSearchService.js';
import { stockVisibilityService } from './warehouse/stockVisibilityService.js';
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
   * Get stock levels for all products.
   * Routes to legacy batches or composite multistore balances based on tenant settings.
   */
  async getStockLevels(pool: Pool, storeLocationId?: string) {
    return inventoryStockQueryService.getStockLevels(pool, storeLocationId);
  },

  /**
   * Get stock level for specific product.
   * Routes to legacy batches or composite multistore balances based on tenant settings.
   */
  async getStockLevelByProduct(pool: Pool, productId: string) {
    const stockLevel = await inventoryStockQueryService.getStockLevelByProduct(pool, productId);

    if (!stockLevel) {
      throw new Error(`Product ${productId} not found or inactive`);
    }

    return stockLevel;
  },

  /**
   * Get products that need reordering
   */
  async getProductsNeedingReorder(pool: Pool) {
    const stockLevels = await inventoryStockQueryService.getStockLevels(pool);
    return stockLevels.filter((item) => {
      const row = item as StockLevel & { needs_reorder?: boolean };
      return row.needsReorder === true || row.needs_reorder === true;
    });
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
    userId: string,
    options?: { storeLocationId?: string },
  ) {
    // Validate adjustment is not zero
    if (adjustment === 0) {
      throw new Error('Adjustment amount cannot be zero');
    }

    if (!reason || reason.trim().length < 5) {
      throw new Error('Adjustment reason must be at least 5 characters');
    }

    const direction: AdjustmentDirection = adjustment > 0 ? 'IN' : 'OUT';
    const absoluteQuantity = Math.abs(adjustment);

    if (await isMultistoreEnabled(pool)) {
      const storeLocationId = await warehouseAdjustmentService.resolveStoreLocationId(
        pool,
        options?.storeLocationId,
      );
      const result = await warehouseAdjustmentService.adjustAtStore(pool, {
        storeLocationId,
        productId,
        quantity: absoluteQuantity,
        direction,
        reason: 'ADJUSTMENT',
        notes: reason,
        userId,
      });

      logger.info('Inventory adjusted successfully (multistore)', {
        productId,
        adjustment,
        reason,
        userId,
        storeLocationId,
        movementId: 'movementId' in result ? result.movementId : undefined,
      });

      return result;
    }

    // Legacy single-store path — delegate to StockMovementHandler
    const movementType = direction === 'IN' ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';

    let resolvedUnitCost: number | undefined;
    if (movementType === 'ADJUSTMENT_IN') {
      const costRow = await pool.query(
        'SELECT cost_price FROM product_valuation WHERE product_id = $1',
        [productId],
      );
      const dbCost = costRow.rows[0]?.cost_price;
      if (dbCost && parseFloat(String(dbCost)) > 0) {
        resolvedUnitCost = parseFloat(String(dbCost));
      }
    }

    const handler = new StockMovementHandler(pool);
    const result = await handler.processMovement({
      productId,
      movementType,
      quantity: absoluteQuantity,
      unitCost: resolvedUnitCost,
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
      unitCost?: number;   // Optional: auto-looked up from product_valuation for ADJUSTMENT_IN
      storeLocationId?: string;
      productLotId?: string;
    }
  ) {
    if (params.quantity <= 0) {
      throw new ValidationError('Adjustment quantity must be positive');
    }

    if (await isMultistoreEnabled(pool)) {
      const storeLocationId = await warehouseAdjustmentService.resolveStoreLocationId(
        pool,
        params.storeLocationId,
      );
      return warehouseAdjustmentService.adjustAtStore(pool, {
        storeLocationId,
        productId: params.productId,
        productLotId: params.productLotId,
        batchId: params.batchId,
        quantity: params.quantity,
        direction: params.direction,
        reason: params.reason,
        notes: params.notes,
        userId: params.userId,
        documentId: params.documentId,
        unitCost: params.unitCost,
      });
    }

    // Legacy single-store path (unchanged)
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

    // For ADJUSTMENT_IN: resolve unitCost from product_valuation when caller didn't supply one.
    // This lets the MDG-001b guard pass for products that already have a cost set, while
    // still blocking zero-cost products (guard fires when the lookup also returns 0/null).
    let resolvedUnitCost = params.unitCost;
    if (movementType === 'ADJUSTMENT_IN' && (!resolvedUnitCost || resolvedUnitCost <= 0)) {
      const costRow = await pool.query(
        'SELECT cost_price FROM product_valuation WHERE product_id = $1',
        [params.productId]
      );
      const dbCost = costRow.rows[0]?.cost_price;
      if (dbCost && parseFloat(String(dbCost)) > 0) {
        resolvedUnitCost = parseFloat(String(dbCost));
      }
    }

    const handler = new StockMovementHandler(pool);
    const result = await handler.processMovement({
      productId: params.productId,
      batchId: params.batchId,
      movementType,
      quantity: params.quantity,
      unitCost: resolvedUnitCost,
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

  /** POS catalog — sellable products only (store-isolated when multistore). */
  async getPosCatalog(pool: Pool) {
    return posProductSearchService.getPosCatalog(pool);
  },

  /** POS product search — omits zero-stock and expired inventory. */
  async searchPosProducts(pool: Pool, query: string, limit?: number) {
    return posProductSearchService.searchProducts(pool, { query, limit });
  },

  /** FEFO allocation lock preview (SELECT … FOR UPDATE inside transaction). */
  async lockPosAllocation(pool: Pool, productId: string, quantity: number) {
    return posProductSearchService.lockAllocation(pool, productId, quantity);
  },

  /** Stock visibility — legacy global or multistore store-scoped dimensions. */
  async getStockVisibility(pool: Pool) {
    return stockVisibilityService.getStockVisibility(pool);
  },
};
