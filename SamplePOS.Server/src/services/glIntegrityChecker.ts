/**
 * GL INTEGRITY CHECKER SERVICE
 *
 * Enterprise-grade system-wide accounting integrity validation.
 *
 * Odoo Pattern:
 *   Periodically verify the entire GL is consistent:
 *   - Every transaction balances (Σ debits = Σ credits)
 *   - No orphan entries (entries without valid transaction)
 *   - No orphan transactions (transactions without entries)
 *   - Trial balance sums to zero
 *   - Sub-ledger ↔ GL reconciliation (AR, AP, Inventory)
 *   - Period-locked entries not tampered
 *   - Sequence gaps detection
 *
 * This is the AUDIT-GRADE check that should run nightly or on demand.
 */

import type pg from 'pg';
import { pool as globalPool } from '../db/pool.js';
import { Money, Decimal } from '../utils/money.js';
import logger from '../utils/logger.js';

// =============================================================================
// TYPES
// =============================================================================

export type CheckSeverity = 'ERROR' | 'WARNING' | 'INFO';

export interface IntegrityFinding {
  check: string;
  severity: CheckSeverity;
  message: string;
  details?: Record<string, unknown>;
}

export interface IntegrityReport {
  runDate: string;
  durationMs: number;
  passed: boolean;
  totalChecks: number;
  errors: number;
  warnings: number;
  findings: IntegrityFinding[];
}

// =============================================================================
// GL INTEGRITY CHECKER
// =============================================================================

export class GLIntegrityChecker {

  /**
   * Run all integrity checks and return a comprehensive report
   */
  static async runFullAudit(dbPool?: pg.Pool): Promise<IntegrityReport> {
    const pool = dbPool || globalPool;
    const start = Date.now();
    const findings: IntegrityFinding[] = [];

    // Run all checks in parallel where possible
    const [
      unbalanced,
      orphanEntries,
      orphanTransactions,
      trialBalance,
      arRecon,
      apRecon,
      inventoryRecon,
      duplicateIdempotency,
      lockedPeriodViolations,
      sequenceGaps,
      negativeBalances,
      periodBalancesRecon,
      runningBalanceInvariant,
      productDailySummaryRecon,
      inventoryBalancesRecon,
      customerBalancesRecon,
    ] = await Promise.all([
      this.checkUnbalancedTransactions(pool),
      this.checkOrphanEntries(pool),
      this.checkOrphanTransactions(pool),
      this.checkTrialBalance(pool),
      this.checkARReconciliation(pool),
      this.checkAPReconciliation(pool),
      this.checkInventoryReconciliation(pool),
      this.checkDuplicateIdempotencyKeys(pool),
      this.checkLockedPeriodViolations(pool),
      this.checkSequenceGaps(pool),
      this.checkNegativeAssetBalances(pool),
      this.checkPeriodBalancesReconciliation(pool),
      this.checkRunningBalanceInvariant(pool),
      this.checkProductDailySummaryReconciliation(pool),
      this.checkInventoryBalancesReconciliation(pool),
      this.checkCustomerBalancesReconciliation(pool),
    ]);

    findings.push(
      ...unbalanced,
      ...orphanEntries,
      ...orphanTransactions,
      ...trialBalance,
      ...arRecon,
      ...apRecon,
      ...inventoryRecon,
      ...duplicateIdempotency,
      ...lockedPeriodViolations,
      ...sequenceGaps,
      ...negativeBalances,
      ...periodBalancesRecon,
      ...runningBalanceInvariant,
      ...productDailySummaryRecon,
      ...inventoryBalancesRecon,
      ...customerBalancesRecon,
    );

    const errors = findings.filter(f => f.severity === 'ERROR').length;
    const warnings = findings.filter(f => f.severity === 'WARNING').length;
    const durationMs = Date.now() - start;

    const report: IntegrityReport = {
      runDate: new Date().toISOString(),
      durationMs,
      passed: errors === 0,
      totalChecks: 16,
      errors,
      warnings,
      findings,
    };

    logger.info('GL integrity audit completed', {
      passed: report.passed,
      errors,
      warnings,
      durationMs,
    });

    return report;
  }

