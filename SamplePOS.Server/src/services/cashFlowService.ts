/**
 * IAS 7 Cash Flow Statement Service
 *
 * Core principle (IAS 7 §18, Direct Method):
 *   Cash flow is derived ONLY from GL journal entries that touch Cash/Bank accounts.
 *   Classification is determined by the OPPOSITE account's CashFlowClass field.
 *
 * Rules:
 *   - Cash/Bank accounts have CashFlowClass = NULL (they are the subject, not the classifier)
 *   - Every other posting account MUST have CashFlowClass ∈ {'operating','investing','financing'}
 *   - If a cash entry's opposite account has no CashFlowClass → thrown as a data error
 *   - Inter-cash transfers (DR Cash / CR Cash) → net $0, excluded from statement
 *   - No "OTHER" section ever exists
 *
 * Classification mapping (IAS 7):
 *   operating  → Revenue, Expenses, AR, AP, Inventory, Tax, Deposits
 *   investing  → Fixed Assets, Accumulated Depreciation, Asset Clearing
 *   financing  → Equity, Owner Capital, Retained Earnings, Loans
 */

import type pg from 'pg';
import Decimal from 'decimal.js';
import { Money } from '../utils/money.js';

// ============================================================================
// TYPES
// ============================================================================

export type CashFlowClass = 'operating' | 'investing' | 'financing';

export interface CashFlowLineItem {
    transactionId: string;
    date: string;                   // YYYY-MM-DD
    referenceNumber: string;
    description: string;
    oppositeAccountCode: string;
    oppositeAccountName: string;
    cashInflow: number;             // positive = cash received
    cashOutflow: number;            // positive = cash paid out
    net: number;                    // inflow - outflow
}

export interface CashFlowSection {
    items: CashFlowLineItem[];
    totalInflow: number;
    totalOutflow: number;
    netTotal: number;
}

export interface UnclassifiedIssue {
    transactionId: string;
    date: string;
    referenceNumber: string;
    cashAmount: number;
    oppositeAccountCode: string;
    oppositeAccountName: string;
    issue: 'MISSING_CASH_FLOW_CLASS' | 'INTER_CASH_TRANSFER';
}

export interface CashFlowStatement {
    periodStart: string;
    periodEnd: string;
    generatedAt: string;
    operating: CashFlowSection;
    investing: CashFlowSection;
    financing: CashFlowSection;
    netChangeInCash: number;
    beginningCashBalance: number;
    endingCashBalance: number;
    // Audit: any transactions that could not be classified (should be empty in production)
    unclassifiedIssues: UnclassifiedIssue[];
}

// ============================================================================
// CASH/BANK ACCOUNT CODES
// All accounts where CashFlowClass IS NULL and AccountType = 'ASSET'
// ============================================================================

const CASH_BANK_CODES = ['1010', '1012', '1015', '1020', '1030', '1040'] as const;

// ============================================================================
// CORE ALGORITHM
// ============================================================================

/**
 * Build an IAS 7-compliant cash flow statement for the given date range.
 * All classification comes from accounts.CashFlowClass — never from transaction type.
 */
export async function buildCashFlowStatement(
    pool: pg.Pool,
    startDate: string,
    endDate: string
): Promise<CashFlowStatement> {
    const [classified, unclassified, beginningBalance, endingBalance] = await Promise.all([
        fetchClassifiedCashMovements(pool, startDate, endDate),
        fetchUnclassifiedMovements(pool, startDate, endDate),
        fetchCashBalance(pool, startDate, null), // balance BEFORE period (exclusive)
        fetchCashBalance(pool, null, endDate),   // balance THROUGH end of period (inclusive)
    ]);

    const operating = buildSection(classified.filter((r) => r.section === 'operating'));
    const investing = buildSection(classified.filter((r) => r.section === 'investing'));
    const financing = buildSection(classified.filter((r) => r.section === 'financing'));

    const netChangeInCash = Money.add(
        operating.netTotal,
        investing.netTotal,
        financing.netTotal
    ).toNumber();

    return {
        periodStart: startDate,
        periodEnd: endDate,
        generatedAt: new Date().toISOString(),
        operating,
        investing,
        financing,
        netChangeInCash,
        beginningCashBalance: beginningBalance,
        endingCashBalance: endingBalance,
        unclassifiedIssues: unclassified,
    };
}

