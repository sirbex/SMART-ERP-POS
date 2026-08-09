/**
 * Exchange path GL: store credit (2210) vs cash refund (tender) vs residual payout.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { JournalEntryRequest } from './accountingCore.js';

type MockFn = (...args: unknown[]) => Promise<unknown>;

let capturedEntries: JournalEntryRequest[] = [];
const createJournalEntryMock = jest.fn<MockFn>(async (request: unknown) => {
  capturedEntries.push(request as JournalEntryRequest);
  return {
    transactionId: 'txn-test-id',
    transactionNumber: 'TXN-000001',
    status: 'POSTED',
    totalDebits: 0,
    totalCredits: 0,
  };
});

jest.unstable_mockModule('./accountingCore.js', () => ({
  AccountingCore: {
    createJournalEntry: createJournalEntryMock,
    reverseTransaction: jest.fn<MockFn>(),
  },
  AccountingError: class extends Error {
    constructor(msg: string, public readonly code: string) {
      super(msg);
      this.name = 'AccountingError';
    }
  },
}));

jest.unstable_mockModule('../db/pool.js', () => {
  const query = jest.fn<MockFn>(async () => ({ rows: [], rowCount: 0 }));
  return {
    pool: {
      query,
      connect: jest.fn<MockFn>(async () => ({
        query,
        release: jest.fn(),
      })),
    },
    default: { query },
  };
});

jest.unstable_mockModule('../utils/logger.js', () => ({
  default: {
    info: jest.fn<MockFn>(),
    error: jest.fn<MockFn>(),
    warn: jest.fn<MockFn>(),
    debug: jest.fn<MockFn>(),
  },
}));

jest.unstable_mockModule('../utils/constants.js', () => ({
  SYSTEM_USER_ID: 'system-user',
}));

jest.unstable_mockModule('../modules/sales/ensureStoreCreditAccount.js', () => ({
  ensureStoreCreditAccount: jest.fn<MockFn>(async () => '2210'),
}));

const {
  AccountCodes,
  recordSaleRefundToGL,
  recordExchangeCreditApplicationToGL,
  recordExchangeResidualPayoutToGL,
} = await import('./glEntryService.js');

describe('Exchange store credit GL', () => {
  beforeEach(() => {
    capturedEntries = [];
    createJournalEntryMock.mockClear();
  });

  it('EXCHANGE refund credits 2210 store credit (not 2200 deposits)', async () => {
    await recordSaleRefundToGL({
      refundId: 'ref-ex-1',
      refundNumber: 'REF-2026-0099',
      saleId: 'sale-1',
      saleNumber: 'SALE-2026-1000',
      refundDate: '2026-08-09',
      reason: 'Wrong product',
      totalAmount: 120000,
      totalCost: 0,
      paymentMethod: 'CARD',
      refundType: 'EXCHANGE',
    });

    const lines = capturedEntries[0].lines;
    const sc = lines.find((l) => l.accountCode === AccountCodes.STORE_CREDIT);
    expect(sc?.creditAmount).toBe(120000);
    expect(lines.find((l) => l.accountCode === AccountCodes.CUSTOMER_DEPOSITS)).toBeUndefined();
    expect(sc?.entityType).toBe('exchange_refund');
    expect(sc?.entityId).toBe('ref-ex-1');
  });

  it('tags customer on exchange when present', async () => {
    await recordSaleRefundToGL({
      refundId: 'ref-ex-2',
      refundNumber: 'REF-2026-0100',
      saleId: 'sale-2',
      saleNumber: 'SALE-2026-1001',
      refundDate: '2026-08-09',
      reason: 'Wrong product',
      totalAmount: 5000,
      totalCost: 0,
      paymentMethod: 'CASH',
      customerId: 'cust-1',
      refundType: 'EXCHANGE',
    });

    const sc = capturedEntries[0].lines.find((l) => l.accountCode === AccountCodes.STORE_CREDIT);
    expect(sc?.entityType).toBe('customer');
    expect(sc?.entityId).toBe('cust-1');
  });

  it('applies exchange credit: DR 2210 CR sales', async () => {
    await recordExchangeCreditApplicationToGL({
      refundId: 'ref-ex-1',
      refundNumber: 'REF-2026-0099',
      saleId: 'sale-new',
      saleNumber: 'SALE-2026-2000',
      applicationDate: '2026-08-09',
      amount: 100000,
    });

    const lines = capturedEntries[0].lines;
    expect(lines.find((l) => l.accountCode === AccountCodes.STORE_CREDIT)?.debitAmount).toBe(100000);
    expect(lines.find((l) => l.accountCode === AccountCodes.SALES_REVENUE)?.creditAmount).toBe(100000);
  });

  it('residual payout: DR 2210 CR tender (card)', async () => {
    await recordExchangeResidualPayoutToGL({
      refundId: 'ref-ex-1',
      refundNumber: 'REF-2026-0099',
      payoutDate: '2026-08-09',
      amount: 20000,
      paymentMethod: 'CARD',
    });

    const lines = capturedEntries[0].lines;
    expect(lines.find((l) => l.accountCode === AccountCodes.STORE_CREDIT)?.debitAmount).toBe(20000);
    expect(lines.find((l) => l.accountCode === AccountCodes.CREDIT_CARD_RECEIPTS)?.creditAmount).toBe(20000);
  });
});
