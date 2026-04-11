/**
 * GL Period Balances Repository
 *
 * SAP FAGLFLEXT-style totals table queries.
 * All financial reports read from gl_period_balances instead of
 * scanning ledger_entries. This eliminates re-aggregation.
 *
 * Principle: Transactions CREATE accounting state → Reports READ accounting state.
 */

import type { Pool } from 'pg';
import { pool as globalPool } from '../db/pool.js';
import { Money } from '../utils/money.js';

// =============================================================================
// TYPES
// =============================================================================

export interface PeriodBalance {
    accountId: string;
    accountCode: string;
    accountName: string;
    accountType: string;
    normalBalance: string;
    fiscalYear: number;
    fiscalPeriod: number;
    debitTotal: number;
    creditTotal: number;
    runningBalance: number;
}

export interface TrialBalanceRow {
    accountCode: string;
    accountName: string;
    accountType: string;
    normalBalance: string;
    totalDebits: number;
    totalCredits: number;
    balance: number;
}

export interface AccountTypeSummary {
    accountType: string;
    totalDebits: number;
    totalCredits: number;
    netBalance: number;
}

// =============================================================================
// TRIAL BALANCE (reads from totals only)
// =============================================================================

/**
 * Trial Balance — replaces SUM(ledger_entries) with SUM(gl_period_balances).
 * Filters by fiscal year/period range.
 */
export async function getTrialBalance(
    asOfDate: string,
    dbPool?: Pool,
): Promise<TrialBalanceRow[]> {
    const pool = dbPool || globalPool;
    const year = parseInt(asOfDate.substring(0, 4), 10);
    const month = parseInt(asOfDate.substring(5, 7), 10);

    const result = await pool.query(
        `SELECT
            a."AccountCode"    AS "accountCode",
            a."AccountName"    AS "accountName",
            a."AccountType"    AS "accountType",
            a."NormalBalance"  AS "normalBalance",
            COALESCE(SUM(gpb.debit_total),  0) AS "totalDebits",
            COALESCE(SUM(gpb.credit_total), 0) AS "totalCredits",
            CASE WHEN a."NormalBalance" = 'DEBIT'
                THEN COALESCE(SUM(gpb.debit_total),  0) - COALESCE(SUM(gpb.credit_total), 0)
                ELSE COALESCE(SUM(gpb.credit_total), 0) - COALESCE(SUM(gpb.debit_total),  0)
            END AS "balance"
         FROM accounts a
         LEFT JOIN gl_period_balances gpb
           ON gpb.account_id = a."Id"
          AND (gpb.fiscal_year < $1 OR (gpb.fiscal_year = $1 AND gpb.fiscal_period <= $2))
         WHERE a."IsActive" = true
         GROUP BY a."AccountCode", a."AccountName", a."AccountType", a."NormalBalance"
         HAVING COALESCE(SUM(gpb.debit_total), 0) != 0
             OR COALESCE(SUM(gpb.credit_total), 0) != 0
         ORDER BY a."AccountCode"`,
        [year, month],
    );

    return result.rows.map((r) => ({
        accountCode: r.accountCode,
        accountName: r.accountName,
        accountType: r.accountType,
        normalBalance: r.normalBalance,
        totalDebits: Money.toNumber(Money.parseDb(r.totalDebits)),
        totalCredits: Money.toNumber(Money.parseDb(r.totalCredits)),
        balance: Money.toNumber(Money.parseDb(r.balance)),
    }));
}

// =============================================================================
// BALANCE SHEET (Assets, Liabilities, Equity — cumulative balances)
// =============================================================================

