import { describe, it, expect } from 'vitest';
import { computeUomPrices } from '@shared/utils/uom-pricing';

describe('MUoM pricing utility', () => {
  it('uses fallback 1.20 multiplier when none provided', () => {
    const res = computeUomPrices({
      baseCost: 100,
      units: [{ name: 'BOX', factor: 12 }],
      currencyDecimals: 0,
    });
    const row = res.rows[0];
    expect(row.unitCost).toBe(1200); // 100 * 12
    expect(row.usedMultiplier).toBeCloseTo(1.2, 6);
    expect(row.sellingPrice).toBe(1440); // 1200 * 1.2
  });

  it('matches preview inference: defaultMultiplier = selling/baseCost', () => {
    const baseTabletCost = 40;
    const baseSellingPrice = 50; // implies 1.25 multiplier
    const defaultMultiplier = baseSellingPrice / baseTabletCost;

    const res = computeUomPrices({
      baseCost: baseTabletCost,
      units: [{ name: 'PACKET', factor: 12 }],
      defaultMultiplier,
      currencyDecimals: 0,
    });
    const row = res.rows[0];
    expect(row.unitCost).toBe(480); // 40 * 12
    expect(row.usedMultiplier).toBeCloseTo(1.25, 6);
    expect(row.sellingPrice).toBe(600); // 480 * 1.25
  });
});
