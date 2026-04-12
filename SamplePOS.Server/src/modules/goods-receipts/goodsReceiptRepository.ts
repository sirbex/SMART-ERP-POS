import { Pool, PoolClient } from 'pg';
import logger from '../../utils/logger.js';
import { assertRowUpdated } from '../../utils/optimisticUpdate.js';
import { checkAccountingPeriodOpen } from '../../utils/periodGuard.js';
import { getBusinessYear } from '../../utils/dateRange.js';

export interface GoodsReceipt {
  id: string;
  grNumber: string;
  purchaseOrderId: string;
  receivedDate: string;  // DATE column — returned as YYYY-MM-DD string (timezone strategy)
  status: 'DRAFT' | 'COMPLETED' | 'CANCELLED';
  supplierDeliveryNote: string | null;
  receivedBy: string;
  receivedByName?: string | null;
  createdAt: string;
  updatedAt: string;
  // Join fields — present when fetched via getGRById / listGRs
  poNumber?: string | null;
  supplierId?: string | null;
  supplierName?: string | null;
}

export interface GoodsReceiptItem {
  id: string;
  goodsReceiptId: string;
  poItemId: string | null;
  productId: string;
  productName: string;
  orderedQuantity: number;
  receivedQuantity: number;
  unitCost: number;
  batchNumber: string | null;
  expiryDate: string | null;  // DATE column — returned as YYYY-MM-DD string
  isBonus: boolean;
  // Computed join fields — present from getGRById items query
  poUnitPrice?: number | null;
  productCostPrice?: number | null;
  qtyVariance?: number | null;
  costVariance?: number | null;
  uomName?: string | null;
  uomSymbol?: string | null;
  conversionFactor?: number;
}

export interface CreateGRData {
  purchaseOrderId?: string | null;
  receiptDate: string;
  notes: string | null;
  receivedBy: string;
  source?: 'PURCHASE_ORDER' | 'MANUAL' | 'OPENING_BALANCE';
}

export interface CreateGRItemData {
  goodsReceiptId: string;
  poItemId?: string | null;
  productId: string;
  productName: string;
  orderedQuantity: number;
  receivedQuantity: number;
  unitCost: number;
  batchNumber: string | null;
  expiryDate: string | null;
  uomId?: string | null; // SAP pattern: inherited from PO item
  baseQty?: number | null; // SAP UoM snapshot: received quantity in base unit
  baseUomId?: string | null; // SAP UoM snapshot: base UoM ID at posting time
  conversionFactor?: number; // SAP UoM snapshot: conversion factor at posting time
}

export interface UpdateGRItemData {
  receivedQuantity?: number;
  unitCost?: number;
  batchNumber?: string | null;
  isBonus?: boolean;
  expiryDate?: string | null;
}