export async function getBalanceSheet(
    asOfDate: string,
    dbPool?: Pool,
): Promise<{
    assets: TrialBalanceRow[];
    liabilities: TrialBalanceRow[];
    equity: TrialBalanceRow[];
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
}> {
    const pool = dbPool || globalPool;
    const year = parseInt(asOfDate.substring(0, 4), 10);
    const month = parseInt(asOfDate.substring(5, 7), 10);

    const result = await pool.query(
        `SELECT
            a."AccountCode"    AS "accountCode",
            a."AccountName"    AS "accountName",
            a."AccountType"    AS "accountType",
            a."NormalBalance"  AS "normalBalance",
            COALESCE(SUM(gpb.debit_total),  0) AS "totalDebits",
            COALESCE(SUM(gpb.credit_total), 0) AS "totalCredits",
            CASE WHEN a."NormalBalance" = 'DEBIT'
                THEN COALESCE(SUM(gpb.debit_total),  0) - COALESCE(SUM(gpb.credit_total), 0)
                ELSE COALESCE(SUM(gpb.credit_total), 0) - COALESCE(SUM(gpb.debit_total),  0)
            END AS "balance"
         FROM accounts a
         LEFT JOIN gl_period_balances gpb
           ON gpb.account_id = a."Id"
          AND (gpb.fiscal_year < $1 OR (gpb.fiscal_year = $1 AND gpb.fiscal_period <= $2))
         WHERE a."IsActive" = true
           AND a."AccountType" IN ('ASSET', 'LIABILITY', 'EQUITY')
         GROUP BY a."AccountCode", a."AccountName", a."AccountType", a."NormalBalance"
         HAVING COALESCE(SUM(gpb.debit_total), 0) != 0
             OR COALESCE(SUM(gpb.credit_total), 0) != 0
         ORDER BY a."AccountCode"`,

        [year, month],
    );

    const rows: TrialBalanceRow[] = result.rows.map((r) => ({
        accountCode: r.accountCode,
        accountName: r.accountName,
        accountType: r.accountType,
        normalBalance: r.normalBalance,
        totalDebits: Money.toNumber(Money.parseDb(r.totalDebits)),
        totalCredits: Money.toNumber(Money.parseDb(r.totalCredits)),
        balance: Money.toNumber(Money.parseDb(r.balance)),
    }));

    const assets = rows.filter((r) => r.accountType === 'ASSET');
    const liabilities = rows.filter((r) => r.accountType === 'LIABILITY');
    const equity = rows.filter((r) => r.accountType === 'EQUITY');

    return {
        assets,
        liabilities,
        equity,
        totalAssets: assets.reduce((s, r) => s + r.balance, 0),
        totalLiabilities: liabilities.reduce((s, r) => s + r.balance, 0),
        totalEquity: equity.reduce((s, r) => s + r.balance, 0),
    };
}

// =============================================================================
// PROFIT & LOSS (Revenue - Expenses for a period range)
// =============================================================================

