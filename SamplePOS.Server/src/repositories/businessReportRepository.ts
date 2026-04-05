import type { Pool, PoolClient } from 'pg';
import { pool as globalPool } from '../db/pool.js';
import logger from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BusinessReportFilters {
  startDate?: string;
  endDate?: string;
  paymentMethod?: string;   // CASH | CREDIT | MOBILE_MONEY | CARD
  transactionType?: string; // SALE | EXPENSE | STOCK_MOVEMENT | GOODS_RECEIPT
  includeStockAdjustments?: boolean;
  includeExpenses?: boolean;
}

/** Section 1 — Money In: how cash / receivables were settled */
export interface MoneyInRow {
  account_code: string;
  account_name: string;
  transaction_count: number;
  total_amount: string;
}

/** Section 2 — Revenue by product category (from GL revenue accounts → sale_items → products) */
export interface RevenueByCategoryRow {
  category_name: string;
  transaction_count: number;
  units_sold: string;
  total_revenue: string;
  total_cogs: string;
  gross_profit: string;
  gross_margin_pct: string;
}

/** Section 3 — Cost & stock impact from GL (COGS + inventory adjustments) */
export interface CostAndStockRow {
  account_code: string;
  account_name: string;
  entry_count: number;
  total_amount: string;
}

/** Section 4 — Expenses by GL account (6xxx/7xxx) */
export interface ExpenseByAccountRow {
  account_code: string;
  account_name: string;
  entry_count: number;
  total_amount: string;
  pct_of_total: string;
}

/** Section 5 — summary totals (computed in service, but we gather raw numbers here) */
export interface SummaryTotalsRow {
  total_revenue: string;
  total_cogs: string;
  total_expenses: string;
  total_stock_adjustments: string;
  sale_count: number;
}

// ---------------------------------------------------------------------------
// Helpers — date filter fragment for ledger_entries."EntryDate"
// ---------------------------------------------------------------------------

function dateClause(paramStart: number): string {
  return `
    AND ($${paramStart}::date IS NULL OR le."EntryDate" >= $${paramStart})
    AND ($${paramStart + 1}::date IS NULL OR le."EntryDate" <= $${paramStart + 1})
  `;
}

function dateParams(f: BusinessReportFilters): (string | null)[] {
  return [f.startDate || null, f.endDate || null];
}

// ---------------------------------------------------------------------------
// Section 1 — Money In (DR side of SALE transactions, grouped by settlement account)
// ---------------------------------------------------------------------------

export async function getMoneyIn(
  filters: BusinessReportFilters,
  dbPool?: Pool | PoolClient
): Promise<MoneyInRow[]> {
  const db = dbPool || globalPool;

  // Debit side of sales shows WHERE money landed (Cash 1010, AR 1200, etc.)
  // Optionally filter by payment method via the sales table join
  const paymentMethodJoin = filters.paymentMethod
    ? `JOIN sales s2 ON lt."ReferenceNumber" = s2.sale_number AND s2.payment_method = $3`
    : '';

  const query = `
    SELECT
      a."AccountCode"  AS account_code,
      a."AccountName"  AS account_name,
      COUNT(DISTINCT lt."Id")::integer AS transaction_count,
      ROUND(COALESCE(SUM(le."DebitAmount"), 0)::numeric, 2) AS total_amount
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    ${paymentMethodJoin}
    WHERE lt."ReferenceType" = 'SALE'
      AND lt."Status" = 'POSTED'
      AND le."DebitAmount" > 0
      AND a."AccountType" = 'ASSET'
      ${dateClause(1)}
    GROUP BY a."AccountCode", a."AccountName"
    ORDER BY total_amount DESC
  `;

  const params: (string | null)[] = dateParams(filters);
  if (filters.paymentMethod) params.push(filters.paymentMethod);

  const result = await db.query(query, params);
  return result.rows;
}

// ---------------------------------------------------------------------------
// Section 2 — Revenue by Product Category
// Reads from GL revenue accounts (4000, 4100) → links back through
// ledger_transactions.ReferenceNumber = sales.sale_number → sale_items → products.category
// ---------------------------------------------------------------------------