// ============================================================================
// HISTORICAL AUDIT — scan for misclassified / missing-class cash movements
// ============================================================================

/**
 * Returns all historical GL entries involving cash accounts that cannot be
 * classified because the opposite account has no CashFlowClass set.
 * An empty array means the chart of accounts is fully compliant.
 */
export async function auditCashFlowClassification(
    pool: pg.Pool,
    startDate: string,
    endDate: string
): Promise<UnclassifiedIssue[]> {
    return fetchUnclassifiedMovements(pool, startDate, endDate);
}

// ============================================================================
// SQL QUERIES
// ============================================================================

interface RawClassifiedRow {
    transaction_id: string;
    txn_date: string;
    reference_number: string;
    description: string;
    section: CashFlowClass;
    opposite_account_code: string;
    opposite_account_name: string;
    cash_inflow: string;
    cash_outflow: string;
    net_cash: string;
}

interface RawUnclassifiedRow {
    transaction_id: string;
    txn_date: string;
    reference_number: string;
    description: string;
    net_cash: string;
    opposite_account_code: string | null;
    opposite_account_name: string | null;
    issue: string;
}

async function fetchClassifiedCashMovements(
    pool: pg.Pool,
    startDate: string,
    endDate: string
): Promise<(CashFlowLineItem & { section: CashFlowClass })[]> {
    /*
     * Algorithm:
     * 1. cash_legs  — sum DebitAmount/CreditAmount for cash/bank accounts per transaction
     * 2. opp_legs   — for every non-cash account in those transactions, sum movement & note class
     * 3. dominant   — per transaction, pick the class with the largest weight (handles multi-leg)
     * 4. Final join — attach transaction metadata; exclude inter-cash transfers (no opposite non-cash)
     */
    const result = await pool.query<RawClassifiedRow>(
        `
        WITH cash_account_ids AS (
            SELECT "Id"
            FROM accounts
            WHERE "AccountCode" = ANY($1)
              AND "CashFlowClass" IS NULL
        ),
        cash_legs AS (
            SELECT
                le."TransactionId",
                SUM(le."DebitAmount")  AS cash_debit,
                SUM(le."CreditAmount") AS cash_credit
            FROM ledger_entries le
            WHERE le."AccountId" IN (SELECT "Id" FROM cash_account_ids)
            GROUP BY le."TransactionId"
        ),
        opp_legs AS (
            SELECT
                le."TransactionId",
                a."AccountCode",
                a."AccountName",
                a."CashFlowClass",
                SUM(le."DebitAmount" + le."CreditAmount") AS weight
            FROM ledger_entries le
            JOIN accounts a ON a."Id" = le."AccountId"
            WHERE le."TransactionId" IN (SELECT "TransactionId" FROM cash_legs)
              AND le."AccountId" NOT IN (SELECT "Id" FROM cash_account_ids)
              AND a."CashFlowClass" IS NOT NULL
            GROUP BY le."TransactionId", a."AccountCode", a."AccountName", a."CashFlowClass"
        ),
        dominant AS (
            SELECT DISTINCT ON ("TransactionId")
                "TransactionId",
                "CashFlowClass"  AS section,
                "AccountCode"    AS opposite_code,
                "AccountName"    AS opposite_name
            FROM opp_legs
            ORDER BY "TransactionId", weight DESC
        )
        SELECT
            lt."Id"                    AS transaction_id,
            lt."TransactionDate"::DATE AS txn_date,
            lt."ReferenceNumber"       AS reference_number,
            lt."Description"           AS description,
            dc.section,
            dc.opposite_code           AS opposite_account_code,
            dc.opposite_name           AS opposite_account_name,
            cl.cash_debit              AS cash_inflow,
            cl.cash_credit             AS cash_outflow,
            (cl.cash_debit - cl.cash_credit) AS net_cash
        FROM cash_legs cl
        JOIN dominant dc ON dc."TransactionId" = cl."TransactionId"
        JOIN ledger_transactions lt ON lt."Id" = cl."TransactionId"
        WHERE lt."TransactionDate"::DATE BETWEEN $2 AND $3
          AND lt."Status" = 'POSTED'
          AND (lt."IsReversed" IS NULL OR lt."IsReversed" = FALSE)
        ORDER BY lt."TransactionDate"::DATE, dc.section
        `,
        [CASH_BANK_CODES, startDate, endDate]
    );

    return result.rows.map((r) => ({
        transactionId: r.transaction_id,
        date: typeof r.txn_date === 'string' ? r.txn_date : (r.txn_date as Date).toISOString().slice(0, 10),
        referenceNumber: r.reference_number ?? '',
        description: r.description ?? '',
        section: r.section,
        oppositeAccountCode: r.opposite_account_code,
        oppositeAccountName: r.opposite_account_name,
        cashInflow: Money.toNumber(Money.parseDb(r.cash_inflow)),
        cashOutflow: Money.toNumber(Money.parseDb(r.cash_outflow)),
        net: Money.toNumber(Money.parseDb(r.net_cash)),
    }));
}

