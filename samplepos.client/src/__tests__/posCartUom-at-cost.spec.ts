import { describe, expect, it } from 'vitest';
import {
  getPosLineBaseQuantity,
  getPosLineConversionFactor,
  scaleEngineBasePriceToSellingUom,
} from '../utils/posCartUom';

const uoms = [
  { uomId: 'base', symbol: 'TAB', conversionFactor: 1, isDefault: true },
  { uomId: 'pkt', symbol: 'PKT', conversionFactor: 10, isDefault: false },
];

describe('POS AT_COST UoM scaling', () => {
  it('computes base quantity as selling qty × factor', () => {
    expect(getPosLineConversionFactor(uoms, 'pkt')).toBe(10);
    expect(getPosLineBaseQuantity(2, uoms, 'pkt')).toBe(20);
  });

  it('scales engine per-base price to selling UoM', () => {
    expect(scaleEngineBasePriceToSellingUom(118, uoms, 'pkt')).toBe(1180);
  });
});
