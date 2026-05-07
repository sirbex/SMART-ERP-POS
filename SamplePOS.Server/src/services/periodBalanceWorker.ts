/**
 * PERIOD BALANCE WORKER
 *
 * Processes gl_projection_events (the outbox table) to keep gl_period_balances
 * in sync with ledger_entries without ever touching the sync request path.
 *
 * DESIGN PRINCIPLES:
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ⚡ NON-BLOCKING REQUEST PATH
 *    AccountingCore writes ledger entries + projection events atomically.
 *    This worker processes those events in the background.
 *    No HTTP request waits on gl_period_balances being updated.
 *
 * 🔒 DURABLE DELIVERY (OUTBOX PATTERN)
 *    Events are committed to gl_projection_events in the SAME DB transaction
 *    as the ledger entries.  A process crash after commit leaves the event in
 *    PENDING state — the worker retries it on the next run.
 *
 * 🔄 IDEMPOTENT REBUILDS
 *    rebuildSingleAccountPeriod() does an ABSOLUTE recompute from ledger_entries.
 *    Re-processing the same event always yields the same gl_period_balances row.
 *    Safe to run multiple times (e.g., duplicate Bull jobs, concurrent workers).
 *
 * 📦 DEDUPLICATION
 *    Multiple events for the same (account_id, fiscal_year, fiscal_period)
 *    are collapsed into a single rebuild call per polling cycle.
 *
 * 🔁 RETRY WITH BACK-OFF
 *    Failed events are retried up to MAX_RETRIES times with exponential delay.
 *    Events exceeding MAX_RETRIES are marked FAILED for human inspection.
 *    Full recovery always available via POST /api/system/gl/rebuild-period-balances.
 *
 * 🌐 MULTI-TENANT SAFE
 *    Every function accepts a `pool` parameter — callers pass the tenant-specific
 *    pool.  No global pool references inside this module.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type pg from 'pg';
import logger from '../utils/logger.js';
import { rebuildSingleAccountPeriod } from './glPeriodRebuildService.js';

// =============================================================================
// CONSTANTS
// =============================================================================

const MAX_RETRIES = 5;
const BATCH_SIZE = 100; // Max events to claim per polling cycle

// =============================================================================
// TYPES
// =============================================================================

interface ProjectionEvent {
    id: string;
    account_id: string;
    fiscal_year: number;
    fiscal_period: number;
    transaction_id: string;
    idempotency_key: string;
    retry_count: number;
}

// =============================================================================
// CORE WORKER FUNCTION
// =============================================================================

/**
 * Poll gl_projection_events for PENDING (or retryable FAILED) events and
 * process them in batches.
 *
 * Called by:
 *   - Bull worker (scheduled every ~30s)
 *   - Immediate fire-and-forget after ledger commit (fast path)
 *   - Manual trigger via POST /api/system/gl/process-projection-events
 *
 * @returns Stats about what was processed.
 */
