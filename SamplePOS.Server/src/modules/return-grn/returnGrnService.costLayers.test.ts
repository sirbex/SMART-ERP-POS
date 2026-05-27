import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import type { Pool, PoolClient } from 'pg';

type AnyMock = jest.Mock<(...args: unknown[]) => Promise<unknown>>;

const mockDeductFromCostLayers = jest.fn<AnyMock>().mockResolvedValue(undefined);
const mockRecordMovement = jest.fn<AnyMock>().mockResolvedValue(undefined);
const mockSyncProductQuantity = jest.fn<AnyMock>().mockResolvedValue(undefined);
const mockRecordReturnGrnToGL = jest.fn<AnyMock>().mockResolvedValue(undefined);

const mockRgrn = {
  id: 'rgrn-1',
  returnGrnNumber: 'RGRN-2026-0001',
  grnId: 'grn-1',
  supplierId: 'sup-1',
  supplierName: 'Supplier A',
  grNumber: 'GR-2026-0001',
  returnDate: '2026-05-01',
  status: 'DRAFT' as const,
  reason: 'Damaged goods',
  createdBy: 'user-1',
  createdAt: '2026-05-01',
  updatedAt: '2026-05-01',
};

const mockLine = {
  id: 'line-1',
  rgrnId: 'rgrn-1',
  productId: 'prod-1',
  productName: 'Test Product',
  batchId: 'batch-1',
  batchNumber: 'B-001',
  uomId: null,
  uomName: null,
  uomSymbol: null,
  conversionFactor: 1,
  quantity: 5,
  baseQuantity: 5,
  unitCost: 100,
  lineTotal: 500,
};

const mockReturnableRow = {
  grItemId: 'gri-1',
  productId: 'prod-1',
  productName: 'Test Product',
  batchId: 'batch-1',
  batchNumber: 'B-001',
  expiryDate: null,
  uomId: null,
  uomName: null,
  uomSymbol: null,
  conversionFactor: 1,
  receivedQuantity: 100,
  unitCost: 100,
  returnedQuantity: 0,
  documentReturnableQuantity: 100,
  onHandQuantity: 100,
  consumedQuantity: 0,
  returnableQuantity: 100,
  returnBlockReason: null,
};

jest.unstable_mockModule('./returnGrnRepository.js', () => ({
  returnGrnRepository: {
    getById: jest.fn<AnyMock>().mockResolvedValue(mockRgrn),
    getLines: jest.fn<AnyMock>().mockResolvedValue([mockLine]),
    getReturnedQuantity: jest.fn<AnyMock>().mockResolvedValue(0),
    getReturnableItems: jest.fn<AnyMock>().mockResolvedValue([mockReturnableRow]),
    post: jest.fn<AnyMock>().mockResolvedValue({ ...mockRgrn, status: 'POSTED' }),
  },
}));

jest.unstable_mockModule('../stock-movements/stockMovementRepository.js', () => ({
  recordMovement: mockRecordMovement,
}));

jest.unstable_mockModule('../../services/costLayerService.js', () => ({
  deductFromCostLayers: mockDeductFromCostLayers,
}));

jest.unstable_mockModule('../credit-debit-notes/creditDebitNoteService.js', () => ({
  supplierCreditDebitNoteService: {},
  customerCreditDebitNoteService: {},
}));

jest.unstable_mockModule('../credit-debit-notes/creditDebitNoteRepository.js', () => ({
  supplierCreditDebitNoteRepository: {},
}));

jest.unstable_mockModule('../document-flow/documentFlowService.js', () => ({}));

jest.unstable_mockModule('../../services/glEntryService.js', () => ({
  recordReturnGrnToGL: mockRecordReturnGrnToGL,
  recordSupplierCreditNoteToGL: jest.fn<AnyMock>().mockResolvedValue(undefined),
  recordCustomerCreditNoteToGL: jest.fn<AnyMock>().mockResolvedValue(undefined),
  AccountCodes: {},
}));

jest.unstable_mockModule('../../utils/inventorySync.js', () => ({
  syncProductQuantity: mockSyncProductQuantity,
}));

const mockClient = {
  query: jest.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(),
} as unknown as PoolClient;

jest.unstable_mockModule('../../db/unitOfWork.js', () => ({
  UnitOfWork: {
    run: jest.fn(async (_pool: unknown, fn: (client: PoolClient) => Promise<unknown>) => fn(mockClient)),
  },
}));

const { returnGrnService } = await import('./returnGrnService.js');

describe('returnGrnService.post cost_layers sync', () => {
  const pool = {} as Pool;

  beforeEach(() => {
    jest.clearAllMocks();
    (mockClient.query as jest.Mock).mockImplementation(async (sql: string) => {
      const s = String(sql);
      if (s.includes('costing_method')) {
        return { rows: [{ costing_method: 'FIFO' }] };
      }
      if (s.includes('SELECT COALESCE(SUM(gri.received_quantity)')) {
        return { rows: [{ received: 100 }] };
      }
      if (s.includes('UPDATE inventory_batches')) {
        return { rows: [{ remaining_quantity: 95, cost_price: 100 }] };
      }
      if (s.includes('has_invoice')) {
        return { rows: [{ has_invoice: false }] };
      }
      if (s.includes('FROM goods_receipts g')) {
        return { rows: [{ supplier_id: 'sup-1', supplier_name: 'Supplier A', gr_number: 'GR-2026-0001' }] };
      }
      return { rows: [] };
    });
  });

  test('deducts FIFO cost_layers inside the same transaction as inventory', async () => {
    await returnGrnService.post(pool, 'rgrn-1');

    expect(mockDeductFromCostLayers).toHaveBeenCalledTimes(1);
    expect(mockDeductFromCostLayers).toHaveBeenCalledWith(
      'prod-1',
      5,
      'FIFO',
      undefined,
      mockClient,
    );
    expect(mockRecordMovement).toHaveBeenCalled();
    expect(mockRecordReturnGrnToGL).toHaveBeenCalled();
  });

  test('skips cost_layers for AVCO products', async () => {
    (mockClient.query as jest.Mock).mockImplementation(async (sql: string) => {
      const s = String(sql);
      if (s.includes('costing_method')) {
        return { rows: [{ costing_method: 'AVCO' }] };
      }
      if (s.includes('SELECT COALESCE(SUM(gri.received_quantity)')) {
        return { rows: [{ received: 100 }] };
      }
      if (s.includes('UPDATE inventory_batches')) {
        return { rows: [{ remaining_quantity: 95, cost_price: 100 }] };
      }
      if (s.includes('has_invoice')) {
        return { rows: [{ has_invoice: false }] };
      }
      if (s.includes('FROM goods_receipts g')) {
        return { rows: [{ supplier_id: 'sup-1', supplier_name: 'Supplier A', gr_number: 'GR-2026-0001' }] };
      }
      return { rows: [] };
    });

    await returnGrnService.post(pool, 'rgrn-1');

    expect(mockDeductFromCostLayers).not.toHaveBeenCalled();
  });
});
