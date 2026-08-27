/**
 * Multistore warehouse layer coupling — batch subledger ↔ product_lots ↔ inventory_balances.
 *
 * When is_multistore_enabled:
 *   For each product_lot linked to inventory_batches,
 *   SUM(inventory_balances.quantity_on_hand) across stores MUST equal batch.remaining_quantity.
 *
 * Any workflow that calls syncProductQuantity() after mutating stock will roll back on drift.
 */
import type { PoolClient } from 'pg';
import { BusinessError } from '../middleware/errorHandler.js';
import { isMultistoreEnabled } from '../modules/inventory/warehouse/multistoreSettings.js';
import { assertPosSellableProjectionConsistent } from '../modules/inventory/warehouse/posSellableCoverage.js';
import logger from '../utils/logger.js';

export const WAREHOUSE_LAYER_TOLERANCE = 0.001;

export interface LotLayerMismatch {
    productId: string;
    productLotId: string;
    lotNumber: string;
    inventoryBatchId: string | null;
    balanceTotal: number;
    batchRemaining: number;
    delta: number;
}

export async function findWarehouseLayerMismatches(
    client: PoolClient,
    productId?: string,
): Promise<LotLayerMismatch[]> {
    const params: string[] = [];
    let productFilter = '';
    if (productId) {
        params.push(productId);
        productFilter = `AND pl.product_id = $1`;
    }

    const result = await client.query<{
        product_id: string;
        product_lot_id: string;
        lot_number: string;
        inventory_batch_id: string | null;
        balance_total: string;
        batch_remaining: string;
    }>(
        `SELECT
           pl.product_id,
           pl.id AS product_lot_id,
           pl.lot_number,
           pl.inventory_batch_id,
           COALESCE(SUM(ib.quantity_on_hand), 0)::numeric AS balance_total,
           COALESCE(b.remaining_quantity, 0)::numeric AS batch_remaining
         FROM product_lots pl
         LEFT JOIN inventory_balances ib ON ib.product_lot_id = pl.id
         LEFT JOIN inventory_batches b ON b.id = pl.inventory_batch_id
         WHERE pl.inventory_batch_id IS NOT NULL
           ${productFilter}
         GROUP BY pl.id, pl.product_id, pl.lot_number, pl.inventory_batch_id, b.remaining_quantity
         HAVING ABS(
           COALESCE(SUM(ib.quantity_on_hand), 0)::numeric - COALESCE(b.remaining_quantity, 0)::numeric
         ) > ${WAREHOUSE_LAYER_TOLERANCE}`,
        params,
    );

    return result.rows.map((row) => {
        const balanceTotal = parseFloat(row.balance_total);
        const batchRemaining = parseFloat(row.batch_remaining);
        return {
            productId: row.product_id,
            productLotId: row.product_lot_id,
            lotNumber: row.lot_number,
            inventoryBatchId: row.inventory_batch_id,
            balanceTotal,
            batchRemaining,
            delta: balanceTotal - batchRemaining,
        };
    });
}

/**
 * Align batch.remaining_quantity to SUM(inventory_balances) per linked lot.
 * Store balances are operational truth in multistore mode.
 * Returns number of batches updated.
 */
export async function alignBatchSubledgerToStoreBalances(
    client: PoolClient,
    productId: string,
): Promise<number> {
    if (!(await isMultistoreEnabled(client))) {
        return 0;
    }

    const result = await client.query<{ id: string }>(
        `UPDATE inventory_batches b
         SET remaining_quantity = agg.balance_total,
             status = CASE
               WHEN agg.balance_total > 0 THEN 'ACTIVE'::batch_status
               ELSE 'DEPLETED'::batch_status
             END,
             updated_at = CURRENT_TIMESTAMP
         FROM (
           SELECT pl.inventory_batch_id,
                  COALESCE(SUM(ib.quantity_on_hand), 0)::numeric AS balance_total
           FROM product_lots pl
           LEFT JOIN inventory_balances ib ON ib.product_lot_id = pl.id
           WHERE pl.product_id = $1
             AND pl.inventory_batch_id IS NOT NULL
           GROUP BY pl.inventory_batch_id
         ) agg
         WHERE b.id = agg.inventory_batch_id
           AND b.product_id = $1
           AND ABS(b.remaining_quantity - agg.balance_total) > ${WAREHOUSE_LAYER_TOLERANCE}
         RETURNING b.id`,
        [productId],
    );

    return result.rowCount ?? 0;
}

/**
 * Roll back the transaction if warehouse balances diverged from batch subledger.
 */
export async function assertWarehouseLayerConsistent(
    client: PoolClient,
    context: string,
    productId?: string,
): Promise<void> {
    if (!(await isMultistoreEnabled(client))) {
        return;
    }

    const mismatches = await findWarehouseLayerMismatches(client, productId);
    if (mismatches.length === 0) {
        await assertPosSellableProjectionConsistent(client, context, productId);
        return;
    }

    logger.error('[WAREHOUSE LAYER] Batch subledger diverged from store balances', {
        context,
        productId: productId ?? 'ALL',
        mismatches: mismatches.slice(0, 10),
        count: mismatches.length,
    });

    const sample = mismatches[0];
    throw new BusinessError(
        `Warehouse inventory mismatch (${context}). ` +
            `Lot ${sample.lotNumber}: balances=${sample.balanceTotal}, batch=${sample.batchRemaining}. ` +
            `Transaction rolled back.`,
        'ERR_WAREHOUSE_LAYER_COUPLING',
        {
            context,
            mismatchCount: mismatches.length,
            sample,
        },
    );
}

export async function assertWarehouseLayerConsistentForProducts(
    client: PoolClient,
    context: string,
    productIds: string[],
): Promise<void> {
    const unique = [...new Set(productIds.filter(Boolean))];
    for (const productId of unique) {
        await assertWarehouseLayerConsistent(client, context, productId);
    }
}
