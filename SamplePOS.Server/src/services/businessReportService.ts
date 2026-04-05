import type { Pool, PoolClient } from 'pg';
import { pool as globalPool } from '../db/pool.js';
import { Money } from '../utils/money.js';
import logger from '../utils/logger.js';
import * as repo from '../repositories/businessReportRepository.js';
import type { BusinessReportFilters } from '../repositories/businessReportRepository.js';

// ---------------------------------------------------------------------------
// Section 1 — Money In
// ---------------------------------------------------------------------------

export interface MoneyInEntry {
  accountCode: string;
  accountName: string;
  transactionCount: number;
  totalAmount: number;
}

// ---------------------------------------------------------------------------
// Section 2 — Revenue by Product Category
// ---------------------------------------------------------------------------

export interface RevenueByCategoryEntry {
  categoryName: string;
  transactionCount: number;
  unitsSold: number;
  totalRevenue: number;
  totalCogs: number;
  grossProfit: number;
  grossMarginPct: number;
}

// ---------------------------------------------------------------------------
// Section 3 — Cost & Stock Impact
// ---------------------------------------------------------------------------

export interface CostAndStockEntry {
  accountCode: string;
  accountName: string;
  entryCount: number;
  totalAmount: number;
}

// ---------------------------------------------------------------------------
// Section 4 — Expenses by Account
// ---------------------------------------------------------------------------

export interface ExpenseByAccountEntry {
  accountCode: string;
  accountName: string;
  entryCount: number;
  totalAmount: number;
  pctOfTotal: number;
}

// ---------------------------------------------------------------------------
// Section 5 — Summary
// ---------------------------------------------------------------------------

export interface BusinessSummary {
  totalRevenue: number;
  totalCogs: number;
  grossProfit: number;
  grossMarginPct: number;
  totalExpenses: number;
  totalStockAdjustments: number;
  netProfit: number;
  netMarginPct: number;
  saleCount: number;
}

// ---------------------------------------------------------------------------
// Full report shape
// ---------------------------------------------------------------------------

export interface BusinessPerformanceReport {
  summary: BusinessSummary;
  moneyIn: MoneyInEntry[];
  revenueByCategory: RevenueByCategoryEntry[];
  costAndStock: CostAndStockEntry[];
  expensesByAccount: ExpenseByAccountEntry[];
}

// ---------------------------------------------------------------------------
// Main report builder
// ---------------------------------------------------------------------------

export async function getBusinessPerformanceReport(
  filters: BusinessReportFilters,
  dbPool?: Pool | PoolClient
): Promise<BusinessPerformanceReport> {
  const pool = dbPool || globalPool;

  try {
    // Run all 5 sections in parallel
    const [moneyInRows, revRows, costRows, expRows, totals] = await Promise.all([
      repo.getMoneyIn(filters, pool),
      repo.getRevenueByCategory(filters, pool),
      repo.getCostAndStock(filters, pool),
      filters.includeExpenses !== false
        ? repo.getExpensesByAccount(filters, pool)
        : Promise.resolve([]),
      repo.getSummaryTotals(filters, pool),
    ]);

    // --- Normalize Section 1 ---
    const moneyIn: MoneyInEntry[] = moneyInRows.map((r) => ({
      accountCode: r.account_code,
      accountName: r.account_name,
      transactionCount: r.transaction_count,
      totalAmount: Money.toNumber(Money.parseDb(r.total_amount)),
    }));

    // --- Normalize Section 2 ---
    const revenueByCategory: RevenueByCategoryEntry[] = revRows.map((r) => ({
      categoryName: r.category_name,
      transactionCount: r.transaction_count,
      unitsSold: Money.toNumber(Money.parseDb(r.units_sold)),
      totalRevenue: Money.toNumber(Money.parseDb(r.total_revenue)),
      totalCogs: Money.toNumber(Money.parseDb(r.total_cogs)),
      grossProfit: Money.toNumber(Money.parseDb(r.gross_profit)),
      grossMarginPct: Money.toNumber(Money.parseDb(r.gross_margin_pct)),
    }));

    // --- Normalize Section 3 ---
    const costAndStock: CostAndStockEntry[] = costRows.map((r) => ({
      accountCode: r.account_code,
      accountName: r.account_name,
      entryCount: r.entry_count,
      totalAmount: Money.toNumber(Money.parseDb(r.total_amount)),
    }));

    // --- Normalize Section 4 ---
    const expensesByAccount: ExpenseByAccountEntry[] = expRows.map((r) => ({
      accountCode: r.account_code,
      accountName: r.account_name,
      entryCount: r.entry_count,
      totalAmount: Money.toNumber(Money.parseDb(r.total_amount)),
      pctOfTotal: Money.toNumber(Money.parseDb(r.pct_of_total)),
    }));

    // --- Section 5: Summary ---
    const totalRevenue = Money.toNumber(Money.parseDb(totals.total_revenue));
    const totalCogs = Money.toNumber(Money.parseDb(totals.total_cogs));
    const totalExpenses = Money.toNumber(Money.parseDb(totals.total_expenses));
    const totalStockAdjustments = Money.toNumber(Money.parseDb(totals.total_stock_adjustments));
    const grossProfit = Money.toNumber(Money.subtract(totalRevenue, totalCogs));
    const netProfit = Money.toNumber(Money.subtract(grossProfit, totalExpenses));
    const grossMarginPct = totalRevenue > 0
      ? Money.toNumber(Money.percentageRate(grossProfit, totalRevenue))
      : 0;
    const netMarginPct = totalRevenue > 0
      ? Money.toNumber(Money.percentageRate(netProfit, totalRevenue))
      : 0;

    const summary: BusinessSummary = {
      totalRevenue,
      totalCogs,
      grossProfit,
      grossMarginPct,
      totalExpenses,
      totalStockAdjustments,
      netProfit,
      netMarginPct,
      saleCount: totals.sale_count,
    };

    return {
      summary,
      moneyIn,
      revenueByCategory,
      costAndStock,
      expensesByAccount,
    };
  } catch (error) {
    logger.error('Error generating business performance report', { error, filters });
    throw error;
  }
}
