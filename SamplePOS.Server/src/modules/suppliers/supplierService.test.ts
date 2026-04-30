/**
 * supplierService unit tests
 * Tests supplier CRUD with mocked repository.
 */
import { jest } from '@jest/globals';
import type { Pool } from 'pg';

/** Flexible mock fn type — avoids `any` while allowing mockResolvedValue/mockReturnValue */
type MockFn = (...args: unknown[]) => Promise<unknown>;

// Mock functions matching actual supplierRepository exports
const mockFindAll = jest.fn<MockFn>();
const mockCountAll = jest.fn<MockFn>();
const mockFindById = jest.fn<MockFn>();
const mockFindBySupplierNumber = jest.fn<MockFn>();
const mockSearchSuppliers = jest.fn<MockFn>();
const mockCreate = jest.fn<MockFn>();
const mockUpdate = jest.fn<MockFn>();
const mockHasActivePurchaseOrders = jest.fn<MockFn>();
const mockSoftDeleteSupplier = jest.fn<MockFn>();
const mockGetTotalOutstanding = jest.fn<MockFn>();

jest.unstable_mockModule('./supplierRepository.js', () => ({
    findAll: mockFindAll,
    countAll: mockCountAll,
    findById: mockFindById,
    findBySupplierNumber: mockFindBySupplierNumber,
    searchSuppliers: mockSearchSuppliers,
    create: mockCreate,
    update: mockUpdate,
    hasActivePurchaseOrders: mockHasActivePurchaseOrders,
    softDeleteSupplier: mockSoftDeleteSupplier,
    getTotalOutstanding: mockGetTotalOutstanding,
}));

jest.unstable_mockModule('../../db/unitOfWork.js', () => ({
    UnitOfWork: {
        run: jest.fn(async (_pool: unknown, fn: (client: unknown) => Promise<unknown>) => fn({})),
    },
}));

// Mock errorHandler so ForbiddenError is available
jest.unstable_mockModule('../../middleware/errorHandler.js', () => {
    class AppError extends Error {
        constructor(public statusCode: number, message: string) {
            super(message);
        }
    }
    class ForbiddenError extends AppError {
        constructor(message: string = 'Forbidden') {
            super(403, message);
        }
    }
    return { AppError, ForbiddenError };
});

const supplierService = await import('./supplierService.js');
const { ForbiddenError } = await import('../../middleware/errorHandler.js');

const mockPool = {} as Pool;

const SYSTEM_ID = 'a0000000-0000-0000-0000-000000000001';

