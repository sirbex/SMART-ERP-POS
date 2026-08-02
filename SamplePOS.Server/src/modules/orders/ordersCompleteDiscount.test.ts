import { describe, it, expect } from '@jest/globals';
import Decimal from 'decimal.js';
import { buildOrderCompletionSaleTotals } from './ordersService.js';
import { assertSaleHeaderMatchesCalculatedTotal } from '../sales/saleIntegrity.js';

/** Mirrors createSale item netting + cart discount subtraction. */
function simulateCreateSaleTotal(
  items: Array<{ quantity: number; unitPrice: number; discountAmount: number }>,
  cartDiscount: number,
  tax: number,
): Decimal {
  const linesNet = items.reduce(
    (sum, item) =>
      sum.plus(
        new Decimal(item.quantity)
          .times(item.unitPrice)
          .minus(item.discountAmount || 0),
      ),
    new Decimal(0),
  );
  return linesNet.minus(cartDiscount).plus(tax);
}

describe('buildOrderCompletionSaleTotals', () => {
  it('Henber ORD-2026-6333: line discount must not also pass as cart discount', () => {
    const order = {
      subtotal: '565000.00',
      discountAmount: '5000.00',
      taxAmount: '0.00',
      items: [
        { quantity: '1', unitPrice: '30000.00', discountAmount: '0' },
        { quantity: '1', unitPrice: '185000.00', discountAmount: '0' },
        { quantity: '2', unitPrice: '85000.00', discountAmount: '5000.00' },
        { quantity: '1', unitPrice: '180000.00', discountAmount: '0' },
      ],
    };

    const totals = buildOrderCompletionSaleTotals(order);
    expect(totals.discountAmount).toBe(0);
    expect(totals.totalAmount).toBe(560000);

    const calculated = simulateCreateSaleTotal(
      [
        { quantity: 1, unitPrice: 30000, discountAmount: 0 },
        { quantity: 1, unitPrice: 185000, discountAmount: 0 },
        { quantity: 2, unitPrice: 85000, discountAmount: 5000 },
        { quantity: 1, unitPrice: 180000, discountAmount: 0 },
      ],
      totals.discountAmount,
      totals.taxAmount,
    );
    expect(() =>
      assertSaleHeaderMatchesCalculatedTotal(totals.totalAmount, calculated),
    ).not.toThrow();
  });

  it('header-only cart discount still applies when lines have no discounts', () => {
    const order = {
      subtotal: '100000.00',
      discountAmount: '10000.00',
      taxAmount: '0.00',
      items: [{ quantity: '1', unitPrice: '100000.00', discountAmount: '0' }],
    };

    const totals = buildOrderCompletionSaleTotals(order);
    expect(totals.discountAmount).toBe(10000);
    expect(totals.totalAmount).toBe(90000);
  });

  it('cashier extra discount at payment time stacks on top', () => {
    const order = {
      subtotal: '100000.00',
      discountAmount: '0.00',
      taxAmount: '0.00',
      items: [{ quantity: '1', unitPrice: '100000.00', discountAmount: '0' }],
    };

    const totals = buildOrderCompletionSaleTotals(order, 5000);
    expect(totals.discountAmount).toBe(5000);
    expect(totals.totalAmount).toBe(95000);
  });

  it('authoritativeTaxAmount overrides stale order.taxAmount for createSale parity', () => {
    const order = {
      subtotal: '100000.00',
      discountAmount: '0.00',
      taxAmount: '0.00',
      items: [{ quantity: '1', unitPrice: '100000.00', discountAmount: '0' }],
    };

    const totals = buildOrderCompletionSaleTotals(order, 0, undefined, 18000);
    expect(totals.taxAmount).toBe(18000);
    expect(totals.totalAmount).toBe(118000);
  });
});
