/**
 * Unit proof: liquidity funds guard blocks overdraft by GL SSOT.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<(...args: unknown[]) => Promise<{ rows: unknown[] }>>();

jest.unstable_mockModule('../../middleware/errorHandler.js', () => ({
  ValidationError: class ValidationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ValidationError';
    }
  },
}));

const { assertSufficientLiquidityFunds, getLiquidityAvailable } = await import(
  './liquidityFundsGuard.js'
);

describe('liquidityFundsGuard', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  const conn = { query: mockQuery } as unknown as import('pg').Pool;

  it('allows when available >= required', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          AccountName: 'Cash',
          NormalBalance: 'DEBIT',
          debitTotal: '1000',
          creditTotal: '200',
        },
      ],
    });
    await expect(
      assertSufficientLiquidityFunds(conn, '1010', 500, { actionLabel: 'test' }),
    ).resolves.toBeUndefined();
  });

  it('blocks when available < required', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          AccountName: 'Bank',
          NormalBalance: 'DEBIT',
          debitTotal: '100',
          creditTotal: '90',
        },
      ],
    });
    await expect(
      assertSufficientLiquidityFunds(conn, '1030', 50, { actionLabel: 'transfer' }),
    ).rejects.toThrow(/Insufficient funds/);
  });

  it('computes DEBIT normal balance as debit - credit', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          AccountName: 'Cash',
          NormalBalance: 'DEBIT',
          debitTotal: '500',
          creditTotal: '100',
        },
      ],
    });
    const r = await getLiquidityAvailable(conn, '1010');
    expect(r.available).toBe(400);
  });
});
