/**
 * Accounting Calculation Service
 * 
 * SINGLE SOURCE OF TRUTH for all accounting calculations.
 * This service centralizes all accounting formulas and business logic.
 * 
 * Requirements:
 * ✅ Decimal-safe monetary calculations (uses Money utility)
 * ✅ No floating-point arithmetic
 * ✅ Consistent rounding strategy
 * ✅ Currency-aware calculations
 * ✅ Precision loss prevention
 * ✅ Single calculation authority
 * ✅ No duplicated business logic
 * 
 * Usage:
 *   import { AccountingCalculations } from '../services/accountingCalculations.js';
 *   
 *   const profitMargin = AccountingCalculations.grossProfitMargin(revenue, cost);
 *   const trialBalanceStatus = AccountingCalculations.validateTrialBalance(debits, credits);
 */

import { Money, Decimal } from '../utils/money.js';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export interface TrialBalanceValidation {
    isBalanced: boolean;
    totalDebits: number;
    totalCredits: number;
    difference: number;
    tolerance: number;
}

export interface ProfitAnalysis {
    grossProfit: number;
    grossProfitMargin: number;
    netProfit: number;
    netProfitMargin: number;
}

export interface CashFlowSummary {
    operatingCashFlow: number;
    investingCashFlow: number;
    financingCashFlow: number;
    netCashFlow: number;
    beginningBalance: number;
    endingBalance: number;
}

export interface AgingBucket {
    current: number;
    days30: number;
    days60: number;
    days90: number;
    over90: number;
    total: number;
}

// =============================================================================
// ACCOUNTING CALCULATIONS SERVICE
// =============================================================================

export class AccountingCalculations {

    // ===========================================================================
    // TRIAL BALANCE CALCULATIONS
    // ===========================================================================

    /**
     * Validate trial balance (debits must equal credits)
     * Uses a tolerance of 0.01 for rounding differences
     */
    static validateTrialBalance(
        totalDebits: string | number | Decimal | null | undefined,
        totalCredits: string | number | Decimal | null | undefined,
        tolerance: number = 0.01
    ): TrialBalanceValidation {
        const debits = Money.parseDb(totalDebits);
        const credits = Money.parseDb(totalCredits);
        const difference = Money.abs(Money.subtract(debits, credits));

        return {
            isBalanced: difference.lessThan(tolerance),
            totalDebits: debits.toNumber(),
            totalCredits: credits.toNumber(),
            difference: difference.toNumber(),
            tolerance
        };
    }

    /**
     * Calculate account balance based on normal balance type
     * DEBIT-normal accounts: Balance = Debits - Credits
     * CREDIT-normal accounts: Balance = Credits - Debits
     */
    static calculateAccountBalance(
        totalDebits: string | number | Decimal | null | undefined,
        totalCredits: string | number | Decimal | null | undefined,
        normalBalance: 'DEBIT' | 'CREDIT'
    ): number {
        const debits = Money.parseDb(totalDebits);
        const credits = Money.parseDb(totalCredits);

        if (normalBalance === 'DEBIT') {
            return Money.subtract(debits, credits).toNumber();
        } else {
            return Money.subtract(credits, debits).toNumber();
        }
    }

    /**
     * Calculate display balance for credit-normal accounts
     * Credit-normal accounts (Liability, Equity, Revenue) display positive when credits > debits
     */
    static calculateDisplayBalance(
        rawBalance: string | number | Decimal | null | undefined,
        accountType: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'
    ): number {
        const balance = Money.parseDb(rawBalance);
        const isCreditNormal = ['LIABILITY', 'EQUITY', 'REVENUE'].includes(accountType);

        return isCreditNormal
            ? Money.negate(balance).toNumber()
            : balance.toNumber();
    }

    // ===========================================================================
    // PROFIT CALCULATIONS
    // ===========================================================================

    /**
     * Calculate gross profit: Revenue - COGS
     */
    static grossProfit(
        revenue: string | number | Decimal | null | undefined,
        cogs: string | number | Decimal | null | undefined
    ): number {
        return Money.subtract(revenue, cogs).toNumber();
    }

