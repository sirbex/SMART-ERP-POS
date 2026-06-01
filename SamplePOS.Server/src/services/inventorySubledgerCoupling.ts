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
import {
    batchValuationReduction,
    INVENTORY_COUPLING_TOLERANCE,
    type CouplingSnapshot,
} from './inventoryCouplingMath.js';

export { INVENTORY_COUPLING_TOLERANCE, batchValuationReduction } from './inventoryCouplingMath.js';
export type { CouplingSnapshot as InventoryCouplingSnapshot } from './inventoryCouplingMath.js';

export async function captureInventoryCoupling(
    client: PoolClient,
): Promise<CouplingSnapshot> {
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
 * Roll back the transaction if GL 1300 and batch valuation diverged.
 */
export function assertInventoryCouplingUnchanged(
    before: CouplingSnapshot,
    after: CouplingSnapshot,
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
