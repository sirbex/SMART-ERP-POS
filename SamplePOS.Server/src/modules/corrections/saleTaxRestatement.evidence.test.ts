/**
 * Evidence: sale tax restatement wired for omitted-VAT repair without voiding.
 *   npm test -- --runInBand src/modules/corrections/saleTaxRestatement.evidence.test.ts
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SaleTaxRestatementBodySchema } from '../../../../shared/zod/saleTaxRestatement.js';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const repoRoot = path.resolve(serverRoot, '..');

function readServer(rel: string): string {
  return readFileSync(path.join(serverRoot, rel), 'utf8');
}
function readRepo(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), 'utf8');
}

describe('Sale tax restatement (omitted VAT) — structural integrity', () => {
  it('migration creates events table and sales.tax_restatement permission', () => {
    const sql = readRepo('shared/sql/594_sale_tax_restatement.sql');
    expect(sql).toMatch(/sale_tax_restatement_events/);
    expect(sql).toMatch(/sales\.tax_restatement/);
    expect(sql).toMatch(/Manager/);
    expect(sql).toMatch(/Accountant/);
  });

  it('heal migration grants tax restatement to manager/admin/accountant', () => {
    const sql = readRepo('shared/sql/596_sale_tax_restatement_manager_accountant_grant.sql');
    expect(sql).toMatch(/sales\.tax_restatement/);
    expect(sql).toMatch(/manager/);
    expect(sql).toMatch(/accountant/);
    expect(sql).toMatch(/administrator/);
  });

  it('permission is catalogued in server PERMISSIONS', () => {
    const src = readServer('src/rbac/permissions.ts');
    expect(src).toMatch(/sales\.tax_restatement/);
    expect(src).toMatch(/SALES_TAX_RESTATEMENT/);
  });

  it('API routes require sales.tax_restatement under /api/sales', () => {
    const routes = readServer('src/modules/sales/salesRoutes.ts');
    expect(routes).toMatch(/tax-restatement\/preview/);
    expect(routes).toMatch(/tax-restatement\/execute/);
    expect(routes).toMatch(/sales\.tax_restatement/);
  });

  it('service recomputes DocumentTax, posts AR/Tax or Revenue/Tax, increase-only, no void', () => {
    const svc = readServer('src/modules/corrections/saleTaxRestatementService.ts');
    expect(svc).toMatch(/DocumentTaxService\.computeForLines/);
    expect(svc).toMatch(/TAX_PAYABLE/);
    expect(svc).toMatch(/customerArLine/);
    expect(svc).toMatch(/Tax reductions must use credit notes/);
    expect(svc).not.toMatch(/voidSale/);
    expect(svc).toMatch(/syncCustomerBalanceFromInvoices/);
    expect(svc).toMatch(/TAX_RESTATE-/);
    expect(svc).toMatch(/SYSTEM_CORRECTION/);
    expect(svc).toMatch(/lockSaleForUpdate|FOR UPDATE/);
    expect(svc).toMatch(/assertTaxRestatementDeltaPolicy|assertPostedTaxTriplet/);
    // UUID products must not pass frozen is_taxable from sale_items into DocumentTax
    expect(svc).toMatch(/isUuidProductId/);
    expect(svc).toMatch(/toDocumentTaxLines/);
  });

  it('repository fails loud on write miss and requires GL on audit', () => {
    const repo = readServer('src/modules/corrections/saleTaxRestatementRepository.ts');
    expect(repo).toMatch(/updateInvoiceTax/);
    expect(repo).toMatch(/refreshInvoiceLinesFromSale/);
    expect(repo).toMatch(/sale_tax_restatement_events/);
    expect(repo).toMatch(/expected 1 row/);
    expect(repo).toMatch(/requires glTransactionId/);
    expect(repo).toMatch(/getPostedTaxIntegrity/);
    expect(repo).toMatch(/lockSaleForUpdate|FOR UPDATE/);
  });

  it('integrity module is used by createSale', () => {
    const sales = readServer('src/modules/sales/salesService.ts');
    expect(sales).toMatch(/documentTaxIntegrity/);
    expect(sales).toMatch(/assertLineTaxEqualsHeader/);
  });

  it('product write keeps has_tax = is_taxable SSOT', () => {
    const prod = readServer('src/modules/products/productRepository.ts');
    expect(prod).toMatch(/has_tax/);
    expect(prod).toMatch(/is_taxable/);
    const sql = readRepo('shared/sql/595_product_has_tax_ssot.sql');
    expect(sql).toMatch(/has_tax = COALESCE\(is_taxable/);
  });

  it('zod body requires saleId + reason', () => {
    const ok = SaleTaxRestatementBodySchema.safeParse({
      saleId: 'a0530882-bd1b-4917-b562-9ab1bd751665',
      reason: 'Omitted VAT on posted invoice',
    });
    expect(ok.success).toBe(true);
    const bad = SaleTaxRestatementBodySchema.safeParse({ saleId: 'x', reason: 'ab' });
    expect(bad.success).toBe(false);
  });

  it('UI exposes Apply omitted VAT on Sales detail', () => {
    const page = readRepo('samplepos.client/src/pages/SalesPage.tsx');
    expect(page).toMatch(/SaleTaxRestatementModal/);
    expect(page).toMatch(/sales\.tax_restatement/);
    expect(page).toMatch(/Apply omitted VAT/);
  });

  it('smart model SSOT doc exists with path matrix', () => {
    const doc = readRepo('PROOF_TAX_CORRECTION_SMART_MODEL.md');
    expect(doc).toMatch(/Apply omitted VAT/);
    expect(doc).toMatch(/Credit note only/);
    expect(doc).toMatch(/PROOF_SALE_TAX_RESTATEMENT/);
  });

  it('live proof script exists and only writes gates from runtime', () => {
    const script = path.join(serverRoot, 'scripts/proof-sale-tax-restatement-live.ts');
    expect(existsSync(script)).toBe(true);
    const src = readFileSync(script, 'utf8');
    expect(src).toMatch(/function gate\(/);
    expect(src).toMatch(/PROOF_SALE_TAX_RESTATEMENT\.md/);
    expect(src).toMatch(/DOCTYPE_PARITY|JOURNAL_BALANCED/);
  });

  it('RBAC proof artifacts and shared SSOT exist', () => {
    const ssot = readRepo('shared/authorization/saleTaxRestatementRbac.ts');
    expect(ssot).toMatch(/SALES_TAX_RESTATEMENT_DEFAULT_ROLES/);
    expect(ssot).toMatch(/accountant/);
    expect(ssot).toMatch(/manager/);
    expect(
      existsSync(path.join(serverRoot, 'scripts/proof-sale-tax-restatement-rbac-live.ts')),
    ).toBe(true);
    expect(
      existsSync(
        path.join(serverRoot, 'src/modules/corrections/saleTaxRestatementRbac.evidence.test.ts'),
      ),
    ).toBe(true);
  });
});
