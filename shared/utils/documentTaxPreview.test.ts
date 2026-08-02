import { describe, it, expect } from '@jest/globals';
import { computeTaxes } from './taxCompute.js';
import {
  previewDocumentTax,
  previewPosCartTax,
  resolvePreviewLineTaxes,
} from './documentTaxPreview.js';

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

  it('taxInclusive disables added exclusive tax on retail path', () => {
    const r = previewDocumentTax(
      [{ lineNetAmount: 100_000, isTaxable: true, taxRate: 18 }],
      { taxInclusive: true, applyTenantDefaultWhenUnresolved: false },
    );
    expect(r.totalTax).toBe(0);
    expect(r.lineResults[0].determination).toBe('DISABLED');
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
