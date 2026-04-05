import type { Pool, PoolClient } from 'pg';
import { pool as globalPool } from '../db/pool.js';
import { Money } from '../utils/money.js';
import logger from '../utils/logger.js';
import * as repo from '../repositories/businessReportRepository.js';
import type { BusinessReportFilters } from '../repositories/businessReportRepository.js';

export interface CategoryPerformance {
  categoryName: string;
  transactionCount: number;
  unitsSold: number;
  totalSales: number;
  totalCogs: number;
  grossProfit: number;
  grossMarginPct: number;
}

export interface ExpenseBreakdown {
  categoryName: string;
  expenseCount: number;
  totalExpenses: number;
  pctOfTotal: number;
}

export interface BusinessSummary {
  totalSales: number;
  totalCogs: number;
  grossProfit: number;
  grossMarginPct: number;
  totalExpenses: number;
  netProfit: number;
  netMarginPct: number;
  completedSalesCount: number;
  paidExpensesCount: number;
}

export interface BusinessPerformanceReport {
  summary: BusinessSummary;
  revenueByCategory: CategoryPerformance[];
  expensesByCategory: ExpenseBreakdown[];
}

export async function getBusinessPerformanceReport(
  filters: BusinessReportFilters,
  dbPool?: Pool | PoolClient
): Promise<BusinessPerformanceReport> {
  const pool = dbPool || globalPool;

  try {
    const [revenueRows, expenseRows, totals] = await Promise.all([
      repo.getRevenueByCategorySQL(filters, pool),
      repo.getExpensesByCategory(filters, pool),
      repo.getBusinessSummaryTotals(filters, pool),
    ]);

    // Normalize revenue rows: snake_case → camelCase, string → number via Money
    const revenueByCategory: CategoryPerformance[] = revenueRows.map((row) => ({
      categoryName: row.category_name,
      transactionCount: row.transaction_count,
      unitsSold: Money.toNumber(Money.parseDb(row.units_sold)),
      totalSales: Money.toNumber(Money.parseDb(row.total_sales)),
      totalCogs: Money.toNumber(Money.parseDb(row.total_cogs)),
      grossProfit: Money.toNumber(Money.parseDb(row.gross_profit)),
      grossMarginPct: Money.toNumber(Money.parseDb(row.gross_margin_pct)),
    }));

    // Normalize expense rows
    const expensesByCategory: ExpenseBreakdown[] = expenseRows.map((row) => ({
      categoryName: row.category_name,
      expenseCount: row.expense_count,
      totalExpenses: Money.toNumber(Money.parseDb(row.total_expenses)),
      pctOfTotal: Money.toNumber(Money.parseDb(row.pct_of_total)),
    }));

    // Compute summary using Money utility
    const totalSales = Money.toNumber(Money.parseDb(totals.total_sales));
    const totalCogs = Money.toNumber(Money.parseDb(totals.total_cogs));
    const grossProfit = Money.toNumber(Money.parseDb(totals.gross_profit));
    const totalExpenses = Money.toNumber(Money.parseDb(totals.total_expenses));
    const netProfit = Money.toNumber(Money.subtract(grossProfit, totalExpenses));
    const grossMarginPct = totalSales > 0
      ? Money.toNumber(Money.percentageRate(grossProfit, totalSales))
      : 0;
    const netMarginPct = totalSales > 0
      ? Money.toNumber(Money.percentageRate(netProfit, totalSales))
      : 0;

    const summary: BusinessSummary = {
      totalSales,
      totalCogs,
      grossProfit,
      grossMarginPct,
      totalExpenses,
      netProfit,
      netMarginPct,
      completedSalesCount: totals.completed_sales_count,
      paidExpensesCount: totals.paid_expenses_count,
    };

    return { summary, revenueByCategory, expensesByCategory };
  } catch (error) {
    logger.error('Error generating business performance report', { error, filters });
    throw error;
  }
}
