/**
 * Profit & Loss Report Service
 *
 * ERP-grade P&L reporting with Clean Core principles:
 *   ✔ Single Source of Truth - All report data from gl_period_balances
 *   ✔ No frontend calculations
 *   ✔ Decimal-safe aggregations via database functions
 *   ✔ Totals reconcile with Trial Balance
 */

import { Pool } from 'pg';
import Decimal from 'decimal.js';
import { Money } from '../utils/money.js';
import logger from '../utils/logger.js';

// Configure Decimal.js for financial precision
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// =============================================================================
// TYPES
// =============================================================================

export interface ProfitLossLineItem {
    section: string;
    accountCode: string;
    accountName: string;
    debitTotal: number;
    creditTotal: number;
    netAmount: number;
    displayAmount: number;
}

export interface ProfitLossSummary {
    totalRevenue: number;
    totalCogs: number;
    grossProfit: number;
    grossMarginPercent: number;
    totalOperatingExpenses: number;
    operatingIncome: number;
    operatingMarginPercent: number;
    netIncome: number;
    netMarginPercent: number;
}

export interface ProfitLossReport {
    periodStart: string;
    periodEnd: string;
    generatedAt: string;
    revenueAccounts: ProfitLossLineItem[];
    cogsAccounts: ProfitLossLineItem[];
    expenseAccounts: ProfitLossLineItem[];
    summary: ProfitLossSummary;
}

export interface CustomerProfitability {
    customerId: string;
    customerName: string;
    totalRevenue: number;
    totalCogs: number;
    grossProfit: number;
    grossMarginPercent: number;
    transactionCount: number;
}

export interface ProductProfitability {
    productId: string;
    productName: string;
    productSku: string;
    totalRevenue: number;
    totalCogs: number;
    grossProfit: number;
    grossMarginPercent: number;
    quantitySold: number;
}

// =============================================================================
// PROFIT & LOSS REPORT SERVICE
// =============================================================================

export class ProfitLossReportService {
    private pool: Pool;

    constructor(pool: Pool) {
        this.pool = pool;
    }

