/**
 * Regression — DN goods-issue posting must call assertInventoryCouplingUnchanged
 * with a snapshot captured AFTER the COGS GL post, not the snapshot taken
 * between FEFO deduction and GL posting.
 *
 * The earlier `couplingAfterIssue` snapshot exists to feed
 * resolveGl1300FromBatchSubledgerDelta (the delta drives the GL amount); at
 * that point batch valuation has dropped by C while GL 1300 is still unchanged
 * so the gap has shifted by +C. Re-using that snapshot in the final assertion
 * always rolled back every DN with ERR_INVENTORY_GL_COUPLING. The fix is a
 * fresh capture taken AFTER recordDeliveryNoteGoodsIssueToGL has restored the
 * coupling.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { Pool, PoolClient } from 'pg';
import Decimal from 'decimal.js';

type MockFn = (...args: unknown[]) => Promise<unknown>;

// --- mocks ---------------------------------------------------------------

const mockDnRepo = {
  recalcTotal: jest.fn<MockFn>().mockResolvedValue(undefined),
  markPosted: jest.fn<MockFn>().mockResolvedValue(undefined),
  getById: jest.fn<MockFn>(),
  syncDeliveredQuantity: jest.fn<MockFn>().mockResolvedValue(undefined),
};

// Tracks the order in which capture / GL-post / assert are called so the test
// can pin the canonical sequence. Without this, a regression that simply
// re-orders the operations (rather than re-using the stale snapshot) could
// still silently break the SAP LUW guarantee.
const eventLog: string[] = [];

// Each capture returns a snapshot whose `gap` value encodes which call it was
// — that way the assertion's `after` argument identity is verifiable.
const captureCalls = { n: 0 };
const captureMock = jest.fn(async () => {
  captureCalls.n += 1;
  eventLog.push(`capture#${captureCalls.n}`);
  return { glNet1300: 0, batchValuation: 0, gap: captureCalls.n };
});

const assertMock = jest.fn();
const resolveDeltaMock = jest.fn(() => 50); // exact cost from subledger delta
const documentDiffersMock = jest.fn(() => false);

jest.unstable_mockModule('../../services/inventorySubledgerCoupling.js', () => ({
  captureInventoryCoupling: captureMock,
  assertInventoryCouplingUnchanged: assertMock,
  resolveGl1300FromBatchSubledgerDelta: resolveDeltaMock,
  documentTotalDiffersFromSubledger: documentDiffersMock,
  INVENTORY_COUPLING_TOLERANCE: 0.01,
}));

const recordGlMock = jest.fn(async () => {
  eventLog.push('gl-post');
});

jest.unstable_mockModule('../../services/glEntryService.js', () => ({
  recordDeliveryNoteGoodsIssueToGL: recordGlMock,
}));

jest.unstable_mockModule('../../utils/fefoDeduction.js', () => ({
  deductStockFEFO: jest.fn(async () => {
    eventLog.push('fefo');
    return { totalCost: new Decimal(50), batchCount: 1, batches: [] };
  }),
}));

jest.unstable_mockModule('./deliveryNoteRepository.js', () => ({
  deliveryNoteRepository: mockDnRepo,
}));

jest.unstable_mockModule('./deliveryNoteUom.js', () => ({
  resolveDeliveryLineBaseQuantity: jest.fn(async () => ({ baseQuantity: 1, uomId: null, uomName: null })),
}));

jest.unstable_mockModule('../../utils/dateRange.js', () => ({
  getBusinessDate: () => '2026-06-20',
  BUSINESS_TIMEZONE: 'Africa/Kampala',
  toUtcRange: () => ({ utcStart: new Date(), utcEnd: new Date() }),
  getBusinessYear: () => 2026,
  addDaysToDateString: (s: string) => s,
  formatDateBusiness: () => '2026-06-20',
  formatBusinessTimestamp: () => '2026-06-20T00:00:00',
}));

// UnitOfWork hands the service our mock client directly
const mockClient = {
  query: jest.fn<MockFn>(),
  release: jest.fn(),
} as unknown as PoolClient;

jest.unstable_mockModule('../../db/unitOfWork.js', () => ({
  UnitOfWork: {
    run: async <T>(_p: Pool, fn: (c: PoolClient) => Promise<T>): Promise<T> => fn(mockClient),
  },
}));

const mockPool = { connect: jest.fn(async () => mockClient) } as unknown as Pool;

// --- tests ---------------------------------------------------------------

describe('deliveryNoteService.postDeliveryNote — inventory coupling assertion', () => {
  let deliveryNoteService: typeof import('./deliveryNoteService.js').deliveryNoteService;

  beforeEach(async () => {
    jest.clearAllMocks();
    eventLog.length = 0;
    captureCalls.n = 0;

    // Reset capture mock implementation (jest.clearAllMocks clears call history
    // but module-level closures retain the implementation we set above).
    captureMock.mockImplementation(async () => {
      captureCalls.n += 1;
      eventLog.push(`capture#${captureCalls.n}`);
      return { glNet1300: 0, batchValuation: 0, gap: captureCalls.n };
    });
    recordGlMock.mockImplementation(async () => {
      eventLog.push('gl-post');
    });

    (mockClient.query as jest.Mock<MockFn>).mockImplementation(async (sql: unknown) => {
      const s = String(sql);
      if (/FROM delivery_notes WHERE id = \$1 FOR UPDATE/i.test(s)) {
        return {
          rows: [{
            id: 'dn-1',
            delivery_note_number: 'DN-2026-0014',
            status: 'DRAFT',
            quotation_id: 'q-1',
          }],
          rowCount: 1,
        };
      }
      if (/FROM delivery_note_lines WHERE delivery_note_id = \$1/i.test(s)) {
        return {
          rows: [{
            id: 'dnl-1',
            product_id: 'prod-1',
            quotation_item_id: 'qi-1',
            quantity_delivered: '1',
            batch_id: null,
            uom_id: null,
          }],
          rowCount: 1,
        };
      }
      if (/FROM quotation_items WHERE id = \$1 FOR UPDATE/i.test(s)) {
        return {
          rows: [{ quantity: '10', delivered_quantity: '0', description: 'Widget' }],
          rowCount: 1,
        };
      }
      if (/FROM products WHERE id = \$1/i.test(s)) {
        return { rows: [{ name: 'Widget' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    mockDnRepo.getById.mockResolvedValue({
      id: 'dn-1',
      deliveryNoteNumber: 'DN-2026-0014',
      totalAmount: 100,
    });

    const mod = await import('./deliveryNoteService.js');
    deliveryNoteService = mod.deliveryNoteService;
  });

  it('captures three coupling snapshots and asserts on the post-GL snapshot', async () => {
    await deliveryNoteService.postDeliveryNote(mockPool, 'dn-1', 'user-1');

    // Exactly three captures: before FEFO, after FEFO (drives GL amount), after GL.
    expect(captureMock).toHaveBeenCalledTimes(3);

    // Canonical SAP LUW order: deduct → capture-delta → post-GL → capture-final → assert.
    const order = eventLog.filter(e => e.startsWith('capture') || e === 'fefo' || e === 'gl-post');
    expect(order).toEqual(['capture#1', 'fefo', 'capture#2', 'gl-post', 'capture#3']);

    // Assertion received the FINAL snapshot (gap=3), NOT the mid snapshot (gap=2).
    expect(assertMock).toHaveBeenCalledTimes(1);
    const [beforeArg, afterArg] = assertMock.mock.calls[0] as [
      { gap: number },
      { gap: number },
      string,
    ];
    expect(beforeArg.gap).toBe(1);
    expect(afterArg.gap).toBe(3);
  });

  it('skips GL posting when cost is zero but still asserts with a fresh snapshot', async () => {
    resolveDeltaMock.mockReturnValueOnce(0);

    await deliveryNoteService.postDeliveryNote(mockPool, 'dn-1', 'user-1');

    expect(recordGlMock).not.toHaveBeenCalled();
    // Still 3 captures — the assertion's snapshot is captured fresh even when
    // no GL post happens, so a future GL side-effect (audit trigger removal,
    // background reconciler, etc.) is detected.
    expect(captureMock).toHaveBeenCalledTimes(3);
    const [, afterArg] = assertMock.mock.calls[0] as [unknown, { gap: number }, string];
    expect(afterArg.gap).toBe(3);
  });
});
