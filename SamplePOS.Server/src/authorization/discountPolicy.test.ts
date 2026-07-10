import { describe, it, expect } from '@jest/globals';
import {
  resolveDiscountLimitPercent,
  isDiscountWithinLimit,
  DISCOUNT_LIMIT_TIERS,
} from '@shared/authorization/discountPolicy.js';

describe('discountPolicy', () => {
  it('uses highest matching permission tier', async () => {
    const has = new Set(['pos.create', 'sales.approve']);
    const max = await resolveDiscountLimitPercent((key) => has.has(key));
    expect(max).toBe(100);
  });

  it('falls back to default when no tiers match', async () => {
    const max = await resolveDiscountLimitPercent(() => false);
    expect(max).toBe(5);
  });

  it('isDiscountWithinLimit compares against resolved max', () => {
    expect(isDiscountWithinLimit(10, 50)).toBe(true);
    expect(isDiscountWithinLimit(51, 50)).toBe(false);
  });

  it('tiers are ordered by business privilege', () => {
    expect(DISCOUNT_LIMIT_TIERS[0].permission).toBe('sales.approve');
    expect(DISCOUNT_LIMIT_TIERS[0].maxPercent).toBe(100);
  });
});
