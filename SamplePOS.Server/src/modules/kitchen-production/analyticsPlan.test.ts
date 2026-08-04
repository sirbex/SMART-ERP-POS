/**
 * Pure food-cost analytics — Kitchen Production ADR-005 Phase 5.
 */

import {
  contributionMargin,
  costVariance,
  costVariancePct,
  foodCostPercent,
  qtyYieldRatio,
  theoreticalLineCost,
} from '../../../../shared/kitchen-production/analyticsPlan.js';

describe('kitchen analytics plan (pure)', () => {
  it('theoretical line cost from planned qty × unit cost', () => {
    expect(theoreticalLineCost(10, 2.5, 12, 30)).toBe(25);
    expect(theoreticalLineCost(10, null, 5, 20)).toBe(40);
    expect(theoreticalLineCost(0, 5, 10, 50)).toBe(0);
  });

  it('cost variance and percent', () => {
    expect(costVariance(120, 100)).toBe(20);
    expect(costVariancePct(120, 100)).toBe(20);
    expect(costVariancePct(50, 0)).toBeNull();
  });

  it('food cost % and contribution', () => {
    expect(foodCostPercent(300, 1000)).toBe(30);
    expect(foodCostPercent(100, 0)).toBeNull();
    expect(contributionMargin(1000, 300)).toBe(700);
  });

  it('qty yield ratio', () => {
    expect(qtyYieldRatio(10, 12)).toBeCloseTo(1.2);
    expect(qtyYieldRatio(0, 5)).toBeNull();
  });
});
