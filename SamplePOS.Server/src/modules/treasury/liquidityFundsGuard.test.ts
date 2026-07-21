/**
 * Unit proof: liquidity funds guard blocks overdraft by GL SSOT.
 * Critical: REVERSED ledger lines must NOT reduce available (LEFT JOIN bug regression).
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
    ).rejects.toThrow(/Not enough money/);
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

  it('SQL must INNER-filter POSTED so REVERSED credits are excluded', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          AccountName: 'Checking Account',
          NormalBalance: 'DEBIT',
          // True POSTED: 1,073,000 debit − 2,000 credit = 1,071,000
          // (Bug used to also sum REVERSED credits 953,000 → available 118,000)
          debitTotal: '1073000',
          creditTotal: '2000',
        },
      ],
    });
    const r = await getLiquidityAvailable(conn, '1030', '2026-07-21');
    expect(r.available).toBe(1071000);

    const sql = String(mockQuery.mock.calls[0]?.[0] ?? '');
    expect(sql).toMatch(/INNER JOIN ledger_transactions/i);
    expect(sql).toMatch(/lt\."Status"\s*=\s*'POSTED'/);
    // Must not put Status only on a LEFT JOIN ON clause (classic understate bug)
    expect(sql).not.toMatch(
      /LEFT JOIN ledger_transactions\s+lt\s+ON[\s\S]*Status\s*=\s*'POSTED'/i,
    );
  });

  it('allows supplier payment when POSTED bank balance covers net cash', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          AccountName: 'Checking Account',
          NormalBalance: 'DEBIT',
          debitTotal: '1073000',
          creditTotal: '2000',
        },
      ],
    });
    await expect(
      assertSufficientLiquidityFunds(conn, '1030', 447910, {
        asOfDate: '2026-07-21',
        actionLabel: 'supplier payment PAY-000003',
      }),
    ).resolves.toBeUndefined();
  });
});
