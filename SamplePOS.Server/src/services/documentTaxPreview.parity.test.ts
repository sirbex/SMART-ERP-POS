/**
 * EVIDENCE: shared taxCompute / documentTaxPreview stay aligned with TaxEngine + DocumentTaxService.
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TaxEngine } from './taxEngine.js';
import { computeTaxes } from '@shared/utils/taxCompute.js';
import {
  previewPosCartTax,
  previewDocumentTax,
} from '@shared/utils/documentTaxPreview.js';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const VAT18 = {
  id: 'vat18',
  code: 'VAT18',
  name: 'VAT 18%',
  type: 'PERCENTAGE' as const,
  rate: 18,
  isInclusive: false,
  isCompound: false,
  sequence: 10,
  scope: 'BOTH' as const,
  taxPayableAccountCode: '2300',
  taxReceivableAccountCode: '2300',
  isActive: true,
};

describe('shared ↔ server tax compute parity', () => {
  it('TaxEngine.compute equals shared computeTaxes', () => {
    const a = TaxEngine.compute(99_999, [VAT18], 1, true);
    const b = computeTaxes(99_999, [VAT18], 1, true);
    expect(a.totalTax).toBe(b.totalTax);
    expect(a.untaxedAmount).toBe(b.untaxedAmount);
    expect(a.totalAmount).toBe(b.totalAmount);
  });

  it('POS cart preview matches exclusive product bridge', () => {
    expect(
      previewPosCartTax([
        {
          productId: '11111111-1111-1111-1111-111111111111',
          subtotal: 100_000,
          isTaxable: true,
          taxRate: 18,
        },
      ]),
    ).toBe(18_000);
  });

  it('quotation-style preferLineTaxOverrides zeros when not taxable', () => {
    const r = previewDocumentTax(
      [
        {
          productId: '11111111-1111-1111-1111-111111111111',
          lineNetAmount: 100_000,
          isTaxable: false,
          taxRate: 18,
        },
      ],
      { preferLineTaxOverrides: true },
    );
    expect(r.totalTax).toBe(0);
  });

  it('preferLine with explicit rate beats product mapping', () => {
    const pid = '11111111-1111-1111-1111-111111111111';
    const r = previewDocumentTax(
      [{ productId: pid, lineNetAmount: 100_000, isTaxable: true, taxRate: 10 }],
      {
        preferLineTaxOverrides: true,
        productMappings: new Map([[pid, [VAT18]]]),
        taxCatalog: [VAT18],
      },
    );
    expect(r.totalTax).toBe(10_000);
  });

  it('explicit non-taxable ignores customer defaultVatRate', () => {
    const r = previewDocumentTax(
      [
        {
          productId: '11111111-1111-1111-1111-111111111111',
          lineNetAmount: 100_000,
          isTaxable: false,
        },
      ],
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
    expect(r.totalTax).toBe(0);
  });

  it('taxInclusive extracts VAT and keeps total at shelf price', () => {
    const r = previewDocumentTax(
      [{ lineNetAmount: 100_000, isTaxable: true, taxRate: 18 }],
      { taxInclusive: true, applyTenantDefaultWhenUnresolved: false },
    );
    expect(r.totalTax).toBeGreaterThan(0);
    expect(r.totalAmount).toBe(100_000);
  });
});

describe('EVIDENCE — Phase 3 client preview + offline wiring', () => {
  it('POSPage uses previewPosCartTax', () => {
    const src = readFileSync(
      path.join(serverRoot, '../samplepos.client/src/pages/pos/POSPage.tsx'),
      'utf8',
    );
    expect(src).toMatch(/previewPosCartTax/);
    expect(src).toMatch(/getCachedTaxSnapshot|getTaxCatalogForPreview/);
  });

  it('offline catalog syncs tax snapshot', () => {
    const src = readFileSync(
      path.join(serverRoot, '../samplepos.client/src/services/offlineCatalogService.ts'),
      'utf8',
    );
    expect(src).toMatch(/taxes\/snapshot/);
    expect(src).toMatch(/syncTaxSnapshot/);
    expect(src).toMatch(/TAX_SNAPSHOT_KEY|pos_tax_snapshot/);
  });

  it('snapshot API exists and TaxEngine uses shared compute', () => {
    const routes = readFileSync(
      path.join(serverRoot, 'src/modules/accounting/enterpriseAccountingRoutes.ts'),
      'utf8',
    );
    const engine = readFileSync(path.join(serverRoot, 'src/services/taxEngine.ts'), 'utf8');
    expect(routes).toMatch(/taxes\/snapshot/);
    expect(routes).toMatch(/loadTaxPreviewSnapshot/);
    expect(engine).toMatch(/computeTaxes/);
    expect(engine).toMatch(/@shared\/utils\/taxCompute/);
  });

  it('quotationCalculations uses documentTaxPreview', () => {
    const src = readFileSync(
      path.join(serverRoot, '../shared/utils/quotationCalculations.ts'),
      'utf8',
    );
    expect(src).toMatch(/previewDocumentTax/);
    expect(src).toMatch(/preferLineTaxOverrides:\s*true/);
  });
});
