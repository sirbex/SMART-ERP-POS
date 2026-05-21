/**
 * AT_COST sale pricing guard — same rules as salesService createSale path
 */
import { describe, it, expect } from '@jest/globals';
import { BusinessError } from '../../middleware/errorHandler.js';
import type { ResolvedPrice } from '../pricing/pricingEngineService.js';
import { validateAtCostSalePricing } from './atCostSalePricingGuard.js';

describe('AT_COST sale pricing guard', () => {
  const items = [{ productId: 'p1', quantity: 2 }];

  it('passes when engine returns at_cost scope', () => {
    const map = new Map<string, ResolvedPrice>([
      ['p1:2', {
        finalPrice: 70,
        basePrice: 100,
        discount: 30,
        appliedRule: {
          ruleId: null,
          ruleName: 'At Cost',
          ruleType: 'at_cost',
          ruleValue: null,
          scope: 'at_cost',
        },
      }],
    ]);
    expect(() => validateAtCostSalePricing(items, map)).not.toThrow();
  });

  it('rejects retail/base scope for at-cost customer', () => {
    const map = new Map<string, ResolvedPrice>([
      ['p1:2', {
        finalPrice: 100,
        basePrice: 100,
        discount: 0,
        appliedRule: {
          ruleId: null,
          ruleName: null,
          ruleType: null,
          ruleValue: null,
          scope: 'base',
        },
      }],
    ]);
    expect(() => validateAtCostSalePricing(items, map)).toThrow(BusinessError);
    try {
      validateAtCostSalePricing(items, map);
    } catch (e) {
      expect(e).toBeInstanceOf(BusinessError);
      expect((e as BusinessError).errorCode).toBe('AT_COST_PRICING_MISMATCH');
    }
  });

  it('rejects missing resolved price', () => {
    expect(() => validateAtCostSalePricing(items, new Map())).toThrow(BusinessError);
  });
});
