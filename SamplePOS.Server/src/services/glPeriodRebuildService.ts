/**
 * GL Period Balances — Targeted Rebuild Service
 *
 * Phase 3b: Replaces the inline incremental UPSERT in accountingCore with a
 * post-commit, idempotent, full-recompute of exactly the affected
 * (account_id, fiscal_year, fiscal_period) row from ledger_entries.
 *
 * Design goals:
 *   - No circular imports: intentionally does NOT import accountingCore or
 *     glRepairService (both of which import each other).
 *   - Non-blocking: callers use setImmediate; never throws to callers.
 *   - Idempotent: safe to run multiple times for the same row.
 *   - Locked periods: never touched.
 *
 * ROLLBACK: Set LEGACY_GL_PERIOD_WRITES=true to bypass this service and
 * revert to the inline incremental UPSERT in accountingCore.
 */

import type pg from 'pg';
import Decimal from 'decimal.js';
import logger from '../utils/logger.js';
import { LEDGER_NET_ACTIVE_SQL } from '../utils/ledgerNetActive.js';

// ============================================================================
// SINGLE-ACCOUNT-PERIOD REBUILD
// ============================================================================

/**
 * Recompute a single gl_period_balances row from ledger_entries.
 *
 * Uses absolute (replace) totals — NEVER incremental addition.
 * Uses net-active POSTED entries (excludes both legs of reversal pairs) — same as
 * balance sheet and financial integrity checks.
 *
 * @param pool        Tenant pool — caller provides the correct pool.
 * @param accountId   UUID of the account.
 * @param fiscalYear  4-digit calendar year.
 * @param fiscalPeriod Month 1–12.
 */
export async function rebuildSingleAccountPeriod(
    pool: pg.Pool,
    accountId: string,
    fiscalYear: number,
    fiscalPeriod: number,
): Promise<void> {
    // Never touch locked/closed periods — preserve audit-trail integrity.
    const lockCheck = await pool.query(
        `SELECT 1 FROM financial_periods
         WHERE period_year = $1 AND period_month = $2
           AND "Status" IN ('CLOSED', 'LOCKED')
         LIMIT 1`,
        [fiscalYear, fiscalPeriod],
    );
    if ((lockCheck.rowCount ?? 0) > 0) return;

    // Recompute totals from ledger_entries.
    // Uses TransactionDate (on ledger_transactions) to assign year/period,
    // consistent with the full rebuild in glRepairService.
    const sums = await pool.query<{ debits: string; credits: string }>(
        `SELECT
           COALESCE(SUM(le."DebitAmount"),  0) AS debits,
           COALESCE(SUM(le."CreditAmount"), 0) AS credits
         FROM ledger_entries le
         JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
         WHERE le."AccountId" = $1
           AND EXTRACT(YEAR  FROM lt."TransactionDate" AT TIME ZONE 'UTC')::INT = $2
           AND EXTRACT(MONTH FROM lt."TransactionDate" AT TIME ZONE 'UTC')::INT = $3
           AND ${LEDGER_NET_ACTIVE_SQL}`,
        [accountId, fiscalYear, fiscalPeriod],
    );

    const row = sums.rows[0];
    const d = new Decimal(row?.debits ?? '0');
    const c = new Decimal(row?.credits ?? '0');

    if (d.isZero() && c.isZero()) {
        // No entries for this period — delete orphan row (if any)
        await pool.query(
            `DELETE FROM gl_period_balances
             WHERE account_id = $1 AND fiscal_year = $2 AND fiscal_period = $3`,
            [accountId, fiscalYear, fiscalPeriod],
        );
    } else {
        // UPSERT with ABSOLUTE values — replaces incremental approach
        await pool.query(
            `INSERT INTO gl_period_balances
                 (account_id, fiscal_year, fiscal_period,
                  debit_total, credit_total, running_balance, last_updated)
             VALUES ($1, $2, $3, $4, $5, $4::numeric - $5::numeric, NOW())
             ON CONFLICT (account_id, fiscal_year, fiscal_period) DO UPDATE SET
                 debit_total     = EXCLUDED.debit_total,
                 credit_total    = EXCLUDED.credit_total,
                 running_balance = EXCLUDED.running_balance,
                 last_updated    = NOW()`,
            [accountId, fiscalYear, fiscalPeriod, d.toFixed(2), c.toFixed(2)],
        );
    }
}

// ============================================================================
// SCHEDULE HELPERS (fire-and-forget wrappers)
// ============================================================================

/**
 * Schedule post-commit rebuild jobs for a set of (accountId, year, period) tuples.
 *
 * De-duplicates the list, then fires each rebuild in the next event-loop tick
 * via setImmediate so the caller's stack unwinds first.
 * Non-blocking: errors are logged as warnings, never thrown.
 */
export function scheduleGlRebuildJobs(
    jobs: Array<{ accountId: string; fiscalYear: number; fiscalPeriod: number }>,
    pool: pg.Pool,
): void {
    if (jobs.length === 0) return;

    const seen = new Set<string>();
    const unique = jobs.filter((j) => {
        const k = `${j.accountId}|${j.fiscalYear}|${j.fiscalPeriod}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });

    setImmediate(() => {
        for (const j of unique) {
            rebuildSingleAccountPeriod(pool, j.accountId, j.fiscalYear, j.fiscalPeriod).catch(
                (e) =>
                    logger.warn('[Phase3b] gl_period_balances async rebuild failed (non-fatal)', {
                        accountId: j.accountId,
                        fiscalYear: j.fiscalYear,
                        fiscalPeriod: j.fiscalPeriod,
                        error: e instanceof Error ? e.message : String(e),
                    }),
            );
        }
    });
}

/**
 * Schedule a rebuild for all (account, year, period) tuples touched by a
 * ledger transaction.
 *
 * Used by jeApprovalService after parking a transaction as DRAFT (which removes
 * it from POSTED/REVERSED status, requiring gl_period_balances to be corrected)
 * or after approving it (which promotes it to POSTED).
 *
 * Non-blocking, non-fatal.
 */
export function scheduleGlRebuildForTransaction(pool: pg.Pool, transactionId: string): void {
    setImmediate(() => {
        pool
            .query<{ AccountId: string; year: number; period: number }>(
                `SELECT DISTINCT
                   le."AccountId",
                   EXTRACT(YEAR  FROM lt."TransactionDate" AT TIME ZONE 'UTC')::INT AS year,
                   EXTRACT(MONTH FROM lt."TransactionDate" AT TIME ZONE 'UTC')::INT AS period
                 FROM ledger_entries le
                 JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
                 WHERE le."TransactionId" = $1`,
                [transactionId],
            )
            .then((res) => {
                for (const row of res.rows) {
                    rebuildSingleAccountPeriod(pool, row.AccountId, row.year, row.period).catch(
                        (e) =>
                            logger.warn(
                                '[Phase3b] gl_period_balances async rebuild failed (non-fatal)',
                                {
                                    transactionId,
                                    accountId: row.AccountId,
                                    error: e instanceof Error ? e.message : String(e),
                                },
                            ),
                    );
                }
            })
            .catch((e) =>
                logger.warn('[Phase3b] failed to query ledger_entries for rebuild schedule', {
                    transactionId,
                    error: e instanceof Error ? e.message : String(e),
                }),
            );
    });
}
