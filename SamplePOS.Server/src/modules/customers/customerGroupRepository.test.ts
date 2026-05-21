/**
 * customerGroupRepository — assign + default price group SQL contracts
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { Pool } from 'pg';
import * as repo from './customerGroupRepository.js';

type MockFn = (...args: unknown[]) => Promise<unknown>;

describe('customerGroupRepository — price group on assign', () => {
  const mockQuery = jest.fn<MockFn>();
  const pool = { query: mockQuery } as unknown as Pool;

  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
  });

  it('assignCustomer uses COALESCE so existing price_group_id is kept', async () => {
    await repo.assignCustomer(pool, 'customer-uuid', 'group-uuid');

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0] as [string, string[]];
    expect(sql).toContain('COALESCE(c.price_group_id, g.default_price_group_id)');
    expect(sql).toContain('customer_group_id = $1');
    expect(params).toEqual(['group-uuid', 'customer-uuid']);
  });

  it('bulkAssign uses the same COALESCE policy', async () => {
    await repo.bulkAssign(pool, ['c1', 'c2'], 'group-uuid');

    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('COALESCE(c.price_group_id, g.default_price_group_id)');
  });

  it('applyDefaultPriceGroupToMembers overwrites price_group_id for all members', async () => {
    mockQuery.mockResolvedValue({ rowCount: 7 });

    const count = await repo.applyDefaultPriceGroupToMembers(pool, 'group-uuid');

    expect(count).toBe(7);
    const [sql, params] = mockQuery.mock.calls[0] as [string, string[]];
    expect(sql).toContain('price_group_id = g.default_price_group_id');
    expect(sql).not.toContain('COALESCE');
    expect(params).toEqual(['group-uuid']);
  });
});