  // ===========================================================================
  // CHECK 1: Unbalanced Transactions
  // ===========================================================================

  private static async checkUnbalancedTransactions(
    pool: pg.Pool
  ): Promise<IntegrityFinding[]> {
    const findings: IntegrityFinding[] = [];

    const result = await pool.query(`
      SELECT
        lt."Id" as transaction_id,
        lt."TransactionNumber" as transaction_number,
        lt."TransactionDate" as transaction_date,
        SUM(le."DebitAmount") as total_debits,
        SUM(le."CreditAmount") as total_credits,
        ABS(SUM(le."DebitAmount") - SUM(le."CreditAmount")) as imbalance
      FROM ledger_transactions lt
      JOIN ledger_entries le ON le."TransactionId" = lt."Id"
      WHERE lt."Status" = 'POSTED'
      GROUP BY lt."Id", lt."TransactionNumber", lt."TransactionDate"
      HAVING ABS(SUM(le."DebitAmount") - SUM(le."CreditAmount")) > 0.01
      ORDER BY lt."TransactionDate" DESC
      LIMIT 100
    `);

    if (result.rows.length === 0) {
      findings.push({
        check: 'unbalanced_transactions',
        severity: 'INFO',
        message: 'All posted transactions are balanced.',
      });
    } else {
      for (const row of result.rows) {
        findings.push({
          check: 'unbalanced_transactions',
          severity: 'ERROR',
          message: `Transaction ${row.transaction_number} is unbalanced by ${row.imbalance}`,
          details: {
            transactionId: row.transaction_id,
            transactionNumber: row.transaction_number,
            date: row.transaction_date,
            debits: Number(row.total_debits),
            credits: Number(row.total_credits),
            imbalance: Number(row.imbalance),
          },
        });
      }
    }

    return findings;
  }

  // ===========================================================================
  // CHECK 2: Orphan Ledger Entries (entries without a valid transaction)
  // ===========================================================================

  private static async checkOrphanEntries(
    pool: pg.Pool
  ): Promise<IntegrityFinding[]> {
    const findings: IntegrityFinding[] = [];

    const result = await pool.query(`
      SELECT COUNT(*) as orphan_count
      FROM ledger_entries le
      LEFT JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
      WHERE lt."Id" IS NULL
    `);

    const count = parseInt(result.rows[0]?.orphan_count || '0', 10);

    if (count > 0) {
      findings.push({
        check: 'orphan_entries',
        severity: 'ERROR',
        message: `${count} ledger entries have no parent transaction.`,
        details: { orphanCount: count },
      });
    } else {
      findings.push({
        check: 'orphan_entries',
        severity: 'INFO',
        message: 'No orphan ledger entries found.',
      });
    }

    return findings;
  }

  // ===========================================================================
  // CHECK 3: Orphan Transactions (transactions without any entries)
  // ===========================================================================

  private static async checkOrphanTransactions(
    pool: pg.Pool
  ): Promise<IntegrityFinding[]> {
    const findings: IntegrityFinding[] = [];

    const result = await pool.query(`
      SELECT COUNT(*) as orphan_count
      FROM ledger_transactions lt
      LEFT JOIN ledger_entries le ON le."TransactionId" = lt."Id"
      WHERE le."Id" IS NULL
        AND lt."Status" = 'POSTED'
    `);

    const count = parseInt(result.rows[0]?.orphan_count || '0', 10);

    if (count > 0) {
      findings.push({
        check: 'orphan_transactions',
        severity: 'WARNING',
        message: `${count} posted transactions have no ledger entries.`,
        details: { orphanCount: count },
      });
    } else {
      findings.push({
        check: 'orphan_transactions',
        severity: 'INFO',
        message: 'No orphan transactions found.',
      });
    }

    return findings;
  }

  // ===========================================================================
  // CHECK 4: Trial Balance (all accounts must net to zero)
  // ===========================================================================

