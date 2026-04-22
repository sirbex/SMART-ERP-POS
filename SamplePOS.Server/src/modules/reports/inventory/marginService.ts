/**
 * Price & Margin Analysis Report — COMMERCIAL INSIGHT
 *
 * Single responsibility: compare current unit cost (from cost_layers) against
 * selling price to surface profit-per-unit, margin %, and potential profit on
 * current stock.
 *
 * SAP/Odoo pattern: margin analysis is a commercial report, separate from
 * valuation. It may read cost_layers for CURRENT cost, but NEVER reports GL
 * balances, subledger totals, ABC, velocity, or dead-stock flags. It is not
 * part of inventory valuation.
 */

import type { Pool } from 'pg';

export interface MarginRow {
  productId: string;
  sku: string | null;
  productName: string;
  category: string | null;
  qtyOnHand: number;
  unitCost: number;
  sellingPrice: number;
  profitPerUnit: number;
  marginPercent: number; // (price - cost) / price * 100
  markupPercent: number; // (price - cost) / cost * 100
  potentialProfit: number; // profit_per_unit × qty_on_hand
}

export interface MarginReport {
  asOfDate: string;
  rows: MarginRow[];
  summary: {
    productCount: number;
    avgMarginPercent: number;
    totalPotentialProfit: number;
    negativeMarginCount: number; // cost > price (loss-making)
    zeroPriceCount: number; // no selling price set
  };
}

export interface MarginParams {
  asOfDate?: string;
  categoryId?: string;
}

export async function generateMargins(
  pool: Pool,
  params: MarginParams = {}
): Promise<MarginReport> {
  const asOfDate = params.asOfDate || new Date().toISOString().slice(0, 10);

  // Current unit cost = value-weighted average of active cost layers.
  // Selling price from product_valuation (source of truth for pricing).
  const sql = `
    WITH layer_summary AS (
      SELECT
        product_id,
        SUM(remaining_quantity)                      AS qty,
        SUM(remaining_quantity * unit_cost)          AS value
      FROM cost_layers
      WHERE is_active = TRUE AND remaining_quantity > 0
      GROUP BY product_id
      HAVING SUM(remaining_quantity) > 0
    )
    SELECT
      p.id                         AS product_id,
      p.sku                        AS sku,
      p.name                       AS product_name,
      p.category                   AS category,
      ls.qty                       AS qty_on_hand,
      ls.value                     AS stock_value,
      COALESCE(pv.selling_price, p.selling_price, 0) AS selling_price
    FROM layer_summary ls
    JOIN products p           ON p.id = ls.product_id
    LEFT JOIN product_valuation pv ON pv.product_id = p.id
    WHERE p.is_active = TRUE
      ${params.categoryId ? 'AND p.category_id = $1' : ''}
    ORDER BY p.name ASC
  `;

  const args: unknown[] = [];
  if (params.categoryId) args.push(params.categoryId);

  const { rows } = await pool.query(sql, args);

  const mapped: MarginRow[] = rows.map((r) => {
    const qty = Number(Number(r.qty_on_hand).toFixed(4));
    const stockValue = Number(Number(r.stock_value).toFixed(2));
    const unitCost = qty > 0 ? Number((stockValue / qty).toFixed(2)) : 0;
    const price = Number(Number(r.selling_price || 0).toFixed(2));
    const profitPerUnit = Number((price - unitCost).toFixed(2));
    const marginPercent =
      price > 0 ? Number((((price - unitCost) / price) * 100).toFixed(2)) : 0;
    const markupPercent =
      unitCost > 0 ? Number((((price - unitCost) / unitCost) * 100).toFixed(2)) : 0;
    const potentialProfit = Number((profitPerUnit * qty).toFixed(2));

    return {
      productId: r.product_id,
      sku: r.sku,
      productName: r.product_name,
      category: r.category,
      qtyOnHand: qty,
      unitCost,
      sellingPrice: price,
      profitPerUnit,
      marginPercent,
      markupPercent,
      potentialProfit,
    };
  });

  const priced = mapped.filter((r) => r.sellingPrice > 0);
  const avgMargin =
    priced.length > 0
      ? Number(
        (priced.reduce((a, r) => a + r.marginPercent, 0) / priced.length).toFixed(2)
      )
      : 0;

  return {
    asOfDate,
    rows: mapped,
    summary: {
      productCount: mapped.length,
      avgMarginPercent: avgMargin,
      totalPotentialProfit: Number(
        mapped.reduce((a, r) => a + r.potentialProfit, 0).toFixed(2)
      ),
      negativeMarginCount: mapped.filter((r) => r.sellingPrice > 0 && r.profitPerUnit < 0)
        .length,
      zeroPriceCount: mapped.filter((r) => r.sellingPrice === 0).length,
    },
  };
}
