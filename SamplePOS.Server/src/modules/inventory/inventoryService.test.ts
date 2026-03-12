/**
 * inventoryService unit tests
 * Tests inventory queries, FEFO allocation, and adjustment logic.
 */
import { jest } from '@jest/globals';
import type { Pool } from 'pg';

/** Flexible mock fn type — avoids `any` while allowing mockResolvedValue/mockReturnValue */
type MockFn = (...args: unknown[]) => Promise<unknown>;

const mockGetBatchesByProduct = jest.fn<MockFn>();
const mockGetAllActiveBatches = jest.fn<MockFn>();
const mockGetStockLevels = jest.fn<MockFn>();
const mockGetStockLevelByProduct = jest.fn<MockFn>();
const mockGetBatchesExpiringSoon = jest.fn<MockFn>();
const mockSelectFEFOBatches = jest.fn<MockFn>();
const mockProcessMovement = jest.fn<MockFn>();

jest.unstable_mockModule('./inventoryRepository.js', () => ({
    inventoryRepository: {
        getBatchesByProduct: mockGetBatchesByProduct,
        getAllActiveBatches: mockGetAllActiveBatches,
        getStockLevels: mockGetStockLevels,
        getStockLevelByProduct: mockGetStockLevelByProduct,
        getBatchesExpiringSoon: mockGetBatchesExpiringSoon,
        selectFEFOBatches: mockSelectFEFOBatches,
    },
}));

jest.unstable_mockModule('../../middleware/businessRules.js', () => ({
    InventoryBusinessRules: {
        REORDER_LEVEL_DEFAULT: 10,
        EXPIRY_WARNING_DAYS: 30,
    },
}));

jest.unstable_mockModule('./stockMovementHandler.js', () => ({
    StockMovementHandler: jest.fn(() => ({
        processMovement: mockProcessMovement,
    })),
}));

const { inventoryService } = await import('./inventoryService.js');

const mockPool = {
    query: jest.fn<MockFn>(),
} as unknown as Pool;

describe('inventoryService', () => {
    beforeEach(() => jest.clearAllMocks());

    describe('getBatchesByProduct', () => {
        it('should return batches for a product', async () => {
            const batches = [
                { id: 'b1', batchNumber: 'BATCH-001', remainingQuantity: 50 },
                { id: 'b2', batchNumber: 'BATCH-002', remainingQuantity: 30 },
            ];
            mockGetBatchesByProduct.mockResolvedValue(batches);

            const result = await inventoryService.getBatchesByProduct(mockPool, 'p1');
            expect(result).toHaveLength(2);
            expect(mockGetBatchesByProduct).toHaveBeenCalledWith(mockPool, 'p1');
        });
    });

    describe('getStockLevels', () => {
        it('should return stock levels for all products', async () => {
            mockGetStockLevels.mockResolvedValue([
                { productId: 'p1', totalQuantity: 100 },
                { productId: 'p2', totalQuantity: 50 },
            ]);

            const levels = await inventoryService.getStockLevels(mockPool);
            expect(levels).toHaveLength(2);
        });
    });

    describe('getBatchesExpiringSoon', () => {
        it('should use default 30 day threshold', async () => {
            mockGetBatchesExpiringSoon.mockResolvedValue([]);

            await inventoryService.getBatchesExpiringSoon(mockPool);
            expect(mockGetBatchesExpiringSoon).toHaveBeenCalledWith(mockPool, 30);
        });

        it('should accept custom threshold', async () => {
            mockGetBatchesExpiringSoon.mockResolvedValue([{ id: 'b1' }]);

            const result = await inventoryService.getBatchesExpiringSoon(mockPool, 7);
            expect(mockGetBatchesExpiringSoon).toHaveBeenCalledWith(mockPool, 7);
            expect(result).toHaveLength(1);
        });
    });

    describe('selectBatchesForAllocation (FEFO)', () => {
        it('should delegate to selectFEFOBatches', async () => {
            const fefoResult = [
                { batch: { id: 'b1', expiryDate: '2026-04-01' }, quantityToTake: 20 },
                { batch: { id: 'b2', expiryDate: '2026-06-01' }, quantityToTake: 10 },
            ];
            mockSelectFEFOBatches.mockResolvedValue(fefoResult);

            const result = await inventoryService.selectBatchesForAllocation(mockPool, 'p1', 30);

            expect(result).toHaveLength(2);
            expect(mockSelectFEFOBatches).toHaveBeenCalledWith(mockPool, 'p1', 30);
        });
    });

    describe('adjustInventory', () => {
        it('should throw when adjustment is zero', async () => {
            await expect(
                inventoryService.adjustInventory(mockPool, 'p1', 0, 'Some reason here', 'u1')
            ).rejects.toThrow('Adjustment amount cannot be zero');
        });

        it('should call processMovement for positive adjustment', async () => {
            mockProcessMovement.mockResolvedValue({ movementId: 'm1', movementNumber: 'SM-001' });

            const result = await inventoryService.adjustInventory(
                mockPool,
                'p1',
                10,
                'Recount adjustment',
                'u1'
            );

            expect(result.movementId).toBe('m1');
            expect(mockProcessMovement).toHaveBeenCalled();
        });
    });

    describe('getInventoryValue', () => {
        it('should return total inventory value', async () => {
            (mockPool.query as jest.Mock<MockFn>).mockResolvedValue({
                rows: [
                    {
                        product_id: 'p1',
                        product_name: 'Widget',
                        inventory_value: '150000.00',
                        total_quantity: '100',
                    },
                ],
            });

            const value = await inventoryService.getInventoryValue(mockPool);
            expect(value).toBeDefined();
            expect(value).toHaveLength(1);
        });
    });
});