    /**
     * Get complete Profit & Loss report for a date range
     *
     * All figures derived from gl_period_balances (SAP totals table)
     */
    async getProfitLossReport(dateFrom: string, dateTo: string): Promise<ProfitLossReport> {
        try {
            // Parse date range to fiscal year/month for gl_period_balances
            const [startYear, startMonth] = dateFrom.split('-').map(Number);
            const [endYear, endMonth] = dateTo.split('-').map(Number);

            // Get detailed P&L from gl_period_balances (SAP totals table)
            const detailResult = await this.pool.query(
                `
                SELECT
                    CASE
                        WHEN a."AccountCode" LIKE '4%' THEN 'REVENUE'
                        WHEN a."AccountCode" LIKE '5%' THEN 'COST_OF_GOODS_SOLD'
                        WHEN a."AccountCode" LIKE '6%' OR a."AccountType" = 'EXPENSE' THEN 'OPERATING_EXPENSES'
                        ELSE 'OTHER'
                    END AS section,
                    a."AccountCode" AS account_code,
                    a."AccountName" AS account_name,
                    COALESCE(SUM(gpb.debit_total), 0)  AS debit_total,
                    COALESCE(SUM(gpb.credit_total), 0) AS credit_total,
                    COALESCE(SUM(gpb.debit_total), 0) - COALESCE(SUM(gpb.credit_total), 0) AS net_amount,
                    CASE
                        WHEN a."AccountCode" LIKE '4%'
                            THEN COALESCE(SUM(gpb.credit_total), 0) - COALESCE(SUM(gpb.debit_total), 0)
                        ELSE COALESCE(SUM(gpb.debit_total), 0) - COALESCE(SUM(gpb.credit_total), 0)
                    END AS display_amount
                FROM accounts a
                LEFT JOIN gl_period_balances gpb
                    ON gpb.account_id = a."Id"
                   AND (gpb.fiscal_year > $1 OR (gpb.fiscal_year = $1 AND gpb.fiscal_period >= $2))
                   AND (gpb.fiscal_year < $3 OR (gpb.fiscal_year = $3 AND gpb.fiscal_period <= $4))
                   AND gpb.fiscal_period > 0
                WHERE a."IsActive" = true
                  AND (a."AccountType" IN ('REVENUE', 'EXPENSE') OR a."AccountCode" LIKE '5%')
                GROUP BY a."AccountCode", a."AccountName", a."AccountType"
                HAVING COALESCE(SUM(gpb.debit_total), 0) > 0 OR COALESCE(SUM(gpb.credit_total), 0) > 0
                ORDER BY
                    CASE
                        WHEN a."AccountCode" LIKE '4%' THEN 1
                        WHEN a."AccountCode" LIKE '5%' THEN 2
                        ELSE 3
                    END,
                    a."AccountCode"
            `,
                [startYear, startMonth, endYear, endMonth]
            );

            // Get summary from gl_period_balances (SAP totals table)
            const summaryResult = await this.pool.query(
                `
                SELECT
                    COALESCE(SUM(CASE WHEN a."AccountCode" LIKE '4%'
                        THEN gpb.credit_total - gpb.debit_total ELSE 0 END), 0) AS total_revenue,
                    COALESCE(SUM(CASE WHEN a."AccountCode" LIKE '5%'
                        THEN gpb.debit_total - gpb.credit_total ELSE 0 END), 0) AS total_cogs,
                    COALESCE(SUM(CASE WHEN a."AccountCode" LIKE '6%' OR a."AccountType" = 'EXPENSE'
                        THEN gpb.debit_total - gpb.credit_total ELSE 0 END), 0) AS total_operating_expenses
                FROM gl_period_balances gpb
                JOIN accounts a ON gpb.account_id = a."Id"
                WHERE (gpb.fiscal_year > $1 OR (gpb.fiscal_year = $1 AND gpb.fiscal_period >= $2))
                  AND (gpb.fiscal_year < $3 OR (gpb.fiscal_year = $3 AND gpb.fiscal_period <= $4))
                  AND gpb.fiscal_period > 0
            `,
                [startYear, startMonth, endYear, endMonth]
            );

            // Parse detail rows into sections
            const revenueAccounts: ProfitLossLineItem[] = [];
            const cogsAccounts: ProfitLossLineItem[] = [];
            const expenseAccounts: ProfitLossLineItem[] = [];

            for (const row of detailResult.rows) {
                const item: ProfitLossLineItem = {
                    section: row.section,
                    accountCode: row.account_code,
                    accountName: row.account_name,
                    debitTotal: Money.parseDb(row.debit_total).toNumber(),
                    creditTotal: Money.parseDb(row.credit_total).toNumber(),
                    netAmount: Money.parseDb(row.net_amount).toNumber(),
                    displayAmount: Money.parseDb(row.display_amount).toNumber(),
                };

                switch (row.section) {
                    case 'REVENUE':
                        revenueAccounts.push(item);
                        break;
                    case 'COST_OF_GOODS_SOLD':
                        cogsAccounts.push(item);
                        break;
                    case 'OPERATING_EXPENSES':
                    case 'OTHER':
                        expenseAccounts.push(item);
                        break;
                }
            }

            // Parse summary — compute derived fields from raw totals
            const summaryRow = summaryResult.rows[0] || {};
            const totalRevenueDec = Money.parseDb(summaryRow.total_revenue);
            const totalCogsDec = Money.parseDb(summaryRow.total_cogs);
            const totalOpExDec = Money.parseDb(summaryRow.total_operating_expenses);
            const grossProfitDec = totalRevenueDec.minus(totalCogsDec);
            const operatingIncomeDec = grossProfitDec.minus(totalOpExDec);
            const netIncomeDec = operatingIncomeDec; // Simplified (no other income/expense)

            const summary: ProfitLossSummary = {
                totalRevenue: totalRevenueDec.toNumber(),
                totalCogs: totalCogsDec.toNumber(),
                grossProfit: grossProfitDec.toNumber(),
                grossMarginPercent: totalRevenueDec.greaterThan(0)
                    ? grossProfitDec.dividedBy(totalRevenueDec).times(100).toDecimalPlaces(4).toNumber()
                    : 0,
                totalOperatingExpenses: totalOpExDec.toNumber(),
                operatingIncome: operatingIncomeDec.toNumber(),
                operatingMarginPercent: totalRevenueDec.greaterThan(0)
                    ? operatingIncomeDec.dividedBy(totalRevenueDec).times(100).toDecimalPlaces(4).toNumber()
                    : 0,
                netIncome: netIncomeDec.toNumber(),
                netMarginPercent: totalRevenueDec.greaterThan(0)
                    ? netIncomeDec.dividedBy(totalRevenueDec).times(100).toDecimalPlaces(4).toNumber()
                    : 0,
            };

            logger.info('P&L report generated', {
                dateFrom,
                dateTo,
                revenue: summary.totalRevenue,
                netIncome: summary.netIncome,
            });

            return {
                periodStart: dateFrom,
                periodEnd: dateTo,
                generatedAt: new Date().toISOString(),
                revenueAccounts,
                cogsAccounts,
                expenseAccounts,
                summary,
            };
        } catch (error: unknown) {
            logger.error('Failed to generate P&L report', { dateFrom, dateTo, error });
            throw error;
        }
    }