export async function getProfitAndLoss(
    startDate: string,
    endDate: string,
    dbPool?: Pool,
): Promise<{
    revenue: TrialBalanceRow[];
    expenses: TrialBalanceRow[];
    totalRevenue: number;
    totalExpenses: number;
    netIncome: number;
}> {
    const pool = dbPool || globalPool;
    const startYear = parseInt(startDate.substring(0, 4), 10);
    const startMonth = parseInt(startDate.substring(5, 7), 10);
    const endYear = parseInt(endDate.substring(0, 4), 10);
    const endMonth = parseInt(endDate.substring(5, 7), 10);

    const result = await pool.query(
        `SELECT
            a."AccountCode"    AS "accountCode",
            a."AccountName"    AS "accountName",
            a."AccountType"    AS "accountType",
            a."NormalBalance"  AS "normalBalance",
            COALESCE(SUM(gpb.debit_total),  0) AS "totalDebits",
            COALESCE(SUM(gpb.credit_total), 0) AS "totalCredits",
            CASE WHEN a."NormalBalance" = 'DEBIT'
                THEN COALESCE(SUM(gpb.debit_total),  0) - COALESCE(SUM(gpb.credit_total), 0)
                ELSE COALESCE(SUM(gpb.credit_total), 0) - COALESCE(SUM(gpb.debit_total),  0)
            END AS "balance"
         FROM accounts a
         JOIN gl_period_balances gpb
           ON gpb.account_id = a."Id"
          AND (gpb.fiscal_year > $1 OR (gpb.fiscal_year = $1 AND gpb.fiscal_period >= $2))
          AND (gpb.fiscal_year < $3 OR (gpb.fiscal_year = $3 AND gpb.fiscal_period <= $4))
         WHERE a."IsActive" = true
           AND a."AccountType" IN ('REVENUE', 'EXPENSE')
         GROUP BY a."AccountCode", a."AccountName", a."AccountType", a."NormalBalance"
         HAVING COALESCE(SUM(gpb.debit_total), 0) != 0
             OR COALESCE(SUM(gpb.credit_total), 0) != 0
         ORDER BY a."AccountCode"`,
        [startYear, startMonth, endYear, endMonth],
    );

    const rows: TrialBalanceRow[] = result.rows.map((r) => ({
        accountCode: r.accountCode,
        accountName: r.accountName,
        accountType: r.accountType,
        normalBalance: r.normalBalance,
        totalDebits: Money.toNumber(Money.parseDb(r.totalDebits)),
        totalCredits: Money.toNumber(Money.parseDb(r.totalCredits)),
        balance: Money.toNumber(Money.parseDb(r.balance)),
    }));

    const revenue = rows.filter((r) => r.accountType === 'REVENUE');
    const expenses = rows.filter((r) => r.accountType === 'EXPENSE');

    const totalRevenue = revenue.reduce((s, r) => s + r.balance, 0);
    const totalExpenses = expenses.reduce((s, r) => s + r.balance, 0);

    return {
        revenue,
        expenses,
        totalRevenue,
        totalExpenses,
        netIncome: totalRevenue - totalExpenses,
    };
}

// =============================================================================
// CASH FLOW (Cash/Bank account movements per period)
// =============================================================================

export async function getCashFlowSummary(
    startDate: string,
    endDate: string,
    dbPool?: Pool,
): Promise<{
    beginningBalance: number;
    periodDebits: number;
    periodCredits: number;
    netMovement: number;
    endingBalance: number;
}> {
    const pool = dbPool || globalPool;
    const startYear = parseInt(startDate.substring(0, 4), 10);
    const startMonth = parseInt(startDate.substring(5, 7), 10);
    const endYear = parseInt(endDate.substring(0, 4), 10);
    const endMonth = parseInt(endDate.substring(5, 7), 10);

    // Beginning balance: all periods BEFORE startDate
    const beginResult = await pool.query(
        `SELECT COALESCE(SUM(gpb.debit_total) - SUM(gpb.credit_total), 0) AS balance
         FROM gl_period_balances gpb
         JOIN accounts a ON a."Id" = gpb.account_id
         WHERE a."AccountCode" IN ('1010', '1020', '1030')
           AND (gpb.fiscal_year < $1 OR (gpb.fiscal_year = $1 AND gpb.fiscal_period < $2))`,
        [startYear, startMonth],
    );
    const beginningBalance = Money.toNumber(Money.parseDb(beginResult.rows[0].balance));

    // Period movements
    const periodResult = await pool.query(
        `SELECT
            COALESCE(SUM(gpb.debit_total), 0) AS "periodDebits",
            COALESCE(SUM(gpb.credit_total), 0) AS "periodCredits"
         FROM gl_period_balances gpb
         JOIN accounts a ON a."Id" = gpb.account_id
         WHERE a."AccountCode" IN ('1010', '1020', '1030')
           AND (gpb.fiscal_year > $1 OR (gpb.fiscal_year = $1 AND gpb.fiscal_period >= $2))
           AND (gpb.fiscal_year < $3 OR (gpb.fiscal_year = $3 AND gpb.fiscal_period <= $4))`,
        [startYear, startMonth, endYear, endMonth],
    );

    const periodDebits = Money.toNumber(Money.parseDb(periodResult.rows[0].periodDebits));
    const periodCredits = Money.toNumber(Money.parseDb(periodResult.rows[0].periodCredits));
    const netMovement = periodDebits - periodCredits;

    return {
        beginningBalance,
        periodDebits,
        periodCredits,
        netMovement,
        endingBalance: beginningBalance + netMovement,
    };
}

