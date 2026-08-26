import { describe, expect, it } from 'vitest';
import { validateSupplierInvoiceGrnVariance } from './supplierInvoiceGrnValidation.js';

describe('validateSupplierInvoiceGrnVariance', () => {
  it('allows exact match without variance reason', () => {
    const r = validateSupplierInvoiceGrnVariance({
      grnComputedTotal: 100_000,
      invoiceTotal: 100_000,
    });
    expect(r.hasVariance).toBe(false);
  });

  it('allows half-cent noise within tolerance', () => {
    const r = validateSupplierInvoiceGrnVariance({
      grnComputedTotal: 100_000,
      invoiceTotal: 100_000.004,
    });
    expect(r.hasVariance).toBe(false);
  });

  it('blocks over-GRN bill without variance reason', () => {
    expect(() =>
      validateSupplierInvoiceGrnVariance({
        grnComputedTotal: 100_000,
        invoiceTotal: 120_000,
      }),
    ).toThrow(/differs from goods received value/i);
  });

  it('allows over-GRN bill only with PRICE_VARIANCE', () => {
    const r = validateSupplierInvoiceGrnVariance({
      grnComputedTotal: 100_000,
      invoiceTotal: 120_000,
      varianceReason: 'PRICE_VARIANCE',
    });
    expect(r.hasVariance).toBe(true);
    expect(r.varianceAmount).toBe(-20_000);
    expect(r.normalizedReason).toBe('PRICE_VARIANCE');
  });

  it('rejects SUPPLIER_DISCOUNT when bill exceeds GRN', () => {
    expect(() =>
      validateSupplierInvoiceGrnVariance({
        grnComputedTotal: 100_000,
        invoiceTotal: 120_000,
        varianceReason: 'SUPPLIER_DISCOUNT',
      }),
    ).toThrow(/PRICE_VARIANCE/i);
  });

  it('rejects ROUNDING_DIFFERENCE when bill exceeds GRN', () => {
    expect(() =>
      validateSupplierInvoiceGrnVariance({
        grnComputedTotal: 100_000,
        invoiceTotal: 100_050,
        varianceReason: 'ROUNDING_DIFFERENCE',
      }),
    ).toThrow(/PRICE_VARIANCE/i);
  });

  it('allows under-GRN bill with SUPPLIER_DISCOUNT', () => {
    const r = validateSupplierInvoiceGrnVariance({
      grnComputedTotal: 100_000,
      invoiceTotal: 95_000,
      varianceReason: 'SUPPLIER_DISCOUNT',
    });
    expect(r.hasVariance).toBe(true);
    expect(r.varianceAmount).toBe(5_000);
  });

  it('allows under-GRN bill with ROUNDING_DIFFERENCE', () => {
    const r = validateSupplierInvoiceGrnVariance({
      grnComputedTotal: 100_000,
      invoiceTotal: 99_999,
      varianceReason: 'ROUNDING_DIFFERENCE',
    });
    expect(r.hasVariance).toBe(true);
    expect(r.normalizedReason).toBe('ROUNDING_DIFFERENCE');
  });

  it('rejects PRICE_VARIANCE when bill is below GRN', () => {
    expect(() =>
      validateSupplierInvoiceGrnVariance({
        grnComputedTotal: 100_000,
        invoiceTotal: 95_000,
        varianceReason: 'PRICE_VARIANCE',
      }),
    ).toThrow(/below goods received value/i);
  });

  it('rejects EDIT_LINE_PRICES at validation time', () => {
    expect(() =>
      validateSupplierInvoiceGrnVariance({
        grnComputedTotal: 100_000,
        invoiceTotal: 120_000,
        varianceReason: 'EDIT_LINE_PRICES',
      }),
    ).toThrow(/Correct unit costs/i);
  });

  it('blocks under-GRN bill without reason', () => {
    expect(() =>
      validateSupplierInvoiceGrnVariance({
        grnComputedTotal: 100_000,
        invoiceTotal: 90_000,
      }),
    ).toThrow(/differs from goods received value/i);
  });
});
