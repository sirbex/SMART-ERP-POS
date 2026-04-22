/**
 * FINANCIAL STATEMENT INTEGRITY SERVICE
 *
 * Provides date-scoped drift detection for Balance Sheet, Income Statement and Cash Flow.
 * Every financial statement response MUST attach an `integrity` block so users
 * immediately see whether the numbers are trustworthy.
 *
 * Design principles (SAP / Odoo parity):
 *  - GL is the single source of truth (ledger_entries + accounts).
 *  - Sub-ledgers (customers, suppliers, cost_layers) are reconciled against GL.
 *  - Tolerances use materiality (max(5000, |GL| × 0.0001)) — matches
 *    `inventoryIntegrityService` and `gl_period_balances` policy.
 *  - Every check returns PASS / WARN / FAIL with a human-readable message.
 *  - FAIL = material drift. WARN = below-threshold noise. PASS = clean.
 *  - Report status = worst check status.
 */

import type pg from 'pg';
import Decimal from 'decimal.js';
import { pool as globalPool } from '../db/pool.js';

export type IntegrityCheckStatus = 'PASS' | 'WARN' | 'FAIL';
export type IntegrityOverallStatus = 'HEALTHY' | 'WARNING' | 'DRIFT_DETECTED';

export interface IntegrityCheck {
  id: string;
  name: string;
  status: IntegrityCheckStatus;
  message: string;
  glBalance?: number;
  subledgerBalance?: number;
  difference?: number;
  threshold?: number;
  remediation?: string;
}

export interface IntegrityBlock {
  overallStatus: IntegrityOverallStatus;
  checkedAt: string;
  checks: IntegrityCheck[];
  summary: {
    totalChecks: number;
    passed: number;
    warnings: number;
    failed: number;
  };
}

// ── Materiality helpers ───────────────────────────────────────────────────────
function materialityThreshold(glBalance: Decimal | number): number {
  const gl = new Decimal(glBalance).abs();
  const pct = gl.times(0.0001);
  return pct.greaterThan(5000) ? pct.toDecimalPlaces(2).toNumber() : 5000;
}

function classifyDifference(difference: Decimal | number, threshold: number): IntegrityCheckStatus {
  const diff = new Decimal(difference).abs();
  if (diff.lessThan(0.01)) return 'PASS';
  if (diff.lessThanOrEqualTo(threshold)) return 'WARN';
  return 'FAIL';
}

function worstStatus(checks: IntegrityCheck[]): IntegrityOverallStatus {
  if (checks.some((c) => c.status === 'FAIL')) return 'DRIFT_DETECTED';
  if (checks.some((c) => c.status === 'WARN')) return 'WARNING';
  return 'HEALTHY';
}

function summarize(checks: IntegrityCheck[]): IntegrityBlock['summary'] {
  return {
    totalChecks: checks.length,
    passed: checks.filter((c) => c.status === 'PASS').length,
    warnings: checks.filter((c) => c.status === 'WARN').length,
    failed: checks.filter((c) => c.status === 'FAIL').length,
  };
}

/**
 * SQL predicate (assumes alias `lt`) that keeps only ledger transactions
 * whose effect on GL balances is still "live" — i.e. excludes BOTH sides of
 * every reversal pair.
 *
 *   • The ORIGINAL reversed transaction has `IsReversed = TRUE` (→ excluded
 *     by the first clause).
 *   • The REVERSAL transaction has `IsReversed = FALSE` but its Id appears
 *     in another row's `ReversedByTransactionId` (→ excluded by NOT IN).
 *
 * A naive `IsReversed = FALSE` filter excludes the original but still counts
 * the reversal, producing a net double-subtraction. This constant implements
 * the correct paired-exclusion required to detect true drift.
 */
const NET_ACTIVE_TXNS = `
  lt."IsReversed" = FALSE
  AND lt."Id" NOT IN (
    SELECT "ReversedByTransactionId"
    FROM ledger_transactions
    WHERE "ReversedByTransactionId" IS NOT NULL
  )
`;

// ── Atomic checks (reused across statements) ──────────────────────────────────

