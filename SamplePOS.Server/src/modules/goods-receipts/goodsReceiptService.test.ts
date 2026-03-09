/**
 * goodsReceiptService unit tests
 * Tests GR retrieval and listing logic.
 */
import { jest } from '@jest/globals';
import type { Pool } from 'pg';

const mockGRRepo = {
  createGR: jest.fn(),
  createGRItem: jest.fn(),
  getGRById: jest.fn(),
  listGRs: jest.fn(),
  updateGRStatus: jest.fn(),
  updateGRItem: jest.fn(),
  getGRItemWithParent: jest.fn(),
  finalizeGR: jest.fn(),
};

jest.unstable_mockModule('./goodsReceiptRepository.js', () => ({
  goodsReceiptRepository: mockGRRepo,
  default: mockGRRepo,
}));

jest.unstable_mockModule('../purchase-orders/purchaseOrderRepository.js', () => ({
  purchaseOrderRepository: {
    getPOById: jest.fn(),
    updatePOStatus: jest.fn(),
    createManualPO: jest.fn(),
  },
}));

jest.unstable_mockModule('../inventory/inventoryRepository.js', () => ({
  inventoryRepository: {
    createBatch: jest.fn().mockResolvedValue({ id: 'batch1' }),
    updateProductInventory: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.unstable_mockModule('../supplier-payments/supplierPaymentRepository.js', () => ({
  createSupplierLiability: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../../services/costLayerService.js', () => ({
  addCostLayer: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../../services/pricingService.js', () => ({
  updateProductCostPrice: jest.fn().mockResolvedValue(undefined),
  checkCostPriceChange: jest.fn().mockResolvedValue(null),
}));

jest.unstable_mockModule('../../services/glEntryService.js', () => ({
  createGoodsReceiptGLEntries: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../suppliers/supplierProductPriceRepository.js', () => ({
  upsertSupplierProductPrice: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../../db/batchFetch.js', () => ({
  batchFetchProducts: jest.fn().mockResolvedValue(new Map()),
}));

jest.unstable_mockModule('../../middleware/businessRules.js', () => ({
  InventoryBusinessRules: {},
  PurchaseOrderBusinessRules: {},
}));

jest.unstable_mockModule('../../db/unitOfWork.js', () => ({
  UnitOfWork: {
    run: jest.fn(async (_pool: unknown, fn: (client: unknown) => Promise<unknown>) => {
      const mockClient = { query: jest.fn().mockResolvedValue({ rows: [] }) };
      return fn(mockClient);
    }),
  },
}));

const { goodsReceiptService } = await import('./goodsReceiptService.js');

const mockPool = { query: jest.fn() } as unknown as Pool;

describe('goodsReceiptService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getGRById', () => {
    it('should return GR with items', async () => {
      mockGRRepo.getGRById.mockResolvedValue({
        gr: { id: 'gr1', grNumber: 'GR-2025-0001', status: 'PENDING' },
        items: [{ id: 'gri1', productName: 'Widget', receivedQuantity: 10 }],
      });

      const result = await goodsReceiptService.getGRById(mockPool, 'gr1');

      expect(result.gr.grNumber).toBe('GR-2025-0001');
      expect(result.items).toHaveLength(1);
    });

    it('should throw when GR not found', async () => {
      mockGRRepo.getGRById.mockResolvedValue(null);

      await expect(goodsReceiptService.getGRById(mockPool, 'ghost')).rejects.toThrow();
    });
  });

  describe('listGRs', () => {
    it('should return paginated goods receipts', async () => {
      mockGRRepo.listGRs.mockResolvedValue({
        grs: [{ id: 'gr1', grNumber: 'GR-2025-0001' }],
        total: 1,
      });

      const result = await goodsReceiptService.listGRs(mockPool, 1, 20);
      expect(result.grs).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });
});