// =============================================================================
// DASHBOARD SUMMARY (fast totals for accounting dashboard)
// =============================================================================

export async function getDashboardSummary(
    fiscalYear: number,
    fiscalMonth: number,
    dbPool?: Pool,
): Promise<{
    totalDebits: number;
    totalCredits: number;
    accountCount: number;
    periodBalances: AccountTypeSummary[];
}> {
    const pool = dbPool || globalPool;

    const [totalsResult, summaryResult] = await Promise.all([
        pool.query(
            `SELECT
                COALESCE(SUM(gpb.debit_total),  0) AS "totalDebits",
                COALESCE(SUM(gpb.credit_total), 0) AS "totalCredits",
                COUNT(DISTINCT gpb.account_id)      AS "accountCount"
             FROM gl_period_balances gpb
             WHERE gpb.fiscal_year = $1 AND gpb.fiscal_period = $2`,
            [fiscalYear, fiscalMonth],
        ),
        pool.query(
            `SELECT
                a."AccountType"    AS "accountType",
                COALESCE(SUM(gpb.debit_total),  0) AS "totalDebits",
                COALESCE(SUM(gpb.credit_total), 0) AS "totalCredits",
                COALESCE(SUM(gpb.running_balance), 0) AS "netBalance"
             FROM gl_period_balances gpb
             JOIN accounts a ON a."Id" = gpb.account_id
             WHERE gpb.fiscal_year = $1 AND gpb.fiscal_period = $2
             GROUP BY a."AccountType"
             ORDER BY a."AccountType"`,
            [fiscalYear, fiscalMonth],
        ),
    ]);

    return {
        totalDebits: Money.toNumber(Money.parseDb(totalsResult.rows[0]?.totalDebits)),
        totalCredits: Money.toNumber(Money.parseDb(totalsResult.rows[0]?.totalCredits)),
        accountCount: parseInt(totalsResult.rows[0]?.accountCount || '0', 10),
        periodBalances: summaryResult.rows.map((r) => ({
            accountType: r.accountType,
            totalDebits: Money.toNumber(Money.parseDb(r.totalDebits)),
            totalCredits: Money.toNumber(Money.parseDb(r.totalCredits)),
            netBalance: Money.toNumber(Money.parseDb(r.netBalance)),
        })),
    };
}

// =============================================================================
// PERFORMANCE: Account balance at a point in time (no ledger scan)
// =============================================================================

export async function getAccountBalanceFromTotals(
    accountCode: string,
    asOfDate: string,
    dbPool?: Pool,
): Promise<{
    accountCode: string;
    accountName: string;
    accountType: string;
    normalBalance: string;
    debitTotal: number;
    creditTotal: number;
    balance: number;
} | null> {
    const pool = dbPool || globalPool;
    const year = parseInt(asOfDate.substring(0, 4), 10);
    const month = parseInt(asOfDate.substring(5, 7), 10);

    const result = await pool.query(
        `SELECT
            a."AccountCode"    AS "accountCode",
            a."AccountName"    AS "accountName",
            a."AccountType"    AS "accountType",
            a."NormalBalance"  AS "normalBalance",
            COALESCE(SUM(gpb.debit_total),  0) AS "debitTotal",
            COALESCE(SUM(gpb.credit_total), 0) AS "creditTotal",
            CASE WHEN a."NormalBalance" = 'DEBIT'
                THEN COALESCE(SUM(gpb.debit_total),  0) - COALESCE(SUM(gpb.credit_total), 0)
                ELSE COALESCE(SUM(gpb.credit_total), 0) - COALESCE(SUM(gpb.debit_total),  0)
            END AS "balance"
         FROM accounts a
         LEFT JOIN gl_period_balances gpb
           ON gpb.account_id = a."Id"
          AND (gpb.fiscal_year < $2 OR (gpb.fiscal_year = $2 AND gpb.fiscal_period <= $3))
         WHERE a."AccountCode" = $1 AND a."IsActive" = true
         GROUP BY a."AccountCode", a."AccountName", a."AccountType", a."NormalBalance"`,
        [accountCode, year, month],
    );

    if (result.rows.length === 0) return null;
    const r = result.rows[0];
    return {
        accountCode: r.accountCode,
        accountName: r.accountName,
        accountType: r.accountType,
        normalBalance: r.normalBalance,
        debitTotal: Money.toNumber(Money.parseDb(r.debitTotal)),
        creditTotal: Money.toNumber(Money.parseDb(r.creditTotal)),
        balance: Money.toNumber(Money.parseDb(r.balance)),
    };
}

