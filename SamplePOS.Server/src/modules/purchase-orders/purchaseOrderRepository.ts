import { Pool, PoolClient } from 'pg';
import Decimal from 'decimal.js';
import { UnitOfWork } from '../../db/unitOfWork.js';
import { assertRowUpdated } from '../../utils/optimisticUpdate.js';
import { getBusinessYear } from '../../utils/dateRange.js';

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  orderDate: string;
  expectedDate: string | null;
  status: 'DRAFT' | 'PENDING' | 'COMPLETED' | 'CANCELLED';
  totalAmount: number;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderItem {
  id: string;
  purchaseOrderId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
  receivedQuantity: number;
  uomId?: string | null;
  uomName?: string | null;
}

export interface CreatePOData {
  supplierId: string;
  orderDate: string;
  expectedDate: string | null;
  notes: string | null;
  createdBy: string;
}

export interface CreatePOItemData {
  purchaseOrderId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitCost: number;
  lineTotal?: number; // Frontend-authoritative total (preserves user's intended total)
  uomId?: string | null;
  baseQty?: number | null; // SAP UoM snapshot: quantity in base unit
  baseUomId?: string | null; // SAP UoM snapshot: base UoM ID at posting time
  conversionFactor?: number; // SAP UoM snapshot: conversion factor at posting time
}

