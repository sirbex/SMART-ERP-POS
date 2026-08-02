/**
 * EVIDENCE: Phase 8c — product_tax_mappings admin (DocumentTax MAPPING path).
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readRel(rel: string): string {
  return readFileSync(path.join(serverRoot, rel), 'utf8');
}

describe('EVIDENCE — Phase 8c product tax mappings admin', () => {
  it('repository replaceProductTaxMappings + listProductTaxMappings', () => {
    const src = readRel('src/services/documentTaxRepository.ts');
    expect(src).toMatch(/export async function replaceProductTaxMappings/);
    expect(src).toMatch(/export async function listProductTaxMappings/);
    expect(src).toMatch(/DELETE FROM product_tax_mappings/);
    expect(src).toMatch(/INSERT INTO product_tax_mappings/);
  });

  it('GET/PUT mappings routes before product determination route', () => {
    const src = readRel('src/modules/accounting/enterpriseAccountingRoutes.ts');
    const getIdx = src.search(/router\.get\(\s*['"]\/taxes\/product\/:productId\/mappings['"]/);
    const putIdx = src.search(/router\.put\(\s*['"]\/taxes\/product\/:productId\/mappings['"]/);
    const detIdx = src.search(/router\.get\(\s*['"]\/taxes\/product\/:productId['"]/);
    expect(getIdx).toBeGreaterThan(-1);
    expect(putIdx).toBeGreaterThan(-1);
    expect(detIdx).toBeGreaterThan(getIdx);
    expect(putIdx).toBeLessThan(detIdx);
    expect(src).toMatch(/requirePermission\('accounting\.manage'\)/);
    expect(src).toMatch(/offlineSnapshotHint/);
    expect(src).toMatch(/refresh_tax_snapshot/);
  });

  it('client API helpers exist', () => {
    const src = readRel('../samplepos.client/src/utils/api.ts');
    expect(src).toMatch(/productTaxMappings:/);
    expect(src).toMatch(/setProductTaxMappings:/);
  });

  it('TaxEnginePage has Product Mappings tab', () => {
    const src = readRel('../samplepos.client/src/pages/accounting/TaxEnginePage.tsx');
    expect(src).toMatch(/data-tax-engine-tab=\{t\.key\}/);
    expect(src).toMatch(/mappings/);
    expect(src).toMatch(/data-tax-mappings-panel/);
    expect(src).toMatch(/setProductTaxMappings/);
    expect(src).toMatch(/accounting\.manage/);
    expect(src).toMatch(/refreshTaxSnapshot/);
    expect(src).toMatch(/saleMappingTaxList/);
  });

  it('does not change DocumentTax determination hierarchy', () => {
    const src = readRel('src/services/documentTaxService.ts');
    expect(src).toMatch(/loadProductTaxMappings/);
    expect(src).toMatch(/resolvePreviewLineTaxes/);
    // Still mapping before bridge — no rewrite of order in this phase
    expect(src).not.toMatch(/replaceProductTaxMappings/);
  });
});
