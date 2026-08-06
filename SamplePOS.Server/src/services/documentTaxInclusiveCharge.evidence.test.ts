/**
 * EVIDENCE — inclusive cart charge vs exclusive-add trap (4840.68 regression).
 *
 * Proves for Abchlor-class shelf 4,200 @ 18% tax_inclusive:
 *   tax = 640.68 (extracted)
 *   charge = 4,200 (not 4,840.68)
 * And POSSaleSchema / saleChargeTotal / server assert messaging are consistent.
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  previewDocumentTax,
  saleChargeTotal,
  isSaleHeaderTotalConsistent,
} from '../../../shared/utils/documentTaxPreview.js';
import { POSSaleSchema } from '../../../shared/zod/pos-sale.js';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('EVIDENCE — inclusive charge integrity (4840.68 trap)', () => {
  const shelf = 4_200;
  const extracted = 640.68;
  const exclusiveTrap = 4_840.68; // 4200 + 640.68

  it('DocumentTax math: extract VAT, document total stays shelf', () => {
    const r = previewDocumentTax(
      [{ lineNetAmount: shelf, isTaxable: true, taxRate: 18 }],
      { taxInclusive: true, applyTenantDefaultWhenUnresolved: false },
    );
    expect(r.totalTax).toBe(extracted);
    expect(r.totalAmount).toBe(shelf);
    expect(r.lineResults[0].determination).not.toBe('DISABLED');
  });

  it('saleChargeTotal does not exclusive-add under inclusive', () => {
    expect(saleChargeTotal(shelf, extracted, true)).toBe(shelf);
    expect(saleChargeTotal(shelf, extracted, false)).toBe(exclusiveTrap);
  });

  it('header consistency recognizes both modes', () => {
    expect(
      isSaleHeaderTotalConsistent({
        subtotal: shelf,
        taxAmount: extracted,
        totalAmount: shelf,
      }).mode,
    ).toBe('inclusive');
    expect(
      isSaleHeaderTotalConsistent({
        subtotal: shelf,
        taxAmount: extracted,
        totalAmount: exclusiveTrap,
      }).mode,
    ).toBe('exclusive');
  });

  it('POSSaleSchema accepts inclusive payload (tax stamped, not added to total)', () => {
    const r = POSSaleSchema.safeParse({
      lineItems: [
        {
          productId: '0ab7c565-ed01-41d4-a173-5536cb382a8a',
          productName: 'Abchlor eye droped',
          sku: '',
          uom: 'pcs',
          quantity: 1,
          unitPrice: shelf,
          costPrice: 2000,
          subtotal: shelf,
          taxAmount: extracted,
        },
      ],
      subtotal: shelf,
      taxAmount: extracted,
      totalAmount: shelf,
      paymentLines: [{ paymentMethod: 'CASH', amount: shelf }],
    });
    expect(r.success).toBe(true);
  });

  it('POSSaleSchema still accepts exclusive payload', () => {
    const exclusiveTax = 756; // 4200 * 0.18
    const exclusiveTotal = 4_956;
    const r = POSSaleSchema.safeParse({
      lineItems: [
        {
          productId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          productName: 'Exclusive item',
          sku: '',
          uom: 'pcs',
          quantity: 1,
          unitPrice: shelf,
          costPrice: 2000,
          subtotal: shelf,
        },
      ],
      subtotal: shelf,
      taxAmount: exclusiveTax,
      totalAmount: exclusiveTotal,
      paymentLines: [{ paymentMethod: 'CASH', amount: exclusiveTotal }],
    });
    expect(r.success).toBe(true);
  });

  it('POS cart uses saleChargeTotal; schema accepts inclusive total', () => {
    const pos = readFileSync(path.join(serverRoot, '../samplepos.client/src/pages/pos/POSPage.tsx'), 'utf8');
    const zod = readFileSync(path.join(serverRoot, '../shared/zod/pos-sale.ts'), 'utf8');
    expect(pos).toMatch(/saleChargeTotal/);
    // Price-mode SSOT = system_settings.tax_inclusive only
    expect(pos).toMatch(/taxInclusivePricing = taxPreviewCtx\.taxInclusive === true/);
    expect(pos).toMatch(/refreshTaxSnapshot/);
    expect(zod).toMatch(/inclusive expected/);
    expect(zod).not.toMatch(
      /Validate total = subtotal - discount \+ tax\n  const discountAmount = data\.discountAmount \|\| 0;\n  const calculatedTotal = data\.subtotal - discountAmount \+ data\.taxAmount;/,
    );
  });

  it('exclusive settings untick: add VAT on top of shelf', () => {
    const shelf = 4_200;
    const exclusiveTax = 756; // 18% exclusive on 4200
    const r = previewDocumentTax(
      [{ lineNetAmount: shelf, isTaxable: true, taxRate: 18 }],
      { taxInclusive: false, applyTenantDefaultWhenUnresolved: false },
    );
    expect(r.totalTax).toBe(exclusiveTax);
    expect(saleChargeTotal(shelf, r.totalTax, false)).toBe(shelf + exclusiveTax);
  });
});
