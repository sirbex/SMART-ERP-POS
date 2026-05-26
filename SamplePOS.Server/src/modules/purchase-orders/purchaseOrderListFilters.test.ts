import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import type { Pool } from 'pg';
import { purchaseOrderRepository } from './purchaseOrderRepository.js';

describe('purchaseOrderRepository.listPOs', () => {
  const mockPool = {
    query: jest.fn<(...args: unknown[]) => Promise<{ rows: unknown[] }>>(),
  } as unknown as Pool;

  beforeEach(() => {
    jest.resetAllMocks();
    (mockPool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });
  });

  test('default list excludes CANCELLED purchase orders', async () => {
    await purchaseOrderRepository.listPOs(mockPool, 1, 50);

    const countSql = String((mockPool.query as jest.Mock).mock.calls[0][0]);
    expect(countSql).toContain(`po.status <> 'CANCELLED'`);
  });

  test('status=CANCELLED includes cancelled purchase orders', async () => {
    await purchaseOrderRepository.listPOs(mockPool, 1, 50, { status: 'CANCELLED' });

    const countSql = String((mockPool.query as jest.Mock).mock.calls[0][0]);
    expect(countSql).toContain('po.status = $1');
    expect(countSql).not.toContain(`po.status <> 'CANCELLED'`);
    const params = (mockPool.query as jest.Mock).mock.calls[0][1] as unknown[];
    expect(params).toContain('CANCELLED');
  });
});
