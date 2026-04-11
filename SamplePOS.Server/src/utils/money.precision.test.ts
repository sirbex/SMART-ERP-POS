/**
 * Money Utility — Precision Edge-Case Tests
 *
 * Supplements the existing money.test.ts (~80 tests) with edge cases that
 * specifically target floating-point precision risks in accounting:
 *   - allocate() remainder handling
 *   - lineTotal() with repeating decimals
 *   - calculateTax() on odd amounts
 *   - grossMargin() / markup() boundary conditions
 *   - parseDb() with PostgreSQL NUMERIC string quirks
 *   - Cross-method consistency (round-trip integrity)
 */
import { describe, it, expect } from '@jest/globals';
import Decimal from 'decimal.js';
import { Money } from './money.js';

describe('Money — Precision Edge Cases', () => {
  // ========================================================================
  // allocate() — remainder handling
  // ========================================================================
  describe('allocate — remainder distribution', () => {
    it('should make allocations sum exactly to original amount', () => {
      // 10000 / 3 = 3333.33... each — remainder must be assigned
      const parts = Money.allocate(10000, [1, 1, 1]);
      const sum = parts.reduce((s, p) => s.plus(p), new Decimal(0));
      expect(sum.equals(10000)).toBe(true);
    });

    it('should allocate 1 UGX across 3 with correct remainder', () => {
      // 1 / 3 → each is 0 (rounded to 0dp) → remainder=1 goes to first
      const parts = Money.allocate(1, [1, 1, 1]);
      const sum = parts.reduce((s, p) => s.plus(p), new Decimal(0));
      expect(sum.equals(1)).toBe(true);
      // First item gets the remainder
      expect(parts[0].toNumber()).toBe(1);
      expect(parts[1].toNumber()).toBe(0);
      expect(parts[2].toNumber()).toBe(0);
    });

    it('should allocate weighted amounts with remainder', () => {
      // 100 split 70:30 — exact, no remainder
      const parts = Money.allocate(100, [70, 30]);
      expect(parts[0].toNumber()).toBe(70);
      expect(parts[1].toNumber()).toBe(30);
    });

    it('should allocate 10001 across 3 equal parts', () => {
      // 10001 / 3 = 3333.67 + 3333.67 + 3333.67 = 10001.01 → rounding issue
      // With UGX 0dp: 3334 + 3334 + 3334 = 10002 → remainder = -1
      const parts = Money.allocate(10001, [1, 1, 1]);
      const sum = parts.reduce((s, p) => s.plus(p), new Decimal(0));
      expect(sum.equals(10001)).toBe(true);
    });

    it('should handle empty ratios', () => {
      const parts = Money.allocate(1000, []);
      expect(parts).toHaveLength(0);
    });

    it('should handle all-zero ratios', () => {
      const parts = Money.allocate(1000, [0, 0, 0]);
      parts.forEach(p => expect(p.toNumber()).toBe(0));
    });
  });

  // ========================================================================
  // lineTotal() — quantity × price precision
  // ========================================================================
  describe('lineTotal — precision', () => {
    it('should compute correct total for large quantity × small price', () => {
      // 10000 × 1.99 (but UGX rounds to 0dp)
      const total = Money.lineTotal(10000, 2);
      expect(total.toNumber()).toBe(20000);
    });

    it('should handle fractional quantity (e.g., weight-based)', () => {
      // 2.5 kg × 4000 UGX/kg = 10000
      const total = Money.lineTotal(2.5, 4000);
      expect(total.toNumber()).toBe(10000);
    });

    it('should handle zero quantity', () => {
      const total = Money.lineTotal(0, 5000);
      expect(total.toNumber()).toBe(0);
    });

    it('should handle zero price', () => {
      const total = Money.lineTotal(10, 0);
      expect(total.toNumber()).toBe(0);
    });

    it('should handle very large PO quantities', () => {
      // 1M items × 500 UGX = 500M
      const total = Money.lineTotal(1000000, 500);
      expect(total.toNumber()).toBe(500000000);
    });
  });

  // ========================================================================
  // calculateTax() — odd amounts
  // ========================================================================
  describe('calculateTax — precision', () => {
    it('should calculate 18% VAT on 10000', () => {
      const tax = Money.calculateTax(10000, 18);
      expect(tax.toNumber()).toBe(1800);
    });

    it('should round tax on odd base (18% of 9999)', () => {
      // 9999 × 0.18 = 1799.82 → rounds to 1800 (0dp, ROUND_HALF_UP)
      const tax = Money.calculateTax(9999, 18);
      expect(tax.toNumber()).toBe(1800);
    });

    it('should handle 18% of 1 UGX', () => {
      // 1 × 0.18 = 0.18 → rounds to 0 (0dp)
      const tax = Money.calculateTax(1, 18);
      expect(tax.toNumber()).toBe(0);
    });

    it('should handle 18% of 3 UGX', () => {
      // 3 × 0.18 = 0.54 → rounds to 1 (0dp, ROUND_HALF_UP)
      const tax = Money.calculateTax(3, 18);
      expect(tax.toNumber()).toBe(1);
    });

    it('should handle zero tax rate', () => {
      const tax = Money.calculateTax(10000, 0);
      expect(tax.toNumber()).toBe(0);
    });
  });

  // ========================================================================
  // grossMargin() and markup() — boundary conditions
  // ========================================================================
  describe('grossMargin — boundary', () => {
    it('should return 0 for zero revenue', () => {
      const margin = Money.grossMargin(0, 5000);
      expect(margin.toNumber()).toBe(0);
    });

    it('should return 100% for zero cost', () => {
      const margin = Money.grossMargin(10000, 0);
      expect(margin.toNumber()).toBe(100);
    });

    it('should return negative margin when cost > revenue', () => {
      const margin = Money.grossMargin(8000, 10000);
      expect(margin.toNumber()).toBe(-25); // (8000-10000)/8000 × 100 = -25
    });

    it('should handle typical 30% margin', () => {
      // Revenue=10000, Cost=7000 → margin = 30%
      const margin = Money.grossMargin(10000, 7000);
      expect(margin.toNumber()).toBe(30);
    });

    it('should maintain 2dp precision for percentages', () => {
      // Revenue=10000, Cost=6667 → margin = 33.33%
      const margin = Money.grossMargin(10000, 6667);
      expect(margin.toNumber()).toBe(33.33);
    });
  });

  describe('markup — boundary', () => {
    it('should return 0 for zero cost', () => {
      const m = Money.markup(10000, 0);
      expect(m.toNumber()).toBe(0);
    });

    it('should calculate 100% markup correctly', () => {
      const m = Money.markup(10000, 5000);
      expect(m.toNumber()).toBe(100);
    });

    it('should handle negative markup (selling below cost)', () => {
      const m = Money.markup(4000, 5000);
      expect(m.toNumber()).toBe(-20);
    });
  });

  // ========================================================================
  // parseDb() — PostgreSQL NUMERIC string edge cases
  // ========================================================================
  describe('parseDb — PostgreSQL NUMERIC strings', () => {
    it('should parse normal integer string', () => {
      const val = Money.parseDb('10000');
      expect(val.toNumber()).toBe(10000);
    });

    it('should parse decimal string', () => {
      const val = Money.parseDb('10000.50');
      expect(val.toNumber()).toBe(10000.50);
    });

    it('should parse negative string', () => {
      const val = Money.parseDb('-5000');
      expect(val.toNumber()).toBe(-5000);
    });

    it('should handle null as zero', () => {
      const val = Money.parseDb(null as unknown as string);
      expect(val.toNumber()).toBe(0);
    });

    it('should handle undefined as zero', () => {
      const val = Money.parseDb(undefined as unknown as string);
      expect(val.toNumber()).toBe(0);
    });

    it('should handle empty string as zero', () => {
      const val = Money.parseDb('');
      expect(val.toNumber()).toBe(0);
    });

    it('should handle very long decimal from PG NUMERIC', () => {
      // PostgreSQL NUMERIC can return many decimal places
      const val = Money.parseDb('10000.123456789012345678');
      expect(val.greaterThan(10000)).toBe(true);
      expect(val.lessThan(10001)).toBe(true);
    });

    it('should maintain exact value for large integers', () => {
      const val = Money.parseDb('999999999999');
      expect(val.equals(999999999999)).toBe(true);
    });
  });

  // ========================================================================
  // Round-trip consistency
  // ========================================================================
  describe('round-trip consistency', () => {
    it('parseDb → toNumber should preserve integer values', () => {
      const original = 12345;
      const roundTrip = Money.toNumber(Money.parseDb(String(original)));
      expect(roundTrip).toBe(original);
    });

    it('lineTotal → toNumber should be consistent with manual calc', () => {
      const qty = 7;
      const price = 1500;
      const total = Money.toNumber(Money.lineTotal(qty, price));
      expect(total).toBe(qty * price);
    });

    it('applyDiscount → calculateTax should be composable', () => {
      const basePrice = 10000;
      const discounted = Money.applyDiscount(basePrice, 10, 'PERCENTAGE');
      // 10000 - 10% = 9000
      expect(discounted.toNumber()).toBe(9000);
      const tax = Money.calculateTax(discounted, 18);
      // 9000 × 18% = 1620
      expect(tax.toNumber()).toBe(1620);
    });

    it('grossMargin and markup should be inverses (approximately)', () => {
      // Cost=7000, Price=10000
      // Margin = 30%, Markup = 42.86%
      const margin = Money.grossMargin(10000, 7000);
      const markupVal = Money.markup(10000, 7000);
      // Both should be positive
      expect(margin.greaterThan(0)).toBe(true);
      expect(markupVal.greaterThan(0)).toBe(true);
      // margin < markup (always true when both positive)
      expect(margin.lessThan(markupVal)).toBe(true);
    });

    it('applyMarkup should produce the original price', () => {
      // If cost=7000 and markup=42.857142...% → price ~ 10000
      const cost = 7000;
      const markupPct = Money.markup(10000, cost); // 42.86
      const computedPrice = Money.applyMarkup(cost, markupPct);
      // May be off by 1 UGX due to rounding (42.86% of 7000 = 2999.8 → 3000 → total 10000)
      expect(Math.abs(computedPrice.toNumber() - 10000)).toBeLessThanOrEqual(1);
    });
  });

  // ========================================================================
  // abs() and negate() — sign handling
  // ========================================================================
  describe('abs and negate — sign correctness', () => {
    it('abs of negative should be positive', () => {
      expect(Money.abs(-5000).toNumber()).toBe(5000);
    });

    it('abs of positive should remain positive', () => {
      expect(Money.abs(5000).toNumber()).toBe(5000);
    });

    it('abs of zero should be zero', () => {
      expect(Money.abs(0).toNumber()).toBe(0);
    });

    it('negate should flip sign', () => {
      expect(Money.negate(5000).toNumber()).toBe(-5000);
      expect(Money.negate(-5000).toNumber()).toBe(5000);
    });

    it('negate of zero should be zero (Decimal returns -0)', () => {
      // Decimal.neg(0) produces -0, which is normal IEEE 754 behavior
      // In accounting: -0 == 0 is true, so this is semantically correct
      expect(Money.negate(0).toNumber()).toEqual(-0);
      expect(Money.negate(0).isZero()).toBe(true);
    });
  });
});
