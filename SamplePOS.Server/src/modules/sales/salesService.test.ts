/**
 * salesService unit tests
 * Tests sale retrieval, listing, and summary logic.
 */
import { jest } from '@jest/globals';
import type { Pool, PoolClient } from 'pg';

const mockSalesRepo = {
  createSale: jest.fn<any>(),
  addSaleItems: jest.fn<any>(),
  getSaleById: jest.fn<any>(),
  listSales: jest.fn<any>(),
  getSalesSummary: jest.fn<any>(),
  updateSaleStatus: jest.fn<any>(),
  generateSaleNumber: jest.fn<any>(),
  getFIFOCostLayers: jest.fn<any>(),
  updateCostLayerQuantity: jest.fn<any>(),
  createCostLayer: jest.fn<any>(),
  getProductSalesSummary: jest.fn<any>(),
  getTopSellingProducts: jest.fn<any>(),
  getSalesSummaryByDate: jest.fn<any>(),
  getSalesDetailsReport: jest.fn<any>(),
  getSalesByCashier: jest.fn<any>(),
};

jest.unstable_mockModule('./salesRepository.js', () => ({
  salesRepository: mockSalesRepo,
  default: mockSalesRepo,
}));

jest.unstable_mockModule('../../services/costLayerService.js', () => ({
  getCostLayers: jest.fn<any>().mockResolvedValue([]),
  consumeLayers: jest.fn<any>().mockResolvedValue(undefined),
  calculateFIFOCost: jest.fn<any>().mockResolvedValue(0),
}));

jest.unstable_mockModule('../../services/bankingService.js', () => ({
  BankingService: jest.fn<any>().mockImplementation(() => ({
    recordCashSale: jest.fn<any>().mockResolvedValue(undefined),
  })),
}));

jest.unstable_mockModule('../cash-register/index.js', () => ({
  cashRegisterService: {
    recordSaleMovement: jest.fn<any>().mockResolvedValue(undefined),
  },
}));

jest.unstable_mockModule('../../middleware/errorHandler.js', () => ({
  ValidationError: class extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'ValidationError';
    }
  },
  BusinessError: class extends Error {
    errorCode: string;
    constructor(msg: string, code: string) {
      super(msg);
      this.name = 'BusinessError';
      this.errorCode = code;
    }
  },
  NotFoundError: class extends Error {
    constructor(msg: string) {
      super(`${msg} not found`);
      this.name = 'NotFoundError';
    }
  },
}));

jest.unstable_mockModule('../../middleware/businessRules.js', () => ({
  SalesBusinessRules: { MAX_ITEMS_PER_SALE: 100, MIN_SALE_AMOUNT: 0 },
  InventoryBusinessRules: { ALLOW_NEGATIVE_STOCK: false },
}));

jest.unstable_mockModule('../../services/accountingIntegrationService.js', () => ({
  accountingIntegrationService: {
    createSaleJournalEntry: jest.fn<any>().mockResolvedValue(undefined),
    createVoidSaleJournalEntry: jest.fn<any>().mockResolvedValue(undefined),
  },
}));

jest.unstable_mockModule('../../services/accountingApiClient.js', () => ({
  accountingApiClient: {
    postJournalEntry: jest.fn<any>().mockResolvedValue(undefined),
  },
}));

jest.unstable_mockModule('../../services/glEntryService.js', () => ({
  createSaleGLEntries: jest.fn<any>().mockResolvedValue(undefined),
  reverseSaleGLEntries: jest.fn<any>().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../../db/batchFetch.js', () => ({
  batchFetchProducts: jest.fn<any>().mockResolvedValue(new Map()),
  batchFetchProductUoms: jest.fn<any>().mockResolvedValue(new Map()),
}));

const { salesService } = await import('./salesService.js');

// Create mock pool that returns a mock client
const mockClient = {
  query: jest.fn<any>(),
  release: jest.fn<any>(),
} as unknown as PoolClient;

const mockPool = {
  query: jest.fn<any>(),
  connect: jest.fn<any>().mockResolvedValue(mockClient),
} as unknown as Pool;

describe('salesService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockClient.query as jest.Mock<any>).mockResolvedValue({ rows: [] });
  });

  describe('getSaleById', () => {
    it('should return sale with items and payment lines', async () => {
      mockSalesRepo.getSaleById.mockResolvedValue({
        sale: { id: 's1', saleNumber: 'SALE-2025-0001', totalAmount: '100' },
        items: [{ id: 'i1', productName: 'Widget', quantity: 2 }],
        paymentLines: [{ id: 'pl1', method: 'CASH', amount: 100 }],
      });

      const result = await salesService.getSaleById(mockPool, 's1');

      expect(result.sale.id).toBe('s1');
      expect(result.items).toHaveLength(1);
    });

    it('should throw NotFoundError for missing sale', async () => {
      mockSalesRepo.getSaleById.mockResolvedValue(null);

      await expect(salesService.getSaleById(mockPool, 'ghost')).rejects.toThrow();
    });
  });

  describe('listSales', () => {
    it('should return paginated sales', async () => {
      mockSalesRepo.listSales.mockResolvedValue({
        sales: [{ id: 's1', saleNumber: 'SALE-2025-0001' }],
        total: 1,
      });

      const result = await salesService.listSales(mockPool, 1, 20);

      expect(result.sales).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('getSalesSummary', () => {
    it('should return summary data', async () => {
      mockSalesRepo.getSalesSummary.mockResolvedValue({
        totalSales: 10,
        totalRevenue: '50000',
      });

      const summary = await salesService.getSalesSummary(mockPool);
      expect(summary).toBeDefined();
    });
  });
});
