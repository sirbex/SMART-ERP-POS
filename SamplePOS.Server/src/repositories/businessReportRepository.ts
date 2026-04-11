import type { Pool, PoolClient } from 'pg';
import { pool as globalPool } from '../db/pool.js';
import { toUtcRange, BUSINESS_TIMEZONE } from '../utils/dateRange.js';

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

/** Section 4b — Supplier payments by funding account */
export interface SupplierPaymentByAccountRow {
  funding_account_code: string;
  funding_account_name: string;
  supplier_name: string;
  payment_count: number;
  total_paid: string;
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
    AND ($${paramStart}::timestamptz IS NULL OR le."EntryDate" >= $${paramStart}::timestamptz)
    AND ($${paramStart + 1}::timestamptz IS NULL OR le."EntryDate" < $${paramStart + 1}::timestamptz)
  `;
}

/** Convert user-facing YYYY-MM-DD dates to UTC boundaries for TIMESTAMPTZ columns. */
function dateParams(f: BusinessReportFilters): (string | null)[] {
  if (!f.startDate && !f.endDate) return [null, null];
  if (f.startDate && f.endDate) {
    const { startUtc, endUtc } = toUtcRange(f.startDate, f.endDate, BUSINESS_TIMEZONE);
    return [startUtc, endUtc];
  }
  if (f.startDate) {
    const { startUtc } = toUtcRange(f.startDate, f.startDate, BUSINESS_TIMEZONE);
    return [startUtc, null];
  }
  const { endUtc } = toUtcRange(f.endDate!, f.endDate!, BUSINESS_TIMEZONE);
  return [null, endUtc];
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
// Reads from product_daily_summary state table (maintained at write-time).
// SAP pattern: "Reports read reality (state tables), not transaction tables."
// ---------------------------------------------------------------------------

export async function getRevenueByCategory(
  filters: BusinessReportFilters,
  dbPool?: Pool | PoolClient
): Promise<RevenueByCategoryRow[]> {
  const db = dbPool || globalPool;

  // product_daily_summary uses DATE (not TIMESTAMPTZ), so we use date bounds directly
  const query = `
    SELECT
      pds.category AS category_name,
      SUM(pds.transaction_count)::integer AS transaction_count,
      ROUND(SUM(pds.units_sold)::numeric, 2) AS units_sold,
      ROUND(SUM(pds.revenue)::numeric, 2) AS total_revenue,
      ROUND(SUM(pds.cost_of_goods)::numeric, 2) AS total_cogs,
      ROUND(SUM(pds.gross_profit)::numeric, 2) AS gross_profit,
      CASE
        WHEN SUM(pds.revenue) > 0
        THEN ROUND(SUM(pds.gross_profit) / SUM(pds.revenue) * 100, 2)
        ELSE 0
      END AS gross_margin_pct
    FROM product_daily_summary pds
    WHERE ($1::date IS NULL OR pds.business_date >= $1::date)
      AND ($2::date IS NULL OR pds.business_date <= $2::date)
    GROUP BY pds.category
    ORDER BY total_revenue DESC
  `;

  // Convert TIMESTAMPTZ-style date params to plain DATE bounds
  const startDate = filters.startDate || null;
  const endDate = filters.endDate || null;

  const result = await db.query(query, [startDate, endDate]);
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
// Section 4b — Supplier Payments by Funding Account
// Shows which accounts (Cash-1010, Bank-1030) paid which suppliers
// ---------------------------------------------------------------------------

export async function getSupplierPaymentsByAccount(
  filters: BusinessReportFilters,
  dbPool?: Pool | PoolClient
): Promise<SupplierPaymentByAccountRow[]> {
  const db = dbPool || globalPool;

  const query = `
    SELECT
      a."AccountCode"  AS funding_account_code,
      a."AccountName"  AS funding_account_name,
      lt."Description" AS description,
      COUNT(DISTINCT lt."Id")::integer AS payment_count,
      ROUND(COALESCE(SUM(le."CreditAmount"), 0)::numeric, 2) AS total_paid
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE lt."Status" = 'POSTED'
      AND lt."ReferenceType" = 'SUPPLIER_PAYMENT'
      AND le."CreditAmount" > 0
      AND a."AccountType" IN ('ASSET', 'BANK')
      ${dateClause(1)}
    GROUP BY a."AccountCode", a."AccountName", lt."Description"
    ORDER BY total_paid DESC
  `;

  const rows = await db.query(query, dateParams(filters));

  // Extract supplier name from GL description: "Payment to supplier: XYZ"
  return rows.rows.map((r: Record<string, unknown>) => ({
    funding_account_code: r.funding_account_code as string,
    funding_account_name: r.funding_account_name as string,
    supplier_name: extractSupplierName(r.description as string),
    payment_count: r.payment_count as number,
    total_paid: r.total_paid as string,
  }));
}

/** Extract supplier name from GL description like "Payment to supplier: ABC Pharma" */
function extractSupplierName(description: string): string {
  const match = description?.match(/Payment to supplier:\s*(.+)/i);
  return match ? match[1].trim() : description || 'Unknown';
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
