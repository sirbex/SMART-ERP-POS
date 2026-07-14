/**
 * Auto-provision WHT accounts 1250 / 2350 before payment GL.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { PoolClient } from 'pg';

const mockQuery = jest.fn<(...args: unknown[]) => Promise<{ rows: unknown[] }>>();

const mockClient = { query: mockQuery } as unknown as PoolClient;

jest.unstable_mockModule('../../services/glEntryService.js', () => ({
  AccountCodes: {
    ACCOUNTS_RECEIVABLE: '1200',
    ACCOUNTS_PAYABLE: '2100',
    WHT_RECEIVABLE: '1250',
    WHT_PAYABLE: '2350',
  },
}));

const {
  ensureWhtReceivableAccount,
  ensureWhtPayableAccount,
  ensureWhtAccounts,
  ensureWhtGlAccountForCode,
} = await import('./ensureWhtAccounts.js');

describe('ensureWhtAccounts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does nothing when 1250 already exists', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'acct-1250' }] });
    await ensureWhtReceivableAccount(mockClient);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('inserts 1250 when missing', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ parent_account_id: 'parent-ar' }] })
      .mockResolvedValueOnce({ rows: [] });
    await ensureWhtReceivableAccount(mockClient);
    expect(mockQuery).toHaveBeenCalledTimes(3);
    const insertCall = mockQuery.mock.calls[2];
    expect(insertCall?.[0]).toEqual(expect.stringContaining('INSERT INTO accounts'));
    expect(insertCall?.[1]?.[0]).toBe('1250');
    expect(insertCall?.[1]?.[1]).toBe('Tax Receivable');
  });

  it('inserts 2350 when missing', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ parent_account_id: 'parent-ap' }] })
      .mockResolvedValueOnce({ rows: [] });
    await ensureWhtPayableAccount(mockClient);
    expect(mockQuery).toHaveBeenCalledTimes(3);
    const insertCall = mockQuery.mock.calls[2];
    expect(insertCall?.[1]?.[0]).toBe('2350');
    expect(insertCall?.[1]?.[1]).toBe('Withholding Tax Payable');
  });

  it('ensures both accounts', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'acct-1250' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'acct-2350' }] });
    await ensureWhtAccounts(mockClient);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('ensureWhtGlAccountForCode auto-provisions defaults', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'acct-1250' }] });
    await expect(ensureWhtGlAccountForCode(mockClient, '1250', 'CUSTOMER')).resolves.toBe('1250');
  });

  it('ensureWhtGlAccountForCode accepts existing custom code', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'custom' }] });
    await expect(ensureWhtGlAccountForCode(mockClient, '2355', 'SUPPLIER')).resolves.toBe('2355');
  });

  it('ensureWhtGlAccountForCode rejects missing custom code', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(ensureWhtGlAccountForCode(mockClient, '9999', 'SUPPLIER')).rejects.toThrow(
      /not an active posting account/,
    );
  });
});
