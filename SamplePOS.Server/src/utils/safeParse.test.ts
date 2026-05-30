import { describe, expect, it } from '@jest/globals';
import {
  assertFiniteNumber,
  assertPositiveFinite,
  fiscalPartsFromIsoDate,
  safeParseInt,
} from '../utils/safeParse.js';

describe('safeParse utilities', () => {
  it('safeParseInt returns fallback for NaN inputs', () => {
    expect(safeParseInt('abc', 0)).toBe(0);
    expect(safeParseInt(undefined, 5)).toBe(5);
    expect(safeParseInt('42', 0)).toBe(42);
  });

  it('assertPositiveFinite rejects NaN and non-positive values', () => {
    expect(() => assertPositiveFinite(Number.NaN)).toThrow(/positive finite/);
    expect(() => assertPositiveFinite(0)).toThrow(/positive finite/);
    expect(() => assertPositiveFinite('abc')).toThrow(/positive finite/);
    expect(assertPositiveFinite('1,500.50')).toBe(1500.5);
  });

  it('assertFiniteNumber rejects NaN', () => {
    expect(() => assertFiniteNumber(Number.NaN)).toThrow(/finite number/);
    expect(assertFiniteNumber(0)).toBe(0);
  });

  it('fiscalPartsFromIsoDate returns year and month', () => {
    expect(fiscalPartsFromIsoDate('2026-05-28')).toEqual({ year: 2026, month: 5 });
    expect(() => fiscalPartsFromIsoDate('invalid')).toThrow(/YYYY-MM-DD/);
  });
});
