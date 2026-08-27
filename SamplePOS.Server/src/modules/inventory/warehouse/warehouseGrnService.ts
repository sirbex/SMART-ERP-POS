import type { PoolClient } from 'pg';
import { isMultistoreEnabled } from './multistoreSettings.js';
import { resolveMultistoreReceiptStoreId } from './multistoreReceiptStore.js';
import { warehouseInventoryRepository } from './warehouseInventoryRepository.js';

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

        const targetStoreId = await resolveMultistoreReceiptStoreId(
            client,
            params.targetStoreLocationId ?? null,
        );

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
