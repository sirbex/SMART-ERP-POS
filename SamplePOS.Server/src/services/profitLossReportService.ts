/**
 * Profit & Loss Report Service
 * 
 * ERP-grade P&L reporting with Clean Core principles:
 *   ✔ Single Source of Truth - All data from ledger_entries only
 *   ✔ No frontend calculations
 *   ✔ Decimal-safe aggregations via database functions
 *   ✔ Totals reconcile with Trial Balance
 */

import { Pool } from 'pg';
import Decimal from 'decimal.js';
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
     * All figures derived from ledger_entries (Single Source of Truth)
     */
    async getProfitLossReport(dateFrom: string, dateTo: string): Promise<ProfitLossReport> {
        try {
            // Get detailed P&L from database function
            const detailResult = await this.pool.query(`
                SELECT * FROM fn_get_profit_loss($1::DATE, $2::DATE)
            `, [dateFrom, dateTo]);

            // Get summary from database function
            const summaryResult = await this.pool.query(`
                SELECT * FROM fn_get_profit_loss_summary($1::DATE, $2::DATE)
            `, [dateFrom, dateTo]);

            // Parse detail rows into sections
            const revenueAccounts: ProfitLossLineItem[] = [];
            const cogsAccounts: ProfitLossLineItem[] = [];
            const expenseAccounts: ProfitLossLineItem[] = [];

            for (const row of detailResult.rows) {
                const item: ProfitLossLineItem = {
                    section: row.section,
                    accountCode: row.account_code,
                    accountName: row.account_name,
                    debitTotal: parseFloat(row.debit_total || '0'),
                    creditTotal: parseFloat(row.credit_total || '0'),
                    netAmount: parseFloat(row.net_amount || '0'),
                    displayAmount: parseFloat(row.display_amount || '0')
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

            // Parse summary
            const summaryRow = summaryResult.rows[0] || {};
            const summary: ProfitLossSummary = {
                totalRevenue: parseFloat(summaryRow.total_revenue || '0'),
                totalCogs: parseFloat(summaryRow.total_cogs || '0'),
                grossProfit: parseFloat(summaryRow.gross_profit || '0'),
                grossMarginPercent: parseFloat(summaryRow.gross_margin_percent || '0'),
                totalOperatingExpenses: parseFloat(summaryRow.total_operating_expenses || '0'),
                operatingIncome: parseFloat(summaryRow.operating_income || '0'),
                operatingMarginPercent: parseFloat(summaryRow.operating_margin_percent || '0'),
                netIncome: parseFloat(summaryRow.net_income || '0'),
                netMarginPercent: parseFloat(summaryRow.net_margin_percent || '0')
            };

            logger.info('P&L report generated', {
                dateFrom,
                dateTo,
                revenue: summary.totalRevenue,
                netIncome: summary.netIncome
            });

            return {
                periodStart: dateFrom,
                periodEnd: dateTo,
                generatedAt: new Date().toISOString(),
                revenueAccounts,
                cogsAccounts,
                expenseAccounts,
                summary
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
    async getProfitLossByCustomer(dateFrom: string, dateTo: string): Promise<CustomerProfitability[]> {
        try {
            const result = await this.pool.query(`
                SELECT * FROM fn_get_profit_loss_by_customer($1::DATE, $2::DATE)
            `, [dateFrom, dateTo]);

            const customers = result.rows.map(row => ({
                customerId: row.customer_id,
                customerName: row.customer_name,
                totalRevenue: parseFloat(row.total_revenue || '0'),
                totalCogs: parseFloat(row.total_cogs || '0'),
                grossProfit: parseFloat(row.gross_profit || '0'),
                grossMarginPercent: parseFloat(row.gross_margin_percent || '0'),
                transactionCount: parseInt(row.transaction_count || '0')
            }));

            logger.info('P&L by customer generated', {
                dateFrom,
                dateTo,
                customerCount: customers.length
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
            const result = await this.pool.query(`
                SELECT * FROM fn_get_profit_loss_by_product($1::DATE, $2::DATE)
            `, [dateFrom, dateTo]);

            const products = result.rows.map(row => ({
                productId: row.product_id,
                productName: row.product_name,
                productSku: row.product_sku || '',
                totalRevenue: parseFloat(row.total_revenue || '0'),
                totalCogs: parseFloat(row.total_cogs || '0'),
                grossProfit: parseFloat(row.gross_profit || '0'),
                grossMarginPercent: parseFloat(row.gross_margin_percent || '0'),
                quantitySold: parseFloat(row.quantity_sold || '0')
            }));

            logger.info('P&L by product generated', {
                dateFrom,
                dateTo,
                productCount: products.length
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
    async verifyProfitLossConsistency(dateFrom: string, dateTo: string): Promise<{
        isConsistent: boolean;
        plNetIncome: number;
        trialBalanceNetIncome: number;
        difference: number;
    }> {
        try {
            // Get P&L net income
            const plResult = await this.pool.query(`
                SELECT * FROM fn_get_profit_loss_summary($1::DATE, $2::DATE)
            `, [dateFrom, dateTo]);

            const plNetIncome = parseFloat(plResult.rows[0]?.net_income || '0');

            // Calculate net income from Trial Balance
            // Revenue (credits - debits) - Expenses (debits - credits)
            const tbResult = await this.pool.query(`
                SELECT 
                    COALESCE(SUM(CASE 
                        WHEN a."AccountCode" LIKE '4%' 
                        THEN le."CreditAmount" - le."DebitAmount" 
                        ELSE 0 
                    END), 0) as revenue,
                    COALESCE(SUM(CASE 
                        WHEN a."AccountCode" LIKE '5%' OR a."AccountCode" LIKE '6%' OR a."AccountType" = 'EXPENSE'
                        THEN le."DebitAmount" - le."CreditAmount" 
                        ELSE 0 
                    END), 0) as expenses
                FROM ledger_entries le
                JOIN ledger_transactions lt ON le."LedgerTransactionId" = lt."Id"
                JOIN accounts a ON le."AccountId" = a."Id"
                WHERE lt."TransactionDate"::DATE >= $1
                  AND lt."TransactionDate"::DATE <= $2
            `, [dateFrom, dateTo]);

            const revenue = parseFloat(tbResult.rows[0]?.revenue || '0');
            const expenses = parseFloat(tbResult.rows[0]?.expenses || '0');
            const trialBalanceNetIncome = new Decimal(revenue).minus(expenses).toNumber();

            const difference = new Decimal(plNetIncome).minus(trialBalanceNetIncome).toNumber();
            const isConsistent = Math.abs(difference) < 0.01;

            if (!isConsistent) {
                logger.warn('P&L consistency check failed', {
                    plNetIncome,
                    trialBalanceNetIncome,
                    difference
                });
            }

            return {
                isConsistent,
                plNetIncome,
                trialBalanceNetIncome,
                difference
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
            this.getProfitLossReport(previousPeriodStart, previousPeriodEnd)
        ]);

        const calcChange = (current: number, previous: number) => ({
            change: current - previous,
            changePercent: previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : 0
        });

        const revenueVar = calcChange(currentReport.summary.totalRevenue, previousReport.summary.totalRevenue);
        const grossProfitVar = calcChange(currentReport.summary.grossProfit, previousReport.summary.grossProfit);
        const netIncomeVar = calcChange(currentReport.summary.netIncome, previousReport.summary.netIncome);

        return {
            currentPeriod: currentReport.summary,
            previousPeriod: previousReport.summary,
            variance: {
                revenueChange: revenueVar.change,
                revenueChangePercent: revenueVar.changePercent,
                grossProfitChange: grossProfitVar.change,
                grossProfitChangePercent: grossProfitVar.changePercent,
                netIncomeChange: netIncomeVar.change,
                netIncomeChangePercent: netIncomeVar.changePercent
            }
        };
    }
}

// Export singleton factory
let plReportServiceInstance: ProfitLossReportService | null = null;

export function getProfitLossReportService(pool: Pool): ProfitLossReportService {
    if (!plReportServiceInstance) {
        plReportServiceInstance = new ProfitLossReportService(pool);
    }
    return plReportServiceInstance;
}