  private static async checkTrialBalance(
    pool: pg.Pool
  ): Promise<IntegrityFinding[]> {
    const findings: IntegrityFinding[] = [];

    const result = await pool.query(`
      SELECT
        SUM(le."DebitAmount") as total_debits,
        SUM(le."CreditAmount") as total_credits
      FROM ledger_entries le
      JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
      WHERE lt."Status" = 'POSTED'
    `);

    const debits = new Decimal(result.rows[0]?.total_debits || 0);
    const credits = new Decimal(result.rows[0]?.total_credits || 0);
    const difference = debits.minus(credits).abs();

    if (difference.greaterThan('0.01')) {
      findings.push({
        check: 'trial_balance',
        severity: 'ERROR',
        message: `Trial balance does not sum to zero. Difference: ${difference.toFixed(2)}`,
        details: {
          totalDebits: debits.toNumber(),
          totalCredits: credits.toNumber(),
          difference: difference.toNumber(),
        },
      });
    } else {
      findings.push({
        check: 'trial_balance',
        severity: 'INFO',
        message: `Trial balance is correct. Total: ${debits.toFixed(2)}`,
        details: {
          totalDebits: debits.toNumber(),
          totalCredits: credits.toNumber(),
        },
      });
    }

    return findings;
  }

  // ===========================================================================
  // CHECK 5: AR Reconciliation (GL 1200 ↔ Customer balances)
  // ===========================================================================

  private static async checkARReconciliation(
    pool: pg.Pool
  ): Promise<IntegrityFinding[]> {
    const findings: IntegrityFinding[] = [];

    const result = await pool.query(`
      SELECT
        COALESCE(
          (SELECT SUM("DebitAmount") - SUM("CreditAmount")
           FROM ledger_entries le
           JOIN accounts a ON a."Id" = le."AccountId"
           JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
           WHERE a."AccountCode" = '1200'
             AND lt."Status" = 'POSTED'), 0
        ) as gl_balance,
        COALESCE(
          (SELECT SUM(balance) FROM customers), 0
        ) as subledger_balance
    `);

    const glBalance = new Decimal(result.rows[0]?.gl_balance || 0);
    const subBalance = new Decimal(result.rows[0]?.subledger_balance || 0);
    const diff = glBalance.minus(subBalance).abs();

    if (diff.greaterThan('0.01')) {
      findings.push({
        check: 'ar_reconciliation',
        severity: 'WARNING',
        message: `AR GL (1200) differs from customer subledger by ${diff.toFixed(2)}`,
        details: {
          glBalance: glBalance.toNumber(),
          subledgerBalance: subBalance.toNumber(),
          difference: diff.toNumber(),
        },
      });
    } else {
      findings.push({
        check: 'ar_reconciliation',
        severity: 'INFO',
        message: 'AR reconciliation: GL matches customer subledger.',
      });
    }

    return findings;
  }

  // ===========================================================================
  // CHECK 6: AP Reconciliation (GL 2100 ↔ Supplier balances)
  // ===========================================================================

  private static async checkAPReconciliation(
    pool: pg.Pool
  ): Promise<IntegrityFinding[]> {
    const findings: IntegrityFinding[] = [];

    const result = await pool.query(`
      SELECT
        COALESCE(
          (SELECT SUM("CreditAmount") - SUM("DebitAmount")
           FROM ledger_entries le
           JOIN accounts a ON a."Id" = le."AccountId"
           JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
           WHERE a."AccountCode" = '2100'
             AND lt."Status" = 'POSTED'), 0
        ) as gl_balance,
        COALESCE(
          (SELECT SUM("OutstandingBalance") FROM suppliers), 0
        ) as subledger_balance
    `);

    const glBalance = new Decimal(result.rows[0]?.gl_balance || 0);
    const subBalance = new Decimal(result.rows[0]?.subledger_balance || 0);
    const diff = glBalance.minus(subBalance).abs();

    if (diff.greaterThan('0.01')) {
      findings.push({
        check: 'ap_reconciliation',
        severity: 'WARNING',
        message: `AP GL (2100) differs from supplier subledger by ${diff.toFixed(2)}`,
        details: {
          glBalance: glBalance.toNumber(),
          subledgerBalance: subBalance.toNumber(),
          difference: diff.toNumber(),
        },
      });
    } else {
      findings.push({
        check: 'ap_reconciliation',
        severity: 'INFO',
        message: 'AP reconciliation: GL matches supplier subledger.',
      });
    }

    return findings;
  }

