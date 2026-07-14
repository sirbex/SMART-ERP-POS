import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import type { Pool } from 'pg';

const mockQuery = jest.fn<(...args: unknown[]) => Promise<{ rows: unknown[] }>>();
const mockPool = { query: mockQuery } as unknown as Pool;

jest.unstable_mockModule('../../../utils/dateRange.js', () => ({
  getBusinessDate: () => '2026-07-12',
}));

jest.unstable_mockModule('../../../services/glEntryService.js', () => ({
  AccountCodes: {
    WHT_PAYABLE: '2350',
    WHT_RECEIVABLE: '1250',
  },
}));

const { getWhtIntegrityLane } = await import('./whtReconciliationLanes.js');

describe('getWhtIntegrityLane', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reconciles when GL matches entry subledger on both sides', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ debits: '0', credits: '60000' }] })
      .mockResolvedValueOnce({ rows: [{ debits: '40000', credits: '0' }] })
      .mockResolvedValueOnce({ rows: [{ balance: '60000' }] })
      .mockResolvedValueOnce({ rows: [{ balance: '40000' }] });

    const lane = await getWhtIntegrityLane(mockPool, '2026-07-12');
    expect(lane.status).toBe('RECONCILED');
    expect(lane.payableGl).toBe(60000);
    expect(lane.receivableGl).toBe(40000);
    expect(lane.exceptions).toHaveLength(0);
  });

  it('flags discrepancy when payable drifts', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ debits: '0', credits: '70000' }] })
      .mockResolvedValueOnce({ rows: [{ debits: '40000', credits: '0' }] })
      .mockResolvedValueOnce({ rows: [{ balance: '60000' }] })
      .mockResolvedValueOnce({ rows: [{ balance: '40000' }] });

    const lane = await getWhtIntegrityLane(mockPool, '2026-07-12');
    expect(lane.status).toBe('DISCREPANCY');
    expect(lane.exceptions.some((e) => e.entityId === '2350')).toBe(true);
  });
});
