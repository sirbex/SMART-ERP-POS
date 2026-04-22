/**
 * Inventory Valuation Report — FINANCIAL TRUTH
 *
 * Single responsibility: report the book value of on-hand inventory derived
 * exclusively from `cost_layers` (FIFO/AVCO subledger).
 *
 * SAP/Odoo pattern: valuation has ONE source of truth (cost layers). No
 * pricing, no margins, no GL comparison, no velocity, no ABC. Any of those
 * concerns belong to a separate report.
 *
 * Output is intentionally minimal: Product | Qty | Unit Cost | Stock Value.
 */

import type { Pool } from 'pg';
import { Money } from '../../../utils/money.js';

export interface ValuationRow {
  productId: string;
  sku: string | null;
  productName: string;
  category: string | null;
  qtyOnHand: number;
  unitCost: number;
  stockValue: number;
}

export interface ValuationReport {
  asOfDate: string;
  rows: ValuationRow[];
  totals: {
    totalQuantity: number;
    totalStockValue: number;
    productCount: number;
  };
}

export interface ValuationParams {
  asOfDate?: string; // YYYY-MM-DD
  categoryId?: string;
}

export async function generateValuation(
  pool: Pool,
  params: ValuationParams = {}
): Promise<ValuationReport> {
  const asOfDate = params.asOfDate || new Date().toISOString().slice(0, 10);

  // Cost layers are the financial subledger. Unit cost = value-weighted avg
  // across the product's remaining layers (what you'd book if selling one unit
  // right now). This is the only correct unit_cost to report.
  const sql = `
    SELECT
      p.id               AS product_id,
      p.sku              AS sku,
      p.name             AS product_name,
      p.category         AS category,
      SUM(cl.remaining_quantity)                          AS qty_on_hand,
      SUM(cl.remaining_quantity * cl.unit_cost)           AS stock_value
    FROM cost_layers cl
    JOIN products p ON p.id = cl.product_id
    WHERE cl.is_active = TRUE
      AND cl.remaining_quantity > 0
      ${params.categoryId ? 'AND p.category_id = $2' : ''}
      AND cl.received_date::date <= $1::date
    GROUP BY p.id, p.sku, p.name, p.category
    HAVING SUM(cl.remaining_quantity) > 0
    ORDER BY p.name ASC
  `;

  const args: unknown[] = [asOfDate];
  if (params.categoryId) args.push(params.categoryId);

  const { rows } = await pool.query(sql, args);

  const mapped: ValuationRow[] = rows.map((r) => {
    const qty = Money.toNumber(Money.parseDb(String(r.qty_on_hand)));
    const stockValue = Money.toNumber(Money.parseDb(String(r.stock_value)));
    const unitCost = qty > 0 ? Money.toNumber(Money.divide(stockValue, qty)) : 0;
    return {
      productId: r.product_id,
      sku: r.sku,
      productName: r.product_name,
      category: r.category,
      qtyOnHand: qty,
      unitCost,
      stockValue,
    };
  });

  const totalQuantity = mapped.reduce((a, r) => a + r.qtyOnHand, 0);
  const totalStockValue = mapped.reduce((a, r) => a + r.stockValue, 0);

  return {
    asOfDate,
    rows: mapped,
    totals: {
      totalQuantity: Number(totalQuantity.toFixed(4)),
      totalStockValue: Number(totalStockValue.toFixed(2)),
      productCount: mapped.length,
    },
  };
}
