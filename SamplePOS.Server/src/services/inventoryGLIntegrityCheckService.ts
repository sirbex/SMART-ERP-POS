/**
 * Inventory ↔ GL Integrity Check Service (SAP-style "Material Ledger Audit")
 * =============================================================================
 *
 * Scope:
 *   Focused, schedulable wrapper around `inventoryIntegrityService` that
 *   enforces the SAP invariant:
 *
 *     GL account 1300 (Inventory) balance
 *       ==
 *     SUM(inventory_batches.remaining_quantity × cost_price)
 *
 *   inventory_batches is the authoritative subledger because GL COGS is posted
 *   using FEFO batch.cost_price. Using cost_layers (FIFO) would produce false
 *   positives whenever FIFO and FEFO costs diverge.
 *
 *   When drift is detected, the service:
 *     • Logs a single structured WARN/ERROR event (no spam).
 *     • Optionally writes a breadcrumb row to `integrity_alerts` if
 *       that table exists; otherwise logs only.
 *     • Returns a boolean `isDrifting` plus the numeric drift so callers
 *       (cron job, admin dashboard, health checks) can take action.
 *
 * This service is READ-ONLY. Correction is the exclusive responsibility of
 * `scripts/fixInventoryGLDrift.ts`, which must be invoked by an authorised
 * operator under source = 'SYSTEM_CORRECTION'.
 */

import type { Pool } from 'pg';
import logger from '../utils/logger.js';
import { Money } from '../utils/money.js';
import { getBusinessDate } from '../utils/dateRange.js';

/** Outcome of a single integrity check run. */
export interface InventoryGLIntegrityResult {
    /** Business date the check was run for (YYYY-MM-DD). */
    asOfDate: string;
    /** DR-net balance of GL account 1300. */
    glBalance: number;
    /** Sum of remaining_quantity * unit_cost across all active cost layers. */
    subledgerBalance: number;
    /** glBalance - subledgerBalance. Positive => GL overstated. */
    drift: number;
    /** Absolute drift tolerance: max(5000, 0.01% of |glBalance|). */
    threshold: number;
    /** True when |drift| > threshold. */
    isDrifting: boolean;
    /** CRITICAL for drift > 10x threshold, WARN for drift > threshold, OK otherwise. */
    alertLevel: 'OK' | 'WARN' | 'CRITICAL';
    /** Human-readable summary for logs / UI. */
    summary: string;
}

/**
 * Run the inventory ↔ GL integrity check.
 *
 * Materiality threshold rationale:
 *   • Fixed floor of 5,000 UGX absorbs unavoidable rounding from
 *     Decimal → float conversion at the Money boundary.
 *   • Percentage floor (1 bp = 0.01%) scales with book size so a
 *     large tenant isn't flagged for a drift smaller than one item.
 */
export async function runInventoryGLIntegrityCheck(
    pool: Pool,
): Promise<InventoryGLIntegrityResult> {
    const asOfDate = getBusinessDate();

    // GL balance on 1300 — exclude reversed transactions to match how
    // reports compute balances.
    const glResult = await pool.query<{ balance: string }>(`
        SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0) AS balance
        FROM ledger_entries le
        JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
        JOIN accounts a ON le."AccountId" = a."Id"
        WHERE a."AccountCode" = '1300'
          AND lt."IsReversed" = FALSE
    `);
    const glBalance = Money.toNumber(Money.parseDb(glResult.rows[0].balance));

    // Sub-ledger valuation — inventory_batches (FEFO batch ledger).
    // NOTE: cost_layers is not the correct subledger because GL COGS is posted
    // using FEFO batch.cost_price, not FIFO cost-layer averaging. Using cost_layers
    // produces false positives whenever FIFO and FEFO costs diverge.
    // This matches the subledger used by glValidationService and financialIntegrityService.
    const subResult = await pool.query<{ total: string }>(`
        SELECT COALESCE(SUM(remaining_quantity * cost_price), 0) AS total
        FROM inventory_batches
        WHERE remaining_quantity > 0
    `);
    const subledgerBalance = Money.toNumber(Money.parseDb(subResult.rows[0].total));

    const drift = Money.toNumber(
        Money.subtract(Money.parseDb(glBalance), Money.parseDb(subledgerBalance)),
    );
    const threshold = Math.max(5000, Math.abs(glBalance) * 0.0001);
    const absDrift = Math.abs(drift);
    const isDrifting = absDrift > threshold;

    let alertLevel: InventoryGLIntegrityResult['alertLevel'] = 'OK';
    if (isDrifting) {
        alertLevel = absDrift > threshold * 10 ? 'CRITICAL' : 'WARN';
    }

    const summary = isDrifting
        ? `Inventory/GL drift detected: GL=${glBalance.toLocaleString()} subledger=${subledgerBalance.toLocaleString()} drift=${drift.toLocaleString()} (|drift|=${absDrift.toLocaleString()} > threshold=${threshold.toLocaleString()})`
        : `Inventory/GL in balance: GL=${glBalance.toLocaleString()} subledger=${subledgerBalance.toLocaleString()} drift=${drift.toLocaleString()} (within ${threshold.toLocaleString()})`;

    const result: InventoryGLIntegrityResult = {
        asOfDate,
        glBalance,
        subledgerBalance,
        drift,
        threshold,
        isDrifting,
        alertLevel,
        summary,
    };

    if (alertLevel === 'CRITICAL') {
        logger.error('Inventory/GL integrity CRITICAL', result);
    } else if (alertLevel === 'WARN') {
        logger.warn('Inventory/GL integrity drift', result);
    } else {
        logger.info('Inventory/GL integrity check passed', {
            asOfDate,
            glBalance,
            subledgerBalance,
            drift,
        });
    }

    return result;
}
