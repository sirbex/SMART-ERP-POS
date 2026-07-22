import type { Pool, PoolClient } from 'pg';
import { pool as globalPool } from '../db/pool.js';
import { Money } from '../utils/money.js';
import logger from '../utils/logger.js';
import { ValidationError } from '../middleware/errorHandler.js';
import * as repo from '../repositories/businessReportRepository.js';
import type { BusinessReportFilters } from '../repositories/businessReportRepository.js';
import { reportsRepository } from '../modules/reports/reportsRepository.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function requireReportDates(filters: BusinessReportFilters): { startDate: string; endDate: string } {
  const startDate = filters.startDate?.trim() ?? '';
  const endDate = filters.endDate?.trim() ?? '';
  if (!ISO_DATE.test(startDate) || !ISO_DATE.test(endDate)) {
    throw new ValidationError('start_date and end_date are required (YYYY-MM-DD)');
  }
  if (startDate > endDate) {
    throw new ValidationError('start_date must be on or before end_date');
  }
  return { startDate, endDate };
}

// ---------------------------------------------------------------------------
// Section 1 — Money In
// ---------------------------------------------------------------------------

export interface MoneyInEntry {
  flowType: string;
  flowLabel: string;
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
// Section 4b — Supplier Payments by Funding Account
// ---------------------------------------------------------------------------

export interface SupplierPaymentByAccountEntry {
  fundingAccountCode: string;
  fundingAccountName: string;
  supplierName: string;
  paymentCount: number;
  totalPaid: number;
}

// ---------------------------------------------------------------------------
// Customer Deposits (Liability section)
// ---------------------------------------------------------------------------

export interface CustomerDepositSummary {
  totalDeposited: number;
  totalCleared: number;
  depositCount: number;
  clearingCount: number;
  outstandingLiability: number;
  activeDepositCount: number;
  customersWithDeposits: number;
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
  totalSupplierPayments: number;
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
  supplierPaymentsByAccount: SupplierPaymentByAccountEntry[];
  customerDeposits: CustomerDepositSummary;
}

// ---------------------------------------------------------------------------
// Main report builder
// ---------------------------------------------------------------------------

export async function getBusinessPerformanceReport(
  filters: BusinessReportFilters,
  dbPool?: Pool | PoolClient
): Promise<BusinessPerformanceReport> {
  const pool = dbPool || globalPool;
  const { startDate, endDate } = requireReportDates(filters);
  const datedFilters: BusinessReportFilters = { ...filters, startDate, endDate };

  try {
    // Run all 5 sections in parallel
    // Section 2 uses the canonical reportsRepository.getSalesByCategory (live transaction tables)
    const [moneyInRows, revRows, costRows, expRows, supplierPayRows, totals, depositSummary] = await Promise.all([
      repo.getMoneyIn(datedFilters, pool),
      reportsRepository.getSalesByCategory(pool as Pool, {
        startDate,
        endDate,
      }),
      repo.getCostAndStock(datedFilters, pool),
      datedFilters.includeExpenses !== false
        ? repo.getExpensesByAccount(datedFilters, pool)
        : Promise.resolve([]),
      repo.getSupplierPaymentsByAccount(datedFilters, pool),
      repo.getSummaryTotals(datedFilters, pool),
      repo.getCustomerDepositSummary(datedFilters, pool),
    ]);

    // --- Normalize Section 1 ---
    const moneyIn: MoneyInEntry[] = moneyInRows.map((r) => ({
      flowType: r.flow_type,
      flowLabel: r.flow_label,
      accountCode: r.account_code,
      accountName: r.account_name,
      transactionCount: r.transaction_count,
      totalAmount: Money.toNumber(Money.parseDb(r.total_amount)),
    }));

    // --- Normalize Section 2 ---
    // revRows is SalesByCategoryRow[] from canonical reportsRepository (already typed numbers)
    const revenueByCategory: RevenueByCategoryEntry[] = revRows.map((r) => ({
      categoryName: r.category,
      transactionCount: r.transactionCount,
      unitsSold: r.totalQuantitySold,
      totalRevenue: r.totalRevenue,
      totalCogs: r.totalCost,
      grossProfit: r.grossProfit,
      grossMarginPct: r.profitMargin,
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

    // --- Normalize Section 4b ---
    const supplierPaymentsByAccount: SupplierPaymentByAccountEntry[] = supplierPayRows.map((r) => ({
      fundingAccountCode: r.funding_account_code,
      fundingAccountName: r.funding_account_name,
      supplierName: r.supplier_name,
      paymentCount: r.payment_count,
      totalPaid: Money.toNumber(Money.parseDb(r.total_paid)),
    }));

    // --- Normalize Customer Deposits ---
    const customerDeposits: CustomerDepositSummary = {
      totalDeposited: Money.toNumber(Money.parseDb(depositSummary.total_deposited)),
      totalCleared: Money.toNumber(Money.parseDb(depositSummary.total_cleared)),
      depositCount: depositSummary.deposit_count,
      clearingCount: depositSummary.clearing_count,
      outstandingLiability: Money.toNumber(Money.parseDb(depositSummary.outstanding_liability)),
      activeDepositCount: depositSummary.active_deposit_count,
      customersWithDeposits: depositSummary.customers_with_deposits,
    };

    // --- Section 5: Summary ---
    const totalRevenue = Money.toNumber(Money.parseDb(totals.total_revenue));
    const glCogs = Money.toNumber(Money.parseDb(totals.total_cogs));
    const categoryCogsSum = revenueByCategory.reduce(
      (sum, r) => Money.toNumber(Money.add(sum, r.totalCogs)),
      0,
    );
    // GL (SALE_COGS on 5000) is authoritative; fall back to category roll-up if legacy rows lack COGS journal
    const totalCogs = glCogs > 0 ? glCogs : categoryCogsSum;
    const totalExpenses = Money.toNumber(Money.parseDb(totals.total_expenses));
    const totalStockAdjustments = Money.toNumber(Money.parseDb(totals.total_stock_adjustments));
    const totalSupplierPayments = supplierPaymentsByAccount.reduce((sum, r) => Money.toNumber(Money.add(sum, r.totalPaid)), 0);
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
      totalSupplierPayments,
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
      supplierPaymentsByAccount,
      customerDeposits,
    };
  } catch (error) {
    logger.error('Error generating business performance report', { error, filters });
    throw error;
  }
}
