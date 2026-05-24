import { describe, it, expect } from '@jest/globals';
import { assertSaleLineNotBelowAllocatedCost } from './saleBelowCostGuard.js';
import { BusinessError } from '../../middleware/errorHandler.js';

describe('assertSaleLineNotBelowAllocatedCost', () => {
  it('allows selling at exact allocated cost', () => {
    expect(() =>
      assertSaleLineNotBelowAllocatedCost({
        productId: 'p1',
        quantity: 3,
        lineRevenue: 3_900_000,
        totalAllocatedCost: 3_900_000,
        costPerSellingUnit: 1_300_000,
        unitPrice: 1_300_000,
      }),
    ).not.toThrow();
  });

  it('allows selling above allocated cost', () => {
    expect(() =>
      assertSaleLineNotBelowAllocatedCost({
        productId: 'p1',
        quantity: 1,
        lineRevenue: 2_000_000,
        totalAllocatedCost: 1_500_000,
        costPerSellingUnit: 1_500_000,
        unitPrice: 2_000_000,
      }),
    ).not.toThrow();
  });

  it('blocks selling below allocated cost', () => {
    expect(() =>
      assertSaleLineNotBelowAllocatedCost({
        productId: 'p1',
        productName: 'OZEMPIC',
        quantity: 3,
        lineRevenue: 3_000_000,
        totalAllocatedCost: 3_900_000,
        costPerSellingUnit: 1_300_000,
        unitPrice: 1_000_000,
      }),
    ).toThrow(BusinessError);

    try {
      assertSaleLineNotBelowAllocatedCost({
        productId: 'p1',
        quantity: 1,
        lineRevenue: 1,
        totalAllocatedCost: 100,
        costPerSellingUnit: 100,
        unitPrice: 1,
      });
    } catch (e) {
      expect((e as BusinessError).errorCode).toBe('BELOW_ALLOCATED_COST');
      expect((e as BusinessError).message).toContain('below actual inventory cost');
    }
  });
});
