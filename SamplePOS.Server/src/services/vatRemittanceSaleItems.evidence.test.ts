/**
 * EVIDENCE: Phase 7 — VAT remittance / compliance boxes read DocumentTax sale_items.
 * Read-path only — does not change recordSaleToGL / CR 2300.
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readRel(rel: string): string {
  return readFileSync(path.join(serverRoot, rel), 'utf8');
}

describe('EVIDENCE — Phase 7 VAT boxes × sale_items', () => {
  it('getTaxReversalReport includes pos_sale_tax from sale_items', () => {
    const src = readRel('src/modules/reports/cnDnReportRepository.ts');
    expect(src).toMatch(/pos_sale_tax AS/);
    expect(src).toMatch(/FROM sale_items si/);
    expect(src).toMatch(/si\.tax_amount > 0/);
    expect(src).toMatch(/COMPLETED',\s*'PARTIALLY_RETURNED'/);
  });

  it('double-count guard: NOT EXISTS any non-draft invoice for sale', () => {
    const src = readRel('src/modules/reports/cnDnReportRepository.ts');
    expect(src).toMatch(/NOT EXISTS/);
    expect(src).toMatch(/i\.sale_id = s\.id/);
    expect(src).toMatch(/status NOT IN \('CANCELLED', 'DRAFT'\)/);
    // Net remaining qty after partial returns
    expect(src).toMatch(/refunded_qty/);
  });

  it('merges POS + invoice output before supplier FULL OUTER JOIN', () => {
    const src = readRel('src/modules/reports/cnDnReportRepository.ts');
    expect(src).toMatch(/output_tax AS/);
    expect(src).toMatch(/COALESCE\(ct\.sales_tax, 0\) \+ COALESCE\(pst\.sales_tax, 0\)/);
    expect(src).toMatch(/FROM output_tax ot/);
  });

  it('compliance summary notes mention sale_items', () => {
    const src = readRel('src/modules/withholding-tax/whtReportService.ts');
    expect(src).toMatch(/sale_items/);
  });

  it('does not rewrite GL sale VAT posting', () => {
    const gl = readRel('src/services/glEntryService.ts');
    // Still header taxAmount → 2300 (Phase 7 is report-only)
    expect(gl).toMatch(/TAX_PAYABLE/);
    expect(gl).toMatch(/recordSaleToGL/);
    const report = readRel('src/modules/reports/cnDnReportRepository.ts');
    expect(report).not.toMatch(/recordSaleToGL/);
  });

  it('VR06 registry documents Phase 7 sale_items inclusion', () => {
    const reg = readRel('src/modules/vat-remittance/vatRemittanceTouchpointRegistry.ts');
    expect(reg).toMatch(/Phase 7 sale_items/);
    expect(reg).toMatch(/NOT EXISTS guard/);
  });
});
