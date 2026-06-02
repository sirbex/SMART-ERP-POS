import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockSyncOpenItems = jest.fn<() => Promise<{ oldBalance: number; newBalance: number }>>();

jest.unstable_mockModule('../modules/ar-payments/openItemAllocationEngine.js', () => ({
  syncCustomerBalanceFromOpenItems: mockSyncOpenItems,
}));

const { syncCustomerBalanceFromInvoices, syncCustomerArBalance } = await import(
  '../utils/customerBalanceSync.js'
);

describe('customerBalanceSync — Wave 3 SSOT redirect', () => {
  beforeEach(() => {
    mockSyncOpenItems.mockReset();
    mockSyncOpenItems.mockResolvedValue({ oldBalance: 100, newBalance: 80 });
  });

  it('syncCustomerBalanceFromInvoices delegates to open-item engine', async () => {
    const conn = {} as import('pg').PoolClient;
    const result = await syncCustomerBalanceFromInvoices(conn, 'cust-1', 'SALE_REFUND');

    expect(mockSyncOpenItems).toHaveBeenCalledTimes(1);
    expect(mockSyncOpenItems).toHaveBeenCalledWith(conn, 'cust-1', 'SALE_REFUND');
    expect(result).toEqual({ oldBalance: 100, newBalance: 80 });
  });

  it('syncCustomerArBalance is the same redirect', async () => {
    const conn = {} as import('pg').PoolClient;
    await syncCustomerArBalance(conn, 'cust-2', 'INVOICE_CREATED');

    expect(mockSyncOpenItems).toHaveBeenCalledWith(conn, 'cust-2', 'INVOICE_CREATED');
  });
});
