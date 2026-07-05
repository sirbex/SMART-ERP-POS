import { describe, it, expect } from 'vitest';
import {
  formatMultiUomQuantity,
  formatUomSummary,
  normalizeApiUoms,
  productFromApiUoms,
} from './formatQuantity';

const BOX_PCS_UOMS = [
  {
    uomId: 'box-id',
    name: 'BOX',
    symbol: 'BOX',
    conversionFactor: 12,
    isDefault: false,
  },
  {
    uomId: 'pcs-id',
    name: 'PCS',
    symbol: 'PCS',
    conversionFactor: 1,
    isDefault: true,
  },
];

describe('normalizeApiUoms', () => {
  it('parses API json_agg shape', () => {
    const list = normalizeApiUoms(BOX_PCS_UOMS);
    expect(list).toHaveLength(2);
    expect(list[0].conversionFactor).toBe(12);
    expect(list[0].uomSymbol).toBe('BOX');
    expect(list[1].isDefault).toBe(true);
  });

  it('returns empty array for null', () => {
    expect(normalizeApiUoms(null)).toEqual([]);
  });
});

describe('productFromApiUoms', () => {
  it('builds productUoms for formatMultiUomQuantity', () => {
    const p = productFromApiUoms(BOX_PCS_UOMS);
    expect(p.productUoms).toHaveLength(2);
    expect(p.unitOfMeasure).toBe('PCS');
  });
});

describe('formatUomSummary', () => {
  it('shows conversion factors for pack units', () => {
    expect(formatUomSummary(BOX_PCS_UOMS)).toBe('BOX (×12) · PCS');
  });

  it('falls back to PCS when no uoms', () => {
    expect(formatUomSummary(null)).toBe('PCS');
  });
});

describe('formatMultiUomQuantity', () => {
  it('breaks base qty into BOX + PCS remainder', () => {
    const product = productFromApiUoms(BOX_PCS_UOMS);
    expect(formatMultiUomQuantity(26, product)).toBe('2 BOX + 2.00 PCS');
  });

  it('shows base unit when no ladder', () => {
    expect(formatMultiUomQuantity(5, null)).toBe('5.00');
  });
});
