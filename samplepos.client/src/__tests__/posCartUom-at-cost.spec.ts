import { describe, expect, it } from 'vitest';
import {
  getPosLineBaseQuantity,
  getPosLineConversionFactor,
  getPosLineStockInSellingUom,
  getStockInSellingUom,
  convertPosCartQuantityForUomChange,
  scaleEngineBasePriceToSellingUom,
  normalizePosSellingQuantity,
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

describe('POS stock in selling UoM (Pregnacare / PKT scenario)', () => {
  const stockBase = 30; // 3 PKT × 10 tabs after correct GR posting

  it('shows 3 PKT when selling by packet', () => {
    expect(getStockInSellingUom(stockBase, 10)).toBe(3);
    const stock = getPosLineStockInSellingUom(stockBase, uoms, 'pkt', 'PKT');
    expect(stock.stockInSellingUom).toBe(3);
    expect(stock.uomLabel).toBe('PKT');
  });

  it('shows 30 base units when selling by tablet', () => {
    expect(getStockInSellingUom(stockBase, 1)).toBe(30);
    const stock = getPosLineStockInSellingUom(stockBase, uoms, 'base', 'PKT');
    expect(stock.stockInSellingUom).toBe(30);
    expect(stock.uomLabel).toBe('TAB');
  });

  it('converts cart qty when switching PKT → base (1 PKT → 10 TAB)', () => {
    expect(convertPosCartQuantityForUomChange(1, uoms, 'pkt', 'base')).toBe(10);
  });

  it('documents mis-posted stock: 3 in DB with factor=1 shows 3 everywhere', () => {
    const misconfiguredStock = 3;
    expect(getStockInSellingUom(misconfiguredStock, 1)).toBe(3);
    expect(getStockInSellingUom(misconfiguredStock, 10)).toBe(0);
  });
});

describe('normalizePosSellingQuantity', () => {
  it('snaps float drift to nearest integer qty', () => {
    expect(normalizePosSellingQuantity(0.99999)).toBe(1);
    expect(normalizePosSellingQuantity(2.000001)).toBe(2);
  });
});
