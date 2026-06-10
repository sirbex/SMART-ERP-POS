import { describe, it, expect } from 'vitest';
import {
  formatSellingQuantityWithBaseHint,
  sellingQtyToBase,
  saleItemConversionFactor,
} from '@shared/utils/sale-item-uom';

describe('sale-item-uom', () => {
  it('converts selling qty to base using conversion factor', () => {
    expect(sellingQtyToBase(2, 12)).toBe(24);
    expect(saleItemConversionFactor(null)).toBe(1);
    expect(sellingQtyToBase(3, '10')).toBe(30);
  });

  it('formats selling qty with base hint when factor > 1', () => {
    expect(
      formatSellingQuantityWithBaseHint(2, {
        uomSymbol: 'BOX',
        baseUomSymbol: 'PC',
        conversionFactor: 12,
      }),
    ).toBe('2 BOX (= 24 PC)');
  });

  it('formats single-UoM lines without base hint', () => {
    expect(
      formatSellingQuantityWithBaseHint(5, {
        uomSymbol: 'PC',
        conversionFactor: 1,
      }),
    ).toBe('5 PC');
  });
});
