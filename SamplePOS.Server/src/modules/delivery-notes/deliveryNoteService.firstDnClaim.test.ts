/**
 * P6 service test — deliveryNoteService.createDeliveryNote claims the source
 * quotation atomically via markQuotationAsConvertedToFirstDN.
 *
 * Pins the lifecycle invariants:
 *   - HAPPY PATH: first DN on an ACCEPTED wholesale quote calls the claim
 *     exactly once, with the new DN's id.
 *   - SUBSEQUENT DN: second DN on a CONVERTED quote (where converted_to_dn_id
 *     is already set) succeeds; the claim is still invoked but the repo
 *     reports alreadyClaimed=true and the service ignores that silently.
 *   - RETAIL/SO LOCK: a CONVERTED quote claimed by retail sale or
 *     Distribution SO must throw ConflictError BEFORE any DN row is written
 *     and BEFORE the claim is invoked.
 *   - TERMINAL STATUSES: CANCELLED / REJECTED / EXPIRED are rejected before
 *     any write.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { Pool, PoolClient } from 'pg';

type MockFn = (...args: unknown[]) => Promise<unknown>;

// --- mocks ---------------------------------------------------------------

const mockDnRepo = {
  create: jest.fn<MockFn>(),
  addLine: jest.fn<MockFn>(),
  recalcTotal: jest.fn<MockFn>(),
  getById: jest.fn<MockFn>(),
};

const mockQuotationRepo = {
  markQuotationAsConvertedToFirstDN: jest.fn<MockFn>(),
};

const mockDocFlow = {
  linkDocuments: jest.fn<MockFn>().mockResolvedValue(undefined),
};

// Stateful client.query mock — routes by SQL fragment so each scenario
// supplies just the quotation row shape it cares about.
let quotationRow: Record<string, unknown> | null = null;
let distSoRows: Array<{ order_number: string }> = [];
let quotationItemsRows: Array<Record<string, unknown>> = [];

const mockClient = {
  query: jest.fn<MockFn>(),
  release: jest.fn(),
} as unknown as PoolClient;

const installQueryRouter = () => {
  (mockClient.query as jest.Mock<MockFn>).mockImplementation(async (sql: unknown) => {
    const s = String(sql);
    if (/FROM quotations\s+WHERE id = \$1 FOR UPDATE/i.test(s)) {
      return { rows: quotationRow ? [quotationRow] : [], rowCount: quotationRow ? 1 : 0 };
    }
    if (/dist_sales_orders/i.test(s)) {
      return { rows: distSoRows, rowCount: distSoRows.length };
    }
    if (/FROM quotation_items qi/i.test(s)) {
      return { rows: quotationItemsRows, rowCount: quotationItemsRows.length };
    }
    return { rows: [], rowCount: 0 };
  });
};

const mockPool = {
  connect: jest.fn(async () => mockClient),
  query: jest.fn<MockFn>().mockResolvedValue({ rows: [] }),
} as unknown as Pool;

jest.unstable_mockModule('./deliveryNoteRepository.js', () => ({
  deliveryNoteRepository: mockDnRepo,
}));

jest.unstable_mockModule('../quotations/quotationRepository.js', () => ({
  quotationRepository: mockQuotationRepo,
  default: mockQuotationRepo,
}));

jest.unstable_mockModule('../document-flow/documentFlowService.js', () => mockDocFlow);

jest.unstable_mockModule('../../db/unitOfWork.js', () => ({
  UnitOfWork: {
    run: async <T>(_p: Pool, fn: (c: PoolClient) => Promise<T>): Promise<T> => fn(mockClient),
    savepoint: async <T>(_c: PoolClient, _n: string, fn: (c: PoolClient) => Promise<T>) => fn(mockClient),
  },
}));

jest.unstable_mockModule('../../utils/fefoDeduction.js', () => ({
  deductStockFEFO: jest.fn<MockFn>().mockResolvedValue([]),
}));

jest.unstable_mockModule('../../services/glEntryService.js', () => ({
  recordDeliveryNoteGoodsIssueToGL: jest.fn<MockFn>().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('./deliveryNoteUom.js', () => ({
  resolveDeliveryLineBaseQuantity: jest.fn(() => 1),
}));

jest.unstable_mockModule('../../utils/dateRange.js', () => ({
  getBusinessDate: () => '2026-06-20',
}));

// --- fixtures ------------------------------------------------------------

const acceptedQuote = () => ({
  id: 'q-1',
  quote_number: 'Q-2026-0500',
  customer_id: 'cust-1',
  customer_name: 'Acme Co',
  fulfillment_mode: 'WHOLESALE',
  status: 'ACCEPTED',
  converted_to_sale_id: null,
  converted_to_so_id: null,
  converted_to_dn_id: null,
});

const convertedViaDn = () => ({ ...acceptedQuote(), status: 'CONVERTED', converted_to_dn_id: 'dn-prev' });
const convertedViaSale = () => ({ ...acceptedQuote(), status: 'CONVERTED', converted_to_sale_id: 'sale-x' });
const convertedViaSo = () => ({ ...acceptedQuote(), status: 'CONVERTED', converted_to_so_id: 'so-x' });

const validItems = () => [{
  id: 'qi-1',
  product_id: 'prod-1',
  description: 'Widget',
  quantity: '10',
  delivered_quantity: '0',
  unit_price: '100',
  uom_id: null,
  uom_name: null,
  unit_cost: '50',
  product_type: 'goods',
  pending_quantity: '0',
}];

const validDnPayload = () => ({
  quotationId: 'q-1',
  deliveryDate: '2026-06-20',
  warehouseNotes: null,
  deliveryAddress: null,
  driverName: null,
  vehicleNumber: null,
  createdById: 'user-1',
  lines: [{
    quotationItemId: 'qi-1',
    productId: 'prod-1',
    batchId: null,
    uomId: null,
    uomName: null,
    quantityDelivered: 5,
    unitPrice: 100,
    unitCost: 50,
    description: 'Widget',
  }],
});

// --- tests ---------------------------------------------------------------

describe('deliveryNoteService.createDeliveryNote — P6 first-DN atomic claim', () => {
  let deliveryNoteService: typeof import('./deliveryNoteService.js').deliveryNoteService;

  beforeEach(async () => {
    jest.clearAllMocks();
    installQueryRouter();
    quotationRow = null;
    distSoRows = [];
    quotationItemsRows = validItems();

    mockDnRepo.create.mockResolvedValue({ id: 'dn-new' });
    mockDnRepo.addLine.mockResolvedValue(undefined);
    mockDnRepo.recalcTotal.mockResolvedValue(undefined);
    mockDnRepo.getById.mockResolvedValue({ id: 'dn-new', lines: [] });

    const mod = await import('./deliveryNoteService.js');
    deliveryNoteService = mod.deliveryNoteService;
  });

  it('first DN on an ACCEPTED quote: claim is invoked with the new DN id', async () => {
    quotationRow = acceptedQuote();
    mockQuotationRepo.markQuotationAsConvertedToFirstDN.mockResolvedValue({
      alreadyClaimed: false,
      row: { ...quotationRow, status: 'CONVERTED', converted_to_dn_id: 'dn-new' },
    });

    await deliveryNoteService.createDeliveryNote(mockPool, validDnPayload());

    expect(mockQuotationRepo.markQuotationAsConvertedToFirstDN).toHaveBeenCalledTimes(1);
    expect(mockQuotationRepo.markQuotationAsConvertedToFirstDN).toHaveBeenCalledWith(
      mockClient,
      'q-1',
      'dn-new',
    );
    expect(mockDnRepo.create).toHaveBeenCalledTimes(1);
  });

  it('subsequent DN on a CONVERTED+dn quote: claim returns alreadyClaimed, service still succeeds', async () => {
    quotationRow = convertedViaDn();
    mockQuotationRepo.markQuotationAsConvertedToFirstDN.mockResolvedValue({
      alreadyClaimed: true,
      row: null,
    });

    const result = await deliveryNoteService.createDeliveryNote(mockPool, validDnPayload());

    expect(result).toEqual({ id: 'dn-new', lines: [] });
    expect(mockQuotationRepo.markQuotationAsConvertedToFirstDN).toHaveBeenCalledTimes(1);
    expect(mockDnRepo.create).toHaveBeenCalledTimes(1);
  });

  it('CONVERTED quote claimed by retail sale: ConflictError BEFORE any DN write or claim', async () => {
    quotationRow = convertedViaSale();

    await expect(deliveryNoteService.createDeliveryNote(mockPool, validDnPayload()))
      .rejects.toThrow(/converted to sale sale-x/);

    expect(mockDnRepo.create).not.toHaveBeenCalled();
    expect(mockQuotationRepo.markQuotationAsConvertedToFirstDN).not.toHaveBeenCalled();
  });

  it('CONVERTED quote claimed by Distribution SO: ConflictError BEFORE any DN write or claim', async () => {
    quotationRow = convertedViaSo();

    await expect(deliveryNoteService.createDeliveryNote(mockPool, validDnPayload()))
      .rejects.toThrow(/distribution sales order so-x/);

    expect(mockDnRepo.create).not.toHaveBeenCalled();
    expect(mockQuotationRepo.markQuotationAsConvertedToFirstDN).not.toHaveBeenCalled();
  });

  it.each([
    ['CANCELLED'],
    ['REJECTED'],
    ['EXPIRED'],
  ])('terminal status %s: ConflictError, no DN write, no claim', async (status) => {
    quotationRow = { ...acceptedQuote(), status };

    await expect(deliveryNoteService.createDeliveryNote(mockPool, validDnPayload()))
      .rejects.toThrow(new RegExp(status));

    expect(mockDnRepo.create).not.toHaveBeenCalled();
    expect(mockQuotationRepo.markQuotationAsConvertedToFirstDN).not.toHaveBeenCalled();
  });
});
