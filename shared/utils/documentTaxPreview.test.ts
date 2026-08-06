import { describe, it, expect } from '@jest/globals';
import { computeTaxes } from './taxCompute.js';
import {
  previewDocumentTax,
  previewPosCartTax,
  resolvePreviewLineTaxes,
  saleChargeTotal,
  isSaleHeaderTotalConsistent,
} from './documentTaxPreview.js';
import { POSSaleSchema } from '../zod/pos-sale.js';

const VAT18 = {
  id: 'vat18',
  code: 'VAT18',
  name: 'VAT 18%',
  type: 'PERCENTAGE' as const,
  rate: 18,
  isInclusive: false,
  isCompound: false,
  sequence: 10,
  isActive: true,
  taxPayableAccountCode: '2300',
  taxReceivableAccountCode: '2300',
};

describe('shared taxCompute SSOT', () => {
  it('exclusive 18% matches server TaxEngine semantics', () => {
    const r = computeTaxes(100_000, [VAT18], 1, true);
    expect(r.totalTax).toBe(18_000);
    expect(r.totalAmount).toBe(118_000);
  });
});

describe('documentTaxPreview', () => {
  it('POS bridge preview', () => {
    const tax = previewPosCartTax([
      { productId: '11111111-1111-1111-1111-111111111111', subtotal: 100_000, isTaxable: true, taxRate: 18 },
    ]);
    expect(tax).toBe(18_000);
  });

  it('customer exempt → 0', () => {
    const tax = previewPosCartTax(
      [{ subtotal: 100_000, isTaxable: true, taxRate: 18 }],
      { customerExempt: true },
    );
    expect(tax).toBe(0);
  });

  it('mapping wins over product bridge rate', () => {
    const pid = '11111111-1111-1111-1111-111111111111';
    const r = previewDocumentTax(
      [{ productId: pid, lineNetAmount: 100_000, isTaxable: true, taxRate: 10 }],
      {
        productMappings: new Map([[pid, [VAT18]]]),
        taxCatalog: [VAT18],
      },
    );
    expect(r.lineResults[0].determination).toBe('MAPPING');
    expect(r.totalTax).toBe(18_000);
  });

  it('preferLineTaxOverrides for quotations', () => {
    const r = resolvePreviewLineTaxes(
      {
        productId: '11111111-1111-1111-1111-111111111111',
        lineNetAmount: 50_000,
        isTaxable: true,
        taxRate: 18,
      },
      { preferLineTaxOverrides: true, taxCatalog: [VAT18] },
    );
    expect(r.determination).toBe('BRIDGE');
    expect(r.taxes[0].rate).toBe(18);
  });

  it('preferLine beats mapping when line rate is explicit', () => {
    const pid = '11111111-1111-1111-1111-111111111111';
    const r = resolvePreviewLineTaxes(
      { productId: pid, lineNetAmount: 50_000, isTaxable: true, taxRate: 10 },
      {
        preferLineTaxOverrides: true,
        productMappings: new Map([[pid, [VAT18]]]),
        taxCatalog: [VAT18],
      },
    );
    expect(r.determination).toBe('BRIDGE');
    expect(r.taxes[0].rate).toBe(10);
  });

  it('preferLine with taxRate 0 falls through to mapping', () => {
    const pid = '11111111-1111-1111-1111-111111111111';
    const r = resolvePreviewLineTaxes(
      { productId: pid, lineNetAmount: 50_000, isTaxable: true, taxRate: 0 },
      {
        preferLineTaxOverrides: true,
        productMappings: new Map([[pid, [VAT18]]]),
        taxCatalog: [VAT18],
      },
    );
    expect(r.determination).toBe('MAPPING');
    expect(r.taxes[0].rate).toBe(18);
  });

  it('explicit non-taxable does not pick customer defaultVatRate', () => {
    const r = resolvePreviewLineTaxes(
      {
        productId: '11111111-1111-1111-1111-111111111111',
        lineNetAmount: 100_000,
        isTaxable: false,
        taxRate: 0,
      },
      {
        customerProfile: {
          vatRegistered: true,
          taxProfile: 'VAT_REGISTERED',
          defaultVatRate: 18,
        },
        customerDefaultVatRate: 18,
        documentDate: '2026-08-01',
      },
    );
    expect(r.determination).toBe('NONE');
    expect(r.taxes).toHaveLength(0);
  });

  it('explicit non-taxable beats leftover Tax Engine product mapping (retail)', () => {
    const pid = '11111111-1111-1111-1111-111111111111';
    const r = resolvePreviewLineTaxes(
      { productId: pid, lineNetAmount: 100_000, isTaxable: false, taxRate: 0 },
      {
        productMappings: new Map([[pid, [VAT18]]]),
        taxCatalog: [VAT18],
        applyTenantDefaultWhenUnresolved: false,
      },
    );
    expect(r.determination).toBe('NONE');
    expect(r.taxes).toHaveLength(0);
  });

  it('taxInclusive extracts VAT from prices (does not add exclusive tax)', () => {
    const r = previewDocumentTax(
      [{ lineNetAmount: 100_000, isTaxable: true, taxRate: 18 }],
      { taxInclusive: true, applyTenantDefaultWhenUnresolved: false },
    );
    // 100000 / 1.18 * 0.18 ≈ 15254.24; total stays price charged
    expect(r.totalTax).toBeGreaterThan(0);
    expect(r.totalAmount).toBe(100_000);
    expect(r.lineResults[0].determination).toBe('BRIDGE');
    expect(r.lineResults[0].taxes[0]?.isInclusive).toBe(true);
  });

  it('Abchlor proof: 4200 shelf @18% inclusive → tax 640.68, charge 4200 (not 4840.68)', () => {
    const shelf = 4_200;
    const r = previewDocumentTax(
      [{ lineNetAmount: shelf, isTaxable: true, taxRate: 18 }],
      { taxInclusive: true, applyTenantDefaultWhenUnresolved: false },
    );
    expect(r.totalTax).toBe(640.68);
    expect(saleChargeTotal(shelf, r.totalTax, true)).toBe(4_200);
    // Bug trap: exclusive-add of extracted VAT
    expect(saleChargeTotal(shelf, r.totalTax, false)).toBe(4_840.68);

    expect(
      isSaleHeaderTotalConsistent({
        subtotal: shelf,
        taxAmount: r.totalTax,
        totalAmount: 4_200,
      }).mode,
    ).toBe('inclusive');
    expect(
      isSaleHeaderTotalConsistent({
        subtotal: shelf,
        taxAmount: r.totalTax,
        totalAmount: 4_840.68,
      }).mode,
    ).toBe('exclusive');
  });

  it('POSSaleSchema accepts inclusive charge total (tax present, not added)', () => {
    const sale = {
      lineItems: [
        {
          productId: '0ab7c565-ed01-41d4-a173-5536cb382a8a',
          productName: 'Abchlor eye droped',
          sku: 'AB',
          uom: 'piece',
          quantity: 1,
          unitPrice: 4200,
          costPrice: 2000,
          subtotal: 4200,
          taxAmount: 640.68,
          isTaxable: true,
          taxRate: 18,
        },
      ],
      subtotal: 4200,
      discountAmount: 0,
      taxAmount: 640.68,
      totalAmount: 4200,
      paymentLines: [{ paymentMethod: 'CASH' as const, amount: 4200 }],
    };
    const r = POSSaleSchema.safeParse(sale);
    expect(r.success).toBe(true);
  });

  it('FORCE_EXEMPT document override', () => {
    const r = previewDocumentTax(
      [{ lineNetAmount: 100_000, isTaxable: true, taxRate: 18 }],
      { taxOverride: { mode: 'FORCE_EXEMPT', reason: 'Exempt letter on file' } },
    );
    expect(r.totalTax).toBe(0);
    expect(r.lineResults[0].determination).toBe('OVERRIDE');
  });
});
