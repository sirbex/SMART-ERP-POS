import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import type { PoolClient } from 'pg';

const mockQuery = jest.fn<(...args: unknown[]) => Promise<{ rows: unknown[] }>>();
const mockClient = { query: mockQuery } as unknown as PoolClient;

jest.unstable_mockModule('../../utils/dateRange.js', () => ({
  getBusinessYear: () => 2026,
  BUSINESS_TIMEZONE: 'Africa/Kampala',
  toUtcRange: (s: string, e: string) => ({ startUtc: s, endUtc: e }),
}));

jest.unstable_mockModule('../../services/glEntryService.js', () => ({
  AccountCodes: {
    WHT_PAYABLE: '2350',
    WHT_RECEIVABLE: '1250',
    CASH: '1010',
  },
}));

jest.unstable_mockModule('../../services/accountingCore.js', () => ({
  AccountingCore: { createJournalEntry: jest.fn() },
}));

jest.unstable_mockModule('../../db/pool.js', () => ({
  pool: {},
}));

const { nextWhtCertificateNumber, assertWhtAppliesTo, resolveWhtGlAccountCode } =
  await import('./whtService.js');

describe('nextWhtCertificateNumber', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts at WHT-CERT-2026-0001', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ /* lock */ }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(nextWhtCertificateNumber(mockClient)).resolves.toBe('WHT-CERT-2026-0001');
  });

  it('increments from last certificate', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{}] })
      .mockResolvedValueOnce({ rows: [{ certificate_number: 'WHT-CERT-2026-0007' }] });
    await expect(nextWhtCertificateNumber(mockClient)).resolves.toBe('WHT-CERT-2026-0008');
  });
});

describe('phase3 helpers still hold', () => {
  it('resolves accounts and applies_to', () => {
    expect(resolveWhtGlAccountCode('SUPPLIER', { appliesTo: 'SUPPLIER', accountCode: '2350' })).toBe(
      '2350',
    );
    expect(() => assertWhtAppliesTo('CUSTOMER', 'SUPPLIER')).toThrow(/not CUSTOMER/);
  });
});