async function fetchUnclassifiedMovements(
    pool: pg.Pool,
    startDate: string,
    endDate: string
): Promise<UnclassifiedIssue[]> {
    const result = await pool.query<RawUnclassifiedRow>(
        `
        WITH cash_account_ids AS (
            SELECT "Id"
            FROM accounts
            WHERE "AccountCode" = ANY($1)
              AND "CashFlowClass" IS NULL
        ),
        cash_legs AS (
            SELECT
                le."TransactionId",
                SUM(le."DebitAmount" - le."CreditAmount") AS net_cash
            FROM ledger_entries le
            WHERE le."AccountId" IN (SELECT "Id" FROM cash_account_ids)
            GROUP BY le."TransactionId"
        ),
        -- Transactions where opposite account exists but has no class
        missing_class AS (
            SELECT
                cl."TransactionId",
                cl.net_cash,
                a."AccountCode"  AS opp_code,
                a."AccountName"  AS opp_name,
                'MISSING_CASH_FLOW_CLASS'::TEXT AS issue
            FROM cash_legs cl
            JOIN ledger_entries le ON le."TransactionId" = cl."TransactionId"
            JOIN accounts a ON a."Id" = le."AccountId"
            WHERE le."AccountId" NOT IN (SELECT "Id" FROM cash_account_ids)
              AND a."CashFlowClass" IS NULL
              AND NOT EXISTS (
                  SELECT 1
                  FROM ledger_entries le2
                  JOIN accounts a2 ON a2."Id" = le2."AccountId"
                  WHERE le2."TransactionId" = cl."TransactionId"
                    AND le2."AccountId" NOT IN (SELECT "Id" FROM cash_account_ids)
                    AND a2."CashFlowClass" IS NOT NULL
              )
        ),
        -- Pure inter-cash transfers (both sides are cash accounts)
        inter_cash AS (
            SELECT
                cl."TransactionId",
                cl.net_cash,
                NULL::TEXT AS opp_code,
                NULL::TEXT AS opp_name,
                'INTER_CASH_TRANSFER'::TEXT AS issue
            FROM cash_legs cl
            WHERE NOT EXISTS (
                SELECT 1
                FROM ledger_entries le
                WHERE le."TransactionId" = cl."TransactionId"
                  AND le."AccountId" NOT IN (SELECT "Id" FROM cash_account_ids)
            )
        ),
        combined AS (
            SELECT * FROM missing_class
            UNION ALL
            SELECT * FROM inter_cash
        )
        SELECT
            lt."Id"                    AS transaction_id,
            lt."TransactionDate"::DATE AS txn_date,
            lt."ReferenceNumber"       AS reference_number,
            lt."Description"           AS description,
            c.net_cash,
            c.opp_code                 AS opposite_account_code,
            c.opp_name                 AS opposite_account_name,
            c.issue
        FROM combined c
        JOIN ledger_transactions lt ON lt."Id" = c."TransactionId"
        WHERE lt."TransactionDate"::DATE BETWEEN $2 AND $3
          AND lt."Status" = 'POSTED'
        ORDER BY lt."TransactionDate"::DATE
        `,
        [CASH_BANK_CODES, startDate, endDate]
    );

    return result.rows.map((r) => ({
        transactionId: r.transaction_id,
        date: typeof r.txn_date === 'string' ? r.txn_date : (r.txn_date as Date).toISOString().slice(0, 10),
        referenceNumber: r.reference_number ?? '',
        cashAmount: Money.toNumber(Money.parseDb(r.net_cash)),
        oppositeAccountCode: r.opposite_account_code ?? '',
        oppositeAccountName: r.opposite_account_name ?? '',
        issue: r.issue as UnclassifiedIssue['issue'],
    }));
}

