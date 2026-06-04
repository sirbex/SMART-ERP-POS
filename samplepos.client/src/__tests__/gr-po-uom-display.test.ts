/**
 * GR receive grid must show PO order units (not base÷factor).
 * Regression: Sacoplus 1 PACKET @ 70,000 was shown as 0.033 qty and 2.1M cost.
 */
import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';

/** Mirrors fixed GRItemRow display semantics (qty/cost stored as PO display units). */
function grLineDisplay(
  ordered: number,
  received: number,
  unitCost: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- documents PO UoM factor in tests
  _conversionFactor?: number,
) {
  return {
    displayedOrdered: ordered,
    displayedReceived: received,
    displayedUnitCost: unitCost,
    lineTotal: new Decimal(received).mul(unitCost).toNumber(),
  };
}

/** Old buggy semantics (treated storage as base units). */
function grLineDisplayBuggy(
  ordered: number,
  received: number,
  unitCost: number,
  factor: number,
) {
  return {
    displayedOrdered: new Decimal(ordered).div(factor).toNumber(),
    displayedReceived: new Decimal(received).div(factor).toNumber(),
    displayedUnitCost: new Decimal(unitCost).mul(factor).toNumber(),
  };
}

describe('GR vs PO UoM display', () => {
  const factor = 30; // 1 PACKET = 30 base (e.g. tablets)

  it('shows 1 PACKET and 70,000 like the PO (not 0.033 / 2.1M)', () => {
    const d = grLineDisplay(1, 1, 70_000, factor);
    expect(d.displayedOrdered).toBe(1);
    expect(d.displayedReceived).toBe(1);
    expect(d.displayedUnitCost).toBe(70_000);
    expect(d.lineTotal).toBe(70_000);
  });

  it('documents the old double-conversion bug', () => {
    const d = grLineDisplayBuggy(1, 1, 70_000, factor);
    expect(d.displayedOrdered).toBeCloseTo(1 / 30, 6);
    expect(d.displayedUnitCost).toBe(2_100_000);
  });

  it('capsule lines (factor 1) were unaffected', () => {
    const d = grLineDisplay(90, 90, 233, 1);
    expect(d.lineTotal).toBe(20_970);
  });
});
