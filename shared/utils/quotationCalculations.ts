import Decimal from 'decimal.js';
import { previewDocumentTax } from './documentTaxPreview.js';

export interface QuotationLineCalc {
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
  isTaxable: boolean;
  taxRate: number;
  productId?: string | null;
}

export function calculateLineTotal(item: QuotationLineCalc): number {
  const subtotal = new Decimal(item.quantity).times(item.unitPrice);
  const afterDiscount = subtotal.minus(item.discountAmount || 0);
  const preview = previewDocumentTax(
    [
      {
        productId: item.productId,
        lineNetAmount: afterDiscount.toNumber(),
        quantity: item.quantity,
        isTaxable: item.isTaxable,
        taxRate: item.taxRate,
      },
    ],
    { preferLineTaxOverrides: true, applyTenantDefaultWhenUnresolved: false },
  );
  return afterDiscount.plus(preview.totalTax).toNumber();
}

export function calculateQuotationTotals(items: QuotationLineCalc[]) {
  let subtotal = new Decimal(0);
  let totalDiscount = new Decimal(0);

  const pricedLines = items.map((item) => {
    const itemSubtotal = new Decimal(item.quantity).times(item.unitPrice);
    subtotal = subtotal.plus(itemSubtotal);
    totalDiscount = totalDiscount.plus(item.discountAmount || 0);
    const afterDiscount = itemSubtotal.minus(item.discountAmount || 0);
    return {
      productId: item.productId,
      lineNetAmount: afterDiscount.toNumber(),
      quantity: item.quantity,
      isTaxable: item.isTaxable,
      taxRate: item.taxRate,
    };
  });

  const preview = previewDocumentTax(pricedLines, {
    preferLineTaxOverrides: true,
    applyTenantDefaultWhenUnresolved: false,
  });

  const total = subtotal.minus(totalDiscount).plus(preview.totalTax);

  return {
    subtotal: subtotal.toNumber(),
    totalDiscount: totalDiscount.toNumber(),
    totalTax: preview.totalTax,
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
