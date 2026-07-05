import type { PoolClient } from 'pg';
import { isMultistoreEnabled } from './multistoreSettings.js';
import { storeLocationRepository } from './storeLocationRepository.js';
import { warehouseInventoryRepository } from './warehouseInventoryRepository.js';
import { ValidationError } from '../../../middleware/errorHandler.js';

export interface PostGrnReceiptSegmentParams {
    productId: string;
    lotNumber: string;
    quantity: number;
    costPrice: number;
    expiryDate?: string | null;
    goodsReceiptId: string;
    inventoryBatchId: string;
    targetStoreLocationId?: string | null;
    isBonus?: boolean;
}

export const warehouseGrnService = {
    /**
     * Post GRN segment to composite inventory layer (multistore only).
     * Legacy tenants: no-op — inventory_batches path unchanged.
     */
    async postReceiptSegment(
        client: PoolClient,
        params: PostGrnReceiptSegmentParams,
    ): Promise<void> {
        if (!(await isMultistoreEnabled(client))) {
            return;
        }

        if (params.quantity <= 0) {
            return;
        }

        await storeLocationRepository.ensureDefaultNetworkStores(client);

        let targetStoreId = params.targetStoreLocationId ?? null;
        if (targetStoreId) {
            const store = await storeLocationRepository.getById(client, targetStoreId);
            if (!store || !store.isActive) {
                throw new ValidationError(`Target store ${targetStoreId} is not active`);
            }
        } else {
            const mainStore = await storeLocationRepository.getDefaultReceivingStore(client);
            if (!mainStore) {
                throw new ValidationError(
                    'Multistore GRN requires a MAIN receiving store. Run store network setup.',
                );
            }
            targetStoreId = mainStore.id;
        }

        await warehouseInventoryRepository.upsertLotAndIncrementBalance(client, {
            storeLocationId: targetStoreId,
            productId: params.productId,
            lotNumber: params.lotNumber,
            expiryDate: params.expiryDate,
            costPrice: params.isBonus ? 0 : params.costPrice,
            quantity: params.quantity,
            goodsReceiptId: params.goodsReceiptId,
            inventoryBatchId: params.inventoryBatchId,
            isBonus: params.isBonus,
        });
    },
};
