import { describe, expect, it } from 'vitest';
import {
  adjustQuotationQuantity,
  calculateLineTotal,
  calculateQuotationTotals,
  hasTaxableQuotationLines,
} from '../utils/quotationCalculations';

describe('quotationCalculations', () => {
  it('excludes tax from line total when not taxable', () => {
    const total = calculateLineTotal({
      quantity: 2,
      unitPrice: 100,
      discountAmount: 0,
      isTaxable: false,
      taxRate: 18,
    });
    expect(total).toBe(200);
  });

  it('includes tax when taxable', () => {
    const total = calculateLineTotal({
      quantity: 1,
      unitPrice: 100,
      discountAmount: 0,
      isTaxable: true,
      taxRate: 18,
    });
    expect(total).toBe(118);
  });

  it('hides tax summary when no taxable lines', () => {
    expect(
      hasTaxableQuotationLines([
        { quantity: 1, unitPrice: 10, isTaxable: false, taxRate: 18 },
      ])
    ).toBe(false);
  });

  it('adjusts quantity with floor at zero', () => {
    expect(adjustQuotationQuantity(1, -5)).toBe(0);
    expect(adjustQuotationQuantity(2, 3)).toBe(5);
  });

  it('aggregates totals with mixed tax lines', () => {
    const totals = calculateQuotationTotals([
      { quantity: 1, unitPrice: 100, isTaxable: true, taxRate: 18 },
      { quantity: 1, unitPrice: 50, isTaxable: false, taxRate: 18 },
    ]);
    expect(totals.subtotal).toBe(150);
    expect(totals.totalTax).toBe(18);
    expect(totals.total).toBe(168);
  });
});
