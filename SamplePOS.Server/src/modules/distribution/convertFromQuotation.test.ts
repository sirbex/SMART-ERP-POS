/**
 * P3 regression test: distService.convertFromQuotation (wholesale path).
 *
 * Pins three invariants:
 *   1. Conversion writes to the new `converted_to_so_id` FK via the dedicated
 *      `markQuotationAsConvertedToSO` repo method (NOT the retail
 *      `markQuotationAsConverted`).
 *   2. The convert-once guard rejects (ConflictError) when the source
 *      quotation was already consumed by EITHER the retail or wholesale path.
 *   3. SO creation and quotation claim run inside a SINGLE UnitOfWork.run —
 *      no torn writes, no orphan SO if the claim fails.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { Pool, PoolClient } from 'pg';

type MockFn = (...args: unknown[]) => Promise<unknown>;

// --- mocks ----------------------------------------------------------------

const mockDistRepo = {
  getAtpForProducts: jest.fn<MockFn>(),
  createSalesOrder: jest.fn<MockFn>(),
  addSalesOrderLine: jest.fn<MockFn>(),
  getSalesOrder: jest.fn<MockFn>(),
  getSalesOrderLines: jest.fn<MockFn>(),
};

const mockQuotationRepo = {
  getQuotationById: jest.fn<MockFn>(),
  markQuotationAsConverted: jest.fn<MockFn>(),
  markQuotationAsConvertedToSO: jest.fn<MockFn>(),
};

const mockClient = {
  query: jest.fn<MockFn>().mockResolvedValue({ rows: [], rowCount: 0 }),
  release: jest.fn(),
} as unknown as PoolClient;

const mockPool = {
  connect: jest.fn(async () => mockClient),
  query: jest.fn<MockFn>().mockResolvedValue({ rows: [] }),
} as unknown as Pool;

let unitOfWorkRunCalls = 0;

jest.unstable_mockModule('./distRepository.js', () => mockDistRepo);

jest.unstable_mockModule('../quotations/quotationRepository.js', () => ({
  quotationRepository: mockQuotationRepo,
  default: mockQuotationRepo,
}));

jest.unstable_mockModule('../../db/unitOfWork.js', () => ({
  UnitOfWork: {
    run: async <T>(_pool: Pool, fn: (c: PoolClient) => Promise<T>): Promise<T> => {
      unitOfWorkRunCalls += 1;
      return fn(mockClient);
    },
    savepoint: async <T>(_c: PoolClient, _name: string, fn: (c: PoolClient) => Promise<T>) => fn(mockClient),
  },
}));

jest.unstable_mockModule('../../utils/dateRange.js', () => ({
  getBusinessDate: () => '2026-06-20',
  BUSINESS_TIMEZONE: 'UTC',
  toUtcRange: (from: string, to: string) => ({ startUtc: from, endUtc: to }),
  getBusinessYear: () => 2026,
  addDaysToDateString: (d: string) => d,
}));

jest.unstable_mockModule('../../services/glEntryService.js', () => ({
  recordCustomerInvoiceToGL: jest.fn<MockFn>().mockResolvedValue(undefined),
  recordInvoicePaymentToGL: jest.fn<MockFn>().mockResolvedValue(undefined),
  recordDownPaymentClearingToGL: jest.fn<MockFn>().mockResolvedValue(undefined),
  AccountCodes: {},
}));

jest.unstable_mockModule('../../services/accountingCore.js', () => ({
  AccountingCore: {},
}));

// --- fixtures -------------------------------------------------------------

const baseQuotation = {
  id: 'q-uuid',
  quote_number: 'Q-2026-0099',
  customer_id: 'cust-1',
  fulfillment_mode: 'WHOLESALE' as const,
  status: 'ACCEPTED' as const,
  valid_until: '2099-12-31',
  converted_to_sale_id: null as string | null,
  converted_to_so_id: null as string | null,
};

const baseItems = [
  { product_id: 'prod-1', quantity: '5', unit_price: '1000', item_status: 'ACCEPTED' },
];

// --- tests ----------------------------------------------------------------

describe('distService.convertFromQuotation — wholesale convert-once SSOT (P3)', () => {
  let convertFromQuotation: typeof import('./distService.js').convertFromQuotation;

  beforeEach(async () => {
    jest.clearAllMocks();
    unitOfWorkRunCalls = 0;

    mockQuotationRepo.getQuotationById.mockResolvedValue({
      quotation: { ...baseQuotation },
      items: [...baseItems],
    });
    mockDistRepo.getAtpForProducts.mockResolvedValue([{ product_id: 'prod-1', atp: '100' }]);
    mockDistRepo.createSalesOrder.mockResolvedValue('so-uuid');
    mockDistRepo.addSalesOrderLine.mockResolvedValue(undefined);
    mockDistRepo.getSalesOrder.mockResolvedValue({
      id: 'so-uuid',
      order_number: 'DSO-2026-0001',
      customer_id: 'cust-1',
      status: 'OPEN',
      order_date: '2026-06-20',
      notes: null,
      created_by: 'user-1',
      created_at: new Date(),
      updated_at: new Date(),
    });
    mockDistRepo.getSalesOrderLines.mockResolvedValue([]);
    mockQuotationRepo.markQuotationAsConvertedToSO.mockResolvedValue({ ...baseQuotation, status: 'CONVERTED' });

    const mod = await import('./distService.js');
    convertFromQuotation = mod.convertFromQuotation;
  });

  it('claims the quotation via markQuotationAsConvertedToSO (not the retail method)', async () => {
    await convertFromQuotation(mockPool, 'q-uuid', 'user-1');

    expect(mockQuotationRepo.markQuotationAsConvertedToSO).toHaveBeenCalledTimes(1);
    expect(mockQuotationRepo.markQuotationAsConverted).not.toHaveBeenCalled();

    const [client, qid, soId] = mockQuotationRepo.markQuotationAsConvertedToSO.mock.calls[0];
    expect(client).toBe(mockClient);
    expect(qid).toBe('q-uuid');
    expect(soId).toBe('so-uuid');
  });

  it('runs SO insert and quotation claim inside a SINGLE UnitOfWork', async () => {
    await convertFromQuotation(mockPool, 'q-uuid', 'user-1');

    expect(unitOfWorkRunCalls).toBe(1);
    // Both writes were issued against the SAME client instance:
    expect(mockDistRepo.createSalesOrder.mock.calls[0][0]).toBe(mockClient);
    expect(mockQuotationRepo.markQuotationAsConvertedToSO.mock.calls[0][0]).toBe(mockClient);
  });

  it('rejects if the quotation was already converted to a retail sale', async () => {
    mockQuotationRepo.getQuotationById.mockResolvedValue({
      quotation: { ...baseQuotation, converted_to_sale_id: 'existing-sale' },
      items: [...baseItems],
    });

    await expect(convertFromQuotation(mockPool, 'q-uuid', 'user-1')).rejects.toThrow(
      /already been converted to sale/i,
    );
    expect(mockDistRepo.createSalesOrder).not.toHaveBeenCalled();
  });

  it('rejects if the quotation was already converted to a wholesale SO', async () => {
    mockQuotationRepo.getQuotationById.mockResolvedValue({
      quotation: { ...baseQuotation, converted_to_so_id: 'existing-so' },
      items: [...baseItems],
    });

    await expect(convertFromQuotation(mockPool, 'q-uuid', 'user-1')).rejects.toThrow(
      /already been converted to a distribution sales order/i,
    );
    expect(mockDistRepo.createSalesOrder).not.toHaveBeenCalled();
  });
});
