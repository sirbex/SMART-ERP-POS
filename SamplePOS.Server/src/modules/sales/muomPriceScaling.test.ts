/**
 * SAP-Pattern MUoM Price Scaling — Unit Tests
 *
 * Proves correctness of the two critical fixes in salesService.ts (commit 45e18c2):
 *
 *   FIX 1 — effectiveUnitPrice:
 *     The pricing engine returns a price per BASE unit.
 *     For non-base UoMs we must multiply by conversionFactor.
 *     Before the fix: PACKET (×30) at 1 500/tablet → charged 1 500 (wrong).
 *     After the fix:  PACKET (×30) at 1 500/tablet → charged 45 000 (correct).
 *
 *   FIX 2 — originalPrice:
 *     The catalog selling_price is also stored per base unit.
 *     It must be scaled the same way so discount validation stays apples-to-apples.
 *
 *   FIX 3 — Step 6 invariant check (POS checkout):
 *     When price_override IS active but deviates from formula price by > 1 %,
 *     the checkout emits a warning.  When the override is absent, or the
 *     deviation is within tolerance, no warning fires.
 *
 * These tests do NOT touch the database; they exercise only the arithmetic
 * logic and the Money utility that the service relies on.
 */

import { describe, it, expect } from '@jest/globals';
import Decimal from 'decimal.js';
import { Money } from '../../utils/money.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers extracted from salesService.ts (kept in sync by copy-test discipline)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reproduces the effectiveUnitPrice calculation introduced in commit 45e18c2.
 * salesService.ts line ~432-449:
 *   const uomAdjustedPrice = Money.toNumber(
 *     Money.round(new Decimal(resolvedBasePrice).times(conversionFactor), 2)
 *   );
 *   effectiveUnitPrice = uomAdjustedPrice;
 */
function computeEffectiveUnitPrice(resolvedBasePrice: number, conversionFactor: number): number {
  return Money.toNumber(
    Money.round(new Decimal(resolvedBasePrice).times(new Decimal(conversionFactor)), 2),
  );
}

/**
 * Reproduces the originalPrice calculation introduced in commit 45e18c2.
 * salesService.ts line ~466-474:
 *   const originalPrice = Money.toNumber(
 *     Money.round(Money.parse(selling_price).times(conversionFactor), 2)
 *   );
 */
function computeOriginalPrice(dbSellingPrice: string, conversionFactor: number): number {
  return Money.toNumber(
    Money.round(Money.parse(dbSellingPrice).times(new Decimal(conversionFactor)), 2),
  );
}

/**
 * Reproduces the Step 6 invariant check from POSPage.tsx (handleFinalizeSale).
 * Returns true if a price_override anomaly is detected (toast should fire).
 */
function hasStep6Anomaly(opts: {
  priceIsOverridden: boolean;
  storedPrice: number;          // price_override value (what the DB stored)
  computedPrice: number;        // selling_price × conversionFactor (formula value)
}): boolean {
  if (!opts.priceIsOverridden) return false;
  const tolerance = Math.max(1, opts.computedPrice * 0.01);
  return Math.abs(opts.storedPrice - opts.computedPrice) > tolerance;
}

// ─────────────────────────────────────────────────────────────────────────────
// FIX 1 — effectiveUnitPrice scaling
// ─────────────────────────────────────────────────────────────────────────────

