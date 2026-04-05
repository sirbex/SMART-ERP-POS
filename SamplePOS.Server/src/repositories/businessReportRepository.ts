import type { Pool, PoolClient } from 'pg';
import { pool as globalPool } from '../db/pool.js';
import logger from '../utils/logger.js';

export interface CategoryPerformanceRow {
  category_name: string;
  transaction_count: number;
  units_sold: string;
  total_sales: string;
  total_cogs: string;
  gross_profit: string;
  gross_margin_pct: string;
}

export interface ExpenseBreakdownRow {
  category_name: string;
  expense_count: number;
  total_expenses: string;
  pct_of_total: string;
}

export interface BusinessReportFilters {
  startDate?: string;
  endDate?: string;
}

/**
 * Get revenue, COGS, and gross profit grouped by product category.
 * Uses free-text products.category since category_id FK is not populated.
 */
export async function getRevenueByCategorySQL(
  filters: BusinessReportFilters,
  dbPool?: Pool | PoolClient
): Promise<CategoryPerformanceRow[]> {
  const pool = dbPool || globalPool;

  const query = `
    SELECT
      COALESCE(NULLIF(TRIM(p.category), ''), 'Uncategorized') AS category_name,
      COUNT(DISTINCT s.id)::integer AS transaction_count,
      ROUND(COALESCE(SUM(si.quantity), 0)::numeric, 2) AS units_sold,
      ROUND(COALESCE(SUM(si.total_price), 0)::numeric, 2) AS total_sales,
      ROUND(COALESCE(SUM(si.unit_cost * si.quantity), 0)::numeric, 2) AS total_cogs,
      ROUND(COALESCE(SUM(si.profit), 0)::numeric, 2) AS gross_profit,
      CASE
        WHEN COALESCE(SUM(si.total_price), 0) > 0
        THEN ROUND(SUM(si.profit) / SUM(si.total_price) * 100, 2)
        ELSE 0
      END AS gross_margin_pct
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    LEFT JOIN products p ON p.id = si.product_id
    WHERE s.status = 'COMPLETED'
      AND ($1::date IS NULL OR s.sale_date >= $1)
      AND ($2::date IS NULL OR s.sale_date <= $2)
    GROUP BY category_name
    ORDER BY total_sales DESC
  `;

  const result = await pool.query(query, [
    filters.startDate || null,
    filters.endDate || null,
  ]);

  return result.rows;
}

/**
 * Get expenses grouped by expense category.
 * Falls back to free-text expenses.category when category_id is not set.
 */
export async function getExpensesByCategory(
  filters: BusinessReportFilters,
  dbPool?: Pool | PoolClient
): Promise<ExpenseBreakdownRow[]> {
  const pool = dbPool || globalPool;

  const query = `
    WITH expense_totals AS (
      SELECT
        COALESCE(
          ec.name,
          COALESCE(NULLIF(TRIM(e.category), ''), 'Uncategorized')
        ) AS category_name,
        COUNT(*)::integer AS expense_count,
        ROUND(COALESCE(SUM(e.amount), 0)::numeric, 2) AS total_expenses
      FROM expenses e
      LEFT JOIN expense_categories ec ON e.category_id = ec.id
      WHERE e.status IN ('PAID', 'APPROVED')
        AND ($1::date IS NULL OR e.expense_date >= $1)
        AND ($2::date IS NULL OR e.expense_date <= $2)
      GROUP BY category_name
    )
    SELECT
      category_name,
      expense_count,
      total_expenses,
      CASE
        WHEN (SELECT SUM(total_expenses) FROM expense_totals) > 0
        THEN ROUND(total_expenses / (SELECT SUM(total_expenses) FROM expense_totals) * 100, 2)
        ELSE 0
      END AS pct_of_total
    FROM expense_totals
    ORDER BY total_expenses DESC
  `;

  const result = await pool.query(query, [
    filters.startDate || null,
    filters.endDate || null,
  ]);

  return result.rows;
}

/**
 * Get aggregate totals for the business summary.
 */
export async function getBusinessSummaryTotals(
  filters: BusinessReportFilters,
  dbPool?: Pool | PoolClient
): Promise<{
  total_sales: string;
  total_cogs: string;
  gross_profit: string;
  total_expenses: string;
  completed_sales_count: number;
  paid_expenses_count: number;
}> {
  const pool = dbPool || globalPool;

  const salesQuery = `
    SELECT
      ROUND(COALESCE(SUM(si.total_price), 0)::numeric, 2) AS total_sales,
      ROUND(COALESCE(SUM(si.unit_cost * si.quantity), 0)::numeric, 2) AS total_cogs,
      ROUND(COALESCE(SUM(si.profit), 0)::numeric, 2) AS gross_profit,
      COUNT(DISTINCT s.id)::integer AS completed_sales_count
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE s.status = 'COMPLETED'
      AND ($1::date IS NULL OR s.sale_date >= $1)
      AND ($2::date IS NULL OR s.sale_date <= $2)
  `;

  const expenseQuery = `
    SELECT
      ROUND(COALESCE(SUM(e.amount), 0)::numeric, 2) AS total_expenses,
      COUNT(*)::integer AS paid_expenses_count
    FROM expenses e
    WHERE e.status IN ('PAID', 'APPROVED')
      AND ($1::date IS NULL OR e.expense_date >= $1)
      AND ($2::date IS NULL OR e.expense_date <= $2)
  `;

  const params = [filters.startDate || null, filters.endDate || null];
  const [salesResult, expenseResult] = await Promise.all([
    pool.query(salesQuery, params),
    pool.query(expenseQuery, params),
  ]);

  const sales = salesResult.rows[0] || {};
  const expenses = expenseResult.rows[0] || {};

  return {
    total_sales: sales.total_sales || '0',
    total_cogs: sales.total_cogs || '0',
    gross_profit: sales.gross_profit || '0',
    total_expenses: expenses.total_expenses || '0',
    completed_sales_count: parseInt(sales.completed_sales_count, 10) || 0,
    paid_expenses_count: parseInt(expenses.paid_expenses_count, 10) || 0,
  };
}