async function checkAR(pool: pg.Pool): Promise<IntegrityCheck> {
  const r = await pool.query(`
    SELECT
      COALESCE((SELECT SUM(le."DebitAmount") - SUM(le."CreditAmount")
                FROM ledger_entries le
                JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
                JOIN accounts a ON le."AccountId" = a."Id"
                WHERE a."AccountCode" = '1200' AND ${NET_ACTIVE_TXNS}), 0) AS gl,
      COALESCE((SELECT SUM(balance) FROM customers), 0) AS sub
  `);
  const gl = new Decimal(r.rows[0].gl || 0);
  const sub = new Decimal(r.rows[0].sub || 0);
  const diff = gl.minus(sub);
  const threshold = materialityThreshold(gl);
  const status = classifyDifference(diff, threshold);
  return {
    id: 'ar_reconciliation',
    name: 'Accounts Receivable reconciles to GL 1200',
    status,
    message:
      status === 'PASS'
        ? `AR is fully reconciled (${gl.toFixed(2)} = customer subledger)`
        : `AR drift of ${diff.toFixed(2)} — GL ${gl.toFixed(2)} vs customers ${sub.toFixed(2)}`,
    glBalance: gl.toDecimalPlaces(2).toNumber(),
    subledgerBalance: sub.toDecimalPlaces(2).toNumber(),
    difference: diff.toDecimalPlaces(2).toNumber(),
    threshold,
    remediation:
      status === 'FAIL'
        ? 'Run customer balance reconciliation; check for invoices without GL posting'
        : undefined,
  };
}

async function checkAP(pool: pg.Pool): Promise<IntegrityCheck> {
  const r = await pool.query(`
    SELECT
      COALESCE((SELECT SUM(le."CreditAmount") - SUM(le."DebitAmount")
                FROM ledger_entries le
                JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
                JOIN accounts a ON le."AccountId" = a."Id"
                WHERE a."AccountCode" = '2100' AND ${NET_ACTIVE_TXNS}), 0) AS gl,
      COALESCE((SELECT SUM("OutstandingBalance") FROM suppliers WHERE "IsActive" = true), 0) AS sub
  `);
  const gl = new Decimal(r.rows[0].gl || 0);
  const sub = new Decimal(r.rows[0].sub || 0);
  const diff = gl.minus(sub);
  const threshold = materialityThreshold(gl);
  const status = classifyDifference(diff, threshold);
  return {
    id: 'ap_reconciliation',
    name: 'Accounts Payable reconciles to GL 2100',
    status,
    message:
      status === 'PASS'
        ? `AP is fully reconciled (${gl.toFixed(2)} = supplier subledger)`
        : `AP drift of ${diff.toFixed(2)} — GL ${gl.toFixed(2)} vs suppliers ${sub.toFixed(2)}`,
    glBalance: gl.toDecimalPlaces(2).toNumber(),
    subledgerBalance: sub.toDecimalPlaces(2).toNumber(),
    difference: diff.toDecimalPlaces(2).toNumber(),
    threshold,
    remediation:
      status === 'FAIL'
        ? 'Check for goods receipts without GL posting; run repostMissingGL'
        : undefined,
  };
}

async function checkInventory(pool: pg.Pool): Promise<IntegrityCheck> {
  const r = await pool.query(`
    SELECT
      COALESCE((SELECT SUM(le."DebitAmount") - SUM(le."CreditAmount")
                FROM ledger_entries le
                JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
                JOIN accounts a ON le."AccountId" = a."Id"
                WHERE a."AccountCode" = '1300' AND ${NET_ACTIVE_TXNS}), 0) AS gl,
      COALESCE((SELECT SUM(pi.quantity_on_hand * COALESCE(pv.average_cost, 0))
                FROM product_inventory pi
                LEFT JOIN product_valuation pv ON pv.product_id = pi.product_id
                WHERE pi.quantity_on_hand > 0), 0) AS sub
  `);
  const gl = new Decimal(r.rows[0].gl || 0);
  const sub = new Decimal(r.rows[0].sub || 0);
  const diff = gl.minus(sub);
  const threshold = materialityThreshold(gl);
  const status = classifyDifference(diff, threshold);
  return {
    id: 'inventory_reconciliation',
    name: 'Inventory reconciles to GL 1300',
    status,
    message:
      status === 'PASS'
        ? `Inventory is fully reconciled (${gl.toFixed(2)} = subledger)`
        : `Inventory drift of ${diff.toFixed(2)} — GL ${gl.toFixed(2)} vs subledger ${sub.toFixed(2)}`,
    glBalance: gl.toDecimalPlaces(2).toNumber(),
    subledgerBalance: sub.toDecimalPlaces(2).toNumber(),
    difference: diff.toDecimalPlaces(2).toNumber(),
    threshold,
    remediation:
      status === 'FAIL'
        ? 'Run inventory integrity check; look for stock movements without GL, cost layers created directly, or historical corrections'
        : undefined,
  };
}