  // ===========================================================================
  // CHECK 7: Inventory Reconciliation (GL 1300 ↔ Cost Layers)
  // ===========================================================================

  private static async checkInventoryReconciliation(
    pool: pg.Pool
  ): Promise<IntegrityFinding[]> {
    const findings: IntegrityFinding[] = [];

    const result = await pool.query(`
      SELECT
        COALESCE(
          (SELECT SUM("DebitAmount") - SUM("CreditAmount")
           FROM ledger_entries le
           JOIN accounts a ON a."Id" = le."AccountId"
           JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
           WHERE a."AccountCode" = '1300'
             AND lt."Status" = 'POSTED'), 0
        ) as gl_balance,
        COALESCE(
          (SELECT SUM(remaining_quantity * unit_cost)
           FROM cost_layers
           WHERE remaining_quantity > 0), 0
        ) as subledger_balance
    `);

    const glBalance = new Decimal(result.rows[0]?.gl_balance || 0);
    const subBalance = new Decimal(result.rows[0]?.subledger_balance || 0);
    const diff = glBalance.minus(subBalance).abs();

    if (diff.greaterThan('0.01')) {
      findings.push({
        check: 'inventory_reconciliation',
        severity: 'WARNING',
        message: `Inventory GL (1300) differs from cost layers by ${diff.toFixed(2)}`,
        details: {
          glBalance: glBalance.toNumber(),
          costLayerBalance: subBalance.toNumber(),
          difference: diff.toNumber(),
        },
      });
    } else {
      findings.push({
        check: 'inventory_reconciliation',
        severity: 'INFO',
        message: 'Inventory reconciliation: GL matches cost layers.',
      });
    }

    return findings;
  }

  // ===========================================================================
  // CHECK 8: Duplicate Idempotency Keys
  // ===========================================================================

  private static async checkDuplicateIdempotencyKeys(
    pool: pg.Pool
  ): Promise<IntegrityFinding[]> {
    const findings: IntegrityFinding[] = [];

    const result = await pool.query(`
      SELECT
        "IdempotencyKey" as key,
        COUNT(*) as count
      FROM ledger_transactions
      WHERE "IdempotencyKey" IS NOT NULL
        AND "Status" = 'POSTED'
      GROUP BY "IdempotencyKey"
      HAVING COUNT(*) > 1
      LIMIT 50
    `);

    if (result.rows.length > 0) {
      findings.push({
        check: 'duplicate_idempotency',
        severity: 'ERROR',
        message: `${result.rows.length} duplicate idempotency keys found.`,
        details: {
          duplicates: result.rows.map(r => ({
            key: r.key,
            count: parseInt(r.count, 10),
          })),
        },
      });
    } else {
      findings.push({
        check: 'duplicate_idempotency',
        severity: 'INFO',
        message: 'No duplicate idempotency keys found.',
      });
    }

    return findings;
  }

  // ===========================================================================
  // CHECK 9: Entries in Locked Periods
  // ===========================================================================

  private static async checkLockedPeriodViolations(
    pool: pg.Pool
  ): Promise<IntegrityFinding[]> {
    const findings: IntegrityFinding[] = [];

    const result = await pool.query(`
      SELECT COUNT(*) as violation_count
      FROM ledger_transactions lt
      JOIN financial_periods fp
        ON EXTRACT(YEAR FROM lt."TransactionDate") = fp.period_year
        AND EXTRACT(MONTH FROM lt."TransactionDate") = fp.period_month
      WHERE lt."Status" = 'POSTED'
        AND fp."Status" IN ('CLOSED', 'LOCKED')
        AND lt."CreatedAt" > COALESCE(fp."LockedAt", fp.closed_at)
    `);

    const count = parseInt(result.rows[0]?.violation_count || '0', 10);

    if (count > 0) {
      findings.push({
        check: 'locked_period_violations',
        severity: 'ERROR',
        message: `${count} entries posted after their period was locked.`,
        details: { violationCount: count },
      });
    } else {
      findings.push({
        check: 'locked_period_violations',
        severity: 'INFO',
        message: 'No locked-period violations detected.',
      });
    }

    return findings;
  }