export async function getRevenueByCategory(
  filters: BusinessReportFilters,
  dbPool?: Pool | PoolClient
): Promise<RevenueByCategoryRow[]> {
  const db = dbPool || globalPool;

  // Revenue comes from CR entries on accounts 4xxx (REVENUE type).
  // We link transactions to sales to get product category breakdown.
  // COGS is from DR entries on account 5000 in the SAME transaction.
  const query = `
    WITH sale_revenue AS (
      -- Total revenue per sale transaction from GL
      SELECT
        lt."ReferenceNumber" AS sale_number,
        ROUND(COALESCE(SUM(le."CreditAmount"), 0)::numeric, 2) AS gl_revenue
      FROM ledger_entries le
      JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
      JOIN accounts a ON a."Id" = le."AccountId"
      WHERE lt."ReferenceType" = 'SALE'
        AND lt."Status" = 'POSTED'
        AND a."AccountType" = 'REVENUE'
        AND le."CreditAmount" > 0
        ${dateClause(1)}
      GROUP BY lt."ReferenceNumber"
    ),
    sale_cogs AS (
      -- Total COGS per sale transaction from GL (DR on 5000)
      SELECT
        lt."ReferenceNumber" AS sale_number,
        ROUND(COALESCE(SUM(le."DebitAmount"), 0)::numeric, 2) AS gl_cogs
      FROM ledger_entries le
      JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
      JOIN accounts a ON a."Id" = le."AccountId"
      WHERE lt."ReferenceType" = 'SALE'
        AND lt."Status" = 'POSTED'
        AND a."AccountCode" = '5000'
        AND le."DebitAmount" > 0
        ${dateClause(1)}
      GROUP BY lt."ReferenceNumber"
    ),
    item_weights AS (
      -- Per-category weight within each sale (for proportional allocation)
      SELECT
        s.sale_number,
        COALESCE(NULLIF(TRIM(p.category), ''), 'Uncategorized') AS category_name,
        COUNT(DISTINCT s.id)::integer AS txn_fragment,
        ROUND(SUM(si.quantity)::numeric, 2) AS units_sold,
        ROUND(SUM(si.total_price)::numeric, 2) AS line_revenue
      FROM sales s
      JOIN sale_items si ON si.sale_id = s.id
      LEFT JOIN products p ON p.id = si.product_id
      WHERE s.status = 'COMPLETED'
        AND ($1::date IS NULL OR s.sale_date >= $1)
        AND ($2::date IS NULL OR s.sale_date <= $2)
      GROUP BY s.sale_number, category_name
    ),
    allocated AS (
      SELECT
        iw.category_name,
        iw.txn_fragment,
        iw.units_sold,
        -- Allocate GL revenue proportionally by line_revenue weight
        CASE
          WHEN sale_total.total_line > 0
          THEN ROUND(sr.gl_revenue * (iw.line_revenue / sale_total.total_line), 2)
          ELSE 0
        END AS allocated_revenue,
        CASE
          WHEN sale_total.total_line > 0
          THEN ROUND(COALESCE(sc.gl_cogs, 0) * (iw.line_revenue / sale_total.total_line), 2)
          ELSE 0
        END AS allocated_cogs
      FROM item_weights iw
      JOIN sale_revenue sr ON sr.sale_number = iw.sale_number
      LEFT JOIN sale_cogs sc ON sc.sale_number = iw.sale_number
      JOIN LATERAL (
        SELECT SUM(iw2.line_revenue) AS total_line
        FROM item_weights iw2
        WHERE iw2.sale_number = iw.sale_number
      ) sale_total ON true
    )
    SELECT
      category_name,
      SUM(txn_fragment)::integer AS transaction_count,
      ROUND(SUM(units_sold)::numeric, 2) AS units_sold,
      ROUND(SUM(allocated_revenue)::numeric, 2) AS total_revenue,
      ROUND(SUM(allocated_cogs)::numeric, 2) AS total_cogs,
      ROUND(SUM(allocated_revenue) - SUM(allocated_cogs), 2) AS gross_profit,
      CASE
        WHEN SUM(allocated_revenue) > 0
        THEN ROUND((SUM(allocated_revenue) - SUM(allocated_cogs)) / SUM(allocated_revenue) * 100, 2)
        ELSE 0
      END AS gross_margin_pct
    FROM allocated
    GROUP BY category_name
    ORDER BY total_revenue DESC
  `;

  const result = await db.query(query, dateParams(filters));
  return result.rows;
}

// ---------------------------------------------------------------------------
// Section 3 — Cost & Stock Impact (COGS 5000 + inventory adjustment accounts 5110-5130, plus 4110 overage)
// ---------------------------------------------------------------------------

export async function getCostAndStock(
  filters: BusinessReportFilters,
  dbPool?: Pool | PoolClient
): Promise<CostAndStockRow[]> {
  const db = dbPool || globalPool;

  // Include all reference types that affect cost/stock accounts
  const refTypes = ['SALE', 'STOCK_MOVEMENT', 'GOODS_RECEIPT'];
  if (!filters.includeStockAdjustments) {
    // If not including adjustments, only show SALE COGS
    refTypes.length = 0;
    refTypes.push('SALE');
  }

  const query = `
    SELECT
      a."AccountCode"  AS account_code,
      a."AccountName"  AS account_name,
      COUNT(le."Id")::integer AS entry_count,
      ROUND(COALESCE(SUM(
        CASE WHEN a."NormalBalance" = 'DEBIT' THEN le."DebitAmount" - le."CreditAmount"
             ELSE le."CreditAmount" - le."DebitAmount"
        END
      ), 0)::numeric, 2) AS total_amount
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE lt."Status" = 'POSTED'
      AND lt."ReferenceType" = ANY($3::text[])
      AND (
        a."AccountCode" IN ('5000','5010','5110','5120','5130','4110')
      )
      ${dateClause(1)}
    GROUP BY a."AccountCode", a."AccountName", a."NormalBalance"
    ORDER BY a."AccountCode"
  `;

  const result = await db.query(query, [
    ...dateParams(filters),
    refTypes,
  ]);
  return result.rows;
}

