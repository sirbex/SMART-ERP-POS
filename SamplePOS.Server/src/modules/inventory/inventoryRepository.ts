import { Pool } from 'pg';

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
   */
  async updateBatchQuantity(pool: Pool, batchId: string, newQuantity: number): Promise<void> {
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
         p.selling_price,
         p.is_taxable,
         p.tax_rate,
         COALESCE(NULLIF(p.average_cost, 0), p.cost_price) as average_cost,
         COALESCE(SUM(b.remaining_quantity), p.quantity_on_hand) as total_stock,
         MIN(b.expiry_date) as nearest_expiry,
         p.reorder_level,
         CASE WHEN COALESCE(SUM(b.remaining_quantity), p.quantity_on_hand) <= p.reorder_level THEN true ELSE false END as needs_reorder,
         (
           SELECT json_agg(
             json_build_object(
               'uomId', pu.id,
               'name', u.name,
               'symbol', u.symbol,
               'conversionFactor', pu.conversion_factor,
               'isDefault', pu.is_default,
               'price', COALESCE(pu.price_override, p.selling_price * pu.conversion_factor),
               'cost', COALESCE(pu.cost_override, NULLIF(p.average_cost, 0), p.cost_price) * pu.conversion_factor
             )
           )
           FROM product_uoms pu
           JOIN uoms u ON pu.uom_id = u.id
           WHERE pu.product_id = p.id
         ) as uoms
       FROM products p
       LEFT JOIN inventory_batches b ON p.id = b.product_id AND b.status = 'ACTIVE'
       WHERE p.is_active = true
       GROUP BY p.id, p.name, p.sku, p.barcode, p.selling_price, p.is_taxable, p.tax_rate, p.average_cost, p.cost_price, p.reorder_level
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
         COALESCE(SUM(b.remaining_quantity), p.quantity_on_hand) as total_quantity,
         p.reorder_level,
         CASE WHEN COALESCE(SUM(b.remaining_quantity), p.quantity_on_hand) <= p.reorder_level THEN true ELSE false END as needs_reorder
       FROM products p
       LEFT JOIN inventory_batches b ON p.id = b.product_id AND b.status = 'ACTIVE'
       WHERE p.id = $1 AND p.is_active = true
       GROUP BY p.id, p.name, p.reorder_level`,
      [productId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  },

  /**
   * Adjust batch quantity (for corrections/adjustments)
   */
  async adjustBatchQuantity(
    pool: Pool,
    batchId: string,
    adjustment: number,
    reason: string,
    userId: string
  ): Promise<InventoryBatch> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get current batch
      const batchResult = await client.query('SELECT * FROM inventory_batches WHERE id = $1', [
        batchId,
      ]);

      if (batchResult.rows.length === 0) {
        throw new Error(`Batch ${batchId} not found`);
      }

      const batch = batchResult.rows[0];
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

      await client.query('COMMIT');

      // Get updated batch
      const updatedResult = await client.query('SELECT * FROM inventory_batches WHERE id = $1', [
        batchId,
      ]);

      return updatedResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  /**
   * Create new inventory batch
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
    pool: Pool,
    data: {
      productId: string;
      batchNumber: string;
      quantity: number;
      expiryDate: Date | null;
      costPrice: number;
      goodsReceiptId?: string | null;
      goodsReceiptItemId?: string | null;
      purchaseOrderId?: string | null;
      purchaseOrderItemId?: string | null;
      adjustmentId?: string | null;       // For stock adjustments
      isOpeningBalance?: boolean;          // For initial system setup
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
        purchase_order_id, purchase_order_item_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
      ]
    );
    return result.rows[0];
  },
};