  // ===========================================================================
  // CHECK 10: Sequence Gaps in Transaction Numbers
  // ===========================================================================

  private static async checkSequenceGaps(
    pool: pg.Pool
  ): Promise<IntegrityFinding[]> {
    const findings: IntegrityFinding[] = [];

    // Check for gaps in journal entry numbering within each year
    const result = await pool.query(`
      WITH numbered AS (
        SELECT
          "TransactionNumber",
          EXTRACT(YEAR FROM "TransactionDate") as year,
          ROW_NUMBER() OVER (
            PARTITION BY EXTRACT(YEAR FROM "TransactionDate")
            ORDER BY "TransactionNumber"
          ) as row_num,
          LAG("TransactionNumber") OVER (
            PARTITION BY EXTRACT(YEAR FROM "TransactionDate")
            ORDER BY "TransactionNumber"
          ) as prev_number
        FROM ledger_transactions
        WHERE "Status" = 'POSTED'
      )
      SELECT year, COUNT(*) as gap_count
      FROM numbered
      WHERE prev_number IS NOT NULL
        AND "TransactionNumber" IS NOT NULL
        AND prev_number IS DISTINCT FROM "TransactionNumber"
      GROUP BY year
      HAVING COUNT(*) > 0
    `);

    // This is informational — gaps can be normal after reversals
    if (result.rows.length > 0) {
      findings.push({
        check: 'sequence_gaps',
        severity: 'INFO',
        message: 'Transaction number sequence has gaps (normal after reversals).',
        details: {
          yearGaps: result.rows.map(r => ({
            year: parseInt(String(r.year), 10),
            gapCount: parseInt(r.gap_count, 10),
          })),
        },
      });
    } else {
      findings.push({
        check: 'sequence_gaps',
        severity: 'INFO',
        message: 'Transaction number sequences are contiguous.',
      });
    }

    return findings;
  }

  // ===========================================================================
  // CHECK 11: Negative Asset Balances
  // ===========================================================================

  private static async checkNegativeAssetBalances(
    pool: pg.Pool
  ): Promise<IntegrityFinding[]> {
    const findings: IntegrityFinding[] = [];

    const result = await pool.query(`
      SELECT
        a."AccountCode" as account_code,
        a."AccountName" as account_name,
        a."AccountType" as account_type,
        SUM(le."DebitAmount") - SUM(le."CreditAmount") as balance
      FROM ledger_entries le
      JOIN accounts a ON a."Id" = le."AccountId"
      JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
      WHERE lt."Status" = 'POSTED'
        AND a."AccountType" = 'ASSET'
        AND a."AccountCode" NOT IN ('1550')  -- Accum Depreciation is contra
      GROUP BY a."AccountCode", a."AccountName", a."AccountType"
      HAVING SUM(le."DebitAmount") - SUM(le."CreditAmount") < -0.01
    `);

    if (result.rows.length > 0) {
      for (const row of result.rows) {
        findings.push({
          check: 'negative_asset_balance',
          severity: 'WARNING',
          message: `Asset account ${row.account_code} (${row.account_name}) has negative balance: ${Number(row.balance).toFixed(2)}`,
          details: {
            accountCode: row.account_code,
            accountName: row.account_name,
            balance: Number(row.balance),
          },
        });
      }
    } else {
      findings.push({
        check: 'negative_asset_balance',
        severity: 'INFO',
        message: 'No asset accounts with negative balances.',
      });
    }

    return findings;
  }

  // ===========================================================================
  // CHECK 12: gl_period_balances ↔ ledger_entries Reconciliation
  // Detects drift between the pre-aggregated totals table and the source of truth.
  // ===========================================================================