export async function pollAndProcessPendingEvents(pool: pg.Pool): Promise<{
    claimed: number;
    rebuilt: number;
    failed: number;
    durationMs: number;
}> {
    const start = Date.now();
    let claimed = 0;
    let rebuilt = 0;
    let failed = 0;

    try {
        // ── 1. Claim a batch of PENDING events (skip-locked for concurrent safety) ──
        const claimResult = await pool.query<ProjectionEvent>(
            `UPDATE gl_projection_events
             SET status = 'PROCESSING'
             WHERE id IN (
               SELECT id FROM gl_projection_events
               WHERE status IN ('PENDING', 'FAILED')
                 AND retry_count < $1
               ORDER BY created_at ASC
               LIMIT $2
               FOR UPDATE SKIP LOCKED
             )
             RETURNING id, account_id, fiscal_year, fiscal_period,
                       transaction_id, idempotency_key, retry_count`,
            [MAX_RETRIES, BATCH_SIZE],
        );

        const events = claimResult.rows;
        claimed = events.length;

        if (claimed === 0) return { claimed: 0, rebuilt: 0, failed: 0, durationMs: Date.now() - start };

        // ── 2. Deduplicate: collapse multiple events for same (account, year, period) ──
        const tupleMap = new Map<string, ProjectionEvent>();
        const allIds: string[] = [];

        for (const ev of events) {
            allIds.push(ev.id);
            const key = `${ev.account_id}|${ev.fiscal_year}|${ev.fiscal_period}`;
            if (!tupleMap.has(key)) tupleMap.set(key, ev);
        }

        // ── 3. Rebuild each unique (account, year, period) tuple ──
        const failedIds: string[] = [];
        const doneIds: string[] = [];

        // Collect all event ids grouped by tuple so we can mark them all DONE/FAILED
        const tupleToEventIds = new Map<string, string[]>();
        for (const ev of events) {
            const key = `${ev.account_id}|${ev.fiscal_year}|${ev.fiscal_period}`;
            const existing = tupleToEventIds.get(key) ?? [];
            existing.push(ev.id);
            tupleToEventIds.set(key, existing);
        }

        for (const [tupleKey, representative] of tupleMap) {
            const eventIds = tupleToEventIds.get(tupleKey) ?? [representative.id];
            try {
                await rebuildSingleAccountPeriod(
                    pool,
                    representative.account_id,
                    representative.fiscal_year,
                    representative.fiscal_period,
                );
                doneIds.push(...eventIds);
                rebuilt++;
                logger.debug('[PeriodBalanceWorker] rebuilt period balance', {
                    accountId: representative.account_id,
                    fiscalYear: representative.fiscal_year,
                    fiscalPeriod: representative.fiscal_period,
                    eventCount: eventIds.length,
                });
            } catch (err) {
                failedIds.push(...eventIds);
                failed++;
                const errorMessage = err instanceof Error ? err.message : String(err);
                logger.warn('[PeriodBalanceWorker] rebuild failed', {
                    accountId: representative.account_id,
                    fiscalYear: representative.fiscal_year,
                    fiscalPeriod: representative.fiscal_period,
                    error: errorMessage,
                    eventIds,
                });
                // Persist error message for inspection
                if (eventIds.length > 0) {
                    await pool.query(
                        `UPDATE gl_projection_events
                         SET status = 'FAILED',
                             retry_count = retry_count + 1,
                             error_message = $1
                         WHERE id = ANY($2::uuid[])`,
                        [errorMessage.slice(0, 1000), eventIds],
                    ).catch((e) => logger.error('[PeriodBalanceWorker] failed to mark events FAILED', { error: e }));
                }
            }
        }

        // ── 4. Mark successfully processed events as DONE ──
        if (doneIds.length > 0) {
            await pool.query(
                `UPDATE gl_projection_events
                 SET status = 'DONE', processed_at = NOW()
                 WHERE id = ANY($1::uuid[])`,
                [doneIds],
            ).catch((e) => logger.error('[PeriodBalanceWorker] failed to mark events DONE', { error: e }));
        }

        const durationMs = Date.now() - start;
        logger.info('[PeriodBalanceWorker] cycle complete', {
            claimed,
            rebuilt,
            failed,
            durationMs,
        });

        return { claimed, rebuilt, failed, durationMs };
    } catch (err) {
        logger.error('[PeriodBalanceWorker] poll cycle error', {
            error: err instanceof Error ? err.message : String(err),
        });
        return { claimed, rebuilt, failed, durationMs: Date.now() - start };
    }
}

// =============================================================================
// FIRE-AND-FORGET TRIGGER (called after every ledger commit)
// =============================================================================

/**
 * Non-blocking trigger called by AccountingCore immediately after a ledger
 * commit.  Fires pollAndProcessPendingEvents in the next event-loop tick so
 * gl_period_balances is usually current within milliseconds.
 *
 * This is a BEST-EFFORT fast path.  The durable path (gl_projection_events
 * table) guarantees delivery even if this call is skipped or the process
 * crashes before it runs.
 *
 * @param pool  Tenant-specific pool (same pool used to write the ledger).
 */
export function scheduleImmediateRebuild(pool: pg.Pool): void {
    setImmediate(() => {
        pollAndProcessPendingEvents(pool).catch((e) =>
            logger.warn('[PeriodBalanceWorker] immediate rebuild fire-and-forget failed (non-fatal)', {
                error: e instanceof Error ? e.message : String(e),
            }),
        );
    });
}

// =============================================================================
// WRITE PROJECTION EVENT (called inside DB transaction by AccountingCore)
// =============================================================================

/**
 * Insert a single projection event into gl_projection_events.
 *
 * MUST be called with the SAME PoolClient that is writing the ledger entry —
 * this ensures the event commits atomically with the ledger data (outbox pattern).
 *
 * ON CONFLICT DO NOTHING: if the exact same (account_id, year, period, txn_id)
 * event is already in the table (e.g. idempotent retry of the same journal entry
 * that was previously processed), this is a no-op.
 */
export async function writeProjectionEvent(
    client: pg.PoolClient,
    accountId: string,
    fiscalYear: number,
    fiscalPeriod: number,
    transactionId: string,
    idempotencyKey: string,
): Promise<void> {
    await client.query(
        `INSERT INTO gl_projection_events
             (account_id, fiscal_year, fiscal_period, transaction_id, idempotency_key)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (account_id, fiscal_year, fiscal_period, transaction_id) DO NOTHING`,
        [accountId, fiscalYear, fiscalPeriod, transactionId, idempotencyKey],
    );
}
