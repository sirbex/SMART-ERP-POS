/**
 * supplierService unit tests
 * Tests supplier CRUD with mocked repository.
 */
import { jest } from '@jest/globals';
import type { Pool } from 'pg';

// Mock functions matching actual supplierRepository exports
const mockFindAll = jest.fn<any>();
const mockCountAll = jest.fn<any>();
const mockFindById = jest.fn<any>();
const mockFindBySupplierNumber = jest.fn<any>();
const mockSearchSuppliers = jest.fn<any>();
const mockCreate = jest.fn<any>();
const mockUpdate = jest.fn<any>();
const mockHasActivePurchaseOrders = jest.fn<any>();
const mockSoftDeleteSupplier = jest.fn<any>();

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
}));

jest.unstable_mockModule('../../db/unitOfWork.js', () => ({
  UnitOfWork: {
    run: jest.fn<any>(async (_pool: unknown, fn: (client: unknown) => Promise<unknown>) => fn({})),
  },
}));

const supplierService = await import('./supplierService.js');

const mockPool = {} as Pool;

describe('supplierService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getAllSuppliers', () => {
    it('should return paginated suppliers', async () => {
      mockFindAll.mockResolvedValue([{ id: 's1', name: 'Acme' }]);
      mockCountAll.mockResolvedValue(1);

      const result = await supplierService.getAllSuppliers(mockPool, 1, 20);

      expect(result).toBeDefined();
      expect(mockFindAll).toHaveBeenCalled();
      expect(mockCountAll).toHaveBeenCalled();
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
});