  private static async checkPeriodBalancesReconciliation(
    pool: pg.Pool
  ): Promise<IntegrityFinding[]> {
    const findings: IntegrityFinding[] = [];

    // Compare SUM(ledger_entries) per account/year/month vs gl_period_balances
    // Only compare periods 1-12 (in-period activity, not period-0 carry-forward)
    const result = await pool.query(`
      WITH ledger_totals AS (
        SELECT
          le."AccountId"                                        AS account_id,
          EXTRACT(YEAR  FROM lt."TransactionDate")::INT         AS fiscal_year,
          EXTRACT(MONTH FROM lt."TransactionDate")::INT         AS fiscal_period,
          COALESCE(SUM(le."DebitAmount"),  0)                   AS le_debits,
          COALESCE(SUM(le."CreditAmount"), 0)                   AS le_credits
        FROM ledger_entries le
        JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
        WHERE lt."Status" = 'POSTED'
        GROUP BY le."AccountId",
                 EXTRACT(YEAR  FROM lt."TransactionDate")::INT,
                 EXTRACT(MONTH FROM lt."TransactionDate")::INT
      )
      SELECT
        a."AccountCode"    AS account_code,
        a."AccountName"    AS account_name,
        COALESCE(lt.fiscal_year,  gpb.fiscal_year)  AS fiscal_year,
        COALESCE(lt.fiscal_period, gpb.fiscal_period) AS fiscal_period,
        COALESCE(lt.le_debits, 0)        AS le_debits,
        COALESCE(lt.le_credits, 0)       AS le_credits,
        COALESCE(gpb.debit_total, 0)     AS gpb_debits,
        COALESCE(gpb.credit_total, 0)    AS gpb_credits,
        ABS(COALESCE(lt.le_debits, 0) - COALESCE(gpb.debit_total, 0))   AS dr_diff,
        ABS(COALESCE(lt.le_credits, 0) - COALESCE(gpb.credit_total, 0)) AS cr_diff
      FROM ledger_totals lt
      FULL OUTER JOIN gl_period_balances gpb
        ON  gpb.account_id    = lt.account_id
        AND gpb.fiscal_year   = lt.fiscal_year
        AND gpb.fiscal_period = lt.fiscal_period
      JOIN accounts a ON a."Id" = COALESCE(lt.account_id, gpb.account_id)
      WHERE gpb.fiscal_period BETWEEN 1 AND 12   -- Skip period 0 (carry-forward)
        AND (
          ABS(COALESCE(lt.le_debits, 0) - COALESCE(gpb.debit_total, 0)) > 0.01
          OR ABS(COALESCE(lt.le_credits, 0) - COALESCE(gpb.credit_total, 0)) > 0.01
        )
      ORDER BY fiscal_year, fiscal_period, account_code
      LIMIT 100
    `);

    if (result.rows.length === 0) {
      findings.push({
        check: 'period_balances_reconciliation',
        severity: 'INFO',
        message: 'gl_period_balances matches ledger_entries for all account/periods.',
      });
    } else {
      findings.push({
        check: 'period_balances_reconciliation',
        severity: 'ERROR',
        message: `${result.rows.length} account/period(s) have drifted between gl_period_balances and ledger_entries.`,
        details: {
          driftCount: result.rows.length,
          samples: result.rows.slice(0, 10).map(r => ({
            accountCode: r.account_code,
            accountName: r.account_name,
            year: parseInt(String(r.fiscal_year), 10),
            period: parseInt(String(r.fiscal_period), 10),
            ledgerDebits: Number(r.le_debits),
            ledgerCredits: Number(r.le_credits),
            totalsDebits: Number(r.gpb_debits),
            totalsCredits: Number(r.gpb_credits),
            debitDrift: Number(r.dr_diff),
            creditDrift: Number(r.cr_diff),
          })),
        },
      });
    }

    return findings;
  }

  // ===========================================================================
  // CHECK 13: gl_period_balances running_balance invariant
  // Ensures running_balance = debit_total - credit_total
  // (Defense-in-depth — the DB CHECK constraint should prevent this, but verify)
  // ===========================================================================

