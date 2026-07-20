/**
 * Bank GL liquidity tag — deposit path must never fail for untagged bank books.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import type { PoolClient, QueryResult } from 'pg';

jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const { ensureBankGlLiquidityTag, RESERVED_LIQUIDITY_TAGS } = await import(
  './ensureBankGlLiquidityTag.js'
);

function qResult(rows: unknown[]): QueryResult {
  return { rows, rowCount: rows.length, command: '', oid: 0, fields: [] } as QueryResult;
}

describe('ensureBankGlLiquidityTag', () => {
  const query = jest.fn<(...args: unknown[]) => Promise<QueryResult>>();
  const client = { query } as unknown as PoolClient;

  beforeEach(() => {
    query.mockReset();
  });

  it('stamps BANK on untagged posting Asset', async () => {
    query
      .mockResolvedValueOnce(
        qResult([
          {
            AccountCode: '1033',
            AccountName: 'Stanbic Operating',
            AccountType: 'ASSET',
            IsPostingAccount: true,
            SystemAccountTag: null,
          },
        ]),
      )
      .mockResolvedValueOnce(qResult([]));

    const result = await ensureBankGlLiquidityTag(client, 'gl-1');
    expect(result.stamped).toBe(true);
    expect(result.accountCode).toBe('1033');
    expect(String(query.mock.calls[1]?.[0])).toContain('"SystemAccountTag" = \'BANK\'');
  });

  it('does not overwrite CASH / MOBILE_MONEY / existing BANK', async () => {
    for (const tag of ['CASH', 'BANK', 'MOBILE_MONEY', 'PETTY_CASH', 'CARD_CLEARING']) {
      query.mockReset();
      query.mockResolvedValueOnce(
        qResult([
          {
            AccountCode: '1010',
            AccountName: 'X',
            AccountType: 'ASSET',
            IsPostingAccount: true,
            SystemAccountTag: tag,
          },
        ]),
      );
      const result = await ensureBankGlLiquidityTag(client, 'gl-x');
      expect(result.stamped).toBe(false);
      expect(query).toHaveBeenCalledTimes(1);
      expect(RESERVED_LIQUIDITY_TAGS.has(tag)).toBe(true);
    }
  });

  it('does not stamp non-asset or header accounts', async () => {
    query.mockResolvedValueOnce(
      qResult([
        {
          AccountCode: '4000',
          AccountName: 'Sales',
          AccountType: 'REVENUE',
          IsPostingAccount: true,
          SystemAccountTag: null,
        },
      ]),
    );
    expect((await ensureBankGlLiquidityTag(client, 'gl-rev')).stamped).toBe(false);

    query.mockReset();
    query.mockResolvedValueOnce(
      qResult([
        {
          AccountCode: '1000',
          AccountName: 'Current Assets',
          AccountType: 'ASSET',
          IsPostingAccount: false,
          SystemAccountTag: null,
        },
      ]),
    );
    expect((await ensureBankGlLiquidityTag(client, 'gl-hdr')).stamped).toBe(false);
  });

  it('does not overwrite AR / other non-liquidity tags', async () => {
    query.mockResolvedValueOnce(
      qResult([
        {
          AccountCode: '1200',
          AccountName: 'AR',
          AccountType: 'ASSET',
          IsPostingAccount: true,
          SystemAccountTag: 'ACCOUNTS_RECEIVABLE',
        },
      ]),
    );
    const result = await ensureBankGlLiquidityTag(client, 'gl-ar');
    expect(result.stamped).toBe(false);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('does not stamp blocked codes like 1200 even when untagged', async () => {
    query.mockResolvedValueOnce(
      qResult([
        {
          AccountCode: '1200',
          AccountName: 'Accounts Receivable',
          AccountType: 'ASSET',
          IsPostingAccount: true,
          SystemAccountTag: null,
        },
      ]),
    );
    const result = await ensureBankGlLiquidityTag(client, 'gl-1200');
    expect(result.stamped).toBe(false);
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe('isBlockedBankBookGl / isEligibleBankBookLiquidity', () => {
  it('blocks AR 1200 and allows BANK-tagged 1032', async () => {
    const { isBlockedBankBookGl, isEligibleBankBookLiquidity } = await import(
      './ensureBankGlLiquidityTag.js'
    );
    expect(isBlockedBankBookGl('1200', 'ACCOUNTS_RECEIVABLE')).toBe(true);
    expect(isEligibleBankBookLiquidity('1200', 'ACCOUNTS_RECEIVABLE')).toBe(false);
    expect(isEligibleBankBookLiquidity('1032', 'BANK')).toBe(true);
    expect(isEligibleBankBookLiquidity('1030', 'BANK')).toBe(true);
  });
});