/**
 * Compute cash/bank balance from GL entries.
 * If endDateExclusive is provided, returns balance strictly BEFORE that date.
 * If endDateInclusive is provided, returns balance through that date.
 */
async function fetchCashBalance(
    pool: pg.Pool,
    endDateExclusive: string | null,
    endDateInclusive: string | null
): Promise<number> {
    let sql: string;
    let params: string[];

    if (endDateExclusive !== null) {
        sql = `
            SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0) AS balance
            FROM ledger_entries le
            JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
            JOIN accounts a ON a."Id" = le."AccountId"
            WHERE a."AccountCode" = ANY($1)
              AND a."CashFlowClass" IS NULL
              AND lt."TransactionDate"::DATE < $2
              AND lt."Status" = 'POSTED'
              AND (lt."IsReversed" IS NULL OR lt."IsReversed" = FALSE)
        `;
        params = [CASH_BANK_CODES as unknown as string, endDateExclusive];
    } else {
        sql = `
            SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0) AS balance
            FROM ledger_entries le
            JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
            JOIN accounts a ON a."Id" = le."AccountId"
            WHERE a."AccountCode" = ANY($1)
              AND a."CashFlowClass" IS NULL
              AND lt."TransactionDate"::DATE <= $2
              AND lt."Status" = 'POSTED'
              AND (lt."IsReversed" IS NULL OR lt."IsReversed" = FALSE)
        `;
        params = [CASH_BANK_CODES as unknown as string, endDateInclusive!];
    }

    const result = await pool.query<{ balance: string }>(sql, [CASH_BANK_CODES, params[1]]);
    return Money.toNumber(Money.parseDb(result.rows[0]?.balance ?? '0'));
}

// ============================================================================
// SECTION BUILDER
// ============================================================================

function buildSection(
    items: (CashFlowLineItem & { section: CashFlowClass })[]
): CashFlowSection {
    // Aggregate by opposite account so the statement shows one line per account,
    // not one line per transaction. e.g. all POS sales → "Sales Revenue  UGX 4,200,000"
    const byAccount = new Map<string, {
        code: string;
        name: string;
        inflow: Decimal;
        outflow: Decimal;
    }>();

    for (const item of items) {
        const key = item.oppositeAccountCode;
        const existing = byAccount.get(key);
        if (existing) {
            existing.inflow = existing.inflow.plus(item.cashInflow);
            existing.outflow = existing.outflow.plus(item.cashOutflow);
        } else {
            byAccount.set(key, {
                code: item.oppositeAccountCode,
                name: item.oppositeAccountName,
                inflow: new Decimal(item.cashInflow),
                outflow: new Decimal(item.cashOutflow),
            });
        }
    }

    let totalInflow = new Decimal(0);
    let totalOutflow = new Decimal(0);

    const lineItems: CashFlowLineItem[] = [];
    for (const agg of byAccount.values()) {
        totalInflow = totalInflow.plus(agg.inflow);
        totalOutflow = totalOutflow.plus(agg.outflow);
        lineItems.push({
            transactionId: '',            // aggregated — no single transaction
            date: '',
            referenceNumber: agg.code,
            description: agg.name,        // e.g. "Sales Revenue", "Accounts Payable"
            oppositeAccountCode: agg.code,
            oppositeAccountName: agg.name,
            cashInflow: Money.toNumber(agg.inflow),
            cashOutflow: Money.toNumber(agg.outflow),
            net: Money.toNumber(agg.inflow.minus(agg.outflow)),
        });
    }

    // Sort by account code for consistent presentation
    lineItems.sort((a, b) => a.oppositeAccountCode.localeCompare(b.oppositeAccountCode));

    return {
        items: lineItems,
        totalInflow: Money.toNumber(totalInflow),
        totalOutflow: Money.toNumber(totalOutflow),
        netTotal: Money.toNumber(totalInflow.minus(totalOutflow)),
    };
}