    /**
     * Get P&L by Customer
     *
     * Analyzes profitability by customer using GL data
     */
    async getProfitLossByCustomer(
        dateFrom: string,
        dateTo: string
    ): Promise<CustomerProfitability[]> {
        try {
            const result = await this.pool.query(
                `
                SELECT * FROM fn_get_profit_loss_by_customer($1::DATE, $2::DATE)
            `,
                [dateFrom, dateTo]
            );

            const customers = result.rows.map((row) => ({
                customerId: row.customer_id,
                customerName: row.customer_name,
                totalRevenue: Money.parseDb(row.total_revenue).toNumber(),
                totalCogs: Money.parseDb(row.total_cogs).toNumber(),
                grossProfit: Money.parseDb(row.gross_profit).toNumber(),
                grossMarginPercent: Money.parseDb(row.gross_margin_percent).toNumber(),
                transactionCount: parseInt(row.transaction_count || '0'),
            }));

            logger.info('P&L by customer generated', {
                dateFrom,
                dateTo,
                customerCount: customers.length,
            });

            return customers;
        } catch (error: unknown) {
            logger.error('Failed to generate P&L by customer', { dateFrom, dateTo, error });
            throw error;
        }
    }

    /**
     * Get P&L by Product
     *
     * Analyzes profitability by product
     */
    async getProfitLossByProduct(dateFrom: string, dateTo: string): Promise<ProductProfitability[]> {
        try {
            const result = await this.pool.query(
                `
                SELECT * FROM fn_get_profit_loss_by_product($1::DATE, $2::DATE)
            `,
                [dateFrom, dateTo]
            );

            const products = result.rows.map((row) => ({
                productId: row.product_id,
                productName: row.product_name,
                productSku: row.product_sku || '',
                totalRevenue: Money.parseDb(row.total_revenue).toNumber(),
                totalCogs: Money.parseDb(row.total_cogs).toNumber(),
                grossProfit: Money.parseDb(row.gross_profit).toNumber(),
                grossMarginPercent: Money.parseDb(row.gross_margin_percent).toNumber(),
                quantitySold: Money.parseDb(row.quantity_sold).toNumber(),
            }));

            logger.info('P&L by product generated', {
                dateFrom,
                dateTo,
                productCount: products.length,
            });

            return products;
        } catch (error: unknown) {
            logger.error('Failed to generate P&L by product', { dateFrom, dateTo, error });
            throw error;
        }
    }

