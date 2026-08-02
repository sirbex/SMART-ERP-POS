/**
 * EVIDENCE: DocumentTaxService is the sales determination façade;
 * TaxEngine is arithmetic-only (no SQL).
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readRel(rel: string): string {
  return readFileSync(path.join(serverRoot, rel), 'utf8');
}

describe('EVIDENCE — DocumentTaxService canonical tax architecture', () => {
  it('TaxEngine has no SQL / pool imports', () => {
    const src = readRel('src/services/taxEngine.ts');
    expect(src).not.toMatch(/from ['"].*pool/);
    expect(src).not.toMatch(/\.query\(/);
    expect(src).not.toMatch(/getApplicableTaxes/);
    expect(src).toMatch(/static compute\(/);
  });

  it('createSale uses DocumentTaxService and does not trust client tax alone', () => {
    const src = readRel('src/modules/sales/salesService.ts');
    expect(src).toMatch(/DocumentTaxService\.computeForLines/);
    expect(src).toMatch(/resolveAuthoritativeTaxAmount/);
    // Restaurant settle: applyTenantDefault from isRestaurantCheck; retail stays false
    expect(src).toMatch(/applyTenantDefaultWhenUnresolved/);
    expect(src).toMatch(/isRestaurantCheck/);
    expect(src).toMatch(/ERR_TAX_LINE_MISMATCH/);
  });

  it('restaurant uses DocumentTaxService with tenant-default fallback', () => {
    const src = readRel('src/modules/restaurant/restaurantService.ts');
    expect(src).toMatch(/DocumentTaxService\.computeForLines/);
    expect(src).toMatch(/applyTenantDefaultWhenUnresolved:\s*true/);
    expect(src).not.toMatch(/async function computeTaxAmount/);
  });

  it('DocumentTaxService never falls back to all active SALE taxes', () => {
    const src = readRel('src/services/documentTaxService.ts');
    const preview = readFileSync(
      path.join(serverRoot, '../shared/utils/documentTaxPreview.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/getTaxDefinitions\(scope/);
    expect(src).toMatch(/resolvePreviewLineTaxes/);
    expect(src).toMatch(/TaxEngine\.compute/);
    expect(preview).toMatch(/MAPPING/);
    expect(preview).toMatch(/BRIDGE/);
    expect(preview).toMatch(/TENANT_DEFAULT/);
  });

  it('enterprise product tax route uses DocumentTaxService determination', () => {
    const src = readRel('src/modules/accounting/enterpriseAccountingRoutes.ts');
    expect(src).toMatch(/DocumentTaxService\.determineApplicableTaxes/);
    expect(src).not.toMatch(/TaxEngine\.getApplicableTaxes/);
  });

  it('Phase 2: quotations use DocumentTaxService.priceDocumentLines', () => {
    const src = readRel('src/modules/quotations/quotationService.ts');
    expect(src).toMatch(/DocumentTaxService\.priceDocumentLines/);
    expect(src).toMatch(/preferLineTaxOverrides:\s*true/);
    expect(src).not.toMatch(/itemSubtotal\.times\(taxRate\)\.dividedBy\(100\)/);
  });

  it('Phase 2: credit/debit notes use DocumentTaxService', () => {
    const src = readRel('src/modules/credit-debit-notes/creditDebitNoteService.ts');
    expect(src).toMatch(/DocumentTaxService\.priceDocumentLines/);
    expect(src).toMatch(/priceNoteLines/);
    expect(src).not.toMatch(
      /Money\.multiply\(lineAmount, Money\.divide\(Money\.parseDb\(line\.taxRate/,
    );
  });

  it('Phase 2: POS orders create + complete use DocumentTaxService', () => {
    const orders = readRel('src/modules/orders/ordersService.ts');
    const routes = readRel('src/modules/orders/ordersRoutes.ts');
    expect(orders).toMatch(/DocumentTaxService\.priceDocumentLines/);
    expect(routes).toMatch(/DocumentTaxService\.priceDocumentLines/);
    expect(orders).toMatch(/authoritativeTaxAmount/);
  });
});