export const purchaseOrderRepository = {
  /**
   * Generate next PO number (PO-YYYY-NNNN format)
   */
  async generatePONumber(pool: Pool | PoolClient): Promise<string> {
    const year = getBusinessYear();
    // Advisory lock prevents concurrent duplicate PO number generation (held until TX commit)
    await pool.query(`SELECT pg_advisory_xact_lock(hashtext('po_number_seq'))`);
    const result = await pool.query(
      `SELECT order_number FROM purchase_orders 
       WHERE order_number LIKE $1 
       ORDER BY order_number DESC 
       LIMIT 1`,
      [`PO-${year}-%`]
    );

    if (result.rows.length === 0) {
      return `PO-${year}-0001`;
    }

    const lastNumber = result.rows[0].order_number;
    const sequence = parseInt(lastNumber.split('-')[2]) + 1;
    return `PO-${year}-${sequence.toString().padStart(4, '0')}`;
  },

  /**
   * Create purchase order
   */
  async createPO(pool: Pool | PoolClient, data: CreatePOData): Promise<PurchaseOrder> {
    const poNumber = await this.generatePONumber(pool);

    const result = await pool.query(
      `INSERT INTO purchase_orders (
        order_number, supplier_id, order_date, expected_delivery_date, notes, created_by_id
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [poNumber, data.supplierId, data.orderDate, data.expectedDate, data.notes, data.createdBy]
    );

    return result.rows[0];
  },

  /**
   * Create manual PO (auto-generated from manual goods receipt)
   * Creates PO in COMPLETED status with manual_receipt flag set to true
   */
  async createManualPO(
    pool: Pool | PoolClient,
    data: CreatePOData & { items: CreatePOItemData[] }
  ): Promise<{ po: PurchaseOrder; items: PurchaseOrderItem[] }> {
    const poNumber = await this.generatePONumber(pool);

    // Calculate total amount from items
    const totalAmount = data.items.reduce((sum, item) => {
      return sum.plus(new Decimal(item.quantity).times(item.unitCost));
    }, new Decimal(0)).toNumber();

    // Create PO with COMPLETED status and manual_receipt flag
    const poResult = await pool.query(
      `INSERT INTO purchase_orders (
        order_number, supplier_id, order_date, expected_delivery_date, 
        notes, created_by_id, status, total_amount, manual_receipt
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING 
        id,
        order_number as "poNumber",
        supplier_id as "supplierId",
        order_date as "orderDate",
        expected_delivery_date as "expectedDate",
        status,
        total_amount as "totalAmount",
        notes,
        created_by_id as "createdBy",
        manual_receipt as "manualReceipt",
        created_at as "createdAt",
        updated_at as "updatedAt"`,
      [
        poNumber,
        data.supplierId,
        data.orderDate,
        data.expectedDate,
        data.notes || `Auto-generated PO for manual goods receipt`,
        data.createdBy,
        'COMPLETED', // Manual POs are immediately completed
        totalAmount,
        true, // Flag as manual receipt
      ]
    );

    const po = poResult.rows[0];

    // Add PO items
    const itemsWithPOId = data.items.map((item) => ({
      ...item,
      purchaseOrderId: po.id,
    }));

    const items = await this.addPOItems(pool, itemsWithPOId);

    return { po, items };
  },

  /**
   * Add items to purchase order
   */
  async addPOItems(pool: Pool | PoolClient, items: CreatePOItemData[]): Promise<PurchaseOrderItem[]> {
    const values: unknown[] = [];
    const placeholders: string[] = [];

    items.forEach((item, index) => {
      const offset = index * 9; // 9 fields (added base_qty, base_uom_id, conversion_factor)
      // Use frontend-provided lineTotal if available (preserves user's intended total),
      // otherwise recalculate from qty × unitCost
      const lineTotal = item.lineTotal != null
        ? new Decimal(item.lineTotal).toNumber()
        : new Decimal(item.quantity).times(item.unitCost).toNumber();

      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9})`
      );

      values.push(
        item.purchaseOrderId,
        item.productId,
        item.quantity,
        item.unitCost,
        lineTotal,
        item.uomId || null,
        item.baseQty ?? null, // SAP UoM snapshot: base quantity
        item.baseUomId ?? null, // SAP UoM snapshot: base UoM at posting time
        item.conversionFactor ?? 1 // SAP UoM snapshot: conversion factor at posting time
      );
    });

    const result = await pool.query(
      `INSERT INTO purchase_order_items (
        purchase_order_id, product_id, ordered_quantity, unit_price, total_price, uom_id, base_qty, base_uom_id, conversion_factor
      ) VALUES ${placeholders.join(', ')}
      RETURNING *`,
      values
    );

    return result.rows;
  },

  /**
   * Get PO by ID with items
   */
  async getPOById(
    pool: Pool | PoolClient,
    id: string
  ): Promise<{ po: PurchaseOrder; items: PurchaseOrderItem[] } | null> {
    const poResult = await pool.query(
      `SELECT po.*, s."CompanyName" as supplier_name 
       FROM purchase_orders po
       JOIN suppliers s ON po.supplier_id = s."Id"
       WHERE po.id = $1`,
      [id]
    );

    if (poResult.rows.length === 0) {
      return null;
    }

    const itemsResult = await pool.query(
      `SELECT 
         poi.*,
         p.name as product_name,
         COALESCE(u.name, def_u.name) as uom_name,
         COALESCE(pu.conversion_factor, 1)::numeric as conversion_factor,
         COALESCE(pv.cost_price, 0)::numeric as product_cost_price
       FROM purchase_order_items poi
       JOIN products p ON poi.product_id = p.id
       LEFT JOIN uoms u ON poi.uom_id = u.id
       LEFT JOIN product_uoms pu ON pu.product_id = p.id AND pu.uom_id = poi.uom_id
       LEFT JOIN product_uoms def_pu ON def_pu.product_id = p.id AND def_pu.is_default = true
       LEFT JOIN uoms def_u ON def_u.id = def_pu.uom_id
       LEFT JOIN product_valuation pv ON pv.product_id = p.id
       WHERE poi.purchase_order_id = $1 
       ORDER BY poi.created_at`,
      [id]
    );

    return {
      po: poResult.rows[0],
      items: itemsResult.rows,
    };
  },

  /**
   * List purchase orders with pagination
   */
  async listPOs(
    pool: Pool | PoolClient,
    page: number = 1,
    limit: number = 50,
    filters?: { status?: string; supplierId?: string }
  ): Promise<{ pos: PurchaseOrder[]; total: number }> {
    const offset = (page - 1) * limit;
    const whereClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filters?.status) {
      whereClauses.push(`po.status = $${paramIndex++}`);
      values.push(filters.status);

      // If filtering by PENDING, exclude POs that already have goods receipts
      if (filters.status === 'PENDING') {
        whereClauses.push(`NOT EXISTS (
          SELECT 1 FROM goods_receipts gr 
          WHERE gr.purchase_order_id = po.id
        )`);
      }
    }

    if (filters?.supplierId) {
      whereClauses.push(`po.supplier_id = $${paramIndex++}`);
      values.push(filters.supplierId);
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM purchase_orders po ${whereClause}`,
      values
    );

    const result = await pool.query(
      `SELECT po.*, s."CompanyName" as supplier_name 
       FROM purchase_orders po
       JOIN suppliers s ON po.supplier_id = s."Id"
       ${whereClause} 
       ORDER BY po.created_at DESC 
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, limit, offset]
    );

    return {
      pos: result.rows,
      total: parseInt(countResult.rows[0].count),
    };
  },

  /**
   * Update PO status
   */
  async updatePOStatus(pool: Pool | PoolClient, id: string, status: string): Promise<PurchaseOrder> {
    const result = await pool.query(
      'UPDATE purchase_orders SET status = $1, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [status, id]
    );

    if (result.rows.length === 0) {
      throw new Error(`Purchase order ${id} not found`);
    }

    return result.rows[0];
  },

  /**
   * Update PO total amount
   */
  async updatePOTotal(pool: Pool | PoolClient, id: string): Promise<void> {
    await pool.query(
      `UPDATE purchase_orders 
       SET total_amount = (
         SELECT COALESCE(SUM(total_price), 0) 
         FROM purchase_order_items 
         WHERE purchase_order_id = $1
       ),
       updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id]
    );
  },

  /**
   * Update PO header fields (DRAFT only)
   */
  async updatePOHeader(
    pool: Pool | PoolClient,
    id: string,
    data: { supplierId?: string; expectedDate?: string | null; notes?: string | null }
  ): Promise<PurchaseOrder> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.supplierId !== undefined) {
      setClauses.push(`supplier_id = $${paramIndex++}`);
      values.push(data.supplierId);
    }
    if (data.expectedDate !== undefined) {
      setClauses.push(`expected_delivery_date = $${paramIndex++}`);
      values.push(data.expectedDate);
    }
    if (data.notes !== undefined) {
      setClauses.push(`notes = $${paramIndex++}`);
      values.push(data.notes);
    }

    if (setClauses.length === 0) {
      throw new Error('No fields to update');
    }

    setClauses.push(`version = version + 1`);
    setClauses.push(`updated_at = CURRENT_TIMESTAMP`);

    const result = await pool.query(
      `UPDATE purchase_orders 
       SET ${setClauses.join(', ')} 
       WHERE id = $${paramIndex} AND status = 'DRAFT'
       RETURNING *`,
      [...values, id]
    );

    if (result.rows.length === 0) {
      throw new Error(`Purchase order ${id} not found or not in DRAFT status`);
    }

    return result.rows[0];
  },

  /**
   * Update a single PO item
   */
  async updatePOItem(
    pool: Pool | PoolClient,
    itemId: string,
    poId: string,
    data: { quantity?: number; unitCost?: number; uomId?: string | null }
  ): Promise<PurchaseOrderItem> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.quantity !== undefined) {
      setClauses.push(`ordered_quantity = $${paramIndex++}`);
      values.push(data.quantity);
    }
    if (data.unitCost !== undefined) {
      setClauses.push(`unit_price = $${paramIndex++}`);
      values.push(data.unitCost);
    }
    if (data.uomId !== undefined) {
      setClauses.push(`uom_id = $${paramIndex++}`);
      values.push(data.uomId);
    }

    if (setClauses.length === 0) {
      throw new Error('No fields to update');
    }

    // Recalculate total_price if quantity or unitCost changed
    if (data.quantity !== undefined || data.unitCost !== undefined) {
      setClauses.push(`total_price = COALESCE($${paramIndex}, ordered_quantity) * COALESCE($${paramIndex + 1}, unit_price)`);
      values.push(data.quantity ?? null, data.unitCost ?? null);
      paramIndex += 2;
    }

    const result = await pool.query(
      `UPDATE purchase_order_items 
       SET ${setClauses.join(', ')} 
       WHERE id = $${paramIndex} AND purchase_order_id = $${paramIndex + 1}
       RETURNING *`,
      [...values, itemId, poId]
    );

    if (result.rows.length === 0) {
      throw new Error(`PO item ${itemId} not found for purchase order ${poId}`);
    }

    return result.rows[0];
  },

  /**
   * Remove a PO item (DRAFT only — verified at service layer)
   */
  async removePOItem(pool: Pool | PoolClient, itemId: string, poId: string): Promise<void> {
    const result = await pool.query(
      `DELETE FROM purchase_order_items WHERE id = $1 AND purchase_order_id = $2`,
      [itemId, poId]
    );

    if (result.rowCount === 0) {
      throw new Error(`PO item ${itemId} not found for purchase order ${poId}`);
    }
  },

  /**
   * Delete PO (only if DRAFT)
   */
  async deletePO(pool: Pool, id: string): Promise<void> {
    await UnitOfWork.run(pool, async (client) => {
      // Check if there are any goods receipts for this PO
      const grCheck = await client.query(
        'SELECT COUNT(*) FROM goods_receipts WHERE purchase_order_id = $1',
        [id]
      );

      if (parseInt(grCheck.rows[0].count) > 0) {
        throw new Error('Cannot delete purchase order with existing goods receipts. Delete goods receipts first.');
      }

      // Soft delete: Update status to CANCELLED instead of hard delete
      // This preserves the record for audit trail while marking it as deleted
      const result = await client.query(
        `UPDATE purchase_orders 
         SET status = 'CANCELLED', updated_at = NOW() 
         WHERE id = $1 AND status = $2`,
        [id, 'DRAFT']
      );

      if (result.rowCount === 0) {
        throw new Error('Can only delete purchase orders in DRAFT status');
      }

      // Note: PO items are preserved for audit trail since the PO still exists
    });
  },
};
