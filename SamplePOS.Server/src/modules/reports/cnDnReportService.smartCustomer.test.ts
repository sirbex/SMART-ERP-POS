import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import type { Pool } from 'pg';
import type { SmartStatementEntry } from './cnDnReportTypes.js';

type AnyMock = jest.Mock<(...args: unknown[]) => Promise<unknown>>;

jest.unstable_mockModule('./cnDnReportRepository.js', () => ({
  getCustomerStatementOpeningBalance: jest.fn(),
  getSmartCustomerStatementEntries: jest.fn(),
  getCustomerReversedAllocationEntries: jest.fn(),
  getCustomerUnallocatedReceipts: jest.fn(),
}));

const repo = (await import('./cnDnReportRepository.js')) as unknown as {
  getCustomerStatementOpeningBalance: AnyMock;
  getSmartCustomerStatementEntries: AnyMock;
  getCustomerReversedAllocationEntries: AnyMock;
  getCustomerUnallocatedReceipts: AnyMock;
};

const { getSmartCustomerStatementData } = await import('./cnDnReportService.js');

describe('getSmartCustomerStatementData', () => {
  const customerId = '11111111-1111-1111-1111-111111111111';
  const mockPool = {
    query: jest.fn<(...args: unknown[]) => Promise<{ rows: unknown[] }>>(),
  } as unknown as Pool;

  beforeEach(() => {
    jest.resetAllMocks();
    (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{ name: 'Acme Ltd' }] });
    (repo.getCustomerStatementOpeningBalance as AnyMock).mockResolvedValue(100000);
    (repo.getCustomerReversedAllocationEntries as AnyMock).mockResolvedValue([]);
    (repo.getCustomerUnallocatedReceipts as AnyMock).mockResolvedValue({
      total: 5000,
      receipts: [{ paymentId: 'pay-1', paymentNumber: 'CRP-000001', paymentDate: '2026-01-15', unallocatedAmount: 5000 }],
    });
    (repo.getSmartCustomerStatementEntries as AnyMock).mockResolvedValue([
      {
        date: '2026-01-05',
        particulars: 'Customer invoice issued',
        vchType: 'Invoice',
        vchNo: 'INV-2026-0001',
        debit: 50000,
        credit: 0,
        balanceAfter: 0,
        itemStatus: 'Unpaid',
        transactionId: 'tx-1',
        referenceType: 'INVOICE',
        isReversed: false,
      },
      {
        date: '2026-01-10',
        particulars: 'Payment received',
        vchType: 'Payment',
        vchNo: 'RCPT-0001',
        debit: 0,
        credit: 20000,
        balanceAfter: 0,
        itemStatus: 'Paid',
        transactionId: 'tx-2',
        referenceType: 'INVOICE_PAYMENT',
        isReversed: false,
      },
    ] satisfies SmartStatementEntry[]);
  });

  test('computes running balance from GL opening + period entries', async () => {
    const data = await getSmartCustomerStatementData(
      mockPool,
      customerId,
      '2026-01-01',
      '2026-01-31',
    );

    expect(data.customerId).toBe(customerId);
    expect(data.customerName).toBe('Acme Ltd');
    expect(data.openingBalance).toBe(100000);
    expect(data.entries[0].balanceAfter).toBe(150000);
    expect(data.entries[1].balanceAfter).toBe(130000);
    expect(data.closingBalance).toBe(130000);
    expect(data.openItemEntries).toEqual([]);
    expect(data.unallocatedReceiptsTotal).toBe(5000);
    expect(data.unallocatedReceipts).toHaveLength(1);
  });

  test('throws when customer not found', async () => {
    (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });
    await expect(
      getSmartCustomerStatementData(mockPool, customerId, '2026-01-01', '2026-01-31'),
    ).rejects.toThrow('Customer not found');
  });
});
