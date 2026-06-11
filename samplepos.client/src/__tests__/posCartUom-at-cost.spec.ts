import { describe, expect, it } from 'vitest';
import {
  getPosLineBaseQuantity,
  getPosLineConversionFactor,
  getPosLineStockAvailability,
  getPosLineStockInSellingUom,
  getPosQuantityAfterUomChange,
  getStockInSellingUom,
  convertPosCartQuantityForUomChange,
  scaleEngineBasePriceToSellingUom,
  sanitizePosSellingQuantity,
} from '../utils/posCartUom';

const uoms = [
  { uomId: 'base', symbol: 'TAB', conversionFactor: 1, isDefault: true },
  { uomId: 'pkt', symbol: 'PKT', conversionFactor: 10, isDefault: false },
];

const boxUoms = [
  { uomId: 'base', symbol: 'TAB', conversionFactor: 1, isDefault: true },
  { uomId: 'box', symbol: 'BOX', conversionFactor: 30, isDefault: false },
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
  const stockBase = 30;

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

  it('PO path still converts base qty when switching PKT → TAB (1 PKT → 10 TAB)', () => {
    expect(convertPosCartQuantityForUomChange(1, uoms, 'pkt', 'base')).toBe(10);
  });

  it('documents mis-posted stock: 3 in DB with factor=1 shows 3 everywhere', () => {
    const misconfiguredStock = 3;
    expect(getStockInSellingUom(misconfiguredStock, 1)).toBe(3);
    expect(getStockInSellingUom(misconfiguredStock, 10)).toBe(0);
  });
});

describe('POS retail UoM switch (not PO base preservation)', () => {
  it('resets qty to 1 when cashier changes selling UoM', () => {
    expect(getPosQuantityAfterUomChange()).toBe(1);
  });

  it('does not produce fractional BOX qty from 1 TAB via PO conversion', () => {
    const poStyle = convertPosCartQuantityForUomChange(1, boxUoms, 'base', 'box');
    expect(poStyle).toBeCloseTo(0.033333, 4);
    expect(getPosQuantityAfterUomChange()).toBe(1);
  });
});

describe('sanitizePosSellingQuantity', () => {
  it('snaps float drift to nearest integer qty', () => {
    expect(sanitizePosSellingQuantity(0.99999, uoms, 'pkt')).toBe(1);
    expect(sanitizePosSellingQuantity(2.000001, uoms, 'pkt')).toBe(2);
  });

  it('repairs persisted fractional pack qty (Acetazolamide 0.033333 BOX)', () => {
    expect(sanitizePosSellingQuantity(0.033333, boxUoms, 'box')).toBe(1);
  });
});

describe('getPosLineStockAvailability', () => {
  it('hints base stock when less than one full pack is on hand', () => {
    const stock = getPosLineStockAvailability(10, boxUoms, 'box', 'BOX');
    expect(stock.stockInSellingUom).toBe(0);
    expect(stock.stockHint).toMatch(/10 TAB in stock/);
    expect(stock.stockHint).toMatch(/less than 1 BOX/);
  });
});
