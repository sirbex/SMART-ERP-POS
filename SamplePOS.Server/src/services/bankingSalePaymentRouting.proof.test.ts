import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Pool, QueryResult } from 'pg';

const mockPool = {
  query: jest.fn<(...args: unknown[]) => Promise<QueryResult>>(),
} as unknown as Pool;

jest.unstable_mockModule('../db/pool.js', () => ({
  pool: mockPool,
}));

jest.unstable_mockModule('../utils/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const { BankingService } = await import('./bankingService.js');

function qResult(rows: unknown[]): QueryResult {
  return { rows, rowCount: rows.length, command: '', oid: 0, fields: [] } as QueryResult;
}

describe('BankingService.createFromSale payment routing proof', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('routes AIRTEL_MONEY sale deposits to the mobile money GL account', async () => {
    const createTransactionSpy = jest
      .spyOn(BankingService, 'createTransaction')
      .mockResolvedValue({ id: 'txn-1' } as never);

    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce(qResult([]))
      .mockResolvedValueOnce(qResult([{ id: 'bank-account-1040' }]))
      .mockResolvedValueOnce(qResult([{ id: 'sales-deposit-category' }]));

    await BankingService.createFromSale(
      'sale-1',
      'SALE-2026-0001',
      25000,
      'AIRTEL_MONEY',
      '2026-07-29T09:00:00.000Z',
      mockPool,
    );

    expect((mockPool.query as jest.Mock).mock.calls[1]?.[1]).toEqual(['1040']);
    expect(createTransactionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        bankAccountId: 'bank-account-1040',
        categoryId: 'sales-deposit-category',
        type: 'DEPOSIT',
        amount: 25000,
        reference: 'SALE-2026-0001',
      }),
      expect.any(String),
      mockPool,
    );
  });
});