async function checkCash(pool: pg.Pool): Promise<IntegrityCheck> {
  // Cash GL should never be negative (business invariant).
  const r = await pool.query(`
    SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0) AS gl
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" IN ('1010','1020','1030') AND ${NET_ACTIVE_TXNS}
  `);
  const gl = new Decimal(r.rows[0].gl || 0);
  const status: IntegrityCheckStatus = gl.greaterThanOrEqualTo(0) ? 'PASS' : 'FAIL';
  return {
    id: 'cash_non_negative',
    name: 'Cash accounts (1010/1020/1030) are non-negative',
    status,
    message:
      status === 'PASS'
        ? `Cash balance ${gl.toFixed(2)} is non-negative`
        : `NEGATIVE cash balance ${gl.toFixed(2)} — possible missing deposit GL`,
    glBalance: gl.toDecimalPlaces(2).toNumber(),
    remediation: status === 'FAIL' ? 'Review cash deposits and reversing entries' : undefined,
  };
}

async function checkUnbalancedEntries(
  pool: pg.Pool,
  fromDate: string | null,
  toDate: string | null
): Promise<IntegrityCheck> {
  // Optional date range filter (null = all time)
  const filters: string[] = ['lt."IsReversed" = FALSE'];
  const params: unknown[] = [];
  if (fromDate) {
    params.push(fromDate);
    filters.push(`lt."TransactionDate" >= $${params.length}`);
  }
  if (toDate) {
    params.push(toDate + ' 23:59:59');
    filters.push(`lt."TransactionDate" <= $${params.length}`);
  }
  const whereClause = filters.join(' AND ');

  const r = await pool.query(
    `
    SELECT COUNT(*)::int AS count FROM (
      SELECT lt."Id"
      FROM ledger_transactions lt
      JOIN ledger_entries le ON le."TransactionId" = lt."Id"
      WHERE ${whereClause}
      GROUP BY lt."Id"
      HAVING ABS(SUM(le."DebitAmount") - SUM(le."CreditAmount")) > 0.01
    ) sub
  `,
    params
  );
  const count = parseInt(r.rows[0]?.count || '0', 10);
  const status: IntegrityCheckStatus = count === 0 ? 'PASS' : 'FAIL';
  return {
    id: 'double_entry_balanced',
    name: 'All journal entries are balanced (Debits = Credits)',
    status,
    message:
      status === 'PASS'
        ? 'Every journal entry has DR = CR within 0.01'
        : `${count} unbalanced journal entr${count === 1 ? 'y' : 'ies'} found — DATA CORRUPTION`,
    remediation: status === 'FAIL' ? 'Contact support. Do NOT post new entries until resolved.' : undefined,
  };
}

