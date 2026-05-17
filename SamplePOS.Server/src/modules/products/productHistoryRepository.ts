// Product History Repository - SQL only
// Provides raw queries to fetch product-related history entries

import { pool as globalPool } from '../../db/pool.js';
import type pg from 'pg';
import { toUtcRange, BUSINESS_TIMEZONE } from '../../utils/dateRange.js';

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
      const { startUtc } = toUtcRange(filters.startDate, filters.startDate, BUSINESS_TIMEZONE);
      where.push(`gri.created_at >= $${i++}`);
      params.push(startUtc);
    }
    if (filters?.endDate) {
      const { endUtc } = toUtcRange(filters.endDate, filters.endDate, BUSINESS_TIMEZONE);
      where.push(`gri.created_at < $${i++}`);
      params.push(endUtc);
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
        COALESCE(gri.batch_number, ib.batch_number) AS batch_number,
        COALESCE(gri.expiry_date, ib.expiry_date) AS expiry_date,
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
        uoms.symbol AS uom_symbol,
        ib.status AS batch_status,
        ROUND(ib.remaining_quantity::numeric, 2) AS batch_remaining_qty
      FROM goods_receipt_items gri
      JOIN goods_receipts gr ON gr.id = gri.goods_receipt_id
      LEFT JOIN purchase_orders po ON po.id = gr.purchase_order_id
      LEFT JOIN suppliers s ON s."Id" = po.supplier_id
      LEFT JOIN users u ON u.id = gr.received_by_id
      LEFT JOIN poi ON poi.purchase_order_id = gr.purchase_order_id AND poi.product_id = gri.product_id
      LEFT JOIN uoms ON uoms.id = gri.uom_id
      LEFT JOIN inventory_batches ib ON ib.goods_receipt_item_id = gri.id
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
      const { startUtc } = toUtcRange(filters.startDate, filters.startDate, BUSINESS_TIMEZONE);
      where.push(`si.created_at >= $${i++}`);
      params.push(startUtc);
    }
    if (filters?.endDate) {
      const { endUtc } = toUtcRange(filters.endDate, filters.endDate, BUSINESS_TIMEZONE);
      where.push(`si.created_at < $${i++}`);
      params.push(endUtc);
    }

    const sql = `
      SELECT 
        si.created_at AS event_date,
        'SALE' AS type,
        -- Use stock_movement.quantity (base units) when available; fall back to si.quantity (sale UoM)
        ROUND(-COALESCE(sm_agg.quantity, si.quantity)::numeric, 2) AS quantity_change,
        ROUND(si.unit_price::numeric, 2) AS unit_price,
        ROUND(si.total_price::numeric, 2) AS line_total,
        ROUND(COALESCE(sm_agg.unit_cost, si.unit_cost)::numeric, 2) AS cost_price,
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
        -- UoM: prefer base_uom from stock movement (canonical unit); fall back to sale UoM
        COALESCE(sm_agg.base_uom_id, si.uom_id) AS uom_id,
        COALESCE(base_uom.name, sold_uom.name) AS uom_name,
        COALESCE(base_uom.symbol, sold_uom.symbol) AS uom_symbol,
        ib.batch_number,
        ib.expiry_date,
        ib.status AS batch_status,
        ROUND(ib.remaining_quantity::numeric, 2) AS batch_remaining_qty
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN users u ON u.id = s.cashier_id
      -- Aggregate base-unit quantities per (sale, product) — avoids batch_id NULL mismatch
      -- and correctly handles multi-batch sales by summing all movements for the same line
      LEFT JOIN (
        SELECT reference_id, product_id,
               SUM(quantity) AS quantity,
               ROUND(SUM(quantity * unit_cost) / NULLIF(SUM(quantity), 0), 4) AS unit_cost,
               (ARRAY_AGG(base_uom_id) FILTER (WHERE base_uom_id IS NOT NULL))[1] AS base_uom_id
        FROM stock_movements
        WHERE movement_type = 'SALE' AND reference_type = 'SALE'
        GROUP BY reference_id, product_id
      ) sm_agg ON sm_agg.reference_id = s.id AND sm_agg.product_id = si.product_id
      LEFT JOIN uoms sold_uom ON sold_uom.id = si.uom_id
      LEFT JOIN uoms base_uom ON base_uom.id = sm_agg.base_uom_id
      LEFT JOIN inventory_batches ib ON ib.id = si.batch_id
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
      const { startUtc } = toUtcRange(filters.startDate, filters.startDate, BUSINESS_TIMEZONE);
      where.push(`sm.created_at >= $${i++}`);
      params.push(startUtc);
    }
    if (filters?.endDate) {
      const { endUtc } = toUtcRange(filters.endDate, filters.endDate, BUSINESS_TIMEZONE);
      where.push(`sm.created_at < $${i++}`);
      params.push(endUtc);
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
        uoms.symbol AS uom_symbol,
        COALESCE(u.full_name, u.email) AS actor_name
      FROM stock_movements sm
      LEFT JOIN inventory_batches b ON b.id = sm.batch_id
      LEFT JOIN uoms ON uoms.id = sm.uom_id
      LEFT JOIN users u ON u.id = sm.created_by_id
      WHERE ${where.join(' AND ')}
      ORDER BY sm.created_at DESC`;

    const result = await pool.query(sql, params);
    return result.rows;
  },
};
