// Product History Repository - SQL only
// Provides raw queries to fetch product-related history entries

import { pool as globalPool } from '../../db/pool.js';
import type pg from 'pg';

export interface HistoryFilters {
  startDate?: string;
  endDate?: string;
  type?: string; // optional filter by type
}

export const productHistoryRepository = {
  async getGoodsReceiptEvents(productId: string, filters?: HistoryFilters, dbPool?: pg.Pool) {
    const pool = dbPool || globalPool;
    const where: string[] = ['gri.product_id = $1'];
    const params: unknown[] = [productId];
    let i = 2;

    if (filters?.startDate) {
      where.push(`gri.created_at >= $${i++}`);
      params.push(filters.startDate);
    }
    if (filters?.endDate) {
      where.push(`gri.created_at <= $${i++}`);
      params.push(filters.endDate);
    }

    const sql = `
      WITH poi AS (
        SELECT purchase_order_id, product_id,
               SUM(ordered_quantity) AS ordered_quantity,
               AVG(unit_price) AS po_unit_price
        FROM purchase_order_items
        GROUP BY purchase_order_id, product_id
      )
      SELECT 
        gri.created_at AS event_date,
        'GOODS_RECEIPT' AS type,
        ROUND(gri.received_quantity::numeric, 2) AS quantity_change,
        ROUND(gri.cost_price::numeric, 2) AS unit_cost,
        ROUND((gri.received_quantity * gri.cost_price)::numeric, 2) AS total_cost,
        gri.batch_number,
        gri.expiry_date,
        gr.id AS gr_id,
        gr.receipt_number AS gr_number,
        gr.status AS gr_status,
        gr.received_date AS received_date,
        gr.notes AS supplier_delivery_note,
        po.id AS po_id,
        po.order_number AS po_number,
        s."Id" AS supplier_id,
        s."CompanyName" AS supplier_name,
        COALESCE(u.full_name, u.email) AS received_by_name,
        ROUND(poi.ordered_quantity::numeric, 2) AS ordered_quantity,
        ROUND(poi.po_unit_price::numeric, 2) AS po_unit_price,
        ROUND((gri.received_quantity - COALESCE(poi.ordered_quantity, gri.received_quantity))::numeric, 2) AS qty_variance,
        ROUND((gri.cost_price - COALESCE(poi.po_unit_price, gri.cost_price))::numeric, 2) AS cost_variance,
        gri.uom_id,
        uoms.name AS uom_name,
        uoms.symbol AS uom_symbol
      FROM goods_receipt_items gri
      JOIN goods_receipts gr ON gr.id = gri.goods_receipt_id
      LEFT JOIN purchase_orders po ON po.id = gr.purchase_order_id
      LEFT JOIN suppliers s ON s."Id" = po.supplier_id
      LEFT JOIN users u ON u.id = gr.received_by_id
      LEFT JOIN poi ON poi.purchase_order_id = gr.purchase_order_id AND poi.product_id = gri.product_id
      LEFT JOIN uoms ON uoms.id = gri.uom_id
      WHERE ${where.join(' AND ')}
      ORDER BY gri.created_at DESC`;

    const result = await pool.query(sql, params);
    return result.rows;
  },

  async getSaleEvents(productId: string, filters?: HistoryFilters, dbPool?: pg.Pool) {
    const pool = dbPool || globalPool;
    const where: string[] = ['si.product_id = $1'];
    const params: unknown[] = [productId];
    let i = 2;

    if (filters?.startDate) {
      where.push(`si.created_at >= $${i++}`);
      params.push(filters.startDate);
    }
    if (filters?.endDate) {
      where.push(`si.created_at <= $${i++}`);
      params.push(filters.endDate);
    }

    const sql = `
      SELECT 
        si.created_at AS event_date,
        'SALE' AS type,
        ROUND(-si.quantity::numeric, 2) AS quantity_change,
        ROUND(si.unit_price::numeric, 2) AS unit_price,
        ROUND(si.total_price::numeric, 2) AS line_total,
        ROUND(si.unit_cost::numeric, 2) AS cost_price,
        ROUND(si.profit::numeric, 2) AS profit,
        s.id AS sale_id,
        s.sale_number,
        s.status AS sale_status,
        s.customer_id,
        c.name AS customer_name,
        s.cashier_id AS sold_by,
        u.full_name AS sold_by_name,
        s.payment_method,
        ROUND(s.amount_paid::numeric, 2) AS payment_received,
        ROUND(s.change_amount::numeric, 2) AS change_amount,
        ROUND(s.total_amount::numeric, 2) AS total_amount,
        si.uom_id,
        uoms.name AS uom_name,
        uoms.symbol AS uom_symbol
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN users u ON u.id = s.cashier_id
      LEFT JOIN uoms ON uoms.id = si.uom_id
      WHERE ${where.join(' AND ')}
      ORDER BY si.created_at DESC`;

    const result = await pool.query(sql, params);
    return result.rows;
  },

  async getStockMovementEvents(productId: string, filters?: HistoryFilters, dbPool?: pg.Pool) {
    const pool = dbPool || globalPool;
    const where: string[] = [
      'sm.product_id = $1',
      // Exclude system-generated GR and SALE movements to avoid duplicates.
      "sm.movement_type IN ('ADJUSTMENT_IN','ADJUSTMENT_OUT','TRANSFER_IN','TRANSFER_OUT','RETURN','DAMAGE','EXPIRY','OPENING_BALANCE')",
    ];
    const params: unknown[] = [productId];
    let i = 2;

    if (filters?.startDate) {
      where.push(`sm.created_at >= $${i++}`);
      params.push(filters.startDate);
    }
    if (filters?.endDate) {
      where.push(`sm.created_at <= $${i++}`);
      params.push(filters.endDate);
    }
    if (filters?.type) {
      where.push(`sm.movement_type = $${i++}`);
      params.push(filters.type);
    }

    const sql = `
      SELECT 
        sm.created_at AS event_date,
        sm.movement_type AS type,
        CASE 
          WHEN sm.movement_type IN ('ADJUSTMENT_IN','TRANSFER_IN','RETURN','OPENING_BALANCE') THEN sm.quantity
          ELSE -sm.quantity
        END AS quantity_change,
        b.batch_number,
        b.expiry_date,
        sm.id AS movement_id,
        sm.reference_type,
        sm.reference_id,
        sm.notes,
        sm.uom_id,
        uoms.name AS uom_name,
        uoms.symbol AS uom_symbol
      FROM stock_movements sm
      LEFT JOIN inventory_batches b ON b.id = sm.batch_id
      LEFT JOIN uoms ON uoms.id = sm.uom_id
      WHERE ${where.join(' AND ')}
      ORDER BY sm.created_at DESC`;

    const result = await pool.query(sql, params);
    return result.rows;
  },
};
