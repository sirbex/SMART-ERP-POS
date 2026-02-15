import { describe, it, expect } from 'vitest';
import { computeUomPrices } from '@shared/utils/uom-pricing';

describe('MUoM pricing utility', () => {
  it('uses fallback 1.20 multiplier when none provided', () => {
    const res = computeUomPrices({
      baseCost: 1000,
      units: [{ name: 'BOX', factor: 0.1 }],
      currencyDecimals: 0,
    });
    const row = res.rows[0];
    expect(row.unitCost).toBe(100); // 1000 * 0.1
    expect(row.usedMultiplier).toBeCloseTo(1.2, 6);
    expect(row.sellingPrice).toBe(120); // 100 * 1.2
  });

  it('matches preview inference: defaultMultiplier = selling/baseCost', () => {
    const baseCartonCost = 480_000;
    const baseSellingPrice = 600_000; // implies 1.25 multiplier
    const defaultMultiplier = baseSellingPrice / baseCartonCost;

    const res = computeUomPrices({
      baseCost: baseCartonCost,
      units: [{ name: 'HALF_CARTON', factor: 0.5 }],
      defaultMultiplier,
      currencyDecimals: 0,
    });
    const row = res.rows[0];
    expect(row.unitCost).toBe(240_000); // 480k * 0.5
    expect(row.usedMultiplier).toBeCloseTo(1.25, 6);
    expect(row.sellingPrice).toBe(300_000); // 240k * 1.25
  });
});