describe('supplierService', () => {
    beforeEach(() => jest.clearAllMocks());

    describe('getAllSuppliers', () => {
        it('should return paginated suppliers', async () => {
            mockFindAll.mockResolvedValue([{ id: 's1', name: 'Acme' }]);
            mockCountAll.mockResolvedValue(1);
            mockGetTotalOutstanding.mockResolvedValue(0);

            const result = await supplierService.getAllSuppliers(mockPool, 1, 20);

            expect(result).toBeDefined();
            expect(mockFindAll).toHaveBeenCalledWith(mockPool, 20, 0, undefined);
            expect(mockCountAll).toHaveBeenCalledWith(mockPool, undefined);
        });

        it('should pass search term to repository when provided', async () => {
            mockFindAll.mockResolvedValue([{ id: 's1', name: 'Acme' }]);
            mockCountAll.mockResolvedValue(1);
            mockGetTotalOutstanding.mockResolvedValue(0);

            await supplierService.getAllSuppliers(mockPool, 1, 20, 'acme');

            expect(mockFindAll).toHaveBeenCalledWith(mockPool, 20, 0, 'acme');
            expect(mockCountAll).toHaveBeenCalledWith(mockPool, 'acme');
        });

        it('should treat blank search as no search', async () => {
            mockFindAll.mockResolvedValue([]);
            mockCountAll.mockResolvedValue(0);
            mockGetTotalOutstanding.mockResolvedValue(0);

            await supplierService.getAllSuppliers(mockPool, 1, 20, '   ');

            expect(mockFindAll).toHaveBeenCalledWith(mockPool, 20, 0, undefined);
            expect(mockCountAll).toHaveBeenCalledWith(mockPool, undefined);
        });
    });

    describe('getSupplierById', () => {
        it('should return supplier when found', async () => {
            mockFindById.mockResolvedValue({ id: 's1', name: 'Acme' });

            const supplier = await supplierService.getSupplierById(mockPool, 's1');
            expect(supplier.name).toBe('Acme');
        });

        it('should throw when not found', async () => {
            mockFindById.mockResolvedValue(null);

            await expect(supplierService.getSupplierById(mockPool, 'ghost')).rejects.toThrow();
        });
    });

    describe('createSupplier', () => {
        it('should create and return supplier', async () => {
            mockCreate.mockResolvedValue({ id: 's2', name: 'NewCo', supplierNumber: 'SUP-0001' });

            const supplier = await supplierService.createSupplier(mockPool, { name: 'NewCo' });
            expect(supplier.id).toBe('s2');
        });
    });

    describe('updateSupplier', () => {
        it('should update supplier fields', async () => {
            mockFindById.mockResolvedValue({ id: 's1', name: 'Old' });
            mockUpdate.mockResolvedValue({ id: 's1', name: 'Updated' });

            const supplier = await supplierService.updateSupplier(mockPool, 's1', { name: 'Updated' });
            expect(supplier!.name).toBe('Updated');
        });

        it('should throw when supplier not found', async () => {
            mockFindById.mockResolvedValue(null);

            await expect(
                supplierService.updateSupplier(mockPool, 'ghost', { name: 'X' })
            ).rejects.toThrow();
        });
    });

    describe('deleteSupplier', () => {
        it('should delete supplier when no active POs', async () => {
            mockFindById.mockResolvedValue({ id: 's1', name: 'Acme' });
            mockHasActivePurchaseOrders.mockResolvedValue(false);
            mockSoftDeleteSupplier.mockResolvedValue(undefined);

            await expect(supplierService.deleteSupplier(mockPool, 's1')).resolves.not.toThrow();
        });
    });

    describe('searchSuppliers', () => {
        it('should return matching suppliers', async () => {
            mockSearchSuppliers.mockResolvedValue([{ id: 's1', name: 'Acme' }]);

            const results = await supplierService.searchSuppliers(mockPool, 'Acme');
            expect(results).toHaveLength(1);
        });
    });

    // ── SYSTEM supplier protection tests ──

    describe('SYSTEM_SUPPLIER_ID constant', () => {
        it('should export the well-known UUID', () => {
            expect(supplierService.SYSTEM_SUPPLIER_ID).toBe(SYSTEM_ID);
        });
    });

    describe('updateSupplier — SYSTEM supplier protection', () => {
        it('should throw ForbiddenError when updating SYSTEM supplier by ID', async () => {
            mockFindById.mockResolvedValue({ id: SYSTEM_ID, name: 'SYSTEM', SupplierCode: 'SYS-OPENING-BAL' });

            await expect(
                supplierService.updateSupplier(mockPool, SYSTEM_ID, { name: 'Hacked' })
            ).rejects.toThrow(ForbiddenError);

            expect(mockUpdate).not.toHaveBeenCalled();
        });

        it('should throw ForbiddenError when updating supplier with SYS- code prefix', async () => {
            mockFindById.mockResolvedValue({ id: 'other-uuid', SupplierCode: 'SYS-CUSTOM' });

            await expect(
                supplierService.updateSupplier(mockPool, 'other-uuid', { name: 'Hacked' })
            ).rejects.toThrow(ForbiddenError);

            expect(mockUpdate).not.toHaveBeenCalled();
        });

        it('should allow updating a normal supplier', async () => {
            mockFindById.mockResolvedValue({ id: 's1', SupplierCode: 'SUP-2025-0001' });
            mockUpdate.mockResolvedValue({ id: 's1', name: 'Updated' });

            const result = await supplierService.updateSupplier(mockPool, 's1', { name: 'Updated' });
            expect(result).toBeDefined();
            expect(mockUpdate).toHaveBeenCalled();
        });
    });

    describe('deleteSupplier — SYSTEM supplier protection', () => {
        it('should throw ForbiddenError when deleting SYSTEM supplier by ID', async () => {
            mockFindById.mockResolvedValue({ id: SYSTEM_ID, SupplierCode: 'SYS-OPENING-BAL' });

            await expect(
                supplierService.deleteSupplier(mockPool, SYSTEM_ID)
            ).rejects.toThrow(ForbiddenError);

            expect(mockHasActivePurchaseOrders).not.toHaveBeenCalled();
            expect(mockSoftDeleteSupplier).not.toHaveBeenCalled();
        });

        it('should throw ForbiddenError when deleting supplier with SYS- code prefix', async () => {
            mockFindById.mockResolvedValue({ id: 'some-id', SupplierCode: 'SYS-FUTURE' });

            await expect(
                supplierService.deleteSupplier(mockPool, 'some-id')
            ).rejects.toThrow(ForbiddenError);

            expect(mockSoftDeleteSupplier).not.toHaveBeenCalled();
        });

        it('should allow deleting a normal supplier', async () => {
            mockFindById.mockResolvedValue({ id: 's1', SupplierCode: 'SUP-2025-0001' });
            mockHasActivePurchaseOrders.mockResolvedValue(false);
            mockSoftDeleteSupplier.mockResolvedValue(undefined);

            await expect(supplierService.deleteSupplier(mockPool, 's1')).resolves.not.toThrow();
            expect(mockSoftDeleteSupplier).toHaveBeenCalled();
        });
    });
});
