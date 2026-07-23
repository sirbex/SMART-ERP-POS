import { describe, it, expect } from '@jest/globals';
import Decimal from 'decimal.js';

/** Mirror of surplus math in assessCustomerObReplaceImpact (pure). */
function projectedSurplus(
  allocatedOnOb: number,
  existingUnallocated: number,
  newObAmount: number,
): number {
  return Math.max(
    0,
    new Decimal(allocatedOnOb).plus(existingUnallocated).minus(newObAmount).toDecimalPlaces(2).toNumber(),
  );
}

describe('customer OB replace impact surplus', () => {
  it('flags surplus when receipts exceed new OB (BOU-class)', () => {
    // Old OB 12.8M fully allocated; replace with 5.8M
    expect(projectedSurplus(12_820_715, 0, 5_836_800)).toBe(6_983_915);
  });

  it('is zero when new OB covers freed receipts', () => {
    expect(projectedSurplus(1_000_000, 0, 1_000_000)).toBe(0);
    expect(projectedSurplus(500_000, 200_000, 800_000)).toBe(0);
  });
});
