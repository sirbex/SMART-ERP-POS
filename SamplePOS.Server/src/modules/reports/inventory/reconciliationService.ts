/**
 * Inventory vs GL Reconciliation Report — ACCOUNTING CONTROL
 *
 * Single responsibility: compare the inventory subledger total (from
 * cost_layers) against the Inventory control account (GL 1300) and flag
 * drift.  This is an accounting diagnostic, NOT a product grid.
 *
 * SAP/Odoo pattern: reconciliation shows totals + variance. Only when drift
 * is detected do we surface the handful of products whose `product_inventory`
 * quantity disagrees with their `cost_layers.remaining_quantity` (sub-ledger
 * internal consistency).  Never mixes pricing, margins, or analytics.
 */

import type { Pool } from 'pg';

export interface ReconciliationDrift {
  productId: string;
  sku: string | null;
  productName: string;
  inventoryQty: number;
  costLayersQty: number;
  qtyDifference: number;
}

export interface ReconciliationReport {
  asOfDate: string;
  subledgerValue: number;
  glValue: number;
  variance: number;
  variancePercent: number;
  reconciled: boolean;
  tolerance: number;
  driftProducts: ReconciliationDrift[];
}

export interface ReconciliationParams {
  asOfDate?: string;
}

const DEFAULT_TOLERANCE = 0.01;

/**
 * Reversal-pair aware filter. Excludes both the original reversed txn
 * (IsReversed=TRUE) AND its offsetting reversal (whose Id appears as
 * ReversedByTransactionId on another row). Without this, a reversal pair
 * contributes a net double-subtraction to GL sums.
 */
const NET_ACTIVE_TXNS = `
  lt."IsReversed" = FALSE
  AND lt."Id" NOT IN (
    SELECT "ReversedByTransactionId"
    FROM ledger_transactions
    WHERE "ReversedByTransactionId" IS NOT NULL
  )
`;

export async function generateReconciliation(
  pool: Pool,
  params: ReconciliationParams = {}
): Promise<ReconciliationReport> {
  const asOfDate = params.asOfDate || new Date().toISOString().slice(0, 10);

  // 1. Subledger total from cost layers (the valuation source of truth)
  const subRes = await pool.query(
    `SELECT COALESCE(SUM(remaining_quantity * unit_cost), 0) AS total
     FROM cost_layers
     WHERE is_active = TRUE
       AND remaining_quantity > 0
       AND received_date::date <= $1::date`,
    [asOfDate]
  );
  const subledgerValue = Number(Number(subRes.rows[0].total).toFixed(2));

  // 2. GL balance on account 1300 at asOfDate (paired-exclusion filter)
  const glRes = await pool.query(
    `SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0) AS total
     FROM ledger_entries le
     JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
     JOIN accounts a ON le."AccountId" = a."Id"
     WHERE a."AccountCode" = '1300'
       AND lt."TransactionDate" <= $1::timestamptz
       AND ${NET_ACTIVE_TXNS}`,
    [asOfDate + ' 23:59:59']
  );
  const glValue = Number(Number(glRes.rows[0].total).toFixed(2));

  const variance = Number((subledgerValue - glValue).toFixed(2));
  const reconciled = Math.abs(variance) <= DEFAULT_TOLERANCE;
  const variancePercent = glValue !== 0 ? Number(((variance / glValue) * 100).toFixed(4)) : 0;

  // 3. If drift, show sub-ledger internal inconsistency: product_inventory
  //    vs SUM(cost_layers.remaining_quantity).  This is what breaks valuation.
  let driftProducts: ReconciliationDrift[] = [];
  if (!reconciled) {
    const driftRes = await pool.query(
      `WITH layer_qty AS (
         SELECT product_id, SUM(remaining_quantity) AS qty
         FROM cost_layers
         WHERE is_active = TRUE AND remaining_quantity > 0
         GROUP BY product_id
       )
       SELECT
         p.id   AS product_id,
         p.sku,
         p.name AS product_name,
         COALESCE(pi.quantity_on_hand, 0) AS inventory_qty,
         COALESCE(lq.qty, 0)              AS layers_qty,
         COALESCE(pi.quantity_on_hand, 0) - COALESCE(lq.qty, 0) AS qty_diff
       FROM products p
       LEFT JOIN product_inventory pi ON pi.product_id = p.id
       LEFT JOIN layer_qty lq         ON lq.product_id = p.id
       WHERE ABS(COALESCE(pi.quantity_on_hand, 0) - COALESCE(lq.qty, 0)) > 0.0001
       ORDER BY ABS(COALESCE(pi.quantity_on_hand, 0) - COALESCE(lq.qty, 0)) DESC
       LIMIT 50`
    );
    driftProducts = driftRes.rows.map((r) => ({
      productId: r.product_id,
      sku: r.sku,
      productName: r.product_name,
      inventoryQty: Number(Number(r.inventory_qty).toFixed(4)),
      costLayersQty: Number(Number(r.layers_qty).toFixed(4)),
      qtyDifference: Number(Number(r.qty_diff).toFixed(4)),
    }));
  }

  return {
    asOfDate,
    subledgerValue,
    glValue,
    variance,
    variancePercent,
    reconciled,
    tolerance: DEFAULT_TOLERANCE,
    driftProducts,
  };
}
