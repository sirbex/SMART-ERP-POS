/**
 * Kitchen food-cost analytics — ADR-005 Phase 5.
 * Reads posted production, waste, buffet capacity + cover sales revenue.
 * Operational report only — not financial P&L SSOT (fn_get_profit_loss).
 */

import type { Pool, PoolClient } from 'pg';
import {
  BusinessError,
  ForbiddenError,
  ValidationError,
} from '../../middleware/errorHandler.js';
import { getBusinessDate } from '../../utils/dateRange.js';
import {
  contributionMargin,
  costVariance,
  costVariancePct,
  foodCostPercent,
  qtyYieldRatio,
  roundMoney,
  roundPct,
  theoreticalLineCost,
} from '../../../../shared/kitchen-production/analyticsPlan.js';
import { isKitchenProductionEnabled } from './kitchenProductionSettings.js';

type Db = Pool | PoolClient;

export type AnalyticsRange = { from: string; to: string };

function parseRange(input?: { from?: string; to?: string }): AnalyticsRange {
  const to = (input?.to || getBusinessDate()).slice(0, 10);
  let from = (input?.from || to).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw new ValidationError('from/to must be YYYY-MM-DD');
  }
  if (from > to) {
    throw new ValidationError('from must be on or before to');
  }
  // Default window: last 30 days when only to provided without from? caller may omit both
  if (!input?.from && input?.to) {
    const d = new Date(`${to}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 29);
    from = d.toISOString().slice(0, 10);
  }
  if (!input?.from && !input?.to) {
    const d = new Date(`${to}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 29);
    from = d.toISOString().slice(0, 10);
  }
  return { from, to };
}

async function assertEnabled(conn: Db): Promise<void> {
  if (!(await isKitchenProductionEnabled(conn))) {
    throw new ForbiddenError(
      'Kitchen Production is disabled. Turn on Restaurant mode and Enable Kitchen Production in system settings.',
    );
  }
}

async function hasTable(conn: Db, table: string): Promise<boolean> {
  const r = await conn.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
    [table],
  );
  return r.rows.length > 0;
}

async function assertAnyAnalyticsSchema(conn: Db): Promise<void> {
  const ok = await hasTable(conn, 'kitchen_production_documents');
  if (!ok) {
    throw new BusinessError(
      'Kitchen Production schema missing. Apply migrations 587–590.',
      'ERR_KITCHEN_ANALYTICS_SCHEMA',
    );
  }
}