async function checkCreditSalesWithoutGL(
  pool: pg.Pool,
  fromDate: string | null,
  toDate: string | null
): Promise<IntegrityCheck> {
  const filters: string[] = [
    `s.payment_method = 'CREDIT'`,
    `NOT EXISTS (
       SELECT 1 FROM ledger_transactions lt
       WHERE lt."ReferenceType" = 'SALE'
         AND lt."ReferenceId" = s.id
         AND lt."IsReversed" = FALSE)`,
  ];
  const params: unknown[] = [];
  if (fromDate) {
    params.push(fromDate);
    filters.push(`s.sale_date >= $${params.length}`);
  }
  if (toDate) {
    params.push(toDate);
    filters.push(`s.sale_date <= $${params.length}`);
  }
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count FROM sales s WHERE ${filters.join(' AND ')}`,
    params
  );
  const count = parseInt(r.rows[0]?.count || '0', 10);
  const status: IntegrityCheckStatus = count === 0 ? 'PASS' : 'FAIL';
  return {
    id: 'credit_sales_with_gl',
    name: 'Every credit sale has a GL posting',
    status,
    message:
      status === 'PASS'
        ? 'All credit sales are posted to GL'
        : `${count} credit sale${count === 1 ? '' : 's'} without GL posting — revenue understated`,
    remediation: status === 'FAIL' ? 'Run /api/accounting/repost-missing-gl' : undefined,
  };
}

async function checkPaymentsWithoutGL(
  pool: pg.Pool,
  fromDate: string | null,
  toDate: string | null
): Promise<IntegrityCheck> {
  const filters: string[] = [
    `NOT EXISTS (
       SELECT 1 FROM ledger_transactions lt
       WHERE lt."ReferenceType" = 'CUSTOMER_PAYMENT'
         AND lt."ReferenceId" = cp."Id"
         AND lt."IsReversed" = FALSE)`,
  ];
  const params: unknown[] = [];
  if (fromDate) {
    params.push(fromDate);
    filters.push(`cp."PaymentDate" >= $${params.length}`);
  }
  if (toDate) {
    params.push(toDate);
    filters.push(`cp."PaymentDate" <= $${params.length}`);
  }
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count FROM customer_payments cp WHERE ${filters.join(' AND ')}`,
    params
  );
  const count = parseInt(r.rows[0]?.count || '0', 10);
  const status: IntegrityCheckStatus = count === 0 ? 'PASS' : 'FAIL';
  return {
    id: 'payments_with_gl',
    name: 'Every customer payment has a GL posting',
    status,
    message:
      status === 'PASS'
        ? 'All customer payments are posted to GL'
        : `${count} payment${count === 1 ? '' : 's'} without GL — cash overstated vs AR`,
    remediation: status === 'FAIL' ? 'Run /api/accounting/repost-missing-gl' : undefined,
  };
}

async function checkAccountingEquation(
  pool: pg.Pool,
  asOfDate: string
): Promise<IntegrityCheck> {
  const r = await pool.query(
    `
    SELECT a."AccountType",
           COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0) AS raw_balance
    FROM accounts a
    LEFT JOIN ledger_entries le ON le."AccountId" = a."Id"
    LEFT JOIN ledger_transactions lt ON lt."Id" = le."TransactionId" AND (${NET_ACTIVE_TXNS})
    WHERE a."IsActive" = true
      AND a."IsPostingAccount" = true
      AND (lt."TransactionDate" IS NULL OR lt."TransactionDate" <= $1)
    GROUP BY a."AccountType"
  `,
    [asOfDate + ' 23:59:59']
  );

  let assets = new Decimal(0);
  let liabilities = new Decimal(0);
  let equity = new Decimal(0);
  let revenue = new Decimal(0);
  let expenses = new Decimal(0);

  for (const row of r.rows) {
    const raw = new Decimal(row.raw_balance || 0);
    switch (row.AccountType) {
      case 'ASSET':
        assets = assets.plus(raw);
        break;
      case 'LIABILITY':
        liabilities = liabilities.plus(raw.times(-1));
        break;
      case 'EQUITY':
        equity = equity.plus(raw.times(-1));
        break;
      case 'REVENUE':
        revenue = revenue.plus(raw.times(-1));
        break;
      case 'EXPENSE':
        expenses = expenses.plus(raw);
        break;
    }
  }

  // A = L + E + (R - E_expense) (retained earnings)
  const retainedEarnings = revenue.minus(expenses);
  const lhs = assets;
  const rhs = liabilities.plus(equity).plus(retainedEarnings);
  const diff = lhs.minus(rhs);
  const threshold = materialityThreshold(lhs);
  const status = classifyDifference(diff, threshold);

  return {
    id: 'accounting_equation',
    name: 'Accounting equation holds (Assets = Liabilities + Equity + Retained)',
    status,
    message:
      status === 'PASS'
        ? `A = L + E is balanced (${lhs.toFixed(2)})`
        : `A ≠ L + E by ${diff.toFixed(2)} — Assets ${lhs.toFixed(2)} vs L+E+R ${rhs.toFixed(2)}`,
    glBalance: lhs.toDecimalPlaces(2).toNumber(),
    subledgerBalance: rhs.toDecimalPlaces(2).toNumber(),
    difference: diff.toDecimalPlaces(2).toNumber(),
    threshold,
    remediation:
      status === 'FAIL'
        ? 'Run full integrity check; look for one-sided journal entries'
        : undefined,
  };
}