export const goodsReceiptRepository = {
  /**
   * Generate next GR number (GR-YYYY-NNNN format)
   * Accepts Pool or PoolClient — MUST be called on transaction client
   * so the advisory lock is held until COMMIT.
   */
  async generateGRNumber(pool: Pool | PoolClient): Promise<string> {
    const year = getBusinessYear();
    // Advisory lock prevents concurrent duplicate GR number generation
    await pool.query(`SELECT pg_advisory_xact_lock(hashtext('gr_number_seq'))`);
    const result = await pool.query(
      `SELECT receipt_number FROM goods_receipts 
       WHERE receipt_number LIKE $1 
       ORDER BY receipt_number DESC 
       LIMIT 1`,
      [`GR-${year}-%`]
    );

    if (result.rows.length === 0) {
      return `GR-${year}-0001`;
    }

    const lastNumber = result.rows[0].receipt_number;
    const sequence = parseInt(lastNumber.split('-')[2]) + 1;
    return `GR-${year}-${sequence.toString().padStart(4, '0')}`;
  },

  /**
   * Create goods receipt
   * Accepts Pool or PoolClient to participate in caller's transaction.
   */
  async createGR(pool: Pool | PoolClient, data: CreateGRData): Promise<GoodsReceipt> {
    const grNumber = await this.generateGRNumber(pool);

    // Period enforcement (replaces trg_enforce_period_goods_receipts)
    await checkAccountingPeriodOpen(pool, data.receiptDate);

    const result = await pool.query(
      `INSERT INTO goods_receipts (
        receipt_number, purchase_order_id, received_date, received_by_id, notes, status
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING 
        id,
        receipt_number as "grNumber",
        purchase_order_id as "purchaseOrderId",
        received_date as "receivedDate",
        status,
        notes as "supplierDeliveryNote",
        received_by_id as "receivedBy",
        created_at as "createdAt",
        updated_at as "updatedAt",
        version`,
      [
        grNumber,
        data.purchaseOrderId || null,
        data.receiptDate,
        data.receivedBy,
        data.notes,
        'DRAFT',
      ]
    );

    return result.rows[0];
  },

  /**
   * Add items to goods receipt
   * Accepts Pool or PoolClient to participate in caller's transaction.
   */
  async addGRItems(pool: Pool | PoolClient, items: CreateGRItemData[]): Promise<GoodsReceiptItem[]> {
    const values: unknown[] = [];
    const placeholders: string[] = [];

    items.forEach((item, index) => {
      const offset = index * 11; // 11 fields (added base_qty, base_uom_id, conversion_factor)
      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11})`
      );
      values.push(
        item.goodsReceiptId,
        item.productId,
        item.receivedQuantity,
        item.batchNumber || null,
        item.expiryDate || null,
        item.unitCost,
        item.uomId || null,  // SAP pattern: inherited from PO item
        item.poItemId || null,  // po_item_id - link to purchase order item
        item.baseQty ?? null, // SAP UoM snapshot: base quantity
        item.baseUomId ?? null, // SAP UoM snapshot: base UoM at posting time
        item.conversionFactor ?? 1 // SAP UoM snapshot: conversion factor at posting time
      );
    });

    const result = await pool.query(
      `INSERT INTO goods_receipt_items (
        goods_receipt_id, product_id, received_quantity, batch_number, expiry_date, cost_price, uom_id, po_item_id, base_qty, base_uom_id, conversion_factor
      ) VALUES ${placeholders.join(', ')}
      RETURNING 
        id,
        goods_receipt_id as "goodsReceiptId",
        po_item_id as "poItemId",
        product_id as "productId",
        received_quantity as "receivedQuantity",
        batch_number as "batchNumber",
        expiry_date as "expiryDate",
        cost_price as "unitCost",
        uom_id as "uomId",
        is_bonus as "isBonus",
        created_at as "createdAt",
        version`,
      values
    );

    return result.rows;
  },

  /**
   * Get GR by ID with items
   * Accepts Pool or PoolClient to participate in caller's transaction.
   */
  async getGRById(
    pool: Pool | PoolClient,
    id: string
  ): Promise<{ gr: GoodsReceipt; items: GoodsReceiptItem[]; productUomsMap?: Record<string, Array<{ id: string; uomId: string; uomName: string; uomSymbol: string | null; conversionFactor: string; barcode: string | null; isDefault: boolean; priceOverride: string | null; costOverride: string | null }>> } | null> {
    const grResult = await pool.query(
      `SELECT 
         gr.id,
         gr.receipt_number as "grNumber",
         gr.purchase_order_id as "purchaseOrderId",
         gr.received_date as "receivedDate",
         gr.status,
         gr.notes as "supplierDeliveryNote",
         gr.received_by_id as "receivedBy",
         COALESCE(u.full_name, u.email) as "receivedByName",
         gr.created_at as "createdAt",
         gr.updated_at as "updatedAt",
         gr.version,
         po.order_number AS "poNumber",
         po.supplier_id as "supplierId",
         s."CompanyName" as "supplierName"
       FROM goods_receipts gr
       LEFT JOIN purchase_orders po ON gr.purchase_order_id = po.id
       LEFT JOIN suppliers s ON po.supplier_id = s."Id"
       LEFT JOIN users u ON u.id = gr.received_by_id
       WHERE gr.id = $1`,
      [id]
    );

    if (grResult.rows.length === 0) {
      return null;
    }

    const itemsResult = await pool.query(
      `SELECT 
         gri.id,
         gri.goods_receipt_id as "goodsReceiptId",
         gri.product_id as "productId",
         gri.po_item_id as "poItemId",
         p.name as "productName",
         ROUND(COALESCE(poi.ordered_quantity, gri.received_quantity)::numeric, 2) as "orderedQuantity",
         ROUND(gri.received_quantity::numeric, 2) as "receivedQuantity",
         gri.batch_number as "batchNumber",
         gri.expiry_date as "expiryDate",
         ROUND(gri.cost_price::numeric, 2) as "unitCost",
         gri.is_bonus as "isBonus",
         ROUND(poi.unit_price::numeric, 2) as "poUnitPrice",
         ROUND(pv.cost_price::numeric, 2) as "productCostPrice",
         ROUND((gri.received_quantity - COALESCE(poi.ordered_quantity, gri.received_quantity))::numeric, 2) as "qtyVariance",
         ROUND((gri.cost_price - COALESCE(poi.unit_price, pv.cost_price))::numeric, 2) as "costVariance",
         COALESCE(u.name, def_u.name) as "uomName",
         COALESCE(u.symbol, def_u.symbol) as "uomSymbol",
         COALESCE(pu.conversion_factor, def_pu.conversion_factor, 1) as "conversionFactor"
       FROM goods_receipt_items gri
       JOIN goods_receipts gr ON gr.id = gri.goods_receipt_id
       JOIN products p ON gri.product_id = p.id
       LEFT JOIN product_valuation pv ON pv.product_id = p.id
       LEFT JOIN purchase_order_items poi ON poi.id = gri.po_item_id
       LEFT JOIN uoms u ON u.id = COALESCE(gri.uom_id, poi.uom_id)
       LEFT JOIN product_uoms pu ON pu.product_id = gri.product_id AND pu.uom_id = COALESCE(gri.uom_id, poi.uom_id)
       LEFT JOIN product_uoms def_pu ON def_pu.product_id = gri.product_id AND def_pu.is_default = true
       LEFT JOIN uoms def_u ON def_u.id = def_pu.uom_id
       WHERE gri.goods_receipt_id = $1
       ORDER BY gri.created_at`,
      [id]
    );

    // Batch-fetch all product UoMs for every product in this GR (eliminates N+1)
    const productIds = [...new Set(itemsResult.rows.map((r: { productId: string }) => r.productId))];
    let productUomsMap: Record<string, Array<{
      id: string; uomId: string; uomName: string; uomSymbol: string | null;
      conversionFactor: string; barcode: string | null; isDefault: boolean;
      priceOverride: string | null; costOverride: string | null;
    }>> = {};

    if (productIds.length > 0) {
      const uomsResult = await pool.query(
        `SELECT
           pu.id,
           pu.product_id AS "productId",
           pu.uom_id AS "uomId",
           u.name AS "uomName",
           u.symbol AS "uomSymbol",
           pu.conversion_factor::text AS "conversionFactor",
           pu.barcode,
           pu.is_default AS "isDefault",
           pu.price_override::text AS "priceOverride",
           pu.cost_override::text AS "costOverride"
         FROM product_uoms pu
         JOIN uoms u ON u.id = pu.uom_id
         WHERE pu.product_id = ANY($1)
         ORDER BY pu.is_default DESC, u.name`,
        [productIds]
      );

      for (const row of uomsResult.rows) {
        const pid = row.productId;
        if (!productUomsMap[pid]) productUomsMap[pid] = [];
        productUomsMap[pid].push({
          id: row.id,
          uomId: row.uomId,
          uomName: row.uomName,
          uomSymbol: row.uomSymbol,
          conversionFactor: row.conversionFactor,
          barcode: row.barcode,
          isDefault: row.isDefault,
          priceOverride: row.priceOverride,
          costOverride: row.costOverride,
        });
      }
    }

    return {
      gr: grResult.rows[0],
      items: itemsResult.rows,
      productUomsMap,
    };
  },

  /**
   * Get a single GR item by id with parent GR
   */
  async getGRItemWithParent(
    pool: Pool | PoolClient,
    itemId: string
  ): Promise<{ item: GoodsReceiptItem & { ordered_quantity?: number }; gr: GoodsReceipt } | null> {
    // Fetch item with proper camelCase aliases, joining PO items for ordered quantity
    const itemRes = await pool.query(
      `SELECT 
         gri.id,
         gri.goods_receipt_id as "goodsReceiptId",
         gri.po_item_id as "poItemId",
         gri.product_id as "productId",
         p.name as "productName",
         gri.received_quantity as "receivedQuantity",
         gri.batch_number as "batchNumber",
         gri.expiry_date as "expiryDate",
         gri.cost_price as "unitCost",
         COALESCE(gri.is_bonus, false) as "isBonus",
         COALESCE(poi.ordered_quantity, gri.received_quantity) as "orderedQuantity"
       FROM goods_receipt_items gri
       JOIN products p ON gri.product_id = p.id
       LEFT JOIN purchase_order_items poi ON poi.id = gri.po_item_id
       WHERE gri.id = $1`,
      [itemId]
    );
    if (itemRes.rows.length === 0) return null;
    const item = itemRes.rows[0] as GoodsReceiptItem & { ordered_quantity?: number };
    // Fetch parent GR
    const grRes = await pool.query(
      `SELECT 
         id,
         receipt_number as "grNumber",
         purchase_order_id as "purchaseOrderId",
         received_date as "receivedDate",
         status,
         notes as "supplierDeliveryNote",
         received_by_id as "receivedBy",
         created_at as "createdAt",
         updated_at as "updatedAt"
       FROM goods_receipts WHERE id = $1`,
      [item.goodsReceiptId]
    );
    if (grRes.rows.length === 0) return null;
    const gr: GoodsReceipt = grRes.rows[0];
    return { item, gr };
  },

  /**
   * Update goods receipt item fields
   */
  async updateGRItem(
    pool: Pool | PoolClient,
    itemId: string,
    data: UpdateGRItemData
  ): Promise<GoodsReceiptItem> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.receivedQuantity !== undefined) {
      fields.push(`received_quantity = $${idx++}`);
      values.push(data.receivedQuantity);
    }
    if (data.unitCost !== undefined) {
      fields.push(`cost_price = $${idx++}`);
      values.push(data.unitCost);
    }
    if (data.batchNumber !== undefined) {
      fields.push(`batch_number = $${idx++}`);
      values.push(data.batchNumber);
    }
    if (data.isBonus !== undefined) {
      fields.push(`is_bonus = $${idx++}`);
      values.push(data.isBonus);
    }
    if (data.expiryDate !== undefined) {
      fields.push(`expiry_date = $${idx++}`);
      values.push(data.expiryDate);
    }

    if (fields.length === 0) {
      // Nothing to update, return current row with aliases
      const current = await pool.query(
        `SELECT 
           id,
           goods_receipt_id as "goodsReceiptId",
           product_id as "productId",
           received_quantity as "receivedQuantity",
           batch_number as "batchNumber",
           expiry_date as "expiryDate",
           cost_price as "unitCost",
           COALESCE(is_bonus, false) as "isBonus",
           created_at as "createdAt",
           version
         FROM goods_receipt_items WHERE id = $1`,
        [itemId]
      );
      if (current.rows.length === 0) throw new Error(`Goods receipt item ${itemId} not found`);
      return current.rows[0];
    }

    // Always bump version on GR item updates
    fields.push(`version = version + 1`);

    const result = await pool.query(
      `UPDATE goods_receipt_items
       SET ${fields.join(', ')}
       WHERE id = $${idx}
       RETURNING 
         id,
         goods_receipt_id as "goodsReceiptId",
         product_id as "productId",
         received_quantity as "receivedQuantity",
         batch_number as "batchNumber",
         expiry_date as "expiryDate",
         cost_price as "unitCost",
         is_bonus as "isBonus",
         created_at as "createdAt",
         version`,
      [...values, itemId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Goods receipt item ${itemId} not found`);
    }

    return result.rows[0];
  },

  /**
   * List goods receipts
   */
  async listGRs(
    pool: Pool,
    page: number = 1,
    limit: number = 50,
    filters?: { status?: string; purchaseOrderId?: string }
  ): Promise<{ grs: GoodsReceipt[]; total: number }> {
    const offset = (page - 1) * limit;
    const whereClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filters?.status) {
      whereClauses.push(`gr.status = $${paramIndex++}`);
      values.push(filters.status);
    }

    if (filters?.purchaseOrderId) {
      whereClauses.push(`gr.purchase_order_id = $${paramIndex++}`);
      values.push(filters.purchaseOrderId);
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM goods_receipts gr ${whereClause}`,
      values
    );

    const result = await pool.query(
      `SELECT 
         gr.id,
         gr.receipt_number as "grNumber",
         gr.purchase_order_id as "purchaseOrderId",
         gr.received_date as "receivedDate",
         gr.status,
         gr.notes as "supplierDeliveryNote",
         gr.received_by_id as "receivedBy",
         COALESCE(u.full_name, u.email) as "receivedByName",
         gr.created_at as "createdAt",
         gr.updated_at as "updatedAt",
         gr.version,
         po.order_number AS "poNumber",
         s."CompanyName" as "supplierName"
       FROM goods_receipts gr
       LEFT JOIN purchase_orders po ON gr.purchase_order_id = po.id
       LEFT JOIN suppliers s ON po.supplier_id = s."Id"
       LEFT JOIN users u ON u.id = gr.received_by_id
       ${whereClause} 
       ORDER BY gr.created_at DESC 
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, limit, offset]
    );

    return {
      grs: result.rows,
      total: parseInt(countResult.rows[0].count),
    };
  },

  /**
   * Finalize goods receipt
   * Accepts Pool or PoolClient to participate in caller's transaction.
   */
  async finalizeGR(pool: Pool | PoolClient, id: string): Promise<GoodsReceipt> {
    const result = await pool.query(
      `UPDATE goods_receipts 
       SET status = $1,
           version = version + 1,
           total_value = (
             SELECT COALESCE(SUM(received_quantity * cost_price), 0)
             FROM goods_receipt_items
             WHERE goods_receipt_id = $2
           ),
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING 
         id,
         receipt_number as "grNumber",
         purchase_order_id as "purchaseOrderId",
         received_date as "receivedDate",
         status,
         notes as "supplierDeliveryNote",
         received_by_id as "receivedBy",
         created_at as "createdAt",
         updated_at as "updatedAt",
         version`,
      ['COMPLETED', id]
    );

    if (result.rows.length === 0) {
      throw new Error(`Goods receipt ${id} not found`);
    }

    return result.rows[0];
  },

  /**
   * Update PO item received quantity
   * Accepts Pool or PoolClient to participate in caller's transaction.
   */
  async updatePOItemReceivedQuantity(
    pool: Pool | PoolClient,
    poItemId: string,
    additionalQuantity: number
  ): Promise<void> {
    logger.info('Executing updatePOItemReceivedQuantity', {
      poItemId,
      additionalQuantity,
    });
    const result = await pool.query(
      'UPDATE purchase_order_items SET received_quantity = received_quantity + $1 WHERE id = $2',
      [additionalQuantity, poItemId]
    );
    logger.info('PO item update query executed', {
      poItemId,
      rowsAffected: result.rowCount,
    });
  },

  /**
   * Check if PO is fully received
   */
  async isPOFullyReceived(pool: Pool | PoolClient, poId: string): Promise<boolean> {
    const result = await pool.query(
      `SELECT 
         COUNT(*) FILTER (WHERE ordered_quantity > received_quantity) as pending_items
       FROM purchase_order_items
       WHERE purchase_order_id = $1`,
      [poId]
    );

    return parseInt(result.rows[0].pending_items) === 0;
  },
};
