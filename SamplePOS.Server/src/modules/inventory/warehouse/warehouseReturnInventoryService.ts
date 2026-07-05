import type { PoolClient } from 'pg';
import { syncProductQuantity } from '../../../utils/inventorySync.js';
import { recordMovement } from '../../stock-movements/stockMovementRepository.js';
import { storeLocationRepository } from './storeLocationRepository.js';
import { productLotRepository } from './productLotRepository.js';
import { warehouseInventoryRepository } from './warehouseInventoryRepository.js';
import { isMultistoreEnabled } from './multistoreSettings.js';

export interface CustomerReturnRestoreParams {
    productId: string;
    quantity: number;
    unitCost: number;
    batchId?: string | null;
    productLotId?: string | null;
    referenceType: string;
    referenceId: string;
    notes: string;
}

export interface CustomerReturnRestoreOutcome {
    batchId: string | null;
    productLotId: string | null;
    storeLocationId: string | null;
    baseQty: number;
    unitCost: number;
}

async function ensureReturnStore(client: PoolClient) {
    let store = await storeLocationRepository.getStoreByType(client, 'RETURN');
    if (!store) {
        store = await storeLocationRepository.upsertByCode(client, {
            code: 'RETURN',
            name: 'Customer Returns',
            storeType: 'RETURN',
        });
    }
    return store;
}

async function resolveBatchForReturn(
    client: PoolClient,
    productId: string,
    batchId?: string | null,
): Promise<{ batchId: string; batchNumber: string } | null> {
    if (batchId) {
        const res = await client.query<{ id: string; batch_number: string }>(
            `SELECT id, batch_number FROM inventory_batches WHERE id = $1`,
            [batchId],
        );
        if (res.rows[0]) return { batchId: res.rows[0].id, batchNumber: res.rows[0].batch_number };
    }

    const res = await client.query<{ id: string; batch_number: string }>(
        `SELECT id, batch_number
         FROM inventory_batches
         WHERE product_id = $1 AND status = 'ACTIVE'
         ORDER BY received_date DESC NULLS LAST, created_at DESC
         LIMIT 1`,
        [productId],
    );
    return res.rows[0] ? { batchId: res.rows[0].id, batchNumber: res.rows[0].batch_number } : null;
}

async function increaseBatchQuantity(
    client: PoolClient,
    batchId: string,
    quantity: number,
): Promise<void> {
    await client.query(
        `UPDATE inventory_batches
         SET remaining_quantity = remaining_quantity + $1,
             status = CASE
               WHEN remaining_quantity + $1 > 0 THEN 'ACTIVE'::batch_status
               ELSE status
             END,
             updated_at = NOW()
         WHERE id = $2`,
        [quantity, batchId],
    );
}

export const warehouseReturnInventoryService = {
    async restoreCustomerReturn(
        client: PoolClient,
        params: CustomerReturnRestoreParams,
    ): Promise<CustomerReturnRestoreOutcome | null> {
        if (!(await isMultistoreEnabled(client))) {
            return null;
        }

        const returnStore = await ensureReturnStore(client);
        let resolvedBatch = await resolveBatchForReturn(client, params.productId, params.batchId);

        let productLotId = params.productLotId ?? null;

        if (productLotId) {
            const lot = await productLotRepository.getById(client, productLotId);
            if (!lot || lot.productId !== params.productId) {
                productLotId = null;
            }
        }

        if (!productLotId && resolvedBatch) {
            const lot = await productLotRepository.upsertLot(client, {
                productId: params.productId,
                lotNumber: resolvedBatch.batchNumber,
                costPrice: params.unitCost,
                inventoryBatchId: resolvedBatch.batchId,
                status: 'ACTIVE',
            });
            productLotId = lot.id;
        } else if (!productLotId) {
            const lot = await productLotRepository.upsertLot(client, {
                productId: params.productId,
                lotNumber: `RET-${params.referenceId.slice(0, 8)}`,
                costPrice: params.unitCost,
                status: 'ACTIVE',
            });
            productLotId = lot.id;
        }

        await warehouseInventoryRepository.adjustSellableQuantity(client, {
            storeLocationId: returnStore.id,
            productLotId: productLotId!,
            productId: params.productId,
            quantity: params.quantity,
            direction: 'IN',
        });

        if (resolvedBatch) {
            await increaseBatchQuantity(client, resolvedBatch.batchId, params.quantity);
        } else {
            const insert = await client.query<{ id: string }>(
                `INSERT INTO inventory_batches (
                   product_id, batch_number, quantity, remaining_quantity,
                   cost_price, received_date, status, notes
                 ) VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, 'ACTIVE', $6)
                 RETURNING id`,
                [
                    params.productId,
                    `RET-${params.referenceId.slice(0, 8)}`,
                    params.quantity,
                    params.quantity,
                    params.unitCost,
                    params.notes,
                ],
            );
            const newBatchId = insert.rows[0].id;
            const lotNumber = `RET-${params.referenceId.slice(0, 8)}`;
            resolvedBatch = { batchId: newBatchId, batchNumber: lotNumber };
            const linkedLot = await productLotRepository.upsertLot(client, {
                productId: params.productId,
                lotNumber,
                costPrice: params.unitCost,
                inventoryBatchId: newBatchId,
                status: 'ACTIVE',
            });
            productLotId = linkedLot.id;
        }

        await syncProductQuantity(client, params.productId);

        await recordMovement(client, {
            productId: params.productId,
            batchId: resolvedBatch?.batchId ?? null,
            movementType: 'RETURN',
            quantity: params.quantity,
            unitCost: params.unitCost,
            referenceType: params.referenceType,
            referenceId: params.referenceId,
            notes: `${params.notes} [store:${returnStore.code}]`,
        });

        return {
            batchId: resolvedBatch?.batchId ?? null,
            productLotId,
            storeLocationId: returnStore.id,
            baseQty: params.quantity,
            unitCost: params.unitCost,
        };
    },
};
