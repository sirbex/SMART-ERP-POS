/**
 * EVIDENCE: Phase 6 — DocumentTax lineResults persisted on sale_items.
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readRel(rel: string): string {
  return readFileSync(path.join(serverRoot, rel), 'utf8');
}

describe('EVIDENCE — Phase 6 sale_items tax persistence', () => {
  it('schema 584 + CURRENT_SCHEMA_VERSION', () => {
    const mig = readRel('../shared/sql/584_sale_items_tax_persistence.sql');
    const ver = readRel('src/constants/schemaVersion.ts');
    expect(mig).toMatch(/tax_amount/);
    expect(mig).toMatch(/tax_rate/);
    expect(mig).toMatch(/tax_determination/);
    expect(mig).toMatch(/OVERRIDE/);
    expect(mig).toMatch(/VALUES \(584\)/);
    // Later phases bump version; migration 584 remains the tax line persistence SSOT.
    expect(ver).toMatch(/CURRENT_SCHEMA_VERSION\s*=\s*58[4-9]/);
  });

  it('createSale stamps lineResults onto itemsWithCosts before persist', () => {
    const src = readRel('src/modules/sales/salesService.ts');
    expect(src).toMatch(/taxDoc\.lineResults/);
    expect(src).toMatch(/taxDetermination/);
    expect(src).toMatch(/itemsWithCosts\[i\]\.taxAmount/);
  });

  it('addSaleItems INSERT includes tax columns', () => {
    const src = readRel('src/modules/sales/salesRepository.ts');
    expect(src).toMatch(/tax_amount, tax_rate, is_taxable, tax_determination/);
    expect(src).toMatch(/taxDetermination/);
  });

  it('does not invent a parallel tax calculator in createSale', () => {
    const src = readRel('src/modules/sales/salesService.ts');
    // Still authoritative DocumentTaxService path
    expect(src).toMatch(/DocumentTaxService\.computeForLines/);
    expect(src).not.toMatch(/function computeLineTax/);
  });
});
