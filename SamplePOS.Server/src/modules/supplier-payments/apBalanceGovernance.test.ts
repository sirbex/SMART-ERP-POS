/**
 * AP balance governance — service-layer contract tests.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { PoolClient } from 'pg';

const mockQuery = jest.fn<(...args: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>>();

const mockClient = { query: mockQuery } as unknown as PoolClient;

const mockSyncSupplier = jest.fn<(...args: unknown[]) => Promise<{ oldBalance: number; newBalance: number }>>();

jest.unstable_mockModule('./apReconciliationMetrics.js', () => ({
  captureApReconciliationMetrics: jest.fn(),
  verifyApReconciliationMetrics: jest.fn(),
  verifyApCacheLayersOnly: jest.fn(),
}));
jest.unstable_mockModule('./apReconciliationEngine.js', () => ({
  syncSupplierBalanceFromOpenItems: mockSyncSupplier,
}));

const { afterJournalEntryGovernance, rebaseAccountCachesFromPostedLedger } = await import(
  './apBalanceGovernance.js'
);

describe('apBalanceGovernance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSyncSupplier.mockResolvedValue({ oldBalance: 0, newBalance: 0 });
  });

  it('rebases touched account codes from posted ledger', async () => {
    mockQuery.mockResolvedValue({ rows: [{ account_code: '2100' }], rowCount: 1 });
    const n = await rebaseAccountCachesFromPostedLedger(mockClient, ['2100']);
    expect(n).toBe(1);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE accounts'),
      [['2100']],
    );
  });

  it('syncs supplier cache when journal credits AP with supplier entity', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    await afterJournalEntryGovernance(mockClient, [
      { accountCode: '2150', entityType: 'supplier', entityId: 'sup-1' },
      { accountCode: '2100', entityType: 'supplier', entityId: 'sup-1' },
    ]);
    expect(mockSyncSupplier).toHaveBeenCalledTimes(1);
    expect(mockSyncSupplier).toHaveBeenCalledWith(
      mockClient,
      'sup-1',
      'AP_GOVERNANCE_AFTER_JOURNAL',
    );
  });

  it('does not sync supplier when AP line has no entity', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    await afterJournalEntryGovernance(mockClient, [
      { accountCode: '6900' },
      { accountCode: '2100' },
    ]);
    expect(mockSyncSupplier).not.toHaveBeenCalled();
  });
});
