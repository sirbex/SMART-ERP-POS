// Demand Forecast Repository — raw SQL for the self-learning reorder engine
// Tables: product_demand_stats, product_seasonality, demand_forecast_runs

import type { Pool, PoolClient } from 'pg';
import logger from '../../utils/logger.js';

// ── Types ────────────────────────────────────────────────────
export interface ProductDemandStats {
    productId: string;
    avgDaily7d: number;
    avgDaily30d: number;
    avgDaily90d: number;
    stdDevDaily: number;
    demandTrend: 'INCREASING' | 'DECREASING' | 'STABLE';
    trendStrength: number;
    computedSafetyStock: number;
    computedReorderPoint: number;
    forecast30d: number;
    lastUpdatedAt: string;
    learningCycles: number;
}

export interface ProductSeasonality {
    productId: string;
    month: number;
    avgDailySales: number;
    totalUnits: number;
    sampleYears: number;
    seasonalIndex: number;
}

// ── Repository ───────────────────────────────────────────────
export const demandForecastRepository = {

    // ────────────────────────────────────────────────────────
    // DAILY: Compute rolling demand stats for all active products
    // Runs as one big INSERT … ON CONFLICT (upsert)
    // ────────────────────────────────────────────────────────
    async refreshDemandStats(pool: Pool): Promise<number> {
        const result = await pool.query(`
      INSERT INTO product_demand_stats (
        product_id,
        avg_daily_7d, avg_daily_30d, avg_daily_90d,
        std_dev_daily,
        demand_trend, trend_strength,
        computed_safety_stock, computed_reorder_point,
        forecast_30d,
        last_updated_at, learning_cycles
      )
      SELECT
        p.id,
        -- 7-day average
        COALESCE((
          SELECT SUM(si.quantity) / 7.0
          FROM sale_items si
          INNER JOIN sales s ON s.id = si.sale_id
          WHERE si.product_id = p.id
            AND s.sale_date >= CURRENT_DATE - 7
        ), 0) AS avg_7d,

        -- 30-day average
        COALESCE((
          SELECT SUM(si.quantity) / 30.0
          FROM sale_items si
          INNER JOIN sales s ON s.id = si.sale_id
          WHERE si.product_id = p.id
            AND s.sale_date >= CURRENT_DATE - 30
        ), 0) AS avg_30d,

        -- 90-day average
        COALESCE((
          SELECT SUM(si.quantity) / 90.0
          FROM sale_items si
          INNER JOIN sales s ON s.id = si.sale_id
          WHERE si.product_id = p.id
            AND s.sale_date >= CURRENT_DATE - 90
        ), 0) AS avg_90d,

        -- Standard deviation of daily sales (over last 30 days)
        COALESCE((
          SELECT STDDEV_POP(daily_qty) FROM (
            SELECT COALESCE(SUM(si.quantity), 0) AS daily_qty
            FROM generate_series(
              CURRENT_DATE - INTERVAL '30 days',
              CURRENT_DATE - INTERVAL '1 day',
              INTERVAL '1 day'
            ) AS d(day)
            LEFT JOIN sale_items si ON si.product_id = p.id
            LEFT JOIN sales s ON s.id = si.sale_id AND s.sale_date = d.day::date
            GROUP BY d.day
          ) daily_sales
        ), 0) AS std_dev,

        -- Trend: compare 7d vs 30d
        CASE
          WHEN COALESCE((
            SELECT SUM(si.quantity) FROM sale_items si
            INNER JOIN sales s ON s.id = si.sale_id
            WHERE si.product_id = p.id AND s.sale_date >= CURRENT_DATE - INTERVAL '30 days'
          ), 0) = 0 THEN 'STABLE'
          WHEN COALESCE((
            SELECT SUM(si.quantity) / 7.0 FROM sale_items si
            INNER JOIN sales s ON s.id = si.sale_id
            WHERE si.product_id = p.id AND s.sale_date >= CURRENT_DATE - INTERVAL '7 days'
          ), 0) / NULLIF(COALESCE((
            SELECT SUM(si.quantity) / 30.0 FROM sale_items si
            INNER JOIN sales s ON s.id = si.sale_id
            WHERE si.product_id = p.id AND s.sale_date >= CURRENT_DATE - INTERVAL '30 days'
          ), 0), 0) > 1.15 THEN 'INCREASING'
          WHEN COALESCE((
            SELECT SUM(si.quantity) / 7.0 FROM sale_items si
            INNER JOIN sales s ON s.id = si.sale_id
            WHERE si.product_id = p.id AND s.sale_date >= CURRENT_DATE - INTERVAL '7 days'
          ), 0) / NULLIF(COALESCE((
            SELECT SUM(si.quantity) / 30.0 FROM sale_items si
            INNER JOIN sales s ON s.id = si.sale_id
            WHERE si.product_id = p.id AND s.sale_date >= CURRENT_DATE - INTERVAL '30 days'
          ), 0), 0) < 0.85 THEN 'DECREASING'
          ELSE 'STABLE'
        END AS demand_trend,

        -- Trend strength (7d/30d ratio)
        COALESCE(
          COALESCE((
            SELECT SUM(si.quantity) / 7.0 FROM sale_items si
            INNER JOIN sales s ON s.id = si.sale_id
            WHERE si.product_id = p.id AND s.sale_date >= CURRENT_DATE - INTERVAL '7 days'
          ), 0) / NULLIF(COALESCE((
            SELECT SUM(si.quantity) / 30.0 FROM sale_items si
            INNER JOIN sales s ON s.id = si.sale_id
            WHERE si.product_id = p.id AND s.sale_date >= CURRENT_DATE - INTERVAL '30 days'
          ), 0), 0),
          1.0
        ) AS trend_strength,

        -- Safety stock: 1.65 × σ × √lead_time (default lead_time=7)
        CEIL(1.65 * COALESCE((
          SELECT STDDEV_POP(daily_qty) FROM (
            SELECT COALESCE(SUM(si.quantity), 0) AS daily_qty
            FROM generate_series(
              CURRENT_DATE - INTERVAL '30 days',
              CURRENT_DATE - INTERVAL '1 day',
              INTERVAL '1 day'
            ) AS d(day)
            LEFT JOIN sale_items si ON si.product_id = p.id
            LEFT JOIN sales s ON s.id = si.sale_id AND s.sale_date = d.day::date
            GROUP BY d.day
          ) daily_sales
        ), 0) * SQRT(COALESCE((
          SELECT s.lead_time_days
          FROM suppliers s
          INNER JOIN purchase_orders po ON po.supplier_id = s."Id"
          INNER JOIN goods_receipts gr ON gr.purchase_order_id = po.id
          INNER JOIN goods_receipt_items gri ON gri.goods_receipt_id = gr.id
          WHERE gri.product_id = p.id
          ORDER BY po.order_date DESC LIMIT 1
        ), 7))) AS computed_safety_stock,

        -- Reorder point: effective_velocity × lead_time + safety_stock
        -- (uses blended 70/30 velocity)
        CEIL(
          (0.7 * COALESCE((
            SELECT SUM(si.quantity) / 30.0 FROM sale_items si
            INNER JOIN sales s ON s.id = si.sale_id
            WHERE si.product_id = p.id AND s.sale_date >= CURRENT_DATE - INTERVAL '30 days'
          ), 0) + 0.3 * COALESCE((
            SELECT SUM(si.quantity) / 7.0 FROM sale_items si
            INNER JOIN sales s ON s.id = si.sale_id
            WHERE si.product_id = p.id AND s.sale_date >= CURRENT_DATE - INTERVAL '7 days'
          ), 0)) * COALESCE((
            SELECT s.lead_time_days
            FROM suppliers s
            INNER JOIN purchase_orders po ON po.supplier_id = s."Id"
            INNER JOIN goods_receipts gr ON gr.purchase_order_id = po.id
            INNER JOIN goods_receipt_items gri ON gri.goods_receipt_id = gr.id
            WHERE gri.product_id = p.id
            ORDER BY po.order_date DESC LIMIT 1
          ), 7)
          + CEIL(1.65 * COALESCE((
            SELECT STDDEV_POP(daily_qty) FROM (
              SELECT COALESCE(SUM(si.quantity), 0) AS daily_qty
              FROM generate_series(
                CURRENT_DATE - INTERVAL '30 days',
                CURRENT_DATE - INTERVAL '1 day',
                INTERVAL '1 day'
              ) AS d(day)
              LEFT JOIN sale_items si ON si.product_id = p.id
              LEFT JOIN sales s ON s.id = si.sale_id AND s.sale_date = d.day::date
              GROUP BY d.day
            ) daily_sales
          ), 0) * SQRT(COALESCE((
            SELECT s.lead_time_days
            FROM suppliers s
            INNER JOIN purchase_orders po ON po.supplier_id = s."Id"
            INNER JOIN goods_receipts gr ON gr.purchase_order_id = po.id
            INNER JOIN goods_receipt_items gri ON gri.goods_receipt_id = gr.id
            WHERE gri.product_id = p.id
            ORDER BY po.order_date DESC LIMIT 1
          ), 7)))
        ) AS computed_reorder_point,

        -- Forecast: blended 30d moving average × 30
        COALESCE((
          SELECT SUM(si.quantity) FROM sale_items si
          INNER JOIN sales s ON s.id = si.sale_id
          WHERE si.product_id = p.id AND s.sale_date >= CURRENT_DATE - INTERVAL '30 days'
        ), 0) +
        COALESCE((
          SELECT SUM(si.quantity) FROM sale_items si
          INNER JOIN sales s ON s.id = si.sale_id
          WHERE si.product_id = p.id AND s.sale_date >= CURRENT_DATE - INTERVAL '60 days'
            AND s.sale_date < CURRENT_DATE - INTERVAL '30 days'
        ), 0) +
        COALESCE((
          SELECT SUM(si.quantity) FROM sale_items si
          INNER JOIN sales s ON s.id = si.sale_id
          WHERE si.product_id = p.id AND s.sale_date >= CURRENT_DATE - INTERVAL '90 days'
            AND s.sale_date < CURRENT_DATE - INTERVAL '60 days'
        ), 0)
        / 3.0 AS forecast_30d,

        NOW(),
        1

      FROM products p
      WHERE p.is_active = true

      ON CONFLICT (product_id) DO UPDATE SET
        avg_daily_7d   = EXCLUDED.avg_daily_7d,
        avg_daily_30d  = EXCLUDED.avg_daily_30d,
        avg_daily_90d  = EXCLUDED.avg_daily_90d,
        std_dev_daily  = EXCLUDED.std_dev_daily,
        demand_trend   = EXCLUDED.demand_trend,
        trend_strength = EXCLUDED.trend_strength,
        computed_safety_stock  = EXCLUDED.computed_safety_stock,
        computed_reorder_point = EXCLUDED.computed_reorder_point,
        forecast_30d   = EXCLUDED.forecast_30d,
        last_updated_at = NOW(),
        learning_cycles = product_demand_stats.learning_cycles + 1
    `);

        return result.rowCount ?? 0;
    },

    // ────────────────────────────────────────────────────────
    // MONTHLY: Update seasonality indexes for all products
    // ────────────────────────────────────────────────────────
    async refreshSeasonality(pool: Pool): Promise<number> {
        const result = await pool.query(`
      INSERT INTO product_seasonality (
        product_id, month, avg_daily_sales, total_units, sample_years, seasonal_index
      )
      SELECT
        p.id,
        m.month,
        -- Average daily sales for this month across all years
        COALESCE((
          SELECT SUM(si.quantity) / NULLIF(
            COUNT(DISTINCT s.sale_date), 0
          )
          FROM sale_items si
          INNER JOIN sales s ON s.id = si.sale_id
          WHERE si.product_id = p.id
            AND EXTRACT(MONTH FROM s.sale_date) = m.month
        ), 0) AS avg_daily_sales,
        -- Total units ever sold in this month
        COALESCE((
          SELECT SUM(si.quantity)
          FROM sale_items si
          INNER JOIN sales s ON s.id = si.sale_id
          WHERE si.product_id = p.id
            AND EXTRACT(MONTH FROM s.sale_date) = m.month
        ), 0) AS total_units,
        -- How many distinct years contributed
        COALESCE((
          SELECT COUNT(DISTINCT EXTRACT(YEAR FROM s.sale_date))
          FROM sale_items si
          INNER JOIN sales s ON s.id = si.sale_id
          WHERE si.product_id = p.id
            AND EXTRACT(MONTH FROM s.sale_date) = m.month
        ), 0) AS sample_years,
        -- Seasonal index: this month avg / global avg (>1 means hotter month)
        CASE WHEN COALESCE((
          SELECT SUM(si2.quantity) / NULLIF(COUNT(DISTINCT s2.sale_date), 0)
          FROM sale_items si2
          INNER JOIN sales s2 ON s2.id = si2.sale_id
          WHERE si2.product_id = p.id
        ), 0) = 0 THEN 1.0
        ELSE
          COALESCE((
            SELECT SUM(si.quantity) / NULLIF(COUNT(DISTINCT s.sale_date), 0)
            FROM sale_items si
            INNER JOIN sales s ON s.id = si.sale_id
            WHERE si.product_id = p.id
              AND EXTRACT(MONTH FROM s.sale_date) = m.month
          ), 0) / (
            SELECT SUM(si2.quantity) / NULLIF(COUNT(DISTINCT s2.sale_date), 0)
            FROM sale_items si2
            INNER JOIN sales s2 ON s2.id = si2.sale_id
            WHERE si2.product_id = p.id
          )
        END AS seasonal_index

      FROM products p
      CROSS JOIN generate_series(1, 12) AS m(month)
      WHERE p.is_active = true

      ON CONFLICT (product_id, month) DO UPDATE SET
        avg_daily_sales = EXCLUDED.avg_daily_sales,
        total_units     = EXCLUDED.total_units,
        sample_years    = EXCLUDED.sample_years,
        seasonal_index  = EXCLUDED.seasonal_index,
        last_updated_at = NOW()
    `);

        return result.rowCount ?? 0;
    },

    // ────────────────────────────────────────────────────────
    // READ: Get demand stats for one product (used by reorder engine)
    // ────────────────────────────────────────────────────────
    async getStatsForProduct(pool: Pool, productId: string): Promise<ProductDemandStats | null> {
        const result = await pool.query(
            `SELECT
        product_id, avg_daily_7d, avg_daily_30d, avg_daily_90d,
        std_dev_daily, demand_trend, trend_strength,
        computed_safety_stock, computed_reorder_point,
        forecast_30d, last_updated_at, learning_cycles
       FROM product_demand_stats WHERE product_id = $1`,
            [productId]
        );
        if (!result.rows[0]) return null;
        const r = result.rows[0];
        return {
            productId: r.product_id,
            avgDaily7d: parseFloat(r.avg_daily_7d),
            avgDaily30d: parseFloat(r.avg_daily_30d),
            avgDaily90d: parseFloat(r.avg_daily_90d),
            stdDevDaily: parseFloat(r.std_dev_daily),
            demandTrend: r.demand_trend,
            trendStrength: parseFloat(r.trend_strength),
            computedSafetyStock: parseInt(r.computed_safety_stock, 10),
            computedReorderPoint: parseInt(r.computed_reorder_point, 10),
            forecast30d: parseFloat(r.forecast_30d),
            lastUpdatedAt: r.last_updated_at,
            learningCycles: parseInt(r.learning_cycles, 10),
        };
    },

    // ────────────────────────────────────────────────────────
    // READ: Get all demand stats (for reorder recommendations)
    // ────────────────────────────────────────────────────────
    async getAllStats(pool: Pool): Promise<Map<string, ProductDemandStats>> {
        const result = await pool.query(
            `SELECT
        product_id, avg_daily_7d, avg_daily_30d, avg_daily_90d,
        std_dev_daily, demand_trend, trend_strength,
        computed_safety_stock, computed_reorder_point,
        forecast_30d, last_updated_at, learning_cycles
       FROM product_demand_stats`
        );
        const map = new Map<string, ProductDemandStats>();
        for (const r of result.rows) {
            map.set(r.product_id, {
                productId: r.product_id,
                avgDaily7d: parseFloat(r.avg_daily_7d),
                avgDaily30d: parseFloat(r.avg_daily_30d),
                avgDaily90d: parseFloat(r.avg_daily_90d),
                stdDevDaily: parseFloat(r.std_dev_daily),
                demandTrend: r.demand_trend,
                trendStrength: parseFloat(r.trend_strength),
                computedSafetyStock: parseInt(r.computed_safety_stock, 10),
                computedReorderPoint: parseInt(r.computed_reorder_point, 10),
                forecast30d: parseFloat(r.forecast_30d),
                lastUpdatedAt: r.last_updated_at,
                learningCycles: parseInt(r.learning_cycles, 10),
            });
        }
        return map;
    },

    // ────────────────────────────────────────────────────────
    // READ: Seasonality for current month (for reorder adjustments)
    // ────────────────────────────────────────────────────────
    async getSeasonalityForMonth(pool: Pool, month: number): Promise<Map<string, number>> {
        const result = await pool.query(
            `SELECT product_id, seasonal_index FROM product_seasonality WHERE month = $1`,
            [month]
        );
        const map = new Map<string, number>();
        for (const r of result.rows) {
            map.set(r.product_id, parseFloat(r.seasonal_index));
        }
        return map;
    },

    // ────────────────────────────────────────────────────────
    // LOG: Record a forecast run
    // ────────────────────────────────────────────────────────
    async logRun(
        pool: Pool,
        runType: 'DAILY' | 'MONTHLY',
        productsUpdated: number,
        executionTimeMs: number,
        details?: Record<string, unknown>
    ): Promise<void> {
        await pool.query(
            `INSERT INTO demand_forecast_runs (run_type, products_updated, execution_time_ms, details)
       VALUES ($1, $2, $3, $4)`,
            [runType, productsUpdated, executionTimeMs, details ? JSON.stringify(details) : null]
        );
    },

    // ────────────────────────────────────────────────────────
    // READ: Recent forecast runs (admin visibility)
    // ────────────────────────────────────────────────────────
    async getRecentRuns(pool: Pool, limit: number = 20): Promise<{
        id: string; runType: string; productsUpdated: number;
        executionTimeMs: number; createdAt: string;
    }[]> {
        const result = await pool.query(
            `SELECT id, run_type, products_updated, execution_time_ms, created_at
       FROM demand_forecast_runs ORDER BY created_at DESC LIMIT $1`,
            [limit]
        );
        return result.rows.map(r => ({
            id: r.id,
            runType: r.run_type,
            productsUpdated: r.products_updated,
            executionTimeMs: r.execution_time_ms,
            createdAt: r.created_at,
        }));
    },
};
