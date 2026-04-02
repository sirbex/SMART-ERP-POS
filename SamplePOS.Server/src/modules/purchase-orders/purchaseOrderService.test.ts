/**
 * purchaseOrderService unit tests
 * Tests PO retrieval, status transitions, and deletion logic.
 */
import { jest } from '@jest/globals';
import type { Pool } from 'pg';

/** Flexible mock fn type — avoids `any` while allowing mockResolvedValue/mockReturnValue */
type MockFn = (...args: unknown[]) => Promise<unknown>;

const mockPORepo = {
    createPO: jest.fn<MockFn>(),
    createPOItem: jest.fn<MockFn>(),
    getPOById: jest.fn<MockFn>(),
    listPOs: jest.fn<MockFn>(),
    updatePOStatus: jest.fn<MockFn>(),
    deletePO: jest.fn<MockFn>(),
    updatePOTotal: jest.fn<MockFn>(),
};

jest.unstable_mockModule('./purchaseOrderRepository.js', () => ({
    purchaseOrderRepository: mockPORepo,
    default: mockPORepo,
}));

jest.unstable_mockModule('../../middleware/businessRules.js', () => ({
    PurchaseOrderBusinessRules: {
        MAX_ITEMS_PER_PO: 100,
        VALID_STATUSES: ['DRAFT', 'PENDING', 'COMPLETED', 'CANCELLED'],
    },
    InventoryBusinessRules: {},
}));

jest.unstable_mockModule('../../db/unitOfWork.js', () => ({
    UnitOfWork: {
        run: jest.fn(async (_pool: unknown, fn: (client: unknown) => Promise<unknown>) => {
            const mockClient = { query: jest.fn<MockFn>().mockResolvedValue({ rows: [] }) };
            return fn(mockClient);
        }),
    },
}));

const { purchaseOrderService } = await import('./purchaseOrderService.js');

const mockPool = { query: jest.fn<MockFn>().mockResolvedValue({ rows: [] }), connect: jest.fn<MockFn>() } as unknown as Pool;

describe('purchaseOrderService', () => {
    beforeEach(() => jest.clearAllMocks());

    describe('getPOById', () => {
        it('should return PO with items', async () => {
            mockPORepo.getPOById.mockResolvedValue({
                po: { id: 'po1', poNumber: 'PO-2025-0001', status: 'DRAFT' },
                items: [{ id: 'pi1', productName: 'Widget', quantity: 10, unitPrice: 100 }],
            });

            const result = await purchaseOrderService.getPOById(mockPool, 'po1');

            expect(result.po.poNumber).toBe('PO-2025-0001');
            expect(result.items).toHaveLength(1);
        });

        it('should throw when PO not found', async () => {
            mockPORepo.getPOById.mockResolvedValue(null);

            await expect(purchaseOrderService.getPOById(mockPool, 'ghost')).rejects.toThrow();
        });
    });

    describe('listPOs', () => {
        it('should return paginated POs', async () => {
            mockPORepo.listPOs.mockResolvedValue({
                pos: [{ id: 'po1', poNumber: 'PO-2025-0001' }],
                total: 1,
            });

            const result = await purchaseOrderService.listPOs(mockPool, 1, 20);
            expect(result.pos).toHaveLength(1);
            expect(result.total).toBe(1);
        });
    });

    describe('updatePOStatus', () => {
        it('should update status when transition is valid', async () => {
            mockPORepo.getPOById.mockResolvedValue({
                po: { id: 'po1', status: 'DRAFT' },
                items: [],
            });
            mockPORepo.updatePOStatus.mockResolvedValue({ id: 'po1', status: 'PENDING' });

            const result = await purchaseOrderService.updatePOStatus(mockPool, 'po1', 'PENDING');
            expect(result.status).toBe('PENDING');
        });

        it('should throw for invalid status transition', async () => {
            mockPORepo.getPOById.mockResolvedValue({
                po: { id: 'po1', status: 'COMPLETED' },
                items: [],
            });

            await expect(
                purchaseOrderService.updatePOStatus(mockPool, 'po1', 'PENDING')
            ).rejects.toThrow();
        });
    });

    describe('deletePO', () => {
        it('should delete a DRAFT PO', async () => {
            mockPORepo.getPOById.mockResolvedValue({
                po: { id: 'po1', status: 'DRAFT' },
                items: [],
            });
            mockPORepo.deletePO.mockResolvedValue(undefined);

            await expect(purchaseOrderService.deletePO(mockPool, 'po1')).resolves.not.toThrow();
        });

        it('should throw when trying to delete non-DRAFT PO', async () => {
            mockPORepo.getPOById.mockResolvedValue({
                po: { id: 'po1', status: 'COMPLETED' },
                items: [],
            });

            await expect(purchaseOrderService.deletePO(mockPool, 'po1')).rejects.toThrow(
                'Can only delete purchase orders in DRAFT status'
            );
        });
    });
});
