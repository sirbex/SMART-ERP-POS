/**
 * Pure plan unit tests — Kitchen Production ADR-005.
 */

import {
  assertPostableMode,
  canCancelStatus,
  canPostStatus,
  computeOutputUnitCost,
  isPhase1ProductionMode,
  scaleRecipeComponentQty,
} from '../../../../shared/kitchen-production/plan.js';

describe('kitchen production plan (pure)', () => {
  it('Phase 1 allows only COOK_TO_STOCK', () => {
    expect(isPhase1ProductionMode('COOK_TO_STOCK')).toBe(true);
    expect(isPhase1ProductionMode('COOK_TO_ORDER')).toBe(false);
    expect(isPhase1ProductionMode('COOK_TO_SESSION')).toBe(false);
  });

  it('assertPostableMode rejects cook-to-order and session', () => {
    expect(() => assertPostableMode('COOK_TO_STOCK')).not.toThrow();
    expect(() => assertPostableMode('COOK_TO_ORDER')).toThrow(/pay-time recipe/);
    expect(() => assertPostableMode('COOK_TO_SESSION')).toThrow(/Buffet Session/);
  });

  it('status gates draft only', () => {
    expect(canPostStatus('DRAFT')).toBe(true);
    expect(canPostStatus('POSTED')).toBe(false);
    expect(canCancelStatus('DRAFT')).toBe(true);
    expect(canCancelStatus('POSTED')).toBe(false);
  });

  it('rolls FG unit cost from ingredient total', () => {
    expect(computeOutputUnitCost(1000, 50)).toBe(20);
    expect(computeOutputUnitCost(0, 10)).toBe(0);
    expect(computeOutputUnitCost(100, 0)).toBe(0);
  });

  it('scales recipe qty by batch size', () => {
    expect(scaleRecipeComponentQty(0.25, 80)).toBe(20);
  });
});
