import { describe, expect, it } from '@jest/globals';
import { InventoryBusinessRules, BusinessRuleViolation } from './businessRules.js';

describe('InventoryBusinessRules.validateGRItemCompleteness — trackExpiry gate', () => {
  const base = {
    productId: 'prod-1',
    receivedQuantity: 10,
    unitCost: 100,
  };

  it('allows finalize without expiry when trackExpiry is false', () => {
    expect(() =>
      InventoryBusinessRules.validateGRItemCompleteness({
        ...base,
        expiryDate: null,
        trackExpiry: false,
      }),
    ).not.toThrow();
  });

  it('allows finalize without expiry when trackExpiry is omitted (legacy)', () => {
    expect(() =>
      InventoryBusinessRules.validateGRItemCompleteness({
        ...base,
        expiryDate: null,
      }),
    ).not.toThrow();
  });

  it('requires expiry when trackExpiry is true', () => {
    expect(() =>
      InventoryBusinessRules.validateGRItemCompleteness({
        ...base,
        expiryDate: null,
        trackExpiry: true,
      }),
    ).toThrow(BusinessRuleViolation);

    try {
      InventoryBusinessRules.validateGRItemCompleteness({
        ...base,
        expiryDate: '',
        trackExpiry: true,
      });
    } catch (e) {
      expect(e).toBeInstanceOf(BusinessRuleViolation);
      expect((e as BusinessRuleViolation).code).toBe('MISSING_EXPIRY_DATE');
    }
  });

  it('passes when trackExpiry is true and expiry is provided', () => {
    expect(() =>
      InventoryBusinessRules.validateGRItemCompleteness({
        ...base,
        expiryDate: '2030-12-31',
        trackExpiry: true,
      }),
    ).not.toThrow();
  });
});