// =============================================================================
// VALIDATE TRIAL BALANCE (totals-based, O(accounts) not O(entries))
// =============================================================================

export async function validateTrialBalanceFromTotals(
    asOfDate: string,
    dbPool?: Pool,
): Promise<{
    isBalanced: boolean;
    totalDebits: number;
    totalCredits: number;
    difference: number;
}> {
    const pool = dbPool || globalPool;
    const year = parseInt(asOfDate.substring(0, 4), 10);
    const month = parseInt(asOfDate.substring(5, 7), 10);

    const result = await pool.query(
        `SELECT
            COALESCE(SUM(gpb.debit_total),  0) AS "totalDebits",
            COALESCE(SUM(gpb.credit_total), 0) AS "totalCredits"
         FROM gl_period_balances gpb
         WHERE (gpb.fiscal_year < $1 OR (gpb.fiscal_year = $1 AND gpb.fiscal_period <= $2))`,
        [year, month],
    );

    const totalDebits = Money.toNumber(Money.parseDb(result.rows[0]?.totalDebits));
    const totalCredits = Money.toNumber(Money.parseDb(result.rows[0]?.totalCredits));
    const difference = Math.abs(totalDebits - totalCredits);

    return {
        isBalanced: difference < 0.01,
        totalDebits,
        totalCredits,
        difference,
    };
}

// =============================================================================
// PERIOD CLOSE: Carry forward balances (SAP period-end behavior)
// =============================================================================

/**
 * When closing a fiscal year, carry forward balance sheet account balances
 * (Assets, Liabilities, Equity) into period 0 of the next year.
 * Revenue/Expense accounts are NOT carried forward (closed to Retained Earnings).
 *
 * The carry-forward net balance is stored entirely in debit_total (positive)
 * or credit_total (negative), with running_balance = debit_total - credit_total.
 * Period 0 has no opening_balance column — the net is embedded in the totals.
 */
export async function carryForwardBalances(
    closingYear: number,
    dbPool?: Pool,
): Promise<number> {
    const pool = dbPool || globalPool;
    const nextYear = closingYear + 1;

    const result = await pool.query(
        `INSERT INTO gl_period_balances
            (account_id, fiscal_year, fiscal_period, debit_total, credit_total, running_balance, last_updated)
         SELECT
            gpb.account_id,
            $2 AS fiscal_year,
            0  AS fiscal_period,
            GREATEST(SUM(gpb.debit_total) - SUM(gpb.credit_total), 0) AS debit_total,
            GREATEST(SUM(gpb.credit_total) - SUM(gpb.debit_total), 0) AS credit_total,
            SUM(gpb.debit_total) - SUM(gpb.credit_total) AS running_balance,
            NOW()
         FROM gl_period_balances gpb
         JOIN accounts a ON a."Id" = gpb.account_id
         WHERE gpb.fiscal_year <= $1
           AND a."AccountType" IN ('ASSET', 'LIABILITY', 'EQUITY')
         GROUP BY gpb.account_id
         HAVING ABS(SUM(gpb.debit_total) - SUM(gpb.credit_total)) > 0.001
         ON CONFLICT (account_id, fiscal_year, fiscal_period) DO UPDATE SET
            debit_total     = EXCLUDED.debit_total,
            credit_total    = EXCLUDED.credit_total,
            running_balance = EXCLUDED.running_balance,
            last_updated    = NOW()`,
        [closingYear, nextYear],
    );

    return result.rowCount || 0;
}
