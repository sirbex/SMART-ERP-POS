/**
 * Inventory subledger coupling — hard invariant inside a DB transaction.
 *
 *   gap = net-active GL(1300) − SUM(batch remaining_qty × cost_price)
 *
 * Any inventory + GL workflow must leave `gap` unchanged (within tolerance).
 * Pre-existing tenant drift is allowed; new drift from a bug is not.
 */
import type { PoolClient } from 'pg';
import { BusinessError } from '../middleware/errorHandler.js';
import { LEDGER_NET_ACTIVE_SQL } from '../utils/ledgerNetActive.js';
import { Money } from '../utils/money.js';
import logger from '../utils/logger.js';

/** Max allowed change in gap within one transaction (UGX whole-currency rounding). */
export const INVENTORY_COUPLING_TOLERANCE = 1;

export interface InventoryCouplingSnapshot {
    glNet1300: number;
    batchValuation: number;
    /** glNet1300 − batchValuation */
    gap: number;
}

export async function captureInventoryCoupling(
    client: PoolClient,
): Promise<InventoryCouplingSnapshot> {
    const glRes = await client.query<{ balance: string }>(`
        SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0) AS balance
        FROM ledger_entries le
        JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
        JOIN accounts a ON le."AccountId" = a."Id"
        WHERE a."AccountCode" = '1300'
          AND ${LEDGER_NET_ACTIVE_SQL}
    `);

    const batchRes = await client.query<{ total: string }>(`
        SELECT COALESCE(SUM(remaining_quantity * cost_price), 0) AS total
        FROM inventory_batches
        WHERE remaining_quantity > 0
    `);

    const glNet1300 = Money.toNumber(Money.parseDb(glRes.rows[0].balance));
    const batchValuation = Money.toNumber(Money.parseDb(batchRes.rows[0].total));
    const gap = Money.toNumber(
        Money.subtract(Money.parseDb(glNet1300), Money.parseDb(batchValuation)),
    );

    return { glNet1300, batchValuation, gap };
}

/**
 * Batch subledger cost removed during a sale/issue — same SQL basis as {@link captureInventoryCoupling}.
 * Use for GL CR Inventory (1300) so ledger credit matches batch valuation delta exactly.
 */
export function batchValuationReduction(
    before: InventoryCouplingSnapshot,
    after: InventoryCouplingSnapshot,
): number {
    return Money.toNumber(
        Money.round(
            Money.subtract(
                Money.parseDb(before.batchValuation),
                Money.parseDb(after.batchValuation),
            ),
            2,
        ),
    );
}

/**
 * Roll back the transaction if GL 1300 and batch valuation diverged.
 */
export function assertInventoryCouplingUnchanged(
    before: InventoryCouplingSnapshot,
    after: InventoryCouplingSnapshot,
    context: string,
): void {
    const deltaGap = Math.abs(after.gap - before.gap);
    if (deltaGap <= INVENTORY_COUPLING_TOLERANCE) {
        return;
    }

    logger.error('[INVENTORY COUPLING] GL 1300 decoupled from batch subledger', {
        context,
        before,
        after,
        deltaGap,
    });

    throw new BusinessError(
        `Inventory accounting mismatch (${context}). Transaction rolled back.`,
        'ERR_INVENTORY_GL_COUPLING',
        {
            context,
            gapBefore: before.gap,
            gapAfter: after.gap,
            deltaGap,
            glBefore: before.glNet1300,
            glAfter: after.glNet1300,
            batchBefore: before.batchValuation,
            batchAfter: after.batchValuation,
        },
    );
}