    /**
     * Calculate gross profit margin: ((Revenue - COGS) / Revenue) × 100
     */
    static grossProfitMargin(
        revenue: string | number | Decimal | null | undefined,
        cogs: string | number | Decimal | null | undefined
    ): number {
        return Money.grossMargin(revenue, cogs).toNumber();
    }

    /**
     * Calculate net profit: Revenue - COGS - Operating Expenses
     */
    static netProfit(
        revenue: string | number | Decimal | null | undefined,
        cogs: string | number | Decimal | null | undefined,
        operatingExpenses: string | number | Decimal | null | undefined
    ): number {
        return Money.subtract(revenue, cogs, operatingExpenses).toNumber();
    }

    /**
     * Calculate net profit margin: (Net Profit / Revenue) × 100
     */
    static netProfitMargin(
        revenue: string | number | Decimal | null | undefined,
        netProfit: string | number | Decimal | null | undefined
    ): number {
        const revenueVal = Money.parseDb(revenue);
        if (revenueVal.isZero()) return 0;

        return Money.percentageRate(netProfit, revenue).toNumber();
    }

    /**
     * Full profit analysis from sales data
     */
    static analyzeProfitability(
        revenue: string | number | Decimal | null | undefined,
        cogs: string | number | Decimal | null | undefined,
        operatingExpenses: string | number | Decimal | null | undefined = 0
    ): ProfitAnalysis {
        const revenueVal = Money.parseDb(revenue);
        const cogsVal = Money.parseDb(cogs);
        const expensesVal = Money.parseDb(operatingExpenses);

        const grossProfitVal = Money.subtract(revenueVal, cogsVal);
        const netProfitVal = Money.subtract(grossProfitVal, expensesVal);

        return {
            grossProfit: grossProfitVal.toNumber(),
            grossProfitMargin: revenueVal.isZero() ? 0 : Money.percentageRate(grossProfitVal, revenueVal).toNumber(),
            netProfit: netProfitVal.toNumber(),
            netProfitMargin: revenueVal.isZero() ? 0 : Money.percentageRate(netProfitVal, revenueVal).toNumber()
        };
    }

    // ===========================================================================
    // CASH FLOW CALCULATIONS
    // ===========================================================================

    /**
     * Calculate net cash flow from operating, investing, and financing activities
     */
    static calculateNetCashFlow(
        operatingCashFlow: string | number | Decimal | null | undefined,
        investingCashFlow: string | number | Decimal | null | undefined,
        financingCashFlow: string | number | Decimal | null | undefined
    ): number {
        return Money.add(operatingCashFlow, investingCashFlow, financingCashFlow).toNumber();
    }

    /**
     * Calculate ending cash balance
     */
    static calculateEndingCashBalance(
        beginningBalance: string | number | Decimal | null | undefined,
        netCashFlow: string | number | Decimal | null | undefined
    ): number {
        return Money.add(beginningBalance, netCashFlow).toNumber();
    }

    /**
     * Calculate cash flow activity totals (cash in - cash out)
     */
    static calculateCashFlowActivity(
        cashIn: string | number | Decimal | null | undefined,
        cashOut: string | number | Decimal | null | undefined
    ): number {
        return Money.subtract(cashIn, cashOut).toNumber();
    }

    /**
     * Build complete cash flow summary
     */
    static buildCashFlowSummary(
        operatingIn: string | number | Decimal | null | undefined,
        operatingOut: string | number | Decimal | null | undefined,
        investingIn: string | number | Decimal | null | undefined,
        investingOut: string | number | Decimal | null | undefined,
        financingIn: string | number | Decimal | null | undefined,
        financingOut: string | number | Decimal | null | undefined,
        beginningBalance: string | number | Decimal | null | undefined
    ): CashFlowSummary {
        const operatingCashFlow = Money.subtract(operatingIn, operatingOut);
        const investingCashFlow = Money.subtract(investingIn, investingOut);
        const financingCashFlow = Money.subtract(financingIn, financingOut);
        const netCashFlow = Money.add(operatingCashFlow, investingCashFlow, financingCashFlow);
        const beginning = Money.parseDb(beginningBalance);
        const ending = Money.add(beginning, netCashFlow);

        return {
            operatingCashFlow: operatingCashFlow.toNumber(),
            investingCashFlow: investingCashFlow.toNumber(),
            financingCashFlow: financingCashFlow.toNumber(),
            netCashFlow: netCashFlow.toNumber(),
            beginningBalance: beginning.toNumber(),
            endingBalance: ending.toNumber()
        };
    }

