import { describe, it, expect } from '@jest/globals';
import { buildOrderCompletionSaleTotals } from './ordersService.js';

describe('buildOrderCompletionSaleTotals with repriced sale items', () => {
  it('recalculates total when AT_COST reprice overrides unit prices', () => {
    const order = {
      subtotal: '2100.00',
      discountAmount: '0.00',
      taxAmount: '0.00',
      items: [
        { quantity: '2', unitPrice: '1050.00', discountAmount: '0' },
      ],
    };

    const repricedItems = [{ quantity: 2, unitPrice: 1300, discountAmount: 0 }];
    const totals = buildOrderCompletionSaleTotals(order, 0, repricedItems);

    expect(totals.subtotal).toBe(2600);
    expect(totals.totalAmount).toBe(2600);
  });
});