    /**
     * Verify P&L totals match Trial Balance
     *
     * Ensures consistency between reports (Clean Core principle)
     */
    async verifyProfitLossConsistency(
        dateFrom: string,
        dateTo: string
    ): Promise<{
        isConsistent: boolean;
        plNetIncome: number;
        trialBalanceNetIncome: number;
        difference: number;
    }> {
        try {
            // Get P&L net income
            const plResult = await this.pool.query(
                `
                SELECT * FROM fn_get_profit_loss_summary($1::DATE, $2::DATE)
            `,
                [dateFrom, dateTo]
            );

            const plNetIncome = Money.parseDb(plResult.rows[0]?.net_income).toNumber();

            // Calculate net income from gl_period_balances (SAP totals table)
            // Revenue (credits - debits) - Expenses (debits - credits)
            const [startYear, startMonth] = dateFrom.split('-').map(Number);
            const [endYear, endMonth] = dateTo.split('-').map(Number);
            const tbResult = await this.pool.query(
                `
                SELECT 
                    COALESCE(SUM(CASE 
                        WHEN a."AccountCode" LIKE '4%' 
                        THEN gpb.credit_total - gpb.debit_total 
                        ELSE 0 
                    END), 0) as revenue,
                    COALESCE(SUM(CASE 
                        WHEN a."AccountCode" LIKE '5%' OR a."AccountCode" LIKE '6%' OR a."AccountType" = 'EXPENSE'
                        THEN gpb.debit_total - gpb.credit_total 
                        ELSE 0 
                    END), 0) as expenses
                FROM gl_period_balances gpb
                JOIN accounts a ON gpb.account_id = a."Id"
                WHERE (gpb.fiscal_year > $1 OR (gpb.fiscal_year = $1 AND gpb.fiscal_period >= $2))
                  AND (gpb.fiscal_year < $3 OR (gpb.fiscal_year = $3 AND gpb.fiscal_period <= $4))
                  AND gpb.fiscal_period > 0
            `,
                [startYear, startMonth, endYear, endMonth]
            );

            const revenueDec = Money.parseDb(tbResult.rows[0]?.revenue);
            const expensesDec = Money.parseDb(tbResult.rows[0]?.expenses);
            const trialBalanceNetIncome = Money.toNumber(revenueDec.minus(expensesDec));

            const difference = Money.toNumber(new Decimal(plNetIncome).minus(trialBalanceNetIncome));
            const isConsistent = Math.abs(difference) < 0.01;

            if (!isConsistent) {
                logger.warn('P&L consistency check failed', {
                    plNetIncome,
                    trialBalanceNetIncome,
                    difference,
                });
            }

            return {
                isConsistent,
                plNetIncome,
                trialBalanceNetIncome,
                difference,
            };
        } catch (error: unknown) {
            logger.error('Failed to verify P&L consistency', { dateFrom, dateTo, error });
            throw error;
        }
    }

    /**
     * Get comparative P&L (current vs previous period)
     */
    async getComparativeProfitLoss(
        currentPeriodStart: string,
        currentPeriodEnd: string,
        previousPeriodStart: string,
        previousPeriodEnd: string
    ): Promise<{
        currentPeriod: ProfitLossSummary;
        previousPeriod: ProfitLossSummary;
        variance: {
            revenueChange: number;
            revenueChangePercent: number;
            grossProfitChange: number;
            grossProfitChangePercent: number;
            netIncomeChange: number;
            netIncomeChangePercent: number;
        };
    }> {
        const [currentReport, previousReport] = await Promise.all([
            this.getProfitLossReport(currentPeriodStart, currentPeriodEnd),
            this.getProfitLossReport(previousPeriodStart, previousPeriodEnd),
        ]);

        const calcChange = (current: number, previous: number) => ({
            change: current - previous,
            changePercent: previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : 0,
        });

        const revenueVar = calcChange(
            currentReport.summary.totalRevenue,
            previousReport.summary.totalRevenue
        );
        const grossProfitVar = calcChange(
            currentReport.summary.grossProfit,
            previousReport.summary.grossProfit
        );
        const netIncomeVar = calcChange(
            currentReport.summary.netIncome,
            previousReport.summary.netIncome
        );

        return {
            currentPeriod: currentReport.summary,
            previousPeriod: previousReport.summary,
            variance: {
                revenueChange: revenueVar.change,
                revenueChangePercent: revenueVar.changePercent,
                grossProfitChange: grossProfitVar.change,
                grossProfitChangePercent: grossProfitVar.changePercent,
                netIncomeChange: netIncomeVar.change,
                netIncomeChangePercent: netIncomeVar.changePercent,
            },
        };
    }
}

// Export singleton factory
let plReportServiceInstance: ProfitLossReportService | null = null;

export function getProfitLossReportService(pool: Pool): ProfitLossReportService {
    return new ProfitLossReportService(pool);
}