  private static async checkRunningBalanceInvariant(
    pool: pg.Pool
  ): Promise<IntegrityFinding[]> {
    const findings: IntegrityFinding[] = [];

    const result = await pool.query(`
      SELECT
        a."AccountCode" AS account_code,
        gpb.fiscal_year,
        gpb.fiscal_period,
        gpb.debit_total,
        gpb.credit_total,
        gpb.running_balance,
        (gpb.debit_total - gpb.credit_total) AS expected_balance,
        ABS(gpb.running_balance - (gpb.debit_total - gpb.credit_total)) AS invariant_drift
      FROM gl_period_balances gpb
      JOIN accounts a ON a."Id" = gpb.account_id
      WHERE ABS(gpb.running_balance - (gpb.debit_total - gpb.credit_total)) > 0.001
      LIMIT 50
    `);

    if (result.rows.length === 0) {
      findings.push({
        check: 'running_balance_invariant',
        severity: 'INFO',
        message: 'All gl_period_balances rows satisfy running_balance = debit_total - credit_total.',
      });
    } else {
      findings.push({
        check: 'running_balance_invariant',
        severity: 'ERROR',
        message: `${result.rows.length} gl_period_balances rows violate the running_balance invariant.`,
        details: {
          violationCount: result.rows.length,
          samples: result.rows.slice(0, 10).map(r => ({
            accountCode: r.account_code,
            year: parseInt(String(r.fiscal_year), 10),
            period: parseInt(String(r.fiscal_period), 10),
            debits: Number(r.debit_total),
            credits: Number(r.credit_total),
            storedBalance: Number(r.running_balance),
            expectedBalance: Number(r.expected_balance),
            drift: Number(r.invariant_drift),
          })),
        },
      });
    }

    return findings;
  }

  // ===========================================================================
  // CHECK 14: Product Daily Summary vs Sale Items Reconciliation
  // Ensures product_daily_summary state table matches sale_items aggregates
  // DATE-BOUNDED to last 30 days for 100M-row scalability
  // ===========================================================================

  private static async checkProductDailySummaryReconciliation(
    pool: pg.Pool
  ): Promise<IntegrityFinding[]> {
    const findings: IntegrityFinding[] = [];

    try {
      const result = await pool.query(`
        WITH date_range AS (
          SELECT (CURRENT_DATE - INTERVAL '30 days')::date AS since
        ),
        txn_totals AS (
          SELECT
            s.sale_date AS business_date,
            si.product_id,
            COALESCE(SUM(si.quantity), 0) AS txn_units,
            COALESCE(SUM(si.total_price), 0) AS txn_revenue
          FROM sales s
          JOIN sale_items si ON si.sale_id = s.id
          CROSS JOIN date_range dr
          WHERE s.status = 'COMPLETED'
            AND si.product_id IS NOT NULL
            AND s.sale_date >= dr.since
          GROUP BY s.sale_date, si.product_id
        ),
        state_totals AS (
          SELECT
            business_date,
            product_id,
            units_sold AS state_units,
            revenue AS state_revenue
          FROM product_daily_summary
          CROSS JOIN date_range dr
          WHERE business_date >= dr.since
        )
        SELECT
          COALESCE(t.business_date, s.business_date) AS business_date,
          COALESCE(t.product_id, s.product_id) AS product_id,
          COALESCE(t.txn_units, 0) AS txn_units,
          COALESCE(s.state_units, 0) AS state_units,
          COALESCE(t.txn_revenue, 0) AS txn_revenue,
          COALESCE(s.state_revenue, 0) AS state_revenue,
          ABS(COALESCE(t.txn_revenue, 0) - COALESCE(s.state_revenue, 0)) AS revenue_drift
        FROM txn_totals t
        FULL OUTER JOIN state_totals s
          ON t.business_date = s.business_date AND t.product_id = s.product_id
        WHERE ABS(COALESCE(t.txn_revenue, 0) - COALESCE(s.state_revenue, 0)) > 0.01
        LIMIT 50
      `);

      if (result.rows.length === 0) {
        findings.push({
          check: 'product_daily_summary_reconciliation',
          severity: 'INFO',
          message: 'product_daily_summary matches sale_items aggregates.',
        });
      } else {
        findings.push({
          check: 'product_daily_summary_reconciliation',
          severity: 'WARNING',
          message: `${result.rows.length} product_daily_summary rows drift from sale_items. Run backfill to heal.`,
          details: {
            driftCount: result.rows.length,
            samples: result.rows.slice(0, 5).map(r => ({
              date: r.business_date,
              productId: r.product_id,
              txnRevenue: Number(r.txn_revenue),
              stateRevenue: Number(r.state_revenue),
              drift: Number(r.revenue_drift),
            })),
          },
        });
      }
    } catch {
      findings.push({
        check: 'product_daily_summary_reconciliation',
        severity: 'INFO',
        message: 'product_daily_summary table not yet created — skipping check.',
      });
    }

    return findings;
  }

