import { describe, expect, it } from 'vitest';
import { grBillableLineTotal, splitGRReceiptQuantities } from '../utils/grReceiptQuantity';

describe('grReceiptQuantity', () => {
  it('splits billable vs bonus for partial PO', () => {
    expect(splitGRReceiptQuantities(100, 60, 50, false)).toEqual({
      openQty: 40,
      billableQty: 40,
      bonusQty: 10,
    });
  });

  it('computes billable line total for GRNI preview', () => {
    expect(grBillableLineTotal(10, 0, 12, 5, false)).toBe(50);
    expect(grBillableLineTotal(10, 0, 12, 5, true)).toBe(0);
  });
});
