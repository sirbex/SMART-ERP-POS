import { describe, expect, it } from 'vitest';
import {
  appendQtyDigit,
  clampOrderQty,
  parsePendingOrderQty,
} from './restaurantPendingQty';

describe('restaurantPendingQty (Samba qty pad SSOT)', () => {
  it('defaults empty to 1', () => {
    expect(parsePendingOrderQty('')).toBe(1);
    expect(parsePendingOrderQty('0')).toBe(1);
  });

  it('parses multi-digit qty like 50 plates', () => {
    expect(parsePendingOrderQty('50')).toBe(50);
    expect(parsePendingOrderQty('0050')).toBe(50);
  });

  it('caps at 9999', () => {
    expect(parsePendingOrderQty('99999')).toBe(9999);
  });

  it('appendQtyDigit strips leading zeros and respects maxLen', () => {
    expect(appendQtyDigit('', '5')).toBe('5');
    expect(appendQtyDigit('5', '0')).toBe('50');
    expect(appendQtyDigit('9999', '1')).toBe('9999');
  });

  it('clampOrderQty rejects out of range', () => {
    expect(clampOrderQty(0)).toBe(0);
    expect(clampOrderQty(12)).toBe(12);
    expect(clampOrderQty(-1)).toBeNull();
    expect(clampOrderQty(10000)).toBeNull();
  });
});