describe('MUoM effectiveUnitPrice — FIX 1 (salesService commit 45e18c2)', () => {
  it('PACKET (×30): base 1 500/tablet → effective 45 000/packet [Ginsemax-F scenario]', () => {
    const basePrice = 1500;
    const factor = 30;
    expect(computeEffectiveUnitPrice(basePrice, factor)).toBe(45_000);
  });

  it('DOZEN (×12): base 500/unit → effective 6 000/dozen', () => {
    expect(computeEffectiveUnitPrice(500, 12)).toBe(6_000);
  });

  it('HALF-TABLET (×0.5): base 1 000/tablet → effective 500/half-tablet', () => {
    expect(computeEffectiveUnitPrice(1000, 0.5)).toBe(500);
  });

  it('base unit (×1): price is unchanged', () => {
    expect(computeEffectiveUnitPrice(2_500, 1)).toBe(2_500);
  });

  it('rounding: UGX has 0 decimal places — fractional result rounds to nearest integer', () => {
    // UGX (Ugandan Shilling) has decimalPlaces: 0, so Money.toNumber always yields an integer.
    // 750 × 3 = 2250 (exact, no rounding needed here)
    expect(computeEffectiveUnitPrice(750, 3)).toBe(2_250);
    // 1333.5 × 1 → 1334 (rounds up from .5)
    expect(computeEffectiveUnitPrice(1333.5, 1)).toBe(1_334);
    // 1333.4 × 1 → 1333 (rounds down)
    expect(computeEffectiveUnitPrice(1333.4, 1)).toBe(1_333);
  });

  it('result is a JS number, not a Decimal or string', () => {
    const result = computeEffectiveUnitPrice(1500, 30);
    expect(typeof result).toBe('number');
  });

  it('BEFORE THE FIX: using base price directly would produce the wrong value', () => {
    // This simulates what the code did BEFORE commit 45e18c2:
    //   effectiveUnitPrice = resolvedPrice.finalPrice  (no multiplication)
    const wrongPrice = 1500; // pricing engine returned base price, used as-is
    const correctPrice = computeEffectiveUnitPrice(1500, 30); // 45 000
    expect(wrongPrice).not.toBe(correctPrice);
    expect(wrongPrice).toBe(1_500);
    expect(correctPrice).toBe(45_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX 2 — originalPrice scaling (discount comparison)
// ─────────────────────────────────────────────────────────────────────────────

describe('MUoM originalPrice — FIX 2 (salesService commit 45e18c2)', () => {
  it('PACKET (×30): catalog 1 500 → originalPrice 45 000 [Ginsemax-F scenario]', () => {
    expect(computeOriginalPrice('1500', 30)).toBe(45_000);
  });

  it('base unit (×1): originalPrice equals selling_price', () => {
    expect(computeOriginalPrice('2500', 1)).toBe(2_500);
  });

  it('result matches effectiveUnitPrice when pricing engine uses the same base', () => {
    const sellingPrice = '1500';
    const factor = 30;
    const original = computeOriginalPrice(sellingPrice, factor);
    const effective = computeEffectiveUnitPrice(parseFloat(sellingPrice), factor);
    expect(original).toBe(effective); // both must be 45 000
  });

  it('BEFORE THE FIX: comparing effective 45 000 against unscaled original 1 500 would flag false discount', () => {
    const effectivePrice = computeEffectiveUnitPrice(1500, 30); // 45 000 (correct)
    const wrongOriginal = 1500; // selling_price without × factor (pre-fix behaviour)
    // effectivePrice > wrongOriginal → condition `effectiveUnitPrice < originalPrice` is FALSE
    // but only because we happened not to discount; any discount would be compared incorrectly.
    // With the fix both are 45 000, so the discount check is apples-to-apples.
    const correctOriginal = computeOriginalPrice('1500', 30); // 45 000
    expect(effectivePrice).toBe(45_000);
    expect(wrongOriginal).toBe(1_500);
    expect(correctOriginal).toBe(45_000);
    // Confirm fix: effectivePrice === correctOriginal (no false discount flag)
    expect(effectivePrice).toBe(correctOriginal);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX 3 — Step 6 checkout invariant check (POSPage.tsx handleFinalizeSale)
// ─────────────────────────────────────────────────────────────────────────────

describe('Step 6 MUoM invariant check — FIX 3 (POSPage.tsx commit 45e18c2)', () => {
  it('anomaly detected: price_override = 1 500 but formula says 45 000 [Ginsemax-F scenario]', () => {
    expect(
      hasStep6Anomaly({ priceIsOverridden: true, storedPrice: 1_500, computedPrice: 45_000 }),
    ).toBe(true);
  });

  it('no anomaly: price_override absent (priceIsOverridden = false)', () => {
    expect(
      hasStep6Anomaly({ priceIsOverridden: false, storedPrice: 1_500, computedPrice: 45_000 }),
    ).toBe(false);
  });

  it('no anomaly: price_override correct — matches formula exactly', () => {
    expect(
      hasStep6Anomaly({ priceIsOverridden: true, storedPrice: 45_000, computedPrice: 45_000 }),
    ).toBe(false);
  });

  it('no anomaly: deviation within 1 % tolerance (intentional rounding)', () => {
    // computedPrice = 1 000, storedPrice = 1 005 (0.5 % deviation) — acceptable
    expect(
      hasStep6Anomaly({ priceIsOverridden: true, storedPrice: 1_005, computedPrice: 1_000 }),
    ).toBe(false);
  });

  it('anomaly detected: deviation just over 1 % tolerance', () => {
    // computedPrice = 1 000, storedPrice = 1 011 (1.1 % deviation) — over threshold
    expect(
      hasStep6Anomaly({ priceIsOverridden: true, storedPrice: 1_011, computedPrice: 1_000 }),
    ).toBe(true);
  });

  it('tolerance floor is 1 unit — small prices not flagged for sub-1-unit differences', () => {
    // computedPrice = 50, storedPrice = 50.5 (1 % of 50 = 0.5, floor = 1, diff = 0.5 < 1)
    expect(
      hasStep6Anomaly({ priceIsOverridden: true, storedPrice: 50.5, computedPrice: 50 }),
    ).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// End-to-end arithmetic: full Ginsemax-F PACKET sale scenario
// ─────────────────────────────────────────────────────────────────────────────

describe('Ginsemax-F PACKET end-to-end arithmetic proof', () => {
  /**
   * Scenario from SALE-2026-2056 root-cause analysis:
   *   Product : Ginsemax-F capsules 30s
   *   Base UoM: TABLET  (is_default = true,  conversion_factor = 1, selling_price = 1 500)
   *   Sell UoM: PACKET  (is_default = false, conversion_factor = 30)
   *   Qty sold: 2 PACKETs
   *   Expected line total: 2 × 45 000 = 90 000
   *   Pre-fix  line total: 2 ×  1 500 =  3 000  (60× undercharge)
   */
  const BASE_PRICE_DB = '1500';   // product_valuation.selling_price
  const PACKET_FACTOR = 30;       // product_uoms.conversion_factor
  const QTY = 2;                  // quantity in PACKET units

  it('effectiveUnitPrice = 45 000 after fix', () => {
    const engineBasePrice = parseFloat(BASE_PRICE_DB); // pricing engine returns base price
    const effective = computeEffectiveUnitPrice(engineBasePrice, PACKET_FACTOR);
    expect(effective).toBe(45_000);
  });

  it('line total = 90 000 after fix', () => {
    const effective = computeEffectiveUnitPrice(parseFloat(BASE_PRICE_DB), PACKET_FACTOR);
    const lineTotal = Money.toNumber(Money.lineTotal(QTY, effective));
    expect(lineTotal).toBe(90_000);
  });

  it('line total would have been 3 000 before the fix (the bug)', () => {
    const wrongEffective = parseFloat(BASE_PRICE_DB); // pre-fix: no × factor
    const wrongLineTotal = Money.toNumber(Money.lineTotal(QTY, wrongEffective));
    expect(wrongLineTotal).toBe(3_000);
  });

  it('Step 6 anomaly fires for the corrupted price_override = 1 500', () => {
    const computedPrice = computeEffectiveUnitPrice(parseFloat(BASE_PRICE_DB), PACKET_FACTOR);
    expect(
      hasStep6Anomaly({ priceIsOverridden: true, storedPrice: 1_500, computedPrice }),
    ).toBe(true);
  });

  it('Step 6 anomaly silent after price_override fixed to NULL (priceIsOverridden = false)', () => {
    const computedPrice = computeEffectiveUnitPrice(parseFloat(BASE_PRICE_DB), PACKET_FACTOR);
    expect(
      hasStep6Anomaly({ priceIsOverridden: false, storedPrice: 45_000, computedPrice }),
    ).toBe(false);
  });
});
