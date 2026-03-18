import { Pool, PoolClient } from 'pg';
import { UnitOfWork } from '../../db/unitOfWork.js';

export interface InventoryBatch {
  id: string;
  productId: string;
  batchNumber: string;
  quantity: number;
  remainingQuantity: number;
  expiryDate: Date | null;
  costPrice: number;
  goodsReceiptId?: string | null;
  goodsReceiptItemId?: string | null;
  purchaseOrderId?: string | null;
  purchaseOrderItemId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StockLevel {
  productId: string;
  productName: string;
  totalQuantity: number;
  reorderLevel: number;
  needsReorder: boolean;
}

export const inventoryRepository = {
  /**
   * Get all active batches across all products (for offline sync)
   */
  async getAllActiveBatches(pool: Pool): Promise<Record<string, unknown>[]> {
    const result = await pool.query(
      `SELECT ib.id, ib.product_id, p.name AS product_name,
              ib.batch_number, ib.expiry_date,
              ib.remaining_quantity, ib.cost_price AS unit_cost
       FROM inventory_batches ib
       JOIN products p ON p.id = ib.product_id
       WHERE ib.remaining_quantity > 0
       ORDER BY p.name ASC, ib.expiry_date ASC NULLS LAST`
    );
    return result.rows;
  },

  /**
   * Get all batches for a product (FEFO order: earliest expiry first)
   */
  async getBatchesByProduct(pool: Pool, productId: string): Promise<InventoryBatch[]> {
    const result = await pool.query(
      `SELECT * FROM inventory_batches 
       WHERE product_id = $1 AND remaining_quantity > 0
       ORDER BY 
         CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END,
         expiry_date ASC,
         created_at ASC`,
      [productId]
    );
    return result.rows;
  },

  /**
   * Get FEFO batch selection (for allocation)
   */
  async selectFEFOBatches(
    pool: Pool,
    productId: string,
    quantityNeeded: number
  ): Promise<{ batch: InventoryBatch; quantityToTake: number }[]> {
    const batches = await this.getBatchesByProduct(pool, productId);

    const allocations: { batch: InventoryBatch; quantityToTake: number }[] = [];
    let remaining = quantityNeeded;

    for (const batch of batches) {
      if (remaining <= 0) break;

      const quantityToTake = Math.min(remaining, batch.remainingQuantity);
      allocations.push({ batch, quantityToTake });
      remaining -= quantityToTake;
    }

    if (remaining > 0) {
      throw new Error(
        `Insufficient inventory for product ${productId}. Short by ${remaining} units`
      );
    }

    return allocations;
  },

  /**
   * Update batch quantity
   * Accepts Pool or PoolClient to participate in caller's transaction
   */
  async updateBatchQuantity(pool: Pool | PoolClient, batchId: string, newQuantity: number): Promise<void> {
    await pool.query(
      'UPDATE inventory_batches SET remaining_quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newQuantity, batchId]
    );
  },

  /**
   * Get batches expiring soon (within days threshold)
   */
  async getBatchesExpiringSoon(pool: Pool, daysThreshold: number = 30): Promise<InventoryBatch[]> {
    const result = await pool.query(
      `SELECT b.*, p.name as product_name 
       FROM inventory_batches b
       JOIN products p ON b.product_id = p.id
       WHERE b.expiry_date IS NOT NULL 
         AND b.remaining_quantity > 0
         AND b.expiry_date <= CURRENT_DATE + INTERVAL '1 day' * $1
       ORDER BY b.expiry_date ASC`,
      [daysThreshold]
    );
    return result.rows;
  },

  /**
   * Get stock levels for all products with detailed information for POS
   * Includes product details, UoMs, pricing, and earliest expiry date
   */
  async getStockLevels(pool: Pool): Promise<StockLevel[]> {
    const result = await pool.query(
      `SELECT 
         p.id as product_id,
         p.name as product_name,
         p.sku,
         p.barcode,
         p.generic_name,
         pv.selling_price,
         p.is_taxable,
         p.tax_rate,
         p.min_days_before_expiry_sale,
         p.product_type,
         COALESCE(NULLIF(pv.average_cost, 0), pv.cost_price) as average_cost,
         COALESCE(SUM(b.remaining_quantity), pi.quantity_on_hand) as total_stock,
         MIN(b.expiry_date) as nearest_expiry,
         pi.reorder_level,
         CASE WHEN COALESCE(SUM(b.remaining_quantity), pi.quantity_on_hand) <= pi.reorder_level THEN true ELSE false END as needs_reorder,
         (
           SELECT json_agg(
             json_build_object(
               'uomId', pu.id,
               'name', u.name,
               'symbol', u.symbol,
               'conversionFactor', pu.conversion_factor,
               'isDefault', pu.is_default,
               'price', COALESCE(pu.price_override, pv.selling_price * pu.conversion_factor),
               'cost', COALESCE(pu.cost_override, COALESCE(NULLIF(pv.average_cost, 0), pv.cost_price) * pu.conversion_factor)
             )
           )
           FROM product_uoms pu
           JOIN uoms u ON pu.uom_id = u.id
           WHERE pu.product_id = p.id
         ) as uoms
       FROM products p
       LEFT JOIN product_inventory pi ON pi.product_id = p.id
       LEFT JOIN product_valuation pv ON pv.product_id = p.id
       LEFT JOIN inventory_batches b ON p.id = b.product_id AND b.status = 'ACTIVE'
       WHERE p.is_active = true
       GROUP BY p.id, p.name, p.sku, p.barcode, p.generic_name, pv.selling_price, p.is_taxable, p.tax_rate, p.min_days_before_expiry_sale, p.product_type, pv.average_cost, pv.cost_price, pi.reorder_level, pi.quantity_on_hand
       ORDER BY needs_reorder DESC, p.name ASC`
    );
    return result.rows;
  },

  /**
   * Get stock level for specific product
   */
  async getStockLevelByProduct(pool: Pool, productId: string): Promise<StockLevel | null> {
    const result = await pool.query(
      `SELECT 
         p.id as product_id,
         p.name as product_name,
         COALESCE(SUM(b.remaining_quantity), pi.quantity_on_hand) as total_quantity,
         pi.reorder_level,
         CASE WHEN COALESCE(SUM(b.remaining_quantity), pi.quantity_on_hand) <= pi.reorder_level THEN true ELSE false END as needs_reorder
       FROM products p
       LEFT JOIN product_inventory pi ON pi.product_id = p.id
       LEFT JOIN inventory_batches b ON p.id = b.product_id AND b.status = 'ACTIVE'
       WHERE p.id = $1 AND p.is_active = true
       GROUP BY p.id, p.name, pi.reorder_level, pi.quantity_on_hand`,
      [productId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  },

  /**
   * Adjust batch quantity (for corrections/adjustments)
   * Uses FOR UPDATE to prevent lost updates under concurrency
   */
  async adjustBatchQuantity(
    pool: Pool,
    batchId: string,
    adjustment: number,
    reason: string,
    userId: string
  ): Promise<InventoryBatch> {
    return UnitOfWork.run(pool, async (client) => {
      // Suppress the inventory_batches trigger that auto-creates SM- stock_movements
      // This function already creates proper stock_movements for the adjustment
      await client.query("SET LOCAL app.skip_stock_movement_trigger = 'true'");

      // Get current batch WITH ROW LOCK to prevent concurrent lost updates
      const batchResult = await client.query('SELECT * FROM inventory_batches WHERE id = $1 FOR UPDATE', [
        batchId,
      ]);

      if (batchResult.rows.length === 0) {
        throw new Error(`Batch ${batchId} not found`);
      }

      const batch = batchResult.rows[0] as InventoryBatch & { product_id: string; remaining_quantity: number };
      const newQuantity = batch.remaining_quantity + adjustment;

      if (newQuantity < 0) {
        throw new Error(`Adjustment would result in negative quantity for batch ${batchId}`);
      }

      // Update batch
      await client.query(
        'UPDATE inventory_batches SET remaining_quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [newQuantity, batchId]
      );

      // Record stock movement
      await client.query(
        `INSERT INTO stock_movements (
          product_id, batch_id, movement_type, quantity, reference_type, reference_id, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          batch.product_id,
          batchId,
          adjustment > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
          adjustment,
          'ADJUSTMENT',
          batchId,
          reason,
          userId,
        ]
      );

      // Get updated batch
      const updatedResult = await client.query('SELECT * FROM inventory_batches WHERE id = $1', [
        batchId,
      ]);

      return updatedResult.rows[0] as InventoryBatch;
    });
  },

  /**
   * Create new inventory batch
   * Accepts Pool or PoolClient to participate in caller's transaction
   * 
   * BUG FIX: Batches MUST be created with a valid source reference to prevent ghost batches.
   * Valid sources:
   * - Goods Receipt (goodsReceiptId) - Primary source for purchased inventory
   * - Stock Adjustment (adjustmentId) - For corrections with audit trail
   * - Opening Balance (isOpeningBalance = true) - For initial system setup only
   * 
   * @throws Error if no valid source is provided (prevents ghost batches)
   */
  async createBatch(
    pool: Pool | PoolClient,
    data: {
      productId: string;
      batchNumber: string;
      quantity: number;
      expiryDate: string | null;
      costPrice: number;
      goodsReceiptId?: string | null;
      goodsReceiptItemId?: string | null;
      purchaseOrderId?: string | null;
      purchaseOrderItemId?: string | null;
      adjustmentId?: string | null;       // For stock adjustments
      isOpeningBalance?: boolean;          // For initial system setup
      isBonus?: boolean;                   // Bonus stock from supplier (cost = 0)
    }
  ): Promise<InventoryBatch> {
    // BUG FIX: Validate that batch has a valid source to prevent ghost batches
    const hasValidSource =
      data.goodsReceiptId ||
      data.adjustmentId ||
      data.isOpeningBalance === true;

    if (!hasValidSource) {
      throw new Error(
        'GHOST_BATCH_PREVENTION: Cannot create inventory batch without valid source. ' +
        'Batches must be created through: Goods Receipt, Stock Adjustment, or Opening Balance. ' +
        `ProductId: ${data.productId}, BatchNumber: ${data.batchNumber}`
      );
    }

    const result = await pool.query(
      `INSERT INTO inventory_batches (
        product_id, batch_number, quantity, remaining_quantity,
        expiry_date, cost_price, goods_receipt_id, goods_receipt_item_id,
        purchase_order_id, purchase_order_item_id, is_bonus
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        data.productId,
        data.batchNumber,
        data.quantity,
        data.quantity,
        data.expiryDate,
        data.costPrice,
        data.goodsReceiptId || null,
        data.goodsReceiptItemId || null,
        data.purchaseOrderId || null,
        data.purchaseOrderItemId || null,
        data.isBonus ?? false,
      ]
    );
    return result.rows[0];
  },
};