async function checkCashFlowIdentity(
  pool: pg.Pool,
  startDate: string,
  endDate: string
): Promise<IntegrityCheck> {
  // Beginning cash + net cash movement in period == ending cash
  const r = await pool.query(
    `
    WITH movements AS (
      SELECT
        COALESCE(SUM(CASE WHEN le."EntryDate" < $1 THEN le."DebitAmount" - le."CreditAmount" ELSE 0 END), 0) AS opening,
        COALESCE(SUM(CASE WHEN le."EntryDate" >= $1 AND le."EntryDate" <= $2
                          THEN le."DebitAmount" - le."CreditAmount" ELSE 0 END), 0) AS period_net,
        COALESCE(SUM(CASE WHEN le."EntryDate" <= $2 THEN le."DebitAmount" - le."CreditAmount" ELSE 0 END), 0) AS closing
      FROM ledger_entries le
      JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
      JOIN accounts a ON le."AccountId" = a."Id"
      WHERE a."AccountCode" IN ('1010','1020','1030') AND ${NET_ACTIVE_TXNS}
    )
    SELECT opening, period_net, closing FROM movements
  `,
    [startDate, endDate + ' 23:59:59']
  );
  const opening = new Decimal(r.rows[0]?.opening || 0);
  const periodNet = new Decimal(r.rows[0]?.period_net || 0);
  const closing = new Decimal(r.rows[0]?.closing || 0);
  const expected = opening.plus(periodNet);
  const diff = expected.minus(closing);
  const threshold = materialityThreshold(closing);
  const status = classifyDifference(diff, threshold);
  return {
    id: 'cash_flow_identity',
    name: 'Cash flow identity (opening + net = closing)',
    status,
    message:
      status === 'PASS'
        ? `Cash flow reconciles: ${opening.toFixed(2)} + ${periodNet.toFixed(2)} = ${closing.toFixed(2)}`
        : `Cash flow drift of ${diff.toFixed(2)} — check for transactions with wrong dates`,
    glBalance: closing.toDecimalPlaces(2).toNumber(),
    difference: diff.toDecimalPlaces(2).toNumber(),
    threshold,
  };
}

// ── Public API: one entry point per financial statement ──────────────────────

export async function buildBalanceSheetIntegrity(
  pool: pg.Pool | undefined,
  asOfDate: string
): Promise<IntegrityBlock> {
  const p = pool || globalPool;
  const checks = await Promise.all([
    checkAccountingEquation(p, asOfDate),
    checkAR(p),
    checkAP(p),
    checkInventory(p),
    checkCash(p),
    checkUnbalancedEntries(p, null, asOfDate),
  ]);
  return {
    overallStatus: worstStatus(checks),
    checkedAt: new Date().toISOString(),
    checks,
    summary: summarize(checks),
  };
}

export async function buildIncomeStatementIntegrity(
  pool: pg.Pool | undefined,
  startDate: string,
  endDate: string
): Promise<IntegrityBlock> {
  const p = pool || globalPool;
  const checks = await Promise.all([
    checkUnbalancedEntries(p, startDate, endDate),
    checkCreditSalesWithoutGL(p, startDate, endDate),
    checkInventory(p), // COGS depends on inventory integrity
  ]);
  return {
    overallStatus: worstStatus(checks),
    checkedAt: new Date().toISOString(),
    checks,
    summary: summarize(checks),
  };
}

export async function buildCashFlowIntegrity(
  pool: pg.Pool | undefined,
  startDate: string,
  endDate: string
): Promise<IntegrityBlock> {
  const p = pool || globalPool;
  const checks = await Promise.all([
    checkCashFlowIdentity(p, startDate, endDate),
    checkCash(p),
    checkPaymentsWithoutGL(p, startDate, endDate),
    checkUnbalancedEntries(p, startDate, endDate),
  ]);
  return {
    overallStatus: worstStatus(checks),
    checkedAt: new Date().toISOString(),
    checks,
    summary: summarize(checks),
  };
}
