import Decimal from 'decimal.js';

export interface QuotationLineCalc {
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
  isTaxable: boolean;
  taxRate: number;
}

export function calculateLineTotal(item: QuotationLineCalc): number {
  const subtotal = new Decimal(item.quantity).times(item.unitPrice);
  const afterDiscount = subtotal.minus(item.discountAmount || 0);
  if (item.isTaxable) {
    const tax = afterDiscount.times(item.taxRate || 0).dividedBy(100);
    return afterDiscount.plus(tax).toNumber();
  }
  return afterDiscount.toNumber();
}

export function calculateQuotationTotals(items: QuotationLineCalc[]) {
  let subtotal = new Decimal(0);
  let totalDiscount = new Decimal(0);
  let totalTax = new Decimal(0);

  items.forEach((item) => {
    const itemSubtotal = new Decimal(item.quantity).times(item.unitPrice);
    subtotal = subtotal.plus(itemSubtotal);
    totalDiscount = totalDiscount.plus(item.discountAmount || 0);

    if (item.isTaxable) {
      const afterDiscount = itemSubtotal.minus(item.discountAmount || 0);
      totalTax = totalTax.plus(afterDiscount.times(item.taxRate || 0).dividedBy(100));
    }
  });

  const total = subtotal.minus(totalDiscount).plus(totalTax);

  return {
    subtotal: subtotal.toNumber(),
    totalDiscount: totalDiscount.toNumber(),
    totalTax: totalTax.toNumber(),
    total: total.toNumber(),
  };
}

/** SSOT: screen + PDF hide tax when no line is taxable. */
export function hasTaxableQuotationLines(items: QuotationLineCalc[]): boolean {
  return items.some((item) => item.isTaxable && (item.taxRate || 0) > 0);
}

/** SSOT: show discount column only when at least one line has a discount. */
export function hasQuotationLineDiscounts(
  items: Array<{ discountAmount?: number | null }>,
): boolean {
  return items.some((item) => (item.discountAmount ?? 0) > 0);
}

export function adjustQuotationQuantity(current: number, delta: number): number {
  const next = new Decimal(current || 0).plus(delta);
  return Math.max(0, next.toNumber());
}
