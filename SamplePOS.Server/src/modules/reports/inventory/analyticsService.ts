/**
 * Inventory Analytics Report — OPERATIONS INSIGHT
 *
 * Single responsibility: compute operational/movement metrics (ABC class,
 * velocity, dead-stock flag, days-in-stock, last sale date) from
 * `sale_items` and `stock_movements`.
 *
 * SAP/Odoo pattern: analytics is separated from valuation. This report MUST
 * NOT read cost_layers, GL balances, selling price, or any financial
 * valuation column. Only operational data.
 */

import type { Pool } from 'pg';

export type MovementClass = 'FAST' | 'MEDIUM' | 'SLOW' | 'DEAD';
export type AbcClass = 'A' | 'B' | 'C';

export interface AnalyticsRow {
  productId: string;
  sku: string | null;
  productName: string;
  category: string | null;
  qtyOnHand: number;
  daysInStock: number | null; // days since last receipt with stock remaining
  lastSaleDate: string | null;
  unitsSold30d: number;
  unitsSold90d: number;
  movementVelocity: number; // units/day average over 90d
  movementClass: MovementClass;
  abcClass: AbcClass;
  deadStockFlag: boolean;
}

export interface AnalyticsReport {
  asOfDate: string;
  rows: AnalyticsRow[];
  summary: {
    totalProducts: number;
    fast: number;
    medium: number;
    slow: number;
    dead: number;
    abcA: number;
    abcB: number;
    abcC: number;
  };
}

export interface AnalyticsParams {
  asOfDate?: string;
  deadStockDays?: number; // default 90
}

const VELOCITY_WINDOW_DAYS = 90;

export async function generateAnalytics(
  pool: Pool,
  params: AnalyticsParams = {}
): Promise<AnalyticsReport> {
  const asOfDate = params.asOfDate || new Date().toISOString().slice(0, 10);
  const deadDays = params.deadStockDays ?? 90;

  // Only operational data: on-hand, movements, and sales counts.
  // NO cost_layers, NO GL, NO pricing columns.
  const sql = `
    WITH on_hand AS (
      SELECT p.id AS product_id, p.sku, p.name, p.category,
             COALESCE(pi.quantity_on_hand, 0) AS qty_on_hand
      FROM products p
      LEFT JOIN product_inventory pi ON pi.product_id = p.id
      WHERE p.is_active = TRUE
    ),
    last_sale AS (
      SELECT si.product_id,
             MAX(s.sale_date) AS last_sale_date,
             SUM(CASE WHEN s.sale_date >= $1::date - INTERVAL '30 days'
                      THEN si.quantity ELSE 0 END) AS units_30d,
             SUM(CASE WHEN s.sale_date >= $1::date - INTERVAL '${VELOCITY_WINDOW_DAYS} days'
                      THEN si.quantity ELSE 0 END) AS units_90d
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      WHERE s.status = 'COMPLETED'
        AND s.sale_date <= $1::date
      GROUP BY si.product_id
    ),
    last_receipt AS (
      SELECT product_id, MAX(created_at) AS last_receipt_at
      FROM stock_movements
      WHERE movement_type IN ('GOODS_RECEIPT', 'ADJUSTMENT_IN', 'OPENING_BALANCE', 'TRANSFER_IN', 'RETURN')
        AND created_at <= $1::date + INTERVAL '1 day'
      GROUP BY product_id
    )
    SELECT
      oh.product_id,
      oh.sku,
      oh.name AS product_name,
      oh.category,
      oh.qty_on_hand,
      ls.last_sale_date,
      COALESCE(ls.units_30d, 0) AS units_30d,
      COALESCE(ls.units_90d, 0) AS units_90d,
      lr.last_receipt_at,
      EXTRACT(DAY FROM ($1::timestamptz - lr.last_receipt_at))::int AS days_in_stock
    FROM on_hand oh
    LEFT JOIN last_sale    ls ON ls.product_id = oh.product_id
    LEFT JOIN last_receipt lr ON lr.product_id = oh.product_id
    ORDER BY oh.name ASC
  `;

  const { rows } = await pool.query(sql, [asOfDate]);

  // ABC by UNIT movement over 90 days (operational, not revenue).
  // Pareto: cumulative share of units sold → A≤70%, B≤90%, C rest.
  const totalUnits90 = rows.reduce((a, r) => a + Number(r.units_90d || 0), 0);
  const sortedForAbc = [...rows].sort(
    (a, b) => Number(b.units_90d || 0) - Number(a.units_90d || 0)
  );
  const abcMap = new Map<string, AbcClass>();
  let cum = 0;
  for (const r of sortedForAbc) {
    const units = Number(r.units_90d || 0);
    cum += units;
    const share = totalUnits90 > 0 ? cum / totalUnits90 : 1;
    const cls: AbcClass = share <= 0.7 ? 'A' : share <= 0.9 ? 'B' : 'C';
    abcMap.set(r.product_id, cls);
  }

  const mapped: AnalyticsRow[] = rows.map((r) => {
    const units90 = Number(r.units_90d || 0);
    const velocity = Number((units90 / VELOCITY_WINDOW_DAYS).toFixed(4));
    const lastSale: string | null = r.last_sale_date ? String(r.last_sale_date).slice(0, 10) : null;
    const daysSinceSale = lastSale
      ? Math.floor((Date.parse(asOfDate) - Date.parse(lastSale)) / 86_400_000)
      : null;

    // Movement class uses units/day velocity, a purely operational metric.
    let cls: MovementClass;
    if (units90 === 0 || daysSinceSale === null) cls = 'DEAD';
    else if (velocity >= 1) cls = 'FAST';
    else if (velocity >= 0.25) cls = 'MEDIUM';
    else cls = 'SLOW';

    const qty = Number(r.qty_on_hand || 0);
    const deadStockFlag =
      qty > 0 && (daysSinceSale === null || daysSinceSale >= deadDays);

    return {
      productId: r.product_id,
      sku: r.sku,
      productName: r.product_name,
      category: r.category,
      qtyOnHand: Number(qty.toFixed(4)),
      daysInStock: r.days_in_stock != null ? Number(r.days_in_stock) : null,
      lastSaleDate: lastSale,
      unitsSold30d: Number(r.units_30d || 0),
      unitsSold90d: units90,
      movementVelocity: velocity,
      movementClass: cls,
      abcClass: abcMap.get(r.product_id) ?? 'C',
      deadStockFlag,
    };
  });

  const summary = {
    totalProducts: mapped.length,
    fast: mapped.filter((r) => r.movementClass === 'FAST').length,
    medium: mapped.filter((r) => r.movementClass === 'MEDIUM').length,
    slow: mapped.filter((r) => r.movementClass === 'SLOW').length,
    dead: mapped.filter((r) => r.movementClass === 'DEAD').length,
    abcA: mapped.filter((r) => r.abcClass === 'A').length,
    abcB: mapped.filter((r) => r.abcClass === 'B').length,
    abcC: mapped.filter((r) => r.abcClass === 'C').length,
  };

  return { asOfDate, rows: mapped, summary };
}
