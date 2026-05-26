import { describe, expect, it } from '@jest/globals';
import { PurchaseOrderBusinessRules } from './businessRules.js';

describe('PurchaseOrderBusinessRules.splitGRReceiptQuantities', () => {
  it('caps billable at open PO qty and treats excess as bonus', () => {
    const split = PurchaseOrderBusinessRules.splitGRReceiptQuantities(100, 60, 50, false);
    expect(split.openQty).toBe(40);
    expect(split.billableQty).toBe(40);
    expect(split.bonusQty).toBe(10);
  });

  it('treats full-line bonus as entirely free', () => {
    const split = PurchaseOrderBusinessRules.splitGRReceiptQuantities(10, 0, 15, true);
    expect(split.billableQty).toBe(0);
    expect(split.bonusQty).toBe(15);
  });

  it('allows first receipt over ordered with automatic bonus excess', () => {
    const split = PurchaseOrderBusinessRules.splitGRReceiptQuantities(10, 0, 12, false);
    expect(split.billableQty).toBe(10);
    expect(split.bonusQty).toBe(2);
  });
});
