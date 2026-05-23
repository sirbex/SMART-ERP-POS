import { describe, it, expect } from '@jest/globals';
import Decimal from 'decimal.js';
import {
  assertAtCostMargin,
  assertSaleHeaderMatchesCalculatedTotal,
  assertSaleLineEconomicsConsistent,
  deriveUnitPriceFromLineTotal,
} from './saleIntegrity.js';
import { BusinessError } from '../../middleware/errorHandler.js';

describe('saleIntegrity', () => {
  it('deriveUnitPriceFromLineTotal divides line by qty', () => {
    expect(deriveUnitPriceFromLineTotal(3900000, 3)).toBe(1300000);
  });

  it('assertSaleHeaderMatchesCalculatedTotal rejects drift', () => {
    expect(() =>
      assertSaleHeaderMatchesCalculatedTotal(4800000, new Decimal(5100000)),
    ).toThrow(BusinessError);
    try {
      assertSaleHeaderMatchesCalculatedTotal(4800000, new Decimal(5100000));
    } catch (e) {
      expect((e as BusinessError).errorCode).toBe('ERR_SALE_TOTAL_MISMATCH');
    }
  });

  it('assertSaleHeaderMatchesCalculatedTotal allows match within tolerance', () => {
    expect(() =>
      assertSaleHeaderMatchesCalculatedTotal(4800000, new Decimal(4800000)),
    ).not.toThrow();
  });

  it('assertSaleLineEconomicsConsistent catches 4063-style mismatch', () => {
    const r = assertSaleLineEconomicsConsistent({
      quantity: 3,
      unitPrice: 1700000,
      totalPrice: 5100000,
    });
    expect(r.ok).toBe(true);

    const bad = assertSaleLineEconomicsConsistent({
      quantity: 3,
      unitPrice: 1700000,
      totalPrice: 4800000,
    });
    expect(bad.ok).toBe(false);
  });

  it('assertAtCostMargin rejects 4063 profit profile', () => {
    const r = assertAtCostMargin({ totalAmount: 4800000, totalCost: 3900000, maxMarginPct: 2 });
    expect(r.ok).toBe(false);
    expect(r.marginPct).toBeGreaterThan(15);
  });

  it('assertAtCostMargin accepts near-zero margin', () => {
    const r = assertAtCostMargin({ totalAmount: 3900000, totalCost: 3900000, maxMarginPct: 2 });
    expect(r.ok).toBe(true);
  });
});