export const kitchenAnalyticsService = {
  parseRange,

  async summary(pool: Pool, rangeInput?: { from?: string; to?: string }) {
    await assertEnabled(pool);
    await assertAnyAnalyticsSchema(pool);
    const range = parseRange(rangeInput);

    const production = await pool.query<{
      batch_count: string;
      total_ingredient_cost: string;
      total_output_qty: string;
    }>(
      `SELECT
         COUNT(*)::text AS batch_count,
         COALESCE(SUM(total_ingredient_cost), 0)::text AS total_ingredient_cost,
         COALESCE(SUM(output_qty_base), 0)::text AS total_output_qty
       FROM kitchen_production_documents
       WHERE status = 'POSTED'
         AND production_date >= $1::date
         AND production_date <= $2::date`,
      [range.from, range.to],
    );

    let wasteCost = 0;
    let wasteDocs = 0;
    const wasteByReason: Array<{ reason: string; documentCount: number; totalCost: number }> = [];
    if (await hasTable(pool, 'kitchen_waste_documents')) {
      const w = await pool.query<{
        reason: string;
        document_count: string;
        total_cost: string;
      }>(
        `SELECT reason,
                COUNT(*)::text AS document_count,
                COALESCE(SUM(total_cost), 0)::text AS total_cost
         FROM kitchen_waste_documents
         WHERE status = 'POSTED'
           AND waste_date >= $1::date
           AND waste_date <= $2::date
         GROUP BY reason
         ORDER BY SUM(total_cost) DESC`,
        [range.from, range.to],
      );
      for (const row of w.rows) {
        const totalCost = Number(row.total_cost);
        wasteCost += totalCost;
        wasteDocs += Number(row.document_count);
        wasteByReason.push({
          reason: row.reason,
          documentCount: Number(row.document_count),
          totalCost: roundMoney(totalCost),
        });
      }
    }

    let sessions = 0;
    let soldCovers = 0;
    let expectedCovers = 0;
    let coverRevenue = 0;
    let sessionWasteCost = 0;
    if (await hasTable(pool, 'kitchen_buffet_sessions')) {
      const s = await pool.query<{
        session_count: string;
        sold_covers: string;
        expected_covers: string;
      }>(
        `SELECT
           COUNT(*)::text AS session_count,
           COALESCE(SUM(sold_covers), 0)::text AS sold_covers,
           COALESCE(SUM(expected_covers), 0)::text AS expected_covers
         FROM kitchen_buffet_sessions
         WHERE status IN ('OPEN', 'CLOSED')
           AND service_date >= $1::date
           AND service_date <= $2::date`,
        [range.from, range.to],
      );
      sessions = Number(s.rows[0]?.session_count ?? 0);
      soldCovers = Number(s.rows[0]?.sold_covers ?? 0);
      expectedCovers = Number(s.rows[0]?.expected_covers ?? 0);

      if (await hasTable(pool, 'kitchen_buffet_cover_ledger')) {
        const rev = await pool.query<{ revenue: string }>(
          `SELECT COALESCE(SUM(si.total_price), 0)::text AS revenue
           FROM kitchen_buffet_cover_ledger cl
           JOIN kitchen_buffet_sessions bs ON bs.id = cl.session_id
           LEFT JOIN sale_items si
             ON si.sale_id = cl.sale_id
            AND si.product_id = cl.cover_product_id
           WHERE bs.service_date >= $1::date
             AND bs.service_date <= $2::date
             AND bs.status IN ('OPEN', 'CLOSED')`,
          [range.from, range.to],
        );
        coverRevenue = Number(rev.rows[0]?.revenue ?? 0);
      }

      if (await hasTable(pool, 'kitchen_waste_documents')) {
        const sw = await pool.query<{ waste: string }>(
          `SELECT COALESCE(SUM(w.total_cost), 0)::text AS waste
           FROM kitchen_waste_documents w
           JOIN kitchen_buffet_sessions bs ON bs.id = w.buffet_session_id
           WHERE w.status = 'POSTED'
             AND bs.service_date >= $1::date
             AND bs.service_date <= $2::date`,
          [range.from, range.to],
        );
        sessionWasteCost = Number(sw.rows[0]?.waste ?? 0);
      }
    }

    const prodCost = Number(production.rows[0]?.total_ingredient_cost ?? 0);
    const batchCount = Number(production.rows[0]?.batch_count ?? 0);
    const totalOutputQty = Number(production.rows[0]?.total_output_qty ?? 0);
    const totalKitchenCost = prodCost + wasteCost;
    // Ops food-cost: production ingredient + all waste vs cover revenue (buffet view).
    // When no cover revenue, % is null — not zero.
    const kitchenCostForPct = prodCost + wasteCost;
    const fcPct = foodCostPercent(kitchenCostForPct, coverRevenue);
    const contrib = contributionMargin(coverRevenue, sessionWasteCost);

    return {
      range,
      production: {
        batchCount,
        totalIngredientCost: roundMoney(prodCost),
        totalOutputQty: roundMoney(totalOutputQty, 4),
        avgOutputUnitCost:
          totalOutputQty > 0 ? roundMoney(prodCost / totalOutputQty, 4) : 0,
      },
      waste: {
        documentCount: wasteDocs,
        totalCost: roundMoney(wasteCost),
        byReason: wasteByReason,
      },
      buffet: {
        sessionCount: sessions,
        soldCovers: roundMoney(soldCovers, 4),
        expectedCovers: roundMoney(expectedCovers, 4),
        coverRevenue: roundMoney(coverRevenue),
        sessionLinkedWasteCost: roundMoney(sessionWasteCost),
        contributionAfterSessionWaste: roundMoney(contrib),
      },
      foodCost: {
        productionCost: roundMoney(prodCost),
        wasteCost: roundMoney(wasteCost),
        totalKitchenCost: roundMoney(totalKitchenCost),
        coverRevenue: roundMoney(coverRevenue),
        /** Kitchen cost / cover revenue (%). Null if no cover revenue in range. */
        foodCostPercent: roundPct(fcPct),
        note:
          'Operational food-cost vs buffet cover revenue only. Not GL P&L (use accounting reports for financial close).',
      },
    };
  },

  async productionVariance(pool: Pool, rangeInput?: { from?: string; to?: string }) {
    await assertEnabled(pool);
    await assertAnyAnalyticsSchema(pool);
    const range = parseRange(rangeInput);

    const headers = await pool.query(
      `SELECT d.id, d.document_number, d.production_date::text AS production_date,
              d.output_qty_base, d.total_ingredient_cost, d.output_unit_cost,
              p.name AS output_product_name
       FROM kitchen_production_documents d
       JOIN products p ON p.id = d.output_product_id
       WHERE d.status = 'POSTED'
         AND d.production_date >= $1::date
         AND d.production_date <= $2::date
       ORDER BY d.production_date DESC, d.document_number DESC
       LIMIT 100`,
      [range.from, range.to],
    );

    const out = [];
    for (const h of headers.rows) {
      const lines = await pool.query(
        `SELECT l.product_id, p.name AS product_name,
                l.planned_qty_base, l.actual_qty_base,
                l.actual_unit_cost, l.actual_line_cost
         FROM kitchen_production_component_lines l
         JOIN products p ON p.id = l.product_id
         WHERE l.document_id = $1
         ORDER BY l.sort_order, p.name`,
        [h.id],
      );

      let theoreticalTotal = 0;
      let actualTotal = 0;
      const lineRows = lines.rows.map((l) => {
        const plannedQty = Number(l.planned_qty_base);
        const actualQty = Number(l.actual_qty_base);
        const actualUnitCost = l.actual_unit_cost != null ? Number(l.actual_unit_cost) : null;
        const actualLineCost = l.actual_line_cost != null ? Number(l.actual_line_cost) : 0;
        const theoretical = theoreticalLineCost(
          plannedQty,
          actualUnitCost,
          actualQty,
          actualLineCost,
        );
        theoreticalTotal += theoretical;
        actualTotal += actualLineCost;
        return {
          productId: String(l.product_id),
          productName: String(l.product_name),
          plannedQtyBase: roundMoney(plannedQty, 4),
          actualQtyBase: roundMoney(actualQty, 4),
          qtyYieldRatio: roundPct(
            qtyYieldRatio(plannedQty, actualQty) != null
              ? (qtyYieldRatio(plannedQty, actualQty) as number) * 100
              : null,
          ),
          theoreticalCost: roundMoney(theoretical),
          actualCost: roundMoney(actualLineCost),
          costVariance: roundMoney(costVariance(actualLineCost, theoretical)),
          costVariancePct: roundPct(costVariancePct(actualLineCost, theoretical)),
        };
      });

      // Prefer header total when line costs incomplete
      const headerActual = Number(h.total_ingredient_cost);
      const actualCost = headerActual > 0 ? headerActual : actualTotal;
      const theoreticalCost = theoreticalTotal;

      out.push({
        id: String(h.id),
        documentNumber: String(h.document_number),
        productionDate: String(h.production_date).slice(0, 10),
        outputProductName: String(h.output_product_name),
        outputQtyBase: roundMoney(Number(h.output_qty_base), 4),
        outputUnitCost: roundMoney(Number(h.output_unit_cost), 4),
        theoreticalCost: roundMoney(theoreticalCost),
        actualCost: roundMoney(actualCost),
        costVariance: roundMoney(costVariance(actualCost, theoreticalCost)),
        costVariancePct: roundPct(costVariancePct(actualCost, theoreticalCost)),
        lines: lineRows,
      });
    }

    return { range, batches: out };
  },

  async wasteBreakdown(pool: Pool, rangeInput?: { from?: string; to?: string }) {
    await assertEnabled(pool);
    await assertAnyAnalyticsSchema(pool);
    const range = parseRange(rangeInput);

    if (!(await hasTable(pool, 'kitchen_waste_documents'))) {
      return { range, documents: [], products: [], byReason: [] };
    }

    const docs = await pool.query(
      `SELECT d.id, d.document_number, d.document_type, d.waste_date::text AS waste_date,
              d.reason, d.total_cost, d.expense_account_code,
              s.document_number AS buffet_session_number
       FROM kitchen_waste_documents d
       LEFT JOIN kitchen_buffet_sessions s ON s.id = d.buffet_session_id
       WHERE d.status = 'POSTED'
         AND d.waste_date >= $1::date
         AND d.waste_date <= $2::date
       ORDER BY d.waste_date DESC, d.document_number DESC
       LIMIT 100`,
      [range.from, range.to],
    );

    const products = await pool.query(
      `SELECT p.id AS product_id, p.name AS product_name,
              COALESCE(SUM(l.actual_line_cost), 0) AS total_cost,
              COALESCE(SUM(l.qty_base), 0) AS total_qty
       FROM kitchen_waste_lines l
       JOIN kitchen_waste_documents d ON d.id = l.document_id
       JOIN products p ON p.id = l.product_id
       WHERE d.status = 'POSTED'
         AND d.waste_date >= $1::date
         AND d.waste_date <= $2::date
       GROUP BY p.id, p.name
       ORDER BY SUM(l.actual_line_cost) DESC NULLS LAST
       LIMIT 50`,
      [range.from, range.to],
    );

    const byReason = await pool.query(
      `SELECT reason,
              COUNT(*)::int AS document_count,
              COALESCE(SUM(total_cost), 0) AS total_cost
       FROM kitchen_waste_documents
       WHERE status = 'POSTED'
         AND waste_date >= $1::date
         AND waste_date <= $2::date
       GROUP BY reason
       ORDER BY SUM(total_cost) DESC`,
      [range.from, range.to],
    );

    return {
      range,
      documents: docs.rows.map((d) => ({
        id: String(d.id),
        documentNumber: String(d.document_number),
        documentType: String(d.document_type),
        wasteDate: String(d.waste_date).slice(0, 10),
        reason: String(d.reason),
        totalCost: roundMoney(Number(d.total_cost)),
        expenseAccountCode: d.expense_account_code != null ? String(d.expense_account_code) : null,
        buffetSessionNumber:
          d.buffet_session_number != null ? String(d.buffet_session_number) : null,
      })),
      products: products.rows.map((p) => ({
        productId: String(p.product_id),
        productName: String(p.product_name),
        totalCost: roundMoney(Number(p.total_cost)),
        totalQty: roundMoney(Number(p.total_qty), 4),
      })),
      byReason: byReason.rows.map((r) => ({
        reason: String(r.reason),
        documentCount: Number(r.document_count),
        totalCost: roundMoney(Number(r.total_cost)),
      })),
    };
  },

  async buffetProfitability(pool: Pool, rangeInput?: { from?: string; to?: string }) {
    await assertEnabled(pool);
    await assertAnyAnalyticsSchema(pool);
    const range = parseRange(rangeInput);

    if (!(await hasTable(pool, 'kitchen_buffet_sessions'))) {
      return { range, sessions: [] };
    }

    const sessions = await pool.query(
      `SELECT bs.id, bs.document_number, bs.name, bs.service_date::text AS service_date,
              bs.status, bs.expected_covers, bs.sold_covers,
              p.name AS cover_product_name,
              COALESCE((
                SELECT SUM(si.total_price)
                FROM kitchen_buffet_cover_ledger cl
                LEFT JOIN sale_items si
                  ON si.sale_id = cl.sale_id
                 AND si.product_id = cl.cover_product_id
                WHERE cl.session_id = bs.id
              ), 0) AS cover_revenue,
              COALESCE((
                SELECT SUM(w.total_cost)
                FROM kitchen_waste_documents w
                WHERE w.buffet_session_id = bs.id AND w.status = 'POSTED'
              ), 0) AS waste_cost
       FROM kitchen_buffet_sessions bs
       JOIN products p ON p.id = bs.cover_product_id
       WHERE bs.service_date >= $1::date
         AND bs.service_date <= $2::date
         AND bs.status IN ('OPEN', 'CLOSED')
       ORDER BY bs.service_date DESC, bs.document_number DESC
       LIMIT 100`,
      [range.from, range.to],
    );

    return {
      range,
      sessions: sessions.rows.map((s) => {
        const revenue = Number(s.cover_revenue);
        const waste = Number(s.waste_cost);
        const sold = Number(s.sold_covers);
        const expected = Number(s.expected_covers);
        const contrib = contributionMargin(revenue, waste);
        return {
          id: String(s.id),
          documentNumber: String(s.document_number),
          name: String(s.name),
          serviceDate: String(s.service_date).slice(0, 10),
          status: String(s.status),
          coverProductName: String(s.cover_product_name),
          expectedCovers: roundMoney(expected, 4),
          soldCovers: roundMoney(sold, 4),
          coverSellThroughPct:
            expected > 0 ? roundPct((sold / expected) * 100) : null,
          coverRevenue: roundMoney(revenue),
          sessionWasteCost: roundMoney(waste),
          contribution: roundMoney(contrib),
          revenuePerCover: sold > 0 ? roundMoney(revenue / sold, 4) : null,
          wastePerCover: sold > 0 ? roundMoney(waste / sold, 4) : null,
          /** Waste / cover revenue. Null if no revenue. */
          wasteCostPercent: roundPct(foodCostPercent(waste, revenue)),
        };
      }),
    };
  },
};