// ---------------------------------------------------------------------------
// Section 4 — Expenses by GL Account (6xxx operating + 7xxx financial)
// ---------------------------------------------------------------------------

export async function getExpensesByAccount(
  filters: BusinessReportFilters,
  dbPool?: Pool | PoolClient
): Promise<ExpenseByAccountRow[]> {
  const db = dbPool || globalPool;

  const query = `
    WITH expense_entries AS (
      SELECT
        a."AccountCode"  AS account_code,
        a."AccountName"  AS account_name,
        COUNT(le."Id")::integer AS entry_count,
        ROUND(COALESCE(SUM(le."DebitAmount"), 0)::numeric, 2) AS total_amount
      FROM ledger_entries le
      JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
      JOIN accounts a ON a."Id" = le."AccountId"
      WHERE lt."Status" = 'POSTED'
        AND lt."ReferenceType" IN ('EXPENSE', 'EXPENSE_PAYMENT')
        AND a."AccountType" = 'EXPENSE'
        AND le."DebitAmount" > 0
        ${dateClause(1)}
      GROUP BY a."AccountCode", a."AccountName"
    )
    SELECT
      account_code,
      account_name,
      entry_count,
      total_amount,
      CASE
        WHEN (SELECT SUM(total_amount) FROM expense_entries) > 0
        THEN ROUND(total_amount / (SELECT SUM(total_amount) FROM expense_entries) * 100, 2)
        ELSE 0
      END AS pct_of_total
    FROM expense_entries
    ORDER BY total_amount DESC
  `;

  const result = await db.query(query, dateParams(filters));
  return result.rows;
}

// ---------------------------------------------------------------------------
// Section 5 — Summary Totals (raw aggregates, service computes net)
// ---------------------------------------------------------------------------

export async function getSummaryTotals(
  filters: BusinessReportFilters,
  dbPool?: Pool | PoolClient
): Promise<SummaryTotalsRow> {
  const db = dbPool || globalPool;

  // Total revenue from GL (CR on REVENUE accounts for SALE reference type)
  const revenueQuery = `
    SELECT
      ROUND(COALESCE(SUM(le."CreditAmount"), 0)::numeric, 2) AS total_revenue,
      COUNT(DISTINCT lt."Id")::integer AS sale_count
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE lt."ReferenceType" = 'SALE'
      AND lt."Status" = 'POSTED'
      AND a."AccountType" = 'REVENUE'
      AND le."CreditAmount" > 0
      ${dateClause(1)}
  `;

  // Total COGS from GL (DR on account 5000 for SALE reference type)
  const cogsQuery = `
    SELECT
      ROUND(COALESCE(SUM(le."DebitAmount"), 0)::numeric, 2) AS total_cogs
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE lt."ReferenceType" = 'SALE'
      AND lt."Status" = 'POSTED'
      AND a."AccountCode" = '5000'
      AND le."DebitAmount" > 0
      ${dateClause(1)}
  `;

  // Total expenses from GL (DR on EXPENSE accounts for EXPENSE/EXPENSE_PAYMENT)
  const expenseQuery = `
    SELECT
      ROUND(COALESCE(SUM(le."DebitAmount"), 0)::numeric, 2) AS total_expenses
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE lt."Status" = 'POSTED'
      AND lt."ReferenceType" IN ('EXPENSE', 'EXPENSE_PAYMENT')
      AND a."AccountType" = 'EXPENSE'
      AND le."DebitAmount" > 0
      ${dateClause(1)}
  `;

  // Stock adjustments from GL (DR/CR on adjustment accounts for STOCK_MOVEMENT)
  const stockAdjQuery = `
    SELECT
      ROUND(COALESCE(SUM(
        CASE WHEN a."NormalBalance" = 'DEBIT' THEN le."DebitAmount" - le."CreditAmount"
             ELSE le."CreditAmount" - le."DebitAmount"
        END
      ), 0)::numeric, 2) AS total_stock_adjustments
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE lt."Status" = 'POSTED'
      AND lt."ReferenceType" = 'STOCK_MOVEMENT'
      AND a."AccountCode" IN ('5110','5120','5130','4110')
      ${dateClause(1)}
  `;

  const params = dateParams(filters);
  const [revResult, cogsResult, expResult, adjResult] = await Promise.all([
    db.query(revenueQuery, params),
    db.query(cogsQuery, params),
    db.query(expenseQuery, params),
    db.query(stockAdjQuery, params),
  ]);

  const rev = revResult.rows[0] || {};
  const cogs = cogsResult.rows[0] || {};
  const exp = expResult.rows[0] || {};
  const adj = adjResult.rows[0] || {};

  return {
    total_revenue: rev.total_revenue || '0',
    total_cogs: cogs.total_cogs || '0',
    total_expenses: exp.total_expenses || '0',
    total_stock_adjustments: adj.total_stock_adjustments || '0',
    sale_count: parseInt(rev.sale_count, 10) || 0,
  };
}