    // ===========================================================================
    // BALANCE SHEET CALCULATIONS
    // ===========================================================================

    /**
     * Calculate accounting equation: Assets = Liabilities + Equity
     * Returns true if balanced
     */
    static validateBalanceSheet(
        totalAssets: string | number | Decimal | null | undefined,
        totalLiabilities: string | number | Decimal | null | undefined,
        totalEquity: string | number | Decimal | null | undefined,
        tolerance: number = 0.01
    ): { isBalanced: boolean; difference: number } {
        const assets = Money.parseDb(totalAssets);
        const liabilitiesAndEquity = Money.add(totalLiabilities, totalEquity);
        const difference = Money.abs(Money.subtract(assets, liabilitiesAndEquity));

        return {
            isBalanced: difference.lessThan(tolerance),
            difference: difference.toNumber()
        };
    }

    /**
     * Calculate working capital: Current Assets - Current Liabilities
     */
    static workingCapital(
        currentAssets: string | number | Decimal | null | undefined,
        currentLiabilities: string | number | Decimal | null | undefined
    ): number {
        return Money.subtract(currentAssets, currentLiabilities).toNumber();
    }

    /**
     * Calculate current ratio: Current Assets / Current Liabilities
     */
    static currentRatio(
        currentAssets: string | number | Decimal | null | undefined,
        currentLiabilities: string | number | Decimal | null | undefined
    ): number {
        const liabilities = Money.parseDb(currentLiabilities);
        if (liabilities.isZero()) return 0;

        return Money.divide(currentAssets, currentLiabilities).toNumber();
    }

    /**
     * Calculate debt-to-equity ratio: Total Liabilities / Total Equity
     */
    static debtToEquityRatio(
        totalLiabilities: string | number | Decimal | null | undefined,
        totalEquity: string | number | Decimal | null | undefined
    ): number {
        const equity = Money.parseDb(totalEquity);
        if (equity.isZero()) return 0;

        return Money.divide(totalLiabilities, totalEquity).toNumber();
    }

    // ===========================================================================
    // RECEIVABLES/PAYABLES CALCULATIONS
    // ===========================================================================

    /**
     * Calculate days sales outstanding (DSO)
     * DSO = (Accounts Receivable / Credit Sales) × Days in Period
     */
    static daysSalesOutstanding(
        accountsReceivable: string | number | Decimal | null | undefined,
        creditSales: string | number | Decimal | null | undefined,
        daysInPeriod: number = 30
    ): number {
        const sales = Money.parseDb(creditSales);
        if (sales.isZero()) return 0;

        return Money.divide(accountsReceivable, creditSales)
            .times(daysInPeriod)
            .toDecimalPlaces(1)
            .toNumber();
    }

    /**
     * Calculate days payable outstanding (DPO)
     * DPO = (Accounts Payable / COGS) × Days in Period
     */
    static daysPayableOutstanding(
        accountsPayable: string | number | Decimal | null | undefined,
        cogs: string | number | Decimal | null | undefined,
        daysInPeriod: number = 30
    ): number {
        const cogsVal = Money.parseDb(cogs);
        if (cogsVal.isZero()) return 0;

        return Money.divide(accountsPayable, cogs)
            .times(daysInPeriod)
            .toDecimalPlaces(1)
            .toNumber();
    }

