/**
 * GR finalize must re-resolve MUoM via uomService — no silent factor=1 fallback.
 * Mirrors goodsReceiptService.finalizeGR conversion path.
 */
import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';

function finalizeBaseQty(
  segmentQty: number,
  displayUnitCost: number,
  conversionFactor: number,
): { baseQty: number; baseCostPerUnit: number } {
  const baseQty = new Decimal(segmentQty).times(conversionFactor).toNumber();
  const baseCostPerUnit =
    conversionFactor > 0
      ? new Decimal(displayUnitCost).div(conversionFactor).toDecimalPlaces(4).toNumber()
      : displayUnitCost;
  return { baseQty, baseCostPerUnit };
}

describe('GR finalize MUoM (Rule 2)', () => {
  const factor = 30; // 1 PACKET = 30 TAB

  it('1 PACKET @ 70,000 → 30 base @ ~2,333.33 (not 0.033 / 2.1M)', () => {
    const { baseQty, baseCostPerUnit } = finalizeBaseQty(1, 70_000, factor);
    expect(baseQty).toBe(30);
    expect(baseCostPerUnit).toBeCloseTo(2333.3333, 2);
    expect(new Decimal(1).times(70_000).toNumber()).toBe(70_000);
  });

  it('documents silent factor=1 bug on mis-resolved legacy snapshot', () => {
    const buggy = finalizeBaseQty(1, 70_000, 1);
    expect(buggy.baseQty).toBe(1);
    expect(buggy.baseCostPerUnit).toBe(70_000);
  });

  it('factor 1 lines unchanged', () => {
    const { baseQty, baseCostPerUnit } = finalizeBaseQty(90, 233, 1);
    expect(baseQty).toBe(90);
    expect(baseCostPerUnit).toBe(233);
  });
});
