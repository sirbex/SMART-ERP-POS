import { Pool, PoolClient } from 'pg';
import { poItemNetReceivedQuantitySql, poItemOpenQuantitySql } from '../purchase-orders/purchaseOrderNetReceived.js';
import { UnitOfWork } from '../../db/unitOfWork.js';
import { lotService } from '../inventory-lot/lotService.js';
import { postgresLotRepository } from '../inventory-lot/postgresLotRepository.js';

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
      `SELECT ib.id, ib.product_id, p.name AS product_name, p.sku,
              ib.batch_number, ib.expiry_date,
              ib.quantity, ib.remaining_quantity, ib.cost_price,
              ib.status, ib.created_at, ib.updated_at,
              COALESCE(u.name, 'PCS') AS unit_of_measure
       FROM inventory_batches ib
       JOIN products p ON p.id = ib.product_id
       LEFT JOIN uoms u ON u.id = p.base_uom_id
       WHERE ib.status = 'ACTIVE' AND ib.remaining_quantity > 0
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
       WHERE product_id = $1 
         AND remaining_quantity > 0 
         AND status = 'ACTIVE'
         AND (expiry_date IS NULL OR expiry_date > CURRENT_DATE)
       ORDER BY 
         expiry_date ASC NULLS LAST,
         received_date ASC`,
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
    const current = await pool.query<{ remaining_quantity: string }>(
      'SELECT remaining_quantity FROM inventory_batches WHERE id = $1',
      [batchId],
    );
    if (current.rows.length === 0) {
      throw new Error(`Batch ${batchId} not found`);
    }
    const delta = newQuantity - parseFloat(current.rows[0].remaining_quantity);
    if (delta > 0.0001) {
      await postgresLotRepository.increaseMasterRemainingQuantity(pool, batchId, delta);
    } else if (delta < -0.0001) {
      await postgresLotRepository.decrementMasterRemainingQuantity(pool, batchId, -delta);
    }
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
         p.category,
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
         COALESCE(po_agg.qty_on_order, 0) as qty_on_order,
         0 as qty_reserved,
         COALESCE(
         (
           SELECT json_agg(
             json_build_object(
               'uomId', pu.uom_id,
               'name', u.name,
               'symbol', u.symbol,
               'conversionFactor', pu.conversion_factor,
               'isDefault', pu.is_default,
               'price', COALESCE(pu.price_override, pv.selling_price * pu.conversion_factor),
               'cost', COALESCE(
                 pu.cost_override,
                 CASE
                   WHEN pu.price_override IS NOT NULL AND pv.selling_price > 0
                   THEN ROUND(
                     (COALESCE(NULLIF(pv.average_cost, 0), pv.cost_price)::numeric / pv.selling_price::numeric)
                     * pu.price_override::numeric,
                     2
                   )
                   ELSE COALESCE(NULLIF(pv.average_cost, 0), pv.cost_price) * pu.conversion_factor
                 END
               ),
               'priceIsOverridden', (pu.price_override IS NOT NULL),
               'computedPrice', (pv.selling_price * pu.conversion_factor)
             )
           )
           FROM product_uoms pu
           JOIN uoms u ON pu.uom_id = u.id
           WHERE pu.product_id = p.id
         ),
         (
           SELECT json_build_array(
             json_build_object(
               'uomId', u.id,
               'name', u.name,
               'symbol', u.symbol,
               'conversionFactor', 1,
               'isDefault', true,
               'price', pv.selling_price,
               'cost', COALESCE(NULLIF(pv.average_cost, 0), pv.cost_price),
               'priceIsOverridden', false,
               'computedPrice', pv.selling_price
             )
           )
           FROM uoms u
           WHERE u.id = p.base_uom_id
         )
       ) as uoms
       FROM products p
       LEFT JOIN product_inventory pi ON pi.product_id = p.id
       LEFT JOIN product_valuation pv ON pv.product_id = p.id
       LEFT JOIN inventory_batches b ON p.id = b.product_id AND b.status = 'ACTIVE'
       LEFT JOIN (
         SELECT poi.product_id,
                SUM(${poItemOpenQuantitySql('poi')}) as qty_on_order
         FROM purchase_order_items poi
         JOIN purchase_orders po ON po.id = poi.purchase_order_id
         WHERE po.status = 'PENDING'
           AND ${poItemOpenQuantitySql('poi')} > 0
         GROUP BY poi.product_id
       ) po_agg ON po_agg.product_id = p.id
       WHERE p.is_active = true
       GROUP BY p.id, p.name, p.sku, p.barcode, p.generic_name, p.category, pv.selling_price, p.is_taxable, p.tax_rate, p.min_days_before_expiry_sale, p.product_type, pv.average_cost, pv.cost_price, pi.reorder_level, pi.quantity_on_hand, po_agg.qty_on_order
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
      const delta = adjustment;

      if (delta > 0) {
        await lotService.returnLot(client, {
          productId: batch.product_id,
          batchId,
          quantity: delta,
          costPrice: 0,
          referenceType: 'ADJUSTMENT',
          referenceId: batchId,
          notes: reason,
          userId,
        });
      } else if (delta < 0) {
        await lotService.consumeLot(client, {
          productId: batch.product_id,
          quantity: -delta,
          specificLotId: batchId,
          selectionPolicy: 'MANUAL',
          recordMovement: false,
          syncProduct: false,
          referenceType: 'ADJUSTMENT',
          referenceId: batchId,
          userId,
        });
      }

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

    const result = await lotService.receiveLot(pool, {
      productId: data.productId,
      lotNumber: data.batchNumber,
      quantity: data.quantity,
      costPrice: data.costPrice,
      attributes: {
        receivedDate: new Date().toISOString().slice(0, 10),
        expiryDate: data.expiryDate,
      },
      sourceType: data.goodsReceiptId
        ? 'GOODS_RECEIPT'
        : data.isOpeningBalance
          ? 'OPENING_BALANCE'
          : 'ADJUSTMENT',
      goodsReceiptId: data.goodsReceiptId ?? null,
      goodsReceiptItemId: data.goodsReceiptItemId ?? null,
      purchaseOrderId: data.purchaseOrderId ?? null,
      purchaseOrderItemId: data.purchaseOrderItemId ?? null,
      isBonus: data.isBonus,
      userId: 'system',
    });
    const row = await pool.query('SELECT * FROM inventory_batches WHERE id = $1', [result.id]);
    return row.rows[0];
  },

  // ──────────────────────────────────────────────────────────────────
  // Batch Expiry Management (SAP master data correction)
  // ──────────────────────────────────────────────────────────────────

  /**
   * Get a single batch by ID with product info (for governance & display).
   */
  async getBatchById(pool: Pool, batchId: string): Promise<Record<string, unknown> | null> {
    const result = await pool.query(
      `SELECT ib.id, ib.batch_number, ib.product_id, p.name AS product_name,
              ib.expiry_date, ib.remaining_quantity, ib.quantity,
              ib.cost_price, ib.status, ib.received_date,
              ib.created_at, ib.updated_at
       FROM inventory_batches ib
       JOIN products p ON p.id = ib.product_id
       WHERE ib.id = $1`,
      [batchId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  },

  /**
   * Fetch expiry audit history for a batch (newest first).
   */
  async getExpiryAuditHistory(pool: Pool, batchId: string): Promise<Record<string, unknown>[]> {
    const result = await pool.query(
      `SELECT id, batch_id, batch_number, product_name,
              old_expiry_date, new_expiry_date,
              changed_by_id, changed_by_name, reason, changed_at, ip_address
       FROM batch_expiry_audit
       WHERE batch_id = $1
       ORDER BY changed_at DESC`,
      [batchId]
    );
    return result.rows;
  },
};
