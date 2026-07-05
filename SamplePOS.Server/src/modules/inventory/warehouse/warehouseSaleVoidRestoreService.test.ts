import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { PoolClient } from 'pg';

type MockFn = jest.Mock<(...args: unknown[]) => unknown>;

const mockMultistore = {
    isMultistoreEnabled: jest.fn<MockFn>(),
};

const mockWarehouseInventory = {
    adjustSellableQuantity: jest.fn<MockFn>(),
};

const mockInventorySync = {
    syncProductQuantity: jest.fn<MockFn>(),
};

jest.unstable_mockModule('./multistoreSettings.js', () => mockMultistore);
jest.unstable_mockModule('./warehouseInventoryRepository.js', () => ({
    warehouseInventoryRepository: mockWarehouseInventory,
}));
jest.unstable_mockModule('../../../utils/inventorySync.js', () => mockInventorySync);

const { warehouseSaleVoidRestoreService } = await import('./warehouseSaleVoidRestoreService.js');

function mockClient(rows: Record<string, unknown>[] = []): PoolClient {
    let callIndex = 0;
    return {
        query: jest.fn(async () => {
            const row = rows[callIndex] ?? rows[rows.length - 1] ?? {};
            callIndex++;
            return { rows: [row] };
        }),
    } as unknown as PoolClient;
}

describe('warehouseSaleVoidRestoreService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns false when multistore is disabled', async () => {
        mockMultistore.isMultistoreEnabled.mockResolvedValue(false);
        const client = mockClient();

        const handled = await warehouseSaleVoidRestoreService.restoreVoidedSaleLine(client, {
            productId: 'p1',
            quantity: 2,
            unitCost: 10,
            storeLocationId: 'store-1',
            productLotId: 'lot-1',
            saleId: 'sale-1',
            saleNumber: 'S-001',
            voidReason: 'test',
            voidedById: 'user-1',
        });

        expect(handled).toBe(false);
        expect(mockWarehouseInventory.adjustSellableQuantity).not.toHaveBeenCalled();
    });

    it('restores composite balance when store and lot trace exist', async () => {
        mockMultistore.isMultistoreEnabled.mockResolvedValue(true);
        const client = mockClient([
            { product_id: 'p1' },
            { inventory_batch_id: 'batch-1' },
            { movement_number: 'MOV-2026-0001' },
        ]);

        const handled = await warehouseSaleVoidRestoreService.restoreVoidedSaleLine(client, {
            productId: 'p1',
            quantity: 3,
            unitCost: 12.5,
            storeLocationId: 'store-1',
            productLotId: 'lot-1',
            batchId: 'batch-1',
            saleId: 'sale-1',
            saleNumber: 'S-001',
            voidReason: 'wrong qty',
            voidedById: 'user-1',
        });

        expect(handled).toBe(true);
        expect(mockWarehouseInventory.adjustSellableQuantity).toHaveBeenCalledWith(
            client,
            expect.objectContaining({
                storeLocationId: 'store-1',
                productLotId: 'lot-1',
                direction: 'IN',
                quantity: 3,
            }),
        );
    });
});
