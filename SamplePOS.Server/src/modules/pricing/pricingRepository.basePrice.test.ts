/**
 * getProductBasePrice — maps snake_case DB rows to camelCase (AT_COST path depends on this)
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { Pool } from 'pg';
import { getProductBasePrice } from './pricingRepository.js';

type MockFn = (...args: unknown[]) => Promise<unknown>;

describe('getProductBasePrice', () => {
  const mockQuery = jest.fn<MockFn>();
  const pool = { query: mockQuery } as unknown as Pool;

  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('maps selling_price and cost_price to camelCase', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          category_id: 'cat-1',
          selling_price: '4000.00',
          cost_price: '1250.00',
        },
      ],
    });

    const result = await getProductBasePrice(pool, 'product-1');

    expect(result).toEqual({
      categoryId: 'cat-1',
      sellingPrice: '4000.00',
      costPrice: '1250.00',
    });
  });

  it('returns null when product not found', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    expect(await getProductBasePrice(pool, 'missing')).toBeNull();
  });
});
