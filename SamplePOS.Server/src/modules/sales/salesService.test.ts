/**
 * salesService unit tests
 * Tests sale retrieval, listing, and summary logic.
 */
import { jest } from '@jest/globals';
import type { Pool, PoolClient } from 'pg';

const mockSalesRepo = {
  createSale: jest.fn(),
  addSaleItems: jest.fn(),
  getSaleById: jest.fn(),
  listSales: jest.fn(),
  getSalesSummary: jest.fn(),
  updateSaleStatus: jest.fn(),
  generateSaleNumber: jest.fn(),
  getFIFOCostLayers: jest.fn(),
  updateCostLayerQuantity: jest.fn(),
  createCostLayer: jest.fn(),
  getProductSalesSummary: jest.fn(),
  getTopSellingProducts: jest.fn(),
  getSalesSummaryByDate: jest.fn(),
  getSalesDetailsReport: jest.fn(),
  getSalesByCashier: jest.fn(),
};

jest.unstable_mockModule('./salesRepository.js', () => ({
  salesRepository: mockSalesRepo,
  default: mockSalesRepo,
}));

jest.unstable_mockModule('../../services/costLayerService.js', () => ({
  getCostLayers: jest.fn().mockResolvedValue([]),
  consumeLayers: jest.fn().mockResolvedValue(undefined),
  calculateFIFOCost: jest.fn().mockResolvedValue(0),
}));

jest.unstable_mockModule('../../services/bankingService.js', () => ({
  BankingService: jest.fn().mockImplementation(() => ({
    recordCashSale: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.unstable_mockModule('../cash-register/index.js', () => ({
  cashRegisterService: {
    recordSaleMovement: jest.fn().mockResolvedValue(undefined),
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
    createSaleJournalEntry: jest.fn().mockResolvedValue(undefined),
    createVoidSaleJournalEntry: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.unstable_mockModule('../../services/accountingApiClient.js', () => ({
  accountingApiClient: {
    postJournalEntry: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.unstable_mockModule('../../services/glEntryService.js', () => ({
  createSaleGLEntries: jest.fn().mockResolvedValue(undefined),
  reverseSaleGLEntries: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../../db/batchFetch.js', () => ({
  batchFetchProducts: jest.fn().mockResolvedValue(new Map()),
  batchFetchProductUoms: jest.fn().mockResolvedValue(new Map()),
}));

const { salesService } = await import('./salesService.js');

// Create mock pool that returns a mock client
const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
} as unknown as PoolClient;

const mockPool = {
  query: jest.fn(),
  connect: jest.fn().mockResolvedValue(mockClient),
} as unknown as Pool;

describe('salesService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockClient.query as jest.Mock).mockResolvedValue({ rows: [] });
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