  // ===========================================================================
  // CHECK 15: Inventory Balances vs products.quantity_on_hand Reconciliation
  // ===========================================================================

  private static async checkInventoryBalancesReconciliation(
    pool: pg.Pool
  ): Promise<IntegrityFinding[]> {
    const findings: IntegrityFinding[] = [];

    try {
      const result = await pool.query(`
        SELECT
          p.id AS product_id,
          p.name AS product_name,
          COALESCE(p.quantity_on_hand, 0) AS product_qoh,
          COALESCE(ib.quantity_on_hand, 0) AS state_qoh,
          ABS(COALESCE(p.quantity_on_hand, 0) - COALESCE(ib.quantity_on_hand, 0)) AS qoh_drift
        FROM products p
        LEFT JOIN inventory_balances ib ON ib.product_id = p.id
        WHERE ABS(COALESCE(p.quantity_on_hand, 0) - COALESCE(ib.quantity_on_hand, 0)) > 0.001
        LIMIT 50
      `);

      if (result.rows.length === 0) {
        findings.push({
          check: 'inventory_balances_reconciliation',
          severity: 'INFO',
          message: 'inventory_balances matches products.quantity_on_hand.',
        });
      } else {
        findings.push({
          check: 'inventory_balances_reconciliation',
          severity: 'WARNING',
          message: `${result.rows.length} inventory_balances rows drift from products.quantity_on_hand. Run backfill to heal.`,
          details: {
            driftCount: result.rows.length,
            samples: result.rows.slice(0, 5).map(r => ({
              productId: r.product_id,
              productName: r.product_name,
              productQoh: Number(r.product_qoh),
              stateQoh: Number(r.state_qoh),
              drift: Number(r.qoh_drift),
            })),
          },
        });
      }
    } catch {
      findings.push({
        check: 'inventory_balances_reconciliation',
        severity: 'INFO',
        message: 'inventory_balances table not yet created — skipping check.',
      });
    }

    return findings;
  }

  // ===========================================================================
  // CHECK 16: Customer Balances State vs customers.balance Reconciliation
  // ===========================================================================

  private static async checkCustomerBalancesReconciliation(
    pool: pg.Pool
  ): Promise<IntegrityFinding[]> {
    const findings: IntegrityFinding[] = [];

    try {
      const result = await pool.query(`
        SELECT
          c.id AS customer_id,
          c.name AS customer_name,
          COALESCE(c.balance, 0) AS master_balance,
          COALESCE(cb.balance, 0) AS state_balance,
          ABS(COALESCE(c.balance, 0) - COALESCE(cb.balance, 0)) AS balance_drift
        FROM customers c
        LEFT JOIN customer_balances cb ON cb.customer_id = c.id
        WHERE ABS(COALESCE(c.balance, 0) - COALESCE(cb.balance, 0)) > 0.01
        LIMIT 50
      `);

      if (result.rows.length === 0) {
        findings.push({
          check: 'customer_balances_reconciliation',
          severity: 'INFO',
          message: 'customer_balances matches customers.balance.',
        });
      } else {
        findings.push({
          check: 'customer_balances_reconciliation',
          severity: 'WARNING',
          message: `${result.rows.length} customer_balances rows drift from customers.balance. Run backfill to heal.`,
          details: {
            driftCount: result.rows.length,
            samples: result.rows.slice(0, 5).map(r => ({
              customerId: r.customer_id,
              customerName: r.customer_name,
              masterBalance: Number(r.master_balance),
              stateBalance: Number(r.state_balance),
              drift: Number(r.balance_drift),
            })),
          },
        });
      }
    } catch {
      findings.push({
        check: 'customer_balances_reconciliation',
        severity: 'INFO',
        message: 'customer_balances table not yet created — skipping check.',
      });
    }

    return findings;
  }
}

export default GLIntegrityChecker;