    /**
     * Calculate aging bucket for receivables/payables
     */
    static calculateAgingBucket(
        currentAmount: string | number | Decimal | null | undefined,
        days30Amount: string | number | Decimal | null | undefined,
        days60Amount: string | number | Decimal | null | undefined,
        days90Amount: string | number | Decimal | null | undefined,
        over90Amount: string | number | Decimal | null | undefined
    ): AgingBucket {
        const current = Money.parseDb(currentAmount).toNumber();
        const days30 = Money.parseDb(days30Amount).toNumber();
        const days60 = Money.parseDb(days60Amount).toNumber();
        const days90 = Money.parseDb(days90Amount).toNumber();
        const over90 = Money.parseDb(over90Amount).toNumber();

        return {
            current,
            days30,
            days60,
            days90,
            over90,
            total: Money.add(currentAmount, days30Amount, days60Amount, days90Amount, over90Amount).toNumber()
        };
    }

    // ===========================================================================
    // INVOICE/PAYMENT CALCULATIONS
    // ===========================================================================

    /**
     * Calculate invoice balance: Total - Paid
     */
    static invoiceBalance(
        totalAmount: string | number | Decimal | null | undefined,
        paidAmount: string | number | Decimal | null | undefined
    ): number {
        return Money.subtract(totalAmount, paidAmount).toNumber();
    }

    /**
     * Calculate payment allocation
     * Returns array of allocations that sum to the payment amount
     */
    static allocatePayment(
        paymentAmount: string | number | Decimal | null | undefined,
        invoiceBalances: (string | number | Decimal | null | undefined)[]
    ): number[] {
        let remainingPayment = Money.parseDb(paymentAmount);
        const allocations: number[] = [];

        for (const balance of invoiceBalances) {
            const invoiceBalance = Money.parseDb(balance);

            if (remainingPayment.isZero()) {
                allocations.push(0);
                continue;
            }

            if (remainingPayment.gte(invoiceBalance)) {
                // Full payment of this invoice
                allocations.push(invoiceBalance.toNumber());
                remainingPayment = Money.subtract(remainingPayment, invoiceBalance);
            } else {
                // Partial payment
                allocations.push(remainingPayment.toNumber());
                remainingPayment = new Decimal(0);
            }
        }

        return allocations;
    }

    // ===========================================================================
    // TAX CALCULATIONS
    // ===========================================================================

    /**
     * Calculate tax amount from gross amount
     * If amount is tax-inclusive: Tax = Amount - (Amount / (1 + Rate))
     * If amount is tax-exclusive: Tax = Amount × Rate
     */
    static calculateTax(
        amount: string | number | Decimal | null | undefined,
        taxRate: string | number | Decimal | null | undefined,
        isInclusive: boolean = false
    ): number {
        const amountVal = Money.parseDb(amount);
        const rate = Money.parseDb(taxRate).dividedBy(100);

        if (isInclusive) {
            // Extract tax from inclusive amount
            const divisor = rate.plus(1);
            const netAmount = amountVal.dividedBy(divisor);
            return Money.round(Money.subtract(amountVal, netAmount)).toNumber();
        } else {
            // Calculate tax on exclusive amount
            return Money.round(amountVal.times(rate)).toNumber();
        }
    }

    /**
     * Calculate net amount from tax-inclusive amount
     */
    static calculateNetFromInclusive(
        inclusiveAmount: string | number | Decimal | null | undefined,
        taxRate: string | number | Decimal | null | undefined
    ): number {
        const amountVal = Money.parseDb(inclusiveAmount);
        const rate = Money.parseDb(taxRate).dividedBy(100);
        const divisor = rate.plus(1);

        return Money.round(amountVal.dividedBy(divisor)).toNumber();
    }

    /**
     * Calculate gross amount from net and tax rate
     */
    static calculateGrossFromNet(
        netAmount: string | number | Decimal | null | undefined,
        taxRate: string | number | Decimal | null | undefined
    ): number {
        const amountVal = Money.parseDb(netAmount);
        const rate = Money.parseDb(taxRate).dividedBy(100);

        return Money.round(amountVal.times(rate.plus(1))).toNumber();
    }
}

// Export for convenience
export default AccountingCalculations;
