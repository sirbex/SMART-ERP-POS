/**
 * EVIDENCE: Phase 5 DocumentTax VAT override — RBAC, determination, createSale audit.
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DocumentTaxOverrideSchema } from '../../../shared/zod/taxOverride.js';
import { previewDocumentTax, previewPosCartTax } from '@shared/utils/documentTaxPreview.js';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readRel(rel: string): string {
  return readFileSync(path.join(serverRoot, rel), 'utf8');
}

describe('tax override schema', () => {
  it('FORCE_EXEMPT requires reason', () => {
    expect(
      DocumentTaxOverrideSchema.safeParse({ mode: 'FORCE_EXEMPT', reason: 'ok' }).success,
    ).toBe(false);
    expect(
      DocumentTaxOverrideSchema.safeParse({
        mode: 'FORCE_EXEMPT',
        reason: 'Diplomatic letter',
      }).success,
    ).toBe(true);
  });

  it('FORCE_RATE requires rate', () => {
    expect(
      DocumentTaxOverrideSchema.safeParse({
        mode: 'FORCE_RATE',
        reason: 'Special rate agreed',
      }).success,
    ).toBe(false);
    expect(
      DocumentTaxOverrideSchema.safeParse({
        mode: 'FORCE_RATE',
        rate: 0,
        reason: 'Zero-rated export',
      }).success,
    ).toBe(true);
  });
});

describe('tax override determination', () => {
  it('FORCE_EXEMPT → 0 tax with OVERRIDE determination', () => {
    const r = previewDocumentTax(
      [{ lineNetAmount: 100_000, isTaxable: true, taxRate: 18 }],
      {
        taxOverride: { mode: 'FORCE_EXEMPT', reason: 'Exempt per letter' },
      },
    );
    expect(r.totalTax).toBe(0);
    expect(r.lineResults[0].determination).toBe('OVERRIDE');
  });

  it('FORCE_RATE overrides product bridge', () => {
    const tax = previewPosCartTax(
      [
        {
          productId: '11111111-1111-1111-1111-111111111111',
          subtotal: 100_000,
          isTaxable: true,
          taxRate: 18,
        },
      ],
      {
        taxOverride: { mode: 'FORCE_RATE', rate: 10, reason: 'Agreed 10 percent' },
      },
    );
    expect(tax).toBe(10_000);
  });

  it('override wins over require-registered walk-in zero', () => {
    const tax = previewPosCartTax(
      [{ subtotal: 100_000, isTaxable: true, taxRate: 18 }],
      {
        vatOutputRequiresRegisteredCustomer: true,
        customerProfile: null,
        taxOverride: { mode: 'FORCE_RATE', rate: 18, reason: 'Manager override walk-in' },
      },
    );
    expect(tax).toBe(18_000);
  });
});

describe('EVIDENCE — Phase 5 wiring', () => {
  it('schema 583 + CURRENT_SCHEMA_VERSION', () => {
    const mig = readRel('../shared/sql/583_sales_tax_override.sql');
    const ver = readRel('src/constants/schemaVersion.ts');
    expect(mig).toMatch(/sales\.tax_override/);
    expect(mig).toMatch(/tax_override_mode/);
    expect(mig).toMatch(/VALUES \(583\)/);
    // Phase 6 bumped schema to 584; Phase 5 migration remains 583.
    expect(ver).toMatch(/CURRENT_SCHEMA_VERSION\s*=\s*58[34]/);
  });

  it('permissions catalog includes sales.tax_override', () => {
    const src = readRel('src/rbac/permissions.ts');
    expect(src).toMatch(/sales\.tax_override/);
    expect(src).toMatch(/SALES_TAX_OVERRIDE/);
  });

  it('DocumentTaxService accepts taxOverride', () => {
    const src = readRel('src/services/documentTaxService.ts');
    expect(src).toMatch(/taxOverride/);
    expect(src).toMatch(/FORCE_EXEMPT/);
    expect(src).toMatch(/taxOverrideApplied/);
  });

  it('createSale asserts permission, persists columns, audits TAX_OVERRIDE', () => {
    const src = readRel('src/modules/sales/salesService.ts');
    expect(src).toMatch(/sales\.tax_override/);
    expect(src).toMatch(/ERR_TAX_OVERRIDE_PERMISSION/);
    expect(src).toMatch(/ERR_TAX_OVERRIDE_CUSTOMER/);
    expect(src).toMatch(/TAX_OVERRIDE/);
    expect(src).toMatch(/taxOverrideMode/);
  });

  it('POSSaleSchema + POS routes pass taxOverride', () => {
    const zod = readRel('../shared/zod/pos-sale.ts');
    const routes = readRel('src/modules/sales/salesRoutes.ts');
    expect(zod).toMatch(/taxOverride/);
    expect(routes).toMatch(/taxOverride: posData\.taxOverride/);
  });

  it('POS page gates Override UX on sales.tax_override', () => {
    const pos = readRel('../samplepos.client/src/pages/pos/POSPage.tsx');
    const dlg = readRel('../samplepos.client/src/components/pos/TaxOverrideDialog.tsx');
    expect(pos).toMatch(/sales\.tax_override/);
    expect(pos).toMatch(/data-tax-override-open/);
    expect(pos).toMatch(/TaxOverrideDialog/);
    expect(dlg).toMatch(/FORCE_EXEMPT/);
    expect(dlg).toMatch(/data-tax-override-reason/);
  });
});
