import type { PoolClient } from 'pg';
import { syncProductQuantity } from '../../../utils/inventorySync.js';
import { recordMovement } from '../../stock-movements/stockMovementRepository.js';
import { storeLocationRepository } from './storeLocationRepository.js';
import { isMultistoreEnabled } from './multistoreSettings.js';
import { lotService } from '../../inventory-lot/lotService.js';
import { getProductLotIdByBatchId } from '../../inventory-lot/postgresLotRepository.js';

export interface CustomerReturnRestoreParams {
    productId: string;
    quantity: number;
    unitCost: number;
    batchId?: string | null;
    productLotId?: string | null;
    referenceType: string;
    referenceId: string;
    notes: string;
    userId?: string;
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

export const warehouseReturnInventoryService = {
    async restoreCustomerReturn(
        client: PoolClient,
        params: CustomerReturnRestoreParams,
    ): Promise<CustomerReturnRestoreOutcome | null> {
        if (!(await isMultistoreEnabled(client))) {
            return null;
        }

        const returnStore = await ensureReturnStore(client);

        let batchId = params.batchId ?? null;
        if (!batchId && params.productLotId) {
            const lotRow = await client.query<{ inventory_batch_id: string | null }>(
                `SELECT inventory_batch_id FROM product_lots WHERE id = $1`,
                [params.productLotId],
            );
            batchId = lotRow.rows[0]?.inventory_batch_id ?? null;
        }

        const lot = await lotService.returnLot(client, {
            productId: params.productId,
            batchId,
            quantity: params.quantity,
            costPrice: params.unitCost,
            targetStoreLocationId: returnStore.id,
            referenceType: params.referenceType,
            referenceId: params.referenceId,
            notes: params.notes,
            userId: params.userId ?? 'system',
        });

        const productLotId = await getProductLotIdByBatchId(client, lot.id);

        await syncProductQuantity(client, params.productId);

        await recordMovement(client, {
            productId: params.productId,
            batchId: lot.id,
            movementType: 'RETURN',
            quantity: params.quantity,
            unitCost: params.unitCost,
            referenceType: params.referenceType,
            referenceId: params.referenceId,
            notes: `${params.notes} [store:${returnStore.code}]`,
        });

        return {
            batchId: lot.id,
            productLotId,
            storeLocationId: returnStore.id,
            baseQty: params.quantity,
            unitCost: params.unitCost,
        };
    },
};
